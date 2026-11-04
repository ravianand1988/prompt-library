import { expect, it } from 'vitest'
import type { Prompt } from '../types'
import { STORAGE_KEY, clearLegacyPrompts, readLegacyPrompts } from './legacyStorage'

const p = (over: Partial<Prompt> = {}): Prompt => ({
  id: 'a',
  title: 'T',
  content: 'C',
  createdAt: 1,
  isFavorite: false,
  ...over,
})
const seed = (value: unknown) => localStorage.setItem(STORAGE_KEY, JSON.stringify(value))

it('uses the original storage key', () => {
  expect(STORAGE_KEY).toBe('prompt-library:prompts')
})

it('returns [] when nothing is stored', () => {
  expect(readLegacyPrompts()).toEqual([])
})

it('reads stored prompts, newest first', () => {
  seed([p({ id: 'old', createdAt: 1 }), p({ id: 'new', createdAt: 2 })])
  expect(readLegacyPrompts().map((x) => x.id)).toEqual(['new', 'old'])
})

it.each(['not json{', '{"a":1}', '"str"', 'null'])('returns [] for corrupt value %s', (raw) => {
  localStorage.setItem(STORAGE_KEY, raw)
  expect(readLegacyPrompts()).toEqual([])
})

it('drops malformed entries and keeps valid ones', () => {
  seed([p({ id: 'ok' }), null, { id: 'x', title: 'T' }, { ...p(), createdAt: '1' }])
  expect(readLegacyPrompts().map((x) => x.id)).toEqual(['ok'])
})

it('drops entries whose createdAt is not a valid date', () => {
  seed([p({ id: 'ok' }), p({ id: 'huge', createdAt: 1e20 })])
  expect(readLegacyPrompts().map((x) => x.id)).toEqual(['ok'])
})

it('reads prompts saved before favorites existed as not favorited', () => {
  seed([{ id: 'a', title: 'T', content: 'C', createdAt: 1 }])
  expect(readLegacyPrompts()).toEqual([p()])
})

it('clearLegacyPrompts removes the key', () => {
  seed([p()])
  clearLegacyPrompts()
  expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
})
