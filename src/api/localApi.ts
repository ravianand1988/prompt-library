import { openLocalDb } from '../storage/localDb'
import { HttpError, type PromptDb, routeApi } from './routes'

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

/**
 * Answers an /api/* request in the browser with the same routes the server uses, so the client
 * API code works unchanged on static hosting.
 */
export async function handleLocally(db: PromptDb, request: Request): Promise<Response> {
  const path = new URL(request.url).pathname
  const readBody = async () => {
    try {
      return await request.json()
    } catch {
      throw new HttpError(400, 'Invalid JSON')
    }
  }
  try {
    const { status, body } = await routeApi(db, request.method, path, readBody)
    return body === undefined ? new Response(null, { status }) : jsonResponse(status, body)
  } catch (error) {
    if (error instanceof HttpError) return jsonResponse(error.status, { error: error.message })
    console.error('[local-api]', error)
    return jsonResponse(500, { error: 'Internal error' })
  }
}

/** Routes the app's same-origin /api/* fetches to localStorage instead of the network. */
export function installLocalApi(db: PromptDb = openLocalDb()): void {
  const networkFetch = window.fetch.bind(window)
  window.fetch = (input, init) => {
    const request = new Request(input, init)
    const url = new URL(request.url)
    if (url.origin !== location.origin || !url.pathname.startsWith('/api/')) return networkFetch(input, init)
    return handleLocally(db, request)
  }
}
