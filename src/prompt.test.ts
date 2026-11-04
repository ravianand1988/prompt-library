import { describe, expect, it } from 'vitest'
import { createPrompt, isPrompt, validateInput } from './prompt'

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

it('isPrompt rejects wrong types and out-of-range dates', () => {
  expect(isPrompt({ id: 'a', title: 'T', content: 'C', createdAt: 1 })).toBe(true)
  expect(isPrompt({ id: 'a', title: 'T', content: 'C', createdAt: '1' })).toBe(false)
  expect(isPrompt({ id: 'a', title: 'T', content: 'C', createdAt: 1e20 })).toBe(false)
  expect(isPrompt(null)).toBe(false)
})
