// @vitest-environment node
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { Prompt } from '../src/types.ts'
import { createApiHandler } from './api.ts'
import { type PromptDb, openPromptDb } from './db.ts'

const p = (id: string, over: Partial<Prompt> = {}): Prompt => ({
  id,
  title: 'T',
  content: 'C',
  createdAt: 1,
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
