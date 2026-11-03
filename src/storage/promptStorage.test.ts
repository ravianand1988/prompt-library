import { describe, expect, it, vi } from 'vitest'
import type { Prompt } from '../types'
import {
  STORAGE_KEY,
  StorageWriteError,
  createPrompt,
  loadPrompts,
  savePrompts,
  validateInput,
} from './promptStorage'

const p = (over: Partial<Prompt> = {}): Prompt => ({
  id: 'a',
  title: 'T',
  content: 'C',
  createdAt: 1,
  ...over,
})

describe('loadPrompts / savePrompts', () => {
  it('returns [] when nothing is stored', () => {
    expect(loadPrompts()).toEqual([])
  })

  it('round-trips saved prompts, newest first', () => {
    savePrompts([p({ id: 'old', createdAt: 1 }), p({ id: 'new', createdAt: 2 })])
    expect(loadPrompts().map((x) => x.id)).toEqual(['new', 'old'])
  })

  it.each(['not json{', '{"a":1}', '"str"', 'null'])('returns [] for corrupt value %s', (raw) => {
    localStorage.setItem(STORAGE_KEY, raw)
    expect(loadPrompts()).toEqual([])
  })

  it('drops malformed entries and keeps valid ones', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([p({ id: 'ok' }), null, { id: 'x', title: 'T' }, { ...p(), createdAt: '1' }]),
    )
    expect(loadPrompts().map((x) => x.id)).toEqual(['ok'])
  })

  it('drops entries whose createdAt is not a valid date', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([p({ id: 'ok' }), p({ id: 'huge', createdAt: 1e20 })]),
    )
    expect(loadPrompts().map((x) => x.id)).toEqual(['ok'])
  })

  it('wraps setItem failures in StorageWriteError', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError')
    })
    expect(() => savePrompts([p()])).toThrow(StorageWriteError)
  })
})

describe('validateInput', () => {
  it('rejects empty and whitespace-only fields', () => {
    expect(validateInput({ title: '  ', content: '\n\t' })).toEqual({
      title: 'Title is required',
      content: 'Content is required',
    })
    expect(validateInput({ title: 'a', content: 'b' })).toEqual({})
  })
})

describe('createPrompt', () => {
  it('trims the title but preserves content whitespace', () => {
    const made = createPrompt({ title: '  Hi  ', content: '  line1\n  line2\n' }, 42)
    expect(made).toMatchObject({ title: 'Hi', content: '  line1\n  line2\n', createdAt: 42 })
    expect(made.id).toMatch(/^[0-9a-f-]{36}$/)
  })
})
