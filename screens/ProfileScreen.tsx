import React, { useState, useMemo } from "react";
import { View, StyleSheet, TextInput, Pressable, Platform } from "react-native";
import { ThemedText } from "@/components/ThemedText";
import { ScreenScrollView } from "@/components/ScreenScrollView";
import { Icon } from "@/components/Icon";
import { Spacing, BorderRadius } from "@/constants/theme";
import { useAppContext, Question } from "@/context/AppContext";
import { suggestPlannerQuestions } from "@/utils/gemini";

const EDITORIAL_THEME = {
  headerBg: "#094E5D",
  bannerBg: "#F0F7F9",
  cardBg: "#FFFFFF",
  borderColor: "#D4E5EA",
  textDark: "#1C363D",
  accentTeal: "#0B6476",
  accentAmber: "#E0A938",
};

const DEFAULT_COMMON_QUESTIONS = [
  "What does this diagnosis mean for my child's future?",
  "Are there any side effects I should watch for?",
  "What are the treatment options available?",
  "How can I help my child at home?",
  "When should I call if symptoms worsen?",
];

export default function PlannerScreen() {
  const {
    plannerQuestions,
    addPlannerQuestion,
    updatePlannerQuestion,
    deletePlannerQuestion,
    visits,
  } = useAppContext();
  const [newQuestion, setNewQuestion] = useState("");
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);

  // Filter out any common prompt already present in plannerQuestions (normalized comparison)
  const availableCommonQuestions = useMemo(() => {
    const activeTexts = new Set(
      plannerQuestions.map((q) => q.text.trim().toLowerCase())
    );
    return DEFAULT_COMMON_QUESTIONS.filter(
      (text) => !activeTexts.has(text.trim().toLowerCase())
    );
  }, [plannerQuestions]);

  const handleAddQuestion = () => {
    if (!newQuestion.trim()) return;

    const question: Question = {
      id: Date.now().toString(),
      text: newQuestion.trim(),
      checked: false,
    };

    addPlannerQuestion(question);
    setNewQuestion("");
  };

  const handleToggle = (id: string, checked: boolean) => {
    updatePlannerQuestion(id, { checked });
  };

  const handleDelete = (id: string) => {
    deletePlannerQuestion(id);
  };

  const handleSuggestQuestions = async () => {
    setIsLoadingSuggestions(true);
    const suggestions = await suggestPlannerQuestions(visits);
    setIsLoadingSuggestions(false);

    suggestions.forEach((text) => {
      const question: Question = {
        id: Date.now().toString() + Math.random(),
        text,
        checked: false,
      };
      addPlannerQuestion(question);
    });
  };

  const handleAddCommonQuestion = (text: string) => {
    const question: Question = {
      id: Date.now().toString(),
      text,
      checked: false,
    };
    addPlannerQuestion(question);
  };

  return (
    <>
      <View style={styles.topHeaderBar}>
        <ThemedText style={styles.topHeaderTitle}>Visit Preparation & Checklist</ThemedText>
      </View>

      <ScreenScrollView>
        <View style={styles.container}>
          <ThemedText style={styles.sectionHeading}>Questions to Ask</ThemedText>

          <View style={styles.calloutCard}>
            <ThemedText style={styles.calloutTitle}>Clinical Consultation Prep</ThemedText>
            <ThemedText style={styles.calloutText}>
              Note down concerns beforehand to ensure clear guidance during your next visit.
            </ThemedText>
          </View>

          <View style={styles.inputCard}>
            <TextInput
              style={styles.input}
              value={newQuestion}
              onChangeText={setNewQuestion}
              placeholder="Type your medical query or discussion topic..."
              placeholderTextColor="#7C96A0"
              multiline
              onSubmitEditing={handleAddQuestion}
            />
            <Pressable
              onPress={handleAddQuestion}
              disabled={!newQuestion.trim()}
              style={[
                styles.addSubmitButton,
                !newQuestion.trim() && { opacity: 0.5 },
              ]}
            >
              <Icon name="add" size={20} color="#FFFFFF" />
            </Pressable>
          </View>

          <Pressable
            style={styles.suggestButton}
            onPress={handleSuggestQuestions}
            disabled={isLoadingSuggestions || visits.length === 0}
          >
            <Icon name="sparkles" size={18} color={EDITORIAL_THEME.accentTeal} />
            <ThemedText style={styles.suggestButtonText}>
              {isLoadingSuggestions
                ? "Compiling Suggestions..."
                : visits.length === 0
                ? "Suggest Questions (Record a visit first)"
                : "Suggest Questions from Clinical Notes"}
            </ThemedText>
          </Pressable>

          {plannerQuestions.length > 0 && (
            <View style={styles.questionsSection}>
              {plannerQuestions.map((question) => (
                <QuestionItem
                  key={question.id}
                  question={question}
                  onToggle={handleToggle}
                  onDelete={handleDelete}
                />
              ))}
            </View>
          )}

          {availableCommonQuestions.length > 0 && (
            <View style={styles.starterSection}>
              <ThemedText style={styles.subHeading}>
                {plannerQuestions.length > 0
                  ? "Recommended Question Topics"
                  : "Standard Clinical Prompts"}
              </ThemedText>
              <ThemedText style={styles.starterDescription}>
                Tap any common question below to append it to your checklist:
              </ThemedText>

              {availableCommonQuestions.map((text, index) => (
                <Pressable
                  key={index}
                  style={styles.starterCard}
                  onPress={() => handleAddCommonQuestion(text)}
                >
                  <ThemedText style={styles.starterText}>{text}</ThemedText>
                  <Icon name="add-circle" size={20} color={EDITORIAL_THEME.accentTeal} />
                </Pressable>
              ))}
            </View>
          )}
        </View>
      </ScreenScrollView>
    </>
  );
}

function QuestionItem({
  question,
  onToggle,
  onDelete,
}: {
  question: Question;
  onToggle: (id: string, checked: boolean) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <View
      style={[
        styles.questionCard,
        question.checked && { opacity: 0.6, backgroundColor: "#EBF1F3" },
      ]}
    >
      <Pressable
        onPress={() => onToggle(question.id, !question.checked)}
        style={styles.questionContent}
      >
        <View
          style={[
            styles.checkbox,
            {
              backgroundColor: question.checked
                ? EDITORIAL_THEME.accentTeal
                : "transparent",
              borderColor: question.checked
                ? EDITORIAL_THEME.accentTeal
                : EDITORIAL_THEME.borderColor,
            },
          ]}
        >
          {question.checked && <Icon name="check" size={14} color="#FFFFFF" />}
        </View>
        <ThemedText
          style={[
            styles.questionText,
            question.checked && styles.questionTextChecked,
          ]}
        >
          {question.text}
        </ThemedText>
      </Pressable>
      <Pressable onPress={() => onDelete(question.id)} style={styles.deleteButton}>
        <Icon name="close" size={18} color="#7C96A0" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  topHeaderBar: {
    backgroundColor: EDITORIAL_THEME.headerBg,
    paddingTop: Platform.OS === "ios" ? 54 : 16,
    paddingBottom: 16,
    paddingHorizontal: Spacing.lg,
  },
  topHeaderTitle: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
    letterSpacing: 0.2,
  },
  container: {
    padding: Spacing.lg,
    gap: Spacing.md,
    backgroundColor: "#F7FAFB",
  },
  sectionHeading: {
    fontFamily: Platform.OS === "ios" ? "Georgia" : "serif",
    fontSize: 22,
    fontWeight: "700",
    color: EDITORIAL_THEME.accentTeal,
  },
  subHeading: {
    fontFamily: Platform.OS === "ios" ? "Georgia" : "serif",
    fontSize: 17,
    fontWeight: "700",
    color: EDITORIAL_THEME.textDark,
  },
  calloutCard: {
    backgroundColor: EDITORIAL_THEME.bannerBg,
    padding: Spacing.md,
    borderRadius: BorderRadius.xs,
    borderLeftWidth: 4,
    borderLeftColor: EDITORIAL_THEME.accentTeal,
    borderColor: EDITORIAL_THEME.borderColor,
    borderWidth: 1,
  },
  calloutTitle: {
    fontFamily: Platform.OS === "ios" ? "Georgia" : "serif",
    fontSize: 16,
    fontWeight: "700",
    color: EDITORIAL_THEME.textDark,
    marginBottom: 2,
  },
  calloutText: {
    fontSize: 13,
    lineHeight: 18,
    color: "#4A626A",
  },
  inputCard: {
    backgroundColor: EDITORIAL_THEME.cardBg,
    borderColor: EDITORIAL_THEME.borderColor,
    borderWidth: 1,
    borderRadius: BorderRadius.xs,
    padding: Spacing.md,
    flexDirection: "row",
    gap: Spacing.sm,
    alignItems: "flex-end",
  },
  input: {
    flex: 1,
    fontSize: 14,
    minHeight: 40,
    maxHeight: 100,
    color: EDITORIAL_THEME.textDark,
  },
  addSubmitButton: {
    backgroundColor: EDITORIAL_THEME.accentTeal,
    borderRadius: BorderRadius.xs,
    padding: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  suggestButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    backgroundColor: EDITORIAL_THEME.cardBg,
    borderColor: EDITORIAL_THEME.accentTeal,
    borderWidth: 1.5,
    borderRadius: BorderRadius.xs,
    paddingVertical: 12,
  },
  suggestButtonText: {
    color: EDITORIAL_THEME.accentTeal,
    fontWeight: "600",
    fontSize: 14,
  },
  questionsSection: {
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  questionCard: {
    backgroundColor: EDITORIAL_THEME.cardBg,
    borderColor: EDITORIAL_THEME.borderColor,
    borderWidth: 1,
    borderRadius: BorderRadius.xs,
    padding: Spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  questionContent: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 3,
    borderWidth: 1.5,
    justifyContent: "center",
    alignItems: "center",
  },
  questionText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    color: EDITORIAL_THEME.textDark,
  },
  questionTextChecked: {
    textDecorationLine: "line-through",
    color: "#7C96A0",
  },
  deleteButton: {
    padding: Spacing.xs,
  },
  starterSection: {
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  starterDescription: {
    fontSize: 13,
    color: "#5C7680",
    marginBottom: Spacing.xs,
  },
  starterCard: {
    backgroundColor: EDITORIAL_THEME.cardBg,
    borderColor: EDITORIAL_THEME.borderColor,
    borderWidth: 1,
    borderRadius: BorderRadius.xs,
    padding: Spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.md,
  },
  starterText: {
    flex: 1,
    fontSize: 14,
    color: EDITORIAL_THEME.textDark,
  },
});