/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { promptApiPlugin } from './server/vitePlugin.ts'

// https://vite.dev/config/
export default defineConfig({
  // GitHub Pages serves the site from /<repo>/; the deploy workflow sets BASE_PATH.
  base: process.env.BASE_PATH ?? '/',
  plugins: [react(), promptApiPlugin()],
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
  },
})
