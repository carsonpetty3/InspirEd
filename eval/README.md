# Chat evaluation benchmark

Measures how well the Ask AI chat answers from approved library sources and follows the
safeguards (no made-up information, no diagnosing, no care instructions without the doctor,
respectful language, and so on). Ticket: CS4273_S2_Ticket 7.

## What's here

- `questions.csv`: the 100 test questions (7 categories). Each row says what a good answer
  does, what counts as a failure, the expected library source and the safeguards it tests.
  Opens in Excel or Google Sheets. **Draft: waiting on mentor review.**
- `run.js`: asks the chat every question, scores the answers and writes a report.
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
   node eval/run.js --base https://...  # a deployed site instead of localhost
   ```

A full run takes a while: it pauses between questions and waits out rate limits. Use a paid
API key for full runs; the free tier runs out quickly.

Optional settings: `EVAL_JUDGE_MODEL` (default `gemini-3.8-flash`) and `EVAL_DELAY_MS`
(pause between questions, default 6000).

## Known limits

- The judge only sees short excerpts of the cited sources, so it can miss subtle
  made-up details. Spot-check its verdicts.
- The two videos have no transcripts, so questions that expect them will fail until
  transcripts are uploaded.
