import { act, renderHook, waitFor } from '@testing-library/react'
import { expect, it } from 'vitest'
import { installFakeApi } from '../test/fakeApi'
import type { Note, Prompt } from '../types'
import { NOTE_SAVE_ERROR, type NoteActionResult, useNotes } from './useNotes'

const prompt: Prompt = { id: 'p1', title: 'P', content: 'c', createdAt: 1 }
const n = (id: string, updatedAt: number, promptId = 'p1'): Note => ({
  id,
  promptId,
  content: id,
  createdAt: updatedAt,
  updatedAt,
})

async function renderReady(promptId = 'p1') {
  const hook = renderHook(() => useNotes(promptId))
  await waitFor(() => expect(hook.result.current.status).toBe('ready'))
  return hook
}

it('loads only this prompt\'s notes, most recently updated first', async () => {
  installFakeApi([prompt], [n('old', 1), n('new', 2), n('other', 3, 'p2')])
  const { result } = await renderReady()
  expect(result.current.notes.map((x) => x.id)).toEqual(['new', 'old'])
})

it('adds a note to the top of the list', async () => {
  const api = installFakeApi([prompt], [n('old', 1)])
  const { result } = await renderReady()
  let r!: NoteActionResult
  await act(async () => {
    r = await result.current.addNote('  fresh  ')
  })
  expect(r).toEqual({ ok: true })
  expect(result.current.notes[0].content).toBe('fresh')
  expect(api.notes).toHaveLength(2)
})

it('rejects an empty note without calling the server', async () => {
  const api = installFakeApi([prompt])
  const { result } = await renderReady()
  const before = api.calls.length
  let r!: NoteActionResult
  await act(async () => {
    r = await result.current.addNote('   ')
  })
  expect(r).toEqual({ ok: false, error: 'Note cannot be empty' })
  expect(api.calls.length).toBe(before)
})

it('updates a note in place with the server copy', async () => {
  const api = installFakeApi([prompt], [n('a', 1), n('b', 2)])
  const { result } = await renderReady()
  await act(async () => {
    await result.current.updateNote('a', 'edited')
  })
  expect(result.current.notes.map((x) => x.content)).toEqual(['edited', 'b'])
  expect(api.notes.find((x) => x.id === 'a')?.content).toBe('edited')
})

it('deletes a note', async () => {
  const api = installFakeApi([prompt], [n('a', 1), n('b', 2)])
  const { result } = await renderReady()
  await act(async () => {
    await result.current.deleteNote('a')
  })
  expect(result.current.notes.map((x) => x.id)).toEqual(['b'])
  expect(api.notes.map((x) => x.id)).toEqual(['b'])
})

it('reports a save error and keeps the list when the server is down', async () => {
  const api = installFakeApi([prompt], [n('a', 1)])
  const { result } = await renderReady()
  api.failRequests(true)
  let add!: NoteActionResult
  let del!: NoteActionResult
  await act(async () => {
    add = await result.current.addNote('x')
    del = await result.current.deleteNote('a')
  })
  expect(add).toEqual({ ok: false, error: NOTE_SAVE_ERROR })
  expect(del).toEqual({ ok: false, error: NOTE_SAVE_ERROR })
  expect(result.current.notes.map((x) => x.id)).toEqual(['a'])
})

it('goes to the error status when loading fails', async () => {
  const api = installFakeApi([prompt])
  api.failRequests(true)
  const { result } = renderHook(() => useNotes('p1'))
  await waitFor(() => expect(result.current.status).toBe('error'))
})
