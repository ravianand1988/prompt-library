import type { MetadataObject } from './metadata.ts'

export const CATEGORIES = ['Frontend', 'Backend', 'FullStack', 'General'] as const

export type Category = (typeof CATEGORIES)[number]

export interface Prompt {
  id: string
  title: string
  content: string
  category: Category
  createdAt: number
  isFavorite: boolean
  /** Model and token estimate. Absent on prompts saved before metadata existed. */
  metadata?: MetadataObject
}

export interface NewPromptInput {
  title: string
  content: string
  category: Category
  /** Model the prompt is written for. Omitted by older clients: the prompt gets no metadata. */
  model?: string
  /** Counts the content as code in the token estimate. */
  isCode?: boolean
}

/** Fields a saved prompt can be changed in. The model is changed through its metadata. */
export interface PromptEdit {
  title: string
  content: string
  category: Category
  /** Counts the content as code when the token estimate is redone for new content. */
  isCode?: boolean
}

export interface Note {
  id: string
  promptId: string
  content: string
  createdAt: number
  updatedAt: number
}
