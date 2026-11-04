import type { PromptDb } from '../api/routes'
import { isNote } from '../note'
import { parsePrompts } from '../prompt'
import type { Note, Prompt } from '../types'

/** Where the static (GitHub Pages) build keeps its data. Distinct from the legacy key it migrates from. */
export const LOCAL_DB_KEY = 'prompt-library:db'

interface Store {
  prompts: Prompt[]
  notes: Note[]
}

function load(storage: Storage): Store {
  try {
    const raw = storage.getItem(LOCAL_DB_KEY)
    if (raw === null) return { prompts: [], notes: [] }
    const parsed = JSON.parse(raw) as Partial<Store> | null
    return {
      prompts: Array.isArray(parsed?.prompts) ? parsePrompts(parsed.prompts) : [],
      notes: Array.isArray(parsed?.notes) ? parsed.notes.filter(isNote) : [],
    }
  } catch {
    return { prompts: [], notes: [] }
  }
}

/**
 * A PromptDb kept in localStorage, mirroring the SQLite one: prompts newest first, notes most
 * recently updated first, and deleting a prompt deletes its notes. Re-reads storage on every call
 * so other tabs' changes show up.
 */
export function openLocalDb(storage: Storage = localStorage): PromptDb {
  const read = () => load(storage)
  // Throws on quota errors; the API layer turns that into a 500, which the UI shows as a save error.
  const write = (store: Store) => storage.setItem(LOCAL_DB_KEY, JSON.stringify(store))

  const mutatePrompt = (id: string, change: (p: Prompt) => Prompt): Prompt | null => {
    const store = read()
    const index = store.prompts.findIndex((p) => p.id === id)
    if (index === -1) return null
    store.prompts[index] = change(store.prompts[index])
    write(store)
    return store.prompts[index]
  }

  return {
    list() {
      return read().prompts.sort((a, b) => b.createdAt - a.createdAt)
    },
    insert(prompt) {
      const store = read()
      if (store.prompts.some((p) => p.id === prompt.id)) throw new Error(`Duplicate prompt id ${prompt.id}`)
      store.prompts.push(prompt)
      write(store)
    },
    remove(id) {
      const store = read()
      write({
        prompts: store.prompts.filter((p) => p.id !== id),
        notes: store.notes.filter((n) => n.promptId !== id),
      })
    },
    setFavorite(id, isFavorite) {
      return mutatePrompt(id, (p) => ({ ...p, isFavorite }))
    },
    get(id) {
      return read().prompts.find((p) => p.id === id) ?? null
    },
    update(prompt) {
      return mutatePrompt(prompt.id, (p) => {
        const next: Prompt = { ...p, title: prompt.title, content: prompt.content, category: prompt.category }
        if (prompt.metadata) next.metadata = prompt.metadata
        else delete next.metadata
        return next
      })
    },
    setMetadata(id, metadata) {
      return mutatePrompt(id, (p) => ({ ...p, metadata }))
    },
    importMany(prompts) {
      const store = read()
      const known = new Set(store.prompts.map((p) => p.id))
      let inserted = 0
      for (const p of parsePrompts(prompts)) {
        if (known.has(p.id)) continue
        known.add(p.id)
        store.prompts.push(p)
        inserted++
      }
      if (inserted > 0) write(store)
      return inserted
    },
    listNotes(promptId) {
      return read()
        .notes.filter((n) => n.promptId === promptId)
        .sort((a, b) => b.updatedAt - a.updatedAt || b.createdAt - a.createdAt)
    },
    insertNote(note) {
      const store = read()
      if (!store.prompts.some((p) => p.id === note.promptId)) return false
      store.notes.push(note)
      write(store)
      return true
    },
    updateNote(id, content, updatedAt) {
      const store = read()
      const index = store.notes.findIndex((n) => n.id === id)
      if (index === -1) return null
      store.notes[index] = { ...store.notes[index], content, updatedAt }
      write(store)
      return store.notes[index]
    },
    removeNote(id) {
      const store = read()
      write({ ...store, notes: store.notes.filter((n) => n.id !== id) })
    },
    close() {},
  }
}
