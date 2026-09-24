import React, { useState, useEffect } from "react";
import { View, StyleSheet, Pressable, Image, FlatList, Alert, Platform } from "react-native";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { ScreenScrollView } from "@/components/ScreenScrollView";
import { Icon } from "@/components/Icon";
import { MarkdownText } from "@/components/MarkdownText";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius } from "@/constants/theme";
import { useAppContext, Visit } from "@/context/AppContext";
import { useNavigation } from "@react-navigation/native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from "react-native-reanimated";
import {
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
} from "expo-audio";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export default function HistoryScreen() {
  const { theme } = useTheme();
  const { visits, deleteVisit, loadSampleVisits } = useAppContext();
  const navigation = useNavigation<any>();
  const [activeVisitId, setActiveVisitId] = useState<string | null>(null);

  const handleDeleteVisit = (visitId: string, doctorName: string) => {
    const message = `Are you sure you want to delete this visit${doctorName !== "Not specified" ? ` with Dr. ${doctorName}` : ""}? This cannot be undone.`;
    
    if (Platform.OS === "web") {
      if (window.confirm(message)) {
        deleteVisit(visitId);
      }
    } else {
      Alert.alert(
        "Delete Visit",
        message,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: () => deleteVisit(visitId),
          },
        ]
      );
    }
  };

  if (visits.length === 0) {
    return (
      <ScreenScrollView>
        <View style={styles.emptyContainer}>
          <Image
            source={require("@/assets/illustrations/empty-first-visit.png")}
            style={styles.emptyImage}
            resizeMode="contain"
          />
          <ThemedText style={styles.emptyTitle}>No Visits Yet</ThemedText>
          <ThemedText style={[styles.emptyText, { color: theme.textSecondary }]}>
            Tap the microphone button to record your first doctor visit.
          </ThemedText>
          <Pressable
            onPress={loadSampleVisits}
            style={[styles.loadSampleButton, { backgroundColor: theme.backgroundSecondary, borderColor: theme.border }]}
          >
            <Icon name="document" size={18} color={theme.primary} />
            <ThemedText style={[styles.loadSampleText, { color: theme.primary }]}>
              Load Sample Visits
            </ThemedText>
          </Pressable>
        </View>
      </ScreenScrollView>
    );
  }

  const handlePlaybackStart = (visitId: string) => {
    setActiveVisitId(visitId);
  };

  return (
    <ScreenScrollView>
      <View style={styles.container}>
        {visits.map((visit) => (
          <VisitCard
            key={visit.id}
            visit={visit}
            onPress={() => navigation.navigate("VisitDetail", { visitId: visit.id })}
            isActive={activeVisitId === visit.id}
            onPlaybackStart={() => handlePlaybackStart(visit.id)}
            onDelete={() => handleDeleteVisit(visit.id, visit.doctorName)}
          />
        ))}
      </View>
    </ScreenScrollView>
  );
}

function VisitCard({
  visit,
  onPress,
  isActive,
  onPlaybackStart,
  onDelete,
}: {
  visit: Visit;
  onPress: () => void;
  isActive: boolean;
  onPlaybackStart: () => void;
  onDelete: () => void;
}) {
  const { theme } = useTheme();
  const scale = useSharedValue(1);
  const player = useAudioPlayer(null, { updateInterval: 250 });
  const playbackStatus = useAudioPlayerStatus(player);
  const [soundLoaded, setSoundLoaded] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackPosition, setPlaybackPosition] = useState(0);
  const [playbackDuration, setPlaybackDuration] = useState(0);
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    if (!isActive) {
      try {
        player.pause();
      } catch {
        // Player may already be released when the card unmounts.
      }
    }
  }, [isActive, player]);

  useEffect(() => {
    setIsPlaying(!!playbackStatus.playing);
    setPlaybackPosition((playbackStatus.currentTime || 0) * 1000);
    setPlaybackDuration((playbackStatus.duration || 0) * 1000);
    if (playbackStatus.didJustFinish) {
      setIsPlaying(false);
      setPlaybackPosition(0);
    }
  }, [playbackStatus]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const formatDuration = (secs: number) => {
    const mins = Math.floor(secs / 60);
    return `${mins} min`;
  };

  const formatTime = (millis: number) => {
    const totalSeconds = Math.floor(millis / 1000);
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const loadSound = async (): Promise<boolean> => {
    if (soundLoaded) return true;

    try {
      await setAudioModeAsync({
        allowsRecording: false,
        playsInSilentMode: true,
      });
      player.replace({ uri: visit.audioUri });
      setSoundLoaded(true);
      return true;
    } catch (error) {
      console.error("Error loading sound:", error);
      return false;
    }
  };

  const togglePlayback = async () => {
    if (!soundLoaded) {
      const loaded = await loadSound();
      if (!loaded || !isExpanded) return;
      
      onPlaybackStart();
      try {
        player.play();
      } catch (error) {
        console.error("Playback error after load:", error);
      }
      return;
    }

    try {
      if (playbackStatus.playing) {
        player.pause();
      } else {
        onPlaybackStart();
        player.play();
      }
    } catch (error) {
      console.error("Playback error:", error);
    }
  };

  const handleCardPress = async () => {
    const willExpand = !isExpanded;
    setIsExpanded(willExpand);
    
    if (willExpand && !soundLoaded) {
      await loadSound();
    } else if (!willExpand) {
      player.pause();
    }
  };

  const progress = playbackDuration > 0 ? playbackPosition / playbackDuration : 0;

  return (
    <AnimatedPressable
      onPress={handleCardPress}
      onPressIn={() => {
        scale.value = withSpring(0.98);
      }}
      onPressOut={() => {
        scale.value = withSpring(1);
      }}
      style={[
        animatedStyle,
        styles.card,
        {
          backgroundColor: theme.backgroundSecondary,
          borderColor: theme.border,
        },
      ]}
    >
      <View style={styles.cardHeader}>
        <View style={styles.cardHeaderLeft}>
          <ThemedText style={styles.cardDate}>
            {new Date(visit.date).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </ThemedText>
          {visit.doctorName !== "Not specified" && (
            <ThemedText style={[styles.cardDoctor, { color: theme.textSecondary }]}>
              Dr. {visit.doctorName}
            </ThemedText>
          )}
        </View>
        <View style={styles.cardHeaderRight}>
          <View style={[styles.badge, { backgroundColor: theme.backgroundDefault }]}>
            <ThemedText style={[styles.badgeText, { color: theme.textSecondary }]}>
              {formatDuration(visit.duration)}
            </ThemedText>
          </View>
        </View>
      </View>

      {visit.isProcessing ? (
        <View style={styles.processingContainer}>
          <Icon name="sync" size={16} color={theme.warning} />
          <ThemedText style={[styles.processingText, { color: theme.warning }]}>
            Processing...
          </ThemedText>
        </View>
      ) : (
        <>
          {visit.summary && !isExpanded && (
            <View style={{ maxHeight: 44, overflow: "hidden" }}>
              <MarkdownText style={styles.summary} color={theme.textSecondary}>
                {visit.summary}
              </MarkdownText>
            </View>
          )}
          {!isExpanded && (
            <View style={styles.statusIndicator}>
              <View style={[styles.statusDot, { backgroundColor: theme.success }]} />
              <ThemedText style={[styles.statusText, { color: theme.success }]}>
                Summarized
              </ThemedText>
            </View>
          )}
        </>
      )}

      {isExpanded && (
        <View style={styles.expandedContent}>
          <View style={styles.audioControls}>
            <Pressable
              onPress={togglePlayback}
              style={[styles.playButton, { backgroundColor: theme.primary }]}
            >
              <Icon name={isPlaying ? "pause" : "play"} size={20} color="white" />
            </Pressable>

            <View style={styles.progressContainer}>
              <View style={[styles.progressBar, { backgroundColor: theme.border }]}>
                <View
                  style={[
                    styles.progressFill,
                    {
                      backgroundColor: theme.primary,
                      width: `${progress * 100}%`,
                    },
                  ]}
                />
              </View>
              <View style={styles.progressTime}>
                <ThemedText style={[styles.progressTimeText, { color: theme.textSecondary }]}>
                  {formatTime(playbackPosition)}
                </ThemedText>
                <ThemedText style={[styles.progressTimeText, { color: theme.textSecondary }]}>
                  {formatTime(playbackDuration)}
                </ThemedText>
              </View>
            </View>
          </View>

          {visit.summary && (
            <View style={styles.fullSummaryContainer}>
              <MarkdownText style={styles.fullSummary} color={theme.textSecondary}>
                {visit.summary}
              </MarkdownText>
            </View>
          )}

          <View style={styles.actionButtons}>
            <Pressable
              onPress={(e) => {
                e.stopPropagation();
                onPress();
              }}
              style={[styles.viewDetailsButton, { backgroundColor: theme.primary }]}
            >
              <ThemedText style={styles.viewDetailsText}>View Full Details</ThemedText>
              <Icon name="chevron-right" size={16} color="white" />
            </Pressable>
            <Pressable
              onPress={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              style={[styles.deleteButton, { backgroundColor: theme.error }]}
            >
              <Icon name="trash" size={18} color="white" />
            </Pressable>
          </View>
        </View>
      )}
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  card: {
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    gap: Spacing.md,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  cardHeaderLeft: {
    flex: 1,
    gap: Spacing.xs,
  },
  cardHeaderRight: {
    marginLeft: Spacing.md,
  },
  cardDate: {
    fontSize: 18,
    fontWeight: "700",
  },
  cardDoctor: {
    fontSize: 14,
  },
  badge: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.xs,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: "600",
  },
  summary: {
    fontSize: 14,
    lineHeight: 20,
  },
  processingContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  processingText: {
    fontSize: 14,
    fontWeight: "600",
  },
  statusIndicator: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 12,
    fontWeight: "600",
  },
  emptyContainer: {
    alignItems: "center",
    paddingVertical: Spacing["3xl"],
    gap: Spacing.lg,
    paddingHorizontal: Spacing.xl,
  },
  emptyImage: {
    width: 200,
    height: 150,
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: "700",
    textAlign: "center",
  },
  emptyText: {
    fontSize: 16,
    textAlign: "center",
    lineHeight: 24,
  },
  loadSampleButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    marginTop: Spacing.md,
  },
  loadSampleText: {
    fontSize: 14,
    fontWeight: "600",
  },
  expandedContent: {
    gap: Spacing.lg,
    marginTop: Spacing.sm,
  },
  audioControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  playButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  progressContainer: {
    flex: 1,
  },
  progressBar: {
    height: 4,
    borderRadius: 2,
    overflow: "hidden",
    marginBottom: Spacing.xs,
  },
  progressFill: {
    height: "100%",
  },
  progressTime: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  progressTimeText: {
    fontSize: 12,
  },
  fullSummaryContainer: {
    paddingTop: Spacing.sm,
  },
  fullSummary: {
    fontSize: 14,
    lineHeight: 20,
  },
  actionButtons: {
    flexDirection: "row",
    gap: Spacing.md,
  },
  viewDetailsButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  viewDetailsText: {
    fontSize: 14,
    fontWeight: "600",
    color: "white",
  },
  deleteButton: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.md,
    justifyContent: "center",
    alignItems: "center",
  },
});
