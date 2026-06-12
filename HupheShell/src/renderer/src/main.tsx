import React from 'react'
import ReactDOM from 'react-dom/client'
import * as Sentry from '@sentry/electron/renderer'
import App from './App'
import CalibrationApp from './CalibrationApp'
import './index.css'

// Hidden offscreen calibration window boots into a minimal harness-only mode,
// skipping the full app (auth/Supabase) entirely.
const isCalibrationMode = window.location.hash.replace('#', '') === 'calibration'

if (import.meta.env.PROD) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    beforeSend(event) {
      const redact = (obj: unknown): unknown => {
        if (!obj || typeof obj !== 'object') return obj
        for (const key of Object.keys(obj as object)) {
          if (/api.?key|password|token|secret/i.test(key)) (obj as Record<string, unknown>)[key] = '[filtered]'
          else redact((obj as Record<string, unknown>)[key])
        }
        return obj
      }
      return redact(event) as typeof event
    },
  })
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {isCalibrationMode ? <CalibrationApp /> : <App />}
  </React.StrictMode>
)
