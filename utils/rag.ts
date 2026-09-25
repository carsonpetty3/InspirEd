/**
 * RAG citation types and helpers.
 *
 * Retrieval itself runs on the server (asset-admin `/api/ai/*`): Mongo chunks first,
 * then the legacy medical-knowledge.json index. See asset-admin/lib/ai.js.
 */

import { Platform } from "react-native";
import { getApiBaseUrl, resolveApiUrl } from "./api";

export interface Citation {
  id: string;
  sourceTitle: string;
  excerpt: string;
  similarity: number;
  /** `/uploads/foo.pdf` on a local asset-admin, or an absolute Blob URL when deployed */
  sourceFilePath?: string;
  assetMongoId?: string;
}

/** @deprecated use getApiBaseUrl from ./api */
export const getRagApiBaseUrl = getApiBaseUrl;

/**
 * Full URL to open a citation source PDF in-app.
 */
export function buildCitationPdfUrl(sourceFilePath?: string): string | null {
  if (!sourceFilePath || !/\.pdf$/i.test(sourceFilePath.trim())) return null;
  const url = resolveApiUrl(sourceFilePath);
  // Relative URLs only work on web (same origin); native needs a configured base.
  return /^https?:\/\//i.test(url) || Platform.OS === "web" ? url : null;
}
