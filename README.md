# NBOOK

A tactile, archival digital notebook — **BOOK → CHAPTER → PAGE → BLOCK** —
built with Next.js. No accounts: open a notebook with its link and an access
key.

## Features

- **Three levels of hierarchy** with drag-and-drop reordering (dnd-kit):
  chapters hold pages, pages hold ordered blocks — with Move up / Move down
  buttons as the no-pointer fallback.
- **15 block types** — paragraph, heading, subheading, bullet list, numbered
  list, checklist, quote, callout, divider, table, code, canvas (tldraw), image,
  file, math (KaTeX).
- **Rich text** (Tiptap), **code editing** (CodeMirror 6) with **Shiki**
  highlighting and copy-source (no execution, by design).
- **Roles** — `owner` (manage), `editor` (write), `viewer` (read). Every check
  happens server-side.
- **Access keys** instead of accounts: `nbkown_…` / `nbkedt_…` / `nbkview_…`,
  stored hashed, turned into a signed 12-hour httpOnly session cookie.
  Revoking a key stops the next unlock immediately; a session opened before
  revocation keeps running until its cookie expires. The owner key is never
  revocable.
- **Real-time** collaboration over SSE: tree changes, block changes, presence.
- **Optimistic concurrency** on blocks (`rev` / `baseRev`, 409 → rebase-retry).
- **AI Assist** panel (Groq, then OpenRouter) with graceful "not configured"
  degradation — text features, code features, and free-form ask.
- **Search** (exact, unicode-aware), **export** to JSON / Markdown / print-ready
  HTML, **print stylesheet**.
- **i18n**: English, Kannada, Arabic — with RTL support.
- **Tactile design**: paper grain, spine gutter, folio sheets, a synthesised
  page-turn rustle (respects `prefers-reduced-motion`), three themes
  (eggshell / parchment / night) and three font scales.
- **Seeded on create**: a new notebook already contains Chapter 1 and its
  first page, so you start by writing rather than by configuring.
- **`/demo`**: a bundled, read-only showcase built from the real block
  components — no storage, no API calls, nothing that can leak into a
  notebook library.

## Quick start

```bash
npm install
npm run dev
```

Open <http://localhost:3000> → **Create a book** → copy the owner key → the
notebook unlocks itself and redirects to `/b/<slug>/read`.

Works with **zero configuration**: no Firebase credentials means storage
falls back to a local JSON file (`.nbook-data/db.json`), and no AI keys means
the Assist panel simply reports that AI is not configured.

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | dev server |
| `npm run build` | production build |
| `npm start` | serve the production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` / `npm run test:watch` | Vitest |
| `npm run test:firestore` | Firestore **emulator** suite (needs Java + `firebase` CLI) |
| `npm run test:e2e` | build + Playwright browser suite |
| `npm run verify` | typecheck → lint → test → build |
| `npm run verify:all` | `verify` → `test:firestore` → `test:e2e` |

## Configuration

Copy `.env.example` to `.env.local`. Everything is optional in development;
**`SESSION_SECRET` is required in production.**

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

| Group | Variables |
| --- | --- |
| Sessions | `SESSION_SECRET`, `APP_URL` |
| Storage | `FIREBASE_SERVICE_ACCOUNT`, `GOOGLE_APPLICATION_CREDENTIALS`, `FIREBASE_PROJECT_ID`, `FIREBASE_STORAGE_BUCKET`, `FIRESTORE_EMULATOR_HOST`, `NBOOK_LOCAL_DATA_DIR` |
| AI | `GROQ_API_KEY`, `GROQ_MODEL`, `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`, `GROQ_BASE_URL`, `OPENROUTER_BASE_URL` (endpoint overrides, used by the test suite) |

## Architecture

```
BOOK ──< CHAPTER ──< PAGE ──< BLOCK
```

- `src/types/models.ts` — the canonical domain model.
- `src/lib/storage/` — `StorageDriver` interface with `FirestoreDriver` and
  `LocalDriver`. Every method is scoped by `bookId`.
- `src/lib/access/` — key generation/hashing, HMAC session cookies, presence,
  rate limiting.
- `src/app/api/**` — REST/JSON handlers; permissions enforced with
  `requirePermission(bookId, "read" | "write" | "manage")`.
- `src/hooks/` — `useNotebook` (tree + SSE) and `usePageBlocks` (block CRUD,
  debounce, conflict rebase).
- `src/lib/blocks/schema.ts` — zod validation + sanitising for every block.
- `src/lib/{search,export,ai,i18n}/` — pure, tested libraries.

See **[AGENTS.md](./AGENTS.md)** for the full guide: permission model, API
table, block architecture, design tokens, testing rules, and the hard rules
that must not be broken.

## Testing

```bash
npm test
```

Pure-logic Vitest suites live next to their sources (`src/**/*.test.ts`):
access keys and sessions, block schema and sanitising, search, export, the AI
provider router, i18n coverage, and storage defaults.

```bash
npm run test:e2e
```

The Playwright suite (`e2e/*.spec.ts`) builds the app, starts it on
`localhost:3000` with an isolated `NBOOK_LOCAL_DATA_DIR` (plus a local mock AI
server on port 8799), and drives a real Chromium: creating a notebook, editing
Tiptap / CodeMirror / tldraw blocks, autosave and reload, drag-and-drop
reordering of blocks, chapters and pages, search, export download, role
enforcement, key revocation and unlock rate limiting, AI assist (success,
provider fallback, failures, not-configured), presence across two tabs,
realtime sync, settings (theme, text size, page animation, page-turn sound),
RTL, print media, phone viewports, the demo route, and that every Material
Symbol actually renders as a glyph.

```bash
npm run test:firestore
```

Runs the Firestore **emulator** suite (`firebase emulators:exec`) against the
real `FirestoreDriver`: CRUD, ordering, optimistic concurrency, key hashing and
revocation, presence TTLs and the SSE streams. Requires **Java** and the
Firebase CLI (`brew install firebase-tools`); the first run downloads the
emulator. Without those the suite skips itself, so `npm test` stays
emulator-free.

```bash
npm run verify:all
```

The full local CI: `verify` → `test:firestore` → `test:e2e`.

## Deploy

Standard Next.js app — `npm run build && npm start`, or deploy to Vercel.

- Set `SESSION_SECRET` and `APP_URL`.
- Set at least one Firebase credential variable to use Firestore + Storage.
- Set `GROQ_API_KEY` and/or `OPENROUTER_API_KEY` to enable the Assist panel.

## License

All rights reserved.
