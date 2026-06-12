/**
 * Ad→HTML pipeline — segmentatie, font-herkenning, logo-protocol, HTML-assembler
 *
 * Font-prioriteit: systeemfont → Adobe Font (melding) → Google Font
 * Logo-protocol:  Clearbit → SVG genereren (≤3 kleuren) → achtergrond verwijderen (>3 kleuren)
 */

import sharp from 'sharp'
import { callOpenRouter, callFalProxy } from './proxy'

// ── Constanten ────────────────────────────────────────────────────────────────

const SYSTEM_FONTS = new Set([
  'Georgia', 'Times New Roman', 'Arial', 'Helvetica', 'Verdana', 'Trebuchet MS',
  'Impact', 'Courier New', 'Palatino', 'Garamond', 'Gill Sans', 'Optima',
  'Futura', 'Century Gothic', 'Tahoma', 'Lucida Grande', 'Geneva',
])

/** Vaste fallback-mapping voor bekende betaalde/Adobe fonts → beste gratis alternatief */
const FONT_FALLBACK_MAP: Record<string, string> = {
  'Recoleta': 'Playfair Display',
  'GT Walsheim': 'DM Sans',
  'GT America': 'Inter',
  'Proxima Nova': 'Nunito Sans',
  'Brandon Grotesque': 'Raleway',
  'Futura PT': 'Jost',
  'Canela': 'Cormorant Garamond',
  'Graphik': 'Inter',
  'Myriad Pro': 'Source Sans 3',
  'Freight Sans': 'Libre Franklin',
  'Acumin Pro': 'Barlow',
  'Neue Haas Grotesk': 'DM Sans',
  'Aktiv Grotesk': 'Barlow',
  'Soleil': 'Nunito',
  'Filson Pro': 'Nunito',
  'Moret': 'Playfair Display',
  'Freight Display': 'Cormorant Garamond',
  'Quatro Slab': 'Roboto Slab',
  'Calluna': 'Lora',
  'Tiempos': 'Lora',
}

const ADOBE_FONTS = new Set([
  'Acumin Pro', 'Freight Sans', 'Brandon Grotesque', 'Proxima Nova', 'Myriad Pro',
  'Futura PT', 'Neue Haas Grotesk', 'Aktiv Grotesk', 'Soleil', 'Recoleta',
  'Filson Pro', 'Moret', 'Freight Display', 'Quatro Slab', 'Calluna',
  'GT Walsheim', 'GT America', 'Canela', 'Tiempos', 'Graphik',
])

// ── Types ──────────────────────────────────────────────────────────────────────

export interface BBox {
  x: number; y: number; w: number; h: number
}

export interface FontResolution {
  /** Het font dat waarschijnlijk in het origineel gebruikt is */
  likelyRealFont: string | null
  /** Bron: "paid" | "adobe" | "google" | "system" */
  likelyRealSource: 'paid' | 'adobe' | 'google' | 'system' | null
  /** Het font dat we daadwerkelijk gebruiken in de HTML */
  usedFamily: string
  /** Hoe het font geladen wordt */
  usedSource: 'system' | 'google' | 'adobe'
  /** CSS font-family stack */
  cssFontFamily: string
}

export interface TextSegment {
  type: 'text'
  bbox: BBox
  content: string
  /** Naam die Claude identificeert als het meest waarschijnlijke echte font */
  likelyFont: string
  /** Of Claude denkt dat dit een betaald font is */
  likelyPaid: boolean
  /** Beste vrije alternatief dat Claude voorstelt */
  fallbackFont: string
  fontWeight: string
  fontSize: number
  color: string
  letterSpacing: string
  lineHeight: string
  textAlign: 'left' | 'center' | 'right'
  /** Aantal visuele regels dat deze tekst in de advertentie inneemt */
  visualLines: number
  /** Ingevuld na font-resolutie */
  fontResolution?: FontResolution
}

export interface LogoSegment {
  type: 'logo'
  bbox: BBox
  brandName: string | null
  domain: string | null
  /** Geschat aantal kleuren in het logo */
  colorCount: number
  /** Soort logo */
  logoType: 'icon' | 'wordmark' | 'combination'
  /** Dominante kleur van het logo in de advertentie (CSS hex of "white"/"black") */
  dominantColor: string
}

export interface BackgroundInfo {
  type: 'photo' | 'illustration' | 'solid' | 'gradient'
  cssValue: string | null
}

export interface AdAnalysis {
  width: number
  height: number
  background: BackgroundInfo
  textSegments: TextSegment[]
  logoSegments: LogoSegment[]
  protectedRegions: BBox[]
}

export interface ResolvedLogo {
  dataUrl: string
  method: 'clearbit' | 'svg-generated' | 'bg-removed' | 'crop-fallback'
  isSvg: boolean
  cssFilter: string
}

/** Genereer een CSS filter om een logo naar de doelkleur te brengen. */
export function colorToCssFilter(targetHex: string): string {
  const h = targetHex.replace('#', '').toLowerCase()
  if (h === 'ffffff' || h === 'fff' || targetHex.toLowerCase() === 'white') {
    return 'brightness(0) invert(1)'
  }
  if (h === '000000' || h === '000' || targetHex.toLowerCase() === 'black') {
    return 'brightness(0)'
  }
  // Voor andere kleuren: maak zwart en voeg kleur toe via sepia+hue-rotate benadering
  // Dit is een goede benadering voor enkelvoudige kleuren
  const r = parseInt(h.slice(0, 2), 16) / 255
  const g = parseInt(h.slice(2, 4), 16) / 255
  const b = parseInt(h.slice(4, 6), 16) / 255
  const max = Math.max(r, g, b)
  const lightness = Math.round(max * 100)
  // Hue berekening
  let hue = 0
  if (max === r) hue = ((g - b) / (max - Math.min(r, g, b))) * 60
  else if (max === g) hue = (2 + (b - r) / (max - Math.min(r, g, b))) * 60
  else hue = (4 + (r - g) / (max - Math.min(r, g, b))) * 60
  if (hue < 0) hue += 360
  const sat = max === 0 ? 0 : Math.round(((max - Math.min(r, g, b)) / max) * 100)
  return `brightness(0) sepia(1) saturate(${sat * 5}%) hue-rotate(${Math.round(hue - 30)}deg) brightness(${lightness}%)`
}

export type LogFn = (msg: string, level?: 'info' | 'ok' | 'warn' | 'err' | 'section') => void

/** Vertaalt een OpenRouter HTTP-statuscode naar een begrijpelijke foutmelding. */
export function openRouterError(status: number, body: string): string {
  if (status === 402) return 'Onvoldoende OpenRouter credits. Laad je tegoed op via openrouter.ai/credits.'
  if (status === 429) return 'OpenRouter rate limit bereikt. Wacht even en probeer opnieuw.'
  if (status === 401) return 'Ongeldige OpenRouter API-key. Controleer je sleutel via Instellingen.'
  if (status === 403) return 'Geen toegang tot dit model via OpenRouter. Controleer je abonnement.'
  if (status === 404) return `Model niet gevonden op OpenRouter. Controleer het model-ID. (${body.slice(0, 100)})`
  if (status >= 500) return `OpenRouter server-fout (${status}). Probeer het later opnieuw.`
  return `OpenRouter fout ${status}: ${body.slice(0, 150)}`
}

// ── Stap 1: segmentatie via Claude ────────────────────────────────────────────

export async function analyzeAdSegments(
  imageDataUrl: string,
  width: number,
  height: number,
  jwt: string,
  log: LogFn,
): Promise<AdAnalysis> {
  log('── Stap 1: segmentatie via Claude ──', 'section')

  const prompt = `Analyseer deze advertentie en geef een JSON-object terug. Geen uitleg, alleen JSON.

Per tekstelement:
- bbox: { x, y, w, h } als fracties (0..1)
- content: exacte tekst
- likelyFont: het echte font dat waarschijnlijk gebruikt is (bijv. "Recoleta", "GT Walsheim", "Helvetica Neue"). Wees specifiek — kijk naar de lettervormen, serifs, terminals en proporties.
- likelyPaid: true als dit font betaald/commercieel is, false als het gratis beschikbaar is
- fallbackFont: het vrije alternatief dat VISUEEL het meest lijkt op het origineel — let op lettervormen, serifs, proporties en stijl. Kies gericht, niet standaard "Montserrat". Voorbeelden: Recoleta → "Playfair Display", GT Walsheim → "DM Sans", Proxima Nova → "Nunito Sans", Brandon Grotesque → "Raleway", Futura → "Jost", Canela → "Cormorant Garamond", Graphik → "Inter", Myriad Pro → "Source Sans 3", Freight Sans → "Libre Franklin", Acumin Pro → "Barlow"
- fontWeight: CSS font-weight ("300","400","600","700","900")
- fontSize: stel in op 0 (wordt automatisch berekend uit de bbox-hoogte)
- visualLines: het aantal visuele regels dat deze tekst in de originele advertentie inneemt (1 = één regel, 2 = twee regels, etc.)
- color: CSS hex-kleur
- letterSpacing: CSS letter-spacing ("0em", "-0.02em", "0.05em")
- lineHeight: CSS line-height ("1.1", "1.4")
- textAlign: "left"|"center"|"right"

Per logo:
- bbox: { x, y, w, h } als fracties
- brandName: merknaam of null
- domain: websitedomein (bijv. "natuurhuisje.nl") of null
- colorCount: geschat aantal kleuren in het logo (1, 2, 3, of 4+ als integer)
- logoType: "icon"|"wordmark"|"combination"
- dominantColor: de kleur van het logo zoals het IN DEZE ADVERTENTIE verschijnt (CSS hex bijv. "#ffffff" voor wit, "#000000" voor zwart, of een andere hex-kleur)

Achtergrond:
- type: "photo"|"illustration"|"solid"|"gradient"
- cssValue: hex of CSS gradient-string, anders null

protectedRegions: bboxen van mensen/dieren/objecten die nooit inpainted mogen worden.

JSON formaat:
{
  "background": { "type": "photo", "cssValue": null },
  "textSegments": [{ "type": "text", "bbox": {"x":0,"y":0,"w":0,"h":0}, "content": "", "likelyFont": "", "likelyPaid": false, "fallbackFont": "", "fontWeight": "400", "fontSize": 0, "color": "#000000", "letterSpacing": "0em", "lineHeight": "1.2", "textAlign": "left", "visualLines": 1 }],
  "logoSegments": [{ "type": "logo", "bbox": {"x":0,"y":0,"w":0,"h":0}, "brandName": null, "domain": null, "colorCount": 2, "logoType": "combination", "dominantColor": "#000000" }],
  "protectedRegions": [{ "x": 0, "y": 0, "w": 0, "h": 0 }]
}`

  const res = await callOpenRouter({
    model: 'anthropic/claude-sonnet-4-6',
    messages: [{ role: 'user', content: [
      { type: 'text', text: prompt },
      { type: 'image_url', image_url: { url: imageDataUrl } },
    ]}],
    temperature: 0,
  }, jwt)

  if (!res.ok) {
    const body = await res.text()
    throw new Error(openRouterError(res.status, body))
  }
  const json = await res.json() as { choices: Array<{ message: { content: string } }> }
  const raw = json.choices[0].message.content
  const match = raw.match(/```(?:json)?\s*([\s\S]*?)```/) ?? raw.match(/(\{[\s\S]*\})/)
  const parsed = JSON.parse(match ? match[1] : raw)

  const result: AdAnalysis = {
    width, height,
    background: parsed.background ?? { type: 'photo', cssValue: null },
    textSegments: (parsed.textSegments ?? []) as TextSegment[],
    logoSegments: (parsed.logoSegments ?? []) as LogoSegment[],
    protectedRegions: (parsed.protectedRegions ?? []) as BBox[],
  }

  log(`  Achtergrond: ${result.background.type}`, 'ok')
  log(`  Tekst-segmenten: ${result.textSegments.length}`)
  log(`  Logo-segmenten: ${result.logoSegments.length}`)
  log(`  Beschermde regio's: ${result.protectedRegions.length}`)
  result.textSegments.forEach((s, i) =>
    log(`    tekst[${i}]: "${s.content.slice(0, 30)}" — waarschijnlijk: ${s.likelyFont}${s.likelyPaid ? ' (betaald)' : ''}, fallback: ${s.fallbackFont}`)
  )
  result.logoSegments.forEach((s, i) =>
    log(`    logo[${i}]: ${s.brandName ?? 'onbekend'} | ${s.logoType} | ${s.colorCount} kleur(en) | domein: ${s.domain ?? 'geen'}`)
  )

  return result
}

// ── Font-resolutie ────────────────────────────────────────────────────────────

/** Zoek in installedFonts naar de beste match voor fontName.
 *  Probeert exacte match, dan steeds kortere prefix ("Futura PT" → "Futura"). */
function findInstalledVariant(fontName: string, installedFonts: Set<string>): string | null {
  if (!fontName || installedFonts.size === 0) return null
  if (installedFonts.has(fontName)) return fontName
  const words = fontName.split(' ')
  for (let len = words.length - 1; len >= 1; len--) {
    const candidate = words.slice(0, len).join(' ')
    if (installedFonts.has(candidate)) return candidate
  }
  return null
}

export function resolveFont(
  segment: TextSegment,
  log: LogFn,
  installedFonts: Set<string> = new Set(),
  typekitId: string | null = null,
): FontResolution {
  const likely = segment.likelyFont?.trim() ?? ''
  const fallback = segment.fallbackFont?.trim() ?? 'sans-serif'

  // Exacte of fuzzy match in geïnstalleerde fonts (incl. Adobe CC)
  const installedVariant = findInstalledVariant(likely, installedFonts)

  // Bepaal bron van het waarschijnlijke font
  let likelySource: FontResolution['likelyRealSource'] = null
  if (likely) {
    if (installedVariant || SYSTEM_FONTS.has(likely)) likelySource = 'system'
    else if (ADOBE_FONTS.has(likely)) likelySource = 'adobe'
    else if (segment.likelyPaid) likelySource = 'paid'
    else likelySource = 'google'
  }

  // Kies het beste beschikbare font — prioriteit: geïnstalleerd > typekit > google > fallback
  let usedFamily = fallback
  let usedSource: FontResolution['usedSource'] = 'google'

  if (installedVariant || SYSTEM_FONTS.has(likely)) {
    // Font staat geïnstalleerd (exact of als variant, bijv. "Futura PT" → "Futura")
    usedFamily = installedVariant ?? likely
    usedSource = 'system'
    if (installedVariant && installedVariant !== likely) {
      log(`  Font: ${likely} → geïnstalleerde variant "${installedVariant}" gevonden`, 'ok')
    } else if (ADOBE_FONTS.has(likely)) {
      log(`  Font: ${likely} is geïnstalleerd via Adobe CC — direct gebruiken`, 'ok')
    }
  } else if (likely && ADOBE_FONTS.has(likely) && typekitId) {
    // Adobe font via Typekit web embed — gebruik het originele fontnaam direct
    usedFamily = likely
    usedSource = 'adobe'
    log(`  Font: ${likely} via Adobe Fonts Typekit (kit: ${typekitId})`, 'ok')
  } else if (likely && !segment.likelyPaid) {
    // Waarschijnlijk een Google Font
    usedFamily = likely
    usedSource = 'google'
  } else {
    // Betaald/Adobe font niet beschikbaar — gebruik vaste mapping, anders Claude's fallback
    usedFamily = FONT_FALLBACK_MAP[likely] ?? fallback
    usedSource = 'google'
    if (likely) log(`  Font: ${likely} niet beschikbaar — backup: ${usedFamily}`, 'warn')
  }

  // Bouw CSS font-family stack
  const genericFallback = usedFamily.toLowerCase().includes('serif') && !usedFamily.toLowerCase().includes('sans')
    ? 'serif' : 'sans-serif'
  const cssFontFamily = `"${usedFamily}", ${genericFallback}`

  const resolution: FontResolution = {
    likelyRealFont: likely || null,
    likelyRealSource: likelySource,
    usedFamily,
    usedSource,
    cssFontFamily,
  }

  log(`  Font[${segment.content.slice(0, 20)}]: ${likely || '?'} (${likelySource}) → gebruikt: ${usedFamily} via ${usedSource}`)
  return resolution
}

// ── Stap 2: masker genereren ───────────────────────────────────────────────────

export async function generateMask(
  width: number,
  height: number,
  analysis: AdAnalysis,
  log: LogFn,
): Promise<Buffer> {
  log('── Stap 2: masker genereren ──', 'section')
  const OVERSPILL = 0.015

  const toRect = (bbox: BBox) => {
    const px = Math.max(0, Math.floor((bbox.x - OVERSPILL) * width))
    const py = Math.max(0, Math.floor((bbox.y - OVERSPILL) * height))
    const pw = Math.min(width - px, Math.ceil((bbox.w + OVERSPILL * 2) * width))
    const ph = Math.min(height - py, Math.ceil((bbox.h + OVERSPILL * 2) * height))
    return `<rect x="${px}" y="${py}" width="${pw}" height="${ph}" fill="white" rx="3"/>`
  }

  const toProtectedRect = (bbox: BBox) => {
    const px = Math.floor(bbox.x * width)
    const py = Math.floor(bbox.y * height)
    const pw = Math.ceil(bbox.w * width)
    const ph = Math.ceil(bbox.h * height)
    return `<rect x="${px}" y="${py}" width="${pw}" height="${ph}" fill="black"/>`
  }

  const maskable = [...analysis.textSegments, ...analysis.logoSegments]
  const svgStr = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <rect width="${width}" height="${height}" fill="black"/>
  ${maskable.map((s) => toRect(s.bbox)).join('\n  ')}
  ${analysis.protectedRegions.map(toProtectedRect).join('\n  ')}
</svg>`

  const maskBuf = await sharp(Buffer.from(svgStr)).resize(width, height).png().toBuffer()
  const coveredPct = (maskable.reduce((acc, s) => acc + s.bbox.w * s.bbox.h, 0) * 100).toFixed(1)
  log(`  ${analysis.protectedRegions.length} beschermde regio('s) uitgesloten van masker`)
  log(`  Masker: ${width}×${height}px, ${maskable.length} gebieden, ~${coveredPct}% gedekt`, 'ok')
  log(`  Masker PNG: ${(maskBuf.length / 1024).toFixed(1)}KB`)
  return maskBuf
}

// ── Logo-protocol ─────────────────────────────────────────────────────────────

export async function fetchLogoDataUrl(domain: string, brandName: string | null, serperKey: string | null, log: LogFn): Promise<string | null> {
  if (!domain) return null

  const tryFetch = async (url: string, label: string): Promise<string | null> => {
    try {
      log(`  Logo poging: ${label}`)
      const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } })
      if (!res.ok) { log(`  ${label}: HTTP ${res.status}`, 'warn'); return null }
      const ct = res.headers.get('content-type') ?? ''
      if (!ct.includes('image') && !ct.includes('svg')) { log(`  ${label}: geen afbeelding (${ct})`, 'warn'); return null }
      const buf = Buffer.from(await res.arrayBuffer())
      if (buf.length < 500) { log(`  ${label}: te klein (${buf.length} bytes)`, 'warn'); return null }
      const mime = ct.split(';')[0].trim() || 'image/png'
      log(`  ${label}: ${(buf.length / 1024).toFixed(1)}KB ✓`, 'ok')
      return `data:${mime};base64,${buf.toString('base64')}`
    } catch (e: any) {
      log(`  ${label}: ${e.message}`, 'warn')
      return null
    }
  }

  // 1. Clearbit
  const clearbit = await tryFetch(`https://logo.clearbit.com/${domain}?size=300`, 'Clearbit')
  if (clearbit) return clearbit

  // 2. logo.dev (gratis tier)
  const logoDev = await tryFetch(`https://img.logo.dev/${domain}?token=pk_free&size=200&format=png`, 'logo.dev')
  if (logoDev) return logoDev

  // 3. Favicone (grotere favicon)
  const favicone = await tryFetch(`https://favicone.com/${domain}?s=256`, 'Favicone')
  if (favicone) return favicone

  // 4. Serper Google Image Search
  if (serperKey && brandName) {
    log(`  Serper: zoeken naar "${brandName} logo transparent"…`)
    try {
      const serperRes = await fetch('https://google.serper.dev/images', {
        method: 'POST',
        headers: { 'X-API-KEY': serperKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ q: `${brandName} logo transparent PNG`, num: 5 }),
      })
      if (serperRes.ok) {
        const serperJson = await serperRes.json() as { images?: Array<{ imageUrl: string; title: string }> }
        const candidates = (serperJson.images ?? []).filter(img =>
          img.imageUrl.match(/\.(png|svg|webp)/i) &&
          (img.title.toLowerCase().includes('logo') || img.imageUrl.toLowerCase().includes('logo'))
        )
        for (const candidate of candidates.slice(0, 3)) {
          log(`  Serper kandidaat: ${candidate.imageUrl.slice(0, 80)}`)
          const found = await tryFetch(candidate.imageUrl, 'Serper result')
          if (found) return found
        }
      }
    } catch (e: any) {
      log(`  Serper mislukt: ${e.message}`, 'warn')
    }
  }

  log(`  Alle logo-bronnen uitgeput voor ${domain}`, 'warn')
  return null
}

export async function cropLogoFromImage(
  imageBuf: Buffer,
  bbox: BBox,
  width: number,
  height: number,
  log: LogFn,
): Promise<string> {
  const left = Math.max(0, Math.floor(bbox.x * width))
  const top = Math.max(0, Math.floor(bbox.y * height))
  const cropW = Math.min(width - left, Math.ceil(bbox.w * width))
  const cropH = Math.min(height - top, Math.ceil(bbox.h * height))
  log(`  Logo uitsnijden: ${left},${top} ${cropW}×${cropH}px`)
  const buf = await sharp(imageBuf).extract({ left, top, width: cropW, height: cropH }).png().toBuffer()
  return `data:image/png;base64,${buf.toString('base64')}`
}

export async function generateLogoSvg(
  logoDataUrl: string,
  brandName: string | null,
  jwt: string,
  log: LogFn,
): Promise<string | null> {
  log(`  SVG genereren voor: ${brandName ?? 'logo'}…`)
  try {
    const res = await callOpenRouter({
      model: 'anthropic/claude-sonnet-4-6',
      messages: [{ role: 'user', content: [
        { type: 'text', text: `Maak een nauwkeurige SVG na van dit logo. Gebruik exacte kleuren en verhoudingen. Retourneer ALLEEN de SVG-code, geen uitleg, geen markdown. Begin direct met <svg.` },
        { type: 'image_url', image_url: { url: logoDataUrl } },
      ]}],
      temperature: 0,
    }, jwt)
    if (!res.ok) { log(`  SVG generatie mislukt: ${res.status}`, 'warn'); return null }
    const json = await res.json() as { choices: Array<{ message: { content: string } }> }
    const content = json.choices[0].message.content.trim()
    const svgMatch = content.match(/<svg[\s\S]*<\/svg>/i)
    if (!svgMatch) { log(`  Geen SVG in response`, 'warn'); return null }
    const svg = svgMatch[0]
    const dataUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
    log(`  SVG gegenereerd: ${(svg.length / 1024).toFixed(1)}KB`, 'ok')
    return dataUrl
  } catch (e: any) {
    log(`  SVG generatie fout: ${e.message}`, 'warn')
    return null
  }
}

export async function removeLogoBackground(
  logoDataUrl: string,
  jwt: string,
  log: LogFn,
): Promise<string> {
  log(`  Achtergrond verwijderen via fal.ai proxy…`)

  const b64 = logoDataUrl.replace(/^data:[^;]+;base64,/, '')

  const result = await callFalProxy('fal-ai/birefnet', {
    image_base64: b64,
    image_mime_type: 'image/png',
    model: 'General Use (Light)',
  }, jwt) as { image?: { url: string } }

  const resultUrl = result.image?.url
  if (!resultUrl) throw new Error('fal.ai background removal gaf geen resultaat')

  const imgRes = await fetch(resultUrl)
  const buf = Buffer.from(await imgRes.arrayBuffer())
  log(`  Achtergrond verwijderd: ${(buf.length / 1024).toFixed(1)}KB`, 'ok')
  return `data:image/png;base64,${buf.toString('base64')}`
}

/** Vraag Claude welke kandidaat het best overeenkomt met het gecropte logo. */
async function selectBestLogoMatch(
  croppedDataUrl: string,
  candidates: Array<{ dataUrl: string; source: string }>,
  jwt: string,
  log: LogFn,
): Promise<{ dataUrl: string; source: string } | null> {
  if (candidates.length === 0) return null
  if (candidates.length === 1) {
    log(`  Slechts 1 kandidaat — geen vergelijking nodig`)
    return candidates[0]
  }

  log(`  Visuele vergelijking: ${candidates.length} kandidaten vs originele uitsnede…`)

  const content: any[] = [
    { type: 'text', text: `Hieronder zie je eerst het ORIGINELE logo zoals het in de advertentie staat, gevolgd door ${candidates.length} kandidaat-logo's die online gevonden zijn.\n\nWelke kandidaat lijkt het meest op het origineel qua vormen, verhoudingen en algehele compositie? Kleur mag afwijken (merklogo's bestaan in meerdere kleurvarianten). Geef alleen het nummer van de beste match (1, 2, 3, ...), niets anders.` },
    { type: 'text', text: 'ORIGINEEL (uit de advertentie):' },
    { type: 'image_url', image_url: { url: croppedDataUrl } },
  ]
  candidates.forEach((c, i) => {
    content.push({ type: 'text', text: `KANDIDAAT ${i + 1} (bron: ${c.source}):` })
    content.push({ type: 'image_url', image_url: { url: c.dataUrl } })
  })

  try {
    const res = await callOpenRouter({
      model: 'anthropic/claude-sonnet-4-6',
      messages: [{ role: 'user', content }],
      temperature: 0,
      max_tokens: 10,
    }, jwt)
    if (!res.ok) { log(`  Vergelijking mislukt: ${res.status}`, 'warn'); return candidates[0] }
    const json = await res.json() as { choices: Array<{ message: { content: string } }> }
    const answer = json.choices[0].message.content.trim()
    const match = answer.match(/\d+/)
    const idx = match ? parseInt(match[0]) - 1 : 0
    const chosen = candidates[Math.max(0, Math.min(idx, candidates.length - 1))]
    log(`  Claude kiest kandidaat ${idx + 1} (${chosen.source})`, 'ok')
    return chosen
  } catch (e: any) {
    log(`  Vergelijking fout: ${e.message} — gebruik eerste kandidaat`, 'warn')
    return candidates[0]
  }
}

export async function resolveLogoSource(
  seg: LogoSegment,
  imageBuf: Buffer,
  width: number,
  height: number,
  jwt: string,
  serperKey: string | null,
  log: LogFn,
): Promise<ResolvedLogo> {
  log(`── Logo-protocol: ${seg.brandName ?? 'onbekend'} (${seg.logoType}, ${seg.colorCount} kleuren) ──`, 'section')

  // Altijd eerst uitsnijden als referentie voor visuele vergelijking
  const cropped = await cropLogoFromImage(imageBuf, seg.bbox, width, height, log)

  // Verzamel online kandidaten
  const candidates: Array<{ dataUrl: string; source: string }> = []

  if (seg.domain || seg.brandName) {
    const sources = [
      seg.domain ? `https://logo.clearbit.com/${seg.domain}?size=300` : null,
      seg.domain ? `https://img.logo.dev/${seg.domain}?token=pk_free&size=200&format=png` : null,
      seg.domain ? `https://favicone.com/${seg.domain}?s=256` : null,
    ].filter(Boolean) as string[]

    for (const url of sources) {
      const label = url.includes('clearbit') ? 'Clearbit' : url.includes('logo.dev') ? 'logo.dev' : 'Favicone'
      try {
        const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } })
        if (!res.ok) continue
        const ct = res.headers.get('content-type') ?? ''
        if (!ct.includes('image') && !ct.includes('svg')) continue
        const buf = Buffer.from(await res.arrayBuffer())
        if (buf.length < 500) continue
        const mime = ct.split(';')[0].trim() || 'image/png'
        candidates.push({ dataUrl: `data:${mime};base64,${buf.toString('base64')}`, source: label })
        log(`  ${label}: ${(buf.length / 1024).toFixed(1)}KB ✓`)
      } catch { /* skip */ }
    }

    // Serper: zoek naar volledige logo (icon + woordmerk)
    if (serperKey && seg.brandName) {
      log(`  Serper: zoeken naar volledige logo met woordmerk…`)
      try {
        const queries = [
          `${seg.brandName} logo`,
          `${seg.brandName} logo transparent`,
          seg.domain ? `${seg.brandName} logo site:${seg.domain}` : null,
        ].filter(Boolean) as string[]

        for (const q of queries) {
          const serperRes = await fetch('https://google.serper.dev/images', {
            method: 'POST',
            headers: { 'X-API-KEY': serperKey, 'Content-Type': 'application/json' },
            body: JSON.stringify({ q, num: 8 }),
          })
          if (!serperRes.ok) continue
          const serperJson = await serperRes.json() as { images?: Array<{ imageUrl: string }> }
          for (const img of (serperJson.images ?? []).slice(0, 5)) {
            if (!img.imageUrl.match(/\.(png|svg|webp|jpg)/i)) continue
            try {
              const r = await fetch(img.imageUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } })
              if (!r.ok) continue
              const ct = r.headers.get('content-type') ?? ''
              if (!ct.includes('image')) continue
              const buf = Buffer.from(await r.arrayBuffer())
              if (buf.length < 1000) continue
              candidates.push({ dataUrl: `data:image/png;base64,${buf.toString('base64')}`, source: `Serper(${q.slice(0, 30)})` })
              log(`  Serper kandidaat gevonden: ${img.imageUrl.slice(0, 60)}`)
            } catch { /* skip */ }
          }
          if (candidates.length >= 4) break
        }
      } catch (e: any) {
        log(`  Serper mislukt: ${e.message}`, 'warn')
      }
    }
  }

  const cssFilter = colorToCssFilter(seg.dominantColor ?? '#000000')
  log(`  Logo doelkleur: ${seg.dominantColor} → CSS filter: ${cssFilter}`)

  // Trim-helper: verwijder witte/transparante randen rondom het logo
  const trimLogo = async (dataUrl: string): Promise<string> => {
    try {
      const buf = Buffer.from(dataUrl.replace(/^data:[^;]+;base64,/, ''), 'base64')
      const trimmed = await sharp(buf).trim({ background: '#ffffff', threshold: 20 }).png().toBuffer()
      log(`  Logo getrimd: ${(buf.length / 1024).toFixed(1)}KB → ${(trimmed.length / 1024).toFixed(1)}KB`)
      return `data:image/png;base64,${trimmed.toString('base64')}`
    } catch {
      return dataUrl
    }
  }

  // Visuele vergelijking: welke online kandidaat lijkt het meest op het origineel?
  if (candidates.length > 0) {
    const topCandidates = candidates.slice(0, 3)
    log(`  ${candidates.length} kandidaat(en) gevonden — top ${topCandidates.length} visueel vergelijken…`)
    const best = await selectBestLogoMatch(cropped, topCandidates, jwt, log)
    if (best) {
      const trimmed = await trimLogo(best.dataUrl)
      return { dataUrl: trimmed, method: 'clearbit', isSvg: false, cssFilter }
    }
  }

  log(`  Geen online match gevonden — achtergrond verwijderen van uitsnede`)

  try {
    const clean = await removeLogoBackground(cropped, jwt, log)
    const trimmed = await trimLogo(clean)
    return { dataUrl: trimmed, method: 'bg-removed', isSvg: false, cssFilter }
  } catch (e: any) {
    log(`  Background removal mislukt: ${e.message}`, 'warn')
  }

  // Absolute fallback: gewone uitsnede
  log(`  Fallback: uitsnede zonder bewerking`)
  return { dataUrl: cropped, method: 'crop-fallback', isSvg: false, cssFilter }
}

// ── HTML assembler ─────────────────────────────────────────────────────────────

export async function assembleHtml(
  analysis: AdAnalysis,
  cleanBgDataUrl: string,
  resolvedLogos: Map<number, ResolvedLogo>,
  log: LogFn,
  installedFonts: Set<string> = new Set(),
  typekitId: string | null = null,
): Promise<{ html: string; fontWarnings: string[] }> {
  log('── HTML assemblen ──', 'section')
  if (installedFonts.size > 0) {
    log(`  Geïnstalleerde fonts beschikbaar: ${installedFonts.size}`)
  }

  const { width, height, background, textSegments, logoSegments } = analysis
  const fontWarnings: string[] = []

  // Font-resolutie per tekst-segment
  const resolutions = textSegments.map((s) => resolveFont(s, log, installedFonts, typekitId))

  // Verzamel font-waarschuwingen — alleen als font NIET geïnstalleerd/beschikbaar is
  resolutions.forEach((r, i) => {
    const s = textSegments[i]
    if (r.usedSource !== 'system' && r.usedSource !== 'adobe') {
      if (r.likelyRealSource === 'paid') {
        fontWarnings.push(`"${s.content.slice(0, 30)}" gebruikt waarschijnlijk ${r.likelyRealFont} (betaald font) — backup: ${r.usedFamily}`)
      } else if (r.likelyRealSource === 'adobe') {
        fontWarnings.push(`"${s.content.slice(0, 30)}" gebruikt waarschijnlijk ${r.likelyRealFont} (Adobe Fonts) — backup: ${r.usedFamily}`)
      }
    }
  })

  // Font links: Typekit embed + Google Fonts (alleen families die niet lokaal beschikbaar zijn)
  const typekitLink = typekitId
    ? `<link rel="stylesheet" href="https://use.typekit.net/${typekitId}.css">`
    : ''
  const googleFamilies = [...new Set(
    resolutions
      .filter(r => r.usedSource === 'google')
      .map(r => r.usedFamily.replace(/ /g, '+'))
  )]
  const googleLink = googleFamilies.length
    ? `<link href="https://fonts.googleapis.com/css2?${googleFamilies.map(f => `family=${f}:wght@300;400;600;700;900`).join('&')}&display=swap" rel="stylesheet">`
    : ''
  const fontLink = [typekitLink, googleLink].filter(Boolean).join('\n')

  const toAbsPx = (bbox: BBox) => ({
    left: Math.round(bbox.x * width),
    top: Math.round(bbox.y * height),
    w: Math.round(bbox.w * width),
    h: Math.round(bbox.h * height),
  })

  const isImageBg = background.type === 'photo' || background.type === 'illustration'
  const bgCss = isImageBg
    ? ''
    : background.type === 'gradient'
      ? `background: ${background.cssValue};`
      : `background: ${background.cssValue ?? '#ffffff'};`

  const textCss = textSegments.map((s, i) => {
    const p = toAbsPx(s.bbox)
    const r = resolutions[i]
    // Gebruik visualLines van Claude (nauwkeuriger) met fallback op \n-telling
    const lineCount = s.visualLines ?? ((s.content.match(/\n/g) ?? []).length + 1)
    const bboxFontSize = Math.round((p.h / lineCount) * 0.78)
    const whiteSpace = lineCount === 1 ? 'nowrap' : 'pre-line'
    log(`  tekst[${i}] bbox→fontsize: hoogte ${p.h}px / ${lineCount} regels × 0.78 = ${bboxFontSize}px | white-space: ${whiteSpace}`)
    return `.t${i}{position:absolute;left:${p.left}px;top:${p.top}px;width:${p.w}px;height:${p.h}px;overflow:visible;` +
      `font-family:${r.cssFontFamily};font-weight:${s.fontWeight};font-size:${bboxFontSize}px;` +
      `color:${s.color};letter-spacing:${s.letterSpacing};line-height:${s.lineHeight};` +
      `text-align:${s.textAlign};white-space:${whiteSpace};}`
  }).join('\n')

  const logoCss = logoSegments.map((s, i) => {
    const p = toAbsPx(s.bbox)
    const resolved = resolvedLogos.get(i)
    const filter = resolved?.cssFilter ? `filter:${resolved.cssFilter};` : ''
    return `.l${i}{position:absolute;left:${p.left}px;top:${p.top}px;width:${p.w}px;height:auto;display:block;max-height:${p.h * 2}px;${filter}}`
  }).join('\n')

  const textHtml = textSegments.map((s, i) =>
    `  <div class="t${i}">${s.content.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</div>`
  ).join('\n')

  const logoHtml = logoSegments.map((s, i) => {
    const resolved = resolvedLogos.get(i)
    if (!resolved) return ''
    const tag = resolved.isSvg
      ? `  <img class="l${i}" src="${resolved.dataUrl}" alt="${s.brandName ?? 'logo'}"/>`
      : `  <img class="l${i}" src="${resolved.dataUrl}" alt="${s.brandName ?? 'logo'}"/>`
    return tag
  }).filter(Boolean).join('\n')

  // Font-comment voor transparantie
  const fontComments = fontWarnings.map(w => `  <!-- FONT: ${w} -->`).join('\n')

  const bgImageCss = `.bg{position:absolute;left:0;top:0;width:${width}px;height:${height}px;object-fit:cover;}`
  const bgImageHtml = isImageBg
    ? `  <img class="bg" src="${cleanBgDataUrl}" alt="Achtergrond"/>`
    : ''

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
${fontLink}
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{width:${width}px;height:${height}px;overflow:hidden;position:relative;${bgCss}}
${isImageBg ? bgImageCss : ''}
${textCss}
${logoCss}
</style>
</head>
<body>
${fontComments}
${bgImageHtml}
${textHtml}
${logoHtml}
</body>
</html>`

  log(`HTML: ${(html.length / 1024).toFixed(1)}KB, ${textSegments.length} tekst, ${resolvedLogos.size} logo('s)`, 'ok')
  fontWarnings.forEach(w => log(`  ⚠ ${w}`, 'warn'))
  return { html, fontWarnings }
}
