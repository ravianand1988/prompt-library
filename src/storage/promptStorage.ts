import { isPrompt } from '../prompt'
import type { Prompt } from '../types'

export { createPrompt, validateInput } from '../prompt'

export const STORAGE_KEY = 'prompt-library:prompts'

export class StorageWriteError extends Error {
  constructor(cause: unknown) {
    super('Failed to write prompts to localStorage', { cause })
    this.name = 'StorageWriteError'
  }
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
