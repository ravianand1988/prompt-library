import { expect, it } from 'vitest'
import { MAX_NOTE_LENGTH, createNote, isNote, validateNoteContent } from './note'

it('validateNoteContent rejects blank and over-long content', () => {
  expect(validateNoteContent('  \n ')).toBe('Note cannot be empty')
  expect(validateNoteContent('x'.repeat(MAX_NOTE_LENGTH + 1))).toMatch(/2000 characters/)
  expect(validateNoteContent(` ${'x'.repeat(MAX_NOTE_LENGTH)} `)).toBeUndefined()
})

it('createNote trims content and sets both timestamps', () => {
  const note = createNote('p1', '  hello  ', 5)
  expect(note).toMatchObject({ promptId: 'p1', content: 'hello', createdAt: 5, updatedAt: 5 })
  expect(isNote(note)).toBe(true)
})

it('isNote rejects malformed values', () => {
  expect(isNote(null)).toBe(false)
  expect(isNote({ id: 'a', promptId: 'p', content: 'c', createdAt: 1 })).toBe(false)
  expect(isNote({ id: 'a', promptId: 'p', content: 'c', createdAt: 1, updatedAt: 1e20 })).toBe(false)
})
