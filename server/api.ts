import type { IncomingMessage, ServerResponse } from 'node:http'
import { createNote, validateNoteContent } from '../src/note.ts'
import { MetadataError, trackModel, updateTimestamps, validateModelName } from '../src/metadata.ts'
import { applyEdit, createPrompt, DEFAULT_CATEGORY, hasErrors, validateInput } from '../src/prompt.ts'
import type { Category } from '../src/types.ts'
import type { PromptDb } from './db.ts'

export type Middleware = (req: IncomingMessage, res: ServerResponse, next: () => void) => void

const MAX_BODY_BYTES = 5 * 1024 * 1024

class HttpError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

// Browsers send Origin on cross-site writes. Requiring it to match Host blocks other sites
// (and DNS-rebinding hosts) from changing the database through the user's browser.
function isForeignOrigin(req: IncomingMessage): boolean {
  const origin = req.headers.origin
  if (!origin) return false
  try {
    return new URL(origin).host !== req.headers.host
  } catch {
    return true
  }
}

// Forcing application/json makes cross-site POSTs non-"simple", so the browser preflights them.
function assertJson(req: IncomingMessage): void {
  const type = req.headers['content-type']?.split(';')[0].trim().toLowerCase()
  if (type !== 'application/json') throw new HttpError(415, 'Content-Type must be application/json')
}

// Drains the whole request even when it's too large, so the client gets the 413
// instead of a reset connection.
function readJson(req: IncomingMessage): Promise<unknown> {
  assertJson(req)
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size <= MAX_BODY_BYTES) chunks.push(chunk)
    })
    req.on('error', reject)
    req.on('end', () => {
      if (size > MAX_BODY_BYTES) return reject(new HttpError(413, 'Request body too large'))
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      } catch {
        reject(new HttpError(400, 'Invalid JSON'))
      }
    })
  })
}

const field = (body: unknown, key: string): unknown =>
  typeof body === 'object' && body !== null ? (body as Record<string, unknown>)[key] : undefined

const asString = (value: unknown): string => (typeof value === 'string' ? value : '')

// undefined (field omitted) means "no metadata"; anything else non-string fails model validation.
const asOptionalString = (value: unknown): string | undefined =>
  value === undefined ? undefined : asString(value)

export function createApiHandler(db: PromptDb): Middleware {
  async function route(method: string, path: string, req: IncomingMessage, res: ServerResponse) {
    if (path === '/api/prompts' && method === 'GET') {
      return sendJson(res, 200, db.list())
    }
    if (path === '/api/prompts' && method === 'POST') {
      const body = await readJson(req)
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
      if (hasErrors(errors)) return sendJson(res, 400, { errors })
      const prompt = createPrompt(input)
      db.insert(prompt)
      return sendJson(res, 201, prompt)
    }
    if (path === '/api/prompts/import' && method === 'POST') {
      const prompts = field(await readJson(req), 'prompts')
      if (!Array.isArray(prompts)) throw new HttpError(400, '"prompts" must be an array')
      return sendJson(res, 200, { imported: db.importMany(prompts) })
    }
    const match = /^\/api\/prompts\/([^/]+)$/.exec(path)
    if (match && method === 'PUT') {
      const body = await readJson(req)
      const existing = db.get(decodeURIComponent(match[1]))
      if (!existing) throw new HttpError(404, 'Prompt not found')
      const edit = {
        title: asString(field(body, 'title')),
        content: asString(field(body, 'content')),
        category: field(body, 'category') as Category,
        isCode: field(body, 'isCode') === true,
      }
      const errors = validateInput(edit)
      if (hasErrors(errors)) return sendJson(res, 400, { errors })
      const prompt = db.update(applyEdit(existing, edit))
      if (!prompt) throw new HttpError(404, 'Prompt not found')
      return sendJson(res, 200, prompt)
    }
    if (match && method === 'DELETE') {
      db.remove(decodeURIComponent(match[1]))
      res.statusCode = 204
      return res.end()
    }
    const favorite = /^\/api\/prompts\/([^/]+)\/favorite$/.exec(path)
    if (favorite && method === 'PUT') {
      const isFavorite = field(await readJson(req), 'isFavorite')
      if (typeof isFavorite !== 'boolean') throw new HttpError(400, '"isFavorite" must be a boolean')
      const prompt = db.setFavorite(decodeURIComponent(favorite[1]), isFavorite)
      if (!prompt) throw new HttpError(404, 'Prompt not found')
      return sendJson(res, 200, prompt)
    }
    const metadataMatch = /^\/api\/prompts\/([^/]+)\/metadata$/.exec(path)
    if (metadataMatch && method === 'PUT') {
      const body = await readJson(req)
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
        if (error instanceof MetadataError) {
          return sendJson(res, 400, { errors: { model: error.message } })
        }
        throw error
      }
      const prompt = db.setMetadata(id, metadata)
      if (!prompt) throw new HttpError(404, 'Prompt not found')
      return sendJson(res, 200, prompt)
    }
    const promptNotes = /^\/api\/prompts\/([^/]+)\/notes$/.exec(path)
    if (promptNotes && method === 'GET') {
      return sendJson(res, 200, db.listNotes(decodeURIComponent(promptNotes[1])))
    }
    if (promptNotes && method === 'POST') {
      const content = asString(field(await readJson(req), 'content'))
      const error = validateNoteContent(content)
      if (error) return sendJson(res, 400, { errors: { content: error } })
      const note = createNote(decodeURIComponent(promptNotes[1]), content)
      if (!db.insertNote(note)) throw new HttpError(404, 'Prompt not found')
      return sendJson(res, 201, note)
    }
    const noteMatch = /^\/api\/notes\/([^/]+)$/.exec(path)
    if (noteMatch && method === 'PUT') {
      const content = asString(field(await readJson(req), 'content'))
      const error = validateNoteContent(content)
      if (error) return sendJson(res, 400, { errors: { content: error } })
      const note = db.updateNote(decodeURIComponent(noteMatch[1]), content.trim(), Date.now())
      if (!note) throw new HttpError(404, 'Note not found')
      return sendJson(res, 200, note)
    }
    if (noteMatch && method === 'DELETE') {
      db.removeNote(decodeURIComponent(noteMatch[1]))
      res.statusCode = 204
      return res.end()
    }
    throw new HttpError(404, 'Not found')
  }

  return (req, res, next) => {
    const path = new URL(req.url ?? '/', 'http://x').pathname
    if (!path.startsWith('/api/')) return next()
    if (req.method !== 'GET' && req.method !== 'HEAD' && isForeignOrigin(req)) {
      return sendJson(res, 403, { error: 'Cross-origin request rejected' })
    }
    route(req.method ?? 'GET', path, req, res).catch((error: unknown) => {
      if (error instanceof HttpError) return sendJson(res, error.status, { error: error.message })
      console.error('[prompt-api]', error)
      sendJson(res, 500, { error: 'Internal error' })
    })
  }
}
