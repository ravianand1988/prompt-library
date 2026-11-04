import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import App from './App'
import { STORAGE_KEY } from './storage/legacyStorage'
import { installFakeApi } from './test/fakeApi'

const old = { id: '1', title: 'Old', content: 'x', createdAt: 1, isFavorite: false }

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

it('adds a note to a prompt that survives a remount, and deleting the prompt removes it', async () => {
  const api = installFakeApi([old])
  const user = userEvent.setup()
  const { unmount } = render(<App />)
  await user.type(await screen.findByLabelText('New note'), 'Works well')
  await user.click(screen.getByRole('button', { name: 'Add note' }))
  expect(await screen.findByText('Works well')).toBeInTheDocument()
  unmount()
  render(<App />)
  expect(await screen.findByText('Works well')).toBeInTheDocument()
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  await user.click(screen.getByRole('button', { name: 'Delete "Old"' }))
  await screen.findByText('No prompts yet. Create one above.')
  expect(api.notes).toEqual([])
})

it('favorites a prompt, filters to favorites, and the favorite survives a remount', async () => {
  const api = installFakeApi([old, { ...old, id: '2', title: 'Other', createdAt: 2 }])
  const user = userEvent.setup()
  const { unmount } = render(<App />)
  await user.click(await screen.findByRole('button', { name: 'Favorite "Old"' }))
  expect(screen.getByRole('button', { name: 'Favorite "Old"' })).toHaveAttribute('aria-pressed', 'true')
  await waitFor(() => expect(api.prompts.find((p) => p.id === '1')?.isFavorite).toBe(true))

  await user.click(screen.getByRole('button', { name: 'Favorites (1)' }))
  const list = screen.getByRole('list', { name: 'Saved prompts' })
  expect(within(list).getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['Old'])

  unmount()
  render(<App />)
  expect(await screen.findByRole('button', { name: 'Favorite "Old"' })).toHaveAttribute('aria-pressed', 'true')
  expect(screen.getByRole('button', { name: 'All (2)' })).toHaveAttribute('aria-pressed', 'true')
})

it('shows an empty message in Favorites, and unfavoriting removes the prompt from the view', async () => {
  installFakeApi([{ ...old, isFavorite: true }, { ...old, id: '2', title: 'Other' }])
  const user = userEvent.setup()
  render(<App />)
  await user.click(await screen.findByRole('button', { name: 'Favorites (1)' }))
  await user.click(screen.getByRole('button', { name: 'Favorite "Old"' }))
  expect(
    screen.getByText('No favorites yet. Click the heart on a prompt to add it here.'),
  ).toBeInTheDocument()
})

it('rolls back the heart and shows an alert when favoriting fails', async () => {
  const api = installFakeApi([old])
  const user = userEvent.setup()
  render(<App />)
  const heart = await screen.findByRole('button', { name: 'Favorite "Old"' })
  api.failRequests(true)
  await user.click(heart)
  expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't reach the prompt server")
  expect(screen.getByRole('button', { name: 'Favorite "Old"' })).toHaveAttribute('aria-pressed', 'false')
})

it('edits a prompt from its details and the change survives a remount', async () => {
  installFakeApi([old])
  const user = userEvent.setup()
  const { unmount } = render(<App />)
  await user.click(await screen.findByRole('button', { name: 'Old' }))
  const dialog = screen.getByRole('dialog')
  await user.click(within(dialog).getByRole('button', { name: 'Edit "Old"' }))
  const title = within(dialog).getByLabelText('Title')
  await user.clear(title)
  await user.type(title, 'Renamed')
  await user.click(within(dialog).getByRole('radio', { name: 'Backend' }))
  await user.click(within(dialog).getByRole('button', { name: 'Save changes' }))
  expect(await within(dialog).findByRole('heading', { name: 'Renamed', level: 2 })).toBeInTheDocument()
  expect(within(dialog).getByRole('button', { name: 'Edit "Renamed"' })).toBeInTheDocument()
  unmount()
  render(<App />)
  expect(await screen.findByRole('heading', { name: 'Renamed', level: 3 })).toBeInTheDocument()
})

it('keeps the edit form open with an error when the edited title is empty', async () => {
  const api = installFakeApi([old])
  const user = userEvent.setup()
  render(<App />)
  await user.click(await screen.findByRole('button', { name: 'Old' }))
  const dialog = screen.getByRole('dialog')
  await user.click(within(dialog).getByRole('button', { name: 'Edit "Old"' }))
  await user.clear(within(dialog).getByLabelText('Title'))
  await user.click(within(dialog).getByRole('button', { name: 'Save changes' }))
  expect(await within(dialog).findByText('Title is required')).toBeInTheDocument()
  expect(api.calls).not.toContain('PUT /api/prompts/1')
})
