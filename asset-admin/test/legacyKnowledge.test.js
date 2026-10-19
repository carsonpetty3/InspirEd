const { test } = require('node:test')
const assert = require('node:assert/strict')
const { buildLegacyContextAndCitations } = require('../lib/legacyKnowledge')

const hit = (source, text, similarity) => ({ chunk: { id: text, text, source, chunkIndex: 0 }, similarity })

test('no matches gives no context and no citations', () => {
  assert.deepEqual(buildLegacyContextAndCitations([]), { context: '', citations: [] })
})

test('each match is numbered in the context so answers can cite [1], [2]…', () => {
  const { context } = buildLegacyContextAndCitations([
    hit('Nogee-surfactant', 'SP-B deficiency is inherited.', 0.8),
    hit('pulmonary-surfactant-1', 'Surfactant lowers surface tension.', 0.6),
  ])
  assert.match(context, /\[Source 1: Nogee surfactant\]/)
  assert.match(context, /\[Source 2: pulmonary surfactant\]/)
  assert.match(context, /use the marker \[2\]/)
})

test('several chunks from the same source become one citation', () => {
  const { citations } = buildLegacyContextAndCitations([
    hit('Nogee-surfactant', 'First chunk.', 0.55),
    hit('Nogee-surfactant', 'Second chunk.', 0.71),
    hit('pulmonary-surfactant-1', 'Other source.', 0.4),
  ])
  assert.equal(citations.length, 2)
  assert.equal(citations[0].sourceTitle, 'Nogee surfactant')
  assert.equal(citations[0].similarity, 71) // best score for that source, as a percentage
  assert.match(citations[0].excerpt, /First chunk\. \.\.\. Second chunk\./)
})

test('long excerpts are trimmed for display', () => {
  const { citations } = buildLegacyContextAndCitations([
    hit('a', 'x'.repeat(150), 0.5),
    hit('a', 'y'.repeat(150), 0.5),
  ])
  assert.ok(citations[0].excerpt.length <= 203)
  assert.ok(citations[0].excerpt.endsWith('...'))
})
