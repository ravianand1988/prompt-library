import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { isPrompt } from '../src/prompt.ts'
import type { Note, Prompt } from '../src/types.ts'

export interface PromptDb {
  list(): Prompt[]
  insert(prompt: Prompt): void
  remove(id: string): void
  importMany(prompts: unknown[]): number
  listNotes(promptId: string): Note[]
  /** Returns false when the prompt doesn't exist. */
  insertNote(note: Note): boolean
  /** Returns the updated note, or null when it doesn't exist. */
  updateNote(id: string, content: string, updatedAt: number): Note | null
  removeNote(id: string): void
  close(): void
}

const SCHEMA = `CREATE TABLE IF NOT EXISTS prompts (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL
)`

// Notes belong to a prompt; ON DELETE CASCADE removes them with it (needs foreign_keys = ON).
const NOTES_SCHEMA = `CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY,
  prompt_id TEXT NOT NULL REFERENCES prompts(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS notes_prompt_id ON notes (prompt_id)`

interface NoteRow {
  id: string
  prompt_id: string
  content: string
  created_at: number
  updated_at: number
}

const toNote = (r: NoteRow): Note => ({
  id: r.id,
  promptId: r.prompt_id,
  content: r.content,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
})

interface Row {
  id: string
  title: string
  content: string
  created_at: number
}

export function openPromptDb(file: string): PromptDb {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true })
  const db = new DatabaseSync(file)
  // SQLite leaves foreign keys off per connection unless asked.
  db.exec('PRAGMA foreign_keys = ON')
  db.exec(SCHEMA)
  db.exec(NOTES_SCHEMA)

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
  const noteColumns = 'id, prompt_id, content, created_at, updated_at'
  const selectNotes = db.prepare(
    `SELECT ${noteColumns} FROM notes WHERE prompt_id = ? ORDER BY updated_at DESC, created_at DESC`,
  )
  const selectNote = db.prepare(`SELECT ${noteColumns} FROM notes WHERE id = ?`)
  // Inserting through SELECT ... WHERE EXISTS skips the row (0 changes) for an unknown prompt.
  const insertNoteStmt = db.prepare(
    `INSERT INTO notes (${noteColumns})
     SELECT ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM prompts WHERE id = ?)`,
  )
  const updateNoteStmt = db.prepare('UPDATE notes SET content = ?, updated_at = ? WHERE id = ?')
  const deleteNote = db.prepare('DELETE FROM notes WHERE id = ?')

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
    listNotes(promptId) {
      return (selectNotes.all(promptId) as unknown as NoteRow[]).map(toNote)
    },
    insertNote(n) {
      const result = insertNoteStmt.run(n.id, n.promptId, n.content, n.createdAt, n.updatedAt, n.promptId)
      return Number(result.changes) === 1
    },
    updateNote(id, content, updatedAt) {
      if (Number(updateNoteStmt.run(content, updatedAt, id).changes) === 0) return null
      return toNote(selectNote.get(id) as unknown as NoteRow)
    },
    removeNote(id) {
      deleteNote.run(id)
    },
    close() {
      db.close()
    },
  }
}
