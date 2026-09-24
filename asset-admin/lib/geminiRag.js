/**
 * Gemini REST helpers for RAG ingestion and retrieval (prototype).
 * Requires GEMINI_API_KEY in environment for PDF extraction and embeddings.
 */

const EMBEDDING_MODEL = 'models/gemini-embedding-001'
/** Keep aligned with query embeddings and atlas-vector-index.example.json (768). */
const EMBEDDING_DIM = 768
/** PDF text extraction; keep in sync with supported Gemini models (2.0-flash retired for new users). */
const PDF_MODEL = 'models/gemini-3.6-flash:generateContent'

async function callGeminiAPI(endpoint, body, apiKey) {
  const key = apiKey || process.env.GEMINI_API_KEY
  if (!key) throw new Error('GEMINI_API_KEY is not configured')

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/${endpoint}?key=${key}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }
  )

  if (!response.ok) {
    const errText = await response.text()
    throw new Error(`Gemini API error: ${response.status} - ${errText}`)
  }

  return response.json()
}

function parseEmbedValues(data) {
  if (!data || typeof data !== 'object') return []
  const e = data.embedding
  if (Array.isArray(e?.values) && e.values.length) return e.values
  if (Array.isArray(e?.value) && e.value.length) return e.value
  if (Array.isArray(e) && typeof e[0] === 'number') return e
  const first = Array.isArray(data.embeddings) ? data.embeddings[0] : null
  if (Array.isArray(first?.values) && first.values.length) return first.values
  return []
}

/**
 * @param {string} text
 * @param {string} [apiKey]
 * @returns {Promise<number[]>}
 */
async function embedText(text, apiKey) {
  const trimmed = String(text || '').slice(0, 8000)
  if (!trimmed.trim()) return []

  const response = await callGeminiAPI(
    `${EMBEDDING_MODEL}:embedContent`,
    {
      model: EMBEDDING_MODEL,
      content: { parts: [{ text: trimmed }] },
      outputDimensionality: EMBEDDING_DIM,
      taskType: 'RETRIEVAL_DOCUMENT',
    },
    apiKey
  )

  return parseEmbedValues(response)
}

/**
 * Extract plain text from a PDF buffer using Gemini (same approach as scripts/process-pdfs.js).
 * @param {Buffer} pdfBuffer
 * @param {string} [apiKey]
 */
async function extractTextFromPdfBuffer(pdfBuffer, apiKey) {
  const base64PDF = pdfBuffer.toString('base64')

  const response = await callGeminiAPI(
    PDF_MODEL,
    {
      contents: [
        {
          parts: [
            {
              inlineData: {
                mimeType: 'application/pdf',
                data: base64PDF
              }
            },
            {
              text: `Extract all the text content from this medical PDF document.
Preserve structure including section headings and paragraphs.
Return the full extracted text, maintaining readability.`
            }
          ]
        }
      ]
    },
    apiKey
  )

  return response.candidates?.[0]?.content?.parts?.[0]?.text || ''
}

const CHAT_MODEL = 'models/gemini-3.6-flash:generateContent'

/**
 * @param {string} prompt
 * @param {string} [apiKey]
 */
async function generateText(prompt, apiKey) {
  const response = await callGeminiAPI(
    CHAT_MODEL,
    {
      contents: [{ parts: [{ text: prompt }] }]
    },
    apiKey
  )
  return response.candidates?.[0]?.content?.parts?.[0]?.text || ''
}

module.exports = {
  callGeminiAPI,
  embedText,
  extractTextFromPdfBuffer,
  generateText,
  EMBEDDING_MODEL,
  EMBEDDING_DIM,
}
