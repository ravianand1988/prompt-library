import { useState } from 'react'
import './App.css'
import { PromptForm } from './components/PromptForm'
import { PromptList } from './components/PromptList'
import { usePrompts } from './hooks/usePrompts'

const LOAD_ERROR = "Couldn't load prompts. Check that the app is running, then refresh."

function App() {
  const { prompts, status, addPrompt, deletePrompt } = usePrompts()
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const handleDelete = async (id: string) => {
    const result = await deletePrompt(id)
    setDeleteError(result.ok ? null : (result.errors.storage ?? null))
  }

  return (
    <main className="app">
      <h1>Prompt Library</h1>
      <PromptForm onSave={addPrompt} />
      <h2>Saved prompts</h2>
      {deleteError && (
        <p role="alert" className="form-error">
          {deleteError}
        </p>
      )}
      {status === 'loading' && <p>Loading prompts…</p>}
      {status === 'error' && (
        <p role="alert" className="form-error">
          {LOAD_ERROR}
        </p>
      )}
      {status === 'ready' && <PromptList prompts={prompts} onDelete={handleDelete} />}
    </main>
  )
}

export default App
