import { type FormEvent, useRef, useState } from 'react'
import type { AddResult } from '../hooks/usePrompts'
import { DEFAULT_MODEL } from '../metadata'
import { DEFAULT_CATEGORY } from '../prompt'
import { ModelPicker } from './ModelPicker'
import { type PromptFieldValues, PromptFields } from './PromptFields'
import type { NewPromptInput } from '../types'

type Errors = Extract<AddResult, { ok: false }>['errors']

export function PromptForm({ onSave }: { onSave(input: NewPromptInput): Promise<AddResult> }) {
  const [values, setValues] = useState<PromptFieldValues>({
    title: '',
    content: '',
    category: DEFAULT_CATEGORY,
  })
  // The model is kept between saves: consecutive prompts are usually for the same one.
  const [model, setModel] = useState(DEFAULT_MODEL)
  const [isCode, setIsCode] = useState(false)
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
      result = await onSave({ ...values, model, isCode })
    } finally {
      savingRef.current = false
      setSaving(false)
    }
    if (result.ok) {
      setValues((v) => ({ ...v, title: '', content: '' }))
      setIsCode(false)
      setErrors({})
      titleRef.current?.focus()
    } else {
      setErrors(result.errors)
    }
  }

  return (
    <form aria-label="New prompt" className="prompt-form" onSubmit={handleSubmit} noValidate>
      <h2 className="panel-title">New prompt</h2>
      <PromptFields
        idPrefix="prompt"
        values={values}
        onChange={setValues}
        errors={errors}
        titleRef={titleRef}
      />
      <div className="field">
        <label htmlFor="prompt-model">Model</label>
        <ModelPicker id="prompt-model" value={model} onChange={setModel} error={errors.model} />
        <label className="checkbox">
          <input type="checkbox" checked={isCode} onChange={(e) => setIsCode(e.target.checked)} />
          Content is mostly code
        </label>
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
