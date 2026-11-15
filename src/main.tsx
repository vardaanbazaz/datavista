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

// index.html's boot script already put the saved theme and Appearance on <html> before the
// first paint; apply once more from the store (same functions, see shared/theme/boot.ts) before
// React renders. ThemeProvider keeps it in step afterwards.
const ui = useUiStore.getState()
useUiStore.setState({ resolvedTheme: applyDisplayPrefs(ui.themeSetting, ui.appearance) })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </StrictMode>,
)
