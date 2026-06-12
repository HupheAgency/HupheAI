import { useCallback, useState } from 'react'
import type { TemplateData, TemplateLayout, LayoutCorrections, ElementCorrection } from '../components/WebSlidePreview'
import { checkTemplateFonts, type TemplateFontReport } from '../lib/font-check'

interface RegionRect { id: string; posX: number; posY: number; width: number; height: number }
interface RegionScore { id: string; ssim: number; pixelDiff: number }

export interface CalibrationLayoutResult {
  layoutName: string
  ok: boolean
  error?: string
  ssimBefore: number
  ssimAfter: number
  iterations: number
  corrections: LayoutCorrections
}

export interface CalibrationReport {
  fonts: TemplateFontReport
  layouts: CalibrationLayoutResult[]
  corrections: Record<string, LayoutCorrections>
}

export interface CalibrationProgress {
  phase: 'idle' | 'fonts' | 'keynote' | 'correcting' | 'done' | 'error'
  current?: string
  iteration?: number
  completed: number
  total: number
}

const MAX_ITERATIONS = 3
const ACCEPT_SSIM = 0.985
const MIN_GAIN = 0.002

function buildRegions(layout: TemplateLayout): RegionRect[] {
  const out: RegionRect[] = []
  const push = (e: any) => {
    if (e?.id && typeof e.posX === 'number' && e.width > 0 && e.height > 0) {
      out.push({ id: e.id, posX: e.posX, posY: e.posY, width: e.width, height: e.height })
    }
  }
  layout.shapes?.forEach(push)
  layout.assets?.forEach(push)
  layout.images?.forEach(push)
  layout.textItems?.forEach(push)
  return out
}

function buildElements(layout: TemplateLayout) {
  const els: Array<{ id: string; kind: string; facts?: any; current?: any }> = []
  layout.shapes?.forEach((s) => {
    if (!s.id) return
    els.push({ id: s.id, kind: 'shape', current: { shadow: s.shadow ?? null, fillColor: s.fillColor, fillGradient: s.fillGradient, cornerRadius: s.cornerRadius } })
  })
  layout.assets?.forEach((a: any) => {
    if (!a.id) return
    els.push({ id: a.id, kind: 'asset', current: { shadow: a.shadow ?? null, maskInset: a.maskInset, maskCornerRadius: a.maskCornerRadius, maskIsCircle: a.maskIsCircle } })
  })
  layout.textItems?.forEach((t) => {
    if (!t.id) return
    els.push({ id: t.id, kind: 'text', facts: { font: t.font, fontSize: t.fontSize, color: t.color, text: t.defaultText } })
  })
  return els
}

function mergeCorrections(base: LayoutCorrections, add: LayoutCorrections): LayoutCorrections {
  const elements: Record<string, ElementCorrection> = { ...(base.elements ?? {}) }
  for (const [id, c] of Object.entries(add.elements ?? {})) {
    elements[id] = { ...(elements[id] ?? {}), ...(c as ElementCorrection) }
  }
  return { elements, zOrder: add.zOrder ?? base.zOrder }
}

/**
 * Drives the visual calibration entirely through a HIDDEN offscreen window
 * (main process), so nothing flashes on the visible editor. Per layout it
 * renders → captures → diffs, and where the diff is poor, asks the vision model
 * for corrections, keeping only changes that the diff confirms improve the match.
 */
export function useCalibration() {
  const [progress, setProgress] = useState<CalibrationProgress>({ phase: 'idle', completed: 0, total: 0 })

  /** Render a layout in the hidden window, capture it, diff against Keynote. */
  const renderAndScore = useCallback(async (
    api: any,
    templateData: TemplateData,
    layout: TemplateLayout,
    reference: string,
    corrections: LayoutCorrections | undefined,
  ): Promise<{ ssim: number; worst: string[]; html: string } | null> => {
    const cap = await api?.calibrationRenderAndCapture?.({ layoutName: layout.name, corrections })
    if (!cap?.ok) return null
    const diff = await api?.calibrationDiff?.({
      referenceDataUrl: reference,
      candidateDataUrl: cap.dataUrl,
      templateWidth: templateData.slideWidth,
      templateHeight: templateData.slideHeight,
      regions: buildRegions(layout),
    })
    if (!diff?.ok) return null
    // Only surface elements the AI is ALLOWED to fix (shapes/assets/images).
    // text: regions are dominated by font substitution and are off-limits, so
    // including them just distracts the model.
    const worst = (diff.result.regions as RegionScore[])
      .filter((r) => r.ssim < 0.9 && !r.id.startsWith('text:'))
      .slice(0, 6).map((r) => r.id)
    return { ssim: diff.result.ssim, worst, html: cap.dataUrl }
  }, [])

  const run = useCallback(async (
    templateData: TemplateData,
    clientId: string,
    opts?: { mappings?: Record<string, Record<number, string>>; bgColors?: Record<string, string>; layoutNames?: string[] },
  ): Promise<CalibrationReport | null> => {
    const api = (window as any).api
    const layouts = templateData.layouts.filter((l) => !opts?.layoutNames || opts.layoutNames.includes(l.name))
    const total = layouts.length

    setProgress({ phase: 'fonts', completed: 0, total })
    const fonts = await checkTemplateFonts(templateData)

    setProgress({ phase: 'keynote', completed: 0, total })
    const keyPathRes = await api?.calibrationGetKeyPath?.(clientId)
    console.log('[calib] keyPath:', keyPathRes)
    if (!keyPathRes?.ok) { console.error('[calib] geen .key-pad — stop'); setProgress({ phase: 'error', completed: 0, total }); return null }
    console.log('[calib] Keynote-screenshots maken voor', layouts.length, 'layouts (vereist Keynote Creator Studio)…')
    const shotRes = await api?.takeWizardScreenshots?.(keyPathRes.keyPath, layouts.map((l) => l.name))
    const keynoteShots: (string | null)[] = shotRes?.screenshots ?? layouts.map(() => null)
    const okShots = keynoteShots.filter(Boolean).length
    console.log(`[calib] Keynote-screenshots: ${okShots}/${layouts.length} gelukt`, shotRes?.error ? `(fout: ${shotRes.error})` : '')
    if (okShots === 0) console.error('[calib] GEEN Keynote-screenshots — is Keynote Creator Studio geïnstalleerd? Zonder referentie kan de AI niets vergelijken.')

    // Boot the hidden calibration window with the template data (once).
    console.log('[calib] verborgen calibratievenster starten…')
    const sess = await api?.calibrationSessionStart?.({ templateData, mappings: opts?.mappings, bgColors: opts?.bgColors })
    console.log('[calib] verborgen venster:', sess)
    if (sess && sess.appReady === false) console.error('[calib] verborgen venster reageerde NIET (timeout) — captures zullen mislukken. Mogelijk laadt #calibration-route niet.')

    const results: CalibrationLayoutResult[] = []
    const correctionsMap: Record<string, LayoutCorrections> = {}

    try {
      for (let i = 0; i < layouts.length; i++) {
        const layout = layouts[i]
        const reference = keynoteShots[i]
        setProgress({ phase: 'correcting', current: layout.name, completed: i, total })
        if (!reference) {
          results.push({ layoutName: layout.name, ok: false, error: 'Geen Keynote-referentie', ssimBefore: 0, ssimAfter: 0, iterations: 0, corrections: {} })
          continue
        }

        const base = await renderAndScore(api, templateData, layout, reference, undefined)
        if (!base) {
          console.error(`[calib] ${layout.name}: render/diff mislukt (verborgen venster of diff faalde)`)
          results.push({ layoutName: layout.name, ok: false, error: 'Render/diff mislukt', ssimBefore: 0, ssimAfter: 0, iterations: 0, corrections: {} })
          continue
        }
        console.log(`[calib] ${layout.name}: baseline SSIM ${base.ssim.toFixed(3)} (1.0 = identiek), slechtste regio's:`, base.worst)
        if (base.ssim >= ACCEPT_SSIM) console.log(`[calib] ${layout.name}: al goed genoeg, geen AI nodig`)

        let accepted: LayoutCorrections = {}
        let bestSsim = base.ssim
        let curHtml = base.html
        let worst = base.worst
        let iterations = 0

        while (bestSsim < ACCEPT_SSIM && iterations < MAX_ITERATIONS) {
          setProgress({ phase: 'correcting', current: layout.name, iteration: iterations + 1, completed: i, total })
          const proposal = await api?.calibrationPropose?.({
            referenceDataUrl: reference,
            candidateDataUrl: curHtml,
            elements: buildElements(layout),
            worstRegions: worst,
          })
          iterations++
          if (!proposal?.ok) { console.error(`[calib] ${layout.name}: AI-voorstel mislukt:`, proposal?.error); break }
          const propCount = Object.keys(proposal.corrections?.elements ?? {}).length
          console.log(`[calib] ${layout.name} iter ${iterations}: AI stelt ${propCount} correcties voor`, proposal.corrections?.elements)
          if (propCount === 0) { console.log(`[calib] ${layout.name}: AI ziet niets om te corrigeren`); break }

          const candidate = mergeCorrections(accepted, proposal.corrections as LayoutCorrections)
          const scored = await renderAndScore(api, templateData, layout, reference, candidate)
          if (!scored) { console.error(`[calib] ${layout.name}: her-render na correctie mislukt`); break }

          if (scored.ssim > bestSsim + MIN_GAIN) {
            console.log(`[calib] ${layout.name}: SSIM ${bestSsim.toFixed(3)} → ${scored.ssim.toFixed(3)} ✓ behouden`)
            accepted = candidate
            bestSsim = scored.ssim
            curHtml = scored.html
            worst = scored.worst
          } else {
            console.log(`[calib] ${layout.name}: SSIM ${bestSsim.toFixed(3)} → ${scored.ssim.toFixed(3)} ✗ geen verbetering, teruggedraaid`)
            break
          }
        }

        if (accepted.elements && Object.keys(accepted.elements).length > 0) correctionsMap[layout.name] = accepted
        results.push({ layoutName: layout.name, ok: true, ssimBefore: base.ssim, ssimAfter: bestSsim, iterations, corrections: accepted })
      }
    } finally {
      await api?.calibrationSessionEnd?.()
    }

    setProgress({ phase: 'done', completed: total, total })
    return { fonts, layouts: results, corrections: correctionsMap }
  }, [renderAndScore])

  return { progress, run }
}
