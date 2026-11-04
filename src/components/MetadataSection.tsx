import { type FormEvent, useState } from 'react'
import type { AddResult } from '../hooks/usePrompts'
import { DEFAULT_MODEL, MetadataError, validateModelName } from '../metadata'
import type { Prompt } from '../types'
import { MetadataSummary } from './MetadataSummary'
import { ModelPicker } from './ModelPicker'

/** Shows a prompt's metadata in the details dialog, and adds it or changes the model. */
export function MetadataSection({
  prompt,
  onSave,
}: {
  prompt: Prompt
  onSave(id: string, model: string, isCode: boolean): Promise<AddResult>
}) {
  const { metadata } = prompt
  const [editing, setEditing] = useState(false)
  const [model, setModel] = useState(metadata?.model ?? DEFAULT_MODEL)
  const [isCode, setIsCode] = useState(false)
  const [error, setError] = useState<string>()
  const [saving, setSaving] = useState(false)

  const startEditing = () => {
    setModel(metadata?.model ?? DEFAULT_MODEL)
    setError(undefined)
    setEditing(true)
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (saving) return
    try {
      validateModelName(model)
    } catch (err) {
      if (!(err instanceof MetadataError)) throw err
      setError(err.message)
      return
    }
    setSaving(true)
    try {
      const result = await onSave(prompt.id, model, isCode)
      if (result.ok) {
        setEditing(false)
        setError(undefined)
      } else {
        setError(result.errors.model ?? result.errors.storage ?? 'Could not save the model')
      }
    } catch {
      setError('Could not save the model. Try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="metadata-section" aria-labelledby="metadata-heading">
      <div className="section-heading">
        <h4 id="metadata-heading">Metadata</h4>
        {!editing && (
          <button type="button" className="secondary" onClick={startEditing}>
            {metadata ? 'Change model' : 'Add model'}
          </button>
        )}
      </div>

      {!editing &&
        (metadata ? (
          <MetadataSummary metadata={metadata} />
        ) : (
          <p className="metadata-empty">No model tracked for this prompt yet.</p>
        ))}

      {editing && (
        <form className="metadata-form" aria-label="Prompt metadata" onSubmit={handleSubmit} noValidate>
          <label htmlFor="metadata-model">Model</label>
          <ModelPicker id="metadata-model" value={model} onChange={setModel} error={error} />
          {/* The estimate is only computed when metadata is first added; the content can't change. */}
          {!metadata && (
            <label className="checkbox">
              <input type="checkbox" checked={isCode} onChange={(e) => setIsCode(e.target.checked)} />
              Content is mostly code
            </label>
          )}
          <div className="metadata-form-actions">
            <button type="submit" disabled={saving}>
              Save
            </button>
            <button type="button" className="secondary" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </section>
  )
}
