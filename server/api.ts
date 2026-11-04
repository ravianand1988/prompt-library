import type { IncomingMessage, ServerResponse } from 'node:http'
import { HttpError, type PromptDb, routeApi } from '../src/api/routes.ts'

export type Middleware = (req: IncomingMessage, res: ServerResponse, next: () => void) => void

const MAX_BODY_BYTES = 5 * 1024 * 1024

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

export function createApiHandler(db: PromptDb): Middleware {
  return (req, res, next) => {
    const path = new URL(req.url ?? '/', 'http://x').pathname
    if (!path.startsWith('/api/')) return next()
    if (req.method !== 'GET' && req.method !== 'HEAD' && isForeignOrigin(req)) {
      return sendJson(res, 403, { error: 'Cross-origin request rejected' })
    }
    routeApi(db, req.method ?? 'GET', path, () => readJson(req))
      .then(({ status, body }) => {
        if (body === undefined) {
          res.statusCode = status
          return res.end()
        }
        sendJson(res, status, body)
      })
      .catch((error: unknown) => {
      if (error instanceof HttpError) return sendJson(res, error.status, { error: error.message })
      console.error('[prompt-api]', error)
      sendJson(res, 500, { error: 'Internal error' })
    })
  }
}
