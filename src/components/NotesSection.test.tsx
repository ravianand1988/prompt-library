import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { installFakeApi } from '../test/fakeApi'
import type { Note, Prompt } from '../types'
import { NotesSection } from './NotesSection'

const prompt: Prompt = { id: 'p1', title: 'P', content: 'c', createdAt: 1, isFavorite: false }
const note: Note = { id: 'n1', promptId: 'p1', content: 'First note', createdAt: 1, updatedAt: 1 }

async function setup(notes: Note[] = []) {
  const api = installFakeApi([prompt], notes)
  const user = userEvent.setup()
  render(<NotesSection promptId="p1" />)
  await screen.findByLabelText('New note')
  return { api, user }
}

it('shows the note count and the notes as literal text', async () => {
  await setup([note, { ...note, id: 'n2', content: '<b>x</b>\nline2', updatedAt: 2 }])
  expect(screen.getByRole('region', { name: 'Notes (2)' })).toBeInTheDocument()
  expect(screen.getByText(/<b>x<\/b>/).textContent).toBe('<b>x</b>\nline2')
})

it('adds a note and clears the input', async () => {
  const { api, user } = await setup()
  await user.type(screen.getByLabelText('New note'), 'Use a formal tone')
  await user.click(screen.getByRole('button', { name: 'Add note' }))
  expect(await screen.findByText('Use a formal tone')).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Notes (1)' })).toBeInTheDocument()
  expect(screen.getByLabelText('New note')).toHaveValue('')
  expect(api.notes.map((n) => n.content)).toEqual(['Use a formal tone'])
})

it('shows an error for an empty note', async () => {
  await setup()
  await userEvent.click(screen.getByRole('button', { name: 'Add note' }))
  expect(await screen.findByText('Note cannot be empty')).toBeInTheDocument()
  expect(screen.getByLabelText('New note')).toHaveAttribute('aria-invalid', 'true')
})

it('edits and saves a note', async () => {
  const { api, user } = await setup([note])
  await user.click(screen.getByRole('button', { name: 'Edit note' }))
  const box = screen.getByLabelText('Edit note text')
  expect(box).toHaveFocus()
  await user.clear(box)
  await user.type(box, 'Rewritten')
  await user.click(screen.getByRole('button', { name: 'Save' }))
  expect(await screen.findByText('Rewritten')).toBeInTheDocument()
  expect(screen.queryByLabelText('Edit note text')).not.toBeInTheDocument()
  expect(api.notes[0].content).toBe('Rewritten')
})

it('cancel discards the edit', async () => {
  const { api, user } = await setup([note])
  await user.click(screen.getByRole('button', { name: 'Edit note' }))
  await user.type(screen.getByLabelText('Edit note text'), ' changed')
  await user.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(screen.getByText('First note')).toBeInTheDocument()
  expect(api.notes[0].content).toBe('First note')
})

it('keeps edit mode open with an error when saving an empty note', async () => {
  const { user } = await setup([note])
  await user.click(screen.getByRole('button', { name: 'Edit note' }))
  await user.clear(screen.getByLabelText('Edit note text'))
  await user.click(screen.getByRole('button', { name: 'Save' }))
  expect(await screen.findByText('Note cannot be empty')).toBeInTheDocument()
  expect(screen.getByLabelText('Edit note text')).toBeInTheDocument()
})

it('only one note is in edit mode at a time', async () => {
  const { user } = await setup([note, { ...note, id: 'n2', content: 'Second', updatedAt: 2 }])
  const [first, second] = screen.getAllByRole('button', { name: 'Edit note' })
  await user.click(first)
  await user.click(second)
  expect(screen.getAllByLabelText('Edit note text')).toHaveLength(1)
})

it('deletes a note after confirmation, and not when cancelled', async () => {
  const { api, user } = await setup([note])
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
  await user.click(screen.getByRole('button', { name: 'Delete note' }))
  expect(api.notes).toHaveLength(1)
  confirm.mockReturnValue(true)
  await user.click(screen.getByRole('button', { name: 'Delete note' }))
  expect(await screen.findByRole('heading', { name: 'Notes (0)' })).toBeInTheDocument()
  expect(api.notes).toEqual([])
})

it('shows an alert and keeps the note when the server is down', async () => {
  const { api, user } = await setup([note])
  api.failRequests(true)
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  await user.click(screen.getByRole('button', { name: 'Delete note' }))
  expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't reach the server")
  expect(within(screen.getByRole('list', { name: 'Notes' })).getByText('First note')).toBeInTheDocument()
})

it('shows a load error when notes cannot be fetched', async () => {
  const api = installFakeApi([prompt])
  api.failRequests(true)
  render(<NotesSection promptId="p1" />)
  expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't load notes")
  expect(screen.queryByLabelText('New note')).not.toBeInTheDocument()
})
