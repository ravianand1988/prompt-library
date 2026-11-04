import { describe, expect, it } from 'vitest'
import { applyEdit, createPrompt, parsePrompt, parsePrompts, validateInput } from './prompt'

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
    expect(made).toMatchObject({
      title: 'Hi',
      content: '  line1\n  line2\n',
      createdAt: 42,
      isFavorite: false,
    })
    expect(made.id).toMatch(/^[0-9a-f-]{36}$/)
  })
})

const base = { id: 'a', title: 'T', content: 'C', createdAt: 1 }

it('parsePrompt rejects wrong types and out-of-range dates', () => {
  expect(parsePrompt({ ...base, isFavorite: true })).toEqual({ ...base, isFavorite: true })
  expect(parsePrompt({ ...base, createdAt: '1' })).toBeNull()
  expect(parsePrompt({ ...base, createdAt: 1e20 })).toBeNull()
  expect(parsePrompt({ ...base, isFavorite: 'yes' })).toBeNull()
  expect(parsePrompt(null)).toBeNull()
})

it('parsePrompt reads prompts saved before favorites as not favorited, dropping extra fields', () => {
  expect(parsePrompt({ ...base, extra: 1 })).toEqual({ ...base, isFavorite: false })
})

it('parsePrompts keeps only valid entries', () => {
  expect(parsePrompts([base, null, { id: 'x' }])).toEqual([{ ...base, isFavorite: false }])
})

describe('applyEdit', () => {
  const base = {
    id: 'a',
    title: 'Old',
    content: 'same',
    category: 'General' as const,
    createdAt: 1,
    isFavorite: true,
  }
  const metadata = {
    model: 'GPT-5',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    tokenEstimate: { min: 1, max: 1, confidence: 'high' as const },
  }
  const now = Date.parse('2026-02-01T00:00:00.000Z')

  it('trims the title and keeps id, createdAt and favorite', () => {
    expect(applyEdit(base, { title: ' New ', content: ' body ', category: 'Backend' }, now)).toEqual({
      ...base,
      title: 'New',
      content: ' body ',
      category: 'Backend',
    })
  })

  it('keeps the token estimate when content is unchanged but bumps updatedAt', () => {
    const edited = applyEdit({ ...base, metadata }, { title: 'T', content: 'same', category: 'General' }, now)
    expect(edited.metadata).toEqual({ ...metadata, updatedAt: '2026-02-01T00:00:00.000Z' })
  })

  it('re-estimates tokens for new content, counting it as code when asked', () => {
    const edit = { title: 'T', content: 'a b c d', category: 'General' as const, isCode: true }
    const edited = applyEdit({ ...base, metadata }, edit, now)
    expect(edited.metadata?.tokenEstimate).toEqual({ min: 2, max: 4, confidence: 'high' })
  })
})
