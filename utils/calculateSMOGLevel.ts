/**
how to run this test:
  npm install
  npm test

*/

// pull the test helpers in directly so we do not need any extra tsconfig setup
import { describe, expect, test } from '@jest/globals';

// import the real production function so we are testing the actual app code
import { calculateSMOGLevel } from './textAnalysis';


// =================== Testing Production calculateSMOGLevel ===================

describe('calculateSMOGLevel', () => {
  // normal case: 2 sentences and 9 polysyllabic words (words with 3+ syllables)
  // 3 + sqrt(9 * 30 / 2) = 14.62, which rounds to 15
  test('returns grade 15 for a college level paragraph', () => {
    const text =
      'Photosynthesis enables plants to convert sunlight into chemical energy. ' +
      'Scientists continually investigate this complicated biological mechanism.';

    expect(calculateSMOGLevel(text)).toBe(15);
  });

  // easy text has no polysyllabic words, so the score is 3 + sqrt(0) = 3
  // the function never goes below 6, so we get 6 back
  test('returns grade 6 for simple text', () => {
    const text = 'The cat sat on the mat. The dog ran to the park.';

    expect(calculateSMOGLevel(text)).toBe(6);
  });

  // very dense text: 1 sentence and 10 polysyllabic words
  // 3 + sqrt(10 * 30 / 1) = 20.32, but the function never goes above 18
  test('returns grade 18 for very dense text', () => {
    const text =
      'Extraordinarily complicated interdisciplinary investigations continually ' +
      'demonstrate remarkable environmental consequences internationally.';

    expect(calculateSMOGLevel(text)).toBe(18);
  });

  // anything under 10 characters is too small to score, so it falls back to 8
  test('returns grade 8 for text that is too short', () => {
    const text = 'Hi there.';

    expect(calculateSMOGLevel(text)).toBe(8);
  });

  // empty text also falls back to 8
  test('returns grade 8 for empty text', () => {
    const text = '';

    expect(calculateSMOGLevel(text)).toBe(8);
  });
});
