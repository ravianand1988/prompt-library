import { createNote, validateNoteContent } from '../note.ts'
import { MetadataError, type MetadataObject, trackModel, updateTimestamps, validateModelName } from '../metadata.ts'
import { applyEdit, createPrompt, DEFAULT_CATEGORY, hasErrors, validateInput } from '../prompt.ts'
import type { Category, Note, Prompt } from '../types.ts'

/** Storage behind the API: SQLite on the server, localStorage in the static (GitHub Pages) build. */
export interface PromptDb {
  list(): Prompt[]
  insert(prompt: Prompt): void
  remove(id: string): void
  /** Returns the updated prompt, or null when it doesn't exist. */
  setFavorite(id: string, isFavorite: boolean): Prompt | null
  get(id: string): Prompt | null
  /** Saves title, content, category and metadata. Returns the stored prompt, or null when it doesn't exist. */
  update(prompt: Prompt): Prompt | null
  /** Returns the updated prompt, or null when it doesn't exist. */
  setMetadata(id: string, metadata: MetadataObject): Prompt | null
  importMany(prompts: unknown[]): number
  listNotes(promptId: string): Note[]
  /** Returns false when the prompt doesn't exist. */
  insertNote(note: Note): boolean
  /** Returns the updated note, or null when it doesn't exist. */
  updateNote(id: string, content: string, updatedAt: number): Note | null
  removeNote(id: string): void
  close(): void
}

export class HttpError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

/** A JSON response; no body means 204. */
export interface ApiResponse {
  status: number
  body?: unknown
}

const json = (status: number, body: unknown): ApiResponse => ({ status, body })
const noContent: ApiResponse = { status: 204 }

const field = (body: unknown, key: string): unknown =>
  typeof body === 'object' && body !== null ? (body as Record<string, unknown>)[key] : undefined

const asString = (value: unknown): string => (typeof value === 'string' ? value : '')

// undefined (field omitted) means "no metadata"; anything else non-string fails model validation.
const asOptionalString = (value: unknown): string | undefined =>
  value === undefined ? undefined : asString(value)

/**
 * Handles one API request. `readBody` parses the JSON body and is only called by routes that
 * take one. Throws HttpError for client errors; anything else is an internal error.
 */
export async function routeApi(
  db: PromptDb,
  method: string,
  path: string,
  readBody: () => Promise<unknown>,
): Promise<ApiResponse> {
  if (path === '/api/prompts' && method === 'GET') {
    return json(200, db.list())
  }
  if (path === '/api/prompts' && method === 'POST') {
    const body = await readBody()
    const category = field(body, 'category')
    const input = {
      title: asString(field(body, 'title')),
      content: asString(field(body, 'content')),
      // Older clients send no category; they get the default rather than an error.
      category: (category === undefined ? DEFAULT_CATEGORY : category) as Category,
      model: asOptionalString(field(body, 'model')),
      isCode: field(body, 'isCode') === true,
    }
    const errors = validateInput(input)
    if (hasErrors(errors)) return json(400, { errors })
    const prompt = createPrompt(input)
    db.insert(prompt)
    return json(201, prompt)
  }
  if (path === '/api/prompts/import' && method === 'POST') {
    const prompts = field(await readBody(), 'prompts')
    if (!Array.isArray(prompts)) throw new HttpError(400, '"prompts" must be an array')
    return json(200, { imported: db.importMany(prompts) })
  }
  const match = /^\/api\/prompts\/([^/]+)$/.exec(path)
  if (match && method === 'PUT') {
    const body = await readBody()
    const existing = db.get(decodeURIComponent(match[1]))
    if (!existing) throw new HttpError(404, 'Prompt not found')
    const edit = {
      title: asString(field(body, 'title')),
      content: asString(field(body, 'content')),
      category: field(body, 'category') as Category,
      isCode: field(body, 'isCode') === true,
    }
    const errors = validateInput(edit)
    if (hasErrors(errors)) return json(400, { errors })
    const prompt = db.update(applyEdit(existing, edit))
    if (!prompt) throw new HttpError(404, 'Prompt not found')
    return json(200, prompt)
  }
  if (match && method === 'DELETE') {
    db.remove(decodeURIComponent(match[1]))
    return noContent
  }
  const favorite = /^\/api\/prompts\/([^/]+)\/favorite$/.exec(path)
  if (favorite && method === 'PUT') {
    const isFavorite = field(await readBody(), 'isFavorite')
    if (typeof isFavorite !== 'boolean') throw new HttpError(400, '"isFavorite" must be a boolean')
    const prompt = db.setFavorite(decodeURIComponent(favorite[1]), isFavorite)
    if (!prompt) throw new HttpError(404, 'Prompt not found')
    return json(200, prompt)
  }
  const metadataMatch = /^\/api\/prompts\/([^/]+)\/metadata$/.exec(path)
  if (metadataMatch && method === 'PUT') {
    const body = await readBody()
    const id = decodeURIComponent(metadataMatch[1])
    const existing = db.get(id)
    if (!existing) throw new HttpError(404, 'Prompt not found')
    let metadata
    try {
      // Changing the model keeps createdAt and the estimate (the content hasn't changed);
      // a prompt without metadata gets a fresh record.
      metadata = existing.metadata
        ? updateTimestamps({ ...existing.metadata, model: validateModelName(field(body, 'model')) })
        : trackModel(asString(field(body, 'model')), existing.content, {
            isCode: field(body, 'isCode') === true,
          })
    } catch (error) {
      if (error instanceof MetadataError) return json(400, { errors: { model: error.message } })
      throw error
    }
    const prompt = db.setMetadata(id, metadata)
    if (!prompt) throw new HttpError(404, 'Prompt not found')
    return json(200, prompt)
  }
  const promptNotes = /^\/api\/prompts\/([^/]+)\/notes$/.exec(path)
  if (promptNotes && method === 'GET') {
    return json(200, db.listNotes(decodeURIComponent(promptNotes[1])))
  }
  if (promptNotes && method === 'POST') {
    const content = asString(field(await readBody(), 'content'))
    const error = validateNoteContent(content)
    if (error) return json(400, { errors: { content: error } })
    const note = createNote(decodeURIComponent(promptNotes[1]), content)
    if (!db.insertNote(note)) throw new HttpError(404, 'Prompt not found')
    return json(201, note)
  }
  const noteMatch = /^\/api\/notes\/([^/]+)$/.exec(path)
  if (noteMatch && method === 'PUT') {
    const content = asString(field(await readBody(), 'content'))
    const error = validateNoteContent(content)
    if (error) return json(400, { errors: { content: error } })
    const note = db.updateNote(decodeURIComponent(noteMatch[1]), content.trim(), Date.now())
    if (!note) throw new HttpError(404, 'Note not found')
    return json(200, note)
  }
  if (noteMatch && method === 'DELETE') {
    db.removeNote(decodeURIComponent(noteMatch[1]))
    return noContent
  }
  throw new HttpError(404, 'Not found')
}
