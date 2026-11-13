/**
 * Reading grade of a chat answer, using the same SMOG formula as the app
 * (utils/textAnalysis.ts, used in onboarding), so "grade 6" means the same thing in both.
 */

function countSyllables(word) {
  word = word.toLowerCase().replace(/[^a-z]/g, '')
  if (word.length <= 3) return 1
  const vowels = 'aeiouy'
  let count = 0
  let previousWasVowel = false
  for (const ch of word) {
    const isVowel = vowels.includes(ch)
    if (isVowel && !previousWasVowel) count++
    previousWasVowel = isVowel
  }
  if (word.endsWith('e')) count--
  if (word.endsWith('le') && word.length > 2 && !vowels.includes(word[word.length - 3])) count++
  return Math.max(1, count)
}

/** SMOG grade, rounded and clamped to 6–18 exactly like the app. */
function smogGrade(text) {
  if (!text || text.trim().length < 10) return 8
  const sentences = (text.match(/[.!?]+/g) || []).length || 1
  const polysyllables = (text.match(/\b[a-zA-Z]+\b/g) || []).filter((w) => countSyllables(w) >= 3).length
  const smog = 3 + Math.sqrt((polysyllables * 30) / sentences)
  return Math.max(6, Math.min(18, Math.round(smog)))
}

/**
 * Chat answers are Markdown: citation markers like [1], image markers, bullet lists and
 * headings without full stops. Turn each line into a plain sentence so a bulleted answer
 * isn't scored as one enormous sentence.
 */
function answerToPlainText(answer) {
  return String(answer)
    .replace(/\[\[image:\s*\d+\s*\]\]/gi, ' ')
    .replace(/\[\d+(\s*,\s*\d+)*\]/g, '')
    .replace(/[*_#>`]/g, '')
    .split('\n')
    .map((line) => line.replace(/^\s*([-•]|\d+[.)])\s+/, '').trim())
    .filter(Boolean)
    .map((line) => (/[.!?]$/.test(line) ? line : line.replace(/:$/, '') + '.'))
    .join(' ')
}

const answerGrade = (answer) => smogGrade(answerToPlainText(answer))

module.exports = { smogGrade, answerToPlainText, answerGrade }
