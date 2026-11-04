import { useCallback, useEffect, useState } from 'react'
import { ApiError, fetchPrompts, importPrompts, postPrompt, removePrompt } from '../api/promptApi'
import { validateInput } from '../prompt'
import { clearLegacyPrompts, readLegacyPrompts } from '../storage/legacyStorage'
import type { NewPromptInput, Prompt } from '../types'

export type AddResult =
  | { ok: true }
  | { ok: false; errors: { title?: string; content?: string; storage?: string } }

export type LoadStatus = 'loading' | 'ready' | 'error'

export const SAVE_ERROR =
  "Couldn't reach the prompt server. Check that the app is running and try again."

const saveFailed: AddResult = { ok: false, errors: { storage: SAVE_ERROR } }

/** Moves prompts left in localStorage by older versions into the database. */
async function migrateLegacyPrompts(): Promise<void> {
  const legacy = readLegacyPrompts()
  if (legacy.length === 0) return
  // The server ignores ids it already has, so a repeat (StrictMode, two tabs) is harmless.
  await importPrompts(legacy)
  clearLegacyPrompts()
}

export function usePrompts() {
  const [prompts, setPrompts] = useState<Prompt[]>([])
  const [status, setStatus] = useState<LoadStatus>('loading')

  useEffect(() => {
    let active = true

    const refresh = async () => {
      const next = await fetchPrompts()
      if (!active) return
      setPrompts(next)
      setStatus('ready')
    }

    migrateLegacyPrompts()
      .then(refresh)
      .catch(() => {
        if (active) setStatus('error')
      })

    // Another tab may have changed the database; a failed refetch keeps what we show.
    const onFocus = () => {
      refresh().catch(() => {})
    }
    window.addEventListener('focus', onFocus)
    return () => {
      active = false
      window.removeEventListener('focus', onFocus)
    }
  }, [])

  const addPrompt = useCallback(async (input: NewPromptInput): Promise<AddResult> => {
    const errors = validateInput(input)
    if (errors.title || errors.content) return { ok: false, errors }
    try {
      const result = await postPrompt(input)
      if (!result.ok) return result
      setPrompts((current) => [result.prompt, ...current])
      return { ok: true }
    } catch (error) {
      if (error instanceof ApiError) return saveFailed
      throw error
    }
  }, [])

  const deletePrompt = useCallback(async (id: string): Promise<AddResult> => {
    try {
      await removePrompt(id)
    } catch (error) {
      if (error instanceof ApiError) return saveFailed
      throw error
    }
    setPrompts((current) => current.filter((p) => p.id !== id))
    return { ok: true }
  }, [])

  return { prompts, status, addPrompt, deletePrompt }
}
