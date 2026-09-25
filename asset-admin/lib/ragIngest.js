const path = require('path')
const Asset = require('../models/Asset')
const Chunk = require('../models/Chunk')
const { embedText, extractTextFromPdfBuffer } = require('./geminiRag')
const { readStoredFile, storedExtname } = require('./storage')

/**
 * Local text extraction for PDFs when Gemini returns nothing (scanned PDFs, API limits, etc.).
 * @param {Buffer} buffer
 * @returns {Promise<string>}
 */
async function extractPdfTextWithPdfParse(buffer) {
  try {
    const pdfParse = require('pdf-parse')
    const data = await pdfParse(buffer)
    return (data && data.text) || ''
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.warn('[ragIngest] pdf-parse failed:', msg)
    return ''
  }
}

const CHUNK_WORDS = 800
const CHUNK_OVERLAP = 100
const INGEST_VERSION = '1.0'

/** @type {Set<string>} */
const ingestLocks = new Set()

function chunkWords(text, sourceLabel) {
  const words = text.split(/\s+/).filter((w) => w.length > 0)
  const chunks = []
  if (words.length === 0) return []
  // Short documents: one chunk (sliding window requires min 50 words)
  if (words.length < 50) {
    return [
      {
        id: `${sourceLabel}_chunk_0`,
        text: words.join(' '),
        chunkIndex: 0
      }
    ]
  }
  for (let i = 0; i < words.length; i += CHUNK_WORDS - CHUNK_OVERLAP) {
    const slice = words.slice(i, i + CHUNK_WORDS)
    if (slice.length < 50) continue
    const chunkText = slice.join(' ')
    chunks.push({
      id: `${sourceLabel}_chunk_${chunks.length}`,
      text: chunkText,
      chunkIndex: chunks.length
    })
  }
  return chunks
}

/**
 * Build searchable text from asset files (primary file + optional transcript).
 * @param {import('mongoose').Document} asset
 * @param {string} [apiKey]
 */
async function extractAllText(asset, apiKey) {
  const parts = []

  const mainPath = asset.file_path || null
  const transcriptPath = asset.transcript_file_path || null
  const mainBuf = await readStoredFile(mainPath)

  if (mainPath && !mainBuf) {
    throw new Error(
      `Upload file is missing on the server (${path.basename(mainPath)}). The file may have been deleted from storage — re-upload the asset.`
    )
  }

  if (mainBuf) {
    const ext = storedExtname(mainPath)
    if (['.txt', '.html'].includes(ext)) {
      parts.push(mainBuf.toString('utf8'))
    } else if (ext === '.pdf') {
      const buf = mainBuf
      let pdfText = (await extractTextFromPdfBuffer(buf, apiKey)) || ''
      if (!pdfText.trim()) {
        pdfText = await extractPdfTextWithPdfParse(buf)
      }
      if (pdfText.trim()) {
        parts.push(pdfText)
      } else {
        throw new Error(
          'Could not read text from this PDF (Gemini and local extract both returned empty). It may be a scanned image PDF with no text layer — add a .txt or .vtt transcript, or use a text-based PDF.'
        )
      }
    } else if (['.png', '.jpg', '.jpeg'].includes(ext)) {
      parts.push(
        `[Visual asset: ${asset.original_filename || 'image'}. Alt text for educators: ${asset.alt_text || 'not provided'}. RAG text extraction for raw images is not enabled in prototype — add a transcript file for richer retrieval.]`
      )
    } else if (['.mp4', '.mov'].includes(ext)) {
      parts.push(
        `[Video asset: ${asset.original_filename || 'video'}. Use an uploaded transcript for text-based RAG.]`
      )
    } else {
      throw new Error(
        `RAG ingest does not support this file type (${ext || 'unknown'}) yet. Add a .txt/.vtt/.srt transcript or convert to PDF/TXT/HTML.`
      )
    }
  }

  const transcriptBuf = await readStoredFile(transcriptPath)
  if (transcriptBuf) {
    const ext = storedExtname(transcriptPath)
    if (['.txt', '.vtt', '.srt'].includes(ext)) {
      parts.push(transcriptBuf.toString('utf8'))
    }
  }

  if (!parts.length && !mainPath) {
    throw new Error(
      'No file or transcript for RAG. Upload a PDF/TXT/HTML or a transcript (.txt/.vtt/.srt) in Edit.'
    )
  }

  return parts.filter((p) => p && String(p).trim()).join('\n\n')
}

/**
 * Run embedding ingest for one asset. Idempotent: replaces existing chunks for asset.
 * @param {string} assetId
 * @param {object} [opts]
 * @param {string} [opts.apiKey] Gemini API key (falls back to env)
 */
async function runIngestForAsset(assetId, opts = {}) {
  const key = opts.apiKey || process.env.GEMINI_API_KEY
  if (!key) {
    await Asset.findByIdAndUpdate(assetId, {
      embedding_status: 'failed',
      rag_ready: false,
      embedding_last_error: 'GEMINI_API_KEY is not configured on server',
      embedding_updated_at: new Date()
    })
    return
  }

  const lockKey = String(assetId)
  if (ingestLocks.has(lockKey)) return
  ingestLocks.add(lockKey)

  try {
    await Asset.findByIdAndUpdate(assetId, {
      embedding_status: 'processing',
      embedding_last_error: null,
      embedding_updated_at: new Date()
    })

    const asset = await Asset.findById(assetId)
    if (!asset) throw new Error('Asset not found')

    const rawText = await extractAllText(asset, key)
    if (!rawText.trim()) {
      throw new Error('No extractable text for RAG. Upload a PDF/TXT/HTML or a transcript (.txt/.vtt/.srt).')
    }

    const label = asset.asset_id || String(asset._id)
    const pieces = chunkWords(rawText, label)
    if (!pieces.length) {
      throw new Error('Text too short to chunk for RAG after extraction.')
    }

    await Chunk.deleteMany({ asset: asset._id })

    for (let i = 0; i < pieces.length; i++) {
      const p = pieces[i]
      const embedding = await embedText(p.text, key)
      if (!embedding.length) {
        throw new Error(`Embedding failed for chunk ${i}`)
      }

      await Chunk.create({
        asset: asset._id,
        sourceAssetId: asset.asset_id || label,
        chunkIndex: p.chunkIndex,
        text: p.text,
        embedding,
        sourceTitle: asset.title,
        contentType: asset.content_type,
        clinicallyReviewed: !!asset.clinical_reviewed,
        diseaseTags: asset.disease_relevance_tags || [],
        healthLiteracyLevel: asset.health_literacy_level,
        ingestVersion: INGEST_VERSION
      })

      await new Promise((r) => setTimeout(r, 200))
    }

    await Asset.findByIdAndUpdate(assetId, {
      rag_ready: true,
      embedding_status: 'ready',
      embedding_last_error: null,
      embedding_updated_at: new Date()
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await Asset.findByIdAndUpdate(assetId, {
      rag_ready: false,
      embedding_status: 'failed',
      embedding_last_error: msg,
      embedding_updated_at: new Date()
    })
  } finally {
    ingestLocks.delete(lockKey)
  }
}

/**
 * Fire-and-forget queue (prototype): runs after current tick.
 * @param {string} assetId
 * @param {{ apiKey?: string }} [opts]
 */
function queueIngest(assetId, opts = {}) {
  const job = new Promise((resolve) => setImmediate(resolve))
    .then(() => runIngestForAsset(assetId, opts))
    .catch((e) => console.error('[ragIngest] fatal', assetId, e))

  // Serverless functions freeze once the response is sent; keep this one alive until ingest ends.
  if (process.env.VERCEL) {
    require('@vercel/functions').waitUntil(job)
  }
}

module.exports = {
  runIngestForAsset,
  queueIngest,
  extractAllText,
  chunkWords
}
