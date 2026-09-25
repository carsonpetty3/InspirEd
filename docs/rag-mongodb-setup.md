# Mongo-backed RAG (setup guide)

Educational **chunks** can live in **MongoDB** on two tiers:

1. **Recommended (prototype → prod path):** Mongoose model **`Chunk`** — created when you **generate embeddings** for an uploaded asset (upload wizard optional toggle, or **Browse → Generate embeddings**). Retrieval uses **`POST /api/rag/retrieve`** and chat orchestration uses **`POST /api/rag/chat`** on **`asset-admin`**.
2. **Legacy / bulk import:** Collection synced from **`assets/medical-knowledge.json`** via **`npm run sync-rag`** (`RagChunk`). **`POST /api/rag/search`** still queries this collection for backwards compatibility.

The Expo app:

- Calls **`/api/ai/*`** on asset-admin (`RAG_API_URL` on native; its own origin on the web). The Gemini key lives only on the **server** (`GEMINI_API_KEY`).
- Retrieval tries Mongo **`Chunk`** first, then the legacy **`RagChunk`** collection, then **`assets/medical-knowledge.json`** on the server.

**Secrets / env overview:** **[chatbot-environment.md](./chatbot-environment.md)**.

| Piece | Location |
|--------|-----------|
| Chunk storage (ingested assets) | MongoDB collection **`chunks`** (Mongoose `Chunk`) |
| Legacy JSON-backed chunks | **`ragchunks`** / `RagChunk` |
| “Retrieve passages” | `POST /api/rag/retrieve` (**preferred**) or `POST /api/rag/search` (legacy) |
| “Grounded chat reply” | `POST /api/rag/chat` on asset-admin |
| Optional JSON → legacy Mongo | `npm run sync-rag` in **asset-admin** |
| PDF → JSON (offline corpus) | `node scripts/process-pdfs.js` at repo root |

## Prerequisites

- **MongoDB Atlas** (or other Mongo) — connection string ready  
- **Google Gemini API key** (embeddings + chat on server; mobile still uses Gemini for non-RAG features)  
- Node 18+

## 1. Configure `asset-admin`

From `asset-admin/`:

1. Copy `.env.example` → `.env` (do **not** commit `.env`).
2. Set:
   - **`MONGO_URI`** — Atlas connection string  
   - **`GEMINI_API_KEY`** — required for ingestion (PDF extract, embeddings) and for all **`/api/rag/*`** and **`/api/ai/*`** routes  
   - **`PORT`** — optional, default `3000`

Atlas vector index (optional at small scale): see **[asset-admin/ATLAS_INDEX.md](../asset-admin/ATLAS_INDEX.md)**.

## 2. Install and start the server

```bash
cd asset-admin
npm install
npm start
```

You should see `Connected to MongoDB`, a prototype warning about unauthenticated RAG routes, and the listening URL.

## 3. Create chunks (embeddings)

**Option A — Upload wizard:** On **Review**, enable **Generate embeddings after submit** (optional).

**Option B — Browse:** Open **Browse**, pick an asset → **Generate embeddings**. Poll status via **`GET /assets/:id/embedding-status`** (the UI refreshes automatically).

Requires extractable text: **PDF / TXT / HTML**, or a **transcript** (`.txt`, `.vtt`, `.srt`) for video/audio.

## 4. Smoke-test the API

**Legacy stats (RagChunk):**  
`GET http://localhost:3000/api/rag/stats`

**Chunk retrieval (preferred):**

```bash
curl -s -X POST http://localhost:3000/api/rag/retrieve \
  -H "Content-Type: application/json" \
  -d '{"query":"pulmonary surfactant","topK":3}'
```

**Grounded chat:**

```bash
curl -s -X POST http://localhost:3000/api/rag/chat \
  -H "Content-Type: application/json" \
  -d '{"question":"What is surfactant?","readingLevel":8,"conversationHistory":[]}'
```

From the repo root you can also run **`node scripts/rag-smoke.mjs`** (set **`RAG_BASE`** and **`GEMINI_API_KEY`**).

## 5. Point the Expo app at asset-admin

1. Same Wi‑Fi as the phone/emulator; use the machine **LAN IP** (not `localhost` on device).

In **`app.json`** → `expo.extra`:

```json
"RAG_API_URL": "http://YOUR_LAN_IP:3000",
"PROTOTYPE_RAG_MODE": true
```

Or:

```bash
export EXPO_PUBLIC_RAG_API_URL=http://YOUR_LAN_IP:3000
npx expo start
```

**Security note:** `PROTOTYPE_RAG_MODE` documents that API keys and config may stay client-side; replace with proper auth and server-side secrets before production.

## Rebuilding the bundled JSON corpus (optional)

```bash
export GEMINI_API_KEY=your_key
node scripts/process-pdfs.js
cd asset-admin && npm run sync-rag
```

Chunk ingest uses **`gemini-embedding-001`** (768 dims via `outputDimensionality`). Align embedding models if you change providers.

## Troubleshooting

| Issue | Things to check |
|--------|------------------|
| `results: []` / empty chat | Asset **`embedding_status`** must be **`ready`**; ensure PDF/transcript produced text; lower **`minSimilarity`** only when testing legacy search |
| Cannot reach API from phone | Firewall; correct **LAN IP**; iOS ATS may block plain HTTP in release builds |
| `GEMINI_API_KEY is not configured` on server | Set key in **`asset-admin/.env`** (or Vercel environment variables). Client-supplied keys are ignored. |

## Security

- Never commit **`asset-admin/.env`** or real API keys.  
- **`POST /api/rag/*`** is rate-limited but **not** user-authenticated in this prototype — run behind a firewall or VPN when demoing with real keys.
