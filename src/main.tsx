import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'
import './index.css'
import App from './App.tsx'
import { ThemeProvider } from './app/providers/ThemeProvider'
import { pluginRegistry } from './shared/services/pluginRegistry'
import { sampleGaugePlugin } from './plugins/sampleGaugePlugin'
import { useUiStore } from './store/uiStore'
import { applyDisplayPrefs } from './shared/theme/displayPrefs'

// Bootstrap plugins
pluginRegistry.registerPlugin(sampleGaugePlugin)

// Theme and Reading comfort go on <html> before the first paint. The store has already read
// localStorage synchronously (zustand persist), so this is the saved choice, not the default.
const ui = useUiStore.getState()
applyDisplayPrefs(ui.theme, ui.readingComfort)
useUiStore.subscribe((state, prev) => {
  if (state.theme !== prev.theme || state.readingComfort !== prev.readingComfort) {
    applyDisplayPrefs(state.theme, state.readingComfort)
  }
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider defaultTheme="dark" storageKey="datavista-theme">
      <App />
    </ThemeProvider>
  </StrictMode>,
)
