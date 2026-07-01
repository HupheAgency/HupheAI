import React from 'react'
import ReactDOM from 'react-dom/client'
import * as Sentry from '@sentry/electron/renderer'
import App from './App'
import CalibrationApp from './CalibrationApp'
import { SplatViewer } from './components/SplatViewer'
import './index.css'

const hashBase = window.location.hash.replace('#', '').split('?')[0]
const isCalibrationMode = hashBase === 'calibration'
const isSplatViewerMode = hashBase === 'splat-viewer'

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

function SplatViewerApp() {
  const params = new URLSearchParams(window.location.hash.split('?')[1] ?? '')
  const src = params.get('src') ?? ''
  return <SplatViewer src={src} onClose={() => window.close()} />
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {isSplatViewerMode ? <SplatViewerApp /> : isCalibrationMode ? <CalibrationApp /> : <App />}
  </React.StrictMode>
)
