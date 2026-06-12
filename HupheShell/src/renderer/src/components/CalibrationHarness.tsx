import { useEffect, useRef } from 'react'
import { WebSlidePreview } from './WebSlidePreview'
import type { TemplateData, LayoutCorrections } from './WebSlidePreview'

/**
 * Full-window render of a single template layout, used only during visual
 * calibration (Phase 1b). The calibrator shows this, waits for paint, and asks
 * the main process to capturePage — giving a pixel-accurate HTML render of the
 * layout that can be diffed against the Keynote reference.
 *
 * It reuses the real WebSlidePreview so there is zero rendering drift from the
 * editor. Content is left empty so each field shows its Keynote defaultText,
 * matching the empty-field Keynote screenshot export.
 */
export default function CalibrationHarness({
  templateData,
  layoutName,
  corrections,
  mappings,
  bgColors,
  onReady,
}: {
  templateData: TemplateData
  layoutName: string
  corrections?: LayoutCorrections
  mappings?: Record<string, Record<number, string>>
  bgColors?: Record<string, string>
  /** Called after the layout has mounted and painted (rAF x2). */
  onReady?: () => void
}) {
  const scale = (typeof window !== 'undefined' ? window.innerWidth : 1920) / 1920
  const readyRef = useRef(onReady)
  readyRef.current = onReady

  useEffect(() => {
    let raf2 = 0
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => readyRef.current?.())
    })
    return () => { cancelAnimationFrame(raf1); cancelAnimationFrame(raf2) }
  }, [layoutName])

  const previewBlock = { id: 'calibration', type: layoutName, heading: '', body: '', fields: {} }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 2147483647, background: '#ffffff' }}>
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: 1920,
          height: 1080,
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
        }}
      >
        <WebSlidePreview
          block={previewBlock}
          templateData={templateData}
          corrections={corrections}
          mappings={mappings}
          bgColors={bgColors}
        />
      </div>
    </div>
  )
}
