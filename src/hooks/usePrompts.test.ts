import { act, renderHook } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { STORAGE_KEY, loadPrompts, savePrompts } from '../storage/promptStorage'
import { type AddResult, usePrompts } from './usePrompts'

const other = { id: 'other', title: 'X', content: 'x', createdAt: 1 }

it('adds a prompt, persists it, and lists it first', () => {
  vi.spyOn(Date, 'now').mockReturnValueOnce(100).mockReturnValueOnce(200)
  const { result } = renderHook(() => usePrompts())
  act(() => {
    result.current.addPrompt({ title: 'A', content: 'a' })
  })
  act(() => {
    result.current.addPrompt({ title: 'B', content: 'b' })
  })
  expect(result.current.prompts.map((p) => p.title)).toEqual(['B', 'A'])
  expect(loadPrompts()).toHaveLength(2)
})

it('returns validation errors and stores nothing for blank input', () => {
  const { result } = renderHook(() => usePrompts())
  let r!: AddResult
  act(() => {
    r = result.current.addPrompt({ title: ' ', content: '' })
  })
  expect(r).toEqual({
    ok: false,
    errors: { title: 'Title is required', content: 'Content is required' },
  })
  expect(loadPrompts()).toEqual([])
})

it('deletes by id from state and storage', () => {
  savePrompts([
    { id: '1', title: 'One', content: '1', createdAt: 2 },
    { id: '2', title: 'Two', content: '2', createdAt: 1 },
  ])
  const { result } = renderHook(() => usePrompts())
  let r!: AddResult
  act(() => {
    r = result.current.deletePrompt('1')
  })
  expect(r).toEqual({ ok: true })
  expect(result.current.prompts.map((p) => p.id)).toEqual(['2'])
  expect(loadPrompts().map((p) => p.id)).toEqual(['2'])
})

it('reports a storage error and leaves state unchanged when the write fails', () => {
  const { result } = renderHook(() => usePrompts())
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('quota')
  })
  let r!: AddResult
  act(() => {
    r = result.current.addPrompt({ title: 'A', content: 'a' })
  })
  expect(r).toEqual({ ok: false, errors: { storage: expect.stringContaining("Couldn't save") } })
  expect(result.current.prompts).toEqual([])
})

it('does not overwrite prompts written by another tab', () => {
  const { result } = renderHook(() => usePrompts())
  savePrompts([other])
  act(() => {
    result.current.addPrompt({ title: 'Mine', content: 'm' })
  })
  expect(loadPrompts().map((p) => p.id)).toContain('other')
})

it('reloads when another tab changes storage', () => {
  const { result } = renderHook(() => usePrompts())
  savePrompts([other])
  act(() => {
    window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY }))
  })
  expect(result.current.prompts.map((p) => p.id)).toEqual(['other'])
})
