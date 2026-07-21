import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'
import './index.css'
import App from './App.tsx'
import { ThemeProvider } from './app/providers/ThemeProvider'
import { pluginRegistry } from './shared/services/pluginRegistry'
import { sampleGaugePlugin } from './plugins/sampleGaugePlugin'

// Bootstrap plugins
pluginRegistry.registerPlugin(sampleGaugePlugin)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider defaultTheme="dark" storageKey="datavista-theme">
      <App />
    </ThemeProvider>
  </StrictMode>,
)
