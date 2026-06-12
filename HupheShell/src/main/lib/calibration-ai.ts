/**
 * Calibration AI (Phase 2b) — proposes visual corrections by comparing the
 * Keynote reference screenshot against the current HTML screenshot.
 *
 * Hard constraints (enforced by the prompt AND by the renderer only honouring
 * known fields):
 *  - The model may ONLY adjust interpretive/visual properties: shadow, fill
 *    colour/gradient, image mask, position nudge, opacity, z-order.
 *  - It may NEVER change font, text content, or text colour — those are
 *    authoritative facts taken straight from Keynote. They are given as
 *    read-only context so the model knows what is fixed.
 *  - Output is strict JSON matching the correction schema; nothing else.
 */

export interface CalibrationElement {
  id: string
  kind: 'shape' | 'asset' | 'image' | 'text'
  /** Authoritative, read-only facts (font, colour, text) — must not be changed. */
  facts?: Record<string, unknown>
  /** Current visual props so the model can reference/adjust them. */
  current?: Record<string, unknown>
}

export interface ProposeParams {
  jwt: string
  model?: string
  referenceDataUrl: string
  candidateDataUrl: string
  elements: CalibrationElement[]
  /** Element ids with the worst region diff — where to focus. */
  worstRegions?: string[]
}

const SYSTEM_PROMPT = `You are a visual calibration assistant for a Keynote→HTML converter.

You are given two images of the SAME slide:
- REFERENCE: how it looks in Keynote (the ground truth / target).
- CANDIDATE: how the current HTML renders it (what you must fix).

Your job: output a JSON object of VISUAL corrections that, when applied to the
HTML elements, make the CANDIDATE match the REFERENCE as closely as possible.

You may ONLY adjust these per-element properties (keyed by the element's id):
- "shadow": { "color": "#rrggbb", "alpha": 0..1, "angle": degrees, "offset": pt, "radius": pt }  (or null to REMOVE a shadow that shouldn't be there)
- "fillColor": "#rrggbb"
- "fillGradient": [ { "color": "#rrggbb", "stop": 0..1, "alpha": 0..1 } ], "fillGradientAngle": degrees
- "maskInset": { "top": pt, "right": pt, "bottom": pt, "left": pt }, "maskCornerRadius": pt, "maskIsCircle": true|false
- "offset": { "dx": pt, "dy": pt }   (small positional nudge)
- "opacity": 0..1
You may also reorder which element is in front via "zOrder": [ "id1", "id2", ... ] (back to front).

ABSOLUTE RULES — never violate:
- NEVER change font, font size, text content, or text colour. Those are fixed facts.
- Only emit corrections for elements that visibly differ. If an element matches, omit it.
- Use the exact element ids provided. Do not invent ids.
- Output ONLY a JSON object of this shape, no prose, no markdown:
  { "elements": { "<id>": { ...correction... } }, "zOrder": [ ... ] }
  (omit "zOrder" if order is fine; omit "elements" entries that need no change.)`

function stripJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const body = fenced ? fenced[1] : text
  const start = body.indexOf('{')
  const end = body.lastIndexOf('}')
  return start >= 0 && end > start ? body.slice(start, end + 1) : body
}

export async function proposeCorrections(
  p: ProposeParams,
): Promise<{ ok: true; corrections: { elements?: Record<string, unknown>; zOrder?: string[] } } | { ok: false; error: string }> {
  const model = p.model ?? 'anthropic/claude-sonnet-4-6'
  const userText =
    `Elements on this slide (id, kind, fixed facts, current visual props):\n` +
    JSON.stringify(p.elements, null, 0) +
    (p.worstRegions?.length ? `\n\nFocus first on these worst-matching elements: ${p.worstRegions.join(', ')}` : '') +
    `\n\nReturn the corrections JSON now.`

  const body = {
    model,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          { type: 'text', text: userText },
          { type: 'text', text: 'REFERENCE (Keynote — the target):' },
          { type: 'image_url', image_url: { url: p.referenceDataUrl } },
          { type: 'text', text: 'CANDIDATE (current HTML — fix this):' },
          { type: 'image_url', image_url: { url: p.candidateDataUrl } },
        ],
      },
    ],
    stream: false,
    temperature: 0,
  }

  try {
    const { callOpenRouter } = await import('./proxy')
    const res = await callOpenRouter(body, p.jwt)
    const raw = await res.text()
    if (!res.ok) return { ok: false, error: `OpenRouter ${res.status}: ${raw.slice(0, 200)}` }
    const json = JSON.parse(raw)
    const content: string = json?.choices?.[0]?.message?.content ?? ''
    if (!content) return { ok: false, error: 'Leeg AI-antwoord.' }
    const parsed = JSON.parse(stripJson(content))
    return { ok: true, corrections: { elements: parsed.elements ?? {}, zOrder: parsed.zOrder } }
  } catch (err: any) {
    return { ok: false, error: err?.message ?? 'AI-correctie mislukt.' }
  }
}
