import React, { useState } from "react";
import { StyleSheet, View, TextInput, Platform, ActivityIndicator, Pressable, ScrollView as RNScrollView, Image } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Button } from "@/components/Button";
import { Icon } from "@/components/Icon";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius } from "@/constants/theme";
import { useAppContext } from "@/context/AppContext";
import { analyzeReadingLevel } from "@/utils/textAnalysis";

const InspiredLogo = require("@/assets/images/inspired-logo.png");

const DEFAULT_READING_LEVEL = 8;

export default function OnboardingScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { readingLevel, setReadingLevel, completeOnboarding, setPrivacyConsent } = useAppContext();
  const [userInput, setUserInput] = useState("");
  const [step, setStep] = useState(-1);
  const [allResponses, setAllResponses] = useState<string[]>([]);
  const [isCompleting, setIsCompleting] = useState(false);
  const [showTransition, setShowTransition] = useState(false);

  const questions = [
    {
      title: "Welcome to InspirEd!",
      prompt:
        "We'd love to get to know you better. Tell us a bit about yourself and your child. What brings you to InspirEd?",
      placeholder: "Share your story here...",
      minWords: 15,
    },
    {
      title: "Your Questions",
      prompt:
        "What are your main questions or concerns about your child's health? What would you like to understand better?",
      placeholder: "Your questions and concerns...",
      minWords: 10,
    },
  ];

  const currentQuestion = step >= 0 ? questions[step] : null;

  const handleAcceptPrivacy = async () => {
    await setPrivacyConsent(true);
    setStep(0);
  };

  const handleContinue = async () => {
    if (isCompleting) return;
    
    const updatedResponses = [...allResponses, userInput];
    setAllResponses(updatedResponses);
    
    if (step < questions.length - 1) {
      setStep(step + 1);
      setUserInput("");
    } else {
      setShowTransition(true);
      setIsCompleting(true);
      
      const completeFlow = async () => {
        try {
          await new Promise(resolve => setTimeout(resolve, 2500));
          
          const combinedText = updatedResponses.join(" ");
          const analysis = analyzeReadingLevel(combinedText);

          await setReadingLevel(analysis.grade);
          await completeOnboarding();
        } catch (error) {
          console.error("Error completing onboarding:", error);
          setIsCompleting(false);
          setShowTransition(false);
        }
      };
      
      completeFlow();
    }
  };

  const handleSkip = async () => {
    if (isCompleting) return;
    setIsCompleting(true);
    
    try {
      // If readingLevel is still the default (first time), keep it
      // If it's been customized (redo setup), also keep the existing value
      // Only set to default if somehow it's not set
      if (readingLevel === 0) {
        await setReadingLevel(DEFAULT_READING_LEVEL);
      }
      await completeOnboarding();
    } catch (error) {
      console.error("Error skipping onboarding:", error);
      setIsCompleting(false);
    }
  };

  const wordCount = userInput.trim().split(/\s+/).filter((w) => w.length > 0).length;
  const canContinue = currentQuestion ? wordCount >= currentQuestion.minWords : false;

  const scrollViewProps = {
    style: { flex: 1, backgroundColor: theme.backgroundRoot },
    contentContainerStyle: [
      styles.container,
      {
        paddingTop: insets.top + Spacing.xl,
        paddingBottom: insets.bottom + Spacing.xl,
      },
    ],
    keyboardShouldPersistTaps: "handled" as const,
  };

  const ScrollComponent = Platform.OS === "web" ? RNScrollView : KeyboardAwareScrollView;

  if (step === -1) {
    return (
      <ScrollComponent {...scrollViewProps}>
        <View style={styles.logoContainer}>
          <Image 
            source={InspiredLogo} 
            style={styles.logo}
            resizeMode="contain"
          />
        </View>

        <ThemedView style={[styles.card, { backgroundColor: theme.backgroundSecondary }]}>
          <ThemedText style={styles.consentTitle}>How We Protect Your Privacy</ThemedText>
          <ThemedText style={[styles.consentText, { color: theme.textSecondary }]}>
            InspirEd helps you record and understand doctor visits. Before we get started, here's how your information is handled:
          </ThemedText>

          <View style={styles.consentItem}>
            <Icon name="home" size={24} color={theme.primary} />
            <View style={styles.consentItemText}>
              <ThemedText style={styles.consentItemTitle}>Stored on Your Device</ThemedText>
              <ThemedText style={[styles.consentItemDescription, { color: theme.textSecondary }]}>
                Your recordings and visit information are saved on this device. We don't keep copies of them.
              </ThemedText>
            </View>
          </View>

          <View style={styles.consentItem}>
            <Icon name="sparkles" size={24} color={theme.primary} />
            <View style={styles.consentItemText}>
              <ThemedText style={styles.consentItemTitle}>AI-Powered Summaries</ThemedText>
              <ThemedText style={[styles.consentItemDescription, { color: theme.textSecondary }]}>
                When you record a visit, the audio passes securely through the InspirEd service to Google's AI to create transcriptions and summaries, and is deleted once it's processed. This helps make medical information easier to understand.
              </ThemedText>
            </View>
          </View>

          <View style={styles.consentItem}>
            <Icon name="shield" size={24} color={theme.primary} />
            <View style={styles.consentItemText}>
              <ThemedText style={styles.consentItemTitle}>You're in Control</ThemedText>
              <ThemedText style={[styles.consentItemDescription, { color: theme.textSecondary }]}>
                You can delete any visit recording at any time. Your data stays with you.
              </ThemedText>
            </View>
          </View>
        </ThemedView>

        <View style={styles.buttonContainer}>
          <Button onPress={handleAcceptPrivacy}>
            I Understand, Let's Get Started
          </Button>
        </View>
      </ScrollComponent>
    );
  }

  if (showTransition) {
    return (
      <ThemedView style={styles.transitionContainer}>
        <Image 
          source={InspiredLogo} 
          style={styles.transitionLogo}
          resizeMode="contain"
        />
        
        <ActivityIndicator size="large" color={theme.primary} style={styles.spinner} />
        
        <ThemedText style={styles.transitionTitle}>
          Personalizing Your Experience
        </ThemedText>
        
        <ThemedText style={[styles.transitionDescription, { color: theme.textSecondary }]}>
          We're analyzing your responses to tailor InspirEd to your needs...
        </ThemedText>
      </ThemedView>
    );
  }

  if (!currentQuestion) return null;

  return (
    <ScrollComponent {...scrollViewProps}>
      <View style={styles.header}>
        <Image 
          source={InspiredLogo} 
          style={styles.headerLogo}
          resizeMode="contain"
        />
        <ThemedText style={styles.title}>{currentQuestion.title}</ThemedText>
      </View>

        <ThemedView style={[styles.card, { backgroundColor: theme.backgroundSecondary }]}>
          <ThemedText style={styles.prompt}>{currentQuestion.prompt}</ThemedText>

          <TextInput
            style={[
              styles.textInput,
              {
                backgroundColor: "#FFFFFF",
                color: theme.text,
                borderColor: theme.border,
              },
            ]}
            value={userInput}
            onChangeText={setUserInput}
            placeholder={currentQuestion.placeholder}
            placeholderTextColor={theme.textSecondary}
            multiline
            numberOfLines={8}
            textAlignVertical="top"
          />

          <View style={styles.footer}>
            <ThemedText style={[styles.wordCount, { color: canContinue ? theme.primary : theme.textSecondary }]}>
              {wordCount} words (minimum {currentQuestion.minWords})
            </ThemedText>
          </View>
        </ThemedView>

        <View style={styles.buttonContainer}>
          <Button onPress={handleContinue} disabled={!canContinue || isCompleting}>
            {step < questions.length - 1 ? "Continue" : "Get Started"}
          </Button>
          
          <Pressable onPress={handleSkip} style={styles.skipButton} disabled={isCompleting}>
            <ThemedText style={[styles.skipText, { color: theme.textSecondary }]}>
              Skip for now
            </ThemedText>
          </Pressable>
        </View>

        <View style={styles.progressContainer}>
          {questions.map((_, index) => (
            <View
              key={index}
              style={[
                styles.progressDot,
                {
                  backgroundColor: index <= step ? theme.primary : theme.border,
                },
              ]}
            />
          ))}
        </View>
    </ScrollComponent>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: Spacing.xl,
    gap: Spacing.xl,
  },
  logoContainer: {
    alignItems: "center",
    marginTop: Spacing.xl,
    marginBottom: Spacing.md,
  },
  logo: {
    width: 220,
    height: 180,
  },
  headerLogo: {
    width: 120,
    height: 80,
    marginBottom: Spacing.sm,
  },
  transitionLogo: {
    width: 180,
    height: 140,
    marginBottom: Spacing.xl,
  },
  transitionContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.xl,
  },
  spinner: {
    marginBottom: Spacing.xl,
  },
  transitionTitle: {
    fontSize: 24,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: Spacing.md,
  },
  transitionDescription: {
    fontSize: 16,
    textAlign: "center",
    lineHeight: 24,
  },
  header: {
    alignItems: "center",
    gap: Spacing.sm,
    marginTop: Spacing.xl,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    textAlign: "center",
  },
  tagline: {
    fontSize: 14,
    fontStyle: "italic",
    textAlign: "center",
  },
  card: {
    borderRadius: BorderRadius.lg,
    padding: Spacing.xl,
    gap: Spacing.lg,
  },
  prompt: {
    fontSize: 16,
    lineHeight: 24,
  },
  textInput: {
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    padding: Spacing.md,
    fontSize: 16,
    minHeight: 150,
  },
  footer: {
    alignItems: "flex-end",
  },
  wordCount: {
    fontSize: 14,
  },
  buttonContainer: {
    marginTop: Spacing.md,
    gap: Spacing.md,
    alignItems: "center",
  },
  skipButton: {
    paddingVertical: Spacing.sm,
  },
  skipText: {
    fontSize: 14,
  },
  progressContainer: {
    flexDirection: "row",
    justifyContent: "center",
    gap: Spacing.sm,
    marginTop: Spacing.lg,
  },
  progressDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  consentTitle: {
    fontSize: 20,
    fontWeight: "700",
    marginBottom: Spacing.sm,
  },
  consentText: {
    fontSize: 15,
    lineHeight: 22,
    marginBottom: Spacing.lg,
  },
  consentItem: {
    flexDirection: "row",
    gap: Spacing.md,
    marginBottom: Spacing.lg,
    alignItems: "flex-start",
  },
  consentItemText: {
    flex: 1,
  },
  consentItemTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 4,
  },
  consentItemDescription: {
    fontSize: 14,
    lineHeight: 20,
  },
});
