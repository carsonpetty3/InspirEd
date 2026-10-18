import React, { useState, useEffect, useCallback } from "react";
import { View, StyleSheet, Pressable, ActivityIndicator, RefreshControl } from "react-native";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { ScreenScrollView } from "@/components/ScreenScrollView";
import { Icon } from "@/components/Icon";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius } from "@/constants/theme";
import { useAppContext } from "@/context/AppContext";
import { useNavigation } from "@react-navigation/native";
import { fetchEducationalVideos, EducationalVideo } from "@/utils/googleDrive";
import { fetchDatabaseVideos } from "@/utils/videoAssets";
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from "react-native-reanimated";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export default function VideoLibraryScreen() {
  const { theme } = useTheme();
  const navigation = useNavigation<any>();
  const { getVideoWatchProgress } = useAppContext();

  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [videos, setVideos] = useState<EducationalVideo[]>([]);

  const loadVideos = useCallback(async () => {
    try {
      setError(null);

      const [driveVideos, dbVideos] = await Promise.all([
        fetchEducationalVideos().catch(() => [] as EducationalVideo[]),
        fetchDatabaseVideos().catch(() => [] as EducationalVideo[]),
      ]);

      const byId = new Map<string, EducationalVideo>();
      for (const video of [...driveVideos, ...dbVideos]) {
        if (!byId.has(video.id)) {
          byId.set(video.id, video);
        }
      }

      setVideos(Array.from(byId.values()));
    } catch (err) {
      console.error("Error fetching videos:", err);
      setError(err instanceof Error ? err.message : "Failed to load videos");
      setVideos([]);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadVideos();
  }, [loadVideos]);

  const onRefresh = () => {
    setIsRefreshing(true);
    loadVideos();
  };

  const openVideo = (video: EducationalVideo) => {
    const isLms = video.id.startsWith("lms:");
    navigation.navigate("VideoPlayer", {
      videoId: video.id,
      title: video.title,
      sourceUri: video.videoUrl,
      sourceType: isLms ? "url" : "drive",
      description: video.description,
      duration: video.duration,
      video: isLms ? undefined : video,
    });
  };

  const completedCount = videos.filter(
    (v) => getVideoWatchProgress(v.id) >= 90
  ).length;

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={theme.primary} />
        <ThemedText style={[styles.loadingText, { color: theme.textSecondary }]}>
          Loading videos…
        </ThemedText>
      </View>
    );
  }

  return (
    <ScreenScrollView
      refreshControl={
        <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />
      }
    >
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
              <ThemedText style={styles.statNumber}>{videos.length}</ThemedText>
              <ThemedText style={styles.statLabel}>Videos</ThemedText>
            </View>
            <View style={[styles.statDivider, { backgroundColor: "rgba(255,255,255,0.3)" }]} />
            <View style={styles.statItem}>
              <ThemedText style={styles.statNumber}>{completedCount}</ThemedText>
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

        {error ? (
          <ThemedText style={[styles.errorText, { color: theme.textSecondary }]}>
            {error}
          </ThemedText>
        ) : null}

        <View style={styles.categorySection}>
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
          ) : (
            videos.map((video) => (
              <VideoCard
                key={video.id}
                video={video}
                watchProgress={getVideoWatchProgress(video.id)}
                onPress={() => openVideo(video)}
              />
            ))
          )}
        </View>
      </View>
    </ScreenScrollView>
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
  const lessonLabel = video.category || video.description;

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
        {video.duration ? (
          <View style={[styles.durationBadge, { backgroundColor: "rgba(0,0,0,0.7)" }]}>
            <ThemedText style={styles.durationText}>{video.duration}</ThemedText>
          </View>
        ) : null}
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

        {lessonLabel ? (
          <ThemedText
            style={[styles.videoDescription, { color: theme.textSecondary }]}
            numberOfLines={2}
          >
            {lessonLabel}
          </ThemedText>
        ) : null}

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
  durationText: {
    fontSize: 12,
    color: "#fff",
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
  progressContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
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
  progressText: {
    fontSize: 12,
    fontWeight: "600",
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
});
