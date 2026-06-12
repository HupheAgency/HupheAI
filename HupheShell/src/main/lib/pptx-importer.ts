import AdmZip from 'adm-zip'
import { XMLParser } from 'fast-xml-parser'

// EMU (English Metric Units) → pixels on 1920×1080 canvas
const EMU_TO_PX_X = 1920 / 9_144_000
const EMU_TO_PX_Y = 1080 / 5_143_500

function emuX(emu: number): number { return Math.round(emu * EMU_TO_PX_X) }
function emuY(emu: number): number { return Math.round(emu * EMU_TO_PX_Y) }

function xmlDecode(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  isArray: (name) => ['p:sp', 'p:pic', 'a:p', 'a:r', 'p:grpSp', 'p:graphicFrame', 'a:tr', 'a:tc', 'a:gridCol'].includes(name),
})

function parseColor(node: any): string | undefined {
  const srgb = node?.['a:srgbClr']?.['@_val']
  if (srgb) return `#${srgb}`
  return undefined
}

function parseTextStyle(rPr: any, pPr: any): TextStylePartial {
  const style: TextStylePartial = {}
  if (rPr) {
    const sz = rPr['@_sz']
    if (sz) style.font_size = Math.round(Number(sz) / 100)
    if (rPr['@_b'] === '1' || rPr['@_b'] === 'true') style.font_weight = 700
    if (rPr['@_i'] === '1' || rPr['@_i'] === 'true') style.font_style = 'italic'
    const latin = rPr['a:latin']?.['@_typeface']
    if (latin && latin !== '+mj-lt' && latin !== '+mn-lt') style.font_family = latin
    const color = parseColor(rPr['a:solidFill'])
    if (color) style.color = color
    const spc = rPr['@_spc']
    if (spc) style.letter_spacing = Math.round(Number(spc) / 100)
  }
  if (pPr) {
    const algn = pPr['@_algn']
    if (algn === 'ctr') style.alignment = 'center'
    else if (algn === 'r') style.alignment = 'right'
    else if (algn === 'just') style.alignment = 'justify'
    else if (algn === 'l') style.alignment = 'left'
    const lnSpc = pPr['a:lnSpc']?.['a:spcPct']?.['@_val']
    if (lnSpc) style.line_height = Math.round(Number(lnSpc) / 1000) / 100
  }
  return style
}

export interface HupheProvenance {
  source_format: string
  native_id?: string
  native_metadata?: Record<string, unknown>
}

export type HupheFidelity = 'editable' | 'preserved' | 'raster_fallback' | 'unsupported'

interface TextStylePartial {
  font_family?: string
  font_size?: number
  font_weight?: number
  font_style?: string
  color?: string
  alignment?: string
  letter_spacing?: number
  line_height?: number
}

export interface HupheTextElement {
  id: string; type: 'text'
  x: number; y: number; width: number; height: number
  z_index: number; fidelity: HupheFidelity; provenance: HupheProvenance
  content: string
  style: TextStylePartial
}

export interface HupheImageElement {
  id: string; type: 'image'
  x: number; y: number; width: number; height: number
  z_index: number; fidelity: HupheFidelity; provenance: HupheProvenance
  url: string
}

export interface HupheUnsupportedElement {
  id: string; type: 'unsupported'
  x: number; y: number; width: number; height: number
  z_index: number; fidelity: 'unsupported'; provenance: HupheProvenance
}

export interface HupheTableCell {
  content: string
  col_span?: number
  row_span?: number
  fill_color?: string
}
export interface HupheTableRow { cells: HupheTableCell[] }
export interface HupheTableElement {
  id: string; type: 'table'
  x: number; y: number; width: number; height: number
  z_index: number; fidelity: HupheFidelity; provenance: HupheProvenance
  rows: HupheTableRow[]
  col_widths?: number[]
  header_rows?: number
}

export type HupheElement = HupheTextElement | HupheImageElement | HupheUnsupportedElement | HupheTableElement

export interface HupheSlide {
  slide_id: string
  index: number
  layout_name?: string
  background_color?: string
  elements: HupheElement[]
}

export interface HuphePresentation {
  schema_version: 1
  presentation_id: string
  dimensions: { width: 1920; height: 1080 }
  slides: HupheSlide[]
}

export interface FidelityItem {
  id: string
  label: string
  fidelity: HupheFidelity
}

export interface ImportResult {
  presentation: HuphePresentation
  fidelityItems: FidelityItem[]
}


function parseXywh(spPr: any): { x: number; y: number; w: number; h: number } | null {
  const xfrm = spPr?.['a:xfrm']
  if (!xfrm) return null
  const off = xfrm['a:off']
  const ext = xfrm['a:ext']
  if (!off || !ext) return null
  return {
    x: emuX(Number(off['@_x'] ?? 0)),
    y: emuY(Number(off['@_y'] ?? 0)),
    w: emuX(Number(ext['@_cx'] ?? 0)),
    h: emuY(Number(ext['@_cy'] ?? 0)),
  }
}

export async function importFromPptx(buffer: Buffer): Promise<ImportResult> {
  const zip = new AdmZip(buffer)

  // ── Layout name map ───────────────────────────────────────────────────────
  const layoutNameMap: Record<string, string> = {}
  zip.getEntries()
    .filter(e => /^ppt\/slideLayouts\/slideLayout\d+\.xml$/.test(e.entryName))
    .forEach(e => {
      const xml = zip.readAsText(e.entryName)
      const m = xml.match(/<p:cSld[^>]+name="([^"]+)"/)
      if (m) layoutNameMap[e.entryName.split('/').pop()!] = m[1]
    })

  const slideLayoutMap: Record<string, string> = {}
  zip.getEntries()
    .filter(e => /^ppt\/slides\/_rels\/slide\d+\.xml\.rels$/.test(e.entryName))
    .forEach(e => {
      const num = e.entryName.match(/slide(\d+)\.xml\.rels$/)?.[1]
      const rel = zip.readAsText(e.entryName)
      const lm = rel.match(/slideLayouts\/(slideLayout\d+\.xml)/)
      if (num && lm) slideLayoutMap[`slide${num}.xml`] = layoutNameMap[lm[1]] ?? ''
    })

  // ── Image map (entry name → base64 data URL) ──────────────────────────────
  const imageMap: Record<string, string> = {}
  zip.getEntries()
    .filter(e => /^ppt\/media\//.test(e.entryName))
    .forEach(e => {
      const ext = e.entryName.split('.').pop()?.toLowerCase() ?? 'png'
      const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg'
        : ext === 'gif' ? 'image/gif'
        : ext === 'svg' ? 'image/svg+xml'
        : 'image/png'
      const b64 = zip.readFile(e.entryName)?.toString('base64') ?? ''
      imageMap[e.entryName] = `data:${mime};base64,${b64}`
    })

  // ── Slide rels (image references) ─────────────────────────────────────────
  const slideImageRels: Record<string, Record<string, string>> = {}
  zip.getEntries()
    .filter(e => /^ppt\/slides\/_rels\/slide\d+\.xml\.rels$/.test(e.entryName))
    .forEach(e => {
      const num = e.entryName.match(/slide(\d+)\.xml\.rels$/)?.[1]
      if (!num) return
      const xml = zip.readAsText(e.entryName)
      const rels: Record<string, string> = {}
      for (const m of xml.matchAll(/<Relationship[^>]+Id="([^"]+)"[^>]+Target="([^"]+)"/g)) {
        const [, id, target] = m
        const resolved = target.startsWith('../') ? `ppt/${target.slice(3)}` : `ppt/slides/${target}`
        rels[id] = resolved
      }
      slideImageRels[`slide${num}.xml`] = rels
    })

  // ── Slides ────────────────────────────────────────────────────────────────
  const slideEntries = zip.getEntries()
    .map(e => e.entryName)
    .filter(n => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => {
      const ai = Number(a.match(/slide(\d+)/)?.[1] ?? 0)
      const bi = Number(b.match(/slide(\d+)/)?.[1] ?? 0)
      return ai - bi
    })

  const fidelityItems: FidelityItem[] = []
  const slides: HupheSlide[] = []

  for (let idx = 0; idx < slideEntries.length; idx++) {
    const entryName = slideEntries[idx]
    const slideName = entryName.split('/').pop()!
    const xml = zip.readAsText(entryName)
    const doc = parser.parse(xml)

    const spTree = doc?.['p:sld']?.['p:cSld']?.['p:spTree']
    const elements: HupheElement[] = []
    let zIdx = 0

    // Text shapes
    const shapes: any[] = Array.isArray(spTree?.['p:sp']) ? spTree['p:sp'] : spTree?.['p:sp'] ? [spTree['p:sp']] : []
    for (const sp of shapes) {
      zIdx++
      const nativeId = sp['p:nvSpPr']?.['p:cNvPr']?.['@_id']
      const spPr = sp['p:spPr']
      const pos = parseXywh(spPr)
      if (!pos) continue

      // Collect text
      const txBody = sp['p:txBody']
      const paras: any[] = Array.isArray(txBody?.['a:p']) ? txBody['a:p'] : txBody?.['a:p'] ? [txBody['a:p']] : []
      const textLines: string[] = []
      let firstRPr: any = null
      let firstPPr: any = null

      for (const para of paras) {
        const runs: any[] = Array.isArray(para['a:r']) ? para['a:r'] : para['a:r'] ? [para['a:r']] : []
        const lineText = runs.map((r: any) => xmlDecode(String(r['a:t'] ?? ''))).join('')
        if (lineText) textLines.push(lineText)
        if (!firstPPr) firstPPr = para['a:pPr'] ?? null
        if (!firstRPr && runs[0]) firstRPr = runs[0]['a:rPr'] ?? null
      }

      const content = textLines.join('\n')
      const hasEffects = !!(spPr?.['a:effectLst'] || spPr?.['a:ln'])
      const fidelity: HupheFidelity = hasEffects ? 'preserved' : 'editable'

      const el: HupheTextElement = {
        id: `s${idx}-t${nativeId ?? zIdx}`,
        type: 'text',
        x: pos.x, y: pos.y, width: pos.w, height: pos.h,
        z_index: zIdx,
        fidelity,
        provenance: { source_format: 'pptx', native_id: String(nativeId ?? ''), native_metadata: { slide: slideName } },
        content,
        style: parseTextStyle(firstRPr, firstPPr),
      }
      elements.push(el)
      fidelityItems.push({ id: el.id, label: `Tekstvak — slide ${idx + 1}`, fidelity })
    }

    // Images
    const pics: any[] = Array.isArray(spTree?.['p:pic']) ? spTree['p:pic'] : spTree?.['p:pic'] ? [spTree['p:pic']] : []
    const imgRels = slideImageRels[slideName] ?? {}
    for (const pic of pics) {
      zIdx++
      const nativeId = pic['p:nvPicPr']?.['p:cNvPr']?.['@_id']
      const spPr = pic['p:spPr']
      const pos = parseXywh(spPr)
      if (!pos) continue

      const rId = pic['p:blipFill']?.['a:blip']?.['@_r:embed']
      const mediaPath = rId ? imgRels[rId] : undefined
      const url = mediaPath ? (imageMap[mediaPath] ?? '') : ''

      const el: HupheImageElement = {
        id: `s${idx}-i${nativeId ?? zIdx}`,
        type: 'image',
        x: pos.x, y: pos.y, width: pos.w, height: pos.h,
        z_index: zIdx,
        fidelity: 'editable',
        provenance: { source_format: 'pptx', native_id: String(nativeId ?? ''), native_metadata: { rId, mediaPath } },
        url,
      }
      elements.push(el)
      fidelityItems.push({ id: el.id, label: `Afbeelding — slide ${idx + 1}`, fidelity: 'editable' })
    }

    // Tables: p:graphicFrame containing a:tbl
    const frames: any[] = Array.isArray(spTree?.['p:graphicFrame']) ? spTree['p:graphicFrame'] : spTree?.['p:graphicFrame'] ? [spTree['p:graphicFrame']] : []
    for (const frame of frames) {
      const tbl = frame?.['p:graphic']?.['a:graphicData']?.['a:tbl']
      if (!tbl) continue
      zIdx++
      const nativeId = frame['p:nvGraphicFramePr']?.['p:cNvPr']?.['@_id']
      const xfrm = frame['p:xfrm']
      const off = xfrm?.['a:off']
      const ext = xfrm?.['a:ext']
      const x = emuX(Number(off?.['@_x'] ?? 0))
      const y = emuY(Number(off?.['@_y'] ?? 0))
      const width = emuX(Number(ext?.['@_cx'] ?? 0))
      const height = emuY(Number(ext?.['@_cy'] ?? 0))

      // Column widths (EMU → px, convert to percentages)
      const gridCols: any[] = Array.isArray(tbl['a:tblGrid']?.['a:gridCol']) ? tbl['a:tblGrid']['a:gridCol'] : tbl['a:tblGrid']?.['a:gridCol'] ? [tbl['a:tblGrid']['a:gridCol']] : []
      const colPx = gridCols.map((c: any) => emuX(Number(c['@_w'] ?? 0)))
      const totalPx = colPx.reduce((s: number, v: number) => s + v, 0) || 1
      const col_widths = colPx.map((v: number) => Math.round((v / totalPx) * 100 * 100) / 100)

      const tblRows: any[] = Array.isArray(tbl['a:tr']) ? tbl['a:tr'] : tbl['a:tr'] ? [tbl['a:tr']] : []
      const rows: HupheTableRow[] = tblRows.map((tr: any) => {
        const tcs: any[] = Array.isArray(tr['a:tc']) ? tr['a:tc'] : tr['a:tc'] ? [tr['a:tc']] : []
        const cells: HupheTableCell[] = tcs.map((tc: any) => {
          const gridSpan = Number(tc['@_gridSpan'] ?? 1)
          const rowSpan = Number(tc['@_rowSpan'] ?? 1)
          const texts: string[] = []
          const paras: any[] = Array.isArray(tc['a:txBody']?.['a:p']) ? tc['a:txBody']['a:p'] : tc['a:txBody']?.['a:p'] ? [tc['a:txBody']['a:p']] : []
          for (const p of paras) {
            const runs: any[] = Array.isArray(p['a:r']) ? p['a:r'] : p['a:r'] ? [p['a:r']] : []
            const line = runs.map((r: any) => xmlDecode(String(r['a:t'] ?? ''))).join('')
            if (line) texts.push(line)
          }
          const fillColor = parseColor(tc['a:tcPr']?.['a:solidFill'])
          return {
            content: texts.join('\n'),
            col_span: gridSpan > 1 ? gridSpan : undefined,
            row_span: rowSpan > 1 ? rowSpan : undefined,
            fill_color: fillColor,
          }
        })
        return { cells }
      })

      const el: HupheTableElement = {
        id: `s${idx}-tbl${zIdx}`,
        type: 'table',
        x, y, width, height,
        z_index: zIdx,
        fidelity: 'editable',
        provenance: { source_format: 'pptx', native_id: String(nativeId ?? '') },
        rows,
        col_widths: col_widths.length > 0 ? col_widths : undefined,
      }
      elements.push(el)
      fidelityItems.push({ id: el.id, label: `Tabel — slide ${idx + 1}`, fidelity: 'editable' })
    }

    // Unsupported: group shapes, smart art
    const groups: any[] = Array.isArray(spTree?.['p:grpSp']) ? spTree['p:grpSp'] : spTree?.['p:grpSp'] ? [spTree['p:grpSp']] : []
    for (const _grp of groups) {
      zIdx++
      const el: HupheUnsupportedElement = {
        id: `s${idx}-g${zIdx}`,
        type: 'unsupported',
        x: 0, y: 0, width: 0, height: 0,
        z_index: zIdx,
        fidelity: 'unsupported',
        provenance: { source_format: 'pptx', native_metadata: { reason: 'group shape' } },
      }
      elements.push(el)
      fidelityItems.push({ id: el.id, label: `Groep — slide ${idx + 1}`, fidelity: 'unsupported' })
    }

    slides.push({
      slide_id: `slide-${idx}`,
      index: idx,
      layout_name: slideLayoutMap[slideName],
      elements,
    })
  }

  const presentation: HuphePresentation = {
    schema_version: 1,
    presentation_id: `imported-${Date.now()}`,
    dimensions: { width: 1920, height: 1080 },
    slides,
  }

  return { presentation, fidelityItems }
}
