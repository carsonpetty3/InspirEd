import React, { useState, useEffect, useCallback } from "react";
import { View, StyleSheet, Pressable, ActivityIndicator, RefreshControl } from "react-native";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { ScreenScrollView } from "@/components/ScreenScrollView";
import { Icon } from "@/components/Icon";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius } from "@/constants/theme";
import { useAppContext, CachedVideo } from "@/context/AppContext";
import { useNavigation } from "@react-navigation/native";
import { fetchEducationalVideos, getVideoCategories, EducationalVideo } from "@/utils/googleDrive";
import { assetToLearningModule } from "@/utils/assetConvertion"
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from "react-native-reanimated";
import { LearningModule } from "@/context/AppContext";
import { openAssetPDF } from "../utils/openAsset";
import { resolveApiUrl } from "@/utils/api";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export default function VideoLibraryScreen() {
  const { theme } = useTheme();
  const navigation = useNavigation<any>();
    const { learningModules, setLearningModules, toggleModuleComplete, cachedVideos, setCachedVideos, getVideoWatchProgress } = useAppContext();

  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
    const [videos, setVideos] = useState<any[]>([]);
    const [loadingVideos, setLoadingVideos] = useState(false);
    const moduleMap = new Map(
        learningModules.map((m) => [m.id, m])
    );


  

  

    const fetchVideos = async () => {
        try {
            setLoadingVideos(true);

            const res = await fetch(
                resolveApiUrl(`/assets/search/query?q=Animation`)
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

            setVideos(data);

        } catch (err) {
            console.error("Error fetching videos:", err);
        } finally {
            setLoadingVideos(false);
        }
    };

    useEffect(() => {
        fetchVideos();
    }, []);

    const completedModulesCount = videos.filter((item) => {
        const base = assetToLearningModule(item);
        const stored = moduleMap.get(base.id);

        return stored?.completed ?? false;
    }).length;

    const totalModulesCount = videos.length;


  return (
    <ScreenScrollView>
      <View style={styles.container}>
        <ThemedView
          style={[
            styles.progressCard,
            {
              backgroundColor: theme.accent,
            },
          ]}
        >
          <ThemedText style={styles.progressTitle}>Video Library</ThemedText>
          <View style={styles.progressStats}>
            <View style={styles.statItem}>
              <ThemedText style={styles.statNumber}>{totalModulesCount}</ThemedText>
              <ThemedText style={styles.statLabel}>Videos</ThemedText>
            </View>
            <View style={[styles.statDivider, { backgroundColor: "rgba(255,255,255,0.3)" }]} />
            <View style={styles.statItem}>
              <ThemedText style={styles.statNumber}>{completedModulesCount}</ThemedText>
              <ThemedText style={styles.statLabel}>Completed</ThemedText>
            </View>
          </View>
        </ThemedView>

        <ThemedView style={[styles.infoCard, { backgroundColor: theme.backgroundSecondary }]}>
          <Icon name="information-circle" size={20} color={theme.primary} />
          <ThemedText style={[styles.infoText, { color: theme.textSecondary }]}>
            These videos are curated by medical professionals to help you understand your child's condition.
          </ThemedText>
        </ThemedView>


        <View style={styles.categorySection}>

            {loadingVideos ? (
                <ThemedText style={{ color: theme.textSecondary }}>
                    Loading...
                </ThemedText>
            ) : videos.length === 0 ? (
                <ThemedText style={{ color: theme.textSecondary }}>
                    No recommendations yet
                </ThemedText>
            ) : (
                videos.map((item) => {
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
        

        {videos.length === 0 ? (
          <ThemedView style={[styles.emptyCard, { backgroundColor: theme.backgroundSecondary }]}>
            <Icon name="videocam-off" size={48} color={theme.textSecondary} />
            <ThemedText style={[styles.emptyTitle, { color: theme.text }]}>
              No Videos Available
            </ThemedText>
            <ThemedText style={[styles.emptyText, { color: theme.textSecondary }]}>
              Educational videos will appear here once they are added by your healthcare provider.
            </ThemedText>
          </ThemedView>
        ) : null}
      </View>
    </ScreenScrollView>
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

function VideoCard({
  video,
  watchProgress,
  onPress,
}: {
  video: EducationalVideo;
  watchProgress: number;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const isCompleted = watchProgress >= 90;
  const isStarted = watchProgress > 0 && !isCompleted;

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
        styles.videoCard,
        {
          backgroundColor: theme.backgroundSecondary,
          borderColor: theme.border,
        },
      ]}
    >
      <View style={[styles.thumbnailContainer, { backgroundColor: theme.primary + "20" }]}>
        <Icon name="play-circle" size={40} color={theme.primary} />
        <View style={[styles.durationBadge, { backgroundColor: "rgba(0,0,0,0.7)" }]}>
          <ThemedText style={styles.durationText}>{video.duration}</ThemedText>
        </View>
      </View>

      <View style={styles.videoContent}>
        <View style={styles.videoHeader}>
          <ThemedText style={styles.videoTitle} numberOfLines={2}>
            {video.title}
          </ThemedText>
          {isCompleted ? (
            <View style={[styles.statusBadge, { backgroundColor: theme.success }]}>
              <Icon name="checkmark" size={14} color="white" />
            </View>
          ) : null}
        </View>

        <ThemedText
          style={[styles.videoDescription, { color: theme.textSecondary }]}
          numberOfLines={2}
        >
          {video.description}
        </ThemedText>

        {isStarted ? (
          <View style={styles.progressContainer}>
            <View style={[styles.progressBar, { backgroundColor: theme.border }]}>
              <View
                style={[
                  styles.progressFill,
                  {
                    backgroundColor: theme.primary,
                    width: `${watchProgress}%`,
                  },
                ]}
              />
            </View>
            <ThemedText style={[styles.progressText, { color: theme.textSecondary }]}>
              {watchProgress}% watched
            </ThemedText>
          </View>
        ) : null}
      </View>

      <Icon name="chevron-forward" size={20} color={theme.textSecondary} />
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: Spacing.lg,
    gap: Spacing.lg,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: Spacing.lg,
    padding: Spacing.xl,
  },
  loadingText: {
    fontSize: 16,
  },
  errorText: {
    fontSize: 16,
    textAlign: "center",
    marginTop: Spacing.md,
  },
  retryButton: {
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.full,
    marginTop: Spacing.md,
  },
  retryButtonText: {
    color: "white",
    fontWeight: "600",
    fontSize: 16,
  },
  progressCard: {
    padding: Spacing.xl,
    borderRadius: BorderRadius.lg,
    gap: Spacing.lg,
  },
  progressTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "white",
  },
  progressStats: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
  },
  statItem: {
    alignItems: "center",
    gap: Spacing.xs,
  },
  statNumber: {
    fontSize: 28,
    fontWeight: "700",
    color: "white",
  },
  statLabel: {
    fontSize: 12,
    color: "rgba(255,255,255,0.9)",
  },
  statDivider: {
    width: 1,
    height: 40,
  },
  infoCard: {
    flexDirection: "row",
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    gap: Spacing.sm,
    alignItems: "flex-start",
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
  categorySection: {
    gap: Spacing.md,
  },
  categoryTitle: {
    fontSize: 18,
    fontWeight: "700",
  },
  videoCard: {
    flexDirection: "row",
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    gap: Spacing.md,
    alignItems: "center",
  },
  thumbnailContainer: {
    width: 80,
    height: 60,
    borderRadius: BorderRadius.sm,
    justifyContent: "center",
    alignItems: "center",
    position: "relative",
  },
  durationBadge: {
    position: "absolute",
    bottom: 4,
    right: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  videoContent: {
    flex: 1,
    gap: Spacing.xs,
  },
  videoHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: Spacing.sm,
  },
  videoTitle: {
    fontSize: 15,
    fontWeight: "600",
    flex: 1,
  },
  statusBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: "center",
    alignItems: "center",
  },
  videoDescription: {
    fontSize: 13,
    lineHeight: 18,
  },
  progressBar: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 2,
  },
  emptyCard: {
    padding: Spacing.xl,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    gap: Spacing.md,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "600",
  },
  emptyText: {
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
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
});
