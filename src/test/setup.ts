import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

afterEach(() => {
  if (typeof window !== 'undefined') {
    cleanup()
    localStorage.clear()
  }
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
