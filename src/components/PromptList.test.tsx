import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, it, vi } from 'vitest'
import { installFakeApi } from '../test/fakeApi'
import type { Prompt } from '../types'
import { PromptList } from './PromptList'

const prompts: Prompt[] = [
  { id: '1', title: 'First', content: 'line1\nline2', createdAt: 2, isFavorite: true },
  { id: '2', title: 'Second', content: '<b>bold?</b>', createdAt: 1, isFavorite: false },
]

// Each card's NotesSection loads its notes on mount.
beforeEach(() => {
  installFakeApi(prompts)
})

it('shows the empty state', () => {
  render(<PromptList prompts={[]} onDelete={vi.fn()} onToggleFavorite={vi.fn()} />)
  expect(screen.getByText('No prompts yet. Create one above.')).toBeInTheDocument()
  expect(screen.queryByRole('list')).not.toBeInTheDocument()
})

it('renders prompts in the given order', () => {
  render(<PromptList prompts={prompts} onDelete={vi.fn()} onToggleFavorite={vi.fn()} />)
  expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual([
    'First',
    'Second',
  ])
})

it('gives each prompt its own notes section', async () => {
  render(<PromptList prompts={prompts} onDelete={vi.fn()} onToggleFavorite={vi.fn()} />)
  expect(await screen.findAllByRole('region', { name: 'Notes (0)' })).toHaveLength(2)
})

it('renders content as literal text, preserving newlines', () => {
  const { container } = render(<PromptList prompts={prompts} onDelete={vi.fn()} onToggleFavorite={vi.fn()} />)
  expect(screen.getByText('<b>bold?</b>')).toBeInTheDocument()
  expect(container.querySelector('b')).toBeNull()
  expect(screen.getByText(/line1/).textContent).toBe('line1\nline2')
})

it('deletes after confirmation', async () => {
  const user = userEvent.setup()
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  const onDelete = vi.fn()
  render(<PromptList prompts={prompts} onDelete={onDelete} onToggleFavorite={vi.fn()} />)
  await user.click(screen.getByRole('button', { name: 'Delete "First"' }))
  expect(window.confirm).toHaveBeenCalledWith(`Delete "First"? This can't be undone.`)
  expect(onDelete).toHaveBeenCalledWith('1')
})

it('does not delete when confirmation is cancelled', async () => {
  const user = userEvent.setup()
  vi.spyOn(window, 'confirm').mockReturnValue(false)
  const onDelete = vi.fn()
  render(<PromptList prompts={prompts} onDelete={onDelete} onToggleFavorite={vi.fn()} />)
  await user.click(screen.getByRole('button', { name: 'Delete "First"' }))
  expect(onDelete).not.toHaveBeenCalled()
})

it('shows each prompt\'s favorite state on its heart button', () => {
  render(<PromptList prompts={prompts} onDelete={vi.fn()} onToggleFavorite={vi.fn()} />)
  expect(screen.getByRole('button', { name: 'Favorite "First"' })).toHaveAttribute('aria-pressed', 'true')
  expect(screen.getByRole('button', { name: 'Favorite "Second"' })).toHaveAttribute('aria-pressed', 'false')
})

it('clicking the heart asks for the opposite state', async () => {
  const user = userEvent.setup()
  const onToggleFavorite = vi.fn()
  render(<PromptList prompts={prompts} onDelete={vi.fn()} onToggleFavorite={onToggleFavorite} />)
  await user.click(screen.getByRole('button', { name: 'Favorite "First"' }))
  await user.click(screen.getByRole('button', { name: 'Favorite "Second"' }))
  expect(onToggleFavorite.mock.calls).toEqual([
    ['1', false],
    ['2', true],
  ])
})

it('shows a custom empty message', () => {
  render(<PromptList prompts={[]} onDelete={vi.fn()} onToggleFavorite={vi.fn()} emptyMessage="Nothing here" />)
  expect(screen.getByText('Nothing here')).toBeInTheDocument()
})
