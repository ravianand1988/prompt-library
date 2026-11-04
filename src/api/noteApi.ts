import { isNote } from '../note'
import type { Note } from '../types'
import { ApiError, jsonInit, readJson, request } from './promptApi'

export type NoteResult = { ok: true; note: Note } | { ok: false; error: string }

const notesPath = (promptId: string) => `/api/prompts/${encodeURIComponent(promptId)}/notes`
const notePath = (id: string) => `/api/notes/${encodeURIComponent(id)}`

/** 201/200 carry the saved note; 400 carries the server's validation message. */
async function readNoteResult(res: Response, okStatus: number, label: string): Promise<NoteResult> {
  if (res.status === okStatus) {
    const body = await readJson(res)
    if (!isNote(body)) throw new ApiError(`${label} returned an invalid note`)
    return { ok: true, note: body }
  }
  if (res.status === 400) {
    const body = (await readJson(res)) as { errors?: { content?: string } } | null
    if (body?.errors?.content) return { ok: false, error: body.errors.content }
  }
  throw new ApiError(`${label} failed: ${res.status}`)
}

export async function fetchNotes(promptId: string): Promise<Note[]> {
  const res = await request(notesPath(promptId))
  if (!res.ok) throw new ApiError(`GET notes failed: ${res.status}`)
  const body = await readJson(res)
  if (!Array.isArray(body)) throw new ApiError('GET notes returned a non-array')
  return body.filter(isNote)
}

export async function postNote(promptId: string, content: string): Promise<NoteResult> {
  const res = await request(notesPath(promptId), jsonInit('POST', { content }))
  return readNoteResult(res, 201, 'POST note')
}

export async function putNote(id: string, content: string): Promise<NoteResult> {
  const res = await request(notePath(id), jsonInit('PUT', { content }))
  return readNoteResult(res, 200, 'PUT note')
}

export async function removeNote(id: string): Promise<void> {
  const res = await request(notePath(id), { method: 'DELETE' })
  if (!res.ok) throw new ApiError(`DELETE note failed: ${res.status}`)
}
