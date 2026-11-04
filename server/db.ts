import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { isPrompt } from '../src/prompt.ts'
import type { Prompt } from '../src/types.ts'

export interface PromptDb {
  list(): Prompt[]
  insert(prompt: Prompt): void
  remove(id: string): void
  importMany(prompts: unknown[]): number
  close(): void
}

const SCHEMA = `CREATE TABLE IF NOT EXISTS prompts (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL
)`

interface Row {
  id: string
  title: string
  content: string
  created_at: number
}

export function openPromptDb(file: string): PromptDb {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true })
  const db = new DatabaseSync(file)
  db.exec(SCHEMA)

  const selectAll = db.prepare(
    'SELECT id, title, content, created_at FROM prompts ORDER BY created_at DESC',
  )
  const insertOne = db.prepare(
    'INSERT INTO prompts (id, title, content, created_at) VALUES (?, ?, ?, ?)',
  )
  const insertIgnore = db.prepare(
    'INSERT OR IGNORE INTO prompts (id, title, content, created_at) VALUES (?, ?, ?, ?)',
  )
  const deleteOne = db.prepare('DELETE FROM prompts WHERE id = ?')

  return {
    list() {
      return (selectAll.all() as unknown as Row[]).map((r) => ({
        id: r.id,
        title: r.title,
        content: r.content,
        createdAt: r.created_at,
      }))
    },
    insert(p) {
      insertOne.run(p.id, p.title, p.content, p.createdAt)
    },
    remove(id) {
      deleteOne.run(id)
    },
    importMany(prompts) {
      let inserted = 0
      db.exec('BEGIN')
      try {
        for (const p of prompts.filter(isPrompt)) {
          inserted += Number(insertIgnore.run(p.id, p.title, p.content, p.createdAt).changes)
        }
        db.exec('COMMIT')
      } catch (error) {
        db.exec('ROLLBACK')
        throw error
      }
      return inserted
    },
    close() {
      db.close()
    },
  }
}
