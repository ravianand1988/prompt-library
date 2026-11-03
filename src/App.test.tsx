import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import App from './App'
import { STORAGE_KEY, savePrompts } from './storage/promptStorage'

it('creates a prompt that survives a remount (persisted)', async () => {
  const user = userEvent.setup()
  const { unmount } = render(<App />)
  await user.type(screen.getByLabelText('Title'), 'Summarize')
  await user.type(screen.getByLabelText('Content'), 'Summarize this text')
  await user.click(screen.getByRole('button', { name: 'Save prompt' }))
  expect(
    within(screen.getByRole('list', { name: 'Saved prompts' })).getByText('Summarize'),
  ).toBeInTheDocument()
  unmount()
  render(<App />)
  expect(screen.getByRole('heading', { name: 'Summarize', level: 3 })).toBeInTheDocument()
})

it('deletes a prompt and it stays deleted after a remount', async () => {
  const user = userEvent.setup()
  savePrompts([{ id: '1', title: 'Old', content: 'x', createdAt: 1 }])
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  const { unmount } = render(<App />)
  await user.click(screen.getByRole('button', { name: 'Delete "Old"' }))
  expect(screen.getByText('No prompts yet. Create one above.')).toBeInTheDocument()
  unmount()
  render(<App />)
  expect(screen.getByText('No prompts yet. Create one above.')).toBeInTheDocument()
})

it('shows an alert and keeps the prompt when a delete cannot be saved', async () => {
  const user = userEvent.setup()
  savePrompts([{ id: '1', title: 'Old', content: 'x', createdAt: 1 }])
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  render(<App />)
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('quota')
  })
  await user.click(screen.getByRole('button', { name: 'Delete "Old"' }))
  expect(screen.getByRole('alert')).toHaveTextContent("Couldn't save")
  expect(screen.getByRole('heading', { name: 'Old', level: 3 })).toBeInTheDocument()
})

it('loads with corrupt storage without crashing', () => {
  localStorage.setItem(STORAGE_KEY, '{broken')
  render(<App />)
  expect(screen.getByRole('heading', { name: 'Prompt Library' })).toBeInTheDocument()
})
