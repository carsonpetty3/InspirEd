# RAG evaluation checklist (prototype)

Run before demos or releases when changing retrieval, prompts, or ingest.

## Setup

- [ ] `asset-admin` running with `MONGO_URI` and `GEMINI_API_KEY`
- [ ] At least one asset is **RAG ready** (Browse shows “RAG ready” or `embedding_status: ready`)
- [ ] Caregiver `.env` `EXPO_PUBLIC_RAG_API_URL` points at asset-admin (use LAN IP for a physical device)

## Retrieval sanity

- [ ] `POST /api/rag/retrieve` with a topic from your corpus returns non-empty `context` + `citations`
- [ ] `POST /api/rag/chat` returns an `answer` that cites `[1]`, `[2]` only when those markers appear in `context`

## Grounding

- [ ] Ask a question **not** covered by sources → answer declines or says sources are insufficient (no invented specifics)
- [ ] Ask a question clearly in the corpus → answer stays consistent with retrieved excerpts

## Latency (informal)

- [ ] First chat turn after cold start is acceptable on Wi‑Fi (< ~10s prototype tolerance)
- [ ] Repeat question uses same stack without noticeable regression

## Admin UX

- [ ] Optional “Generate embeddings” on upload queues a job; Browse shows status transitions
- [ ] Failed ingest surfaces `embedding_last_error` in Browse detail panel

## Migration Reminders

- [ ] Move Gemini key server-side and add auth before any production deployment
