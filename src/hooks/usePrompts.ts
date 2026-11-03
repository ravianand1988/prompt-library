import { useCallback, useEffect, useState } from 'react'
import {
  STORAGE_KEY,
  StorageWriteError,
  createPrompt,
  loadPrompts,
  savePrompts,
  validateInput,
} from '../storage/promptStorage'
import type { NewPromptInput, Prompt } from '../types'

export type AddResult =
  | { ok: true }
  | { ok: false; errors: { title?: string; content?: string; storage?: string } }

const STORAGE_ERROR =
  "Couldn't save to browser storage. Your browser may be out of space or blocking storage."

export function usePrompts() {
  const [prompts, setPrompts] = useState<Prompt[]>(loadPrompts)

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY || event.key === null) setPrompts(loadPrompts())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  // Re-read storage before every write so changes made in other tabs survive.
  const persist = useCallback((update: (current: Prompt[]) => Prompt[]): AddResult => {
    const next = update(loadPrompts())
    try {
      savePrompts(next)
    } catch (error) {
      if (error instanceof StorageWriteError) {
        return { ok: false, errors: { storage: STORAGE_ERROR } }
      }
      throw error
    }
    setPrompts(next)
    return { ok: true }
  }, [])

  const addPrompt = useCallback(
    (input: NewPromptInput): AddResult => {
      const errors = validateInput(input)
      if (errors.title || errors.content) return { ok: false, errors }
      return persist((current) => [createPrompt(input), ...current])
    },
    [persist],
  )

  const deletePrompt = useCallback(
    (id: string): AddResult => persist((current) => current.filter((p) => p.id !== id)),
    [persist],
  )

  return { prompts, addPrompt, deletePrompt }
}
