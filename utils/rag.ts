/**
 * Local RAG (Retrieval-Augmented Generation) Service
 * 
 * Provides vector similarity search over pre-embedded medical content
 * to ground AI responses in trusted sources.
 */

import Constants from "expo-constants";

interface KnowledgeChunk {
  id: string;
  text: string;
  source: string;
  chunkIndex: number;
  embedding: number[];
}

interface KnowledgeBase {
  version: string;
  generatedAt: string;
  totalChunks: number;
  sources: string[];
  chunks: KnowledgeChunk[];
}

interface RetrievalResult {
  chunk: KnowledgeChunk;
  similarity: number;
}

export interface Citation {
  id: string;
  sourceTitle: string;
  excerpt: string;
  similarity: number;
  /** Server path e.g. `/uploads/foo.pdf` — join with RAG_API_URL for fetching */
  sourceFilePath?: string;
  assetMongoId?: string;
  // MULTIMODAL-RETRIEVAL-FEATURE: set when this citation is a picture the chat can show.
  mediaType?: "image";
}

// MULTIMODAL-RETRIEVAL-FEATURE: an image the assistant chose to show. the file stays on asset-admin.
export interface RetrievedImage {
  sourceFilePath: string;
  sourceTitle: string;
}

export interface RAGContextWithCitations {
  context: string;
  citations: Citation[];
}

let knowledgeBase: KnowledgeBase | null = null;

export function getRagApiBaseUrl(): string {
  const raw =
    process.env.EXPO_PUBLIC_RAG_API_URL ||
    Constants.expoConfig?.extra?.RAG_API_URL ||
    Constants.expoConfig?.extra?.RAG_API_BASE_URL ||
    (
      Constants.manifest2?.extra?.expoClient?.extra as {
        RAG_API_URL?: string;
        RAG_API_BASE_URL?: string;
      } | undefined
    )?.RAG_API_URL ||
    (
      Constants.manifest2?.extra?.expoClient?.extra as {
        RAG_API_BASE_URL?: string;
      } | undefined
    )?.RAG_API_BASE_URL ||
    "";
  return String(raw || "").replace(/\/$/, "");
}

function buildUploadedAssetUrl(sourceFilePath: string | undefined, ext: RegExp): string | null {
  if (!sourceFilePath || !ext.test(sourceFilePath.trim())) return null;
  const base = getRagApiBaseUrl();
  if (!base) return null;
  const p = sourceFilePath.startsWith("/") ? sourceFilePath : `/${sourceFilePath}`;
  return `${base}${p}`;
}

/**
 * Full URL to open a citation source PDF in-app (requires `RAG_API_URL` and `sourceFilePath` from asset-admin).
 */
export function buildCitationPdfUrl(sourceFilePath?: string): string | null {
  return buildUploadedAssetUrl(sourceFilePath, /\.pdf$/i);
}

// MULTIMODAL-RETRIEVAL-FEATURE: full URL for a diagram stored under asset-admin /uploads.
export function buildCitationImageUrl(sourceFilePath?: string): string | null {
  return buildUploadedAssetUrl(sourceFilePath, /\.(png|jpe?g|gif|webp)$/i);
}

/** When set, retrieval uses asset-admin (Mongo) — see README. */
export function usesRemoteRag(): boolean {
  return getRagApiBaseUrl().length > 0;
}

const getApiKey = (): string => {
  const apiKey = 
    process.env.GEMINI_API_KEY || 
    Constants.expoConfig?.extra?.GEMINI_API_KEY ||
    Constants.manifest2?.extra?.expoClient?.extra?.GEMINI_API_KEY;
  
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured");
  }
  return apiKey;
};

/** Chunk-based retrieval from asset-admin (Mongo `Chunk` collection). */
async function fetchAssetAdminRetrieve(
  query: string,
  topK: number
): Promise<{
  context: string;
  citations: Citation[];
  chunks?: { id: string; text: string; similarity: number }[];
} | null> {
  const base = getRagApiBaseUrl();
  if (!base) return null;
  try {
    const apiKey = getApiKey();
    const res = await fetch(`${base}/api/rag/retrieve`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-gemini-api-key": apiKey,
      },
      body: JSON.stringify({
        query,
        topK,
        geminiApiKey: apiKey,
        clinicalReviewedOnly: false,
      }),
    });
    if (!res.ok) {
      console.warn(`[RAG] /api/rag/retrieve failed: ${res.status}`);
      return null;
    }
    const data = (await res.json()) as {
      context?: string;
      citations?: Citation[];
      chunks?: { id: string; text: string; similarity: number }[];
      error?: string;
    };
    if (data.error) return null;
    return {
      context: data.context || "",
      citations: data.citations || [],
      chunks: data.chunks,
    };
  } catch (e) {
    console.warn("[RAG] /api/rag/retrieve unreachable:", e);
    return null;
  }
}

/**
 * Load the knowledge base from bundled assets
 */
export async function loadKnowledgeBase(): Promise<boolean> {
  if (knowledgeBase) return true;

  try {
    const data = require('@/assets/medical-knowledge.json') as KnowledgeBase;
    knowledgeBase = data;
    console.log(
      `[RAG] Loaded ${knowledgeBase.totalChunks} chunks locally from medical-knowledge.json`
    );
    return true;
  } catch (error) {
    if (usesRemoteRag()) {
      console.log("[RAG] No local JSON; retrieval will use RAG_API_URL (Mongo) when configured");
      return true;
    }
    console.warn('[RAG] Knowledge base not available:', error);
    return false;
  }
}

/**
 * Calculate cosine similarity between two vectors
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  
  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
  return magnitude === 0 ? 0 : dotProduct / magnitude;
}

/**
 * Generate embedding for a query using Gemini
 */
async function generateQueryEmbedding(query: string): Promise<number[]> {
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${getApiKey()}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'models/gemini-embedding-001',
          content: {
            parts: [{ text: query }],
          },
          outputDimensionality: 768,
          taskType: 'RETRIEVAL_QUERY',
        }),
      }
    );
    
    if (!response.ok) {
      throw new Error(`Embedding API error: ${response.status}`);
    }
    
    const data = await response.json();
    return (
      data.embedding?.values ||
      data.embedding?.value ||
      (Array.isArray(data.embeddings) && data.embeddings[0]?.values) ||
      []
    );
  } catch (error) {
    console.error('[RAG] Error generating query embedding:', error);
    return [];
  }
}

type ApiChunkHit = {
  chunk: { id: string; text: string; source: string; chunkIndex: number };
  similarity: number;
};

/** Mongo-backed search via asset-admin. Undefined = error (fall back to local JSON). */
async function retrieveFromMongoApi(
  query: string,
  topK: number,
  minSimilarity: number
): Promise<RetrievalResult[] | undefined> {
  const base = getRagApiBaseUrl();
  if (!base) return undefined;

  try {
    const res = await fetch(`${base}/api/rag/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, topK, minSimilarity }),
    });
    if (!res.ok) {
      console.warn(`[RAG] API /api/rag/search failed: ${res.status}`);
      return undefined;
    }
    const data = (await res.json()) as { results?: ApiChunkHit[] };
    const hits = data.results ?? [];
    return hits.map((h) => ({
      chunk: {
        id: h.chunk.id,
        text: h.chunk.text,
        source: h.chunk.source,
        chunkIndex: h.chunk.chunkIndex,
        embedding: [],
      },
      similarity: h.similarity,
    }));
  } catch (e) {
    console.warn("[RAG] Mongo API unreachable, falling back to local JSON if present:", e);
    return undefined;
  }
}

/**
 * Retrieve relevant chunks for a given query
 */
export async function retrieveRelevantContext(
  query: string,
  topK: number = 3,
  minSimilarity: number = 0.3
): Promise<RetrievalResult[]> {
  const fromApi = await retrieveFromMongoApi(query, topK, minSimilarity);
  if (fromApi !== undefined && fromApi.length > 0) {
    console.log(`[RAG] ${fromApi.length} chunk(s) from legacy RagChunk API`);
    return fromApi;
  }

  const loaded = await loadKnowledgeBase();
  if (!loaded || !knowledgeBase) {
    console.warn('[RAG] Knowledge base not available');
    return [];
  }
  
  // Generate query embedding
  const queryEmbedding = await generateQueryEmbedding(query);
  if (queryEmbedding.length === 0) {
    return [];
  }
  
  // Calculate similarities
  const results: RetrievalResult[] = [];
  
  for (const chunk of knowledgeBase.chunks) {
    if (!chunk.embedding || chunk.embedding.length === 0) continue;
    
    const similarity = cosineSimilarity(queryEmbedding, chunk.embedding);
    if (similarity >= minSimilarity) {
      results.push({ chunk, similarity });
    }
  }
  
  // Sort by similarity and return top K
  results.sort((a, b) => b.similarity - a.similarity);
  return results.slice(0, topK);
}

/**
 * Format source name for display
 */
function formatSourceName(source: string): string {
  return source
    .replace(/-/g, ' ')
    .replace(/_/g, ' ')
    .replace(/\d+$/, '')
    .trim();
}

/**
 * Get formatted context for AI prompts
 */
export async function getRAGContext(query: string, topK: number = 3): Promise<string> {
  const remote = await fetchAssetAdminRetrieve(query, topK);
  if (remote?.context?.trim()) {
    return remote.context;
  }

  const results = await retrieveRelevantContext(query, topK);
  
  if (results.length === 0) {
    return '';
  }
  
  const contextParts = results.map((result, index) => {
    const sourceLabel = formatSourceName(result.chunk.source);
    return `[Source ${index + 1}: ${sourceLabel}]\n${result.chunk.text}`;
  });
  
  return `TRUSTED MEDICAL SOURCES:\n\n${contextParts.join('\n\n---\n\n')}`;
}

/**
 * Get formatted context with citation metadata for UI display
 */
export async function getRAGContextWithCitations(
  query: string, 
  topK: number = 3
): Promise<RAGContextWithCitations> {
  const remote = await fetchAssetAdminRetrieve(query, topK);
  if (remote?.context?.trim() || (remote?.citations && remote.citations.length > 0)) {
    return {
      context: remote.context || "",
      citations: remote.citations || [],
    };
  }

  const results = await retrieveRelevantContext(query, topK);
  
  if (results.length === 0) {
    return { context: '', citations: [] };
  }
  
  // Group results by source to deduplicate citations
  const sourceMap = new Map<string, { 
    chunks: typeof results; 
    bestSimilarity: number;
  }>();
  
  for (const result of results) {
    const sourceName = result.chunk.source;
    const existing = sourceMap.get(sourceName);
    if (existing) {
      existing.chunks.push(result);
      existing.bestSimilarity = Math.max(existing.bestSimilarity, result.similarity);
    } else {
      sourceMap.set(sourceName, { 
        chunks: [result], 
        bestSimilarity: result.similarity 
      });
    }
  }
  
  // Create deduplicated citations (one per unique source)
  const citations: Citation[] = [];
  let citationIndex = 0;
  for (const [sourceName, data] of sourceMap.entries()) {
    citationIndex++;
    // Combine excerpts from multiple chunks of the same source
    const combinedExcerpt = data.chunks
      .slice(0, 2)
      .map(r => r.chunk.text.substring(0, 100))
      .join(' ... ');
    
    citations.push({
      id: `source-${citationIndex}`,
      sourceTitle: formatSourceName(sourceName),
      excerpt: combinedExcerpt.substring(0, 200) + (combinedExcerpt.length > 200 ? '...' : ''),
      similarity: Math.round(data.bestSimilarity * 100),
    });
  }
  
  const contextParts = results.map((result, index) => {
    const sourceLabel = formatSourceName(result.chunk.source);
    return `[Source ${index + 1}: ${sourceLabel}]\nWhen citing this source, use the marker [${index + 1}].\n${result.chunk.text}`;
  });
  
  const context = `TRUSTED MEDICAL SOURCES (cite using [1], [2], [3] markers):\n\n${contextParts.join('\n\n---\n\n')}`;
  
  return { context, citations };
}

/**
 * Check if the knowledge base is available
 */
export function isKnowledgeBaseAvailable(): boolean {
  if (usesRemoteRag()) return true;
  return knowledgeBase !== null && knowledgeBase.totalChunks > 0;
}

/**
 * Get knowledge base statistics
 */
export function getKnowledgeBaseStats(): { totalChunks: number; sources: string[] } | null {
  if (!knowledgeBase) return null;
  
  return {
    totalChunks: knowledgeBase.totalChunks,
    sources: knowledgeBase.sources,
  };
}
