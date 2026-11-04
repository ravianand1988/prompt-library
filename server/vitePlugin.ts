import path from 'node:path'
import type { Plugin, PreviewServer, ViteDevServer } from 'vite'
import { createApiHandler } from './api.ts'
import { openPromptDb } from './db.ts'

function mount(server: ViteDevServer | PreviewServer): void {
  const file = process.env.PROMPT_DB_PATH ?? path.resolve(server.config.root, 'data/prompts.db')
  const db = openPromptDb(file)
  server.middlewares.use(createApiHandler(db))
  server.httpServer?.on('close', () => db.close())
}

/** Serves the prompt API from the Vite dev and preview servers. */
export function promptApiPlugin(): Plugin {
  return {
    name: 'prompt-api',
    configureServer(server) {
      // Vitest runs its own internal Vite server; don't create a database during tests.
      if (process.env.VITEST) return
      mount(server)
    },
    configurePreviewServer(server) {
      mount(server)
    },
  }
}
