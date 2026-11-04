export interface Prompt {
  id: string
  title: string
  content: string
  createdAt: number
}

export interface NewPromptInput {
  title: string
  content: string
}

export interface Note {
  id: string
  promptId: string
  content: string
  createdAt: number
  updatedAt: number
}
