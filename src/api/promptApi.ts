import { type ValidationErrors, isPrompt } from '../prompt'
import type { NewPromptInput, Prompt } from '../types'

/** The server couldn't be reached or answered with an unexpected status. */
export class ApiError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'ApiError'
  }
}

export async function request(path: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(path, init)
  } catch (error) {
    throw new ApiError(`Network error for ${path}`, { cause: error })
  }
}

export async function readJson(res: Response): Promise<unknown> {
  try {
    return await res.json()
  } catch (error) {
    throw new ApiError(`Invalid JSON from ${res.url}`, { cause: error })
  }
}

export const jsonInit = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

export async function fetchPrompts(): Promise<Prompt[]> {
  const res = await request('/api/prompts')
  if (!res.ok) throw new ApiError(`GET /api/prompts failed: ${res.status}`)
  const body = await readJson(res)
  if (!Array.isArray(body)) throw new ApiError('GET /api/prompts returned a non-array')
  return body.filter(isPrompt)
}

export async function postPrompt(
  input: NewPromptInput,
): Promise<{ ok: true; prompt: Prompt } | { ok: false; errors: ValidationErrors }> {
  const res = await request('/api/prompts', jsonInit('POST', input))
  if (res.status === 201) {
    const body = await readJson(res)
    if (!isPrompt(body)) throw new ApiError('POST /api/prompts returned an invalid prompt')
    return { ok: true, prompt: body }
  }
  if (res.status === 400) {
    const body = (await readJson(res)) as { errors?: ValidationErrors } | null
    if (body?.errors) return { ok: false, errors: body.errors }
  }
  throw new ApiError(`POST /api/prompts failed: ${res.status}`)
}

export async function removePrompt(id: string): Promise<void> {
  const res = await request(`/api/prompts/${encodeURIComponent(id)}`, { method: 'DELETE' })
  if (!res.ok) throw new ApiError(`DELETE /api/prompts failed: ${res.status}`)
}

export async function importPrompts(prompts: Prompt[]): Promise<number> {
  const res = await request('/api/prompts/import', jsonInit('POST', { prompts }))
  if (!res.ok) throw new ApiError(`POST /api/prompts/import failed: ${res.status}`)
  const body = (await readJson(res)) as { imported?: unknown } | null
  return typeof body?.imported === 'number' ? body.imported : 0
}
