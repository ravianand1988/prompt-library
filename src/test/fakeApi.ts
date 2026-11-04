import { vi } from 'vitest'
import { createPrompt, isPrompt, validateInput } from '../prompt'
import type { Prompt } from '../types'

export interface FakeApi {
  /** Server-side state. Mutate it directly to simulate another tab. */
  prompts: Prompt[]
  /** While on, every request rejects like a dead server. */
  failRequests(on: boolean): void
  /** Every request as "METHOD path". */
  calls: string[]
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

/** Stubs global fetch with an in-memory version of the server/api.ts contract. */
export function installFakeApi(initial: Prompt[] = []): FakeApi {
  let failing = false
  const api: FakeApi = {
    prompts: [...initial],
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
      const input = { title: String(body.title ?? ''), content: String(body.content ?? '') }
      const errors = validateInput(input)
      if (errors.title || errors.content) return json(400, { errors })
      const prompt = createPrompt(input)
      api.prompts.push(prompt)
      return json(201, prompt)
    }
    if (path === '/api/prompts/import' && method === 'POST') {
      let imported = 0
      for (const p of (body.prompts as unknown[]).filter(isPrompt)) {
        if (api.prompts.some((x) => x.id === p.id)) continue
        api.prompts.push(p)
        imported++
      }
      return json(200, { imported })
    }
    const match = /^\/api\/prompts\/([^/]+)$/.exec(path)
    if (match && method === 'DELETE') {
      const id = decodeURIComponent(match[1])
      api.prompts = api.prompts.filter((p) => p.id !== id)
      return new Response(null, { status: 204 })
    }
    return json(404, { error: 'Not found' })
  })

  return api
}
