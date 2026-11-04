import { type FormEvent, useRef, useState } from 'react'
import type { AddResult } from '../hooks/usePrompts'
import type { NewPromptInput } from '../types'

type Errors = Extract<AddResult, { ok: false }>['errors']

export function PromptForm({ onSave }: { onSave(input: NewPromptInput): Promise<AddResult> }) {
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [errors, setErrors] = useState<Errors>({})
  const [saving, setSaving] = useState(false)
  // A ref, not just state, so two submits in the same tick can't both get through.
  const savingRef = useRef(false)
  const titleRef = useRef<HTMLInputElement>(null)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (savingRef.current) return
    savingRef.current = true
    setSaving(true)
    let result: AddResult
    try {
      result = await onSave({ title, content })
    } finally {
      savingRef.current = false
      setSaving(false)
    }
    if (result.ok) {
      setTitle('')
      setContent('')
      setErrors({})
      titleRef.current?.focus()
    } else {
      setErrors(result.errors)
    }
  }

  return (
    <form aria-label="New prompt" className="prompt-form" onSubmit={handleSubmit} noValidate>
      <div className="field">
        <label htmlFor="prompt-title">Title</label>
        <input
          id="prompt-title"
          ref={titleRef}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          aria-invalid={errors.title ? true : undefined}
          aria-describedby={errors.title ? 'prompt-title-error' : undefined}
        />
        {errors.title && (
          <p id="prompt-title-error" className="field-error">
            {errors.title}
          </p>
        )}
      </div>
      <div className="field">
        <label htmlFor="prompt-content">Content</label>
        <textarea
          id="prompt-content"
          rows={6}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          aria-invalid={errors.content ? true : undefined}
          aria-describedby={errors.content ? 'prompt-content-error' : undefined}
        />
        {errors.content && (
          <p id="prompt-content-error" className="field-error">
            {errors.content}
          </p>
        )}
      </div>
      {errors.storage && (
        <p role="alert" className="form-error">
          {errors.storage}
        </p>
      )}
      <button type="submit" disabled={saving}>
        Save prompt
      </button>
    </form>
  )
}
