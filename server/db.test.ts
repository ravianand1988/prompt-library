// @vitest-environment node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, expect, it } from 'vitest'
import type { Note, Prompt } from '../src/types.ts'
import { type PromptDb, openPromptDb } from './db.ts'

const p = (id: string, over: Partial<Prompt> = {}): Prompt => ({
  id,
  title: 'T',
  content: 'C',
  createdAt: 1,
  isFavorite: false,
  ...over,
})

let db: PromptDb
beforeEach(() => {
  db = openPromptDb(':memory:')
})
afterEach(() => db.close())

it('list returns [] for a fresh database', () => {
  expect(db.list()).toEqual([])
})

it('insert then list returns prompts newest first', () => {
  db.insert(p('old', { createdAt: 1 }))
  db.insert(p('new', { createdAt: 2 }))
  expect(db.list().map((x) => x.id)).toEqual(['new', 'old'])
})

it('round-trips content byte-for-byte', () => {
  const prompt = p('u', { content: '  a\n\tb 👋 <b>x</b>\n' })
  db.insert(prompt)
  expect(db.list()).toEqual([prompt])
})

it('remove deletes by id and ignores unknown ids', () => {
  db.insert(p('a'))
  db.insert(p('b'))
  db.remove('a')
  expect(() => db.remove('nope')).not.toThrow()
  expect(db.list().map((x) => x.id)).toEqual(['b'])
})

it('importMany keeps id and createdAt, drops invalid entries, ignores existing ids', () => {
  db.insert(p('a', { title: 'original' }))
  const n = db.importMany([
    p('a', { title: 'dupe' }),
    p('b', { createdAt: 5 }),
    null,
    { id: 'c' },
    { ...p('d'), createdAt: 1e20 },
  ])
  expect(n).toBe(1)
  expect(db.list()).toEqual([p('b', { createdAt: 5 }), p('a', { title: 'original' })])
})

it('importMany is idempotent', () => {
  const list = [p('a'), p('b')]
  expect(db.importMany(list)).toBe(2)
  expect(db.importMany(list)).toBe(0)
})

it('data persists across open/close on a file', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pl-'))
  const file = path.join(dir, 'nested', 'prompts.db')
  const a = openPromptDb(file)
  a.insert(p('kept'))
  a.close()
  const b = openPromptDb(file)
  expect(b.list().map((x) => x.id)).toEqual(['kept'])
  b.close()
  fs.rmSync(dir, { recursive: true, force: true })
})

const n = (id: string, promptId: string, over: Partial<Note> = {}): Note => ({
  id,
  promptId,
  content: 'note',
  createdAt: 1,
  updatedAt: 1,
  ...over,
})

it('notes: insert then list returns only that prompt\'s notes, most recently updated first', () => {
  db.insert(p('a'))
  db.insert(p('b'))
  expect(db.insertNote(n('n1', 'a', { updatedAt: 1 }))).toBe(true)
  expect(db.insertNote(n('n2', 'a', { updatedAt: 3 }))).toBe(true)
  expect(db.insertNote(n('n3', 'b'))).toBe(true)
  expect(db.listNotes('a').map((x) => x.id)).toEqual(['n2', 'n1'])
  expect(db.listNotes('a')[0]).toEqual(n('n2', 'a', { updatedAt: 3 }))
})

it('notes: insertNote returns false for an unknown prompt', () => {
  expect(db.insertNote(n('n1', 'missing'))).toBe(false)
  expect(db.listNotes('missing')).toEqual([])
})

it('notes: updateNote changes content and updatedAt, returns null for unknown ids', () => {
  db.insert(p('a'))
  db.insertNote(n('n1', 'a'))
  expect(db.updateNote('n1', 'edited', 9)).toEqual(n('n1', 'a', { content: 'edited', updatedAt: 9 }))
  expect(db.updateNote('nope', 'x', 9)).toBeNull()
})

it('notes: removeNote deletes one note; removing a prompt deletes its notes', () => {
  db.insert(p('a'))
  db.insertNote(n('n1', 'a'))
  db.insertNote(n('n2', 'a'))
  db.removeNote('n1')
  expect(db.listNotes('a').map((x) => x.id)).toEqual(['n2'])
  db.remove('a')
  db.insert(p('a'))
  expect(db.listNotes('a')).toEqual([])
})

it('setFavorite stores the flag and returns the prompt; unknown ids return null', () => {
  db.insert(p('a'))
  expect(db.setFavorite('a', true)).toEqual(p('a', { isFavorite: true }))
  expect(db.list()).toEqual([p('a', { isFavorite: true })])
  expect(db.setFavorite('a', false)).toEqual(p('a'))
  expect(db.setFavorite('nope', true)).toBeNull()
})

it('importMany keeps isFavorite and reads entries without it as not favorited', () => {
  db.importMany([p('a', { isFavorite: true }), { id: 'b', title: 'T', content: 'C', createdAt: 2 }])
  expect(db.list()).toEqual([p('b', { createdAt: 2 }), p('a', { isFavorite: true })])
})

it('adds the is_favorite column to a database created before favorites', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pl-'))
  const file = path.join(dir, 'old.db')
  const legacy = new DatabaseSync(file)
  legacy.exec(
    'CREATE TABLE prompts (id TEXT PRIMARY KEY, title TEXT NOT NULL, content TEXT NOT NULL, created_at INTEGER NOT NULL)',
  )
  legacy.exec("INSERT INTO prompts VALUES ('old', 'T', 'C', 1)")
  legacy.close()
  const migrated = openPromptDb(file)
  expect(migrated.list()).toEqual([p('old')])
  expect(migrated.setFavorite('old', true)?.isFavorite).toBe(true)
  migrated.close()
  // Reopening an already-migrated file must not try to add the column again.
  const again = openPromptDb(file)
  expect(again.list()).toEqual([p('old', { isFavorite: true })])
  again.close()
  fs.rmSync(dir, { recursive: true, force: true })
})

it('update saves title, content, category and metadata; unknown ids return null', () => {
  db.insert(p('a', { category: 'General', isFavorite: true }))
  const next = { ...p('a', { category: 'Frontend', isFavorite: true }), title: 'New', content: 'Body' }
  expect(db.update(next)).toEqual(next)
  expect(db.list()).toEqual([next])
  expect(db.update(p('missing', { category: 'General' }))).toBeNull()
})
