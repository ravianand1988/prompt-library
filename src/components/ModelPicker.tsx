import { useState } from 'react'
import { KNOWN_MODELS, MAX_MODEL_NAME_LENGTH, MODEL_GROUPS } from '../metadata'

const CUSTOM = '__custom__'

/**
 * Model select with Claude and OpenAI suggestions, plus "Custom model…" which reveals a
 * text field for any other name. The caller renders the <label htmlFor={id}>.
 */
export function ModelPicker({
  id,
  value,
  onChange,
  error,
}: {
  id: string
  value: string
  onChange(model: string): void
  error?: string
}) {
  const [custom, setCustom] = useState(() => !KNOWN_MODELS.includes(value))
  const errorId = `${id}-error`
  const describedBy = error ? errorId : undefined

  return (
    <div className="model-picker">
      <select
        id={id}
        value={custom ? CUSTOM : value}
        onChange={(e) => {
          const next = e.target.value
          setCustom(next === CUSTOM)
          onChange(next === CUSTOM ? '' : next)
        }}
        aria-invalid={error && !custom ? true : undefined}
        aria-describedby={custom ? undefined : describedBy}
      >
        {MODEL_GROUPS.map((group) => (
          <optgroup key={group.label} label={group.label}>
            {group.models.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </optgroup>
        ))}
        <option value={CUSTOM}>Custom model…</option>
      </select>
      {custom && (
        <input
          aria-label="Custom model name"
          placeholder="e.g. Llama 4 Maverick"
          maxLength={MAX_MODEL_NAME_LENGTH}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
        />
      )}
      {error && (
        <p id={errorId} className="field-error">
          {error}
        </p>
      )}
    </div>
  )
}
