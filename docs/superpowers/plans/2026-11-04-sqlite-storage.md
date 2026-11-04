# SQLite Storage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Store prompts in a local SQLite database file instead of `localStorage`, with the smallest possible backend, and move existing browser-stored prompts into it automatically.

**Architecture:** A tiny JSON API (`server/api.ts`) over a SQLite module (`server/db.ts`) using Node's built-in `node:sqlite`. A Vite plugin (`server/vitePlugin.ts`) mounts the API inside the existing Vite dev and preview servers, so `npm run dev` is still the only command and there is no separate process, port, or CORS. The client swaps the `localStorage` module for a `fetch` client (`src/api/promptApi.ts`); `usePrompts` becomes async and, on first load, imports any prompts still in `localStorage`.

**Tech Stack:** Existing React 19 + TypeScript + Vite 8 + Vitest 5. New: `node:sqlite` (built into Node 24, verified working on v24.21.0 with no flag and no warning), `node:http` types. **No new npm dependencies.**

**Spec:** None written. Requirements come from the user's request ("store these prompts in a local database with minimal backend setup") and the earlier plan `docs/superpowers/plans/2026-11-03-prompt-library.md`, whose behaviour (fields, validation, newest-first ordering, delete confirmation) is unchanged.

## Global Constraints

- Node >= 24 (for `node:sqlite` and native TypeScript type stripping). Add `"engines": { "node": ">=24" }` to `package.json`.
- Zero new runtime or dev dependencies.
- `Prompt` keeps exactly: `id: string`, `title: string`, `content: string`, `createdAt: number` (epoch ms). Title trimmed, content stored verbatim, whitespace-only counts as empty.
- Database file: `data/prompts.db` under the Vite project root, overridable with env var `PROMPT_DB_PATH`. `data/` is git-ignored. Directory is created if missing.
- Table schema (exact):
  ```sql
  CREATE TABLE IF NOT EXISTS prompts (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at INTEGER NOT NULL
  )
  ```
- API, all JSON, all under `/api`:
  | Method & path | Body | Success | Failure |
  |---|---|---|---|
  | `GET /api/prompts` | – | `200 Prompt[]`, newest first | `500 {error}` |
  | `POST /api/prompts` | `{title, content}` | `201 Prompt` (server makes id + createdAt) | `400 {errors:{title?,content?}}` validation; `400 {error}` bad JSON; `413 {error}` too large |
  | `DELETE /api/prompts/:id` | – | `204` (also when id doesn't exist) | `500 {error}` |
  | `POST /api/prompts/import` | `{prompts: unknown[]}` | `200 {imported: number}`; invalid entries dropped, existing ids ignored, original id/createdAt kept | `400 {error}` if `prompts` isn't an array |
  | anything else under `/api/` | | | `404 {error}` |
- Request body limit: 5 MB (`5 * 1024 * 1024` bytes).
- The API exists only under `vite` dev and `vite preview`. A static `dist/` deploy has no backend; that is out of scope (document it in the README).
- User-facing error copy (exact):
  - Save/delete failure: `Couldn't reach the prompt server. Check that the app is running and try again.`
  - Load failure: `Couldn't load prompts. Check that the app is running, then refresh.`
  - Loading state: `Loading prompts…`
- No editing, search, tags, auth, or multi-user. YAGNI.

## Review Focus

1. **Server unreachable** (dev server stopped, or someone opens a static `dist/` build). Page still renders, shows the load-error alert instead of the empty-list text; saving shows the save error and keeps what the user typed. Tested in Task 5.
2. **Migration runs twice or fails halfway** (React StrictMode double-mounts effects; two tabs open during the upgrade; server down on first load). No duplicate prompts; the `localStorage` key is cleared only after the import request succeeds, so nothing is lost. Tested in Tasks 3 and 5.
3. **Malformed requests** (invalid JSON, `title: 123`, missing body, oversized body, unknown route). The server answers 4xx JSON and keeps serving. Tested in Task 3.
4. **Double-click on Save while a request is in flight.** Exactly one prompt is created; the button is disabled until the request settles. Tested in Task 5.
5. **Multi-line, Unicode, and HTML-looking content** (`"  a\n\tb 👋 <b>x</b>"`) round-trips byte-for-byte through SQLite and the API. Tested in Tasks 2 and 3.

---

## File Structure

```
prompt-library/
  package.json                     # + engines (Task 4)
  .gitignore                       # + data/ (Task 4)
  README.md                        # + storage/backend notes (Task 4)
  vite.config.ts                   # + promptApiPlugin() (Task 4)
  tsconfig.node.json               # include server/ + shared src files (Task 2)
  server/
    db.ts                          # SQLite open/list/insert/remove/import (Task 2)
    db.test.ts
    api.ts                         # connect-style request handler (Task 3)
    api.test.ts
    vitePlugin.ts                  # mounts handler in dev + preview (Task 4)
  src/
    prompt.ts                      # shared: isPrompt, validateInput, createPrompt (Task 1)
    prompt.test.ts
    api/promptApi.ts               # fetch client (Task 5)
    api/promptApi.test.ts
    storage/legacyStorage.ts       # read/clear old localStorage data (Task 5; replaces promptStorage.ts)
    storage/legacyStorage.test.ts
    hooks/usePrompts.ts            # async, migration, focus refetch (Task 5)
    components/PromptForm.tsx      # async onSave, disabled while saving (Task 5)
    App.tsx                        # loading / load-error states (Task 5)
    test/setup.ts                  # guard DOM-only cleanup for node-env tests (Task 2)
    test/fakeApi.ts                # in-memory fetch stub for client tests (Task 5)
```

---

### Task 1: Extract shared prompt logic

Pure refactor so the server can reuse validation without importing `localStorage` code.

**Files:**
- Create: `src/prompt.ts`, `src/prompt.test.ts`
- Modify: `src/storage/promptStorage.ts`, `src/storage/promptStorage.test.ts`

**Interfaces:**
- Produces (in `src/prompt.ts`):
  - `export type ValidationErrors = { title?: string; content?: string }`
  - `export function isPrompt(value: unknown): value is Prompt` (moved as-is, including the Date-range check)
  - `export function validateInput(input: NewPromptInput): ValidationErrors` (moved as-is)
  - `export function createPrompt(input: NewPromptInput, now?: number): Prompt` (moved as-is)

- [ ] **Step 1:** Move the `validateInput` and `createPrompt` describe blocks from `promptStorage.test.ts` into `src/prompt.test.ts` importing from `./prompt`. Add:
  ```ts
  it('isPrompt rejects wrong types and out-of-range dates', () => {
    expect(isPrompt({ id: 'a', title: 'T', content: 'C', createdAt: 1 })).toBe(true)
    expect(isPrompt({ id: 'a', title: 'T', content: 'C', createdAt: '1' })).toBe(false)
    expect(isPrompt({ id: 'a', title: 'T', content: 'C', createdAt: 1e20 })).toBe(false)
    expect(isPrompt(null)).toBe(false)
  })
  ```
- [ ] **Step 2:** Run `npx vitest run src/prompt.test.ts`. Expected: FAIL, cannot resolve `./prompt`.
- [ ] **Step 3:** Create `src/prompt.ts` by moving the three functions out of `promptStorage.ts`. **Import types as `import type { NewPromptInput, Prompt } from './types.ts'` (with `.ts`)**; this file is also compiled by the Node tsconfig in Task 2, which requires extensions. `promptStorage.ts` imports them from `../prompt` and re-exports `validateInput` and `createPrompt` so `usePrompts.ts` is untouched.
- [ ] **Step 4:** Run `npm test && npx tsc -b`. Expected: all tests pass, no type errors.
- [ ] **Step 5:** Commit: `refactor: extract shared prompt validation into src/prompt.ts`

---

### Task 2: SQLite module

**Files:**
- Create: `server/db.ts`, `server/db.test.ts`
- Modify: `tsconfig.node.json` (`"include": ["vite.config.ts", "server", "src/prompt.ts", "src/types.ts"]`), `src/test/setup.ts`

**Interfaces:**
- Consumes: `isPrompt` from `src/prompt.ts`.
- Produces (in `server/db.ts`):
  ```ts
  export interface PromptDb {
    list(): Prompt[]                       // ORDER BY created_at DESC
    insert(prompt: Prompt): void
    remove(id: string): void               // no-op if missing
    importMany(prompts: unknown[]): number // returns rows actually inserted
    close(): void
  }
  export function openPromptDb(path: string): PromptDb   // ':memory:' allowed
  ```

- [ ] **Step 1:** In `src/test/setup.ts`, wrap the DOM-only work so node-environment tests can share the setup file: call `cleanup()` and `localStorage.clear()` only when `typeof window !== 'undefined'`; keep `vi.restoreAllMocks()` unconditional.
- [ ] **Step 2:** Write `server/db.test.ts`, starting with the line `// @vitest-environment node`. Each test uses `openPromptDb(':memory:')` and closes it after. Tests:
  - `list returns [] for a fresh database`
  - `insert then list returns prompts newest first` — insert `createdAt` 1 then 2; expect ids `['new','old']`.
  - `round-trips content byte-for-byte` — content `'  a\n\tb 👋 <b>x</b>\n'` comes back `toEqual` the input prompt.
  - `remove deletes by id and ignores unknown ids` — `remove('nope')` doesn't throw.
  - `importMany keeps id and createdAt, drops invalid entries, ignores existing ids` — pre-insert `a`; `importMany([p('a'), p('b'), null, {id:'c'}, {...p('d'), createdAt: 1e20}])` returns `1`; `list()` ids are `a` and `b`; `a` keeps its pre-inserted title.
  - `importMany is idempotent` — calling it twice with the same list returns `n` then `0`.
  - `data persists across open/close on a file` — use a temp path from `fs.mkdtempSync(path.join(os.tmpdir(), 'pl-'))`; insert, close, reopen, list has the prompt.
- [ ] **Step 3:** Run `npx vitest run server/db.test.ts`. Expected: FAIL, cannot resolve `./db.ts`.
- [ ] **Step 4:** Implement `server/db.ts` with `DatabaseSync` from `node:sqlite`. Run the schema from Global Constraints on open. Use prepared statements; `importMany` filters with `isPrompt`, uses `INSERT OR IGNORE`, sums `.changes`, and wraps the loop in `BEGIN`/`COMMIT` (with `ROLLBACK` on throw). Map rows (`created_at` → `createdAt`) explicitly, since `node:sqlite` returns null-prototype objects. For a file path, create the parent directory with `fs.mkdirSync(dirname(path), { recursive: true })`; skip that for `':memory:'`. Import shared code as `'../src/prompt.ts'`.
- [ ] **Step 5:** Run `npm test && npx tsc -b`. Expected: all pass.
- [ ] **Step 6:** Commit: `feat: add SQLite prompt store using node:sqlite`

---

### Task 3: JSON API handler

**Files:**
- Create: `server/api.ts`, `server/api.test.ts`

**Interfaces:**
- Consumes: `PromptDb` (Task 2); `validateInput`, `createPrompt` from `src/prompt.ts`.
- Produces:
  ```ts
  export type Middleware = (req: IncomingMessage, res: ServerResponse, next: () => void) => void
  export function createApiHandler(db: PromptDb): Middleware
  ```
  Requests whose path doesn't start with `/api/` call `next()`. Everything else is answered per the API table in Global Constraints.

- [ ] **Step 1:** Write `server/api.test.ts` (`// @vitest-environment node`). In `beforeEach`, open a `:memory:` db and start `http.createServer((req, res) => handler(req, res, () => { res.statusCode = 418; res.end() }))` on port 0. Use global `fetch` against `http://127.0.0.1:<port>`. Close the server and db in `afterEach`. Tests:
  - `GET /api/prompts lists newest first`
  - `POST /api/prompts creates with trimmed title and server id/createdAt` — body `{title:'  Hi ', content:'  a\n\tb 👋 <b>x</b>'}` → 201, `title === 'Hi'`, content unchanged, `id` matches `/^[0-9a-f-]{36}$/`, then appears in `GET`.
  - `POST rejects blank and non-string fields with field errors` — `{title:' ', content: 123}` → 400 `{errors:{title:'Title is required', content:'Content is required'}}`; nothing stored.
  - `POST rejects invalid JSON` — body `'{nope'` → 400 with an `error` string.
  - `POST rejects bodies over 5 MB with 413`, and a following `GET` still returns 200.
  - `DELETE /api/prompts/:id returns 204 and removes it; unknown id also 204`
  - `POST /api/prompts/import returns imported count and is idempotent` — two prompts → `{imported:2}`; again → `{imported:0}`.
  - `POST /api/prompts/import rejects a non-array` — `{prompts:'x'}` → 400.
  - `unknown /api route returns 404 JSON; non-api path calls next` — `/api/nope` → 404; `/index.html` → 418.
  - `returns 500 JSON when the db throws` — `vi.spyOn(db, 'list').mockImplementation(() => { throw new Error('boom') })` → 500 `{error: expect.any(String)}`.
- [ ] **Step 2:** Run `npx vitest run server/api.test.ts`. Expected: FAIL, cannot resolve `./api.ts`.
- [ ] **Step 3:** Implement `server/api.ts` with plain `node:http` types, no router. Use `new URL(req.url, 'http://x').pathname`. Read the body by collecting chunks, and stop with 413 once the running total passes 5 MB (destroy nothing; respond and ignore the rest). Coerce non-string `title`/`content` to `''` before `validateInput`. Wrap each route in try/catch → `500 {error:'Internal error'}` and log with `console.error`. Set `Content-Type: application/json` on every JSON response. Route id via `decodeURIComponent`.
- [ ] **Step 4:** Run `npm test && npx tsc -b`. Expected: all pass.
- [ ] **Step 5:** Commit: `feat: add JSON API for prompts`

---

### Task 4: Mount the API in Vite

**Files:**
- Create: `server/vitePlugin.ts`
- Modify: `vite.config.ts`, `.gitignore`, `package.json`, `README.md`

**Interfaces:**
- Consumes: `openPromptDb` (Task 2), `createApiHandler` (Task 3).
- Produces: `export function promptApiPlugin(): Plugin` (Vite `Plugin` type).

- [ ] **Step 1:** Implement `promptApiPlugin()`. Hook into both `configureServer(server)` and `configurePreviewServer(server)`. Each opens the db at `process.env.PROMPT_DB_PATH ?? path.resolve(server.config.root, 'data/prompts.db')`, calls `server.middlewares.use(createApiHandler(db))`, and closes the db on `server.httpServer?.on('close', …)`. Register it in `vite.config.ts` as `plugins: [react(), promptApiPlugin()]`. Vitest runs its own internal Vite server, which calls `configureServer`, so the hook must return early when `process.env.VITEST` is set. Otherwise every test run creates `data/prompts.db`.
- [ ] **Step 2:** Add `data/` to `.gitignore` and `"engines": { "node": ">=24" }` to `package.json`. Add a short README section: prompts live in `data/prompts.db` (SQLite); change the path with `PROMPT_DB_PATH`; requires Node 24+; the API runs only under `npm run dev` / `npm run preview`, so a static `dist/` deploy has no storage; existing browser prompts move over automatically on first load.
- [ ] **Step 3:** Run `npm test && npx tsc -b && npm run lint`. Expected: all pass, and `data/` does **not** exist afterwards (`ls data` fails).
- [ ] **Step 4:** Smoke test. Start `PROMPT_DB_PATH=$SCRATCH/smoke.db npx vite --port 5199` in the background, then:
  ```bash
  curl -s -XPOST localhost:5199/api/prompts -H 'content-type: application/json' -d '{"title":"Hi","content":"x"}'   # 201 JSON
  curl -s localhost:5199/api/prompts                                                                                # array with "Hi"
  curl -s -o /dev/null -w '%{http_code}' localhost:5199/                                                            # 200 (app still served)
  ```
  Stop the server, restart it, and confirm `GET` still returns "Hi" (it persisted to the file).
- [ ] **Step 5:** Commit: `feat: serve prompt API from Vite dev and preview servers`

---

### Task 5: Switch the client to the API

This is one task because the hook's signature becomes async, which changes `PromptForm`, `App`, and their tests together.

**Files:**
- Create: `src/api/promptApi.ts`, `src/api/promptApi.test.ts`, `src/test/fakeApi.ts`
- Rename + modify: `src/storage/promptStorage.ts` → `src/storage/legacyStorage.ts` (and its test)
- Modify: `src/hooks/usePrompts.ts`, `src/hooks/usePrompts.test.ts`, `src/components/PromptForm.tsx`, `src/components/PromptForm.test.tsx`, `src/App.tsx`, `src/App.test.tsx`

**Interfaces:**
- Consumes: API contract (Global Constraints); `isPrompt`, `validateInput`, `ValidationErrors` from `src/prompt.ts`.
- Produces:
  - `src/api/promptApi.ts`:
    ```ts
    export class ApiError extends Error {}   // network failure or unexpected status
    export function fetchPrompts(): Promise<Prompt[]>   // filters response with isPrompt
    export function postPrompt(input: NewPromptInput):
      Promise<{ ok: true; prompt: Prompt } | { ok: false; errors: ValidationErrors }>  // 400+errors → ok:false; else ApiError
    export function removePrompt(id: string): Promise<void>
    export function importPrompts(prompts: Prompt[]): Promise<number>
    ```
  - `src/storage/legacyStorage.ts`: `STORAGE_KEY` (unchanged value), `readLegacyPrompts(): Prompt[]` (today's `loadPrompts` behaviour), `clearLegacyPrompts(): void` (swallows errors). `savePrompts` and `StorageWriteError` are deleted.
  - `src/test/fakeApi.ts`: `installFakeApi(initial?: Prompt[]): { prompts: Prompt[]; failRequests(on: boolean): void; calls: string[] }`. Stubs `fetch` with `vi.stubGlobal`, implementing the API table in memory (same validation via `validateInput`/`createPrompt`). While `failRequests(true)` is set, every call rejects with `TypeError('Failed to fetch')`. `calls` records `"METHOD path"`. Add `vi.unstubAllGlobals()` to `setup.ts` `afterEach`.
  - `usePrompts()` returns `{ prompts: Prompt[]; status: 'loading' | 'ready' | 'error'; addPrompt(input): Promise<AddResult>; deletePrompt(id): Promise<AddResult> }`. `AddResult` keeps its shape; the `storage` key now carries the save-failure copy.
  - `PromptForm` prop: `onSave(input: NewPromptInput): Promise<AddResult>`.

- [ ] **Step 1: promptApi tests.** In `src/api/promptApi.test.ts`, stub `fetch` per test with `vi.stubGlobal('fetch', vi.fn(async () => new Response(...)))`. Tests:
  - `fetchPrompts drops malformed entries`
  - `postPrompt returns field errors on 400 with errors`
  - `postPrompt throws ApiError on 500 and on network failure`
  - `removePrompt resolves on 204 and encodes the id in the URL` (id `'a/b'` → path `/api/prompts/a%2Fb`)
  - `importPrompts returns the imported count`
  Run it, see it fail, implement `promptApi.ts`, then see it pass.
- [ ] **Step 2: legacy storage.** Rename `promptStorage.ts` → `legacyStorage.ts`. Keep the corrupt-data, malformed-entry, and Date-range tests (renamed to `readLegacyPrompts`). Seed data with `localStorage.setItem(STORAGE_KEY, JSON.stringify(...))`, not `savePrompts`. Add `clearLegacyPrompts removes the key`.
- [ ] **Step 3: hook tests.** Rewrite `usePrompts.test.ts` against `installFakeApi`, using `waitFor` for async state:
  - `starts loading, then lists prompts from the server newest first`
  - `adds a prompt and lists it first`
  - `returns validation errors without calling the server` — `calls` has no `POST`.
  - `deletes by id`
  - `reports a save error and leaves state unchanged when the server is unreachable` — `failRequests(true)` → `{ok:false, errors:{storage: <save copy>}}`.
  - `status is error when the initial load fails`
  - `migrates localStorage prompts once and clears the key` — seed legacy key with 2 prompts → the list shows them, the key is gone, and `calls` contains `POST /api/prompts/import` before `GET /api/prompts`.
  - `keeps localStorage prompts when the import fails` — `failRequests(true)` → key still present, status `error`.
  - `migration under StrictMode creates no duplicates` — `renderHook(usePrompts, { wrapper: StrictMode })` with 2 legacy prompts → the fake server holds exactly 2.
  - `refetches when the window regains focus` — add to `fake.prompts` directly, `window.dispatchEvent(new Event('focus'))`, and the new prompt appears.
- [ ] **Step 4:** Run `npx vitest run src/hooks`. Expected: FAIL.
- [ ] **Step 5: implement `usePrompts`.** On mount: if `readLegacyPrompts()` is non-empty, `await importPrompts(...)` then `clearLegacyPrompts()`; then `fetchPrompts()`. Set status `ready` or `error`. Ignore results after unmount (an `active` flag in the effect). On `window` `focus`, refetch silently and keep the current list if that fails. `addPrompt`: run `validateInput` first and return field errors with no request; otherwise `postPrompt`, and prepend `prompt` on success. `deletePrompt`: `removePrompt`, then filter state. Map a thrown `ApiError` to the save-failure copy. The StrictMode case is safe because the server import ignores existing ids; don't add client-side locking.
- [ ] **Step 6: PromptForm.** Make `handleSubmit` async and await `onSave`. Track `saving` state; set the submit button `disabled={saving}` and ignore submits while `saving` is true. Update `PromptForm.test.tsx` so mocks return promises. Add `ignores a second submit while the first is pending`: use an `onSave` whose promise you resolve manually, click Save twice, and expect `onSave` to have been called once with the button disabled; then resolve and the button is enabled.
- [ ] **Step 7: App.** `handleDelete` awaits `deletePrompt`. Under the "Saved prompts" heading, `status === 'loading'` renders `<p>Loading prompts…</p>`, and `status === 'error'` renders `<p role="alert" className="form-error">` with the load-failure copy, instead of `PromptList`. Rewrite `App.test.tsx` on `installFakeApi`:
  - `creates a prompt that survives a remount` (the fake server holds state across remounts)
  - `deletes a prompt and it stays deleted after a remount`
  - `shows an alert and keeps the prompt when a delete fails` (`failRequests(true)` after load)
  - `shows the load error, not the empty-list text, when the server is unreachable`
  - `keeps the typed text and shows the save error when saving fails`
  - `migrates corrupt localStorage without crashing` (`'{broken'` under the key → app renders, empty list, no import call)
- [ ] **Step 8:** Run `npm test && npx tsc -b && npm run lint`. Expected: all pass, and `grep -rn "savePrompts\|StorageWriteError\|promptStorage" src` prints nothing.
- [ ] **Step 9: Manual check.** Run `npm run dev`. In the browser console on the old origin, seed `localStorage['prompt-library:prompts']` with one prompt and reload: it appears, and `curl localhost:5173/api/prompts` returns it. Add one and delete one. Stop the dev server and click Save: the save error appears and the typed text stays.
- [ ] **Step 10:** Commit: `feat: store prompts in SQLite via the local API and migrate localStorage data`
