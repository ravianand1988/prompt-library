import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import App from './App'
import { STORAGE_KEY } from './storage/legacyStorage'
import { installFakeApi } from './test/fakeApi'

const old = { id: '1', title: 'Old', content: 'x', createdAt: 1 }

it('creates a prompt that survives a remount', async () => {
  installFakeApi()
  const user = userEvent.setup()
  const { unmount } = render(<App />)
  await screen.findByText('No prompts yet. Create one above.')
  await user.type(screen.getByLabelText('Title'), 'Summarize')
  await user.type(screen.getByLabelText('Content'), 'Summarize this text')
  await user.click(screen.getByRole('button', { name: 'Save prompt' }))
  expect(
    await within(screen.getByRole('list', { name: 'Saved prompts' })).findByText('Summarize'),
  ).toBeInTheDocument()
  unmount()
  render(<App />)
  expect(await screen.findByRole('heading', { name: 'Summarize', level: 3 })).toBeInTheDocument()
})

it('deletes a prompt and it stays deleted after a remount', async () => {
  installFakeApi([old])
  const user = userEvent.setup()
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  const { unmount } = render(<App />)
  await user.click(await screen.findByRole('button', { name: 'Delete "Old"' }))
  expect(await screen.findByText('No prompts yet. Create one above.')).toBeInTheDocument()
  unmount()
  render(<App />)
  expect(await screen.findByText('No prompts yet. Create one above.')).toBeInTheDocument()
})

it('shows an alert and keeps the prompt when a delete fails', async () => {
  const api = installFakeApi([old])
  const user = userEvent.setup()
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  render(<App />)
  const button = await screen.findByRole('button', { name: 'Delete "Old"' })
  api.failRequests(true)
  await user.click(button)
  expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't reach the prompt server")
  expect(screen.getByRole('heading', { name: 'Old', level: 3 })).toBeInTheDocument()
})

it('shows the load error, not the empty-list text, when the server is unreachable', async () => {
  installFakeApi().failRequests(true)
  render(<App />)
  expect(screen.getByText('Loading prompts…')).toBeInTheDocument()
  expect(await screen.findByRole('alert')).toHaveTextContent(
    "Couldn't load prompts. Check that the app is running, then refresh.",
  )
  expect(screen.queryByText('No prompts yet. Create one above.')).not.toBeInTheDocument()
})

it('keeps the typed text and shows the save error when saving fails', async () => {
  const api = installFakeApi()
  const user = userEvent.setup()
  render(<App />)
  await screen.findByText('No prompts yet. Create one above.')
  api.failRequests(true)
  await user.type(screen.getByLabelText('Title'), 'T')
  await user.type(screen.getByLabelText('Content'), 'C')
  await user.click(screen.getByRole('button', { name: 'Save prompt' }))
  expect(await screen.findByRole('alert')).toHaveTextContent(
    "Couldn't reach the prompt server. Check that the app is running and try again.",
  )
  expect(screen.getByLabelText('Title')).toHaveValue('T')
  expect(screen.getByLabelText('Content')).toHaveValue('C')
})

it('migrates corrupt localStorage without crashing', async () => {
  const api = installFakeApi()
  localStorage.setItem(STORAGE_KEY, '{broken')
  render(<App />)
  expect(await screen.findByText('No prompts yet. Create one above.')).toBeInTheDocument()
  expect(api.calls).not.toContain('POST /api/prompts/import')
})
