"""
how to run this test:
  python3 utils/calculate_smog_level.py

this is a python copy of calculateSMOGLevel from textAnalysis.ts.
it has to behave exactly the same so the test result matches the other languages.
"""

import math
import re
import unittest

VOWELS = "aeiouy"

# =================== Implementing calculateSMOGLevel ===================
def count_syllables(word):
    # keep only the letters and make everything lowercase
    word = re.sub(r"[^a-z]", "", word.lower())

    # very short words are always one syllable
    if len(word) <= 3:
        return 1

    # count each new group of vowels as one syllable
    syllable_count = 0
    previous_was_vowel = False
    for letter in word:
        is_vowel = letter in VOWELS
        if is_vowel and not previous_was_vowel:
            syllable_count += 1
        previous_was_vowel = is_vowel

    # a silent "e" on the end does not make its own syllable
    if word.endswith("e"):
        syllable_count -= 1

    # but words like "table" or "little" do get that syllable back
    if word.endswith("le") and len(word) > 2 and word[-3] not in VOWELS:
        syllable_count += 1

    # every word is worth at least one syllable
    return max(1, syllable_count)


def count_sentences(text):
    # every run of . ! or ? counts as one sentence ending
    endings = re.findall(r"[.!?]+", text)
    return len(endings) if endings else 1


def count_polysyllabic_words(text):
    # polysyllabic means the word has 3 or more syllables
    words = re.findall(r"\b[a-zA-Z]+\b", text)
    return len([word for word in words if count_syllables(word) >= 3])


def calculate_smog_level(text):
    # not enough text to judge, so fall back to grade 8
    if not text or len(text.strip()) < 10:
        return 8

    sentences = count_sentences(text)
    polysyllables = count_polysyllabic_words(text)

    if sentences == 0:
        return 8

    smog = 3 + math.sqrt((polysyllables * 30) / sentences)

    # floor(x + 0.5) rounds half up, the same way javascript's Math.round does
    rounded = math.floor(smog + 0.5)

    # keep the grade inside the 6 to 18 range
    return max(6, min(18, rounded))

# =================== Testing calculateSMOGLevel ===================

class CalculateSMOGLevelTest(unittest.TestCase):
    # normal case: 2 sentences and 9 polysyllabic words (words with 3+ syllables)
    # 3 + sqrt(9 * 30 / 2) = 14.62, which rounds to 15
    def test_returns_grade_15_for_a_college_level_paragraph(self):
        text = (
            "Photosynthesis enables plants to convert sunlight into chemical energy. "
            "Scientists continually investigate this complicated biological mechanism."
        )

        self.assertEqual(calculate_smog_level(text), 15)

    # easy text has no polysyllabic words, so the score is 3 + sqrt(0) = 3
    # the function never goes below 6, so we get 6 back
    def test_returns_grade_6_for_simple_text(self):
        text = "The cat sat on the mat. The dog ran to the park."

        self.assertEqual(calculate_smog_level(text), 6)

    # very dense text: 1 sentence and 10 polysyllabic words
    # 3 + sqrt(10 * 30 / 1) = 20.32, but the function never goes above 18
    def test_returns_grade_18_for_very_dense_text(self):
        text = (
            "Extraordinarily complicated interdisciplinary investigations continually "
            "demonstrate remarkable environmental consequences internationally."
        )

        self.assertEqual(calculate_smog_level(text), 18)

    # anything under 10 characters is too small to score, so it falls back to 8
    def test_returns_grade_8_for_text_that_is_too_short(self):
        text = "Hi there."

        self.assertEqual(calculate_smog_level(text), 8)

    # empty text also falls back to 8
    def test_returns_grade_8_for_empty_text(self):
        text = ""

        self.assertEqual(calculate_smog_level(text), 8)


if __name__ == "__main__":
    unittest.main()
