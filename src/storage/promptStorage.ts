import type { NewPromptInput, Prompt } from '../types'

export const STORAGE_KEY = 'prompt-library:prompts'

export class StorageWriteError extends Error {
  constructor(cause: unknown) {
    super('Failed to write prompts to localStorage', { cause })
    this.name = 'StorageWriteError'
  }
}

function isPrompt(value: unknown): value is Prompt {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return (
    typeof v.id === 'string' &&
    typeof v.title === 'string' &&
    typeof v.content === 'string' &&
    typeof v.createdAt === 'number' &&
    Number.isFinite(v.createdAt)
  )
}

export function loadPrompts(): Prompt[] {
  let parsed: unknown
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === null) return []
    parsed = JSON.parse(raw)
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) return []
  return parsed.filter(isPrompt).sort((a, b) => b.createdAt - a.createdAt)
}

export function savePrompts(prompts: Prompt[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prompts))
  } catch (error) {
    throw new StorageWriteError(error)
  }
}

export function validateInput(input: NewPromptInput): { title?: string; content?: string } {
  const errors: { title?: string; content?: string } = {}
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
