import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

// jsdom may lack showModal; without it the details dialog stays closed and hidden from queries.
if (typeof HTMLDialogElement !== 'undefined' && !HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.setAttribute('open', '')
  }
}

afterEach(() => {
  if (typeof window !== 'undefined') {
    cleanup()
    localStorage.clear()
  }
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
