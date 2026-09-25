# InspirEd

**Learn to Empower. Empower to Hope.**

A mobile education companion for caregivers of children with rare pulmonary conditions, built with React Native and Expo.

InspirEd listens to clinical appointments, identifies the medical concepts that were discussed, and returns vetted educational material matched to the caregiver's literacy level. It is designed as a closed-data system: the AI answers from a curated, physician-reviewed knowledge base rather than from the open internet.

---

## Table of Contents

- [Why the Project Exists](#why-the-project-exists)
- [What the System Does](#what-the-system-does)
- [AI Safeguards](#ai-safeguards)
- [Current State](#current-state)
- [Technologies and Tools](#technologies-and-tools)
- [Getting Started](#getting-started)
- [Configuration](#configuration)
- [Project Structure](#project-structure)
- [Knowledge Base (RAG)](#knowledge-base-rag)
- [Goals and Progress Plan](#goals-and-progress-plan)
- [Documentation](#documentation)
- [Team](#team)
- [License](#license)

---

## Why the Project Exists

**Client:** Pediatric Oxygen Concepts, LLC
**Course:** CS 4273 Capstone, University of Oklahoma, Fall 2026
**Group:** Group G

When a child receives a serious diagnosis, caregivers have to absorb complex medical information, navigate the healthcare system, and take part in significant care decisions while under heavy emotional stress. People forget roughly 40% of what is said in a medical appointment under normal conditions, and that figure rises sharply when the caregiver is highly stressed.

Three problems compound this:

1. **Literacy mismatch.** Patient education is generally written for a 6th to 8th grade reading level, but rare disease terminology (for example, neuroendocrine hyperplasia of infancy) exceeds that immediately.
2. **Scarce reliable information.** For rare lung diseases, published literature is often limited to case studies, frequently ones with poor outcomes. Many of these conditions have no FDA-approved treatment, so practical guidance on routine care and disease trajectory is rarely published at all.
3. **General-purpose AI is not a safe substitute.** It pulls from uncontrolled sources, hallucinates, gives advice inappropriate to a specific patient, and can effectively interpret or diagnose. Bad information also damages the caregiver-physician relationship.

InspirEd's purpose is **just-in-time, vetted education** delivered at the caregiver's current level of literacy and knowledge, without overwhelming them with information they do not need yet.

---

## What the System Does

### Scribe
Records a clinical appointment and extracts the medical terminology discussed: diagnoses, medications, treatments, and other key terms. Those terms become the retrieval keys for educational content.

The scribe identifies what was said. It does not interpret the physician, and it does not diagnose.

### Literacy Assessment
During profile creation, the caregiver answers questions and types several sentences. The app analyzes that writing using readability characteristics such as sentence length, word count, and syllable counts, and places the caregiver into an approximate literacy band.

The longer-term goal is continuous assessment, where ongoing interactions with the AI refine the estimate and the material grows more sophisticated as the caregiver learns.

### Retrieval and Chat
Caregivers can ask questions directly, save questions for an upcoming appointment, or follow up on terms the scribe detected. Answers are grounded in the approved knowledge base.

The retrieval path is:

```
Scribe or user question → identify relevant concepts → check user's literacy level
→ query approved database → return matched written, video, or audio content
```

### Multimodal Educational Content
The same concept should be retrievable in the format that fits the caregiver, such as simplified written material, a PDF, or an instructional video. A caregiver asking how to use an oxygen tank should be able to get both written instructions and a matching video.

### User Profiles
Profiles persist literacy level and interaction history so personalization can carry across sessions.

---

## AI Safeguards

These are hard requirements, not preferences.

| Guardrail | Behavior |
| --- | --- |
| Closed data | Answer only from the vetted knowledge base |
| No hallucination | If the database cannot answer, say so rather than generating an answer |
| No diagnosis | Never interpret a report or symptom as a diagnosis |
| No care changes | Provide education only, never instructions that alter treatment or replace physician judgment |

Content is metadata tagged with relevant medical terms, reading level, emotional level, and category, and is intended to be vetted by physicians before entering the database.

---

## Current State

The project has been through two prior capstone semesters. The components exist but are fragmented, and consolidating them is part of this semester's work.

| Component | Status |
| --- | --- |
| Scribe / term extraction | Working, validated against a recorded mock appointment |
| Initial literacy assessment | Implemented and sufficient for prototype use |
| MongoDB educational database | Set up with metadata/tagging, limited content entered |
| Metadata input interface | Exists, cumbersome to add and tag content |
| Educational videos | A few static videos, not wired to retrieval |
| AI to database integration | Incomplete |
| Multimodal retrieval | Not functioning as intended |
| Continuous literacy personalization | Future iteration |

The app currently runs as a local development build and is clunky to get started. Prior semesters' files live in several places, so locating and consolidating them is an active task.

This repository is a fork of the previous semester's work. Earlier code is preserved under `legacy-fall-25/`.

---

## Technologies and Tools

| Layer | Technology | Purpose |
| --- | --- | --- |
| Framework | React Native with Expo SDK 54 | Cross-platform iOS and Android app from one codebase |
| Language | TypeScript | Static typing across screens, hooks, and utilities |
| Navigation | React Navigation 7 | Stack and tab navigation |
| AI | Google Gemini API | Transcription, summarization, Q&A, lesson generation |
| Database | MongoDB | Curated content chunks, metadata tags, and embeddings |
| Retrieval | RAG over the curated database | Grounded answers from approved content only |
| Storage | AsyncStorage | Local-first persistence of visits and user settings |
| Animation | Reanimated 4 | Screen transitions and interactive motion |
| Admin tooling | `asset-admin` service | Upload assets and generate embeddings |
| Media | Google Drive API | Hosting for the educational video library |
| Quality | ESLint | Linting and style enforcement |
| Collaboration | Git and GitHub, shared Google Drive | Version control, review, and client asset handoff |

**UI direction:** iOS liquid glass design principles, documented in `design_guidelines.md`.

---

## Getting Started

### Prerequisites
- Node.js 18 or newer
- Git
- The Expo Go app on a physical iOS or Android device
- A Google Gemini API key ([generate one here](https://aistudio.google.com/app/apikey))

### Installation

```bash
git clone https://github.com/carsonpetty3/InspirEd.git
cd InspirEd
npm install
```

### Running the App

```bash
npx expo start
```

Scan the QR code with Expo Go to launch the app on your device.

To restart with a cleared cache:

```bash
npx expo start -c
```

---

## Configuration

All secrets (the Gemini key, MongoDB URI, Drive service account) live on the **asset-admin server**, never in the app. The app only needs to know where that server is.

### 1. Start asset-admin locally

```bash
cd asset-admin
cp .env.example .env   # then fill in GEMINI_API_KEY (MONGO_URI optional)
npm install
npm start              # http://localhost:3000, content admin at /admin
```

### 2. Point the app at it

In `app.json`, set `expo.extra.RAG_API_URL` to the server your phone can reach, for example your laptop's LAN IP:

```json
"extra": {
  "RAG_API_URL": "http://192.168.1.5:3000"
}
```

You can also use the deployed Vercel URL instead of running the server yourself. For `npx expo start --web`, set `EXPO_PUBLIC_API_URL=http://localhost:3000`.

Do not put keys in `app.json` or any `EXPO_PUBLIC_*` variable: both ship inside the app bundle.

### Web deployment

The app is hosted on Vercel for demos (mock data only). See [`docs/deployment.md`](docs/deployment.md).

> **Never commit real API keys, `MONGO_URI` values, or private service URLs.** See [`docs/chatbot-environment.md`](docs/chatbot-environment.md) for the full secrets checklist.

---

## Project Structure

```
├── asset-admin/         # Admin service for uploading assets and embeddings
├── assets/              # Images, fonts, bundled knowledge base
├── components/          # Reusable UI components
├── constants/           # Theme, colors, spacing
├── context/             # React Context providers
├── docs/                # Setup and architecture documentation
├── hooks/               # Custom React hooks
├── legacy-fall-25/      # Preserved work from prior capstone semesters
├── navigation/          # Navigation configuration
├── screens/             # App screens
├── scripts/             # Build and content-processing scripts
├── utils/               # AI, storage, and RAG utilities
└── App.tsx              # Application entry point
```

---

## Knowledge Base (RAG)

Grounded answers can be sourced two ways.

**1. MongoDB chunks (recommended)**
Upload assets through `asset-admin`, generating embeddings on submit or through **Browse → Generate embeddings**. Point the app at the server with `RAG_API_URL` (see [Configuration](#configuration)). Setup steps are in [`docs/rag-mongodb-setup.md`](docs/rag-mongodb-setup.md).

**2. Bundled fallback**
When MongoDB has no matching chunks, the server falls back to `assets/medical-knowledge.json`. Refresh it with:

```bash
node scripts/process-pdfs.js
```

---

## Goals and Progress Plan

### Priority This Semester

The client has identified **multimodal retrieval as the highest-priority feature**. Initial literacy assessment already works, and continuous literacy adaptation can wait for a future iteration. The immediate objective is proving that a caregiver's literacy level actually changes which educational resources come back, and that written and video content can both be retrieved for the same concept.

The target is a **narrow, controlled demonstration that works reliably**, not a complete rare-disease knowledge base. A limited set of terms, a few videos, a few written resources, placeholder content where needed, and scripted appointments are sufficient.

### Target Demonstration

1. Create a deliberately lower-literacy test profile and a deliberately higher-literacy test profile.
2. Run the same appointment recording through the scribe for both.
3. Confirm the scribe identifies the same medical concepts in each case.
4. Show that the system returns different educational material for each profile.
5. Return both written and video content for the same concept.
6. Repeat to confirm the system retrieves the intended resources and not unrelated material.

### Progress Plan

| Phase | Focus | Status |
| --- | --- | --- |
| 1 | Domain understanding and client requirements | Complete |
| 2 | Locate, consolidate, and run prior semesters' work; document technologies | In progress |
| 3 | Connect fragmented components; improve the functional interface | In progress |
| 4 | Build controlled test appointments and test-profile fixtures | Planned |
| 5 | Wire multimodal retrieval to literacy level; validate retrieval accuracy | Planned |
| 6 | Support co-design sessions with families and physicians | Planned |
| 7 | Deliver cohesive prototype, MVP definition, and forward development plan | Planned |

### Near-Term Milestone (3 to 4 Weeks)

Get the existing pieces into a state where families and physicians can actually open and use an interface:

- Locate and consolidate all previous project files
- Confirm what currently works and get the app running cleanly
- Understand and document the existing architecture
- Connect the currently fragmented components
- Improve the functional layout and interface
- Begin retrieval testing with controlled content

### Co-Design Context

The client and EFA hold a grant to run a co-design study with physicians and families this semester. Their feedback determines what belongs in the MVP and what defers to later iterations, which means the prototype has to be interactive enough to evaluate. Part of this semester's deliverable is therefore a **development plan for future work**, not code alone.

### Working Practices

- Feature work happens on branches and merges through pull requests
- Every pull request receives at least one peer review before merge
- Weekly recurring client meeting, with sprints planned against client feedback
- Documentation in `docs/` is updated alongside the code it describes

---

## Documentation

| File | Contents |
| --- | --- |
| `project-overview.md` | High-level product overview |
| `DESIGN_DECISIONS.md` | Record of architectural and design decisions |
| `design_guidelines.md` | Visual and interaction standards |
| `FAQ.md` | Common questions about setup and behavior |
| `docs/chatbot-environment.md` | Environment variables and secrets checklist |
| `docs/rag-mongodb-setup.md` | MongoDB knowledge base setup |
| `docs/deployment.md` | Vercel hosting, CI/CD, and environment variables |

---

## Team

**Capstone Fall 2026, Group G**

| Name | Role |
| --- | --- |
| Yale Gray | Product Owner |
| Carson Petty | Sprint Master 1 |
| Nathan Ngo | Sprint Master 2 |
| Trisha Duggisetty | Sprint Master 3 |
| Pravachan Patra | Sprint Master 4 |

Built on the work of previous capstone teams in partnership with Pediatric Oxygen Concepts, LLC.

---

## License

Private project. All rights reserved.
