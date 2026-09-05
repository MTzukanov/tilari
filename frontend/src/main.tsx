import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { applyFont } from './shared/fontPrefs'
import { applyDisplayPrefs } from './shared/displayPrefs'
import { I18nProvider, initLocale } from './i18n'

initLocale()
applyFont()
applyDisplayPrefs()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      <App />
    </I18nProvider>
  </StrictMode>,
)
