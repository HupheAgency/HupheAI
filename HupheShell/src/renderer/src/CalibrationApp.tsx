import { useEffect, useState } from 'react'
import CalibrationHarness from './components/CalibrationHarness'
import type { TemplateData, LayoutCorrections } from './components/WebSlidePreview'

/**
 * Minimal renderer entry for the hidden offscreen calibration window
 * (booted via the #calibration hash). It renders ONLY the WebSlidePreview
 * harness, driven by IPC from main:
 *   - calibration:init   → receives templateData + mappings + bgColors (once)
 *   - calibration:render → receives { layoutName, corrections } per capture
 * and signals main back (calibrationRendered) once a layout has painted, so
 * main can capturePage it. No editor, no auth, no Supabase — invisible.
 */
interface InitData {
  templateData: TemplateData
  mappings?: Record<string, Record<number, string>>
  bgColors?: Record<string, string>
}

export default function CalibrationApp() {
  const [init, setInit] = useState<InitData | null>(null)
  // renderKey increments on every render request so the harness REMOUNTS each
  // time — even when the same layout is re-rendered with new corrections — which
  // guarantees onReady (and thus the "rendered" signal to main) fires every time.
  const [render, setRender] = useState<{ key: number; layoutName: string; corrections?: LayoutCorrections } | null>(null)

  useEffect(() => {
    const api = (window as any).api
    const offInit = api?.onCalibrationInit?.((p: InitData) => { console.log('[calib-win] init ontvangen,', p?.templateData?.layouts?.length, 'layouts'); setInit(p) })
    const offRender = api?.onCalibrationRender?.((p: { layoutName: string; corrections?: LayoutCorrections }) => {
      console.log('[calib-win] render:', p.layoutName, 'correcties:', Object.keys(p.corrections?.elements ?? {}).length)
      setRender((prev) => ({ key: (prev?.key ?? 0) + 1, layoutName: p.layoutName, corrections: p.corrections }))
    })
    api?.calibrationAppReady?.()
    return () => { offInit?.(); offRender?.() }
  }, [])

  if (!init || !render) return <div style={{ width: '100vw', height: '100vh', background: '#fff' }} />

  return (
    <CalibrationHarness
      key={render.key}
      templateData={init.templateData}
      layoutName={render.layoutName}
      corrections={render.corrections}
      mappings={init.mappings}
      bgColors={init.bgColors}
      onReady={() => { console.log('[calib-win] gerenderd, signaal naar main'); (window as any).api?.calibrationRendered?.() }}
    />
  )
}
