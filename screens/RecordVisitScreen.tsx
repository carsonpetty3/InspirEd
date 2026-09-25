import React, { useState, useEffect, useRef } from "react";
import { View, StyleSheet, Pressable, TextInput, Alert, ScrollView, ActivityIndicator, Platform } from "react-native";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Icon } from "@/components/Icon";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius } from "@/constants/theme";
import { useAppContext, Question } from "@/context/AppContext";
import { useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { extractVisitDetails } from "@/utils/gemini";
import { transcribeAndSummarizeAudio } from "@/utils/gemini";
import { Audio } from "expo-av";

/*
 * NOTE: Using expo-av for audio recording despite its deprecation in SDK 54.
 * 
 * Rationale:
 * - expo-audio (the replacement) does not support pause/resume functionality as of SDK 54
 * - The recording pause/resume feature is critical for parents during doctor visits
 *   (they may need to pause during private conversations)
 * - expo-av provides pauseAsync()/startAsync() methods that meet requirements
 * 
 * Future migration:
 * - Monitor expo-audio for pause/resume support in future SDK releases
 * - Consider alternative solutions (e.g., segment stitching, different audio library)
 * - Migrate away from expo-av before it's fully removed from Expo
 */

/** Alert.alert is a no-op on react-native-web, so errors would be silent in the browser. */
function showAlert(title: string, message: string) {
  if (Platform.OS === "web") {
    window.alert(`${title}\n\n${message}`);
  } else {
    Alert.alert(title, message);
  }
}

/**
 * expo-av always asks browsers for audio/webm, which Safari before 18.4 can't record.
 * On web, pick a format the browser supports, at a speech-friendly bitrate that keeps
 * uploads small.
 */
function recordingOptions(): Audio.RecordingOptions {
  const preset = Audio.RecordingOptionsPresets.HIGH_QUALITY;
  if (Platform.OS !== "web" || typeof MediaRecorder === "undefined") return preset;
  const mimeType = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((type) =>
    MediaRecorder.isTypeSupported(type)
  );
  return { ...preset, web: { mimeType, bitsPerSecond: 64000 } };
}

export default function RecordVisitScreen() {
  const { theme } = useTheme();
  const { addVisit, updateVisit, readingLevel, privacyConsent, setPrivacyConsent, plannerQuestions, updatePlannerQuestion } = useAppContext();
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  
  const [showConsentOverlay, setShowConsentOverlay] = useState(!privacyConsent);
  const [questionsExpanded, setQuestionsExpanded] = useState(true);
  
  useEffect(() => {
    if (!privacyConsent) {
      setShowConsentOverlay(true);
    }
  }, [privacyConsent]);
  
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [doctorName, setDoctorName] = useState("");
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [permissionGranted, setPermissionGranted] = useState(false);
  
  const [reviewMode, setReviewMode] = useState(false);
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackPosition, setPlaybackPosition] = useState(0);
  const [playbackDuration, setPlaybackDuration] = useState(0);
  const [recordedUri, setRecordedUri] = useState<string | null>(null);
  
  const [processingMode, setProcessingMode] = useState(false);
  const [processingStatus, setProcessingStatus] = useState<"transcribing" | "summarizing" | "complete">("transcribing");
  const [transcriptionResult, setTranscriptionResult] = useState<string | null>(null);
  const [summaryResult, setSummaryResult] = useState<string | null>(null);
  
  const recordingRef = useRef<Audio.Recording | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);
  const pulse = useSharedValue(1);

  useEffect(() => {
    recordingRef.current = recording;
  }, [recording]);

  useEffect(() => {
    soundRef.current = sound;
  }, [sound]);

  useEffect(() => {
    requestPermissions();
    return () => {
      if (recordingRef.current) {
        recordingRef.current.stopAndUnloadAsync().catch(console.error);
      }
      if (soundRef.current) {
        soundRef.current.unloadAsync().catch(console.error);
      }
    };
  }, []);

  const requestPermissions = async () => {
    try {
      const { granted } = await Audio.requestPermissionsAsync();
      setPermissionGranted(granted);
      if (!granted) {
        showAlert(
          "Permission Required",
          Platform.OS === "web"
            ? "InspirEd needs microphone access to record doctor visits. Please allow the microphone for this site in your browser settings."
            : "InspirEd needs microphone access to record doctor visits. Please enable it in your device settings."
        );
      } else {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: true,
          playsInSilentModeIOS: true,
        });
      }
    } catch (error) {
      console.error("Permission error:", error);
    }
  };

  useEffect(() => {
    if (isRecording && !isPaused) {
      const interval = setInterval(() => {
        setSeconds((s) => s + 1);
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [isRecording, isPaused]);

  useEffect(() => {
    if (isRecording && !isPaused) {
      pulse.value = withRepeat(
        withSequence(
          withTiming(1.1, { duration: 500 }),
          withTiming(1, { duration: 500 })
        ),
        -1
      );
    } else {
      pulse.value = withTiming(1);
    }
  }, [isRecording, isPaused]);

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulse.value }],
  }));

  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const s = secs % 60;
    return `${mins.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const handleCancel = async () => {
    if (isRecording || seconds > 0) {
      const shouldCancel = Platform.OS === 'web' 
        ? window.confirm("Cancel Recording?\n\nAre you sure you want to cancel? Your recording will be lost.")
        : false;

      if (Platform.OS === 'web') {
        if (shouldCancel) {
          if (recording) {
            try {
              await recording.stopAndUnloadAsync();
            } catch (error) {
              console.error("Error stopping recording:", error);
            }
            setRecording(null);
          }
          setIsRecording(false);
          setIsPaused(false);
          setSeconds(0);
          navigation.goBack();
        }
      } else {
        Alert.alert(
          "Cancel Recording?",
          "Are you sure you want to cancel? Your recording will be lost.",
          [
            { text: "Keep Recording", style: "cancel" },
            {
              text: "Cancel",
              style: "destructive",
              onPress: async () => {
                if (recording) {
                  try {
                    await recording.stopAndUnloadAsync();
                  } catch (error) {
                    console.error("Error stopping recording:", error);
                  }
                  setRecording(null);
                }
                setIsRecording(false);
                setIsPaused(false);
                setSeconds(0);
                navigation.goBack();
              },
            },
          ]
        );
      }
    } else {
      navigation.goBack();
    }
  };

  const handleRecord = async () => {
    if (!privacyConsent) {
      setShowConsentOverlay(true);
      return;
    }
    
    if (!permissionGranted) {
      await requestPermissions();
      return;
    }
    
    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });
      
      const { recording: newRecording } = await Audio.Recording.createAsync(
        recordingOptions()
      );
      setRecording(newRecording);
      setIsRecording(true);
      setIsPaused(false);
    } catch (error) {
      console.error("Failed to start recording:", error);
      showAlert("Recording Error", "Could not start recording. Please try again.");
    }
  };

  const handlePause = async () => {
    if (!recording) return;
    
    try {
      if (isPaused) {
        await recording.startAsync();
        setIsPaused(false);
      } else {
        await recording.pauseAsync();
        setIsPaused(true);
      }
    } catch (error) {
      console.error("Failed to pause/resume recording:", error);
      showAlert("Recording Error", "Could not pause/resume recording.");
    }
  };

  const handleStop = async () => {
    if (!recording) return;
    
    try {
      await recording.stopAndUnloadAsync();
      const audioUri = recording.getURI();
      
      if (!audioUri) {
        showAlert("Recording Error", "No audio was recorded.");
        setRecording(null);
        setIsRecording(false);
        setIsPaused(false);
        return;
      }

      setRecordedUri(audioUri);
      setRecording(null);
      setIsRecording(false);
      setIsPaused(false);
      setReviewMode(true);
      
      await loadAudioForPlayback(audioUri);
    } catch (error) {
      console.error("Failed to stop recording:", error);
      showAlert("Recording Error", "Could not save the recording. Please try again.");
      setRecording(null);
      setIsRecording(false);
      setIsPaused(false);
    }
  };

  const loadAudioForPlayback = async (uri: string) => {
    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
      });
      
      const { sound: newSound } = await Audio.Sound.createAsync(
        { uri },
        { shouldPlay: false },
        onPlaybackStatusUpdate
      );
      setSound(newSound);
    } catch (error) {
      console.error("Failed to load audio for playback:", error);
      showAlert("Playback Error", "Could not load the recording for playback.");
    }
  };

  const onPlaybackStatusUpdate = (status: any) => {
    if (status.isLoaded) {
      setPlaybackPosition(status.positionMillis);
      setPlaybackDuration(status.durationMillis || 0);
      setIsPlaying(status.isPlaying);
      
      if (status.didJustFinish) {
        setIsPlaying(false);
      }
    }
  };

  const handlePlayPause = async () => {
    if (!sound) return;
    
    try {
      const status = await sound.getStatusAsync();
      if (!status.isLoaded) {
        showAlert("Playback Error", "Recording is no longer available.");
        setSound(null);
        return;
      }

      if (isPlaying) {
        await sound.pauseAsync();
      } else {
        await sound.playAsync();
      }
    } catch (error) {
      console.error("Failed to play/pause audio:", error);
      setSound(null);
    }
  };

  const handleReRecord = async () => {
    if (sound) {
      try {
        await sound.unloadAsync();
      } catch (error) {
        console.error("Error unloading sound:", error);
      }
      setSound(null);
    }
    
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
    });
    
    setReviewMode(false);
    setRecordedUri(null);
    setPlaybackPosition(0);
    setPlaybackDuration(0);
    setIsPlaying(false);
    setSeconds(0);
    setDoctorName("");
  };

  const handleSaveVisit = async () => {
    if (!recordedUri) return;
    
    try {
      if (sound) {
        await sound.unloadAsync();
        setSound(null);
      }

      setProcessingMode(true);
      setProcessingStatus("transcribing");

      const visitId = Date.now().toString();
      const visit = {
        id: visitId,
        date: new Date(),
        doctorName: doctorName || "Not specified",
        duration: seconds,
        audioUri: recordedUri,
        transcription: null,
        summary: null,
        keyPoints: [],
        diagnoses: [],
        actions: [],
        medicalTerms: [],
        isProcessing: true,
      };
      
      addVisit(visit);
      
      try {
        const result = await transcribeAndSummarizeAudio(
          recordedUri,
          "audio/m4a",
          readingLevel
        );
        
        setTranscriptionResult(result.transcription);
        setProcessingStatus("summarizing");
        
        const aiExtraction = await extractVisitDetails(
          result.transcription,
          readingLevel
        );
        
        setSummaryResult(result.summary);
        setProcessingStatus("complete");
        
        updateVisit(visitId, {
          transcription: result.transcription,
          summary: result.summary,
          keyPoints: aiExtraction.keyPoints,
          diagnoses: aiExtraction.diagnoses,
          actions: aiExtraction.actions,
          medicalTerms: aiExtraction.medicalTerms,
          isProcessing: false,
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        console.error("Failed to process audio:", errorMessage);
        updateVisit(visitId, {
          isProcessing: false,
        });
        setProcessingMode(false);
        
        const title = "Processing Failed";
        const message = `Could not transcribe the recording: ${errorMessage}. The visit has been saved, but you may need to review the audio manually.`;
        
        if (Platform.OS === "web") {
          window.alert(`${title}\n\n${message}`);
          navigation.goBack();
        } else {
          Alert.alert(title, message, [{ text: "OK", onPress: () => navigation.goBack() }]);
        }
      }
    } catch (error) {
      console.error("Failed to save visit:", error);
      showAlert("Error", "Could not save the visit. Please try again.");
    }
  };
  
  const handleViewInHistory = () => {
    navigation.goBack();
  };

  const formatPlaybackTime = (millis: number) => {
    const totalSeconds = Math.floor(millis / 1000);
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const playbackProgress = playbackDuration > 0 ? playbackPosition / playbackDuration : 0;

  const handleAcceptConsent = async () => {
    try {
      await setPrivacyConsent(true);
      setShowConsentOverlay(false);
    } catch (error) {
      console.error("Error setting consent:", error);
    }
  };

  const handleDeclineConsent = () => {
    navigation.goBack();
  };

  if (showConsentOverlay) {
    return (
      <View style={[styles.container, { backgroundColor: theme.primary }]}>
        <View style={[styles.header, { paddingTop: insets.top + Spacing.md }]}>
          <Pressable onPress={handleDeclineConsent} style={styles.headerButton}>
            <ThemedText style={styles.headerButtonText}>Back</ThemedText>
          </Pressable>
          <ThemedText style={styles.headerTitle}>Before Recording</ThemedText>
          <View style={styles.headerButton} />
        </View>

        <ScrollView 
          style={styles.consentContainer} 
          contentContainerStyle={styles.consentContent}
        >
          <View style={styles.consentIconContainer}>
            <Icon name="shield" size={64} color="white" />
          </View>

          <ThemedText style={styles.consentTitle}>
            Your Privacy Matters
          </ThemedText>

          <ThemedText style={styles.consentDescription}>
            Before you start recording, please understand how your data is handled:
          </ThemedText>

          <View style={styles.consentItems}>
            <View style={styles.consentItem}>
              <Icon name="home" size={24} color={theme.accent} />
              <View style={styles.consentItemText}>
                <ThemedText style={styles.consentItemTitle}>Stored on Your Device</ThemedText>
                <ThemedText style={styles.consentItemDescription}>
                  Recordings are saved on this device. We don't keep copies.
                </ThemedText>
              </View>
            </View>

            <View style={styles.consentItem}>
              <Icon name="sparkles" size={24} color={theme.accent} />
              <View style={styles.consentItemText}>
                <ThemedText style={styles.consentItemTitle}>AI Processing</ThemedText>
                <ThemedText style={styles.consentItemDescription}>
                  Audio passes securely through InspirEd to Google AI to create your summary, then is deleted.
                </ThemedText>
              </View>
            </View>

            <View style={styles.consentItem}>
              <Icon name="trash" size={24} color={theme.accent} />
              <View style={styles.consentItemText}>
                <ThemedText style={styles.consentItemTitle}>You're in Control</ThemedText>
                <ThemedText style={styles.consentItemDescription}>
                  Delete any recording anytime from your Profile settings.
                </ThemedText>
              </View>
            </View>
          </View>

          <Pressable
            onPress={handleAcceptConsent}
            style={[styles.consentButton, { backgroundColor: "white" }]}
          >
            <ThemedText style={[styles.consentButtonText, { color: theme.primary }]}>
              I Understand, Let's Record
            </ThemedText>
          </Pressable>

          <Pressable
            onPress={handleDeclineConsent}
            style={styles.consentSecondaryButton}
          >
            <ThemedText style={styles.consentSecondaryButtonText}>
              Not Now
            </ThemedText>
          </Pressable>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.primary }]}>
      <View style={[styles.header, { paddingTop: insets.top + Spacing.md }]}>
        <Pressable 
          onPress={handleCancel} 
          style={styles.headerButton}
          pointerEvents={processingMode ? "none" : "auto"}
        >
          <ThemedText style={styles.headerButtonText}>
            {processingMode ? "" : "Cancel"}
          </ThemedText>
        </Pressable>
        <ThemedText style={styles.headerTitle}>
          {processingMode ? "Processing Visit" : reviewMode ? "Review Recording" : "Recording Visit"}
        </ThemedText>
        <View style={styles.headerButton} />
      </View>

      {processingMode ? (
        <ScrollView style={styles.processingContainer} contentContainerStyle={styles.processingContent}>
          {processingStatus === "transcribing" ? (
            <View style={styles.processingStatusContainer}>
              <ActivityIndicator size="large" color="white" />
              <ThemedText style={styles.processingTitle}>Transcribing your visit...</ThemedText>
              <ThemedText style={styles.processingSubtitle}>
                Converting your recording to text
              </ThemedText>
            </View>
          ) : processingStatus === "summarizing" ? (
            <View style={styles.processingStatusContainer}>
              <ActivityIndicator size="large" color="white" />
              <ThemedText style={styles.processingTitle}>Creating your summary...</ThemedText>
              <ThemedText style={styles.processingSubtitle}>
                Analyzing the visit and tailoring to your preferences
              </ThemedText>
            </View>
          ) : (
            <View style={styles.resultsContainer}>
              <View style={styles.resultHeader}>
                <Icon name="checkmark-circle" size={48} color="white" />
                <ThemedText style={styles.resultsTitle}>Visit Processed Successfully</ThemedText>
              </View>

              {summaryResult ? (
                <View style={styles.resultSection}>
                  <ThemedText style={styles.resultLabel}>Summary</ThemedText>
                  <ThemedView style={styles.resultCard}>
                    <ThemedText style={styles.resultText}>{summaryResult}</ThemedText>
                  </ThemedView>
                </View>
              ) : null}

              {transcriptionResult ? (
                <View style={styles.resultSection}>
                  <ThemedText style={styles.resultLabel}>Transcription Preview</ThemedText>
                  <ThemedView style={styles.resultCard}>
                    <ThemedText style={styles.resultText} numberOfLines={6}>
                      {transcriptionResult}
                    </ThemedText>
                  </ThemedView>
                </View>
              ) : null}

              <Pressable
                onPress={handleViewInHistory}
                style={[styles.viewHistoryButton, { backgroundColor: "white" }]}
              >
                <ThemedText style={[styles.viewHistoryButtonText, { color: theme.primary }]}>
                  View in History
                </ThemedText>
              </Pressable>
            </View>
          )}
        </ScrollView>
      ) : reviewMode ? (
        <View style={styles.content}>
          <View style={styles.waveformContainer}>
            <View
              style={[
                styles.waveform,
                { backgroundColor: theme.accent },
              ]}
            >
              <Icon
                name="headset"
                size={48}
                color="white"
              />
            </View>
          </View>

          <ThemedText style={styles.timer}>{formatTime(seconds)}</ThemedText>

          <ThemedView style={[styles.inputCard, { backgroundColor: "rgba(255,255,255,0.2)" }]}>
            <TextInput
              style={[styles.input, { color: "white" }]}
              placeholder="Doctor's name (optional)"
              placeholderTextColor="rgba(255,255,255,0.6)"
              value={doctorName}
              onChangeText={setDoctorName}
            />
          </ThemedView>

          <View style={styles.progressContainer}>
            <View style={styles.progressBar}>
              <View
                style={[
                  styles.progressFill,
                  {
                    width: `${playbackProgress * 100}%`,
                    backgroundColor: "white",
                  },
                ]}
              />
            </View>
            <View style={styles.progressTime}>
              <ThemedText style={styles.progressTimeText}>
                {formatPlaybackTime(playbackPosition)}
              </ThemedText>
              <ThemedText style={styles.progressTimeText}>
                {formatPlaybackTime(playbackDuration)}
              </ThemedText>
            </View>
          </View>

          <View style={styles.controls}>
            <Pressable
              onPress={handlePlayPause}
              style={[styles.recordButton, { backgroundColor: theme.accent }]}
            >
              <Icon name={isPlaying ? "pause" : "play"} size={32} color="white" />
            </Pressable>
          </View>

          <View style={styles.reviewButtons}>
            <Pressable
              onPress={handleReRecord}
              style={[styles.reviewButton, { backgroundColor: "rgba(255,255,255,0.2)" }]}
            >
              <Icon name="refresh" size={20} color="white" />
              <ThemedText style={styles.reviewButtonText}>Re-record</ThemedText>
            </Pressable>
            <Pressable
              onPress={handleSaveVisit}
              style={[styles.reviewButton, { backgroundColor: "white" }]}
            >
              <Icon name="check" size={20} color={theme.primary} />
              <ThemedText style={[styles.reviewButtonText, { color: theme.primary }]}>
                Save Visit
              </ThemedText>
            </Pressable>
          </View>
        </View>
      ) : (
        <View style={styles.content}>
          <Animated.View style={[styles.waveformContainer, pulseStyle]}>
            <View
              style={[
                styles.waveform,
                {
                  backgroundColor: isRecording && !isPaused ? "#FF6B6B" : theme.accent,
                },
              ]}
            >
              <Icon
                name="mic"
                size={48}
                color="white"
              />
            </View>
          </Animated.View>

          <ThemedText style={styles.timer}>{formatTime(seconds)}</ThemedText>

          {!isRecording && (
            <ThemedView style={[styles.inputCard, { backgroundColor: "rgba(255,255,255,0.2)" }]}>
              <TextInput
                style={[styles.input, { color: "white" }]}
                placeholder="Doctor's name (optional)"
                placeholderTextColor="rgba(255,255,255,0.6)"
                value={doctorName}
                onChangeText={setDoctorName}
              />
            </ThemedView>
          )}

          <View style={styles.controls}>
            {!isRecording ? (
              <Pressable
                onPress={handleRecord}
                style={[styles.recordButton, { backgroundColor: "#FF6B6B" }]}
              >
                <Icon name="record" size={32} color="white" />
              </Pressable>
            ) : (
              <>
                <Pressable
                  onPress={handlePause}
                  style={[styles.controlButton, { backgroundColor: "rgba(255,255,255,0.3)" }]}
                >
                  <Icon name={isPaused ? "play" : "pause"} size={24} color="white" />
                </Pressable>
                <Pressable
                  onPress={handleStop}
                  style={[styles.controlButton, { backgroundColor: theme.accent }]}
                >
                  <Icon name="check" size={24} color="white" />
                </Pressable>
              </>
            )}
          </View>

          {!isRecording && (
            <>
              <ThemedText style={styles.instruction}>
                Ready? Tap to start recording
              </ThemedText>
              <View style={styles.consentNotice}>
                <Icon name="shield" size={14} color="rgba(255,255,255,0.8)" />
                <ThemedText style={styles.consentNoticeText}>
                  Your recording will be processed by AI to create a summary
                </ThemedText>
              </View>
            </>
          )}

          {isRecording && plannerQuestions.length > 0 && (
            <View style={styles.questionsPanel}>
              <Pressable 
                style={styles.questionsPanelHeader}
                onPress={() => setQuestionsExpanded(!questionsExpanded)}
              >
                <View style={styles.questionsPanelTitleRow}>
                  <Icon name="document" size={18} color="white" />
                  <ThemedText style={styles.questionsPanelTitle}>
                    My Questions ({plannerQuestions.filter(q => !q.checked).length} remaining)
                  </ThemedText>
                </View>
                <Icon 
                  name={questionsExpanded ? "chevron-up" : "chevron-down"} 
                  size={20} 
                  color="white" 
                />
              </Pressable>
              
              {questionsExpanded && (
                <ScrollView 
                  style={styles.questionsScrollView}
                  showsVerticalScrollIndicator={false}
                >
                  {plannerQuestions.map((question) => (
                    <Pressable
                      key={question.id}
                      style={[
                        styles.questionItem,
                        question.checked && styles.questionItemChecked,
                      ]}
                      onPress={() => updatePlannerQuestion(question.id, { checked: !question.checked })}
                    >
                      <View
                        style={[
                          styles.questionCheckbox,
                          question.checked && { backgroundColor: theme.accent, borderColor: theme.accent },
                        ]}
                      >
                        {question.checked && <Icon name="check" size={14} color="white" />}
                      </View>
                      <ThemedText
                        style={[
                          styles.questionItemText,
                          question.checked && styles.questionItemTextChecked,
                        ]}
                        numberOfLines={2}
                      >
                        {question.text}
                      </ThemedText>
                    </Pressable>
                  ))}
                </ScrollView>
              )}
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  headerButton: {
    width: 80,
  },
  headerButtonText: {
    color: "white",
    fontSize: 16,
  },
  headerTitle: {
    color: "white",
    fontSize: 18,
    fontWeight: "600",
  },
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.xl,
  },
  waveformContainer: {
    marginBottom: Spacing["3xl"],
  },
  waveform: {
    width: 140,
    height: 140,
    borderRadius: 70,
    justifyContent: "center",
    alignItems: "center",
  },
  timer: {
    fontSize: 48,
    fontWeight: "700",
    color: "white",
    marginBottom: Spacing["2xl"],
    lineHeight: 64,
    includeFontPadding: false,
  },
  inputCard: {
    width: "100%",
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing["2xl"],
  },
  input: {
    fontSize: 16,
    textAlign: "center",
  },
  controls: {
    flexDirection: "row",
    gap: Spacing.xl,
    marginBottom: Spacing["2xl"],
  },
  recordButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  controlButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: "center",
    alignItems: "center",
  },
  instruction: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 16,
    textAlign: "center",
  },
  consentNotice: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginTop: Spacing.lg,
    paddingHorizontal: Spacing.lg,
  },
  consentNoticeText: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 12,
    textAlign: "center",
    flex: 1,
  },
  progressContainer: {
    width: "100%",
    marginBottom: Spacing["2xl"],
  },
  progressBar: {
    height: 4,
    backgroundColor: "rgba(255,255,255,0.3)",
    borderRadius: 2,
    overflow: "hidden",
    marginBottom: Spacing.sm,
  },
  progressFill: {
    height: "100%",
  },
  progressTime: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  progressTimeText: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 12,
  },
  reviewButtons: {
    flexDirection: "row",
    gap: Spacing.md,
    width: "100%",
  },
  reviewButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  reviewButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
  },
  processingContainer: {
    flex: 1,
  },
  processingContent: {
    flexGrow: 1,
    justifyContent: "center",
    padding: Spacing.xl,
  },
  processingStatusContainer: {
    alignItems: "center",
    gap: Spacing.lg,
  },
  processingTitle: {
    color: "white",
    fontSize: 24,
    fontWeight: "700",
    textAlign: "center",
  },
  processingSubtitle: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 16,
    textAlign: "center",
  },
  resultsContainer: {
    gap: Spacing.xl,
  },
  resultHeader: {
    alignItems: "center",
    gap: Spacing.md,
  },
  resultsTitle: {
    color: "white",
    fontSize: 24,
    fontWeight: "700",
    textAlign: "center",
  },
  resultSection: {
    gap: Spacing.sm,
  },
  resultLabel: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 14,
    fontWeight: "600",
  },
  resultCard: {
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
  },
  resultText: {
    fontSize: 14,
    lineHeight: 20,
  },
  viewHistoryButton: {
    paddingVertical: Spacing.lg,
    borderRadius: BorderRadius.md,
    alignItems: "center",
  },
  viewHistoryButtonText: {
    fontSize: 16,
    fontWeight: "600",
  },
  consentContainer: {
    flex: 1,
  },
  consentContent: {
    flexGrow: 1,
    justifyContent: "center",
    padding: Spacing.xl,
  },
  consentIconContainer: {
    alignItems: "center",
    marginBottom: Spacing.xl,
  },
  consentTitle: {
    color: "white",
    fontSize: 28,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: Spacing.md,
  },
  consentDescription: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 16,
    textAlign: "center",
    marginBottom: Spacing.xl,
    lineHeight: 24,
  },
  consentItems: {
    gap: Spacing.lg,
    marginBottom: Spacing["2xl"],
  },
  consentItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.md,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
  },
  consentItemText: {
    flex: 1,
  },
  consentItemTitle: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 4,
  },
  consentItemDescription: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 14,
    lineHeight: 20,
  },
  consentButton: {
    paddingVertical: Spacing.lg,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  consentButtonText: {
    fontSize: 16,
    fontWeight: "600",
  },
  consentSecondaryButton: {
    paddingVertical: Spacing.md,
    alignItems: "center",
  },
  consentSecondaryButtonText: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 14,
  },
  questionsPanel: {
    position: "absolute",
    bottom: Spacing.xl,
    left: Spacing.lg,
    right: Spacing.lg,
    backgroundColor: "rgba(0,0,0,0.4)",
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
  },
  questionsPanelHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: Spacing.md,
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  questionsPanelTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  questionsPanelTitle: {
    color: "white",
    fontSize: 14,
    fontWeight: "600",
  },
  questionsScrollView: {
    maxHeight: 180,
  },
  questionItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.1)",
  },
  questionItemChecked: {
    opacity: 0.6,
  },
  questionCheckbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  questionItemText: {
    flex: 1,
    color: "white",
    fontSize: 14,
    lineHeight: 18,
  },
  questionItemTextChecked: {
    textDecorationLine: "line-through",
  },
});
