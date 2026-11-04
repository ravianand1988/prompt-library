// @vitest-environment node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, expect, it } from 'vitest'
import type { Prompt } from '../src/types.ts'
import { type PromptDb, openPromptDb } from './db.ts'

const p = (id: string, over: Partial<Prompt> = {}): Prompt => ({
  id,
  title: 'T',
  content: 'C',
  createdAt: 1,
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
