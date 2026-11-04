import { isPrompt } from '../prompt'
import type { Prompt } from '../types'

/** Where versions before the SQLite backend kept prompts. Read once to migrate, then cleared. */
export const STORAGE_KEY = 'prompt-library:prompts'

export function readLegacyPrompts(): Prompt[] {
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

export function clearLegacyPrompts(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Storage disabled: nothing we can do, and the import is idempotent anyway.
  }
}
