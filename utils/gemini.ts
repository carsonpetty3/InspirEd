/**
 * AI features (transcription, summaries, Q&A, lessons). The prompts and the Gemini key
 * live on the server — see asset-admin/lib/ai.js — so nothing secret ships in the app.
 */
import * as FileSystem from "expo-file-system/legacy";
import { Platform } from "react-native";
import { apiPost } from "./api";
import { uploadAudioBlob } from "./audioUpload";
import type { Citation } from "./rag";

export type { Citation } from "./rag";

/** Serverless request bodies cap at 4.5 MB; base64 adds a third, so larger web audio goes via Blob. */
const INLINE_AUDIO_MAX_BYTES = 3 * 1024 * 1024;

export interface TranscriptionResult {
  transcription: string;
  summary: string;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result).split(",")[1] || "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export async function transcribeAndSummarizeAudio(
  audioUri: string,
  mimeType: string = "audio/webm",
  readingLevel?: number
): Promise<TranscriptionResult> {
  try {
    let audio: { audioBase64: string } | { blobUrl: string };
    let type = mimeType;

    if (Platform.OS === "web") {
      const blob = await (await fetch(audioUri)).blob();
      type = blob.type || mimeType;
      audio =
        blob.size <= INLINE_AUDIO_MAX_BYTES
          ? { audioBase64: await blobToBase64(blob) }
          : { blobUrl: await uploadAudioBlob(blob, type) };
    } else {
      audio = {
        audioBase64: await FileSystem.readAsStringAsync(audioUri, {
          encoding: FileSystem.EncodingType.Base64,
        }),
      };
    }

    return await apiPost<TranscriptionResult>("/api/ai/transcribe", {
      ...audio,
      mimeType: type,
      readingLevel,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Transcription error:", errorMessage);
    throw new Error(parseGeminiError(errorMessage));
  }
}

function parseGeminiError(errorMessage: string): string {
  const errorLower = errorMessage.toLowerCase();

  // Quota exceeded (429 error)
  if (errorLower.includes("429") || errorLower.includes("quota") || errorLower.includes("resource_exhausted") || errorLower.includes("too many requests")) {
    return "Daily limit reached. The free AI service has a limited number of requests per day. Please try again tomorrow, or contact support about upgrading to a higher limit.";
  }

  // Service overloaded (503 error)
  if (errorLower.includes("503") || errorLower.includes("overloaded") || errorLower.includes("unavailable")) {
    return "The AI service is temporarily busy. Please wait a moment and try again.";
  }

  // Network errors
  if (errorLower.includes("network") || errorLower.includes("fetch") || errorLower.includes("timeout")) {
    return "Connection problem. Please check your internet connection and try again.";
  }

  // API key / server configuration issues
  if (errorLower.includes("api_key") || errorLower.includes("unauthorized") || errorLower.includes("401") || errorLower.includes("not configured")) {
    return "There's a problem with the AI service configuration. Please contact support.";
  }

  // Audio processing issues
  if (errorLower.includes("audio") || errorLower.includes("format") || errorLower.includes("decode")) {
    return "Could not process the recording. The audio format may not be supported. Please try recording again.";
  }

  // Generic fallback - don't expose raw API details
  return "Could not process the recording. Please try again in a few moments.";
}

export type VisitExtraction = {
  keyPoints: string[];
  diagnoses: string[];
  actions: string[];
  medicalTerms: { term: string; explanation: string }[];
};

export async function extractVisitDetails(
  transcription: string,
  readingLevel: number = 8
): Promise<VisitExtraction> {
  try {
    return await apiPost<VisitExtraction>("/api/ai/extract-visit", { transcription, readingLevel });
  } catch (error) {
    console.error("Failed to extract visit details:", error);
    return { keyPoints: [], diagnoses: [], actions: [], medicalTerms: [] };
  }
}

const DEFAULT_PLANNER_QUESTIONS = [
  "How is my child's lung function progressing?",
  "Are there any new treatment options we should consider?",
  "What symptoms should I watch for?",
  "How can we improve daily care routines?",
];

export async function suggestPlannerQuestions(
  visits: { summary?: string | null; diagnoses?: string[]; actions?: string[] }[]
): Promise<string[]> {
  try {
    const { questions } = await apiPost<{ questions: string[] | null }>(
      "/api/ai/planner-questions",
      { visits: visits.slice(0, 3) }
    );
    return questions ?? DEFAULT_PLANNER_QUESTIONS;
  } catch (error) {
    console.error("Failed to suggest planner questions:", error);
    return DEFAULT_PLANNER_QUESTIONS;
  }
}

export async function askQuestionWithGemini(
  question: string,
  visitContext: {
    summary?: string | null;
    transcription?: string | null;
    keyPoints?: string[];
    diagnoses?: string[];
    actions?: string[];
    medicalTerms?: { term: string; explanation: string }[];
  },
  readingLevel: number = 8
): Promise<string> {
  try {
    const { answer } = await apiPost<{ answer: string }>("/api/ai/visit-question", {
      question,
      visitContext,
      readingLevel,
    });
    return answer;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Gemini Q&A error:", errorMessage);
    return "I'm having trouble answering your question right now. Please try again in a moment.";
  }
}

export interface LessonSection {
  title: string;
  content: string;
  keyTakeaway?: string;
}

export interface GeneratedLesson {
  introduction: string;
  sections: LessonSection[];
  summary: string;
  practicalTips: string[];
}

export async function generateModuleLesson(
  moduleTitle: string,
  moduleDescription: string,
  topics: string[],
  difficulty: string,
  readingLevel: number = 8
): Promise<GeneratedLesson> {
  try {
    return await apiPost<GeneratedLesson>("/api/ai/lesson", {
      moduleTitle,
      moduleDescription,
      topics,
      difficulty,
      readingLevel,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Gemini lesson generation error:", errorMessage);

    // Return a fallback lesson structure
    return {
      introduction: "We're having trouble loading this lesson right now. Please try again in a moment, or use the AI Assistant below to ask questions about this topic.",
      sections: [
        {
          title: "Content Unavailable",
          content: "The lesson content couldn't be generated at this time. You can still learn about this topic by asking the AI Learning Assistant questions.",
          keyTakeaway: "Try refreshing or ask the AI Assistant for help with this topic.",
        },
      ],
      summary: "Please try again later or use the AI Assistant for help.",
      practicalTips: ["Ask the AI Assistant about specific topics you'd like to learn about"],
    };
  }
}

export interface EducationalResponse {
  answer: string;
  citations: Citation[];
}

export async function askEducationalQuestion(
  question: string,
  conversationHistory: { text: string; isUser: boolean }[] = [],
  readingLevel: number = 8
): Promise<EducationalResponse> {
  try {
    const data = await apiPost<EducationalResponse>("/api/ai/educational", {
      question,
      conversationHistory,
      readingLevel,
    });
    return { answer: data.answer, citations: data.citations ?? [] };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Gemini Education error:", errorMessage);
    return {
      answer: "I'm having trouble answering your question right now. Please try again in a moment.",
      citations: [],
    };
  }
}
