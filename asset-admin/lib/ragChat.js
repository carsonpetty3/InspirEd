const { retrieveChunks, buildContextAndCitations } = require('./ragRetrieve')
const { generateText } = require('./geminiRag')

/**
 * @param {object} input
 * @param {string} input.question
 * @param {number} [input.readingLevel]
 * @param {{ text: string, isUser: boolean }[]} [input.conversationHistory]
 * @param {string} [input.geminiApiKey]
 * @param {number} [input.topK]
 * @param {boolean} [input.clinicalReviewedOnly]
 */
async function chatWithRag(input) {
  const {
    question,
    readingLevel = 8,
    conversationHistory = [],
    geminiApiKey,
    topK = 5,
    clinicalReviewedOnly = false
  } = input

  const apiKey = geminiApiKey || process.env.GEMINI_API_KEY
  if (!apiKey) {
    return {
      answer: 'RAG chat is not configured: provide geminiApiKey in the request or set GEMINI_API_KEY on the server.',
      citations: []
    }
  }

  const { results } = await retrieveChunks(question, {
    apiKey,
    topK,
    minSimilarity: 0.3,
    clinicalReviewedOnly
  })

  if (!results.length) {
    return {
      answer:
        "I couldn't find enough trusted source material in the knowledge base to answer that yet. Try rephrasing, or ask your care team for guidance specific to your child.",
      citations: []
    }
  }

  const { context, citations } = await buildContextAndCitations(results)

  const historyContext =
    conversationHistory.length > 0
      ? `PREVIOUS CONVERSATION:\n${conversationHistory
          .map((m) => `${m.isUser ? 'Parent' : 'Assistant'}: ${m.text}`)
          .join('\n')}\n\n`
      : ''

  const prompt = `You are a caring medical education assistant for parents of children with chronic pulmonary conditions.
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

Provide a helpful, educational response with inline citations where appropriate:`

  const answer = await generateText(prompt, apiKey)

  return { answer: answer || "I'm sorry, I couldn't generate a response.", citations }
}

/**
 * Retrieval-only (for lesson generation in the mobile app).
 */
async function retrieveOnly(query, options = {}) {
  const { geminiApiKey, topK = 3, clinicalReviewedOnly = false } = options
  const apiKey = geminiApiKey || process.env.GEMINI_API_KEY
  if (!apiKey) {
    return { context: '', citations: [], chunks: [] }
  }

  const { results } = await retrieveChunks(query, {
    apiKey,
    topK,
    minSimilarity: 0.3,
    clinicalReviewedOnly
  })

  if (!results.length) {
    return { context: '', citations: [], chunks: [] }
  }

  const { context, citations } = await buildContextAndCitations(results)
  return {
    context,
    citations,
    chunks: results.map((r) => ({
      id: String(r.chunk._id),
      text: r.chunk.text,
      similarity: r.similarity
    }))
  }
}

module.exports = {
  chatWithRag,
  retrieveOnly
}
