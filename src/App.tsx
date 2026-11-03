import { useState } from 'react'
import './App.css'
import { PromptForm } from './components/PromptForm'
import { PromptList } from './components/PromptList'
import { usePrompts } from './hooks/usePrompts'

function App() {
  const { prompts, addPrompt, deletePrompt } = usePrompts()
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const handleDelete = (id: string) => {
    const result = deletePrompt(id)
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
      <PromptList prompts={prompts} onDelete={handleDelete} />
    </main>
  )
}

export default App
