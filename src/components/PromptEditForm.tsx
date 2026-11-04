import { type FormEvent, useEffect, useRef, useState } from 'react'
import type { AddResult } from '../hooks/usePrompts'
import type { Prompt, PromptEdit } from '../types'
import { type PromptFieldValues, PromptFields } from './PromptFields'

type Errors = Extract<AddResult, { ok: false }>['errors']

/** Edits the title, category and content of a saved prompt. The model is edited in its metadata section. */
export function PromptEditForm({
  prompt,
  onSave,
  onCancel,
}: {
  prompt: Prompt
  onSave(id: string, edit: PromptEdit): Promise<AddResult>
  /** Called after a successful save too, to leave edit mode. */
  onCancel(): void
}) {
  const [values, setValues] = useState<PromptFieldValues>({
    title: prompt.title,
    content: prompt.content,
    category: prompt.category,
  })
  const [isCode, setIsCode] = useState(false)
  const [errors, setErrors] = useState<Errors>({})
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)
  const titleRef = useRef<HTMLInputElement>(null)

  useEffect(() => titleRef.current?.focus(), [])

  const contentChanged = values.content !== prompt.content

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (savingRef.current) return
    savingRef.current = true
    setSaving(true)
    let result: AddResult
    try {
      result = await onSave(prompt.id, { ...values, isCode })
    } finally {
      savingRef.current = false
      setSaving(false)
    }
    if (result.ok) onCancel()
    else setErrors(result.errors)
  }

  return (
    <form
      aria-label={`Edit "${prompt.title}"`}
      className="prompt-form edit-form"
      onSubmit={handleSubmit}
      // Escape cancels the edit instead of closing the whole dialog.
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault()
          e.stopPropagation()
          onCancel()
        }
      }}
      noValidate
    >
      <PromptFields
        idPrefix="edit-prompt"
        values={values}
        onChange={setValues}
        errors={errors}
        titleRef={titleRef}
      />
      {/* The token estimate is redone only when the content changes. */}
      {prompt.metadata && contentChanged && (
        <label className="checkbox">
          <input type="checkbox" checked={isCode} onChange={(e) => setIsCode(e.target.checked)} />
          Content is mostly code
        </label>
      )}
      {errors.storage && (
        <p role="alert" className="form-error">
          {errors.storage}
        </p>
      )}
      <div className="edit-actions">
        <button type="submit" disabled={saving}>
          Save changes
        </button>
        <button type="button" className="secondary" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
      </div>
    </form>
  )
}
