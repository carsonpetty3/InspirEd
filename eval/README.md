# Chat evaluation benchmark

Measures how well the Ask AI chat answers from approved library sources and follows the
safeguards (no made-up information, no diagnosing, no care instructions without the doctor,
respectful language, and so on). Tickets: CS4273_S2_Ticket 7 and 8.

It tests the team's real chat: `POST /api/rag/chat` on the asset-admin server, the same route
the app's Ask AI uses. Point it at `main` or at any teammate's branch to compare them.

## What's here

- `questions.csv`: the 100 test questions (7 categories). Each row says what a good answer
  does, what counts as a failure, the expected library source and the safeguards it tests.
  Opens in Excel or Google Sheets. **Draft: waiting on mentor review.**
- `run.js`: asks the chat every question, scores the answers and writes a report. Also records
  any images the chat shows (the `images` list from the multimodal-retrieval branch).
- `readability.js`: reading grade of an answer, using the app's SMOG formula.
- `results/`: one folder per run with `report.md` (readable summary) and `results.json`
  (everything). Not committed to git.

## How a question is scored

1. **Source check** (questions with an expected source): did the answer cite a library
   source, and was it the expected one?
2. **AI judge**: a second AI call checks the answer against that question's expected
   behavior and the safeguards, and gives a one-line reason.

A question passes only if both checks pass.

## Running it

1. Put `GEMINI_API_KEY` and `MONGO_URI` in `asset-admin/.env` (see `asset-admin/.env.example`).
2. Start the server:
   ```bash
   cd asset-admin && npm start
   ```
3. In another terminal, from the repo root:
   ```bash
   node eval/run.js                     # all 100 questions
   node eval/run.js --only A,C05        # one category, or specific ids
   node eval/run.js --label main        # name the run (shown in the report and folder name)
   node eval/run.js --base https://...  # a deployed site instead of localhost
   ```

A full run takes a while: it pauses between questions and waits out rate limits. Use a paid
API key for full runs; the free tier runs out quickly.

Optional settings: `EVAL_JUDGE_MODEL` (default `gemini-3.8-flash`) and `EVAL_DELAY_MS`
(pause between questions, default 6000). Each AI request times out after 1–2 minutes, so a
stuck request is reported as an error instead of hanging the run.

### Literacy check

```bash
node eval/run.js --literacy                 # the 20 "In the library" questions
node eval/run.js --literacy --only A01,A06  # a few of them
```

Asks each library question twice, at reading level 6 and 14 (the app's two demo profiles), and
scores both answers with the same SMOG formula the app uses in onboarding (`readability.js`,
checked against `utils/textAnalysis.ts`). A question **adapted** when the level-14 answer reads
at least 2 grades harder than the level-6 one, and both still cite the expected source. The
report also shows average grades at each level and how many level-6 answers were at grade 8 or
below. SMOG scores short texts high (Lesson 1.1's own simple sentences score about grade 10), so
the gap is the main signal. Both thresholds are in `LITERACY` at the top of `run.js`.

This mode doesn't use the AI judge: it costs 2 chat requests per question.

### Testing a teammate's branch

Run that branch's server from a separate copy of the repo, then point the benchmark at it:

```bash
git worktree add ../InspirEd-test origin/FEATURE/multimodal-retrieval
cp asset-admin/.env ../InspirEd-test/asset-admin/.env
cd ../InspirEd-test/asset-admin && npm install && PORT=3001 npm start
# back in this repo, another terminal:
node eval/run.js --base http://localhost:3001 --label multimodal-retrieval --only A01,B09
git worktree remove ../InspirEd-test     # when done
```

Note: `main`'s server still uses `gemini-2.5-flash`, which Google retired for new API keys, so
benchmarking `main` with a new key fails until the configurable-model change (`FIX/chat-gemini`)
is merged.

## Tests

```bash
node --test eval/*.test.js
```

Checks the question file (100 questions, valid codes), the scoring rules and the report,
using a fake chat and judge, so no API key is needed. Once the hosting PR adds CI, it can run
these on every PR too.

## Known limits

- The judge only sees short excerpts of the cited sources, so it can miss subtle
  made-up details. Spot-check its verdicts.
- The two videos have no transcripts, so questions that expect them will fail until
  transcripts are uploaded.
