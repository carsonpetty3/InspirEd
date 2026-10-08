# Web deployment (Vercel)

> **Demo use only: scripted appointments and test profiles. No real patient or family data.**
> Vercel's standard plans have no HIPAA agreement (BAA). Real data must wait for the
> planned move to Google Cloud under a BAA.

## Current status

Update this table whenever the deployment changes.

| | |
|---|---|
| Vercel account | Yale's personal account (temporary). Moving to **InspirEd@gmail.com**, see [Moving to the shared account](#moving-to-the-shared-account). |
| Production URL | https://inspired-rose.vercel.app |
| Deployed from | `FEATURE/web-deployment`, from a laptop with `npx vercel --prod` |
| Secrets set | None yet. The app loads, but Ask AI, transcription and the Learn tab show error messages until `GEMINI_API_KEY` and `MONGO_URI` are added. The admin page stays disabled until `ADMIN_PASSWORD` is set. |
| Automatic deploys | Off until the GitHub secrets are added, see [Automatic deploys](#automatic-deploys-github-actions). |

## How it's put together

| Piece | Where it runs |
|-------|---------------|
| Web app (`npx expo export -p web` → `dist/`) | Vercel static hosting / CDN |
| API + content admin (`asset-admin/app.js`) | One Vercel Function, `api/index.js` |
| Content database | MongoDB Atlas |
| Uploaded content files, long recordings | Vercel Blob |

`vercel.json` sends `/api/*`, `/assets/*`, `/upload` and `/admin/*` to the function; everything else serves the web app. It also sets security headers (CSP, HSTS, no framing, `noindex` so demos stay out of search engines).

The web app calls its own origin, so it needs no configuration. Every secret is a server-side environment variable — see [chatbot-environment.md](./chatbot-environment.md).

## Deploying from a laptop

This is how the site is deployed today. You need Node.js and access to the Vercel account.

### First time on a computer

1. Switch to the branch you want to deploy:
   ```bash
   git switch FEATURE/web-deployment
   ```
2. Sign the Vercel command-line tool in. Signing in on the website is not enough. This prints a link; open it, check the code matches, and click **Allow**:
   ```bash
   npx vercel login
   ```
3. Link the repo to the `inspired` project (creates it if it doesn't exist):
   ```bash
   npx vercel link --yes --project inspired
   ```
   This writes `.vercel/project.json` (gitignored). Two things to expect:
   - **"Failed to connect carsonpetty3/InspirEd"** — expected. Vercel can't reach the private repo, and we don't use its Git integration anyway.
   - It creates a `.env.local` file and appends `.env*` to `.gitignore`. Delete the file and undo the `.gitignore` change; the repo already ignores `.env*.local`:
     ```bash
     rm -f .env.local && git checkout -- .gitignore
     ```

### Every deploy

```bash
npx vercel --prod
```

It builds on Vercel's servers (a few minutes) and prints the production URL. The site runs on Vercel, so it stays up when your laptop is off. It only changes when someone deploys again.

Environment variables only take effect on the **next** deploy, so redeploy after adding or changing one.

## Environment variables

Add each one for **Production** and **Preview**, either in the dashboard (**Settings → Environment Variables**) or with:

```bash
npx vercel env add GEMINI_API_KEY
```

| Variable | Notes |
|---|---|
| `GEMINI_API_KEY` | Paid tier (free-tier prompts may be used by Google). Create it under the shared InspirEd Google account so it doesn't have to move later. |
| `MONGO_URI` | The team connection string **with `/test` added before the `?`**, e.g. `mongodb+srv://USER:PASSWORD@asset-library.z3ldnet.mongodb.net/test?appName=asset-library`. See [MongoDB Atlas](#mongodb-atlas). |
| `ADMIN_PASSWORD` | Any long random string, e.g. from `openssl rand -base64 18`. |
| `BLOB_READ_WRITE_TOKEN` | Added automatically when you connect a Blob store: **Storage → Create → Blob**, connected to all environments. |
| `GOOGLE_SERVICE_ACCOUNT_JSON`, `GOOGLE_DRIVE_VIDEO_FOLDER_ID` | Optional (Drive video library). |

Never use `EXPO_PUBLIC_*` names for these: those are built into the public web app.

Check what's set with `npx vercel env ls`.

## MongoDB Atlas

- **Which database:** the team's content lives in the **`test`** database. The shared connection string doesn't name a database, so MongoDB falls back to `test`. Put `/test` in `MONGO_URI` explicitly so this can't silently change. The separate `asset-library` database only holds old test entries and isn't used.
- **Network Access:** Vercel has no fixed IP addresses, so the Atlas project must allow `0.0.0.0/0`. Ask whoever manages Atlas to check.
- **Database user:** prefer a separate user just for the live site, with read/write on that one database. Then the shared team password can change without breaking the site.
- **Browsing the data:** MongoDB Compass (paste the connection string), or run the admin page locally: put `MONGO_URI` in `asset-admin/.env`, run `npm start` in `asset-admin/`, and open http://localhost:3000/admin/browse.html. Both edit the real shared database.

## Automatic deploys (GitHub Actions)

`.github/workflows/deploy.yml` runs on every pull request and every push to `main`:

1. **Check:** type check, lint (non-blocking for now), web build, a scan that fails if an API key or private key ends up in the bundle, and a check that the server loads.
2. **Deploy:** pull requests get a **preview URL** ("View deployment" on the PR); merges to `main` update **production**.

The deploy step is **skipped** (with a note in the run summary) until the repo owner adds three secrets under **GitHub → Settings → Secrets and variables → Actions**:

| Secret | Where to get it |
|---|---|
| `VERCEL_TOKEN` | Vercel → **Account Settings → Tokens** |
| `VERCEL_ORG_ID` | `orgId` in `.vercel/project.json` after `vercel link` |
| `VERCEL_PROJECT_ID` | `projectId` in the same file |

These point at whichever Vercel account created them, so update them after moving to the shared account.

Deploys go through GitHub Actions rather than Vercel's Git integration because the Hobby plan blocks Git deploys of private-repo commits by anyone but the account owner.

## Moving to the shared account

The Hobby plan can't transfer a project into another Hobby account, so recreate it under InspirEd@gmail.com (about 10 minutes):

1. Sign up at vercel.com with InspirEd@gmail.com (Hobby).
2. Switch the command-line tool to it and remove the old link:
   ```bash
   npx vercel logout
   npx vercel login
   rm -rf .vercel
   ```
3. Follow [Deploying from a laptop](#deploying-from-a-laptop) again, then re-add the environment variables and the Blob store. Re-upload any content files that were stored in the old Blob store.
4. Update the GitHub secrets (new token and IDs) and the [Current status](#current-status) table.
5. Delete the old project: its dashboard → **Settings → General → Delete Project**. Its URL stops working, so share the new one.

At the end of the semester, hand over the account by changing the shared email's password; nothing needs to move.

## Using it

- **App:** the production URL opens in any desktop browser. The production URL is **public** — anyone with the link can open it.
- **Content admin:** `<url>/admin/`. Sign in with any username and `ADMIN_PASSWORD`. Files are limited to 4.5 MB per upload through the deployed admin; for large videos, run asset-admin locally with the same `MONGO_URI` and `BLOB_READ_WRITE_TOKEN` in `asset-admin/.env` so files land in the shared store.
- **Phones (Expo Go):** set `RAG_API_URL` in `app.json` to the production URL to use the hosted API without running a server.
- **Custom domain:** when the final URL is ready, add it under **Settings → Domains** and create the DNS record Vercel shows. HTTPS is automatic.
- **Logs:** dashboard → **Logs**, or `npx vercel logs <url>`.

## Limits to know

- Function time limit is 300 s. Long appointments (30 min+) may be close; keep demo recordings short.
- Recordings over ~3 MB upload directly from the browser to Blob and are deleted as soon as they are transcribed.
- Rate limits: 20 AI requests/min and 40 RAG requests/min per server instance.
- Audio and transcripts are sent to Google Gemini for processing.
- Visits and profiles are stored in the browser's local storage. Anyone using the same browser can see them, so use a private window on shared computers.
