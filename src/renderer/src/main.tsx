import React from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/fraunces/index.css'
import '@fontsource-variable/newsreader/index.css'
import '@fontsource-variable/literata/index.css'
import '@fontsource-variable/newsreader/wght-italic.css'
import '@fontsource/ibm-plex-sans/400.css'
import '@fontsource/ibm-plex-sans/500.css'
import '@fontsource/ibm-plex-sans/600.css'
import '@fontsource/ibm-plex-mono/400.css'
import '@fontsource/ibm-plex-mono/500.css'
import './styles/global.css'
import App from './App'
import { useStore } from './store'
import { bootstrap } from './store/bootstrap'

bootstrap()

if (import.meta.env.DEV) {
  // makes the store drivable from devtools / CDP during development
  ;(window as unknown as Record<string, unknown>).__store = useStore
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
