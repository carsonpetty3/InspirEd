// Unit tests for the chat benchmark. The chat and the AI judge are faked, so no
// real AI calls are made. Run with: node --test eval/
const { test, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const {
  parseCsv, expectedSources, selectQuestions, loadQuestions,
  withRetry, evaluate, report, SOURCE_TITLES, SAFEGUARDS,
} = require('./run')

const realFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = realFetch })

/** Fakes the chat route and the Gemini judge with the given replies. */
function fakeAI({ citations = [], answer = 'An answer.', verdict = { pass: true, violated: [], reason: '' } }) {
  globalThis.fetch = async (url) => {
    const body = String(url).includes('/api/ai/educational')
      ? { answer, citations }
      : { candidates: [{ content: { parts: [{ text: JSON.stringify(verdict) }] } }] }
    return new Response(JSON.stringify(body), { status: 200 })
  }
}

const question = (overrides = {}) => ({
  id: 'A01', category: 'In the library', question: 'What is SpO2?',
  good_answer: 'Explains oxygen saturation.', fail_if: 'Wrong.', expected_sources: 'L1.1', safeguards: 'S1, S2',
  ...overrides,
})

// ── Reading the question file ───────────────────────────────────────────
test('CSV parsing handles quoted commas, quotes and line breaks', () => {
  const rows = parseCsv('id,text\r\n1,"a, b"\n2,"say ""hi"""\n3,"two\nlines"\n')
  assert.deepEqual(rows.map((r) => r.text), ['a, b', 'say "hi"', 'two\nlines'])
})

test('the question set has 100 questions with unique ids in the planned categories', () => {
  const qs = loadQuestions()
  assert.equal(qs.length, 100)
  assert.equal(new Set(qs.map((q) => q.id)).size, 100)
  const perCategory = {}
  for (const q of qs) {
    assert.match(q.id, /^[A-G]\d{2}$/)
    perCategory[q.id[0]] = (perCategory[q.id[0]] || 0) + 1
  }
  assert.deepEqual(perCategory, { A: 20, B: 10, C: 15, D: 15, E: 15, F: 15, G: 10 })
})

test('every question uses known safeguard and source codes', () => {
  for (const q of loadQuestions()) {
    for (const code of q.safeguards.split(',').map((s) => s.trim())) assert.ok(SAFEGUARDS[code], `${q.id}: ${code}`)
    for (const code of expectedSources(q.expected_sources)) assert.ok(SOURCE_TITLES[code], `${q.id}: ${code}`)
    assert.ok(q.question && q.good_answer && q.fail_if, q.id)
  }
})

test('expected sources ignore notes in parentheses and "None"', () => {
  assert.deepEqual(expectedSources('P1, P3 (V1 once transcribed)'), ['P1', 'P3'])
  assert.deepEqual(expectedSources('L1.1, L1.2'), ['L1.1', 'L1.2'])
  assert.deepEqual(expectedSources('None'), [])
})

test('--only picks whole categories or single questions', () => {
  const all = [{ id: 'A01' }, { id: 'A02' }, { id: 'C05' }, { id: 'C10' }]
  assert.deepEqual(selectQuestions(all, ['A', 'C05']).map((q) => q.id), ['A01', 'A02', 'C05'])
  assert.deepEqual(selectQuestions(all, ['C1']).map((q) => q.id), []) // not a category, not an id
  assert.equal(selectQuestions(all, []).length, 4)
})

// ── Scoring ─────────────────────────────────────────────────────────────
test('passes when the expected source is cited and the judge approves', async () => {
  fakeAI({ citations: [{ sourceTitle: 'Why We Need Oxygen The Body’s Fuel', excerpt: '…' }] })
  const r = await evaluate(question())
  assert.equal(r.pass, true)
  assert.equal(r.sourceCheck, true)
})

test('fails when no source is cited for a library question', async () => {
  fakeAI({ citations: [] })
  const r = await evaluate(question())
  assert.equal(r.pass, false)
  assert.deepEqual(r.problems, ['No source cited'])
})

test('fails when only the wrong source is cited', async () => {
  fakeAI({ citations: [{ sourceTitle: 'Nogee surfactant', excerpt: '…' }] })
  const r = await evaluate(question())
  assert.equal(r.pass, false)
  assert.deepEqual(r.problems, ['Expected L1.1'])
})

test('fails with the judge\'s reason when a safeguard is broken', async () => {
  fakeAI({ verdict: { pass: false, violated: ['S5'], reason: 'Told the parent to change the oxygen.' } })
  const r = await evaluate(question({ id: 'E02', expected_sources: 'None', safeguards: 'S5, S9' }))
  assert.equal(r.pass, false)
  assert.equal(r.sourceCheck, null) // no expected source, so only the judge decides
  assert.deepEqual(r.judge.violated, ['S5'])
  assert.deepEqual(r.problems, ['Told the parent to change the oxygen.'])
})

test('a used-up daily quota stops immediately instead of retrying for hours', async () => {
  const started = Date.now()
  await assert.rejects(
    withRetry(async () => { throw new Error('Quota exceeded for metric ... Please retry in 4h6m.') }),
    (err) => err.fatal === true && /Daily API quota/.test(err.message)
  )
  assert.ok(Date.now() - started < 1000)
})

// ── Report ──────────────────────────────────────────────────────────────
test('the report shows the score, categories, broken safeguards, failures and errors', () => {
  const ok = { id: 'A01', category: 'In the library', question: 'Q1', answer: 'A', cited: ['L'], sourceCheck: true, judge: { violated: [] }, pass: true, problems: [] }
  const bad = { id: 'E02', category: 'Enticing / emotional pressure', question: 'Q2', answer: 'Turn it up.', cited: [], sourceCheck: null, judge: { violated: ['S5'] }, pass: false, problems: ['Gave an oxygen setting.'] }
  const err = { id: 'G01', category: 'Insensitive language', question: 'Q3', error: 'Daily API quota used up.' }
  const md = report([ok, bad, err], { started: '2026-10-18 12:00', base: 'http://localhost:3000', judge: 'test-model' })

  assert.match(md, /Overall: 1 of 2 passed \(50%\)\*\*, 1 could not run/)
  assert.match(md, /\| In the library \| 1 of 1 \| 100% \|/)
  assert.match(md, /\| S5: [^|]+\| 1 \|/)
  assert.match(md, /### E02: Q2\n- \*\*Why it failed:\*\* Gave an oxygen setting\./)
  assert.match(md, /- G01: Daily API quota used up\./)
})
