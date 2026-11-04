import type { Category } from '../types'

export function CategoryBadge({ category }: { category: Category }) {
  return (
    <span className="category-badge" data-category={category}>
      {category}
    </span>
  )
}
