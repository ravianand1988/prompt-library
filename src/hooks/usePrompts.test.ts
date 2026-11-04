import { act, renderHook, waitFor } from '@testing-library/react'
import { StrictMode } from 'react'
import { expect, it, vi } from 'vitest'
import { STORAGE_KEY } from '../storage/legacyStorage'
import { installFakeApi } from '../test/fakeApi'
import type { Prompt } from '../types'
import { type AddResult, SAVE_ERROR, usePrompts } from './usePrompts'

const p = (id: string, createdAt = 1, isFavorite = false): Prompt => ({
  id,
  title: id,
  content: 'c',
  createdAt,
  isFavorite,
})
const seedLegacy = (prompts: Prompt[]) =>
  localStorage.setItem(STORAGE_KEY, JSON.stringify(prompts))

async function renderReady() {
  const hook = renderHook(() => usePrompts())
  await waitFor(() => expect(hook.result.current.status).toBe('ready'))
  return hook
}

it('starts loading, then lists prompts from the server newest first', async () => {
  installFakeApi([p('old', 1), p('new', 2)])
  const { result } = renderHook(() => usePrompts())
  expect(result.current.status).toBe('loading')
  await waitFor(() => expect(result.current.status).toBe('ready'))
  expect(result.current.prompts.map((x) => x.id)).toEqual(['new', 'old'])
})

it('adds a prompt and lists it first', async () => {
  installFakeApi([p('existing', 1)])
  const { result } = await renderReady()
  let r!: AddResult
  await act(async () => {
    r = await result.current.addPrompt({ title: 'Mine', content: 'm' })
  })
  expect(r).toEqual({ ok: true })
  expect(result.current.prompts.map((x) => x.title)).toEqual(['Mine', 'existing'])
})

it('returns validation errors without calling the server', async () => {
  const api = installFakeApi()
  const { result } = await renderReady()
  let r!: AddResult
  await act(async () => {
    r = await result.current.addPrompt({ title: ' ', content: '' })
  })
  expect(r).toEqual({
    ok: false,
    errors: { title: 'Title is required', content: 'Content is required' },
  })
  expect(api.calls.filter((c) => c.startsWith('POST'))).toEqual([])
})

it('deletes by id', async () => {
  const api = installFakeApi([p('1', 2), p('2', 1)])
  const { result } = await renderReady()
  let r!: AddResult
  await act(async () => {
    r = await result.current.deletePrompt('1')
  })
  expect(r).toEqual({ ok: true })
  expect(result.current.prompts.map((x) => x.id)).toEqual(['2'])
  expect(api.prompts.map((x) => x.id)).toEqual(['2'])
})

it('reports a save error and leaves state unchanged when the server is unreachable', async () => {
  const api = installFakeApi([p('1')])
  const { result } = await renderReady()
  api.failRequests(true)
  let add!: AddResult
  let del!: AddResult
  await act(async () => {
    add = await result.current.addPrompt({ title: 'A', content: 'a' })
    del = await result.current.deletePrompt('1')
  })
  expect(add).toEqual({ ok: false, errors: { storage: SAVE_ERROR } })
  expect(del).toEqual({ ok: false, errors: { storage: SAVE_ERROR } })
  expect(SAVE_ERROR).toBe(
    "Couldn't reach the prompt server. Check that the app is running and try again.",
  )
  expect(result.current.prompts.map((x) => x.id)).toEqual(['1'])
})

it('status is error when the initial load fails', async () => {
  const api = installFakeApi()
  api.failRequests(true)
  const { result } = renderHook(() => usePrompts())
  await waitFor(() => expect(result.current.status).toBe('error'))
  expect(result.current.prompts).toEqual([])
})

it('migrates localStorage prompts once and clears the key', async () => {
  const api = installFakeApi()
  seedLegacy([p('a', 1), p('b', 2)])
  const { result } = await renderReady()
  expect(result.current.prompts.map((x) => x.id)).toEqual(['b', 'a'])
  expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
  expect(api.calls).toEqual(['POST /api/prompts/import', 'GET /api/prompts'])
})

it('keeps localStorage prompts when the import fails', async () => {
  const api = installFakeApi()
  api.failRequests(true)
  seedLegacy([p('a')])
  const { result } = renderHook(() => usePrompts())
  await waitFor(() => expect(result.current.status).toBe('error'))
  expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull()
})

it('migration under StrictMode creates no duplicates', async () => {
  const api = installFakeApi()
  seedLegacy([p('a', 1), p('b', 2)])
  const { result } = renderHook(() => usePrompts(), { wrapper: StrictMode })
  await waitFor(() => expect(result.current.status).toBe('ready'))
  expect(api.prompts.map((x) => x.id).sort()).toEqual(['a', 'b'])
  expect(result.current.prompts.map((x) => x.id)).toEqual(['b', 'a'])
})

it('refetches when the window regains focus', async () => {
  const api = installFakeApi([p('mine', 1)])
  const { result } = await renderReady()
  api.prompts.push(p('from-other-tab', 2))
  act(() => {
    window.dispatchEvent(new Event('focus'))
  })
  await waitFor(() =>
    expect(result.current.prompts.map((x) => x.id)).toEqual(['from-other-tab', 'mine']),
  )
})

it('keeps the current list when a focus refetch fails', async () => {
  const api = installFakeApi([p('mine')])
  const { result } = await renderReady()
  api.failRequests(true)
  act(() => {
    window.dispatchEvent(new Event('focus'))
  })
  await waitFor(() => expect(api.calls.at(-1)).toBe('GET /api/prompts'))
  expect(result.current.status).toBe('ready')
  expect(result.current.prompts.map((x) => x.id)).toEqual(['mine'])
})

it('toggleFavorite flips the prompt immediately and saves it', async () => {
  const api = installFakeApi([p('a')])
  const { result } = await renderReady()
  let r!: AddResult
  await act(async () => {
    r = await result.current.toggleFavorite('a', true)
  })
  expect(r).toEqual({ ok: true })
  expect(result.current.prompts[0].isFavorite).toBe(true)
  expect(api.prompts[0].isFavorite).toBe(true)
})

it('toggleFavorite rolls back and reports an error when the save fails', async () => {
  const api = installFakeApi([p('a', 1, true)])
  const { result } = await renderReady()
  api.failRequests(true)
  let r!: AddResult
  await act(async () => {
    r = await result.current.toggleFavorite('a', false)
  })
  expect(r).toEqual({ ok: false, errors: { storage: SAVE_ERROR } })
  expect(result.current.prompts[0].isFavorite).toBe(true)
})

it('a failed older toggle does not undo a newer one', async () => {
  installFakeApi([p('a')])
  const { result } = await renderReady()
  // First request hangs then fails; the second succeeds.
  let failFirst!: () => void
  const realFetch = globalThis.fetch
  let n = 0
  vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => {
    if (++n === 1) return new Promise((_, reject) => (failFirst = () => reject(new TypeError('x'))))
    return realFetch(input, init)
  })
  let first!: Promise<AddResult>
  await act(async () => {
    first = result.current.toggleFavorite('a', true)
    await result.current.toggleFavorite('a', false)
  })
  await act(async () => {
    failFirst()
    await first
  })
  expect(result.current.prompts[0].isFavorite).toBe(false)
})
