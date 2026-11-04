import { useState } from 'react'
import './App.css'
import { PromptDetails } from './components/PromptDetails'
import { PromptForm } from './components/PromptForm'
import { PromptList } from './components/PromptList'
import { type AddResult, usePrompts } from './hooks/usePrompts'
import { useTheme } from './hooks/useTheme'
import { sortByCreatedAtDesc } from './metadata'
import { CATEGORIES, type Category, type Prompt } from './types'

const LOAD_ERROR = "Couldn't load prompts. Check that the app is running, then refresh."

type CategoryFilter = Category | 'All'

/** Case-insensitive match on title, content, category name or model. */
function matchesSearch(prompt: Prompt, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (q === '') return true
  return [prompt.title, prompt.content, prompt.category, prompt.metadata?.model ?? ''].some((text) =>
    text.toLowerCase().includes(q),
  )
}

function App() {
  const { prompts, status, addPrompt, editPrompt, deletePrompt, toggleFavorite, saveMetadata } = usePrompts()
  const { theme, toggleTheme } = useTheme()
  const [actionError, setActionError] = useState<string | null>(null)
  const [category, setCategory] = useState<CategoryFilter>('All')
  const [favoritesOnly, setFavoritesOnly] = useState(false)
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const showResult = (result: AddResult) =>
    setActionError(result.ok ? null : (result.errors.storage ?? null))

  const handleDelete = async (id: string) => {
    const result = await deletePrompt(id)
    showResult(result)
    if (result.ok) setSelectedId(null)
  }
  const handleToggleFavorite = async (id: string, isFavorite: boolean) =>
    showResult(await toggleFavorite(id, isFavorite))

  const countFor = (c: CategoryFilter) =>
    c === 'All' ? prompts.length : prompts.filter((p) => p.category === c).length

  const visible = sortByCreatedAtDesc(
    prompts.filter(
      (p) =>
        (category === 'All' || p.category === category) &&
        (!favoritesOnly || p.isFavorite) &&
        matchesSearch(p, query),
    ),
    (p) => p.metadata,
    (p) => p.createdAt,
  )
  const isFiltered = category !== 'All' || favoritesOnly || query.trim() !== ''
  const selected = prompts.find((p) => p.id === selectedId) ?? null

  const clearFilters = () => {
    setCategory('All')
    setFavoritesOnly(false)
    setQuery('')
  }

  return (
    <main className="app">
      <header className="masthead">
        <div>
          <h1>Prompt Library</h1>
          <p>Your saved prompts, with notes on how each one works.</p>
        </div>
        <button type="button" className="theme-toggle" onClick={toggleTheme}>
          {theme === 'dark' ? 'Use light theme' : 'Use dark theme'}
        </button>
      </header>

      <div className="workspace">
        <aside className="compose">
          <PromptForm onSave={addPrompt} />
        </aside>

        <section className="library" aria-labelledby="library-heading">
          <div className="list-header">
            <h2 id="library-heading">Saved prompts</h2>
            <p className="result-count" aria-live="polite">
              {status === 'ready' &&
                (isFiltered
                  ? `${visible.length} of ${prompts.length} shown`
                  : `${prompts.length} ${prompts.length === 1 ? 'prompt' : 'prompts'}`)}
            </p>
          </div>

          <div className="toolbar">
            <div className="search">
              <label htmlFor="prompt-search" className="visually-hidden">
                Search prompts
              </label>
              <input
                id="prompt-search"
                type="search"
                placeholder="Search title, content, category or model…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <div className="filters">
              <div role="group" aria-label="Filter by category" className="chips">
                {(['All', ...CATEGORIES] as const).map((c) => (
                  <button
                    key={c}
                    type="button"
                    className="chip"
                    data-category={c}
                    aria-pressed={category === c}
                    onClick={() => setCategory(c)}
                  >
                    {c} <span className="chip-count">{countFor(c)}</span>
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="chip favorites-chip"
                aria-pressed={favoritesOnly}
                onClick={() => setFavoritesOnly((v) => !v)}
              >
                ♥ Favorites
              </button>
            </div>
          </div>

          {actionError && (
            <p role="alert" className="form-error">
              {actionError}
            </p>
          )}
          {status === 'loading' && <p className="status">Loading prompts…</p>}
          {status === 'error' && (
            <p role="alert" className="form-error">
              {LOAD_ERROR}
            </p>
          )}
          {status === 'ready' &&
            (isFiltered && visible.length === 0 && prompts.length > 0 ? (
              <div className="empty">
                <p>No prompts match these filters.</p>
                <button type="button" className="secondary" onClick={clearFilters}>
                  Clear filters
                </button>
              </div>
            ) : (
              <PromptList
                prompts={visible}
                onSelect={setSelectedId}
                onToggleFavorite={handleToggleFavorite}
              />
            ))}
        </section>
      </div>

      {selected && (
        <PromptDetails
          key={selected.id}
          prompt={selected}
          onClose={() => setSelectedId(null)}
          onDelete={handleDelete}
          onEdit={editPrompt}
          onToggleFavorite={handleToggleFavorite}
          onSaveMetadata={saveMetadata}
        />
      )}
    </main>
  )
}

export default App
