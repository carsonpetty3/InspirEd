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
import { ThemedView } from "@/components/ThemedView";
import { ScreenScrollView } from "@/components/ScreenScrollView";
import { Button } from "@/components/Button";
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
import { assetToLearningModule } from "@/utils/assetConvertion"
import { openAssetPDF } from "../utils/openAsset";
import { resolveApiUrl } from "@/utils/api";
import { buildCitationPdfUrl } from "@/utils/rag";

/** Single-line body: compact like typical chat apps (line + minimal vertical padding). */
const CHAT_INPUT_LINE_HEIGHT = 20;
const CHAT_INPUT_MAX_LINES = 9;
const CHAT_INPUT_PAD_V = Spacing.xs * 2;
const CHAT_INPUT_MIN_HEIGHT = CHAT_INPUT_LINE_HEIGHT + CHAT_INPUT_PAD_V;
const CHAT_INPUT_MAX_HEIGHT =
  CHAT_INPUT_LINE_HEIGHT * CHAT_INPUT_MAX_LINES + CHAT_INPUT_PAD_V;

/** Scroll clearance below messages � must live on contentContainerStyle, not FlatList style. */
const CHAT_LIST_GAP_ABOVE_COMPOSER = Spacing.sm;

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export default function EducationScreen() {
  const { theme } = useTheme();
    const { learningModules, setLearningModules, educationChatMessages, addEducationChatMessage, readingLevel, toggleModuleComplete } =
    useAppContext();
  const navigation = useNavigation<any>();

  const [showChat, setShowChat] = useState(false);
  const [inputText, setInputText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [recommended, setRecommended] = useState<any[]>([]);
    const [loadingRecommended, setLoadingRecommended] = useState(false);
    const moduleMap = new Map(
        learningModules.map((m) => [m.id, m])
    );

  const completedCount = learningModules.filter((m) => m.completed).length;
  const totalCount = learningModules.length;
  const overallProgress = Math.round((completedCount / totalCount) * 100);

  const categories = Array.from(
    new Set(learningModules.map((m) => m.category)),
  );

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

  /** Tab-bar inset is huge vs home-indicator-only; applying it while the keyboard is up stacks empty space under the field and looks like a second keyboard. */
  const [keyboardVisible, setKeyboardVisible] = useState(false);

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

  useEffect(() => {
    if (!activeCitation) return;
    const t = setTimeout(() => setActiveCitation(null), 4500);
    return () => clearTimeout(t);
  }, [activeCitation]);

  const handleCitationChip = useCallback(
    (messageId: string, citationOneBased: number, citationCount: number) => {
      const idx = citationOneBased - 1;
      if (idx < 0 || idx >= citationCount) return;
      setActiveCitation({ messageId, index: idx });
      setCitationExpandedByMessageId((prev) => ({
        ...prev,
        [messageId]: true,
      }));
      const flatIndex = educationChatMessages.findIndex(
        (m) => m.id === messageId,
      );
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

    const searchAssets = async (text: string) => {
        if (!text.trim()) {
            setResults([]);
            return;
        }
        
        const res = await fetch(
            resolveApiUrl(`/assets/search/query?q=${encodeURIComponent(text)}`)
        );

        const data = await res.json();
        setResults(data);
    };


    const fetchRecommended = async () => {
        try {
            setLoadingRecommended(true);

            const res = await fetch(
                resolveApiUrl("/assets/recommended")
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

    const filteredRecommended = recommended.filter((item) => {
        const base = assetToLearningModule(item);
        const stored = moduleMap.get(base.id);

        return !(stored?.completed ?? false);
    }).slice(0, 3);

  if (showChat) {
    return (
      <View
        style={[
          styles.chatRoot,
          {
            paddingTop,
            backgroundColor: theme.backgroundRoot,
          },
        ]}
      >
        <View style={[styles.container, styles.chatMainColumn]}>
          <Pressable
            onPress={() => setShowChat(false)}
            style={styles.backButton}
          >
            <Icon name="chevron-back" size={24} color={theme.primary} />
            <ThemedText
              style={{ color: theme.primary, fontSize: 16, fontWeight: "600" }}
            >
              Back to Learning
            </ThemedText>
          </Pressable>

          <ThemedView
            style={[
              styles.card,
              { backgroundColor: theme.backgroundSecondary },
            ]}
          >
            <View style={styles.cardHeader}>
              <Icon name="chat" size={24} color={theme.accent} />
              <ThemedText style={styles.cardTitle}>
                AI Learning Assistant
              </ThemedText>
            </View>
            <ThemedText
              style={[styles.helperText, { color: theme.textSecondary }]}
            >
              Ask questions about pulmonary health, treatments, or any medical
              term you{"'"}d like explained.
            </ThemedText>
          </ThemedView>

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
                        ? theme.primary
                        : theme.backgroundSecondary,
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
                    <MarkdownText color={theme.text}>{msg.text}</MarkdownText>
                  )}
                </View>
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
                      { backgroundColor: theme.backgroundSecondary },
                    ]}
                  >
                    <ThemedText style={{ color: theme.textSecondary }}>
                      Thinking...
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
            onScrollToIndexFailed={({ index }) => {
              setTimeout(() => {
                flatListRef.current?.scrollToOffset({
                  offset: Math.max(0, index * 120),
                  animated: true,
                });
              }, 150);
            }}
          />

          <Animated.View
            onLayout={(e) =>
              setChatComposerDockHeight(e.nativeEvent.layout.height)
            }
            style={[
              styles.chatInputDock,
              {
                borderTopColor: theme.border,
                backgroundColor: theme.backgroundRoot,
                paddingBottom: composerDockBottomInset,
                paddingHorizontal: Spacing.lg,
              },
              animatedChatInputStyle,
            ]}
          >
            <ThemedView
              style={[
                styles.inputCard,
                styles.inputCardCompact,
                { backgroundColor: theme.backgroundSecondary },
              ]}
            >
              <View style={styles.inputFieldGrow}>
                <TextInput
                  style={[
                    styles.input,
                    {
                      color: theme.text,
                      minHeight: composerInputHeight,
                      maxHeight: CHAT_INPUT_MAX_HEIGHT,
                    },
                    Platform.OS === "android"
                      ? { includeFontPadding: false }
                      : null,
                  ]}
                  value={inputText}
                  onChangeText={handleComposerTextChange}
                  placeholder="Ask a question..."
                  placeholderTextColor={theme.textSecondary}
                  multiline
                  maxLength={500}
                  textAlignVertical="top"
                  blurOnSubmit={false}
                  underlineColorAndroid="transparent"
                  {...(Platform.OS === "ios"
                    ? ({ submitBehavior: "newline" } as const)
                    : {})}
                  scrollEnabled={
                    composerInputHeight >= CHAT_INPUT_MAX_HEIGHT - 2
                  }
                  onContentSizeChange={(e) => {
                    const h = e.nativeEvent.contentSize.height;
                    if (!Number.isFinite(h)) return;
                    if (h > CHAT_INPUT_MAX_HEIGHT + 24) return;
                    const clamped = Math.min(
                      Math.max(Math.ceil(h), CHAT_INPUT_MIN_HEIGHT),
                      CHAT_INPUT_MAX_HEIGHT,
                    );
                    setComposerInputHeight(clamped);
                  }}
                />
              </View>
              <Button
                onPress={handleAskQuestion}
                disabled={!inputText.trim() || isLoading}
                style={styles.chatSendButton}
              >
                <Icon name="send" size={20} color="white" />
              </Button>
            </ThemedView>
          </Animated.View>
        </View>

        <PdfViewerModal
          visible={pdfModal !== null}
          uri={pdfModal?.uri ?? null}
          title={pdfModal?.title}
          onClose={() => setPdfModal(null)}
        />
      </View>
    );
  }

  return (
    <ScreenScrollView>
      <View style={styles.container}>
        <SearchBar
            value={searchText}
            onChangeText={(t) => {
                setSearchText(t);
                searchAssets(t);
            }}
            placeholder="Search modules..."
            onClear={() => {
                setSearchText("");
                setResults([]);
            }}
        />

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
                        openAssetPDF(item.title, resolveApiUrl(item.file_path))
                    }
                    onToggleComplete={toggleModuleComplete}
                />
            );
        })}
        
        <View style={styles.actionButtons}>
          <Button onPress={() => setShowChat(true)} style={{ flex: 1 }}>
            <Icon name="chat" size={20} color="white" />
            Ask AI
          </Button>

          <Pressable
            onPress={() => navigation.navigate("VideoLibrary")}
            style={[styles.exploreButton, { borderColor: theme.primary }]}
          >
            <Icon name="videocam" size={18} color={theme.primary} />
            <ThemedText style={{ color: theme.primary, fontWeight: "600" }}>
              Explore Videos
            </ThemedText>
          </Pressable>
        </View>

        <View style={styles.categorySection}>
            <ThemedText style={styles.categoryTitle}>
                Recommended for You
            </ThemedText>

            {loadingRecommended ? (
                <ThemedText style={{ color: theme.textSecondary }}>
                    Loading...
                </ThemedText>
            ) : filteredRecommended.length === 0 ? (
                <ThemedText style={{ color: theme.textSecondary }}>
                    No recommendations yet
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
                                    resolveApiUrl(item.file_path)
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
  );
}

function paragraphNeedsBlockMarkdown(p: string): boolean {
  return /^\s*[-*]\s/m.test(p) || /^\s*\d+[.)]\s/m.test(p);
}

/** Matches `[1]` or `[1, 2]` (comma-separated indices in one bracket group). */
const CITATION_BRACKET_SPLIT_RE = /(\[(?:\d+(?:\s*,\s*\d+)*)\])/g;

function paragraphHasCitationBrackets(p: string): boolean {
  return /\[(?:\d+(?:\s*,\s*\d+)*)\]/.test(p);
}

function CitationChipText({
  n,
  theme,
  citationCount,
  onCitationChip,
}: {
  n: number;
  theme: { text: string; primary: string; textSecondary: string };
  citationCount: number;
  onCitationChip: (n: number) => void;
}) {
  const valid = n >= 1 && n <= citationCount;
  return (
    <Text
      onPress={valid ? () => onCitationChip(n) : undefined}
      style={{
        color: valid ? theme.primary : theme.textSecondary,
        fontWeight: "700",
        fontSize: 15,
        lineHeight: 22,
        ...(valid ? { textDecorationLine: "underline" as const } : {}),
      }}
    >
      [{n}]
    </Text>
  );
}

function renderInlineCitationChildren(
  segment: string,
  theme: { text: string; primary: string; textSecondary: string },
  citationCount: number,
  onCitationChip: (n: number) => void,
): React.ReactNode {
  const parts = segment
    .split(CITATION_BRACKET_SPLIT_RE)
    .filter((x) => x.length > 0);
  const isBracketToken = (s: string) =>
    /^\[(?:\d+(?:\s*,\s*\d+)*)\]$/.test(s.trim());

  return parts.map((p, i) => {
    if (isBracketToken(p)) {
      const nums =
        p
          .slice(1, -1)
          .match(/\d+/g)
          ?.map((x) => parseInt(x, 10)) ?? [];
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
                  <Text
                    key={`${i}-sep-${ni}`}
                    style={{
                      fontSize: 15,
                      lineHeight: 22,
                      color: theme.text,
                    }}
                  >
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
              { fontSize: 15, lineHeight: 22, color: theme.text },
              seg.bold && { fontWeight: "700" as const },
              seg.italic && { fontStyle: "italic" as const },
            ]}
          >
            {seg.text}
          </Text>
        ))}
      </Text>
    );
  });
}

function ParagraphInlineCitations({
  para,
  theme,
  citationCount,
  onCitationChip,
}: {
  para: string;
  theme: { text: string; primary: string; textSecondary: string };
  citationCount: number;
  onCitationChip: (n: number) => void;
}) {
  return (
    <Text
      style={{
        fontSize: 15,
        lineHeight: 22,
        color: theme.text,
        marginBottom: Spacing.sm,
      }}
    >
      {renderInlineCitationChildren(
        para,
        theme,
        citationCount,
        onCitationChip,
      )}
    </Text>
  );
}

const LIST_LINE_PREFIX_RE = /^(\s*(?:[-*]\s+|\d+[.)]\s+))(.*)$/;

function ListParagraphWithCitations({
  para,
  theme,
  citationCount,
  onCitationChip,
}: {
  para: string;
  theme: { text: string; primary: string; textSecondary: string };
  citationCount: number;
  onCitationChip: (n: number) => void;
}) {
  const lines = para.split("\n");
  return (
    <View style={{ marginBottom: Spacing.sm }}>
      {lines.map((line, li) => {
        const m = line.match(LIST_LINE_PREFIX_RE);
        const prefix = m ? m[1] : "";
        const body = m ? m[2] : line;
        return (
          <Text
            key={li}
            style={{
              fontSize: 15,
              lineHeight: 22,
              color: theme.text,
              marginBottom: li < lines.length - 1 ? Spacing.xs : 0,
            }}
          >
            {prefix ? (
              <Text
                style={{
                  fontSize: 15,
                  lineHeight: 22,
                  color: theme.text,
                }}
              >
                {prefix}
              </Text>
            ) : null}
            {renderInlineCitationChildren(
              body,
              theme,
              citationCount,
              onCitationChip,
            )}
          </Text>
        );
      })}
    </View>
  );
}

function AssistantMessageWithCitations({
  text,
  citations,
  theme,
  onCitationChip,
}: {
  text: string;
  citations: Citation[];
  theme: { text: string; primary: string; textSecondary: string };
  onCitationChip: (n: number) => void;
}) {
  const paragraphs = text.split(/\n\n/).filter((p) => p.length > 0);
  return (
    <View>
      {paragraphs.map((para, i) => {
        const blockMd = paragraphNeedsBlockMarkdown(para);
        const hasCit = paragraphHasCitationBrackets(para);
        const paraGap =
          i < paragraphs.length - 1 ? { marginBottom: Spacing.sm } : undefined;

        if (blockMd && hasCit) {
          return (
            <ListParagraphWithCitations
              key={i}
              para={para}
              theme={theme}
              citationCount={citations.length}
              onCitationChip={onCitationChip}
            />
          );
        }

        if (blockMd) {
          return (
            <View key={i} style={paraGap}>
              <MarkdownText color={theme.text}>{para}</MarkdownText>
            </View>
          );
        }

        if (!hasCit) {
          return (
            <View key={i} style={paraGap}>
              <MarkdownText color={theme.text}>{para}</MarkdownText>
            </View>
          );
        }

        return (
          <ParagraphInlineCitations
            key={i}
            para={para}
            theme={theme}
            citationCount={citations.length}
            onCitationChip={onCitationChip}
          />
        );
      })}
    </View>
  );
}

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
  const { theme } = useTheme();

  if (citations.length === 0) return null;

  return (
    <View style={styles.citationContainer}>
      <Pressable
        onPress={() => onExpandedChange(!expanded)}
        style={[
          styles.citationHeader,
          { backgroundColor: theme.primary + "15" },
        ]}
      >
        <Icon name="document-text" size={14} color={theme.primary} />
        <ThemedText
          style={[styles.citationHeaderText, { color: theme.primary }]}
        >
          {citations.length} source{citations.length > 1 ? "s" : ""} referenced
        </ThemedText>
        <Icon
          name={expanded ? "chevron-up" : "chevron-down"}
          size={14}
          color={theme.primary}
        />
      </Pressable>

      {expanded ? (
        <View
          style={[styles.citationList, { borderColor: theme.primary + "30" }]}
        >
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
                    borderBottomColor: theme.border,
                    borderBottomWidth: 1,
                  },
                  isHighlighted && { backgroundColor: theme.primary + "20" },
                ]}
              >
                <View style={styles.citationBadge}>
                  <ThemedText
                    style={[styles.citationNumber, { color: theme.primary }]}
                  >
                    [{index + 1}]
                  </ThemedText>
                </View>
                <View style={styles.citationContent}>
                  <ThemedText
                    style={[styles.citationTitle, { color: theme.text }]}
                  >
                    {citation.sourceTitle}
                  </ThemedText>
                  <ThemedText
                    style={[
                      styles.citationExcerpt,
                      { color: theme.textSecondary },
                    ]}
                  >
                    {citation.excerpt}
                  </ThemedText>
                  <ThemedText
                    style={[styles.citationRelevance, { color: theme.primary }]}
                  >
                    {citation.similarity}% relevance match
                  </ThemedText>
                  {pdfUrl ? (
                    <View style={styles.openPdfHint}>
                      <Icon name="document" size={14} color={theme.primary} />
                      <ThemedText
                        style={{
                          color: theme.primary,
                          fontSize: 11,
                          fontWeight: "600",
                        }}
                      >
                        Tap to open PDF
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

function ModuleCard({ module, onPress, onToggleComplete }: { module: LearningModule; onPress: () => void; onToggleComplete: (id: string) => void; }) {
  const { theme } = useTheme();
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const getDifficultyColor = (difficulty: string) => {
    if (difficulty === "Beginner") return theme.success;
    if (difficulty === "Intermediate") return theme.warning;
    return theme.error;
  };

  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={() => {
        scale.value = withSpring(0.98);
      }}
      onPressOut={() => {
        scale.value = withSpring(1);
      }}
      style={[
        animatedStyle,
        styles.moduleCard,
        {
          backgroundColor: theme.backgroundSecondary,
          borderColor: theme.border,
        },
      ]}
    >
      <View style={styles.moduleHeader}>
        <View style={styles.moduleHeaderLeft}>
          <ThemedText style={styles.moduleTitle}>{module.title}</ThemedText>
          <ThemedText
            style={[styles.moduleDescription, { color: theme.textSecondary }]}
          >
            {module.description}
          </ThemedText>
        </View>
        {module.completed && (
          <View
            style={[styles.completedBadge, { backgroundColor: theme.success }]}
          >
            <Icon name="check" size={16} color="white" />
          </View>
        )}
      </View>

      <View style={styles.moduleFooter}>
        <View style={styles.moduleMetadata}>
          <View
            style={[
              styles.difficultyBadge,
              { backgroundColor: getDifficultyColor(module.difficulty) + "20" },
            ]}
          >
            <ThemedText
              style={[
                styles.difficultyText,
                { color: getDifficultyColor(module.difficulty) },
              ]}
            >
              {module.difficulty}
            </ThemedText>
          </View>
        </View>
        {module.progress > 0 && !module.completed && (
          <View style={styles.progressContainer}>
            <View
              style={[
                styles.miniProgressBar,
                { backgroundColor: theme.backgroundDefault },
              ]}
            >
              <View
                style={[
                  styles.miniProgressFill,
                  {
                    backgroundColor: theme.primary,
                    width: `${module.progress}%`,
                  },
                ]}
              />
            </View>
            <ThemedText
              style={[styles.progressText, { color: theme.textSecondary }]}
            >
              {module.progress}%
            </ThemedText>
          </View>
        )}
          </View>

          <View style={styles.completeContainer}>
              <Pressable
                  onPress={() => onToggleComplete(module.id)}
                  style={[
                      styles.completeButton,
                      {
                          borderColor: module.completed ? theme.success : theme.border,
                          backgroundColor: module.completed ? theme.success + "20" : "transparent",
                      },
                  ]}
              >
                  <Icon
                      name={module.completed ? "checkmark-circle" : "circle"}
                      size={18}
                      color={module.completed ? theme.success : theme.textSecondary}
                  />
                  <ThemedText
                      style={{
                          color: module.completed ? theme.success : theme.textSecondary,
                          fontWeight: "600",
                      }}
                  >
                      {module.completed ? "Completed" : "Mark Complete"}
                  </ThemedText>
              </Pressable>
          </View>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: Spacing.lg,
    gap: Spacing.lg,
  },
  actionButtons: {
    flexDirection: "row",
    gap: Spacing.md,
    alignItems: "center",
  },
  exploreButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.md,
    borderWidth: 2,
  },
  progressCard: {
    padding: Spacing.xl,
    borderRadius: BorderRadius.lg,
    gap: Spacing.md,
  },
  progressTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "white",
  },
  progressStats: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: Spacing.sm,
  },
  progressNumber: {
    fontSize: 48,
    fontWeight: "700",
    color: "white",
    lineHeight: 56,
  },
  progressLabel: {
    fontSize: 16,
    color: "rgba(255,255,255,0.9)",
  },
  progressBar: {
    height: 8,
    borderRadius: 4,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 4,
  },
  categorySection: {
    gap: Spacing.md,
  },
  categoryTitle: {
    fontSize: 20,
    fontWeight: "700",
  },
  moduleCard: {
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
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
    gap: Spacing.xs,
  },
  moduleTitle: {
    fontSize: 16,
    fontWeight: "600",
  },
  moduleDescription: {
    fontSize: 14,
    lineHeight: 20,
  },
  completedBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  moduleFooter: {
    gap: Spacing.sm,
  },
  moduleMetadata: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
    completeContainer: {
        marginTop: Spacing.sm,
    },

    completeButton: {
        flexDirection: "row",
        alignItems: "center",
        gap: Spacing.sm,
        paddingVertical: Spacing.sm,
        paddingHorizontal: Spacing.md,
        borderRadius: BorderRadius.sm,
        borderWidth: 1,
    },
  difficultyBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.xs,
  },
  difficultyText: {
    fontSize: 12,
    fontWeight: "600",
  },
  durationContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  durationText: {
    fontSize: 12,
  },
  progressContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  miniProgressBar: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    overflow: "hidden",
  },
  miniProgressFill: {
    height: "100%",
    borderRadius: 2,
  },
  progressText: {
    fontSize: 12,
    fontWeight: "600",
    width: 35,
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  card: {
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
    gap: Spacing.md,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "700",
  },
  helperText: {
    fontSize: 14,
    lineHeight: 20,
  },
  chatMessages: {
    gap: Spacing.md,
  },
  chatRoot: {
    flex: 1,
  },
  /** Lets FlatList flex fill space between header card and input (otherwise list height is 0). */
  chatMainColumn: {
    flex: 1,
  },
  chatFlatList: {
    flex: 1,
  },
  chatInputDock: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  chatListContent: {
    gap: Spacing.md,
    flexGrow: 1,
  },
  messageBubble: {
    maxWidth: "80%",
  },
  userMessage: {
    alignSelf: "flex-end",
  },
  messageContent: {
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  inputCard: {
    borderRadius: BorderRadius.md,
    flexDirection: "row",
    alignItems: "flex-end",
    width: "100%",
  },
  /** Lets multiline TextInput wrap and grow inside a row (`minWidth: 0` / flex quirk). */
  inputFieldGrow: {
    flex: 1,
    minWidth: 0,
  },
  /** Shorter composer bar so less of the thread is obscured. */
  inputCardCompact: {
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.md,
    gap: Spacing.sm,
  },
  chatSendButton: {
    width: 44,
    height: 44,
    minHeight: 44,
    paddingHorizontal: 0,
    borderRadius: 22,
  },
  input: {
    width: "100%",
    fontSize: 15,
    lineHeight: CHAT_INPUT_LINE_HEIGHT,
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
  },
  citationContainer: {
    marginTop: Spacing.sm,
  },
  citationHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.sm,
  },
  citationHeaderText: {
    fontSize: 12,
    fontWeight: "600",
    flex: 1,
  },
  citationList: {
    marginTop: Spacing.xs,
    borderWidth: 1,
    borderRadius: BorderRadius.sm,
    overflow: "hidden",
  },
  citationItem: {
    flexDirection: "row",
    padding: Spacing.sm,
    gap: Spacing.sm,
  },
  citationBadge: {
    width: 24,
  },
  citationNumber: {
    fontSize: 12,
    fontWeight: "700",
  },
  citationContent: {
    flex: 1,
    gap: Spacing.xs,
  },
  citationTitle: {
    fontSize: 13,
    fontWeight: "600",
  },
  citationExcerpt: {
    fontSize: 11,
    lineHeight: 16,
  },
  citationRelevance: {
    fontSize: 10,
    fontWeight: "500",
  },
  openPdfHint: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: Spacing.xs,
  },
  searchResults: {
      marginTop: 8,
      gap: 12, 
  },
  searchItem: {
      padding: 12,
      borderBottomWidth: 1,
      borderBottomColor: "#eee",
  }
});
