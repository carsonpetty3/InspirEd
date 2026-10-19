import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  View,
  StyleSheet,
  Pressable,
  TextInput,
  Text,
  ListRenderItemInfo,
  Platform,
  Keyboard,
} from "react-native";
import { ThemedText } from "@/components/ThemedText";
import { ScreenScrollView } from "@/components/ScreenScrollView";
import { Icon } from "@/components/Icon";
import { MarkdownText, parseInlineFormatting } from "@/components/MarkdownText";
import { PdfViewerModal } from "@/components/PdfViewerModal";
import { useTheme } from "@/hooks/useTheme";
import { useScreenInsets } from "@/hooks/useScreenInsets";
import { Spacing, BorderRadius } from "@/constants/theme";
import {
  useAppContext,
  LearningModule,
  Message,
  Citation,
} from "@/context/AppContext";
import { useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from "react-native-reanimated";
import { useReanimatedKeyboardAnimation } from "react-native-keyboard-controller";
import { askEducationalQuestion } from "@/utils/gemini";
import { SearchBar } from "@/components/SearchBar";
import { assetToLearningModule } from "@/utils/assetConvertion";
import { openAssetPDF } from "../utils/openAsset";
import { buildCitationPdfUrl } from "@/utils/rag";

const CHAT_INPUT_LINE_HEIGHT = 20;
const CHAT_INPUT_MAX_LINES = 9;
const CHAT_INPUT_PAD_V = Spacing.xs * 2;
const CHAT_INPUT_MIN_HEIGHT = CHAT_INPUT_LINE_HEIGHT + CHAT_INPUT_PAD_V;
const CHAT_INPUT_MAX_HEIGHT =
  CHAT_INPUT_LINE_HEIGHT * CHAT_INPUT_MAX_LINES + CHAT_INPUT_PAD_V;
const CHAT_LIST_GAP_ABOVE_COMPOSER = Spacing.sm;

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// editorial styling design tokens
const EDITORIAL_THEME = {
  headerBg: "#094E5D",
  bannerBg: "#F0F7F9",
  cardBg: "#FFFFFF",
  borderColor: "#D4E5EA",
  textDark: "#1C363D",
  accentTeal: "#0B6476",
  accentAmber: "#E0A938",
};

export default function EducationScreen() {
  const { theme } = useTheme();
  const {
    learningModules,
    setLearningModules,
    educationChatMessages,
    addEducationChatMessage,
    readingLevel,
    toggleModuleComplete,
  } = useAppContext();
  const navigation = useNavigation<any>();

  const [showChat, setShowChat] = useState(false);
  const [inputText, setInputText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [recommended, setRecommended] = useState<any[]>([]);
  const [loadingRecommended, setLoadingRecommended] = useState(false);
  const moduleMap = new Map(learningModules.map((m) => [m.id, m]));

  const flatListRef = useRef<Animated.FlatList<Message>>(null);
  const [pdfModal, setPdfModal] = useState<{
    uri: string;
    title: string;
  } | null>(null);
  const [activeCitation, setActiveCitation] = useState<{
    messageId: string;
    index: number;
  } | null>(null);
  const [citationExpandedByMessageId, setCitationExpandedByMessageId] =
    useState<Record<string, boolean>>({});
  const { paddingTop, paddingBottom: tabBarBottomInset } = useScreenInsets();
  const safeInsets = useSafeAreaInsets();
  const { height: keyboardHeight } = useReanimatedKeyboardAnimation();

  const [keyboardVisible, setKeyboardVisible] = useState(false);

  // monitor keyboard visibility to manage input docking
  useEffect(() => {
    const showEvent =
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent =
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const subShow = Keyboard.addListener(showEvent, () =>
      setKeyboardVisible(true),
    );
    const subHide = Keyboard.addListener(hideEvent, () =>
      setKeyboardVisible(false),
    );
    return () => {
      subShow.remove();
      subHide.remove();
    };
  }, []);

  const composerDockBottomInset = keyboardVisible
    ? Math.max(safeInsets.bottom, Spacing.xs)
    : tabBarBottomInset;

  const [chatComposerDockHeight, setChatComposerDockHeight] = useState(72);
  const [composerInputHeight, setComposerInputHeight] = useState(
    CHAT_INPUT_MIN_HEIGHT,
  );
  const prevComposerLengthRef = useRef(0);

  // dynamically adjust composer height to multi-line input
  const handleComposerTextChange = useCallback((text: string) => {
    setInputText(text);
    if (text.length === 0) {
      setComposerInputHeight(CHAT_INPUT_MIN_HEIGHT);
      prevComposerLengthRef.current = 0;
      return;
    }
    if (prevComposerLengthRef.current > text.length) {
      setComposerInputHeight(CHAT_INPUT_MIN_HEIGHT);
    }
    prevComposerLengthRef.current = text.length;
  }, []);

  const animatedChatInputStyle = useAnimatedStyle(
    () => ({
      transform: [{ translateY: keyboardHeight.value }],
    }),
    [],
  );

  // clear highlight state after timeout
  useEffect(() => {
    if (!activeCitation) return;
    const t = setTimeout(() => setActiveCitation(null), 4500);
    return () => clearTimeout(t);
  }, [activeCitation]);

  // highlight citation reference and scroll message into view
  const handleCitationChip = useCallback(
    (messageId: string, citationOneBased: number, citationCount: number) => {
      const idx = citationOneBased - 1;
      if (idx < 0 || idx >= citationCount) return;
      setActiveCitation({ messageId, index: idx });
      setCitationExpandedByMessageId((prev) => ({
        ...prev,
        [messageId]: true,
      }));
      const flatIndex = educationChatMessages.findIndex((m) => m.id === messageId);
      if (flatIndex < 0) return;

      const scrollToMessage = () => {
        flatListRef.current?.scrollToIndex({
          index: flatIndex,
          viewPosition: 1,
          animated: true,
        });
      };

      requestAnimationFrame(() => {
        scrollToMessage();
        setTimeout(scrollToMessage, 85);
      });
    },
    [educationChatMessages],
  );

  // send user query to medical knowledge assistant and stream citations
  const handleAskQuestion = async () => {
    if (!inputText.trim() || isLoading) return;

    const questionText = inputText.trim();
    const userMessage: Message = {
      id: Date.now().toString(),
      text: questionText,
      isUser: true,
      timestamp: new Date(),
    };

    addEducationChatMessage(userMessage);
    setInputText("");
    setComposerInputHeight(CHAT_INPUT_MIN_HEIGHT);
    prevComposerLengthRef.current = 0;
    setIsLoading(true);

    const conversationHistory = [
      ...educationChatMessages.map((msg) => ({
        text: msg.text,
        isUser: msg.isUser,
      })),
      { text: questionText, isUser: true },
    ];

    try {
      const response = await askEducationalQuestion(
        questionText,
        conversationHistory,
        readingLevel,
      );

      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        text: response.answer,
        isUser: false,
        timestamp: new Date(),
        citations: response.citations,
      };

      addEducationChatMessage(aiMessage);
    } catch (e) {
      console.warn("[EducationScreen] askEducationalQuestion failed", e);
      addEducationChatMessage({
        id: (Date.now() + 1).toString(),
        text: "Something went wrong getting a response. Check your connection and API keys, then try again.",
        isUser: false,
        timestamp: new Date(),
      });
    } finally {
      setIsLoading(false);
    }
  };

  // query educational assets repository
  const searchAssets = async (text: string) => {
    if (!text.trim()) {
      setResults([]);
      return;
    }

    const res = await fetch(
      process.env.EXPO_PUBLIC_API_URL + `/assets/search/query?q=${encodeURIComponent(text)}`,
    );

    const data = await res.json();
    setResults(data);
  };

  // load personalized learning materials
  const fetchRecommended = async () => {
    try {
      setLoadingRecommended(true);

      const res = await fetch(
        process.env.EXPO_PUBLIC_API_URL + "/assets/recommended",
      );

      const data = await res.json();
      const modules = data.map(assetToLearningModule);

      setLearningModules((prev) => {
        const existing = new Map(prev.map((m) => [m.id, m]));
        modules.forEach((m: LearningModule) => {
          if (!existing.has(m.id)) {
            existing.set(m.id, m);
          }
        });
        return Array.from(existing.values());
      });

      setRecommended(data);
    } catch (err) {
      console.error("Error fetching recommended:", err);
    } finally {
      setLoadingRecommended(false);
    }
  };

  useEffect(() => {
    fetchRecommended();
  }, []);

  // filter recommendations to uncompleted modules
  const filteredRecommended = recommended
    .filter((item) => {
      const base = assetToLearningModule(item);
      const stored = moduleMap.get(base.id);
      return !(stored?.completed ?? false);
    })
    .slice(0, 3);

  // full-screen assistant chat interface
  if (showChat) {
    return (
      <View
        style={[
          styles.chatRoot,
          {
            paddingTop,
            backgroundColor: "#F7FAFB",
          },
        ]}
      >
        <View style={[styles.container, styles.chatMainColumn]}>
          {/* return to course library view */}
          <Pressable
            onPress={() => setShowChat(false)}
            style={styles.backButton}
          >
            <Icon name="chevron-back" size={20} color={EDITORIAL_THEME.accentTeal} />
            <ThemedText style={styles.backButtonText}>
              Back to Modules
            </ThemedText>
          </Pressable>

          {/* assistant scope guidance */}
          <View style={styles.calloutCard}>
            <View style={styles.cardHeader}>
              <Icon name="chat" size={20} color={EDITORIAL_THEME.accentTeal} />
              <ThemedText style={styles.calloutTitle}>
                Medical Knowledge Assistant
              </ThemedText>
            </View>
            <ThemedText style={styles.calloutText}>
              Ask questions regarding conditions, medical terminology, and referenced clinical guides.
            </ThemedText>
          </View>

          {/* interactive message feed */}
          <Animated.FlatList
            ref={flatListRef}
            style={styles.chatFlatList}
            data={educationChatMessages}
            keyExtractor={(item) => item.id}
            extraData={{
              activeCitation,
              citationExpandedByMessageId,
              messageCount: educationChatMessages.length,
              isLoading,
              chatComposerDockHeight,
            }}
            renderItem={({ item: msg }: ListRenderItemInfo<Message>) => (
              <View
                style={[styles.messageBubble, msg.isUser && styles.userMessage]}
              >
                <View
                  style={[
                    styles.messageContent,
                    {
                      backgroundColor: msg.isUser
                        ? EDITORIAL_THEME.accentTeal
                        : EDITORIAL_THEME.cardBg,
                      borderColor: msg.isUser
                        ? EDITORIAL_THEME.accentTeal
                        : EDITORIAL_THEME.borderColor,
                      borderWidth: 1,
                    },
                  ]}
                >
                  {msg.isUser ? (
                    <ThemedText style={{ color: "white" }}>
                      {msg.text}
                    </ThemedText>
                  ) : msg.citations && msg.citations.length > 0 ? (
                    <AssistantMessageWithCitations
                      text={msg.text}
                      citations={msg.citations}
                      theme={theme}
                      onCitationChip={(n) =>
                        handleCitationChip(msg.id, n, msg.citations!.length)
                      }
                    />
                  ) : (
                    <MarkdownText color={EDITORIAL_THEME.textDark}>{msg.text}</MarkdownText>
                  )}
                </View>

                {/* citation drawer with original source pdf links */}
                {!msg.isUser && msg.citations && msg.citations.length > 0 ? (
                  <CitationSection
                    citations={msg.citations}
                    expanded={citationExpandedByMessageId[msg.id] ?? false}
                    onExpandedChange={(next) =>
                      setCitationExpandedByMessageId((prev) => ({
                        ...prev,
                        [msg.id]: next,
                      }))
                    }
                    highlightIndex={
                      activeCitation?.messageId === msg.id
                        ? activeCitation.index
                        : null
                    }
                    onOpenPdf={(citation) => {
                      const url = buildCitationPdfUrl(citation.sourceFilePath);
                      if (url) {
                        setPdfModal({ uri: url, title: citation.sourceTitle });
                      }
                    }}
                  />
                ) : null}
              </View>
            )}
            ListFooterComponent={
              isLoading ? (
                <View style={styles.messageBubble}>
                  <View
                    style={[
                      styles.messageContent,
                      {
                        backgroundColor: EDITORIAL_THEME.cardBg,
                        borderColor: EDITORIAL_THEME.borderColor,
                        borderWidth: 1,
                      },
                    ]}
                  >
                    <ThemedText style={{ color: "#7C96A0", fontStyle: "italic" }}>
                      Retrieving medical sources...
                    </ThemedText>
                  </View>
                </View>
              ) : null
            }
            contentContainerStyle={[
              styles.chatListContent,
              {
                paddingBottom:
                  chatComposerDockHeight + CHAT_LIST_GAP_ABOVE_COMPOSER,
              },
            ]}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={
              Platform.OS === "ios" ? "interactive" : "on-drag"
            }
          />

          {/* query composer bar */}
          <Animated.View
            onLayout={(e) =>
              setChatComposerDockHeight(e.nativeEvent.layout.height)
            }
            style={[
              styles.chatInputDock,
              {
                borderTopColor: EDITORIAL_THEME.borderColor,
                backgroundColor: EDITORIAL_THEME.cardBg,
                paddingBottom: composerDockBottomInset,
                paddingHorizontal: Spacing.lg,
              },
              animatedChatInputStyle,
            ]}
          >
            <View style={styles.chatComposerContainer}>
              <View style={styles.inputFieldGrow}>
                <TextInput
                  style={[
                    styles.input,
                    {
                      minHeight: composerInputHeight,
                      maxHeight: CHAT_INPUT_MAX_HEIGHT,
                    },
                  ]}
                  value={inputText}
                  onChangeText={handleComposerTextChange}
                  placeholder="Ask a question..."
                  placeholderTextColor="#7C96A0"
                  multiline
                  maxLength={500}
                />
              </View>
              <Pressable
                onPress={handleAskQuestion}
                disabled={!inputText.trim() || isLoading}
                style={[
                  styles.sendButton,
                  (!inputText.trim() || isLoading) && { opacity: 0.5 },
                ]}
              >
                <Icon name="send" size={18} color="#FFFFFF" />
              </Pressable>
            </View>
          </Animated.View>
        </View>

        {/* modal reader for source documents */}
        <PdfViewerModal
          visible={pdfModal !== null}
          uri={pdfModal?.uri ?? null}
          title={pdfModal?.title}
          onClose={() => setPdfModal(null)}
        />
      </View>
    );
  }

  // default course library view
  return (
    <>
      {/* portal title banner */}
      <View style={styles.topHeaderBar}>
        <ThemedText style={styles.topHeaderTitle}>Clinical Learning Library</ThemedText>
      </View>

      <ScreenScrollView>
        <View style={styles.container}>
          <ThemedText style={styles.sectionHeading}>Educational Modules</ThemedText>

          {/* filter and search library catalog */}
          <SearchBar
            value={searchText}
            onChangeText={(t) => {
              setSearchText(t);
              searchAssets(t);
            }}
            placeholder="Search conditions, terms, or topics..."
            onClear={() => {
              setSearchText("");
              setResults([]);
            }}
          />

          {/* display active search results */}
          {results.map((item) => {
            const base = assetToLearningModule(item);
            const stored = moduleMap.get(base.id);

            return (
              <ModuleCard
                key={base.id}
                module={{
                  ...base,
                  completed: stored?.completed ?? false,
                  progress: stored?.progress ?? 0,
                }}
                onPress={() =>
                  openAssetPDF(item.title, process.env.EXPO_PUBLIC_API_URL + item.file_path)
                }
                onToggleComplete={toggleModuleComplete}
              />
            );
          })}

          {/* primary action buttons for ai assistant and video archive */}
          <View style={styles.actionButtons}>
            <Pressable
              onPress={() => setShowChat(true)}
              style={styles.actionPrimaryButton}
            >
              <Icon name="chat" size={18} color="#FFFFFF" />
              <ThemedText style={styles.actionPrimaryButtonText}>
                Ask Medical AI
              </ThemedText>
            </Pressable>

            <Pressable
              onPress={() => navigation.navigate("VideoLibrary")}
              style={styles.actionSecondaryButton}
            >
              <Icon name="videocam" size={18} color={EDITORIAL_THEME.accentTeal} />
              <ThemedText style={styles.actionSecondaryButtonText}>
                Video Catalog
              </ThemedText>
            </Pressable>
          </View>

          {/* curated recommended module track */}
          <View style={styles.categorySection}>
            <ThemedText style={styles.subHeading}>
              Recommended for Care Journey
            </ThemedText>

            {loadingRecommended ? (
              <ThemedText style={{ color: "#7C96A0", fontSize: 13 }}>
                Loading modules...
              </ThemedText>
            ) : filteredRecommended.length === 0 ? (
              <ThemedText style={{ color: "#7C96A0", fontSize: 13 }}>
                All modules currently completed
              </ThemedText>
            ) : (
              filteredRecommended.map((item) => {
                const base = assetToLearningModule(item);
                const stored = moduleMap.get(base.id);

                return (
                  <ModuleCard
                    key={base.id}
                    module={{
                      ...base,
                      completed: stored?.completed ?? false,
                      progress: stored?.progress ?? 0,
                    }}
                    onPress={() =>
                      openAssetPDF(
                        item.title,
                        process.env.EXPO_PUBLIC_API_URL + item.file_path,
                      )
                    }
                    onToggleComplete={toggleModuleComplete}
                  />
                );
              })
            )}
          </View>
        </View>
      </ScreenScrollView>
    </>
  );
}

// render educational module item with completion toggling
function ModuleCard({
  module,
  onPress,
  onToggleComplete,
}: {
  module: LearningModule;
  onPress: () => void;
  onToggleComplete: (id: string) => void;
}) {
  const scale = useSharedValue(1);

  // handle spring press animation
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={() => {
        scale.value = withSpring(0.98);
      }}
      onPressOut={() => {
        scale.value = withSpring(1);
      }}
      style={[animatedStyle, styles.moduleCard]}
    >
      <View style={styles.moduleHeader}>
        <View style={styles.moduleHeaderLeft}>
          <ThemedText style={styles.moduleTitle}>{module.title}</ThemedText>
          <ThemedText style={styles.moduleDescription}>
            {module.description}
          </ThemedText>
        </View>
        {module.completed && (
          <View style={styles.completedBadge}>
            <Icon name="check" size={14} color="#FFFFFF" />
          </View>
        )}
      </View>

      <View style={styles.moduleFooter}>
        <View style={styles.moduleMetadata}>
          <View style={styles.difficultyBadge}>
            <ThemedText style={styles.difficultyText}>
              {module.difficulty}
            </ThemedText>
          </View>
        </View>

        {/* update module completion state */}
        <Pressable
          onPress={() => onToggleComplete(module.id)}
          style={[
            styles.completeButton,
            module.completed && styles.completeButtonActive,
          ]}
        >
          <Icon
            name={module.completed ? "checkmark-circle" : "circle"}
            size={16}
            color={module.completed ? EDITORIAL_THEME.accentTeal : "#7C96A0"}
          />
          <ThemedText
            style={[
              styles.completeButtonText,
              module.completed && { color: EDITORIAL_THEME.accentTeal },
            ]}
          >
            {module.completed ? "Completed" : "Mark as read"}
          </ThemedText>
        </Pressable>
      </View>
    </AnimatedPressable>
  );
}

const CITATION_BRACKET_SPLIT_RE = /(\[(?:\d+(?:\s*,\s*\d+)*)\])/g;

// parse inline reference brackets into clickable markers
function CitationChipText({
  n,
  theme,
  citationCount,
  onCitationChip,
}: {
  n: number;
  theme: any;
  citationCount: number;
  onCitationChip: (n: number) => void;
}) {
  const valid = n >= 1 && n <= citationCount;
  return (
    <Text
      onPress={valid ? () => onCitationChip(n) : undefined}
      style={{
        color: valid ? EDITORIAL_THEME.accentTeal : "#7C96A0",
        fontWeight: "700",
        fontSize: 14,
        lineHeight: 20,
        textDecorationLine: valid ? "underline" : "none",
      }}
    >
      [{n}]
    </Text>
  );
}

// split paragraphs to render inline text alongside interactive citation chips
function renderInlineCitationChildren(
  segment: string,
  theme: any,
  citationCount: number,
  onCitationChip: (n: number) => void,
): React.ReactNode {
  const parts = segment.split(CITATION_BRACKET_SPLIT_RE).filter((x) => x.length > 0);
  const isBracketToken = (s: string) => /^\[(?:\d+(?:\s*,\s*\d+)*)\]$/.test(s.trim());

  return parts.map((p, i) => {
    if (isBracketToken(p)) {
      const nums =
        p.slice(1, -1).match(/\d+/g)?.map((x) => parseInt(x, 10)) ?? [];
      return (
        <Text key={i}>
          {nums.flatMap((n, ni) =>
            ni === 0
              ? [
                  <CitationChipText
                    key={`${i}-0`}
                    n={n}
                    theme={theme}
                    citationCount={citationCount}
                    onCitationChip={onCitationChip}
                  />,
                ]
              : [
                  <Text key={`${i}-sep-${ni}`} style={{ fontSize: 14, color: EDITORIAL_THEME.textDark }}>
                    ,{" "}
                  </Text>,
                  <CitationChipText
                    key={`${i}-${ni}`}
                    n={n}
                    theme={theme}
                    citationCount={citationCount}
                    onCitationChip={onCitationChip}
                  />,
                ],
          )}
        </Text>
      );
    }
    const segs = parseInlineFormatting(p);
    return (
      <Text key={i}>
        {segs.map((seg, j) => (
          <Text
            key={j}
            style={[
              { fontSize: 14, lineHeight: 20, color: EDITORIAL_THEME.textDark },
              seg.bold && { fontWeight: "700" },
              seg.italic && { fontStyle: "italic" },
            ]}
          >
            {seg.text}
          </Text>
        ))}
      </Text>
    );
  });
}

// format response text and bind citation markers
function AssistantMessageWithCitations({
  text,
  citations,
  theme,
  onCitationChip,
}: {
  text: string;
  citations: Citation[];
  theme: any;
  onCitationChip: (n: number) => void;
}) {
  const paragraphs = text.split(/\n\n/).filter((p) => p.length > 0);
  return (
    <View>
      {paragraphs.map((para, i) => (
        <Text key={i} style={{ marginBottom: Spacing.xs }}>
          {renderInlineCitationChildren(para, theme, citations.length, onCitationChip)}
        </Text>
      ))}
    </View>
  );
}

// render citation drawer with links to launch full source document view
function CitationSection({
  citations,
  expanded,
  onExpandedChange,
  highlightIndex,
  onOpenPdf,
}: {
  citations: Citation[];
  expanded: boolean;
  onExpandedChange: (next: boolean) => void;
  highlightIndex: number | null;
  onOpenPdf: (citation: Citation) => void;
}) {
  if (citations.length === 0) return null;

  return (
    <View style={styles.citationContainer}>
      {/* toggle citation drawer display */}
      <Pressable
        onPress={() => onExpandedChange(!expanded)}
        style={styles.citationHeader}
      >
        <Icon name="document-text" size={14} color={EDITORIAL_THEME.accentTeal} />
        <ThemedText style={styles.citationHeaderText}>
          {citations.length} source{citations.length > 1 ? "s" : ""} cited
        </ThemedText>
        <Icon
          name={expanded ? "chevron-up" : "chevron-down"}
          size={14}
          color={EDITORIAL_THEME.accentTeal}
        />
      </Pressable>

      {/* itemized citations */}
      {expanded ? (
        <View style={styles.citationList}>
          {citations.map((citation, index) => {
            const pdfUrl = buildCitationPdfUrl(citation.sourceFilePath);
            const isHighlighted = highlightIndex === index;
            return (
              <Pressable
                key={citation.id}
                onPress={() => {
                  if (pdfUrl) {
                    onOpenPdf(citation);
                  }
                }}
                disabled={!pdfUrl}
                style={[
                  styles.citationItem,
                  index < citations.length - 1 && {
                    borderBottomColor: EDITORIAL_THEME.borderColor,
                    borderBottomWidth: 1,
                  },
                  isHighlighted && { backgroundColor: "#E6F1F4" },
                ]}
              >
                <View style={styles.citationBadge}>
                  <ThemedText style={styles.citationNumber}>[{index + 1}]</ThemedText>
                </View>
                <View style={styles.citationContent}>
                  <ThemedText style={styles.citationTitle}>
                    {citation.sourceTitle}
                  </ThemedText>
                  <ThemedText style={styles.citationExcerpt}>
                    {citation.excerpt}
                  </ThemedText>
                  {pdfUrl ? (
                    <View style={styles.openPdfHint}>
                      <Icon name="document" size={12} color={EDITORIAL_THEME.accentTeal} />
                      <ThemedText style={styles.openPdfHintText}>
                        Open Source Document
                      </ThemedText>
                    </View>
                  ) : null}
                </View>
              </Pressable>
            );
          })}
        </View>
      ) : null}
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
  actionButtons: {
    flexDirection: "row",
    gap: Spacing.md,
    alignItems: "center",
  },
  actionPrimaryButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    backgroundColor: EDITORIAL_THEME.accentTeal,
    paddingVertical: 12,
    borderRadius: BorderRadius.xs,
  },
  actionPrimaryButtonText: {
    color: "#FFFFFF",
    fontWeight: "600",
    fontSize: 14,
  },
  actionSecondaryButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    backgroundColor: EDITORIAL_THEME.cardBg,
    borderColor: EDITORIAL_THEME.borderColor,
    borderWidth: 1,
    paddingVertical: 12,
    borderRadius: BorderRadius.xs,
  },
  actionSecondaryButtonText: {
    color: EDITORIAL_THEME.accentTeal,
    fontWeight: "600",
    fontSize: 14,
  },
  categorySection: {
    gap: Spacing.md,
    marginTop: Spacing.xs,
  },
  moduleCard: {
    padding: Spacing.lg,
    borderRadius: BorderRadius.xs,
    backgroundColor: EDITORIAL_THEME.cardBg,
    borderColor: EDITORIAL_THEME.borderColor,
    borderWidth: 1,
    gap: Spacing.md,
  },
  moduleHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: Spacing.md,
  },
  moduleHeaderLeft: {
    flex: 1,
    gap: 4,
  },
  moduleTitle: {
    fontFamily: Platform.OS === "ios" ? "Georgia" : "serif",
    fontSize: 16,
    fontWeight: "700",
    color: EDITORIAL_THEME.textDark,
  },
  moduleDescription: {
    fontSize: 13,
    lineHeight: 18,
    color: "#5C7680",
  },
  completedBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: EDITORIAL_THEME.accentTeal,
    justifyContent: "center",
    alignItems: "center",
  },
  moduleFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: "#EDF3F5",
    paddingTop: Spacing.sm,
  },
  moduleMetadata: {
    flexDirection: "row",
    alignItems: "center",
  },
  difficultyBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.xs,
    backgroundColor: EDITORIAL_THEME.bannerBg,
    borderWidth: 1,
    borderColor: EDITORIAL_THEME.borderColor,
  },
  difficultyText: {
    fontSize: 11,
    fontWeight: "600",
    color: EDITORIAL_THEME.accentTeal,
  },
  completeButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.xs,
    borderWidth: 1,
    borderColor: EDITORIAL_THEME.borderColor,
  },
  completeButtonActive: {
    backgroundColor: EDITORIAL_THEME.bannerBg,
    borderColor: EDITORIAL_THEME.accentTeal,
  },
  completeButtonText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#7C96A0",
  },
  chatRoot: {
    flex: 1,
  },
  chatMainColumn: {
    flex: 1,
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    marginBottom: Spacing.xs,
  },
  backButtonText: {
    color: EDITORIAL_THEME.accentTeal,
    fontSize: 14,
    fontWeight: "600",
  },
  calloutCard: {
    backgroundColor: EDITORIAL_THEME.bannerBg,
    padding: Spacing.md,
    borderRadius: BorderRadius.xs,
    borderLeftWidth: 4,
    borderLeftColor: EDITORIAL_THEME.accentTeal,
    borderColor: EDITORIAL_THEME.borderColor,
    borderWidth: 1,
    marginBottom: Spacing.sm,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: 4,
  },
  calloutTitle: {
    fontFamily: Platform.OS === "ios" ? "Georgia" : "serif",
    fontSize: 15,
    fontWeight: "700",
    color: EDITORIAL_THEME.textDark,
  },
  calloutText: {
    fontSize: 13,
    lineHeight: 18,
    color: "#4A626A",
  },
  chatFlatList: {
    flex: 1,
  },
  chatListContent: {
    gap: Spacing.md,
    flexGrow: 1,
  },
  messageBubble: {
    maxWidth: "85%",
  },
  userMessage: {
    alignSelf: "flex-end",
  },
  messageContent: {
    padding: Spacing.md,
    borderRadius: BorderRadius.xs,
  },
  chatInputDock: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    borderTopWidth: 1,
  },
  chatComposerContainer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
  },
  inputFieldGrow: {
    flex: 1,
    minWidth: 0,
    backgroundColor: "#F7FAFB",
    borderRadius: BorderRadius.xs,
    borderWidth: 1,
    borderColor: EDITORIAL_THEME.borderColor,
  },
  input: {
    width: "100%",
    fontSize: 14,
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    color: EDITORIAL_THEME.textDark,
  },
  sendButton: {
    backgroundColor: EDITORIAL_THEME.accentTeal,
    borderRadius: BorderRadius.xs,
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  citationContainer: {
    marginTop: Spacing.xs,
  },
  citationHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.xs,
    backgroundColor: EDITORIAL_THEME.bannerBg,
  },
  citationHeaderText: {
    fontSize: 12,
    fontWeight: "600",
    flex: 1,
    color: EDITORIAL_THEME.accentTeal,
  },
  citationList: {
    marginTop: 4,
    borderWidth: 1,
    borderColor: EDITORIAL_THEME.borderColor,
    borderRadius: BorderRadius.xs,
    backgroundColor: EDITORIAL_THEME.cardBg,
  },
  citationItem: {
    flexDirection: "row",
    padding: Spacing.sm,
    gap: Spacing.sm,
  },
  citationBadge: {
    width: 20,
  },
  citationNumber: {
    fontSize: 12,
    fontWeight: "700",
    color: EDITORIAL_THEME.accentTeal,
  },
  citationContent: {
    flex: 1,
    gap: 2,
  },
  citationTitle: {
    fontSize: 12,
    fontWeight: "600",
    color: EDITORIAL_THEME.textDark,
  },
  citationExcerpt: {
    fontSize: 11,
    lineHeight: 15,
    color: "#5C7680",
  },
  openPdfHint: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 4,
  },
  openPdfHintText: {
    fontSize: 11,
    fontWeight: "600",
    color: EDITORIAL_THEME.accentTeal,
  },
});