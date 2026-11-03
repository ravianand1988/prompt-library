import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import type { Prompt } from '../types'
import { PromptList } from './PromptList'

const prompts: Prompt[] = [
  { id: '1', title: 'First', content: 'line1\nline2', createdAt: 2 },
  { id: '2', title: 'Second', content: '<b>bold?</b>', createdAt: 1 },
]

it('shows the empty state', () => {
  render(<PromptList prompts={[]} onDelete={vi.fn()} />)
  expect(screen.getByText('No prompts yet. Create one above.')).toBeInTheDocument()
  expect(screen.queryByRole('list')).not.toBeInTheDocument()
})

it('renders prompts in the given order', () => {
  render(<PromptList prompts={prompts} onDelete={vi.fn()} />)
  expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual([
    'First',
    'Second',
  ])
})

it('renders content as literal text, preserving newlines', () => {
  const { container } = render(<PromptList prompts={prompts} onDelete={vi.fn()} />)
  expect(screen.getByText('<b>bold?</b>')).toBeInTheDocument()
  expect(container.querySelector('b')).toBeNull()
  expect(screen.getByText(/line1/).textContent).toBe('line1\nline2')
})

it('deletes after confirmation', async () => {
  const user = userEvent.setup()
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  const onDelete = vi.fn()
  render(<PromptList prompts={prompts} onDelete={onDelete} />)
  await user.click(screen.getByRole('button', { name: 'Delete "First"' }))
  expect(window.confirm).toHaveBeenCalledWith(`Delete "First"? This can't be undone.`)
  expect(onDelete).toHaveBeenCalledWith('1')
})

it('does not delete when confirmation is cancelled', async () => {
  const user = userEvent.setup()
  vi.spyOn(window, 'confirm').mockReturnValue(false)
  const onDelete = vi.fn()
  render(<PromptList prompts={prompts} onDelete={onDelete} />)
  await user.click(screen.getByRole('button', { name: 'Delete "First"' }))
  expect(onDelete).not.toHaveBeenCalled()
})
