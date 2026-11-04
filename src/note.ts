import type { Note } from './types.ts'

export const MAX_NOTE_LENGTH = 2000

const isTime = (v: unknown): v is number =>
  typeof v === 'number' && !Number.isNaN(new Date(v).getTime())

export function isNote(value: unknown): value is Note {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return (
    typeof v.id === 'string' &&
    typeof v.promptId === 'string' &&
    typeof v.content === 'string' &&
    isTime(v.createdAt) &&
    isTime(v.updatedAt)
  )
}

/** Returns an error message, or undefined when the content can be saved. Notes are stored trimmed. */
export function validateNoteContent(content: string): string | undefined {
  const text = content.trim()
  if (text === '') return 'Note cannot be empty'
  if (text.length > MAX_NOTE_LENGTH) return `Note must be ${MAX_NOTE_LENGTH} characters or fewer`
  return undefined
}

export function createNote(promptId: string, content: string, now?: number): Note {
  const time = now ?? Date.now()
  return { id: crypto.randomUUID(), promptId, content: content.trim(), createdAt: time, updatedAt: time }
}
