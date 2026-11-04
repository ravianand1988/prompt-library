/** Heart toggle: outlined when off, filled when on. aria-pressed tells screen readers the state. */
export function FavoriteButton({
  title,
  isFavorite,
  onToggle,
}: {
  title: string
  isFavorite: boolean
  onToggle(next: boolean): void
}) {
  return (
    <button
      type="button"
      className="favorite"
      aria-pressed={isFavorite}
      aria-label={`Favorite "${title}"`}
      title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
      onClick={() => onToggle(!isFavorite)}
    >
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
        <path d="M12 20.5s-7.2-4.4-9.4-8.6C1 8.6 2.8 4.8 6.4 4.5c2.2-.2 4 1 5.6 3 1.6-2 3.4-3.2 5.6-3 3.6.3 5.4 4.1 3.8 7.4-2.2 4.2-9.4 8.6-9.4 8.6z" />
      </svg>
    </button>
  )
}
