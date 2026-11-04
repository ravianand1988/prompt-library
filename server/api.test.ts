// @vitest-environment node
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { Note, Prompt } from '../src/types.ts'
import { createApiHandler } from './api.ts'
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
let server: http.Server
let base: string

beforeEach(async () => {
  db = openPromptDb(':memory:')
  const handler = createApiHandler(db)
  server = http.createServer((req, res) =>
    handler(req, res, () => {
      res.statusCode = 418
      res.end()
    }),
  )
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterEach(async () => {
  await new Promise((resolve) => server.close(resolve))
  db.close()
})

const post = (path: string, body: unknown) =>
  fetch(base + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })

it('GET /api/prompts lists newest first', async () => {
  db.insert(p('old', { createdAt: 1 }))
  db.insert(p('new', { createdAt: 2 }))
  const res = await fetch(`${base}/api/prompts`)
  expect(res.status).toBe(200)
  expect(res.headers.get('content-type')).toContain('application/json')
  expect(((await res.json()) as Prompt[]).map((x) => x.id)).toEqual(['new', 'old'])
})

it('POST /api/prompts creates with trimmed title and server id/createdAt', async () => {
  const content = '  a\n\tb 👋 <b>x</b>'
  const res = await post('/api/prompts', { title: '  Hi ', content })
  expect(res.status).toBe(201)
  const made = (await res.json()) as Prompt
  expect(made).toMatchObject({ title: 'Hi', content })
  expect(made.id).toMatch(/^[0-9a-f-]{36}$/)
  expect(typeof made.createdAt).toBe('number')
  const listed = (await (await fetch(`${base}/api/prompts`)).json()) as Prompt[]
  expect(listed).toEqual([made])
})

it('POST rejects blank and non-string fields with field errors', async () => {
  const res = await post('/api/prompts', { title: ' ', content: 123 })
  expect(res.status).toBe(400)
  expect(await res.json()).toEqual({
    errors: { title: 'Title is required', content: 'Content is required' },
  })
  expect(db.list()).toEqual([])
})

it('POST rejects invalid JSON', async () => {
  const res = await post('/api/prompts', '{nope')
  expect(res.status).toBe(400)
  expect(await res.json()).toEqual({ error: expect.any(String) })
})

it('POST rejects bodies over 5 MB with 413, and keeps serving', async () => {
  const big = JSON.stringify({ title: 'x', content: 'a'.repeat(5 * 1024 * 1024) })
  const res = await post('/api/prompts', big)
  expect(res.status).toBe(413)
  expect(await res.json()).toEqual({ error: expect.any(String) })
  expect(db.list()).toEqual([])
  expect((await fetch(`${base}/api/prompts`)).status).toBe(200)
})

it('DELETE /api/prompts/:id returns 204 and removes it; unknown id also 204', async () => {
  db.insert(p('a/b'))
  db.insert(p('keep'))
  const res = await fetch(`${base}/api/prompts/${encodeURIComponent('a/b')}`, { method: 'DELETE' })
  expect(res.status).toBe(204)
  expect(db.list().map((x) => x.id)).toEqual(['keep'])
  expect((await fetch(`${base}/api/prompts/nope`, { method: 'DELETE' })).status).toBe(204)
})

it('POST /api/prompts/import returns imported count and is idempotent', async () => {
  const body = { prompts: [p('a'), p('b'), { junk: true }] }
  const first = await post('/api/prompts/import', body)
  expect(first.status).toBe(200)
  expect(await first.json()).toEqual({ imported: 2 })
  expect(await (await post('/api/prompts/import', body)).json()).toEqual({ imported: 0 })
  expect(db.list()).toHaveLength(2)
})

it('POST /api/prompts/import rejects a non-array', async () => {
  const res = await post('/api/prompts/import', { prompts: 'x' })
  expect(res.status).toBe(400)
  expect(await res.json()).toEqual({ error: expect.any(String) })
})

it('unknown /api route returns 404 JSON; non-api path calls next', async () => {
  const res = await fetch(`${base}/api/nope`)
  expect(res.status).toBe(404)
  expect(await res.json()).toEqual({ error: expect.any(String) })
  expect((await fetch(`${base}/api/prompts`, { method: 'PUT' })).status).toBe(404)
  expect((await fetch(`${base}/index.html`)).status).toBe(418)
  expect((await fetch(`${base}/apiary`)).status).toBe(418)
})

it('returns 500 JSON when the db throws', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(db, 'list').mockImplementation(() => {
    throw new Error('boom')
  })
  const res = await fetch(`${base}/api/prompts`)
  expect(res.status).toBe(500)
  expect(await res.json()).toEqual({ error: expect.any(String) })
})

it('rejects POST bodies that are not sent as JSON with 415', async () => {
  // A cross-site form or text/plain fetch is a "simple" request that skips the CORS preflight.
  const res = await fetch(`${base}/api/prompts`, {
    method: 'POST',
    headers: { 'content-type': 'text/plain' },
    body: JSON.stringify({ title: 'evil', content: 'x' }),
  })
  expect(res.status).toBe(415)
  expect(await res.json()).toEqual({ error: expect.any(String) })
  expect(db.list()).toEqual([])
})

it('rejects writes from another origin with 403', async () => {
  db.insert(p('keep'))
  const evil = { origin: 'http://evil.example' }
  const created = await fetch(`${base}/api/prompts`, {
    method: 'POST',
    headers: { ...evil, 'content-type': 'application/json' },
    body: JSON.stringify({ title: 'evil', content: 'x' }),
  })
  expect(created.status).toBe(403)
  const deleted = await fetch(`${base}/api/prompts/keep`, { method: 'DELETE', headers: evil })
  expect(deleted.status).toBe(403)
  expect(db.list().map((x) => x.id)).toEqual(['keep'])
})

it('accepts writes whose Origin matches the server', async () => {
  const res = await fetch(`${base}/api/prompts`, {
    method: 'POST',
    headers: { origin: base, 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ title: 'ok', content: 'x' }),
  })
  expect(res.status).toBe(201)
})

const put = (path: string, body: unknown) =>
  fetch(base + path, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })

it('notes: POST creates a trimmed note and GET lists it', async () => {
  db.insert(p('a'))
  const res = await post('/api/prompts/a/notes', { content: '  hello  ' })
  expect(res.status).toBe(201)
  const made = (await res.json()) as Note
  expect(made).toMatchObject({ promptId: 'a', content: 'hello' })
  expect(made.updatedAt).toBe(made.createdAt)
  const listed = await fetch(`${base}/api/prompts/a/notes`)
  expect(listed.status).toBe(200)
  expect(await listed.json()).toEqual([made])
})

it('notes: POST rejects blank and over-long content with field errors', async () => {
  db.insert(p('a'))
  const blank = await post('/api/prompts/a/notes', { content: '  ' })
  expect(blank.status).toBe(400)
  expect(await blank.json()).toEqual({ errors: { content: 'Note cannot be empty' } })
  const long = await post('/api/prompts/a/notes', { content: 'x'.repeat(2001) })
  expect(long.status).toBe(400)
  expect(db.listNotes('a')).toEqual([])
})

it('notes: POST to an unknown prompt returns 404', async () => {
  const res = await post('/api/prompts/missing/notes', { content: 'hi' })
  expect(res.status).toBe(404)
})

it('notes: PUT updates content and updatedAt; unknown id returns 404', async () => {
  db.insert(p('a'))
  const made = (await (await post('/api/prompts/a/notes', { content: 'v1' })).json()) as Note
  const res = await put(`/api/notes/${made.id}`, { content: ' v2 ' })
  expect(res.status).toBe(200)
  const updated = (await res.json()) as Note
  expect(updated).toMatchObject({ id: made.id, content: 'v2', createdAt: made.createdAt })
  expect(updated.updatedAt).toBeGreaterThanOrEqual(made.updatedAt)
  expect((await put('/api/notes/nope', { content: 'x' })).status).toBe(404)
  expect((await put(`/api/notes/${made.id}`, { content: '' })).status).toBe(400)
})

it('notes: DELETE removes the note with 204', async () => {
  db.insert(p('a'))
  const made = (await (await post('/api/prompts/a/notes', { content: 'bye' })).json()) as Note
  const res = await fetch(`${base}/api/notes/${made.id}`, { method: 'DELETE' })
  expect(res.status).toBe(204)
  expect(db.listNotes('a')).toEqual([])
})

it('notes: writes from another origin are rejected with 403', async () => {
  db.insert(p('a'))
  const res = await fetch(`${base}/api/prompts/a/notes`, {
    method: 'POST',
    headers: { origin: 'http://evil.example', 'content-type': 'application/json' },
    body: JSON.stringify({ content: 'x' }),
  })
  expect(res.status).toBe(403)
  expect(db.listNotes('a')).toEqual([])
})

it('favorite: PUT sets the flag, GET reflects it, and new prompts start unfavorited', async () => {
  const made = (await (await post('/api/prompts', { title: 'T', content: 'C' })).json()) as Prompt
  expect(made.isFavorite).toBe(false)
  const res = await put(`/api/prompts/${made.id}/favorite`, { isFavorite: true })
  expect(res.status).toBe(200)
  expect(await res.json()).toEqual({ ...made, isFavorite: true })
  const listed = (await (await fetch(`${base}/api/prompts`)).json()) as Prompt[]
  expect(listed[0].isFavorite).toBe(true)
})

it('favorite: rejects a non-boolean flag with 400 and an unknown prompt with 404', async () => {
  db.insert(p('a'))
  expect((await put('/api/prompts/a/favorite', { isFavorite: 'yes' })).status).toBe(400)
  expect((await put('/api/prompts/a/favorite', {})).status).toBe(400)
  expect(db.list()[0].isFavorite).toBe(false)
  expect((await put('/api/prompts/nope/favorite', { isFavorite: true })).status).toBe(404)
})

it('favorite: writes from another origin are rejected with 403', async () => {
  db.insert(p('a'))
  const res = await fetch(`${base}/api/prompts/a/favorite`, {
    method: 'PUT',
    headers: { origin: 'http://evil.example', 'content-type': 'application/json' },
    body: JSON.stringify({ isFavorite: true }),
  })
  expect(res.status).toBe(403)
  expect(db.list()[0].isFavorite).toBe(false)
})

it('PUT /api/prompts/:id saves title, content and category; keeps id, createdAt and favorite', async () => {
  db.insert(p('a', { category: 'General', isFavorite: true, createdAt: 5 }))
  const res = await put('/api/prompts/a', { title: '  New ', content: 'Body', category: 'Backend' })
  expect(res.status).toBe(200)
  const expected = { id: 'a', title: 'New', content: 'Body', category: 'Backend', createdAt: 5, isFavorite: true }
  expect(await res.json()).toEqual(expected)
  expect(db.get('a')).toEqual(expected)
})

it('PUT /api/prompts/:id re-estimates tokens and bumps updatedAt only on metadata it has', async () => {
  const metadata = {
    model: 'GPT-5',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    tokenEstimate: { min: 1, max: 1, confidence: 'high' as const },
  }
  db.insert(p('a', { category: 'General', metadata }))
  const res = await put('/api/prompts/a', { title: 'T', content: 'one two three four', category: 'General' })
  const saved = (await res.json()) as Prompt
  expect(saved.metadata).toMatchObject({ model: 'GPT-5', createdAt: metadata.createdAt })
  expect(saved.metadata!.updatedAt > metadata.updatedAt).toBe(true)
  expect(saved.metadata!.tokenEstimate).toEqual({ min: 3, max: 5, confidence: 'high' })
})

it('PUT /api/prompts/:id returns 400 with field errors and leaves the prompt unchanged', async () => {
  db.insert(p('a', { category: 'General' }))
  const res = await put('/api/prompts/a', { title: ' ', content: '', category: 'Nope' })
  expect(res.status).toBe(400)
  expect(await res.json()).toEqual({
    errors: { title: 'Title is required', content: 'Content is required', category: 'Choose a category' },
  })
  expect(db.get('a')).toMatchObject({ title: 'T', content: 'C' })
})

it('PUT /api/prompts/:id returns 404 for an unknown prompt', async () => {
  const res = await put('/api/prompts/missing', { title: 'T', content: 'C', category: 'General' })
  expect(res.status).toBe(404)
})
