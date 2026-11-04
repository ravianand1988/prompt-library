/**
 * Metadata attached to a prompt: which model it was written for, when that was recorded,
 * and a rough token estimate of its content.
 */

export type Confidence = 'high' | 'medium' | 'low'

export interface TokenEstimate {
  min: number
  max: number
  confidence: Confidence
}

export interface MetadataObject {
  model: string
  /** ISO 8601, e.g. 2026-11-04T10:06:00.000Z */
  createdAt: string
  /** ISO 8601, never earlier than createdAt. */
  updatedAt: string
  tokenEstimate: TokenEstimate
}

/** Thrown for any invalid input to the functions in this module. */
export class MetadataError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MetadataError'
  }
}

export const MAX_MODEL_NAME_LENGTH = 100

/** Suggestions for the model picker. Any other non-empty name can be entered as a custom model. */
export const MODEL_GROUPS = [
  { label: 'Claude', models: ['Claude Opus 5.5', 'Claude Sonnet 5.5', 'Claude Haiku 5.5', 'Claude Fable 5.1'] },
  { label: 'OpenAI', models: ['GPT-5', 'GPT-5 mini', 'o3'] },
] as const

export const DEFAULT_MODEL: string = MODEL_GROUPS[0].models[0]

export const KNOWN_MODELS: readonly string[] = MODEL_GROUPS.flatMap((g) => g.models)

const CODE_MULTIPLIER = 1.3
const HIGH_CONFIDENCE_BELOW = 1000
const MEDIUM_CONFIDENCE_UP_TO = 5000

const ISO_8601 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/

/** True for YYYY-MM-DDTHH:mm:ss.sssZ strings that name a real instant (rejects e.g. Feb 30). */
export function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !ISO_8601.test(value)) return false
  const time = Date.parse(value)
  return !Number.isNaN(time) && new Date(time).toISOString() === value
}

function assertIsoDate(value: unknown, field: string): asserts value is string {
  if (!isIsoDate(value)) {
    throw new MetadataError(
      `${field} must be an ISO 8601 date string (YYYY-MM-DDTHH:mm:ss.sssZ), got ${JSON.stringify(value)}`,
    )
  }
}

/** Returns the trimmed model name, or throws when it is empty, not a string, or too long. */
export function validateModelName(modelName: unknown): string {
  if (typeof modelName !== 'string') {
    throw new MetadataError(`Model name must be a string, got ${typeof modelName}`)
  }
  const name = modelName.trim()
  if (name === '') throw new MetadataError('Model name is required')
  if (name.length > MAX_MODEL_NAME_LENGTH) {
    throw new MetadataError(
      `Model name must be ${MAX_MODEL_NAME_LENGTH} characters or fewer (got ${name.length})`,
    )
  }
  return name
}

function confidenceFor(tokens: number): Confidence {
  if (tokens < HIGH_CONFIDENCE_BELOW) return 'high'
  if (tokens <= MEDIUM_CONFIDENCE_UP_TO) return 'medium'
  return 'low'
}

/**
 * Rough token range: min = 0.75 × words, max = 0.25 × characters, both × 1.3 for code.
 * Text of many very short words can make the word-based figure the larger one, so the two
 * are ordered to keep min ≤ max. Confidence is judged on the upper figure.
 */
export function estimateTokens(text: string, isCode: boolean = false): TokenEstimate {
  if (typeof text !== 'string') {
    throw new MetadataError(`Text to estimate must be a string, got ${typeof text}`)
  }
  if (typeof isCode !== 'boolean') {
    throw new MetadataError(`isCode must be a boolean, got ${typeof isCode}`)
  }
  const words = text.trim() === '' ? 0 : text.trim().split(/\s+/).length
  const factor = isCode ? CODE_MULTIPLIER : 1
  const byWords = Math.round(0.75 * words * factor)
  const byChars = Math.round(0.25 * text.length * factor)
  const min = Math.min(byWords, byChars)
  const max = Math.max(byWords, byChars)
  return { min, max, confidence: confidenceFor(max) }
}

/** New metadata for content written for `modelName`, stamped with the current time. */
export function trackModel(
  modelName: string,
  content: string,
  options: { isCode?: boolean; now?: number } = {},
): MetadataObject {
  const model = validateModelName(modelName)
  if (typeof content !== 'string') {
    throw new MetadataError(`Content must be a string, got ${typeof content}`)
  }
  const date = new Date(options.now ?? Date.now())
  if (Number.isNaN(date.getTime())) throw new MetadataError('Timestamp is not a valid date')
  const timestamp = date.toISOString()
  return {
    model,
    createdAt: timestamp,
    updatedAt: timestamp,
    tokenEstimate: estimateTokens(content, options.isCode ?? false),
  }
}

/** Returns a copy with updatedAt set to now. Throws if the result would predate createdAt. */
export function updateTimestamps(metadata: MetadataObject, now: number = Date.now()): MetadataObject {
  const valid = parseMetadata(metadata)
  if (!valid) throw new MetadataError('Cannot update timestamps: metadata is not valid')
  const date = new Date(now)
  if (Number.isNaN(date.getTime())) throw new MetadataError('Timestamp is not a valid date')
  const updatedAt = date.toISOString()
  if (Date.parse(updatedAt) < Date.parse(valid.createdAt)) {
    throw new MetadataError(`updatedAt (${updatedAt}) cannot be earlier than createdAt (${valid.createdAt})`)
  }
  return { ...valid, updatedAt }
}

const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0

/** Returns valid metadata, or null. Used on anything read from storage or the network. */
export function parseMetadata(value: unknown): MetadataObject | null {
  if (typeof value !== 'object' || value === null) return null
  const v = value as Record<string, unknown>
  const t = v.tokenEstimate as Record<string, unknown> | null | undefined
  try {
    const model = validateModelName(v.model)
    assertIsoDate(v.createdAt, 'createdAt')
    assertIsoDate(v.updatedAt, 'updatedAt')
    if (Date.parse(v.updatedAt) < Date.parse(v.createdAt)) return null
    if (typeof t !== 'object' || t === null) return null
    if (!isCount(t.min) || !isCount(t.max) || t.min > t.max) return null
    if (t.confidence !== 'high' && t.confidence !== 'medium' && t.confidence !== 'low') return null
    return {
      model,
      createdAt: v.createdAt,
      updatedAt: v.updatedAt,
      tokenEstimate: { min: t.min, max: t.max, confidence: t.confidence },
    }
  } catch (error) {
    if (error instanceof MetadataError) return null
    throw error
  }
}

/** Newest first by metadata.createdAt; items without metadata fall back to `fallback` (epoch ms). */
export function sortByCreatedAtDesc<T>(
  items: readonly T[],
  getMetadata: (item: T) => MetadataObject | undefined,
  fallback: (item: T) => number,
): T[] {
  const key = (item: T) => {
    const m = getMetadata(item)
    return m ? Date.parse(m.createdAt) : fallback(item)
  }
  return [...items].sort((a, b) => key(b) - key(a))
}
