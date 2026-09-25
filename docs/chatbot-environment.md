# AI features — environment variables & secrets

Every AI feature (visit transcription and summaries, Ask AI, lessons, planner questions) runs on the **asset-admin server** (`asset-admin/lib/ai.js`, routes under `/api/ai/*`). The Expo app only calls those routes, so **no secret is ever in the app bundle**.

Ask AI, lessons and medical-term explanations only use approved library content. When nothing relevant is found, the app says so instead of asking Gemini.

For hosting, see **[deployment.md](./deployment.md)**. For Mongo/RAG setup, see **[rag-mongodb-setup.md](./rag-mongodb-setup.md)**.

---

## Do not commit these

| Item | Why |
|------|-----|
| **`GEMINI_API_KEY`** | Grants paid API access; treat like a password. |
| **`MONGO_URI`** | Contains cluster host + credentials. |
| **`GOOGLE_SERVICE_ACCOUNT_JSON`** | Private key for the Drive video folder. |
| **`ADMIN_PASSWORD`**, **`BLOB_READ_WRITE_TOKEN`** | Access to content admin and file storage. |
| **`asset-admin/.env`** | Holds all of the above locally (gitignored). Use `.env.example` as the template. |

Never put any of these in `app.json`, `app.config.js`, or an `EXPO_PUBLIC_*` variable — all of those are bundled into the app and readable by anyone.

---

## Expo app

| Variable / config | Purpose |
|-------------------|---------|
| **`RAG_API_URL`** in `app.json` → `expo.extra` | Server the native app calls: a LAN asset-admin (`http://192.168.x.x:3000`) or the Vercel URL. Not a secret. |
| **`EXPO_PUBLIC_API_URL`** (optional) | Overrides the above; use `http://localhost:3000` for `npx expo start --web`. The deployed web app needs nothing — it calls its own origin. |

---

## asset-admin server

Set in `asset-admin/.env` locally, and in Vercel → Settings → Environment Variables when deployed.

| Variable | Required | Purpose |
|----------|----------|---------|
| **`GEMINI_API_KEY`** | Yes | All AI features, PDF extraction and embeddings. Use a paid-tier key (free-tier prompts may be used by Google). |
| **`MONGO_URI`** | Deployed: yes. Local: optional | Content database. Without it, AI answers fall back to `assets/medical-knowledge.json`. |
| **`ADMIN_PASSWORD`** | Deployed: yes | Login for `/admin` and all content-changing routes. Unset on Vercel = admin disabled; unset locally = open. |
| **`BLOB_READ_WRITE_TOKEN`** | Deployed: yes (auto-added when you connect a Blob store) | Stores uploaded content and long web recordings. Recordings are deleted right after transcription. |
| **`GOOGLE_SERVICE_ACCOUNT_JSON`**, **`GOOGLE_DRIVE_VIDEO_FOLDER_ID`** | No | Drive video library; the app shows demo videos without them. |
| **`REQUIRE_CLINICAL_REVIEW`** | No | `true` = only answer from assets marked clinically reviewed, and skip the legacy JSON fallback. |
| **`ALLOWED_ORIGINS`** | No | Extra origins allowed to call the API cross-origin. |
| **`PORT`** | No | Local listen port (default 3000). |

---

## Related docs

- **[deployment.md](./deployment.md)** — Vercel hosting and CI/CD
- **[rag-mongodb-setup.md](./rag-mongodb-setup.md)** — End-to-end Mongo RAG wiring
- **[rag-evaluation-checklist.md](./rag-evaluation-checklist.md)** — Smoke-test checklist
