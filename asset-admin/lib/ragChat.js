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
4. Answer using ONLY the trusted medical sources above when they contain relevant information.
5. If the sources do not contain enough information, say so honestly.
6. When you use information from a source, include inline citation markers like [1], [2], matching the source numbers above.
7. You can show diagrams. When a picture would help, put [[image:N]] on its own line at the spot in the answer where the parent should see it. The app replaces that marker with the image. Never say you cannot display or show an image.

${historyContext}PARENT'S QUESTION:
${question}

Provide a helpful, educational response with inline citations where appropriate:`

  const answer = await generateText(prompt, apiKey)
  const raw = answer || "I'm sorry, I couldn't generate a response."
  // MULTIMODAL-RETRIEVAL-FEATURE: [[image:N]] is where the chat draws the picture inside the reply.
  const text = placeImageMarkers(raw, citations)

  return { answer: text, citations, images: imagesCitedInAnswer(text, citations) }
}

function imageCitationNumbers(citations) {
  return citations
    .map((citation, index) =>
      citation.mediaType === 'image' && citation.sourceFilePath ? index + 1 : null
    )
    .filter((n) => n != null)
}

function placeImageMarkers(answer, citations) {
  const available = new Set(imageCitationNumbers(citations))
  if (!available.size) return answer

  let text = answer.replace(/\[\[image:\s*(\d+)\s*\]\]|\[image:\s*(\d+)\s*\]/gi, (_, a, b) => {
    const n = Number(a || b)
    return available.has(n) ? `\n\n[[image:${n}]]\n\n` : ''
  })

  const already = new Set()
  const markerRe = /\[\[image:(\d+)\]\]/g
  let match
  while ((match = markerRe.exec(text))) already.add(Number(match[1]))

  const wanted = []
  const citeRe = /\[(\d+)\]/g
  while ((match = citeRe.exec(text))) {
    const n = Number(match[1])
    if (available.has(n) && !already.has(n) && !wanted.includes(n)) wanted.push(n)
  }

  // MULTIMODAL-RETRIEVAL-FEATURE: "I cannot display that image" means the model wanted the picture.
  const refused = /\b(cannot|can't|unable to|not able to)\s+(display|show)\b/i.test(text)
  if (refused) {
    const mentioned = [...available].filter((n) => {
      const title = String(citations[n - 1]?.sourceTitle || '').toLowerCase()
      const words = title.split(/\s+/).filter((word) => word.length > 3)
      const hay = text.toLowerCase()
      return words.some((word) => hay.includes(word))
    })
    const chosen = mentioned.length ? mentioned : available.size === 1 ? [...available] : []
    for (const n of chosen) {
      if (!already.has(n) && !wanted.includes(n)) wanted.push(n)
    }
    text = text
      .replace(/[^.!?\n]*\b(cannot|can't|unable to|not able to)\s+(display|show)\b[^.!?\n]*[.!?]?/gi, '')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  }

  if (!wanted.length) return text.replace(/\n{3,}/g, '\n\n').trim()

  const block = wanted.map((n) => `[[image:${n}]]`).join('\n\n')
  const parts = text.split(/\n\n/).map((part) => part.trim()).filter(Boolean)
  if (parts.length >= 2) {
    parts.splice(1, 0, block)
    return parts.join('\n\n')
  }
  return parts.length ? `${parts[0]}\n\n${block}` : block
}

function imagesCitedInAnswer(answer, citations) {
  const cited = new Set()
  const re = /\[\[image:(\d+)\]\]|\[(\d+)\]/g
  let match
  while ((match = re.exec(answer))) cited.add(Number(match[1] || match[2]))

  return citations
    .map((citation, index) => ({ citation, number: index + 1 }))
    .filter(
      ({ citation, number }) =>
        cited.has(number) && citation.mediaType === 'image' && citation.sourceFilePath
    )
    .map(({ citation }) => ({
      sourceFilePath: citation.sourceFilePath,
      sourceTitle: citation.sourceTitle
    }))
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
