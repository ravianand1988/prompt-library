import type { Ref } from 'react'
import { CATEGORIES, type Category } from '../types'

export interface PromptFieldValues {
  title: string
  content: string
  category: Category
}

/**
 * Title, category and content inputs shared by the new-prompt and edit forms.
 * `idPrefix` keeps ids and radio names unique when both forms are on the page.
 */
export function PromptFields({
  idPrefix,
  values,
  onChange,
  errors,
  titleRef,
}: {
  idPrefix: string
  values: PromptFieldValues
  onChange(values: PromptFieldValues): void
  errors: { title?: string; content?: string; category?: string }
  titleRef?: Ref<HTMLInputElement>
}) {
  const titleId = `${idPrefix}-title`
  const contentId = `${idPrefix}-content`
  const set = (patch: Partial<PromptFieldValues>) => onChange({ ...values, ...patch })

  return (
    <>
      <div className="field">
        <label htmlFor={titleId}>Title</label>
        <input
          id={titleId}
          ref={titleRef}
          className="title-input"
          value={values.title}
          onChange={(e) => set({ title: e.target.value })}
          aria-invalid={errors.title ? true : undefined}
          aria-describedby={errors.title ? `${titleId}-error` : undefined}
        />
        {errors.title && (
          <p id={`${titleId}-error`} className="field-error">
            {errors.title}
          </p>
        )}
      </div>
      <fieldset className="field category-picker">
        <legend>Category</legend>
        <div className="category-options">
          {CATEGORIES.map((c) => (
            <label key={c} className="category-option" data-category={c}>
              <input
                type="radio"
                name={`${idPrefix}-category`}
                value={c}
                checked={values.category === c}
                onChange={() => set({ category: c })}
              />
              <span>{c}</span>
            </label>
          ))}
        </div>
        {errors.category && <p className="field-error">{errors.category}</p>}
      </fieldset>
      <div className="field">
        <label htmlFor={contentId}>Content</label>
        <textarea
          id={contentId}
          rows={8}
          value={values.content}
          onChange={(e) => set({ content: e.target.value })}
          aria-invalid={errors.content ? true : undefined}
          aria-describedby={errors.content ? `${contentId}-error` : undefined}
        />
        {errors.content && (
          <p id={`${contentId}-error`} className="field-error">
            {errors.content}
          </p>
        )}
      </div>
    </>
  )
}
