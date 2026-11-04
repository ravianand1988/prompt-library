import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { type MetadataObject, parseMetadata } from '../src/metadata.ts'
import { DEFAULT_CATEGORY, isCategory, parsePrompts } from '../src/prompt.ts'
import type { PromptDb } from '../src/api/routes.ts'
import type { Note, Prompt } from '../src/types.ts'

export type { PromptDb }

const SCHEMA = `CREATE TABLE IF NOT EXISTS prompts (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  is_favorite INTEGER NOT NULL DEFAULT 0,
  category TEXT NOT NULL DEFAULT 'General',
  metadata TEXT
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
  is_favorite: number
  category: string
  metadata: string | null
}

/** Metadata is kept as a JSON column; a corrupt value reads as no metadata. */
function readMetadata(json: string | null): MetadataObject | null {
  if (json === null) return null
  try {
    return parseMetadata(JSON.parse(json))
  } catch {
    return null
  }
}

const writeMetadata = (m: MetadataObject | undefined): string | null => (m ? JSON.stringify(m) : null)

// SQLite has no boolean type; the flag is stored as 0/1.
const toPrompt = (r: Row): Prompt => {
  const metadata = readMetadata(r.metadata)
  return {
    id: r.id,
    title: r.title,
    content: r.content,
    category: isCategory(r.category) ? r.category : DEFAULT_CATEGORY,
    createdAt: r.created_at,
    isFavorite: r.is_favorite === 1,
    ...(metadata && { metadata }),
  }
}

/** Databases created before favorites, categories or metadata lack those columns; add them in place. */
function migrate(db: DatabaseSync): void {
  const columns = db.prepare('PRAGMA table_info(prompts)').all() as { name: string }[]
  if (!columns.some((c) => c.name === 'is_favorite')) {
    db.exec('ALTER TABLE prompts ADD COLUMN is_favorite INTEGER NOT NULL DEFAULT 0')
  }
  if (!columns.some((c) => c.name === 'category')) {
    db.exec("ALTER TABLE prompts ADD COLUMN category TEXT NOT NULL DEFAULT 'General'")
  }
  if (!columns.some((c) => c.name === 'metadata')) {
    db.exec('ALTER TABLE prompts ADD COLUMN metadata TEXT')
  }
}

export function openPromptDb(file: string): PromptDb {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true })
  const db = new DatabaseSync(file)
  // SQLite leaves foreign keys off per connection unless asked.
  db.exec('PRAGMA foreign_keys = ON')
  db.exec(SCHEMA)
  migrate(db)
  db.exec(NOTES_SCHEMA)

  const promptColumns = 'id, title, content, created_at, is_favorite, category, metadata'
  const selectAll = db.prepare(`SELECT ${promptColumns} FROM prompts ORDER BY created_at DESC`)
  const selectOne = db.prepare(`SELECT ${promptColumns} FROM prompts WHERE id = ?`)
  const insertOne = db.prepare(`INSERT INTO prompts (${promptColumns}) VALUES (?, ?, ?, ?, ?, ?, ?)`)
  const insertIgnore = db.prepare(
    `INSERT OR IGNORE INTO prompts (${promptColumns}) VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
  const updateFavorite = db.prepare('UPDATE prompts SET is_favorite = ? WHERE id = ?')
  const updateOne = db.prepare(
    'UPDATE prompts SET title = ?, content = ?, category = ?, metadata = ? WHERE id = ?',
  )
  const updateMetadata = db.prepare('UPDATE prompts SET metadata = ? WHERE id = ?')
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
      return (selectAll.all() as unknown as Row[]).map(toPrompt)
    },
    insert(p) {
      insertOne.run(
        p.id,
        p.title,
        p.content,
        p.createdAt,
        Number(p.isFavorite),
        p.category,
        writeMetadata(p.metadata),
      )
    },
    remove(id) {
      deleteOne.run(id)
    },
    setFavorite(id, isFavorite) {
      if (Number(updateFavorite.run(Number(isFavorite), id).changes) === 0) return null
      return toPrompt(selectOne.get(id) as unknown as Row)
    },
    get(id) {
      const row = selectOne.get(id) as unknown as Row | undefined
      return row ? toPrompt(row) : null
    },
    update(p) {
      const result = updateOne.run(p.title, p.content, p.category, writeMetadata(p.metadata), p.id)
      if (Number(result.changes) === 0) return null
      return toPrompt(selectOne.get(p.id) as unknown as Row)
    },
    setMetadata(id, metadata) {
      if (Number(updateMetadata.run(writeMetadata(metadata), id).changes) === 0) return null
      return toPrompt(selectOne.get(id) as unknown as Row)
    },
    importMany(prompts) {
      let inserted = 0
      db.exec('BEGIN')
      try {
        for (const p of parsePrompts(prompts)) {
          const result = insertIgnore.run(
            p.id,
            p.title,
            p.content,
            p.createdAt,
            Number(p.isFavorite),
            p.category,
            writeMetadata(p.metadata),
          )
          inserted += Number(result.changes)
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
