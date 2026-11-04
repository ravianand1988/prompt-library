# Prompt Library

Create, save and delete text prompts.

## Running

Requires **Node 24+** (it uses Node's built-in `node:sqlite`).

```bash
npm install
npm run dev
```

## Storage

Prompts live in a local SQLite database at `data/prompts.db` (git-ignored, created on first run).
Set `PROMPT_DB_PATH` to use a different file, e.g. `PROMPT_DB_PATH=~/prompts.db npm run dev`.

The small JSON API that reads and writes the database (`server/`) runs inside the Vite server, so it
only exists under `npm run dev` and `npm run preview`. A static `dist/` deploy has no backend and
can't store prompts.

Prompts saved by earlier versions in the browser's `localStorage` are moved into the database
automatically the first time the app loads.

---

## Template notes (React + TypeScript + Vite)

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend enabling type-aware lint rules by installing `oxlint-tsgolint` and editing `.oxlintrc.json`:

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["react", "typescript", "oxc"],
  "options": {
    "typeAware": true
  },
  "rules": {
    "react/rules-of-hooks": "error",
    "react/only-export-components": ["warn", { "allowConstantExport": true }]
  }
}
```

See the [Oxlint rules documentation](https://oxc.rs/docs/guide/usage/linter/rules) for the full list of rules and categories.
