import React, { useState, useEffect } from "react";
import {
  View,
  StyleSheet,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { ThemedText } from "@/components/ThemedText";
import { Icon } from "@/components/Icon";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius } from "@/constants/theme";
import { useAppContext, VideoWatchRecord } from "@/context/AppContext";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { EducationalVideo, getVideoStreamUrl } from "@/utils/googleDrive";
import { getLocalVideoSource } from "@/utils/videoAssets";
import { useEventListener } from "expo";
import { useVideoPlayer, VideoView } from "expo-video";

type VideoPlayerParams = {
  VideoPlayer: {
    videoId: string;
    video?: EducationalVideo;
    title?: string;
    sourceUri?: string;
    sourceType?: "local" | "drive" | "url";
    description?: string;
    duration?: string;
  };
};

/** 
 * function that decides where the video is coming from (i.e. url, local file, Google Drive)
 * returns a playable address
*/  

async function resolveVideoUri(params: VideoPlayerParams["VideoPlayer"]): Promise<string> {
  const sourceType = params.sourceType;
  const sourceUri = (params.sourceUri || params.video?.videoUrl || "").trim();
  const videoId = params.videoId || params.video?.id || "";

  if (sourceType === "url" && sourceUri) {
    return sourceUri;
  }

  if (sourceType === "local") {
    const local = getLocalVideoSource(videoId);
    if (local?.uri) return local.uri;
    if (sourceUri) return sourceUri;
  }

  if (sourceType === "drive" || params.video) {
    const driveUrl = await getVideoStreamUrl(videoId);
    if (driveUrl?.trim()) return driveUrl.trim();
    if (sourceUri) return sourceUri;
  }

  if (sourceUri) return sourceUri;

  const fallback = await getVideoStreamUrl(videoId);
  if (fallback?.trim()) return fallback.trim();

  throw new Error("Video source is not available.");
}


/** 
 * working on this: a new component using expo-video with 
 * built-in controls and fullscreen turned on
*/


function InlineVideoPlayer({
  uri,
  videoId,
  title,
  description,
}: {
  uri: string;
  videoId: string;
  title: string;
  description: string;
}) {
  const { theme } = useTheme();
  const { addVideoWatchRecord, getVideoWatchProgress } = useAppContext();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const player = useVideoPlayer({ uri }, (p) => {
    p.loop = false;
    p.timeUpdateEventInterval = 1;
  });

  useEventListener(player, "statusChange", ({ status, error: statusError }) => {
    if (status === "readyToPlay") {
      setIsLoading(false);
      setError(null);
    }
    if (status === "error") {
      setIsLoading(false);
      setError("Unable to play this video. Please try again later.");
      console.error("Video error:", statusError);
    }
  });

  useEventListener(player, "playToEnd", () => {
    const record: VideoWatchRecord = {
      videoId,
      watchedAt: new Date(),
      completedPercent: 100,
    };
    addVideoWatchRecord(record);
  });

  useEventListener(player, "timeUpdate", ({ currentTime }) => {
    const durationSec = player.duration || 0;
    if (durationSec <= 0) return;
    const completedPercent = Math.round((currentTime / durationSec) * 100);
    if (completedPercent > 0 && completedPercent % 10 === 0) {
      addVideoWatchRecord({
        videoId,
        watchedAt: new Date(),
        completedPercent: Math.max(completedPercent, getVideoWatchProgress(videoId)),
      });
    }
  });

  if (error) {
    return (
      <View style={styles.playerErrorBox}>
        <Icon name="videocam-off" size={48} color={theme.textSecondary} />
        <ThemedText style={{ color: theme.textSecondary, textAlign: "center" }}>
          {error}
        </ThemedText>
      </View>
    );
  }

  return (
    <View style={styles.playerSection}>
      <View style={styles.videoFrame}>
        <VideoView
          player={player}
          style={styles.video}
          contentFit="contain"
          nativeControls
          fullscreenOptions={{ enable: true }}
          onFirstFrameRender={() => setIsLoading(false)}
        />
        {isLoading ? (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color="#fff" />
            <ThemedText style={styles.loadingOverlayText}>Loading video…</ThemedText>
          </View>
        ) : null}
      </View>
      <View style={styles.metaBlock}>
        <ThemedText style={[styles.metaTitle, { color: theme.text }]}>{title}</ThemedText>
        {description ? (
          <ThemedText style={{ color: theme.textSecondary, lineHeight: 20 }}>
            {description}
          </ThemedText>
        ) : null}
      </View>
    </View>
  );
}

export default function VideoPlayerScreen() {
  const { theme } = useTheme();
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<VideoPlayerParams, "VideoPlayer">>();
  const insets = useSafeAreaInsets();
  const params = route.params;

  const title = params.video?.title || params.title || "Video";
  const description = params.video?.description || params.description || "";
  const videoId = params.video?.id || params.videoId || "unknown";

  const [resolvedUri, setResolvedUri] = useState<string | null>(null);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [isResolving, setIsResolving] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setIsResolving(true);
    setResolveError(null);
    setResolvedUri(null);

    resolveVideoUri(params)
      .then((uri) => {
        if (!cancelled) {
          setResolvedUri(uri);
          setIsResolving(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setResolveError(
            err instanceof Error ? err.message : "Unable to load video."
          );
          setIsResolving(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [params.videoId, params.sourceUri, params.sourceType, params.video?.id, params.video?.videoUrl]);

  return (
    <View
      style={[
        styles.container,
        {
          paddingTop: insets.top,
          backgroundColor: theme.backgroundRoot,
        },
      ]}
    >
      <View style={styles.header}>
        <Pressable
          onPress={() => navigation.goBack()}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Icon name="chevron-back" size={28} color={theme.text} />
        </Pressable>
        <ThemedText style={[styles.headerTitle, { color: theme.text }]} numberOfLines={1}>
          {title}
        </ThemedText>
        <View style={{ width: 40 }} />
      </View>

      {isResolving ? (
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color={theme.primary} />
          <ThemedText style={{ color: theme.textSecondary, marginTop: Spacing.md }}>
            Loading video…
          </ThemedText>
        </View>
      ) : resolveError || !resolvedUri ? (
        <View style={styles.centerState}>
          <Icon name="videocam-off" size={64} color={theme.textSecondary} />
          <ThemedText style={{ color: theme.textSecondary, textAlign: "center" }}>
            {resolveError || "Video source is not available."}
          </ThemedText>
          <Pressable
            onPress={() => navigation.goBack()}
            style={[styles.retryButton, { backgroundColor: theme.primary }]}
          >
            <ThemedText style={styles.retryButtonText}>Go Back</ThemedText>
          </Pressable>
        </View>
      ) : (
        <InlineVideoPlayer
          uri={resolvedUri}
          videoId={videoId}
          title={title}
          description={description}
        />
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
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center",
    marginHorizontal: Spacing.md,
  },
  centerState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: Spacing.md,
    padding: Spacing.xl,
  },
  playerSection: {
    flex: 1,
  },
  videoFrame: {
    width: "100%",
    aspectRatio: 16 / 9,
    backgroundColor: "#000",
  },
  video: {
    width: "100%",
    height: "100%",
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFill,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  loadingOverlayText: {
    color: "#fff",
    marginTop: Spacing.md,
  },
  playerErrorBox: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: Spacing.md,
    padding: Spacing.xl,
  },
  metaBlock: {
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  metaTitle: {
    fontSize: 18,
    fontWeight: "700",
  },
  retryButton: {
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.full,
    marginTop: Spacing.md,
  },
  retryButtonText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 16,
  },
});
