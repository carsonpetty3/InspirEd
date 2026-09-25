/**
 * Server-side Gemini features for the Expo app (moved from utils/gemini.ts so the
 * API key never ships to the browser). Prompts are unchanged from the app versions.
 */
const { callGeminiAPI } = require('./geminiRag')
const { retrieveChunks, buildContextAndCitations } = require('./ragRetrieve')
const { searchLegacyKnowledge, buildLegacyContextAndCitations } = require('./legacyKnowledge')
const { isDbConnected } = require('./db')

const MODEL = 'models/gemini-2.5-flash:generateContent'
/** Above this, audio goes through the Gemini Files API instead of inline base64 (~20 MB request cap). */
const INLINE_AUDIO_MAX_BYTES = 14 * 1024 * 1024

async function generate(parts, maxRetries = 3) {
  let lastError = null
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const data = await callGeminiAPI(MODEL, { contents: [{ parts }] })
      return (data.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('')
    } catch (err) {
      lastError = err
      const msg = String(err && err.message)
      if (msg.includes('503') || msg.includes('overloaded') || msg.includes('UNAVAILABLE')) {
        await new Promise((r) => setTimeout(r, Math.pow(2, attempt) * 1000))
        continue
      }
      throw err
    }
  }
  throw lastError || new Error('Failed after retries')
}

const generateText = (prompt) => generate([{ text: prompt }])

// ── Retrieval: Mongo Chunk → legacy RagChunk / medical-knowledge.json ─────────
// Every answer the app shows must come from approved content (README "AI Safeguards").
// With REQUIRE_CLINICAL_REVIEW=true, only chunks from assets marked clinically reviewed
// are used, and the unreviewed legacy knowledge base is skipped.
const requireClinicalReview = () => process.env.REQUIRE_CLINICAL_REVIEW === 'true'

async function retrieveContextWithCitations(query, topK) {
  if (isDbConnected()) {
    try {
      const { results } = await retrieveChunks(query, {
        apiKey: process.env.GEMINI_API_KEY,
        topK,
        minSimilarity: 0.3,
        clinicalReviewedOnly: requireClinicalReview()
      })
      if (results.length) return await buildContextAndCitations(results)
    } catch (err) {
      console.warn('[ai] Chunk retrieval failed, using legacy knowledge:', err.message)
    }
  }
  if (requireClinicalReview()) return { context: '', citations: [] }
  const legacy = await searchLegacyKnowledge(query, topK)
  return buildLegacyContextAndCitations(legacy)
}

const NOT_IN_LIBRARY =
  "This isn't covered in the approved InspirEd library yet. Please ask your care team about it."

// ── Audio (Files API for long recordings) ──────────────────────────────────
function normalizeAudioMime(mimeType) {
  const base = String(mimeType || 'audio/webm').split(';')[0].trim().toLowerCase()
  return base.startsWith('audio/') || base === 'video/webm' ? base : 'audio/webm'
}

async function uploadToGeminiFiles(buffer, mimeType) {
  const key = process.env.GEMINI_API_KEY
  const start = await fetch(`https://generativelanguage.googleapis.com/upload/v1beta/files?key=${key}`, {
    method: 'POST',
    headers: {
      'X-Goog-Upload-Protocol': 'resumable',
      'X-Goog-Upload-Command': 'start',
      'X-Goog-Upload-Header-Content-Length': String(buffer.length),
      'X-Goog-Upload-Header-Content-Type': mimeType,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ file: { display_name: `visit-${Date.now()}` } })
  })
  const uploadUrl = start.headers.get('x-goog-upload-url')
  if (!start.ok || !uploadUrl) throw new Error(`Gemini file upload start failed: ${start.status}`)

  const done = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'X-Goog-Upload-Offset': '0',
      'X-Goog-Upload-Command': 'upload, finalize'
    },
    body: buffer
  })
  if (!done.ok) throw new Error(`Gemini file upload failed: ${done.status}`)
  let { file } = await done.json()

  for (let i = 0; file.state === 'PROCESSING' && i < 60; i++) {
    await new Promise((r) => setTimeout(r, 2000))
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/${file.name}?key=${key}`)
    file = await res.json()
  }
  if (file.state !== 'ACTIVE') throw new Error(`Gemini could not process the audio file (${file.state})`)
  return file
}

async function deleteGeminiFile(name) {
  try {
    await fetch(`https://generativelanguage.googleapis.com/v1beta/${name}?key=${process.env.GEMINI_API_KEY}`, {
      method: 'DELETE'
    })
  } catch (err) {
    console.warn('[ai] could not delete Gemini file', err.message)
  }
}

/**
 * @param {{ buffer: Buffer, mimeType?: string, readingLevel?: number }} input
 * @returns {Promise<{ transcription: string, summary: string }>}
 */
async function transcribeAndSummarize({ buffer, mimeType, readingLevel }) {
  const mime = normalizeAudioMime(mimeType)
  const instruction = `Transcribe this audio file from a medical visit. Provide a complete, accurate transcription of everything that was said.
Do not add any commentary or additional text - just the transcription.`

  let transcription
  if (buffer.length <= INLINE_AUDIO_MAX_BYTES) {
    transcription = await generate([
      { inlineData: { data: buffer.toString('base64'), mimeType: mime } },
      { text: instruction }
    ])
  } else {
    const file = await uploadToGeminiFiles(buffer, mime)
    try {
      transcription = await generate([
        { fileData: { fileUri: file.uri, mimeType: mime } },
        { text: instruction }
      ])
    } finally {
      await deleteGeminiFile(file.name)
    }
  }

  if (!transcription) throw new Error('No transcription generated')

  const readingLevelGuidance = readingLevel
    ? `Adapt the summary to a ${readingLevel}th grade reading level using clear, simple language appropriate for that level.`
    : 'Use clear, accessible language appropriate for general audiences.'

  const summary = await generateText(`This is a transcription from a medical visit for a child with a chronic pulmonary condition. Analyze this transcription and provide a concise, helpful summary that includes:

- Main topics discussed during the visit
- Key medical findings or observations
- Diagnosis or condition updates (if mentioned)
- Medications prescribed or changed (if any)
- Action items for the parent/caregiver
- Follow-up instructions or next steps
- Important questions to ask at the next visit (if applicable)

${readingLevelGuidance}

Format the summary in a clear, readable way with proper paragraphs and bullet points where appropriate. Remember this is for a parent managing their child's care, so be empathetic and clear.

TRANSCRIPTION:
${transcription}`)

  return { transcription, summary }
}

// ── Visit extraction / planner / visit Q&A ─────────────────────────────────
async function extractVisitDetails({ transcription, readingLevel = 8 }) {
  const empty = { keyPoints: [], diagnoses: [], actions: [], medicalTerms: [] }
  const text = await generateText(`Analyze this medical visit transcription and extract structured information. Return ONLY valid JSON with no additional text.

TRANSCRIPTION:
${transcription}

Extract the following and return as JSON:
{
  "keyPoints": ["array of 3-5 key points from the visit"],
  "diagnoses": ["array of any diagnoses or conditions mentioned"],
  "actions": ["array of action items for the parent/caregiver"],
  "medicalTerms": ["array of medical terms that were said in the visit"]
}

Guidelines:
- Use ONLY what was said in the transcription. Do not add, interpret, or diagnose.
- keyPoints: Most important takeaways a parent should remember
- diagnoses: Any medical conditions, diagnoses, or health status updates mentioned
- actions: Things the parent needs to do (medications, follow-ups, monitoring, etc.)
- medicalTerms: Medical jargon exactly as it was said. Do not explain the terms.

If a category has no relevant information, return an empty array for that field.`)

  const jsonMatch = (text || '{}').match(/\{[\s\S]*\}/)
  if (!jsonMatch) return empty
  const parsed = JSON.parse(jsonMatch[0])
  const terms = (parsed.medicalTerms || [])
    .map((t) => (typeof t === 'string' ? t : t?.term))
    .filter(Boolean)
  return {
    keyPoints: parsed.keyPoints || [],
    diagnoses: parsed.diagnoses || [],
    actions: parsed.actions || [],
    medicalTerms: await explainTermsFromLibrary(terms, readingLevel)
  }
}

/**
 * The scribe's terms are retrieval keys: each explanation is written only from approved
 * sources that match the term. Terms with no match say so instead of being explained
 * from Gemini's general knowledge.
 */
async function explainTermsFromLibrary(terms, readingLevel) {
  const unique = [...new Set(terms.map((t) => String(t).trim()).filter(Boolean))].slice(0, 10)
  if (!unique.length) return []

  const sourced = await Promise.all(
    unique.map(async (term) => ({ term, ...(await retrieveContextWithCitations(term, 2)) }))
  )
  const withSources = sourced.filter((s) => s.context)
  const explanations = new Map()

  if (withSources.length) {
    const text = await generateText(`You explain medical terms to parents of children with chronic pulmonary conditions.
For each term below, write a 1-2 sentence explanation at a ${readingLevel}th grade reading level using ONLY that term's sources.
If a term's sources do not explain it, use exactly this explanation: "${NOT_IN_LIBRARY}"
Do not add facts that are not in the sources, and do not give medical advice.

${withSources.map((s, i) => `TERM ${i + 1}: ${s.term}\n${s.context}`).join('\n\n=====\n\n')}

Return ONLY a JSON array: [{"term": "...", "explanation": "..."}]`)
    const match = (text || '[]').match(/\[[\s\S]*\]/)
    for (const row of match ? JSON.parse(match[0]) : []) {
      if (row?.term && row?.explanation) explanations.set(String(row.term).toLowerCase(), row.explanation)
    }
  }

  return sourced.map((s) => ({
    term: s.term,
    explanation: (s.context && explanations.get(s.term.toLowerCase())) || NOT_IN_LIBRARY,
    citations: s.citations
  }))
}

async function suggestPlannerQuestions({ visits = [] }) {
  const visitContext = visits
    .slice(0, 3)
    .map((v, i) => {
      const parts = [`Visit ${i + 1}:`]
      if (v.summary) parts.push(`Summary: ${v.summary}`)
      if (v.diagnoses?.length) parts.push(`Diagnoses: ${v.diagnoses.join(', ')}`)
      if (v.actions?.length) parts.push(`Actions: ${v.actions.join(', ')}`)
      return parts.join('\n')
    })
    .join('\n\n')

  const text = await generateText(`Based on these recent medical visits for a child with a chronic pulmonary condition, suggest 4-6 thoughtful questions the parent should ask at their next doctor visit.

${visitContext || 'No previous visit data available.'}

Return ONLY a JSON array of question strings, no other text. Example format:
["Question 1?", "Question 2?"]

Focus on:
- Following up on previous findings or concerns
- Understanding treatment progress
- Clarifying care instructions
- Planning for the future`)

  const jsonMatch = (text || '[]').match(/\[[\s\S]*\]/)
  return jsonMatch ? JSON.parse(jsonMatch[0]) : null
}

async function askVisitQuestion({ question, visitContext = {}, readingLevel = 8 }) {
  const contextParts = []
  if (visitContext.summary) contextParts.push(`VISIT SUMMARY:\n${visitContext.summary}`)
  if (visitContext.transcription) contextParts.push(`FULL TRANSCRIPTION:\n${visitContext.transcription}`)
  if (visitContext.keyPoints?.length) {
    contextParts.push(`KEY POINTS:\n${visitContext.keyPoints.map((p) => `- ${p}`).join('\n')}`)
  }
  if (visitContext.diagnoses?.length) {
    contextParts.push(`DIAGNOSES:\n${visitContext.diagnoses.map((d) => `- ${d}`).join('\n')}`)
  }
  if (visitContext.actions?.length) {
    contextParts.push(`ACTION ITEMS:\n${visitContext.actions.map((a) => `- ${a}`).join('\n')}`)
  }
  if (visitContext.medicalTerms?.length) {
    contextParts.push(
      `MEDICAL TERMS EXPLAINED:\n${visitContext.medicalTerms.map((t) => `- ${t.term}: ${t.explanation}`).join('\n')}`
    )
  }

  const context = contextParts.join('\n\n')
  if (!context.trim()) {
    return "I don't have enough information about this visit to answer your question. Please make sure the visit has been transcribed and summarized first."
  }

  const answer = await generateText(`You are a helpful medical information assistant for parents of children with chronic pulmonary conditions. A parent has asked a question about a recent doctor visit.

IMPORTANT GUIDELINES:
1. Answer based ONLY on the visit information provided below
2. Use clear, simple language appropriate for a ${readingLevel}th grade reading level
3. Be empathetic and supportive - these parents are managing a child's chronic condition
4. If the answer isn't in the visit notes, say so honestly and suggest they ask their doctor
5. Never give specific medical advice - always encourage discussing important decisions with their healthcare provider
6. Only explain medical terms using the explanations in the visit information; do not add outside medical knowledge
7. Keep your response concise but complete

VISIT INFORMATION:
${context}

PARENT'S QUESTION:
${question}

Please provide a helpful, accurate response:`)

  return answer || "I'm sorry, I couldn't generate a response. Please try asking your question again."
}

// ── Learning modules + educational chat (RAG-grounded) ─────────────────────
async function generateModuleLesson({ moduleTitle, moduleDescription, topics = [], difficulty, readingLevel = 8 }) {
  const { context: ragContext, citations } = await retrieveContextWithCitations(
    `${moduleTitle} ${topics.join(' ')} pulmonary children`,
    3
  )

  if (!ragContext) {
    return {
      introduction: `We don't have approved learning material for "${moduleTitle}" yet.`,
      sections: [
        {
          title: 'Not in the library yet',
          content: NOT_IN_LIBRARY,
          keyTakeaway: 'Lessons are only built from content your care team has approved.'
        }
      ],
      summary: NOT_IN_LIBRARY,
      practicalTips: ['Write down your questions about this topic to bring to your next visit.'],
      citations: []
    }
  }

  const sourceContext = `\n\nBuild this lesson ONLY from the following approved medical sources:\n\n${ragContext}\n\n`

  const text = await generateText(`You are creating educational content for parents of children with chronic pulmonary conditions. Generate a comprehensive lesson for the following learning module:

MODULE: ${moduleTitle}
DESCRIPTION: ${moduleDescription}
TOPICS TO COVER: ${topics.join(', ')}
DIFFICULTY LEVEL: ${difficulty}
${sourceContext}
IMPORTANT GUIDELINES:
1. Use clear, simple language appropriate for a ${readingLevel}th grade reading level
2. Be empathetic - these parents are managing their child's chronic condition
3. Focus on practical, actionable information parents can use
4. Explain medical terms in simple, everyday language
5. NEVER provide specific medical advice - always encourage consulting with their healthcare provider
6. Make the content encouraging and supportive
7. Include real-world examples parents can relate to
8. Use ONLY facts from the approved sources above. If they don't cover a topic, leave it out rather than filling it in from general knowledge

Generate the lesson in the following JSON format (respond with ONLY valid JSON, no markdown):
{
  "introduction": "A welcoming 2-3 sentence introduction to the topic",
  "sections": [
    {
      "title": "Section title",
      "content": "2-4 paragraphs of educational content for this section",
      "keyTakeaway": "One sentence summarizing the key point"
    }
  ],
  "summary": "A brief summary of what was covered",
  "practicalTips": ["Tip 1", "Tip 2", "Tip 3"]
}

Create 3-4 sections covering the main topics. Each section should be informative but concise.`)

  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('No valid JSON found in response')
  return { ...JSON.parse(jsonMatch[0]), citations }
}

async function askEducationalQuestion({ question, conversationHistory = [], readingLevel = 8 }) {
  const { context, citations } = await retrieveContextWithCitations(question, 5)

  if (!context) {
    return {
      answer:
        "I couldn't find enough trusted source material in the knowledge base to answer that yet. Try rephrasing, or ask your care team for guidance specific to your child.",
      citations: []
    }
  }

  const historyContext =
    conversationHistory.length > 0
      ? `PREVIOUS CONVERSATION:\n${conversationHistory
          .map((m) => `${m.isUser ? 'Parent' : 'Assistant'}: ${m.text}`)
          .join('\n')}\n\n`
      : ''

  const answer = await generateText(`You are a caring medical education assistant for parents of children with chronic pulmonary conditions.
${context}

IMPORTANT GUIDELINES:
1. Use clear, simple language appropriate for a ${readingLevel}th grade reading level.
2. Be empathetic and supportive.
3. Focus on educational information; never provide personal medical advice or diagnosis.
4. Answer using ONLY the trusted medical sources above. Never add facts from general knowledge.
5. If the sources do not answer the question, say it isn't covered in the approved InspirEd library yet and suggest asking their care team.
6. When you use information from a source, include inline citation markers like [1], [2], matching the source numbers above.

${historyContext}PARENT'S QUESTION:
${question}

Provide a helpful, educational response with inline citations where appropriate:`)

  return { answer: answer || "I'm sorry, I couldn't generate a response.", citations }
}

module.exports = {
  transcribeAndSummarize,
  extractVisitDetails,
  suggestPlannerQuestions,
  askVisitQuestion,
  generateModuleLesson,
  askEducationalQuestion,
  retrieveContextWithCitations
}
