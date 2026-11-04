import { useEffect, useRef, useState } from 'react'
import type { AddResult } from '../hooks/usePrompts'
import type { Prompt, PromptEdit } from '../types'
import { CategoryBadge } from './CategoryBadge'
import { DateLabel } from './DateLabel'
import { FavoriteButton } from './FavoriteButton'
import { MetadataSection } from './MetadataSection'
import { NotesSection } from './NotesSection'
import { PromptEditForm } from './PromptEditForm'

/** Full view of one prompt in a modal dialog: content, notes, favorite, edit and delete. */
export function PromptDetails({
  prompt,
  onClose,
  onDelete,
  onEdit,
  onToggleFavorite,
  onSaveMetadata,
}: {
  prompt: Prompt
  onClose(): void
  onDelete(id: string): void
  onEdit(id: string, edit: PromptEdit): Promise<AddResult>
  onToggleFavorite(id: string, isFavorite: boolean): void
  onSaveMetadata(id: string, model: string, isCode: boolean): Promise<AddResult>
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const editButtonRef = useRef<HTMLButtonElement>(null)
  const [editing, setEditing] = useState(false)

  // showModal gives focus trapping, Escape to close and the backdrop for free. No close()
  // on cleanup: it would fire onClose during StrictMode's remount; unmounting removes it anyway.
  useEffect(() => {
    const dialog = dialogRef.current
    if (dialog && !dialog.open) dialog.showModal?.()
  }, [])

  const stopEditing = () => {
    setEditing(false)
    // Return focus to where editing started; the form that had it is gone.
    requestAnimationFrame(() => editButtonRef.current?.focus())
  }

  const handleDelete = () => {
    if (window.confirm(`Delete "${prompt.title}"? This can't be undone.`)) onDelete(prompt.id)
  }

  return (
    <dialog
      ref={dialogRef}
      className="prompt-details"
      aria-labelledby="prompt-details-title"
      data-favorite={prompt.isFavorite}
      onClose={onClose}
      // A click on the backdrop lands on the dialog element itself.
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="details-body">
        <header className="details-header">
          <div className="details-meta">
            <CategoryBadge category={prompt.category} />
            <DateLabel prefix="Added" ms={prompt.createdAt} />
          </div>
          <button type="button" className="close" aria-label="Close details" onClick={onClose}>
            ×
          </button>
        </header>
        <h2 id="prompt-details-title">{prompt.title}</h2>
        {editing ? (
          <PromptEditForm prompt={prompt} onSave={onEdit} onCancel={stopEditing} />
        ) : (
          <>
            <div className="details-actions">
              <FavoriteButton
                title={prompt.title}
                isFavorite={prompt.isFavorite}
                onToggle={(next) => onToggleFavorite(prompt.id, next)}
              />
              <button
                ref={editButtonRef}
                type="button"
                className="secondary edit"
                aria-label={`Edit "${prompt.title}"`}
                onClick={() => setEditing(true)}
              >
                Edit
              </button>
              <button
                type="button"
                className="delete"
                aria-label={`Delete "${prompt.title}"`}
                onClick={handleDelete}
              >
                Delete
              </button>
            </div>
            <p className="prompt-content">{prompt.content}</p>
          </>
        )}
        <MetadataSection prompt={prompt} onSave={onSaveMetadata} />
        <NotesSection promptId={prompt.id} />
      </div>
    </dialog>
  )
}
