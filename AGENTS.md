# AGENTS.md

Guidance for AI coding agents (and new contributors) working on **NBOOK** — a
tactile, archival digital notebook built with Next.js.

Read this before making changes. It documents the architecture, the
conventions, and the things that must not break.

---

## 1. Project overview

NBOOK is a private digital notebook organised as **BOOK → CHAPTER → PAGE →
BLOCK**. There is no traditional account system: a notebook is opened with a
link plus an **access key**, which is turned into a signed HTTP-only session
cookie.

- Framework: **Next.js 15 (App Router)** + **React 19** + **TypeScript strict**
- Styling: **Tailwind CSS v4** (CSS-first config in `src/app/globals.css`)
- Rich text: **Tiptap 2**; code editing: **CodeMirror 6** + **Shiki**;
  diagrams: **tldraw 4**; math: **KaTeX**
- Persistence: **Firebase Firestore** + **Firebase Storage**, behind a driver
  interface with a **local JSON driver** for development
- AI: **Groq** then **OpenRouter**, behind a provider interface with graceful
  "not configured" degradation

---

## 2. Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Next.js dev server on <http://localhost:3000> |
| `npm run build` | Production build |
| `npm start` | Serve the production build |
| `npm run lint` | ESLint (flat config in `eslint.config.mjs`) |
| `npm run typecheck` | `tsc --noEmit` (strict, `noUncheckedIndexedAccess`) |
| `npm test` | Vitest, single run |
| `npm run test:watch` | Vitest watch mode |
| `npm run test:firestore` | Firestore **emulator** suite (needs Java + the Firebase CLI) |
| `npm run test:e2e` | `next build` + Playwright suite (`e2e/`) |
| `npm run verify` | **typecheck → lint → test → build**, in that order |
| `npm run verify:all` | `verify` → `test:firestore` → `test:e2e` (full local CI) |

**Always run `npm run verify` before you consider a task done.** There is no
git repository in this workspace, so CI is whatever you run locally.

`npm run test:e2e` is the second gate: it needs a browser (already installed)
and takes about two minutes. It starts its own server on port 3000 with
`NBOOK_LOCAL_DATA_DIR=.nbook-e2e`, so it never touches your data, plus a local
mock AI server on port 8799 (see §9).

`npm run test:firestore` wraps `src/lib/storage/firestore.emulator.test.ts` in
`firebase emulators:exec --only firestore --project demo-nbook`, which exports
`FIRESTORE_EMULATOR_HOST` for the child process. It needs **Java** and a global
`firebase` CLI (`brew install firebase-tools`); the first run downloads the
emulator jar. Without those variables the suite skips itself, so plain
`npm test` never needs an emulator.

### Code style

- TypeScript `strict` + `noUncheckedIndexedAccess`. No `any` unless a library
  forces it (use `unknown` + narrowing).
- Prefer existing utilities: `src/lib/api/http.ts` (server responses),
  `src/lib/api/client.ts` (browser fetch + SSE), `src/components/ui/*`.
- **No comments unless they explain non-obvious intent** (why, not what). The
  file already has a handful of "why" comments — keep that spirit.
- Client components start with `"use client"`. Route files that call
  `useSearchParams` must be wrapped in `<Suspense>` (see
  `src/components/page/NotebookRoute.tsx`).
- `apiRequest(path, { body })` infers `POST` from the presence of a body —
  `fetch` rejects a body on GET/HEAD, and a forgotten `method` used to crash
  at runtime. Pass `method` explicitly for anything that is not the default.

---

## 3. Directory map

```
src/
  app/                    App Router pages + API routes
    api/                  REST/JSON endpoints (see §5)
    b/[slug]/             notebook shell: read|edit|settings|share
    create/               create a notebook → reveal owner key
  components/
    blocks/               per-block renderers and editors
    book/                 shell, page tree, presence, search, export, gate
    page/                 route wrapper + folio body
    ai/                   Assist panel
    demo/                 /demo fixture + read-only showcase
    i18n/                 provider
    ui/                   Button, Modal, Field, Toggle, Toast, States, Wordmark
  hooks/                  useNotebook (tree), usePageBlocks (block CRUD/autosave)
  lib/
    access/               keys, session cookies, presence + rate limiting
    ai/                   types, providers, router, features, context
    api/                  http (server) / client (browser)
    blocks/               zod content schema + sanitising
    export/               json / markdown / html serializers
    i18n/                 dictionaries (en, kn, ar) + StringKey dot paths
    search/               exact search (semantic throws → "not implemented")
    storage/              StorageDriver interface + firestore/local drivers
  types/models.ts         canonical domain model (single source of truth)
  utils/sound.ts          WebAudio paper-turn sound (played by PageView on
                          page navigation unless reduced-motion is set)
```

---

## 4. Domain model & storage

### 4.1 Entities (`src/types/models.ts`)

- `Book` — name, slug (URL id), description, `settings` (`pageAnimation`,
  `pageSound`, theme, font scale, viewer permissions)
- `Chapter` — `bookId`, `title`, `order`
- `Page` — `bookId`, `chapterId`, `title`, `order` (pages are **flat within a
  book**, ordered by `chapterId` + `order`)
- `Block` — `bookId`, `pageId`, `type`, `content`, `order`, **`rev`**
  (optimistic-concurrency counter)
- `AccessKey` — id, label, role, `keyHash`, `revokedAt`, `lastUsedAt`
- `PresenceEntry` — live viewer list, TTL-cleaned

`BLOCK_TYPES` (15): `paragraph`, `heading`, `subheading`, `bulletList`,
`numberedList`, `checklist`, `quote`, `callout`, `divider`, `table`, `code`,
`canvas`, `image`, `file`, `math`.

### 4.2 Driver interface (`src/lib/storage/`)

`StorageDriver` is the **only** way routes touch data. Every method is scoped
by `bookId` — never write a query that can cross notebooks.

- `FirestoreDriver` (`firestore.ts`) — production/emulator, `firebase-admin`.
- `LocalDriver` (`local.ts`) — JSON file at `.nbook-data/db.json`, written
  atomically. Used automatically when **no** Firebase env var is present.

Selecting the driver: `src/lib/storage/index.ts` reads the environment once.

### 4.3 Firestore schema

```
books/{bookId}
books/{bookId}/chapters/{chapterId}
books/{bookId}/pages/{pageId}                 (chapterId + order inside)
books/{bookId}/pages/{pageId}/blocks/{blockId}
books/{bookId}/keys/{keyId}                   (store keyHash only)
books/{bookId}/presence/{sessionId}
```

**Never store an access key in plaintext** — only `keyHash` (SHA-256 hex).

---

## 5. API surface

All handlers return JSON via `json()` and throw `ApiError` (from
`src/lib/api/http.ts`); `handleError()` converts to a `{ error, code }` body.

| Route | Methods | Permission |
| --- | --- | --- |
| `/api/books` | GET, POST | POST creates a book + **Chapter 1 + Untitled page** + owner key |
| `/api/access` | POST | unlock with slug + key → sets session cookie |
| `/api/access/session` | GET | `?slug=` → `{authenticated, bookId, role, …}` |
| `/api/access/logout` | DELETE | `?bookId=` clears that book's cookie (no `bookId` → all) |
| `/api/ai` | POST | session required (any role) |
| `/api/files/[...path]` | GET | session required (signed/owned blob) |
| `/api/books/[bookId]` | GET, PATCH, DELETE | read / **manage** / **manage** |
| `…/tree` | GET | read |
| `…/events` | GET (SSE) | read |
| `…/chapters` | POST, PATCH | **write** (PATCH = reorder via `{orderedIds}`) |
| `…/chapters/[chapterId]` | PATCH, DELETE | **write** |
| `…/pages` | POST, PATCH | **write** (PATCH = reorder via `{chapterId, orderedIds}`) |
| `…/pages/[pageId]` | GET, PATCH, DELETE | read / write / write |
| `…/pages/[pageId]/duplicate` | POST | write |
| `…/pages/[pageId]/events` | GET (SSE), POST | read / read (POST = "still here" presence pulse) |
| `…/pages/[pageId]/blocks` | GET, POST | read / write |
| `…/pages/[pageId]/blocks/reorder` | PATCH | write |
| `…/pages/[pageId]/blocks/[blockId]` | PATCH, DELETE | write |
| `…/pages/[pageId]/blocks/[blockId]/duplicate` | POST | write |
| `…/keys` | GET, POST | **manage** |
| `…/keys/[keyId]` | DELETE | **manage** |
| `…/presence` | GET, POST, DELETE | read (POST = heartbeat, DELETE = "I left", called on unmount) |
| `…/search` | GET | read (403 for viewers when `settings.allowViewerSearch` is false) |
| `…/export` | GET | read (honours `settings.allowExport`) |
| `…/upload` | POST (`multipart/form-data`) | write |

**Owner-only (`manage`)**: `/api/books/[bookId]` PATCH/DELETE, `/keys`,
`/keys/[keyId]`. Everything structural — chapters, pages, blocks — is `write`,
so editors can reshape a notebook without owning it.

There are deliberately **no GET endpoints on `/chapters` or `/pages`** — the
client always loads the whole tree from `…/tree`, which is one round trip.

SSE frames are plain `message` events carrying
`data: ${JSON.stringify(event)}`; 20-second heartbeats keep the connection
alive. Subscribe with `subscribe<T>()` from `src/lib/api/client.ts`.

---

## 6. Permission model (authoritative)

```ts
ROLE_PERMISSIONS = {
  owner:  ["read", "write", "manage"],
  editor: ["read", "write"],
  viewer: ["read"],
}
```

- `read` → viewer, editor, owner
- `write` → editor, owner — pages, blocks **and chapters** (create, rename,
  reorder, delete)
- `manage` → owner only — book settings, access keys, ownership, delete book

**Every check is server-side** via `requireSessionForBook(bookId)` (read) or
`requirePermission(bookId, "write" | "manage")` in
`src/lib/access/session.ts`. The client's `can(role, perm)` in
`src/hooks/useNotebook.ts` is **purely for hiding UI** — it must never be the
only guard. When adding an endpoint, add the guard first.

Sessions:

- Cookie name is **per book**: `nbook_session_${sanitizedBookId}` — this lets
  several notebooks stay unlocked in different tabs.
- Payload `{bookId, keyId, role, sessionId, displayName}` is base64url + an
  **HMAC-SHA256 signature**, 12-hour TTL, `httpOnly`, `sameSite=lax`,
  `secure` in production.
- Signing secret order: `SESSION_SECRET` → first 32 chars of
  `FIREBASE_SERVICE_ACCOUNT` → `NBOOK_SESSION_SECRET`. Production refuses to
  run without one.
- The browser stores only the display name (`localStorage`
  `nbook.session.${bookId}`) for instant re-render; it carries **no
  authority**.

Access keys are `nbkown_…` / `nbkedt_…` / `nbkview_…` followed by 30 chars
from a 32-symbol alphabet (≈150 bits, deliberately human-typable — see
`KEY_ALPHABET` in `src/lib/access/keys.ts`). Unlock attempts are rate-limited
per slug.

**Revocation semantics** (deliberate, covered by `e2e/share.spec.ts`):

- A revoked key **fails every new unlock immediately** — `findActiveKeyByHash`
  filters `revokedAt`, so the next unlock is a 401.
- Sessions minted **before** revocation keep working until their 12-hour
  stateless cookie expires. The cookie is an HMAC, so there is no server-side
  list to invalidate; do not pretend otherwise in the UI.
- The owner key is **never revocable**: `POST /keys` only mints editor and
  viewer keys, and the share page shows no Revoke button on the owner row. The
  response always includes the owner key's `plaintext` exactly once — its hash
  lives in the `keys` collection like everyone else's.

---

## 7. Block architecture

- **Schema:** `src/lib/blocks/schema.ts` — one zod schema per block type in
  `blockContentSchemas`, accessed through `contentSchemaFor(type)` and
  `defaultContentFor(type)`. Rich text is transformed by `sanitizeRichText`
  (sanitize-html): script/iframe removed, event handlers stripped,
  `javascript:` URLs blocked, task-list/`data-*` attributes preserved.
- **Validation runs on every write.** Never accept client-supplied block
  content without `contentSchemaFor`.
- **Rendering:** `BlockContent.tsx` dispatches to the per-type component;
  `BlockList.tsx` owns ordering, insert/delete/duplicate chrome, and drag
  handles in edit mode.
- **Reordering is dnd-kit** (`@dnd-kit/core` + `@dnd-kit/sortable`): blocks,
  chapters and pages all go through the shared `SortableItem` render-prop in
  `src/components/ui/SortableItem.tsx`, with `PointerSensor` activation
  distance 6 (so clicks never start a drag) and a `KeyboardSensor` for
  accessibility. **Move up / Move down buttons remain** as the no-pointer
  fallback — both paths must keep working. The old native HTML5 `draggable`
  implementation was removed; do not reintroduce it.
- **Read mode** uses `:is(.nb-prose, .nb-rich)` selectors so the Tiptap
  surface and the static view share identical typography — keep that selector
  form when adding styles.
- **Editing/autosave:** `src/hooks/usePageBlocks.ts`
  - 400 ms debounce per block, `PUT` to `…/blocks/[blockId]` with
    `{content, baseRev}`.
  - Server rejects a stale `baseRev` with **409**; the hook reloads, rebases
    the local content and retries **twice**, then surfaces an error toast.
  - Transient network failures retry 3×; failures are kept in a `pending`
    map and flushed on unmount via `retryFailedWrites`.
- **No code execution.** The code block highlights (Shiki) and copies source;
  there is deliberately no Run button.

---

## 8. Real-time & presence

- Tree changes → `…/events` (`BookRealtimeEvent`: `book` | `chapter` |
  `page` with an `action`), merged by upsert in `useNotebook`.
- Block changes → `…/pages/[pageId]/events` (`PageRealtimeEvent`:
  `block` upsert/remove or `page:deleted`), merged in `usePageBlocks`.
- Presence heartbeats every ~15 s via `…/presence`; entries expire (client
  TTL 45 s, server prunes anything older than 30 s) and a tab that unmounts
  calls `DELETE …/presence` to drop its entry immediately — a heartbeat POST
  would only refresh it. There is no unload beacon and no presence payload on
  the SSE stream, so a crashed/closed tab disappears on the next poll, which
  `e2e/presence.spec.ts` allows up to 75 s for.

When adding a mutation, **publish the matching event in the same code path**,
otherwise other tabs silently go stale.

---

## 9. AI

- `/api/ai` accepts `{bookId, feature, pageId?, selection? | query?, context?, language?}`.
- `src/lib/ai/router.ts` walks the `providers` array (Groq, then OpenRouter).
  A provider whose API key env var is unset reports `configured: false` and is
  skipped. All configured providers failing → `ApiError(503, "not_configured" |
  "all_failed")`.
- Text features (`TEXT_FEATURES`) operate on a selection; code features
  (`CODE_FEATURES`) on a code block; `"ask"` is free-form with optional
  notebook context. Prompts are built by `buildMessages()` in
  `src/lib/ai/features.ts`.
- The client shows `t("aiNotConfigured")` on 503 and a fallback note with
  provider/model when `fallbacks` is non-empty.
- `GROQ_BASE_URL` / `OPENROUTER_BASE_URL` override the default endpoint per
  provider. They exist so tests can point at `e2e/mock-ai-server.mjs`
  (port 8799, controlled with `POST /_control` → `{groq|openrouter: "ok" |
  "fail" | "slow", delayMs}`); the Playwright config injects test keys/models
  alongside them. Never set these in production — they are not secrets, but
  they are a redirect of where notebook text is sent.

To add a provider: implement `AIProvider` in `src/lib/ai/types.ts`, register it
in `providers.ts` with `apiKeyEnv`/`modelEnv`, and add it to `router.ts`'s
order. Add a fake provider test in `router.test.ts`.

---

## 10. i18n & RTL

- Dictionaries live in `src/lib/i18n/index.ts` (`en`, `kn`, `ar`).
- Type-safe keys: `StringKey = LeafPaths<typeof en>` → `"aiFeatures.explain"`.
  Adding a key means adding it to **all three** dictionaries; `translate()`
  falls back to English for a missing key but tests assert every key exists
  in `kn` and `ar`.
- `useI18n()` from `src/components/i18n/I18nProvider.tsx` returns
  `{locale, dir, setLocale, t}`; `RTL_LOCALES = {"ar"}` drives `dir="rtl"`.
- Layout must be logical-property based: use `ps-`/`pe-`, `ms-`/`me-`,
  `start-`/`end-`, `border-s`/`border-e` — **never** `left`/`right` for
  layout, or the Arabic view will break.

---

## 11. Design system (non-negotiable)

Extracted from the original Stitch prototype. Tokens are declared in
`@theme` inside `src/app/globals.css`.

| Token | Value | Use |
| --- | --- | --- |
| `--color-paper` | `#f0eee9` | app background |
| `--color-sheet` / `sheet-alt` | `#fbf9f4` / `#fdfbf7` | page surfaces |
| `--color-ink` / `ink-soft` / `ink-faint` | `#080c12` / `#45474b` / `#76777c` | text |
| `--color-rule` | `#c6c6cb` | hairlines, borders |
| `--color-amber` / `amber-soft` | `#8c4f10` / `#ffdcc2` | accents, highlights |
| `--color-night` | `#1a1d24` | night theme |

- **Type:** Newsreader (serif, display + body), Plus Jakarta Sans (UI),
  JetBrains Mono (code) — loaded with `next/font/google`, applied via
  `className` on `<html>`. Material Symbols Outlined via `<link>` (there is an
  intentional `eslint-disable` for `@next/next/no-page-custom-font`).
- **Tactile classes:** `.tactile-folio-sheet` (paper grain + layered shadow),
  `.tactile-spine-gutter`, `.canvas-dot-grid`, `.code-view`.
- **Theme override:** `.parchment-tactile` / `.dark-tactile` are applied to the
  notebook shell wrapper and only swap CSS custom properties — do not fork
  components for themes.
- **Font scale:** `.nb-fs-small|medium|large` on the shell sets `--nb-body`.
- **Page animation:** `settings.pageAnimation` is `none | subtle | realistic`.
  A stored legacy `"flip"` is normalised to `"realistic"` on read
  (`hydrateBook`); the CSS class is `.page-turn--realistic` with a `.page-turn--flip`
  alias. The whole animation collapses to a cross-fade under
  `prefers-reduced-motion`.
- **Page sound:** `settings.pageSound` plays a synthesised rustle (Web Audio,
  no audio file) on page navigation unless reduced-motion is set.
- **Icons:** only Material Symbols names that exist in Google's served font.
  An unknown ligature renders as literal text (100–200px wide) instead of a
  24px glyph — `sparkle` and `chapter_add` were both wrong. Every icon on the
  main screens is checked by `e2e/icons.spec.ts`; run it after adding one.
- **Responsive header:** the notebook header wraps onto a second row below
  `sm` rather than overflowing — keep it `flex-wrap`, and never assume the
  controls fit on one line.
- **Printing:** `@media print` rules strip chrome, shadows and page breaks;
  every dialog/drawer is `.no-print`.
- Components must be built from `src/components/ui/*` + tokens. Do not
  introduce ad-hoc colors, radii, or a second button component.

---

## 12. Demo route

`/demo` (`src/app/demo/` + `src/components/demo/`) is a **separate, read-only
showcase**. It renders the real block components by supplying fixture values to
`NotebookContextProvider` / `NotebookSessionProvider` (exported from
`NotebookProvider.tsx` and `NotebookGate.tsx`).

- Content lives in `demoData.ts` and is bundled — **never written to storage**,
  so it can never show up in a notebook library.
- The route takes no session, makes no API calls, and cannot mutate anything.
- `listBooks()` stays untouched: there is no demo seeding.
- `src/components/demo/demoData.test.ts` guards the fixture: it must contain
  **all 15 block types**, every block's content must parse against
  `contentSchemaFor`, and every id must belong to the demo book. Add the new
  block type to the fixture when you add it to `BLOCK_TYPES`.

## 13. Testing

Vitest (`vitest.config.ts`), `environment: "node"`, alias `@ → ./src`, tests
live next to the code as `src/**/*.test.ts`.

Current suites:

| File | Covers |
| --- | --- |
| `src/lib/access/keys.test.ts` | key generation/hash/well-formedness, session sign-verify (tamper, expiry, wrong secret), role permissions |
| `src/lib/search/search.test.ts` | `htmlToText`, unicode tokenizer, exact search (titles, code, snippets, limits, non-Latin), semantic throws |
| `src/lib/export/export.test.ts` | markdown/html/json output, heading levels, code fences, task lists, filenames |
| `src/lib/blocks/schema.test.ts` | sanitising, per-type defaults validity, size/language validation |
| `src/lib/ai/router.test.ts` | provider ordering, fallback, `not_configured`, `all_failed`, message building |
| `src/lib/i18n/i18n.test.ts` | locale coverage, RTL flags, fallback |
| `src/lib/storage/types.test.ts` | `hydrateBook` defaults (`pageSound` off, stored wins) |
| `src/lib/storage/local.test.ts` | LocalDriver: duplicate-page id integrity, corrupt/unreadable `db.json` handling, per-notebook SSE scoping, delete-before-announce |
| `src/components/demo/demoData.test.ts` | demo fixture covers all 15 block types, content parses, ids are demo-scoped |
| `src/lib/storage/firestore.emulator.test.ts` | Firestore driver CRUD/ordering/concurrency/keys/presence/streams — runs only under `npm run test:firestore` |

### Browser suite (`e2e/`)

`npm run test:e2e` builds, serves on port 3000 with an isolated data dir, and
runs Playwright against real Chromium:

| File | Covers |
| --- | --- |
| `e2e/notebook.spec.ts` | create + seed (UI and API response shape), `/b/:slug` redirect, Tiptap autosave, Shiki, KaTeX, tldraw, search, markdown export, unlock in a fresh browser |
| `e2e/settings.spec.ts` | header → settings, theme + text size persistence, realistic page animation, page-turn sound on/off, reduced motion, RTL + logical borders, print media + PDF |
| `e2e/collab.spec.ts` | SSE realtime across two tabs, editor chapter write vs viewer 403, demo route makes zero API calls |
| `e2e/reorder.spec.ts` | dnd-kit drag of blocks/chapters/pages + persist across reload, Move up/down fallback, viewer sees no handle and gets 403 |
| `e2e/share.spec.ts` | revocation policy copy, role matrix (anon 401, viewer 403, editor manage-403), revoke → new unlock 401 while old session lives, unlock rate limit 8×401 → 429 |
| `e2e/assist.spec.ts` | success, provider fallback, `all_failed`, `not_configured` 503, loading state, no-selection hint — via `e2e/mock-ai-server.mjs` |
| `e2e/presence.spec.ts` | two tabs see each other, a closed tab disappears within the TTL |
| `e2e/mobile.spec.ts` | 390px viewport: no horizontal overflow, drawer navigation |
| `e2e/icons.spec.ts` | every Material Symbol renders as a glyph |

Rules for new tests:

- Prefer **pure functions** (`src/lib/**`). Do not test React components here —
  there is no jsdom setup.
- No network, no filesystem writes outside the test, no real API keys.
- Any new block type must be added to the `defaultContentFor` loop in
  `schema.test.ts`.
- Browser behaviour belongs in `e2e/`. Selectors must not rely on icon
  ligature text surviving into accessible names — match the visible label.

---

## 14. Environment variables

See `.env.example` for the annotated list.

| Var | Required | Purpose |
| --- | --- | --- |
| `SESSION_SECRET` (or `NBOOK_SESSION_SECRET`) | **production** | HMAC secret for session cookies |
| `APP_URL` | recommended | self-referential links, OpenRouter referer |
| `GROQ_API_KEY` / `GROQ_MODEL` | optional | primary AI provider |
| `OPENROUTER_API_KEY` / `OPENROUTER_MODEL` | optional | fallback AI provider |
| `GROQ_BASE_URL` / `OPENROUTER_BASE_URL` | optional (tests) | provider endpoint override; the e2e suite points them at `e2e/mock-ai-server.mjs` |
| `FIREBASE_SERVICE_ACCOUNT` or `GOOGLE_APPLICATION_CREDENTIALS` or `FIREBASE_PROJECT_ID` or `FIRESTORE_EMULATOR_HOST` | optional | switches storage to Firestore |
| `FIREBASE_STORAGE_BUCKET` | optional | media uploads |
| `NBOOK_LOCAL_DATA_DIR` | optional | local JSON driver directory (default `.nbook-data`) |

With **no** Firebase vars the app uses `LocalDriver`; with **no** AI keys the
Assist panel shows "not configured". Both are first-class states, not errors.

---

## 15. Hard rules

1. **Server-side permission checks on every mutation.** Client `can()` is UI
   only.
2. **Scope every query by `bookId`.** No cross-notebook reads/writes.
3. **Never store plaintext access keys.** Hash only.
4. **Sanitize + validate all block content** before persisting.
5. **Publish a realtime event for every mutation.**
6. **Optimistic concurrency:** honour `rev`/`baseRev`, return 409 on conflict.
7. **No secrets in the client bundle** — nothing in `NEXT_PUBLIC_*`, no API
   keys in components.
8. **No fabricated AI/search output:** `/api/ai` degrades to a typed 503;
   `semanticSearch.search()` throws `"not implemented"` instead of inventing
   results.
9. **Run `npm run verify`** before declaring work complete, and
   `npm run verify:all` for the full local CI (`verify` + Firestore emulator +
   browser suite).
