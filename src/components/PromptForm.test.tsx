import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import type { AddResult } from '../hooks/usePrompts'
import { PromptForm } from './PromptForm'

it('calls onSave with the typed values and clears on success', async () => {
  const user = userEvent.setup()
  const onSave = vi.fn(async (): Promise<AddResult> => ({ ok: true }))
  render(<PromptForm onSave={onSave} />)
  await user.type(screen.getByLabelText('Title'), 'Greeting')
  await user.type(screen.getByLabelText('Content'), 'Say hi{Enter}politely')
  await user.click(screen.getByRole('button', { name: 'Save prompt' }))
  expect(onSave).toHaveBeenCalledWith({ title: 'Greeting', content: 'Say hi\npolitely' })
  expect(screen.getByLabelText('Title')).toHaveValue('')
  expect(screen.getByLabelText('Content')).toHaveValue('')
  expect(screen.getByLabelText('Title')).toHaveFocus()
})

it('shows field errors and keeps input on validation failure', async () => {
  const user = userEvent.setup()
  const onSave = vi.fn(
    async (): Promise<AddResult> => ({ ok: false, errors: { title: 'Title is required' } }),
  )
  render(<PromptForm onSave={onSave} />)
  await user.type(screen.getByLabelText('Content'), 'kept')
  await user.click(screen.getByRole('button', { name: 'Save prompt' }))
  expect(screen.getByText('Title is required')).toBeInTheDocument()
  expect(screen.getByLabelText('Title')).toHaveAttribute('aria-invalid', 'true')
  expect(screen.getByLabelText('Title')).toHaveAccessibleDescription('Title is required')
  expect(screen.getByLabelText('Content')).toHaveValue('kept')
})

it('shows a storage error as an alert and keeps input', async () => {
  const user = userEvent.setup()
  const onSave = vi.fn(
    async (): Promise<AddResult> => ({
      ok: false,
      errors: { storage: "Couldn't reach the prompt server." },
    }),
  )
  render(<PromptForm onSave={onSave} />)
  await user.type(screen.getByLabelText('Title'), 'T')
  await user.type(screen.getByLabelText('Content'), 'C')
  await user.click(screen.getByRole('button', { name: 'Save prompt' }))
  expect(screen.getByRole('alert')).toHaveTextContent("Couldn't reach")
  expect(screen.getByLabelText('Title')).toHaveValue('T')
})

it('ignores a second submit while the first is pending', async () => {
  const user = userEvent.setup()
  let resolve!: (r: AddResult) => void
  const onSave = vi.fn(() => new Promise<AddResult>((r) => (resolve = r)))
  render(<PromptForm onSave={onSave} />)
  await user.type(screen.getByLabelText('Title'), 'T')
  await user.type(screen.getByLabelText('Content'), 'C')
  const button = screen.getByRole('button', { name: 'Save prompt' })
  await user.click(button)
  await user.click(button)
  expect(onSave).toHaveBeenCalledTimes(1)
  expect(button).toBeDisabled()
  await act(async () => resolve({ ok: true }))
  expect(button).toBeEnabled()
})
