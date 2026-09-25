/**
 * Fallback retrieval over the older knowledge base (assets/medical-knowledge.json),
 * used when the Mongo `Chunk` collection has nothing relevant.
 *
 * Order: Mongo `RagChunk` (synced copy of the JSON) → the JSON file itself.
 * This used to run on the phone with a client-side Gemini key; it lives here now
 * so no key ships to the browser.
 */
const fs = require('fs')
const path = require('path')
const RagChunk = require('../models/RagChunk')
const { searchRagChunks, cosineSimilarity, embedQuery } = require('./ragSearch')
const { isDbConnected } = require('./db')

const KNOWLEDGE_PATH = path.join(__dirname, '..', '..', 'assets', 'medical-knowledge.json')

let knowledgeJson = null

function loadKnowledgeJson() {
  if (knowledgeJson) return knowledgeJson
  try {
    knowledgeJson = JSON.parse(fs.readFileSync(KNOWLEDGE_PATH, 'utf8'))
  } catch (err) {
    console.warn('[legacyKnowledge] medical-knowledge.json unavailable:', err.message)
    knowledgeJson = { chunks: [] }
  }
  return knowledgeJson
}

async function searchJson(query, topK, minSimilarity) {
  const chunks = loadKnowledgeJson().chunks || []
  if (!chunks.length) return []
  const queryEmbedding = await embedQuery(query, process.env.GEMINI_API_KEY)
  if (!queryEmbedding.length) return []

  const results = []
  for (const chunk of chunks) {
    if (!chunk.embedding?.length) continue
    const similarity = cosineSimilarity(queryEmbedding, chunk.embedding)
    if (similarity >= minSimilarity) {
      results.push({
        chunk: { id: chunk.id, text: chunk.text, source: chunk.source, chunkIndex: chunk.chunkIndex },
        similarity
      })
    }
  }
  results.sort((a, b) => b.similarity - a.similarity)
  return results.slice(0, topK)
}

/** @returns {Promise<{ chunk: { id, text, source, chunkIndex }, similarity: number }[]>} */
async function searchLegacyKnowledge(query, topK = 3, minSimilarity = 0.3) {
  if (isDbConnected()) {
    try {
      const fromMongo = await searchRagChunks({ query, RagChunk, topK, minSimilarity })
      if (fromMongo.length) return fromMongo
    } catch (err) {
      console.warn('[legacyKnowledge] RagChunk search failed, using JSON:', err.message)
    }
  }
  return searchJson(query, topK, minSimilarity)
}

function formatSourceName(source) {
  return String(source)
    .replace(/-/g, ' ')
    .replace(/_/g, ' ')
    .replace(/\d+$/, '')
    .trim()
}

/** Same prompt context + deduplicated citations the app used to build on-device. */
function buildLegacyContextAndCitations(results) {
  if (!results.length) return { context: '', citations: [] }

  const sourceMap = new Map()
  for (const r of results) {
    const existing = sourceMap.get(r.chunk.source)
    if (existing) {
      existing.chunks.push(r)
      existing.bestSimilarity = Math.max(existing.bestSimilarity, r.similarity)
    } else {
      sourceMap.set(r.chunk.source, { chunks: [r], bestSimilarity: r.similarity })
    }
  }

  const citations = []
  let citationIndex = 0
  for (const [sourceName, data] of sourceMap.entries()) {
    citationIndex++
    const combinedExcerpt = data.chunks
      .slice(0, 2)
      .map((r) => r.chunk.text.substring(0, 100))
      .join(' ... ')
    citations.push({
      id: `source-${citationIndex}`,
      sourceTitle: formatSourceName(sourceName),
      excerpt: combinedExcerpt.substring(0, 200) + (combinedExcerpt.length > 200 ? '...' : ''),
      similarity: Math.round(data.bestSimilarity * 100)
    })
  }

  const contextParts = results.map((r, index) => {
    const sourceLabel = formatSourceName(r.chunk.source)
    return `[Source ${index + 1}: ${sourceLabel}]\nWhen citing this source, use the marker [${index + 1}].\n${r.chunk.text}`
  })
  const context = `TRUSTED MEDICAL SOURCES (cite using [1], [2], [3] markers):\n\n${contextParts.join('\n\n---\n\n')}`

  return { context, citations }
}

module.exports = { searchLegacyKnowledge, buildLegacyContextAndCitations }
