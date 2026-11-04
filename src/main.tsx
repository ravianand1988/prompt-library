import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/literata/opsz.css'
import '@fontsource-variable/literata/opsz-italic.css'
import '@fontsource-variable/public-sans/wght.css'
import './index.css'
import App from './App.tsx'
import { installLocalApi } from './api/localApi.ts'

// Static hosting (GitHub Pages) has no API server: keep data in this browser instead.
if (import.meta.env.VITE_LOCAL_STORAGE === 'true') installLocalApi()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
