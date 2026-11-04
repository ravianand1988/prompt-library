import type { IncomingMessage, ServerResponse } from 'node:http'
import { createPrompt, validateInput } from '../src/prompt.ts'
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

export function createApiHandler(db: PromptDb): Middleware {
  async function route(method: string, path: string, req: IncomingMessage, res: ServerResponse) {
    if (path === '/api/prompts' && method === 'GET') {
      return sendJson(res, 200, db.list())
    }
    if (path === '/api/prompts' && method === 'POST') {
      const body = await readJson(req)
      const input = { title: asString(field(body, 'title')), content: asString(field(body, 'content')) }
      const errors = validateInput(input)
      if (errors.title || errors.content) return sendJson(res, 400, { errors })
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
    if (match && method === 'DELETE') {
      db.remove(decodeURIComponent(match[1]))
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
