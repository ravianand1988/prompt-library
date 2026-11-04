import { expect, it, vi } from 'vitest'
import { ApiError, fetchPrompts, importPrompts, postPrompt, removePrompt } from './promptApi'

const ok = { id: 'a', title: 'T', content: 'C', createdAt: 1 }
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const stub = (impl: (url: string, init?: RequestInit) => Promise<Response>) => {
  const fn = vi.fn(impl)
  vi.stubGlobal('fetch', fn)
  return fn
}

it('fetchPrompts drops malformed entries', async () => {
  stub(async () => json(200, [ok, { id: 'x' }, null]))
  expect(await fetchPrompts()).toEqual([ok])
})

it('fetchPrompts throws ApiError on a non-array body', async () => {
  stub(async () => json(200, { nope: true }))
  await expect(fetchPrompts()).rejects.toBeInstanceOf(ApiError)
})

it('postPrompt returns the created prompt on 201', async () => {
  const fetchMock = stub(async () => json(201, ok))
  expect(await postPrompt({ title: 'T', content: 'C' })).toEqual({ ok: true, prompt: ok })
  const [url, init] = fetchMock.mock.calls[0]
  expect(url).toBe('/api/prompts')
  expect(init).toMatchObject({ method: 'POST', body: JSON.stringify({ title: 'T', content: 'C' }) })
})

it('postPrompt returns field errors on 400 with errors', async () => {
  stub(async () => json(400, { errors: { title: 'Title is required' } }))
  expect(await postPrompt({ title: '', content: 'C' })).toEqual({
    ok: false,
    errors: { title: 'Title is required' },
  })
})

it('postPrompt throws ApiError on 500 and on network failure', async () => {
  stub(async () => json(500, { error: 'Internal error' }))
  await expect(postPrompt({ title: 'T', content: 'C' })).rejects.toBeInstanceOf(ApiError)
  stub(async () => {
    throw new TypeError('Failed to fetch')
  })
  await expect(postPrompt({ title: 'T', content: 'C' })).rejects.toBeInstanceOf(ApiError)
})

it('removePrompt resolves on 204 and encodes the id in the URL', async () => {
  const fetchMock = stub(async () => new Response(null, { status: 204 }))
  await expect(removePrompt('a/b')).resolves.toBeUndefined()
  expect(fetchMock.mock.calls[0][0]).toBe('/api/prompts/a%2Fb')
  expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'DELETE' })
})

it('removePrompt throws ApiError on 500', async () => {
  stub(async () => json(500, { error: 'x' }))
  await expect(removePrompt('a')).rejects.toBeInstanceOf(ApiError)
})

it('importPrompts returns the imported count', async () => {
  const fetchMock = stub(async () => json(200, { imported: 2 }))
  expect(await importPrompts([ok])).toBe(2)
  expect(fetchMock.mock.calls[0][0]).toBe('/api/prompts/import')
  expect(fetchMock.mock.calls[0][1]).toMatchObject({ body: JSON.stringify({ prompts: [ok] }) })
})
