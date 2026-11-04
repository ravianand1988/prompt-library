import type { NewPromptInput, Prompt } from './types.ts'

export type ValidationErrors = { title?: string; content?: string }

export function isPrompt(value: unknown): value is Prompt {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return (
    typeof v.id === 'string' &&
    typeof v.title === 'string' &&
    typeof v.content === 'string' &&
    typeof v.createdAt === 'number' &&
    // Finite numbers beyond the Date range make toISOString() throw at render time.
    !Number.isNaN(new Date(v.createdAt).getTime())
  )
}

export function validateInput(input: NewPromptInput): ValidationErrors {
  const errors: ValidationErrors = {}
  if (input.title.trim() === '') errors.title = 'Title is required'
  if (input.content.trim() === '') errors.content = 'Content is required'
  return errors
}

export function createPrompt(input: NewPromptInput, now?: number): Prompt {
  return {
    id: crypto.randomUUID(),
    title: input.title.trim(),
    content: input.content,
    createdAt: now ?? Date.now(),
  }
}
