import { Platform } from "react-native";
import { getRagApiBaseUrl } from "@/utils/rag";
import { EducationalVideo } from "@/utils/googleDrive";

/**
 * VIDEO URL CONFIGURATION
 *
 * To use your own educational videos:
 * 1. Upload your video to a hosting service (YouTube, Vimeo, Google Drive, etc.)
 * 2. Get the direct video URL (for Google Drive: use the format below)
 * 3. Replace the placeholder URL with your actual video URL
 *
 * Google Drive format: https://drive.google.com/uc?export=download&id=YOUR_FILE_ID
 * YouTube won't work directly - you need a direct MP4 URL
 *
 * For now, placeholder videos are used so the feature works during development.
 */
const videoUrls: { [key: string]: string } = {
  // Your Lungs' Secret Helper video from Google Drive
  "surfactant-intro-video": "https://drive.google.com/uc?export=download&id=1XXlILsl-askIsK0IJaLbNRlhRsjXIZOS",
};

export function getLocalVideoSource(videoId: string): { uri: string } | null {
  const videoUrl = videoUrls[videoId];
  if (videoUrl) {
    console.log(`[VideoAssets] Using video URL for ${videoId} on ${Platform.OS}`);
    return { uri: videoUrl };
  }
  console.log(`[VideoAssets] No video source found for ${videoId}`);
  return null;
}

export function isLocalVideoAvailable(videoId: string): boolean {
  return videoId in videoUrls;
}

type LmsModule = {
  module_id: number;
  lessons: {
    lesson_id: string;
    assets: {
      title?: string;
      content_type?: string;
      file_path?: string | null;
    }[];
  }[];
};

/**
 * Flatten LMS module assets into library video rows (mp4/mov only).
 * loops through the modules/lessons/asset keeps on the .mp4 and .mov
 * it turns into a video entry so it can be accessible on the Explore Video Section
 */
export async function fetchDatabaseVideos(): Promise<EducationalVideo[]> {
  const base = getRagApiBaseUrl();
  if (!base) return [];

  try {
    const res = await fetch(`${base}/api/lms/modules`);
    if (!res.ok) return [];

    const modules: LmsModule[] = await res.json();
    if (!Array.isArray(modules)) return [];

    const videos: EducationalVideo[] = [];
    let order = 0;

    for (const mod of modules) {
      for (const lesson of mod.lessons || []) {
        for (const asset of lesson.assets || []) {
          const path = String(asset.file_path || "");
          const lower = path.toLowerCase();
          if (!lower.endsWith(".mp4") && !lower.endsWith(".mov")) continue;

          const lessonLabel = `Lesson ${lesson.lesson_id}`;
          videos.push({
            id: `lms:${path}`,
            title: asset.title || "Untitled video",
            description: lessonLabel,
            thumbnailUrl: "",
            videoUrl: `${base}${path}`,
            duration: "",
            category: lessonLabel,
            order: order++,
            createdAt: new Date().toISOString(),
          });
        }
      }
    }

    return videos;
  } catch (err) {
    console.error("[VideoAssets] Failed to fetch LMS videos:", err);
    return [];
  }
}
