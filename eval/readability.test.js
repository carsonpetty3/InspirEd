const { test } = require('node:test')
const assert = require('node:assert/strict')
const { smogGrade, answerToPlainText, answerGrade } = require('./readability')

// Expected grades were produced by the app's own utils/textAnalysis.ts on the same text.
test('matches the app\'s SMOG grades', () => {
  assert.equal(smogGrade('Oxygen is like fuel for the body. Every cell needs it to make energy and stay healthy.'), 10)
  assert.equal(smogGrade('Surfactant is a slippery mix of fats and protein. It keeps the tiny air sacs open.'), 8)
  assert.equal(smogGrade('The cat sat on the mat. It was a sunny day. Everyone was happy and relaxed outside.'), 7)
  assert.equal(
    smogGrade('Pulmonary surfactant reduces alveolar surface tension, preventing atelectasis during expiration; deficiencies in surfactant protein B produce severe neonatal respiratory distress.'),
    18
  )
})

test('very short or empty text gets the app\'s default of grade 8', () => {
  assert.equal(smogGrade('Hi'), 8)
  assert.equal(smogGrade(''), 8)
})

test('Markdown, citation and image markers are stripped before scoring', () => {
  const plain = answerToPlainText('**Surfactant** keeps air sacs open [1].\n\n[[image:2]]\n\n## What it does')
  assert.equal(plain, 'Surfactant keeps air sacs open . What it does.')
})

test('bullet points count as separate sentences, not one long one', () => {
  const answer = 'Here is how it works:\n- Breathing in brings air\n- Oxygen moves into the blood\n- Carbon dioxide leaves'
  assert.equal(answerToPlainText(answer).match(/\./g).length, 4)
  assert.ok(answerGrade(answer) <= smogGrade(answer)) // never scored harder than the raw text
})
