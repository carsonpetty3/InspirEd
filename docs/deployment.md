# Web deployment (Vercel)

> **Demo use only: scripted appointments and test profiles. No real patient or family data.**
> Vercel's standard plans have no HIPAA agreement (BAA). Real data must wait for the
> planned move to Google Cloud under a BAA.

## How it's put together

| Piece | Where it runs |
|-------|---------------|
| Web app (`npx expo export -p web` → `dist/`) | Vercel static hosting / CDN |
| API + content admin (`asset-admin/app.js`) | One Vercel Function, `api/index.js` |
| Content database | MongoDB Atlas |
| Uploaded content files, long recordings | Vercel Blob |

`vercel.json` sends `/api/*`, `/assets/*`, `/upload` and `/admin/*` to the function; everything else serves the web app. It also sets security headers (CSP, HSTS, no framing, `noindex` so demos stay out of search engines).

The web app calls its own origin, so it needs no configuration. Every secret is a server-side environment variable — see [chatbot-environment.md](./chatbot-environment.md).

## CI/CD

`.github/workflows/deploy.yml` runs on every pull request and every push to `main`:

1. **Check:** type check, lint (non-blocking for now), web build, a scan that fails if an API key or private key ends up in the bundle, and a check that the server loads.
2. **Deploy:** pull requests get a **preview URL** ("View deployment" on the PR); merges to `main` update **production**.

Deploys go through GitHub Actions rather than Vercel's Git integration because the Hobby plan blocks Git deploys of private-repo commits by anyone but the account owner.

## One-time setup

### 1. Vercel project
1. Sign in at vercel.com and create a project named `inspired`. Don't connect the Git repo (Actions handles deploys), or if you do, turn off automatic deployments in **Settings → Git**.
2. Locally, run `npx vercel link` in the repo root and choose that project. This writes `.vercel/project.json` (gitignored) with the **orgId** and **projectId**.
3. Create a token: **Account Settings → Tokens**.

### 2. GitHub secrets (repo owner)
**Settings → Secrets and variables → Actions → New repository secret:**
- `VERCEL_TOKEN`
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`

### 3. Storage
In the Vercel project, **Storage → Create → Blob**, then connect it to the project. This adds `BLOB_READ_WRITE_TOKEN` automatically.

### 4. Environment variables
**Settings → Environment Variables**, for both Production and Preview:
- `GEMINI_API_KEY` (paid tier)
- `MONGO_URI`
- `ADMIN_PASSWORD`
- optional: `GOOGLE_SERVICE_ACCOUNT_JSON`, `GOOGLE_DRIVE_VIDEO_FOLDER_ID`

Never use `EXPO_PUBLIC_*` names for these.

### 5. MongoDB Atlas
Vercel has no fixed IP addresses, so under **Network Access** allow `0.0.0.0/0`, and use a database user that only has access to the InspirEd database. The free M0 tier is fine for demos.

### 6. Deployment protection (recommended)
**Settings → Deployment Protection → Vercel Authentication** keeps preview URLs private to team members.

## Using it

- **App:** the production URL (e.g. `https://inspired.vercel.app`) opens in any desktop browser.
- **Content admin:** `<url>/admin/`. Sign in with any username and `ADMIN_PASSWORD`. Files are limited to 4.5 MB per upload through the deployed admin; for large videos, run asset-admin locally with the same `MONGO_URI` and `BLOB_READ_WRITE_TOKEN` in `asset-admin/.env` so files land in the shared store.
- **Phones (Expo Go):** set `RAG_API_URL` in `app.json` to the production URL to use the hosted API without running a server.
- **Custom domain:** when the final URL is ready, add it under **Settings → Domains** and create the DNS record Vercel shows. HTTPS is automatic.

## Limits to know

- Function time limit is 300 s. Long appointments (30 min+) may be close; keep demo recordings short.
- Recordings over ~3 MB upload directly from the browser to Blob and are deleted as soon as they are transcribed.
- Rate limits: 20 AI requests/min and 40 RAG requests/min per server instance.
- Audio and transcripts are sent to Google Gemini for processing.
- Visits and profiles are stored in the browser's local storage. Anyone using the same browser can see them, so use a private window on shared computers.
