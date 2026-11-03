# Prompt Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A single-page React app where a user can create, save and delete text prompts, with prompts persisted in the browser's `localStorage`.

**Architecture:** A pure storage module (`src/storage/promptStorage.ts`) owns the `localStorage` format, validation and error handling. A `usePrompts` hook wraps it as React state and exposes `addPrompt` / `deletePrompt`. Two presentational components (`PromptForm`, `PromptList`) are wired together in `App`. No backend, no router, no state library.

**Tech Stack:** React 19 + TypeScript, Vite 8 (`create-vite` `react-ts` template), Vitest 5 + jsdom, @testing-library/react, @testing-library/user-event, @testing-library/jest-dom.

**Spec:** None written. Requirements come from the user's request ("create, save and delete prompts in the local storage") plus the answers they gave while scoping this plan, recorded in Global Constraints below.

## Global Constraints

- Project root: `~/ravi/learnings/prompt-library` (new directory, new git repo).
- Stack: React + TypeScript + Vite. Tests use Vitest + jsdom + Testing Library.
- A prompt has exactly these fields: `id: string`, `title: string`, `content: string`, `createdAt: number` (epoch ms).
- Title and content are both required. A value made up only of whitespace counts as empty.
- Persistence is `localStorage` only, under the single key `prompt-library:prompts`, holding a JSON array of prompts.
- The list shows prompts newest first (by `createdAt` descending).
- Ids come from `crypto.randomUUID()`.
- No editing, search, tags or export. Out of scope (YAGNI).

## Review Focus

1. **Corrupt or foreign data under the storage key** (invalid JSON, a non-array, entries missing fields, for example after a hand edit or an old version). The app still loads, shows the valid entries and drops the rest, and doesn't crash. Tested in Task 1.
2. **`localStorage` write fails** (quota exceeded, storage disabled, some private-mode browsers). Saving shows an error, keeps what the user typed in the form, and doesn't add a phantom prompt to the list. Tested in Tasks 1, 2 and 3.
3. **Two tabs open.** Saving in tab B must not wipe a prompt created in tab A since B loaded, and B's list picks up A's changes. Mutations re-read storage before writing, and the hook listens for the `storage` event. Tested in Task 2.
4. **Whitespace-only or padded input.** `"   "` is rejected. The title is trimmed. The content keeps its internal newlines and indentation (only the emptiness check trims it). Tested in Tasks 1 and 3.
5. **Multi-line or HTML-looking content.** Newlines show as line breaks (`white-space: pre-wrap`), and text like `<b>hi</b>` appears literally, never as HTML (no `dangerouslySetInnerHTML`). Tested in Task 4.

---

## File Structure

```
prompt-library/
  vite.config.ts                 # + Vitest config (Task 1)
  src/
    types.ts                     # Prompt, NewPromptInput (Task 1)
    storage/promptStorage.ts     # localStorage read/write/validate (Task 1)
    storage/promptStorage.test.ts
    hooks/usePrompts.ts          # React state over storage (Task 2)
    hooks/usePrompts.test.ts
    components/PromptForm.tsx    # create form (Task 3)
    components/PromptForm.test.tsx
    components/PromptList.tsx    # list + delete (Task 4)
    components/PromptList.test.tsx
    App.tsx                      # wiring (Task 5), replaces template
    App.test.tsx
    App.css                      # replaces template styles (Task 5)
    test/setup.ts                # jest-dom matchers, localStorage.clear() afterEach
```

---

### Task 1: Scaffold the project and add the storage module

**Files:**
- Create: the project via `create-vite`, `src/types.ts`, `src/storage/promptStorage.ts`, `src/test/setup.ts`
- Modify: `vite.config.ts`, `package.json` (add a `"test": "vitest run"` script)
- Test: `src/storage/promptStorage.test.ts`

**Interfaces:**
- Produces (in `src/types.ts`):
  - `interface Prompt { id: string; title: string; content: string; createdAt: number }`
  - `interface NewPromptInput { title: string; content: string }`
- Produces (in `src/storage/promptStorage.ts`):
  - `const STORAGE_KEY = "prompt-library:prompts"`
  - `class StorageWriteError extends Error`
  - `loadPrompts(): Prompt[]`: never throws. It returns `[]` when the key is missing, the JSON is invalid, or the value isn't an array. It drops entries that aren't objects with string `id`/`title`/`content` and a finite number `createdAt`. The result is sorted by `createdAt` descending.
  - `savePrompts(prompts: Prompt[]): void`: writes JSON. If `setItem` throws, it throws `StorageWriteError` with the original error as `cause`.
  - `validateInput(input: NewPromptInput): { title?: string; content?: string }`: returns an error message per invalid field, or `{}` when valid. The messages are exactly `"Title is required"` and `"Content is required"`.
  - `createPrompt(input: NewPromptInput, now?: number): Prompt`: assigns `id: crypto.randomUUID()`, trims the title, keeps the content as given, and sets `createdAt: now ?? Date.now()`. It assumes `validateInput` has passed.

- [ ] **Step 1: Scaffold and install**

```bash
mkdir -p ~/ravi/learnings && cd ~/ravi/learnings
npx create-vite@latest prompt-library --template react-ts --no-interactive --no-immediate
cd prompt-library && git init
npm install
npm install -D vitest jsdom @testing-library/react @testing-library/user-event @testing-library/jest-dom
```

Leave `docs/superpowers/plans/` (this file) in place. `create-vite` may ask to overwrite the non-empty directory. If it does, move this plan out of the way, scaffold, then move it back.

Configure Vitest in `vite.config.ts`: add `/// <reference types="vitest/config" />` and `test: { environment: "jsdom", setupFiles: "./src/test/setup.ts" }`. `src/test/setup.ts` imports `@testing-library/jest-dom/vitest` and calls `afterEach(() => { cleanup(); localStorage.clear(); vi.restoreAllMocks(); })`. Add `"test": "vitest run"` to `package.json`.

- [ ] **Step 2: Write the failing tests** in `src/storage/promptStorage.test.ts`

```ts
const p = (over: Partial<Prompt> = {}): Prompt =>
  ({ id: "a", title: "T", content: "C", createdAt: 1, ...over });

it("returns [] when nothing is stored", () => expect(loadPrompts()).toEqual([]));

it("round-trips saved prompts, newest first", () => {
  savePrompts([p({ id: "old", createdAt: 1 }), p({ id: "new", createdAt: 2 })]);
  expect(loadPrompts().map((x) => x.id)).toEqual(["new", "old"]);
});

it.each(["not json{", '{"a":1}', '"str"', "null"])(
  "returns [] for corrupt value %s", (raw) => {
    localStorage.setItem(STORAGE_KEY, raw);
    expect(loadPrompts()).toEqual([]);
  });

it("drops malformed entries and keeps valid ones", () => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify([
    p({ id: "ok" }), null, { id: "x", title: "T" }, { ...p(), createdAt: "1" },
  ]));
  expect(loadPrompts().map((x) => x.id)).toEqual(["ok"]);
});

it("wraps setItem failures in StorageWriteError", () => {
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new DOMException("full", "QuotaExceededError");
  });
  expect(() => savePrompts([p()])).toThrow(StorageWriteError);
});

it("rejects empty and whitespace-only fields", () => {
  expect(validateInput({ title: "  ", content: "\n\t" }))
    .toEqual({ title: "Title is required", content: "Content is required" });
  expect(validateInput({ title: "a", content: "b" })).toEqual({});
});

it("createPrompt trims the title but preserves content whitespace", () => {
  const made = createPrompt({ title: "  Hi  ", content: "  line1\n  line2\n" }, 42);
  expect(made).toMatchObject({ title: "Hi", content: "  line1\n  line2\n", createdAt: 42 });
  expect(made.id).toMatch(/^[0-9a-f-]{36}$/);
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm test -- src/storage`
Expected: FAIL, because `promptStorage` can't be resolved.

- [ ] **Step 4: Implement `src/types.ts` and `src/storage/promptStorage.ts`** per the Interfaces block. `loadPrompts` wraps `JSON.parse` in try/catch and filters with an `isPrompt(value: unknown): value is Prompt` type guard (not exported).

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test -- src/storage`
Expected: PASS (7 tests, 10 with the `it.each` cases).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: scaffold app and add localStorage prompt storage"
```

---

### Task 2: Add the `usePrompts` hook

**Files:**
- Create: `src/hooks/usePrompts.ts`
- Test: `src/hooks/usePrompts.test.ts`

**Interfaces:**
- Consumes: `loadPrompts`, `savePrompts`, `createPrompt`, `validateInput`, `StorageWriteError`, `STORAGE_KEY`, `Prompt`, `NewPromptInput` from Task 1.
- Produces:
  - `type AddResult = { ok: true } | { ok: false; errors: { title?: string; content?: string; storage?: string } }`
  - `usePrompts(): { prompts: Prompt[]; addPrompt(input: NewPromptInput): AddResult; deletePrompt(id: string): AddResult }`
  - Storage error message, exactly: `"Couldn't save to browser storage. Your browser may be out of space or blocking storage."`

Behavior: the initial state is `loadPrompts()`. Both mutations **re-read** `loadPrompts()`, apply the change, `savePrompts()`, then set state to the re-read-and-modified list. When `savePrompts` throws `StorageWriteError`, React state stays unchanged and the result is `{ ok: false, errors: { storage: <message> } }`. A `window` `"storage"` event listener whose `key === STORAGE_KEY` (or `key === null`, which is a full clear) reloads state. It's removed on unmount.

- [ ] **Step 1: Write the failing tests** using `renderHook` and `act` from `@testing-library/react`

```ts
it("adds a prompt, persists it, and lists it first", () => {
  const { result } = renderHook(() => usePrompts());
  act(() => { result.current.addPrompt({ title: "A", content: "a" }); });
  act(() => { result.current.addPrompt({ title: "B", content: "b" }); });
  expect(result.current.prompts.map((p) => p.title)).toEqual(["B", "A"]);
  expect(loadPrompts()).toHaveLength(2);
});
// Use vi.spyOn(Date, "now") with increasing values so createdAt differs.

it("returns validation errors and stores nothing for blank input", () => {
  const { result } = renderHook(() => usePrompts());
  let r!: AddResult;
  act(() => { r = result.current.addPrompt({ title: " ", content: "" }); });
  expect(r).toEqual({ ok: false, errors: { title: "Title is required", content: "Content is required" } });
  expect(loadPrompts()).toEqual([]);
});

it("deletes by id from state and storage", () => { /* add 2, delete first id, expect 1 left in both */ });

it("reports a storage error and leaves state unchanged when the write fails", () => {
  const { result } = renderHook(() => usePrompts());
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("quota"); });
  let r!: AddResult;
  act(() => { r = result.current.addPrompt({ title: "A", content: "a" }); });
  expect(r).toEqual({ ok: false, errors: { storage: expect.stringContaining("Couldn't save") } });
  expect(result.current.prompts).toEqual([]);
});

it("does not overwrite prompts written by another tab", () => {
  const { result } = renderHook(() => usePrompts());          // loads []
  savePrompts([{ id: "other", title: "X", content: "x", createdAt: 1 }]); // other tab, no event
  act(() => { result.current.addPrompt({ title: "Mine", content: "m" }); });
  expect(loadPrompts().map((p) => p.id)).toContain("other");
});

it("reloads when another tab changes storage", () => {
  const { result } = renderHook(() => usePrompts());
  savePrompts([{ id: "other", title: "X", content: "x", createdAt: 1 }]);
  act(() => { window.dispatchEvent(new StorageEvent("storage", { key: STORAGE_KEY })); });
  expect(result.current.prompts.map((p) => p.id)).toEqual(["other"]);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- src/hooks`
Expected: FAIL, because `usePrompts` can't be resolved.

- [ ] **Step 3: Implement `usePrompts`** in `src/hooks/usePrompts.ts` per the Interfaces block, with `useState(loadPrompts)` (a lazy initializer) and `useEffect` for the listener.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- src/hooks`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/hooks
git commit -m "feat: add usePrompts hook with cross-tab sync"
```

---

### Task 3: Add the `PromptForm` component

**Files:**
- Create: `src/components/PromptForm.tsx`
- Test: `src/components/PromptForm.test.tsx`

**Interfaces:**
- Consumes: `AddResult` (Task 2), `NewPromptInput` (Task 1).
- Produces: `PromptForm(props: { onSave(input: NewPromptInput): AddResult }): JSX.Element`

Markup and copy, exactly:
- `<form aria-label="New prompt">`
- An `<input>` labelled `Title`, a `<textarea rows={6}>` labelled `Content`, and `<button type="submit">Save prompt</button>`.
- Field errors appear under each field, linked by `aria-describedby`, with `aria-invalid="true"` on the field. The storage error appears in an element with `role="alert"`.
- On `{ ok: true }`, both fields are cleared and the title input is focused. On `{ ok: false }`, the typed values are kept and the errors are shown. Errors clear on the next submit.

The component doesn't validate on its own. It shows whatever `onSave` returns, so validation lives in one place (Task 1).

- [ ] **Step 1: Write the failing tests** using `render`, `screen` and `userEvent.setup()`

```tsx
it("calls onSave with the typed values and clears on success", async () => {
  const onSave = vi.fn(() => ({ ok: true } as const));
  render(<PromptForm onSave={onSave} />);
  await user.type(screen.getByLabelText("Title"), "Greeting");
  await user.type(screen.getByLabelText("Content"), "Say hi{Enter}politely");
  await user.click(screen.getByRole("button", { name: "Save prompt" }));
  expect(onSave).toHaveBeenCalledWith({ title: "Greeting", content: "Say hi\npolitely" });
  expect(screen.getByLabelText("Title")).toHaveValue("");
  expect(screen.getByLabelText("Content")).toHaveValue("");
  expect(screen.getByLabelText("Title")).toHaveFocus();
});

it("shows field errors and keeps input on validation failure", async () => {
  const onSave = vi.fn(() => ({ ok: false, errors: { title: "Title is required" } } as const));
  render(<PromptForm onSave={onSave} />);
  await user.type(screen.getByLabelText("Content"), "kept");
  await user.click(screen.getByRole("button", { name: "Save prompt" }));
  expect(screen.getByText("Title is required")).toBeInTheDocument();
  expect(screen.getByLabelText("Title")).toHaveAttribute("aria-invalid", "true");
  expect(screen.getByLabelText("Content")).toHaveValue("kept");
});

it("shows a storage error as an alert and keeps input", async () => {
  const onSave = vi.fn(() => ({ ok: false, errors: { storage: "Couldn't save to browser storage." } } as const));
  render(<PromptForm onSave={onSave} />);
  await user.type(screen.getByLabelText("Title"), "T");
  await user.type(screen.getByLabelText("Content"), "C");
  await user.click(screen.getByRole("button", { name: "Save prompt" }));
  expect(screen.getByRole("alert")).toHaveTextContent("Couldn't save");
  expect(screen.getByLabelText("Title")).toHaveValue("T");
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- src/components/PromptForm`
Expected: FAIL, because `PromptForm` can't be resolved.

- [ ] **Step 3: Implement `PromptForm`** as controlled inputs with local `useState` for the values and errors, `event.preventDefault()` on submit, and a `useRef` on the title input for focus.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- src/components/PromptForm`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/PromptForm.tsx src/components/PromptForm.test.tsx
git commit -m "feat: add PromptForm component"
```

---

### Task 4: Add the `PromptList` component

**Files:**
- Create: `src/components/PromptList.tsx`
- Test: `src/components/PromptList.test.tsx`

**Interfaces:**
- Consumes: `Prompt` (Task 1).
- Produces: `PromptList(props: { prompts: Prompt[]; onDelete(id: string): void }): JSX.Element`

Markup and copy, exactly:
- With no prompts, it renders the text `No prompts yet. Create one above.` and no list.
- Otherwise it renders `<ul aria-label="Saved prompts">` with one `<li>` per prompt, in the order given (the hook already sorts). Each item has:
  - the title in an `<h3>`
  - the content in a `<p className="prompt-content">`
  - the created date via `new Date(createdAt).toLocaleString()` in a `<time dateTime={ISO string}>`
  - `<button>` with accessible name `Delete "<title>"`
- Delete asks `window.confirm(\`Delete "${title}"? This can't be undone.\`)` and calls `onDelete(id)` only if the user confirms.
- Content is rendered as a text child only, never through `dangerouslySetInnerHTML`.

- [ ] **Step 1: Write the failing tests**

```tsx
const prompts: Prompt[] = [
  { id: "1", title: "First", content: "line1\nline2", createdAt: 2 },
  { id: "2", title: "Second", content: "<b>bold?</b>", createdAt: 1 },
];

it("shows the empty state", () => {
  render(<PromptList prompts={[]} onDelete={vi.fn()} />);
  expect(screen.getByText("No prompts yet. Create one above.")).toBeInTheDocument();
  expect(screen.queryByRole("list")).not.toBeInTheDocument();
});

it("renders prompts in the given order", () => {
  render(<PromptList prompts={prompts} onDelete={vi.fn()} />);
  expect(screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual(["First", "Second"]);
});

it("renders content as literal text, preserving newlines", () => {
  const { container } = render(<PromptList prompts={prompts} onDelete={vi.fn()} />);
  expect(screen.getByText("<b>bold?</b>")).toBeInTheDocument();
  expect(container.querySelector("b")).toBeNull();
  expect(screen.getByText(/line1/).textContent).toBe("line1\nline2");
});

it("deletes after confirmation", async () => {
  vi.spyOn(window, "confirm").mockReturnValue(true);
  const onDelete = vi.fn();
  render(<PromptList prompts={prompts} onDelete={onDelete} />);
  await user.click(screen.getByRole("button", { name: 'Delete "First"' }));
  expect(window.confirm).toHaveBeenCalledWith(`Delete "First"? This can't be undone.`);
  expect(onDelete).toHaveBeenCalledWith("1");
});

it("does not delete when confirmation is cancelled", async () => {
  vi.spyOn(window, "confirm").mockReturnValue(false);
  const onDelete = vi.fn();
  render(<PromptList prompts={prompts} onDelete={onDelete} />);
  await user.click(screen.getByRole("button", { name: 'Delete "First"' }));
  expect(onDelete).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- src/components/PromptList`
Expected: FAIL, because `PromptList` can't be resolved.

- [ ] **Step 3: Implement `PromptList`** per the Interfaces block, using `key={prompt.id}`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- src/components/PromptList`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/PromptList.tsx src/components/PromptList.test.tsx
git commit -m "feat: add PromptList component with confirmed delete"
```

---

### Task 5: Wire up `App`, add styles, and clean up the template

**Files:**
- Modify: `src/App.tsx` (replace the template content), `src/App.css` (replace), `index.html` (`<title>Prompt Library</title>`)
- Delete: `src/assets/react.svg`, `public/vite.svg` (and its `<link rel="icon">` in `index.html`), and template CSS rules in `src/index.css` other than a basic reset
- Test: `src/App.test.tsx`

**Interfaces:**
- Consumes: `usePrompts` (Task 2), `PromptForm` (Task 3), `PromptList` (Task 4).
- Produces: `App(): JSX.Element` (default export, already imported by `src/main.tsx`).

Layout: `<main>` containing `<h1>Prompt Library</h1>`, then `<PromptForm onSave={addPrompt} />`, then `<h2>Saved prompts</h2>` and `<PromptList prompts={prompts} onDelete={deletePrompt} />`. In `App.css`, center a single column (`max-width: 720px`) and give `.prompt-content` `white-space: pre-wrap; overflow-wrap: anywhere;` so newlines show and long unbroken strings wrap instead of overflowing. Other styling is the implementer's choice.

The `onDelete` prop is `(id) => void`, but `deletePrompt` returns `AddResult`. If the delete's storage write fails, `App` shows the hook's storage message in a `role="alert"` element above the list.

- [ ] **Step 1: Write the failing integration tests**

```tsx
it("creates a prompt that survives a remount (persisted)", async () => {
  const { unmount } = render(<App />);
  await user.type(screen.getByLabelText("Title"), "Summarize");
  await user.type(screen.getByLabelText("Content"), "Summarize this text");
  await user.click(screen.getByRole("button", { name: "Save prompt" }));
  expect(within(screen.getByRole("list", { name: "Saved prompts" })).getByText("Summarize")).toBeInTheDocument();
  unmount();
  render(<App />);
  expect(screen.getByRole("heading", { name: "Summarize", level: 3 })).toBeInTheDocument();
});

it("deletes a prompt and it stays deleted after a remount", async () => {
  savePrompts([{ id: "1", title: "Old", content: "x", createdAt: 1 }]);
  vi.spyOn(window, "confirm").mockReturnValue(true);
  const { unmount } = render(<App />);
  await user.click(screen.getByRole("button", { name: 'Delete "Old"' }));
  expect(screen.getByText("No prompts yet. Create one above.")).toBeInTheDocument();
  unmount();
  render(<App />);
  expect(screen.getByText("No prompts yet. Create one above.")).toBeInTheDocument();
});

it("loads with corrupt storage without crashing", () => {
  localStorage.setItem(STORAGE_KEY, "{broken");
  render(<App />);
  expect(screen.getByRole("heading", { name: "Prompt Library" })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- src/App`
Expected: FAIL, because the template `App` has no "Title" field.

- [ ] **Step 3: Implement `App`**, replace the styles, and delete the template assets as listed under Files.

- [ ] **Step 4: Run the full suite, typecheck, and build**

Run: `npm test && npm run build && npm run lint`
Expected: all tests PASS (about 25), `tsc -b` and `vite build` finish with no errors, and lint is clean.

- [ ] **Step 5: Smoke-test in the browser**

Run: `npm run dev`, then open the printed URL.
- Create two prompts. Expected: they're listed newest first.
- Reload the page. Expected: both are still there.
- Delete one and confirm. Expected: it's gone, and it's still gone after a reload.
- In DevTools, set `localStorage["prompt-library:prompts"]` to `garbage` and reload. Expected: an empty list and no crash.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: wire up prompt library app"
```
