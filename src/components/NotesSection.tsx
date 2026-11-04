import { type FormEvent, useId, useRef, useState } from 'react'
import { type NoteActionResult, useNotes } from '../hooks/useNotes'
import { MAX_NOTE_LENGTH } from '../note'
import type { Note } from '../types'
import { DateLabel } from './DateLabel'

const LOAD_ERROR = "Couldn't load notes. Refresh to try again."

/** Add, edit and delete the notes for one prompt. */
export function NotesSection({ promptId }: { promptId: string }) {
  const { notes, status, addNote, updateNote, deleteNote } = useNotes(promptId)
  const id = useId()
  const headingId = `${id}-heading`
  const newNoteId = `${id}-new`

  const [draft, setDraft] = useState('')
  const [addError, setAddError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState('')
  const [editError, setEditError] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // A ref, not just state, so a double click can't send the same write twice.
  const busyRef = useRef(false)

  const run = async (action: () => Promise<NoteActionResult>): Promise<NoteActionResult | null> => {
    if (busyRef.current) return null
    busyRef.current = true
    setBusy(true)
    try {
      return await action()
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  const handleAdd = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const result = await run(() => addNote(draft))
    if (!result) return
    if (result.ok) {
      setDraft('')
      setAddError(null)
    } else {
      setAddError(result.error)
    }
  }

  // Only one note is editable at a time; starting another edit drops the unsaved one.
  const startEdit = (note: Note) => {
    setEditingId(note.id)
    setEditDraft(note.content)
    setEditError(null)
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditError(null)
  }

  const handleSave = async (event: FormEvent<HTMLFormElement>, noteId: string) => {
    event.preventDefault()
    const result = await run(() => updateNote(noteId, editDraft))
    if (!result) return
    if (result.ok) cancelEdit()
    else setEditError(result.error)
  }

  const handleDelete = async (note: Note) => {
    if (!window.confirm("Delete this note? This can't be undone.")) return
    const result = await run(() => deleteNote(note.id))
    if (!result) return
    setDeleteError(result.ok ? null : result.error)
    if (result.ok && editingId === note.id) cancelEdit()
  }

  return (
    <section className="notes" aria-labelledby={headingId}>
      <h4 id={headingId}>Notes ({notes.length})</h4>

      {status === 'loading' && <p>Loading notes…</p>}
      {status === 'error' && (
        <p role="alert" className="form-error">
          {LOAD_ERROR}
        </p>
      )}
      {deleteError && (
        <p role="alert" className="form-error">
          {deleteError}
        </p>
      )}

      {notes.length > 0 && (
        <ul className="note-list" aria-label="Notes">
          {notes.map((note) => (
            <li key={note.id} className="note-item">
              {editingId === note.id ? (
                <form className="note-form" onSubmit={(e) => handleSave(e, note.id)} noValidate>
                  <textarea
                    aria-label="Edit note text"
                    rows={3}
                    maxLength={MAX_NOTE_LENGTH}
                    value={editDraft}
                    onChange={(e) => setEditDraft(e.target.value)}
                    onKeyDown={(e) => e.key === 'Escape' && cancelEdit()}
                    aria-invalid={editError ? true : undefined}
                    aria-describedby={editError ? `${id}-edit-error` : undefined}
                    autoFocus
                  />
                  {editError && (
                    <p id={`${id}-edit-error`} className="field-error">
                      {editError}
                    </p>
                  )}
                  <div className="note-actions">
                    <button type="submit" disabled={busy}>
                      Save
                    </button>
                    <button type="button" className="secondary" onClick={cancelEdit}>
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <>
                  <p className="note-content">{note.content}</p>
                  <div className="note-meta">
                    <DateLabel
                      prefix={note.updatedAt > note.createdAt ? 'Edited' : 'Added'}
                      ms={note.updatedAt}
                    />
                    <div className="note-actions">
                      <button
                        type="button"
                        className="secondary"
                        aria-label="Edit note"
                        onClick={() => startEdit(note)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="delete"
                        aria-label="Delete note"
                        disabled={busy}
                        onClick={() => handleDelete(note)}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      {status === 'ready' && (
        <form className="note-form" onSubmit={handleAdd} noValidate>
          <label htmlFor={newNoteId}>New note</label>
          <textarea
            id={newNoteId}
            rows={2}
            maxLength={MAX_NOTE_LENGTH}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            aria-invalid={addError ? true : undefined}
            aria-describedby={addError ? `${id}-add-error` : undefined}
          />
          {addError && (
            <p id={`${id}-add-error`} className="field-error">
              {addError}
            </p>
          )}
          <button type="submit" disabled={busy}>
            Add note
          </button>
        </form>
      )}
    </section>
  )
}
