/**
 * Google Drive Service for Educational Videos
 * 
 * Fetches curated medical educational videos from a designated Google Drive folder.
 * The service account lives on the server (asset-admin/lib/drive.js); falls back to
 * demo videos when Drive isn't configured.
 */

import { apiGet } from "./api";

export interface EducationalVideo {
  id: string;
  title: string;
  description: string;
  thumbnailUrl: string;
  videoUrl: string;
  duration: string;
  category: string;
  order: number;
  createdAt: string;
}

export async function fetchEducationalVideos(): Promise<EducationalVideo[]> {
  try {
    const { videos } = await apiGet<{ videos: EducationalVideo[] | null }>("/api/videos");
    if (videos) return videos;
  } catch (error) {
    console.error("Failed to fetch videos from Drive:", error);
  }
  console.log("Using demo educational videos");
  return getDemoVideos();
}

export async function getVideoStreamUrl(videoId: string): Promise<string> {
  const demoVideo = getDemoVideos().find(v => v.id === videoId);
  if (demoVideo) return demoVideo.videoUrl;

  try {
    const { url } = await apiGet<{ url: string | null }>(
      `/api/videos/${encodeURIComponent(videoId)}/stream-url`
    );
    return url || "";
  } catch (error) {
    console.error("Failed to get video stream URL:", error);
    return "";
  }
}

function getDemoVideos(): EducationalVideo[] {
  return [
    {
      id: "demo-1",
      title: "Understanding Your Child's Lungs",
      description: "A gentle introduction to how healthy lungs work and what makes them special in growing children.",
      thumbnailUrl: "",
      videoUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
      duration: "3:45",
      category: "Breathing & Lungs",
      order: 1,
      createdAt: new Date().toISOString(),
    },
    {
      id: "demo-2",
      title: "What is Surfactant?",
      description: "Learn about surfactant - the special substance that helps keep your child's air sacs open and healthy.",
      thumbnailUrl: "",
      videoUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4",
      duration: "4:20",
      category: "Surfactant Basics",
      order: 2,
      createdAt: new Date().toISOString(),
    },
    {
      id: "demo-3",
      title: "Daily Care Routines",
      description: "Practical tips for daily care routines that support your child's respiratory health.",
      thumbnailUrl: "",
      videoUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
      duration: "5:15",
      category: "Daily Care",
      order: 3,
      createdAt: new Date().toISOString(),
    },
    {
      id: "demo-4",
      title: "Breathing Exercises for Children",
      description: "Fun and gentle breathing exercises you can do with your child to strengthen their respiratory system.",
      thumbnailUrl: "",
      videoUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4",
      duration: "6:00",
      category: "Daily Care",
      order: 4,
      createdAt: new Date().toISOString(),
    },
    {
      id: "demo-5",
      title: "When to Call the Doctor",
      description: "Important signs and symptoms to watch for, and when it's time to seek medical attention.",
      thumbnailUrl: "",
      videoUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4",
      duration: "4:45",
      category: "Treatments",
      order: 5,
      createdAt: new Date().toISOString(),
    },
  ];
}

export function getVideoCategories(videos: EducationalVideo[]): string[] {
  const categories = new Set(videos.map(v => v.category));
  return Array.from(categories).sort();
}
