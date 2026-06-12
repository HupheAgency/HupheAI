import type { TemplateData } from '../components/WebSlidePreview'

/**
 * Font availability checking for template calibration (Phase 0b).
 *
 * Keynote stores PostScript font names (e.g. "InterTight-SemiBold", "DIN-Regular").
 * If such a font isn't installed/loaded in the browser, text is silently rendered
 * with a substitute — which is a large source of "HTML doesn't match Keynote"
 * visual difference. We detect this up front so the AI visual loop never wastes
 * effort "fixing" what is really a missing-font problem: a missing font must be
 * installed/embedded, not visually approximated.
 */

/** Collect every distinct font name referenced by a template's text items. */
export function collectTemplateFonts(td: TemplateData): string[] {
  const fonts = new Set<string>()
  for (const layout of td.layouts) {
    for (const item of layout.textItems ?? []) {
      if (item.font) fonts.add(item.font)
      const cp = (item as any).charProperties
      if (cp?.fontName) fonts.add(cp.fontName as string)
    }
  }
  return [...fonts]
}

// Generic baselines a substitute could fall back to. A font that matches the
// width of ALL of these is almost certainly not actually installed.
const BASELINES = ['monospace', 'serif', 'sans-serif']
const TEST_STRING = 'WMmil1iI0Oo—gjpqy ABCfg 0123456789'
const TEST_PX = 72

function measure(ctx: CanvasRenderingContext2D, font: string): number {
  ctx.font = `${TEST_PX}px ${font}`
  return ctx.measureText(TEST_STRING).width
}

/**
 * Return the subset of `fontNames` that are NOT actually available in this
 * renderer. Uses canvas text-width comparison: a font is "present" when, with
 * at least one generic baseline as fallback, it renders a different width than
 * that baseline alone (meaning the named font overrode the fallback).
 */
export function detectMissingFonts(fontNames: string[]): string[] {
  if (fontNames.length === 0) return []
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) return []

  const baselineWidths = BASELINES.map((b) => measure(ctx, b))
  const missing: string[] = []

  for (const name of fontNames) {
    // Quote the name so PostScript names with hyphens are treated as one family.
    const quoted = `"${name.replace(/"/g, '')}"`
    let present = false
    for (let i = 0; i < BASELINES.length; i++) {
      const w = measure(ctx, `${quoted}, ${BASELINES[i]}`)
      // Different width than the bare baseline → the named font was applied.
      if (Math.abs(w - baselineWidths[i]) > 0.5) {
        present = true
        break
      }
    }
    if (!present) missing.push(name)
  }
  return missing
}

export interface TemplateFontReport {
  required: string[]
  missing: string[]
}

/**
 * Wait for any pending web-font loads, then report which template fonts are
 * required and which are missing. Missing fonts mean text will be substituted —
 * surface this to the user rather than letting the visual loop chase it.
 */
export async function checkTemplateFonts(td: TemplateData): Promise<TemplateFontReport> {
  const required = collectTemplateFonts(td)
  try { await (document as any).fonts?.ready } catch { /* no-op */ }
  return { required, missing: detectMissingFonts(required) }
}
