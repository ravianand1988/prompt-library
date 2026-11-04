import type { Prompt } from '../types'
import { CategoryBadge } from './CategoryBadge'
import { DateLabel } from './DateLabel'
import { FavoriteButton } from './FavoriteButton'
import { CardMetadata, MetadataDates } from './MetadataSummary'

/** Summary cards. Selecting one opens its details. */
export function PromptList({
  prompts,
  onSelect,
  onToggleFavorite,
  emptyMessage = 'No prompts yet. Create one with the form.',
}: {
  prompts: Prompt[]
  onSelect(id: string): void
  onToggleFavorite(id: string, isFavorite: boolean): void
  emptyMessage?: string
}) {
  if (prompts.length === 0) {
    return <p className="empty">{emptyMessage}</p>
  }

  return (
    <ul aria-label="Saved prompts" className="prompt-grid">
      {prompts.map((prompt) => (
        <li key={prompt.id}>
          <article
            className="prompt-card"
            data-favorite={prompt.isFavorite}
            data-category={prompt.category}
          >
            <div className="card-top">
              <CategoryBadge category={prompt.category} />
              <FavoriteButton
                title={prompt.title}
                isFavorite={prompt.isFavorite}
                onToggle={(next) => onToggleFavorite(prompt.id, next)}
              />
            </div>
            <h3>
              {/* The title button stretches over the card (see CSS), so the whole card opens details. */}
              <button type="button" className="card-open" onClick={() => onSelect(prompt.id)}>
                {prompt.title}
              </button>
            </h3>
            <p className="card-summary">{prompt.content}</p>
            {prompt.metadata && <CardMetadata metadata={prompt.metadata} />}
            <div className="card-footer">
              {prompt.metadata ? (
                <MetadataDates metadata={prompt.metadata} />
              ) : (
                <DateLabel prefix="Added" ms={prompt.createdAt} />
              )}
              <span className="card-more" aria-hidden="true">
                View details →
              </span>
            </div>
          </article>
        </li>
      ))}
    </ul>
  )
}
