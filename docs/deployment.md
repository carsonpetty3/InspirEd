# Web deployment (Vercel)

> **Demo use only: scripted appointments and test profiles. No real patient or family data.**
> Vercel's standard plans have no HIPAA agreement (BAA). Real data must wait for the
> planned move to Google Cloud under a BAA.

## Current status

Update this table whenever the deployment changes.

| | |
|---|---|
| Vercel account | Moving to the shared project account (see [Moving to another account](#moving-to-another-account)). |
| Production URL | https://inspired-rose.vercel.app (changes when the account moves) |
| Deployed from | `main` (or a feature branch), from a laptop with `npx vercel --prod` |
| Environment variables | `MONGO_URI` |
| Automatic deploys | Off until the GitHub secrets are added (see [Automatic deploys](#automatic-deploys-github-actions)) |

## What works online

| Works | Not online yet |
|---|---|
| All app screens, onboarding, profiles, visit history | AI features (Ask AI, transcription, lessons, planner suggestions) |
| Learn tab modules and lesson PDFs/videos from the database | Uploading or editing content (use the admin page locally) |
| Recording a visit (saved without a transcript) | |

**Why AI is off:** on `main`, the app calls Gemini directly from the user's device, which needs
the API key inside the app. On a public website anyone could copy that key, so the web build
blanks it on purpose (`buildCommand` in `vercel.json`). AI on the website arrives with the
`FEATURE/server-side-ai` branch, which moves those calls onto the server.

## How it's put together

| Piece | Where it runs |
|-------|---------------|
| Web app (`npx expo export -p web` → `dist/`) | Vercel static hosting |
| Content API (`asset-admin/server.js`) | One Vercel Function, `api/index.js` |
| Content database | MongoDB Atlas |
| Lesson files in `asset-admin/uploads/` | Copied into the site at build time |

`vercel.json` sends `/api/*` and `/assets/*` to the function; everything else serves the web
app. Online, the function is **read-only**: it refuses uploads, edits and deletes. The admin
page (`/admin`) is not routed at all, so content is still managed by running `asset-admin`
locally. It also sets security headers (CSP, HSTS, no framing, `noindex` so demos stay out of
search engines).

## Deploying from a laptop

You need Node.js and access to the Vercel account.

### First time on a computer

```bash
npx vercel login                          # sign the command-line tool in (opens a link)
npx vercel link --yes --project inspired  # link this folder to the project (creates it if needed)
```

`vercel link` may say it couldn't connect the GitHub repo (it's private): that's expected.
If it creates a `.env.local` file, delete it.

### Every deploy

```bash
npx vercel --prod
```

It builds on Vercel's servers and prints the URL. The site runs on Vercel, so it stays up when
your laptop is off. Environment variables only take effect on the next deploy.

## Environment variables

Add in the Vercel dashboard (**Settings → Environment Variables**) or with `npx vercel env add NAME`,
for Production and Preview:

| Variable | Notes |
|---|---|
| `MONGO_URI` | The team connection string **with `/test` added before the `?`** (the team's content is in the `test` database), e.g. `mongodb+srv://USER:PASSWORD@asset-library.z3ldnet.mongodb.net/test?appName=asset-library`. |

Don't add `GEMINI_API_KEY` for this version. Nothing online would use it, and the web build
blanks it anyway.

**MongoDB Atlas:** Vercel has no fixed IP addresses, so the Atlas project's **Network Access**
must allow `0.0.0.0/0`. A separate database user just for the site is best, so the shared team
password can change without breaking it.

## Automatic deploys (GitHub Actions)

`.github/workflows/deploy.yml` runs on every pull request and every push to `main`:

1. **Check:** type check, lint (non-blocking for now), web build, a scan that fails if an API
   key or private key ended up in the web bundle, and the server tests (`npm test --prefix asset-admin`).
2. **Deploy:** pull requests get a preview URL; merges to `main` update production.

The deploy step is **skipped** until the repo owner adds three secrets under
**GitHub → Settings → Secrets and variables → Actions**:

| Secret | Where to get it |
|---|---|
| `VERCEL_TOKEN` | Vercel → **Account Settings → Tokens** |
| `VERCEL_ORG_ID` | `orgId` in `.vercel/project.json` after `vercel link` |
| `VERCEL_PROJECT_ID` | `projectId` in the same file |

## Moving to another account

The free plan can't transfer a project between accounts, so recreate it (about 10 minutes):

```bash
npx vercel logout
npx vercel login          # sign in as the new account
rm -rf .vercel
npx vercel link --yes --project inspired
npx vercel --prod
```

Then re-add `MONGO_URI`, update the GitHub secrets and the [Current status](#current-status)
table, and delete the old project (old dashboard → **Settings → General → Delete Project**).
The URL changes, so share the new one.

## Limits to know

- Visits and profiles are stored in the browser's local storage. Anyone using the same browser
  can see them, so use a private window on shared computers.
- New lesson files uploaded through the local admin only appear online after they're committed
  to `asset-admin/uploads/` and the site is redeployed.
