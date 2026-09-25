import { upload } from "@vercel/blob/client";
import { resolveApiUrl } from "./api";

/**
 * Upload a long recording straight from the browser to Vercel Blob (serverless request
 * bodies are capped at 4.5 MB). The server deletes the blob right after transcribing it.
 */
export async function uploadAudioBlob(audio: Blob, contentType: string): Promise<string> {
  const ext = contentType.includes("mp4") ? "m4a" : contentType.includes("ogg") ? "ogg" : "webm";
  const result = await upload(`visit-audio/recording.${ext}`, audio, {
    access: "public",
    contentType,
    handleUploadUrl: resolveApiUrl("/api/blob/audio-upload"),
  });
  return result.url;
}
