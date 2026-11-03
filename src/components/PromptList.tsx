import type { Prompt } from '../types'

export function PromptList({
  prompts,
  onDelete,
}: {
  prompts: Prompt[]
  onDelete(id: string): void
}) {
  if (prompts.length === 0) {
    return <p className="empty">No prompts yet. Create one above.</p>
  }

  const handleDelete = (prompt: Prompt) => {
    if (window.confirm(`Delete "${prompt.title}"? This can't be undone.`)) onDelete(prompt.id)
  }

  return (
    <ul aria-label="Saved prompts" className="prompt-list">
      {prompts.map((prompt) => (
        <li key={prompt.id} className="prompt-item">
          <div className="prompt-header">
            <h3>{prompt.title}</h3>
            <button
              type="button"
              className="delete"
              aria-label={`Delete "${prompt.title}"`}
              onClick={() => handleDelete(prompt)}
            >
              Delete
            </button>
          </div>
          <p className="prompt-content">{prompt.content}</p>
          <time dateTime={new Date(prompt.createdAt).toISOString()}>
            {new Date(prompt.createdAt).toLocaleString()}
          </time>
        </li>
      ))}
    </ul>
  )
}
