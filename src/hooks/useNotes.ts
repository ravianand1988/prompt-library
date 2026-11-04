import { useCallback, useEffect, useState } from 'react'
import { type NoteResult, fetchNotes, postNote, putNote, removeNote } from '../api/noteApi'
import { ApiError } from '../api/promptApi'
import { validateNoteContent } from '../note'
import type { Note } from '../types'
import type { LoadStatus } from './usePrompts'

export type NoteActionResult = { ok: true } | { ok: false; error: string }

export const NOTE_SAVE_ERROR = "Couldn't reach the server. Your note wasn't saved — try again."

/** Most recently updated first, matching the server's ORDER BY. */
const byUpdatedDesc = (a: Note, b: Note) => b.updatedAt - a.updatedAt

/**
 * Keeps one prompt's notes in sync with the server. The list only changes after the
 * server accepts a write, so what's shown is always what's saved.
 */
export function useNotes(promptId: string) {
  const [notes, setNotes] = useState<Note[]>([])
  const [status, setStatus] = useState<LoadStatus>('loading')

  useEffect(() => {
    let active = true
    fetchNotes(promptId)
      .then((next) => {
        if (!active) return
        setNotes(next)
        setStatus('ready')
      })
      .catch(() => {
        if (active) setStatus('error')
      })
    return () => {
      active = false
    }
  }, [promptId])

  // Validates locally first (no request for an empty note), then applies the server's copy.
  const save = useCallback(
    async (content: string, send: () => Promise<NoteResult>): Promise<NoteActionResult> => {
      const error = validateNoteContent(content)
      if (error) return { ok: false, error }
      try {
        const result = await send()
        if (!result.ok) return result
        const saved = result.note
        setNotes((current) =>
          [saved, ...current.filter((n) => n.id !== saved.id)].sort(byUpdatedDesc),
        )
        return { ok: true }
      } catch (e) {
        if (e instanceof ApiError) return { ok: false, error: NOTE_SAVE_ERROR }
        throw e
      }
    },
    [],
  )

  const addNote = useCallback(
    (content: string) => save(content, () => postNote(promptId, content)),
    [promptId, save],
  )

  const updateNote = useCallback(
    (id: string, content: string) => save(content, () => putNote(id, content)),
    [save],
  )

  const deleteNote = useCallback(async (id: string): Promise<NoteActionResult> => {
    try {
      await removeNote(id)
    } catch (e) {
      if (e instanceof ApiError) return { ok: false, error: NOTE_SAVE_ERROR }
      throw e
    }
    setNotes((current) => current.filter((n) => n.id !== id))
    return { ok: true }
  }, [])

  return { notes, status, addNote, updateNote, deleteNote }
}
