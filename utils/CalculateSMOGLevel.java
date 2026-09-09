/*
how to run this test (from inside the utils folder):
cd utils
(cd utils && export PATH="/Library/Java/JavaVirtualMachines/jdk-21.jdk/Contents/Home/bin:$PATH"; curl -sSL -o junit.jar https://repo1.maven.org/maven2/org/junit/platform/junit-platform-console-standalone/1.10.2/junit-platform-console-standalone-1.10.2.jar && javac -cp junit.jar CalculateSMOGLevel.java && java -jar junit.jar execute --class-path . --select-class CalculateSMOGLevel; status=$?; rm -f junit.jar CalculateSMOGLevel.class; exit $status)

Note: after running make sure to delete junit.ar and CalculateSMOGLevel.class

this is a java copy of calculateSMOGLevel from textAnalysis.ts.

*/

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.junit.jupiter.api.Test;

public class CalculateSMOGLevel {

    private static final String VOWELS = "aeiouy";

    static int countSyllables(String word) {
        // keep only the letters and make everything lowercase
        word = word.toLowerCase().replaceAll("[^a-z]", "");

        // very short words are always one syllable
        if (word.length() <= 3) {
            return 1;
        }

        // count each new group of vowels as one syllable
        int syllableCount = 0;
        boolean previousWasVowel = false;
        for (int i = 0; i < word.length(); i++) {
            boolean isVowel = VOWELS.indexOf(word.charAt(i)) >= 0;
            if (isVowel && !previousWasVowel) {
                syllableCount++;
            }
            previousWasVowel = isVowel;
        }

        // a silent "e" on the end does not make its own syllable
        if (word.endsWith("e")) {
            syllableCount--;
        }

        // but words like "table" or "little" do get that syllable back
        if (word.endsWith("le") && word.length() > 2 && VOWELS.indexOf(word.charAt(word.length() - 3)) < 0) {
            syllableCount++;
        }

        // every word is worth at least one syllable
        return Math.max(1, syllableCount);
    }

    static int countSentences(String text) {
        // every run of . ! or ? counts as one sentence ending
        Matcher matcher = Pattern.compile("[.!?]+").matcher(text);
        int endings = 0;
        while (matcher.find()) {
            endings++;
        }
        return endings > 0 ? endings : 1;
    }

    static int countPolysyllabicWords(String text) {
        // polysyllabic means the word has 3 or more syllables
        Matcher matcher = Pattern.compile("\\b[a-zA-Z]+\\b").matcher(text);
        int count = 0;
        while (matcher.find()) {
            if (countSyllables(matcher.group()) >= 3) {
                count++;
            }
        }
        return count;
    }

    static int calculateSMOGLevel(String text) {
        // not enough text to judge, so fall back to grade 8
        if (text == null || text.trim().length() < 10) {
            return 8;
        }

        int sentences = countSentences(text);
        int polysyllables = countPolysyllabicWords(text);

        if (sentences == 0) {
            return 8;
        }

        double smog = 3 + Math.sqrt((polysyllables * 30.0) / sentences);

        // Math.round rounds half up, then keep the grade inside the 6 to 18 range
        int rounded = (int) Math.round(smog);
        return Math.max(6, Math.min(18, rounded));
    }

    // normal case: 2 sentences and 9 polysyllabic words (words with 3+ syllables)
    // 3 + sqrt(9 * 30 / 2) = 14.62, which rounds to 15
    @Test
    void returnsGrade15ForACollegeLevelParagraph() {
        String text =
            "Photosynthesis enables plants to convert sunlight into chemical energy. "
                + "Scientists continually investigate this complicated biological mechanism.";

        assertEquals(15, calculateSMOGLevel(text));
    }

    // easy text has no polysyllabic words, so the score is 3 + sqrt(0) = 3
    // the function never goes below 6, so we get 6 back
    @Test
    void returnsGrade6ForSimpleText() {
        String text = "The cat sat on the mat. The dog ran to the park.";

        assertEquals(6, calculateSMOGLevel(text));
    }

    // very dense text: 1 sentence and 10 polysyllabic words
    // 3 + sqrt(10 * 30 / 1) = 20.32, but the function never goes above 18
    @Test
    void returnsGrade18ForVeryDenseText() {
        String text =
            "Extraordinarily complicated interdisciplinary investigations continually "
                + "demonstrate remarkable environmental consequences internationally.";

        assertEquals(18, calculateSMOGLevel(text));
    }

    // anything under 10 characters is too small to score, so it falls back to 8
    @Test
    void returnsGrade8ForTextThatIsTooShort() {
        String text = "Hi there.";

        assertEquals(8, calculateSMOGLevel(text));
    }

    // empty text also falls back to 8
    @Test
    void returnsGrade8ForEmptyText() {
        String text = "";

        assertEquals(8, calculateSMOGLevel(text));
    }
}
