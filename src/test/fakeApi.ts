import { vi } from 'vitest'
import { createNote, validateNoteContent } from '../note'
import { MetadataError, trackModel, updateTimestamps, validateModelName } from '../metadata'
import { applyEdit, createPrompt, DEFAULT_CATEGORY, hasErrors, parsePrompts, validateInput } from '../prompt'
import type { Note, Prompt } from '../types'

export interface FakeApi {
  /** Server-side state. Mutate it directly to simulate another tab. */
  prompts: Prompt[]
  /** Server-side notes, for every prompt. */
  notes: Note[]
  /** While on, every request rejects like a dead server. */
  failRequests(on: boolean): void
  /** Every request as "METHOD path". */
  calls: string[]
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

/** Stubs global fetch with an in-memory version of the server/api.ts contract. */
export function installFakeApi(initial: Prompt[] = [], initialNotes: Note[] = []): FakeApi {
  let failing = false
  const api: FakeApi = {
    prompts: initial.map((p) => ({ ...p })),
    notes: initialNotes.map((n) => ({ ...n })),
    failRequests: (on) => {
      failing = on
    },
    calls: [],
  }

  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(String(input), 'http://localhost').pathname
    const method = init?.method ?? 'GET'
    api.calls.push(`${method} ${path}`)
    if (failing) throw new TypeError('Failed to fetch')
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {}

    if (path === '/api/prompts' && method === 'GET') {
      return json(200, [...api.prompts].sort((a, b) => b.createdAt - a.createdAt))
    }
    if (path === '/api/prompts' && method === 'POST') {
      const input = {
        title: String(body.title ?? ''),
        content: String(body.content ?? ''),
        category: (body.category ?? DEFAULT_CATEGORY) as Prompt['category'],
        model: body.model === undefined ? undefined : String(body.model),
        isCode: body.isCode === true,
      }
      const errors = validateInput(input)
      if (hasErrors(errors)) return json(400, { errors })
      const prompt = createPrompt(input)
      api.prompts.push(prompt)
      return json(201, prompt)
    }
    if (path === '/api/prompts/import' && method === 'POST') {
      let imported = 0
      for (const p of parsePrompts(body.prompts as unknown[])) {
        if (api.prompts.some((x) => x.id === p.id)) continue
        api.prompts.push(p)
        imported++
      }
      return json(200, { imported })
    }
    const match = /^\/api\/prompts\/([^/]+)$/.exec(path)
    if (match && method === 'PUT') {
      const id = decodeURIComponent(match[1])
      const existing = api.prompts.find((p) => p.id === id)
      if (!existing) return json(404, { error: 'Not found' })
      const edit = {
        title: String(body.title ?? ''),
        content: String(body.content ?? ''),
        category: body.category as Prompt['category'],
        isCode: body.isCode === true,
      }
      const errors = validateInput(edit)
      if (hasErrors(errors)) return json(400, { errors })
      const prompt = applyEdit(existing, edit)
      api.prompts = api.prompts.map((p) => (p.id === id ? prompt : p))
      return json(200, prompt)
    }
    if (match && method === 'DELETE') {
      const id = decodeURIComponent(match[1])
      api.prompts = api.prompts.filter((p) => p.id !== id)
      api.notes = api.notes.filter((n) => n.promptId !== id)
      return new Response(null, { status: 204 })
    }
    const favorite = /^\/api\/prompts\/([^/]+)\/favorite$/.exec(path)
    if (favorite && method === 'PUT') {
      const id = decodeURIComponent(favorite[1])
      if (typeof body.isFavorite !== 'boolean') return json(400, { error: 'Bad flag' })
      const existing = api.prompts.find((p) => p.id === id)
      if (!existing) return json(404, { error: 'Not found' })
      const prompt = { ...existing, isFavorite: body.isFavorite }
      api.prompts = api.prompts.map((p) => (p.id === id ? prompt : p))
      return json(200, prompt)
    }
    const metadataMatch = /^\/api\/prompts\/([^/]+)\/metadata$/.exec(path)
    if (metadataMatch && method === 'PUT') {
      const id = decodeURIComponent(metadataMatch[1])
      const existing = api.prompts.find((p) => p.id === id)
      if (!existing) return json(404, { error: 'Not found' })
      try {
        const metadata = existing.metadata
          ? updateTimestamps({ ...existing.metadata, model: validateModelName(body.model) })
          : trackModel(String(body.model ?? ''), existing.content, { isCode: body.isCode === true })
        const prompt = { ...existing, metadata }
        api.prompts = api.prompts.map((p) => (p.id === id ? prompt : p))
        return json(200, prompt)
      } catch (error) {
        if (error instanceof MetadataError) return json(400, { errors: { model: error.message } })
        throw error
      }
    }
    const promptNotes = /^\/api\/prompts\/([^/]+)\/notes$/.exec(path)
    if (promptNotes) {
      const promptId = decodeURIComponent(promptNotes[1])
      if (method === 'GET') {
        const notes = api.notes.filter((n) => n.promptId === promptId)
        return json(200, notes.sort((a, b) => b.updatedAt - a.updatedAt))
      }
      if (method === 'POST') {
        const content = String(body.content ?? '')
        const error = validateNoteContent(content)
        if (error) return json(400, { errors: { content: error } })
        if (!api.prompts.some((p) => p.id === promptId)) return json(404, { error: 'Not found' })
        const note = createNote(promptId, content)
        api.notes.push(note)
        return json(201, note)
      }
    }
    const noteMatch = /^\/api\/notes\/([^/]+)$/.exec(path)
    if (noteMatch) {
      const id = decodeURIComponent(noteMatch[1])
      if (method === 'PUT') {
        const content = String(body.content ?? '')
        const error = validateNoteContent(content)
        if (error) return json(400, { errors: { content: error } })
        const existing = api.notes.find((n) => n.id === id)
        if (!existing) return json(404, { error: 'Not found' })
        const note = { ...existing, content: content.trim(), updatedAt: Date.now() }
        api.notes = api.notes.map((n) => (n.id === id ? note : n))
        return json(200, note)
      }
      if (method === 'DELETE') {
        api.notes = api.notes.filter((n) => n.id !== id)
        return new Response(null, { status: 204 })
      }
    }
    return json(404, { error: 'Not found' })
  })

  return api
}
