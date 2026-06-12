/**
 * Google Fonts bibliotheek — curated lijst + laad-utilities.
 *
 * Gebruik:
 *   import { GOOGLE_FONTS, buildFontLinkTag, extractFontsFromHtml } from './google-fonts'
 *
 * Fonts worden on-demand geladen via de Google Fonts CDN.
 * De canvas-HTML wordt automatisch gescand op font-family waarden.
 */

export interface GoogleFont {
  family: string
  category: 'sans-serif' | 'serif' | 'display' | 'monospace' | 'handwriting'
  weights: number[]
}

export const GOOGLE_FONTS: GoogleFont[] = [
  // Sans-serif
  { family: 'Inter',            category: 'sans-serif',  weights: [300,400,500,600,700,800,900] },
  { family: 'Roboto',           category: 'sans-serif',  weights: [300,400,500,700,900] },
  { family: 'Open Sans',        category: 'sans-serif',  weights: [300,400,600,700,800] },
  { family: 'Lato',             category: 'sans-serif',  weights: [300,400,700,900] },
  { family: 'Montserrat',       category: 'sans-serif',  weights: [300,400,500,600,700,800,900] },
  { family: 'Poppins',          category: 'sans-serif',  weights: [300,400,500,600,700,800,900] },
  { family: 'Nunito',           category: 'sans-serif',  weights: [300,400,600,700,800,900] },
  { family: 'Raleway',          category: 'sans-serif',  weights: [300,400,500,600,700,800,900] },
  { family: 'Ubuntu',           category: 'sans-serif',  weights: [300,400,500,700] },
  { family: 'Oswald',           category: 'sans-serif',  weights: [300,400,500,600,700] },
  { family: 'Barlow',           category: 'sans-serif',  weights: [300,400,500,600,700,800,900] },
  { family: 'DM Sans',          category: 'sans-serif',  weights: [300,400,500,700] },
  { family: 'Figtree',          category: 'sans-serif',  weights: [300,400,500,600,700,800,900] },
  { family: 'Plus Jakarta Sans',category: 'sans-serif',  weights: [300,400,500,600,700,800] },
  { family: 'Outfit',           category: 'sans-serif',  weights: [300,400,500,600,700,800,900] },
  { family: 'Syne',             category: 'sans-serif',  weights: [400,500,600,700,800] },
  { family: 'Space Grotesk',    category: 'sans-serif',  weights: [300,400,500,600,700] },
  { family: 'Bricolage Grotesque', category: 'sans-serif', weights: [400,500,600,700,800] },
  { family: 'Manrope',          category: 'sans-serif',  weights: [300,400,500,600,700,800] },
  { family: 'Mulish',           category: 'sans-serif',  weights: [300,400,500,600,700,800,900] },
  { family: 'Work Sans',        category: 'sans-serif',  weights: [300,400,500,600,700,800,900] },
  { family: 'Nunito Sans',      category: 'sans-serif',  weights: [300,400,600,700,800,900] },
  { family: 'Source Sans 3',    category: 'sans-serif',  weights: [300,400,600,700,900] },
  { family: 'Noto Sans',        category: 'sans-serif',  weights: [300,400,500,700] },
  { family: 'Jost',             category: 'sans-serif',  weights: [300,400,500,600,700,800,900] },
  { family: 'Lexend',           category: 'sans-serif',  weights: [300,400,500,600,700,800,900] },
  { family: 'Be Vietnam Pro',   category: 'sans-serif',  weights: [300,400,500,600,700,800,900] },
  { family: 'IBM Plex Sans',    category: 'sans-serif',  weights: [300,400,500,600,700] },
  { family: 'Rubik',            category: 'sans-serif',  weights: [300,400,500,600,700,800,900] },
  { family: 'Karla',            category: 'sans-serif',  weights: [300,400,500,600,700,800] },
  { family: 'Exo 2',            category: 'sans-serif',  weights: [300,400,500,600,700,800,900] },

  // Serif
  { family: 'Playfair Display', category: 'serif',       weights: [400,500,600,700,800,900] },
  { family: 'Merriweather',     category: 'serif',       weights: [300,400,700,900] },
  { family: 'Lora',             category: 'serif',       weights: [400,500,600,700] },
  { family: 'PT Serif',         category: 'serif',       weights: [400,700] },
  { family: 'Crimson Text',     category: 'serif',       weights: [400,600,700] },
  { family: 'EB Garamond',      category: 'serif',       weights: [400,500,600,700,800] },
  { family: 'Libre Baskerville',category: 'serif',       weights: [400,700] },
  { family: 'Cormorant Garamond',category:'serif',       weights: [300,400,500,600,700] },
  { family: 'Spectral',         category: 'serif',       weights: [300,400,500,600,700,800] },
  { family: 'Noto Serif',       category: 'serif',       weights: [400,700] },
  { family: 'DM Serif Display', category: 'serif',       weights: [400] },
  { family: 'Fraunces',         category: 'serif',       weights: [300,400,500,600,700,800,900] },
  { family: 'Bitter',           category: 'serif',       weights: [300,400,500,600,700,800,900] },
  { family: 'Cardo',            category: 'serif',       weights: [400,700] },
  { family: 'Domine',           category: 'serif',       weights: [400,500,600,700] },

  // Display / decoratief
  { family: 'Anton',            category: 'display',     weights: [400] },
  { family: 'Bebas Neue',       category: 'display',     weights: [400] },
  { family: 'Black Han Sans',   category: 'display',     weights: [400] },
  { family: 'Archivo Black',    category: 'display',     weights: [400] },
  { family: 'Abril Fatface',    category: 'display',     weights: [400] },
  { family: 'Righteous',        category: 'display',     weights: [400] },
  { family: 'Secular One',      category: 'display',     weights: [400] },
  { family: 'Teko',             category: 'display',     weights: [300,400,500,600,700] },
  { family: 'Passion One',      category: 'display',     weights: [400,700,900] },
  { family: 'Big Shoulders Display', category: 'display',weights: [300,400,500,600,700,800,900] },
  { family: 'Fjalla One',       category: 'display',     weights: [400] },
  { family: 'Russo One',        category: 'display',     weights: [400] },
  { family: 'Barlow Condensed', category: 'display',     weights: [300,400,500,600,700,800,900] },
  { family: 'Acme',             category: 'display',     weights: [400] },
  { family: 'Alfa Slab One',    category: 'display',     weights: [400] },

  // Handwriting / Script
  { family: 'Dancing Script',   category: 'handwriting', weights: [400,500,600,700] },
  { family: 'Pacifico',         category: 'handwriting', weights: [400] },
  { family: 'Caveat',           category: 'handwriting', weights: [400,500,600,700] },
  { family: 'Sacramento',       category: 'handwriting', weights: [400] },
  { family: 'Satisfy',          category: 'handwriting', weights: [400] },
  { family: 'Great Vibes',      category: 'handwriting', weights: [400] },
  { family: 'Allura',           category: 'handwriting', weights: [400] },
  { family: 'Kaushan Script',   category: 'handwriting', weights: [400] },
  { family: 'Lobster',          category: 'handwriting', weights: [400] },
  { family: 'Pinyon Script',    category: 'handwriting', weights: [400] },
  { family: 'Alex Brush',       category: 'handwriting', weights: [400] },

  // Monospace
  { family: 'Space Mono',       category: 'monospace',   weights: [400,700] },
  { family: 'IBM Plex Mono',    category: 'monospace',   weights: [300,400,500,700] },
  { family: 'Roboto Mono',      category: 'monospace',   weights: [300,400,500,700] },
  { family: 'Source Code Pro',  category: 'monospace',   weights: [300,400,500,700] },
  { family: 'Fira Code',        category: 'monospace',   weights: [300,400,500,700] },
  { family: 'JetBrains Mono',   category: 'monospace',   weights: [300,400,500,700,800] },
]

/** Systeemfonts die NIET via Google geladen worden */
const SYSTEM_FONTS = new Set([
  'Arial', 'Helvetica', 'Times New Roman', 'Times', 'Courier New', 'Courier',
  'Verdana', 'Georgia', 'Palatino', 'Garamond', 'Bookman', 'Comic Sans MS',
  'Trebuchet MS', 'Impact', 'Lucida Sans', 'Tahoma', 'Geneva',
  '-apple-system', 'BlinkMacSystemFont', 'system-ui', 'sans-serif', 'serif',
  'monospace', 'cursive', 'fantasy', 'inherit', 'initial', 'unset',
])

const FONT_FAMILIES = new Set(GOOGLE_FONTS.map(f => f.family.toLowerCase()))

/**
 * Bouw een Google Fonts <link> tag voor een of meer families.
 * Weights worden automatisch opgehaald uit de GOOGLE_FONTS lijst.
 */
export function buildFontLinkTag(families: string[]): string {
  if (families.length === 0) return ''
  const params = families.map(family => {
    const font = GOOGLE_FONTS.find(f => f.family.toLowerCase() === family.toLowerCase())
    const weights = font?.weights ?? [400, 700]
    const weightStr = `wght@${weights.join(';')}`
    return `family=${encodeURIComponent(family)}:${weightStr}`
  })
  return `<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://fonts.googleapis.com/css2?${params.join('&')}&display=swap">`
}

/**
 * Scan HTML op font-family waarden en geef de Google Fonts terug die erin staan.
 */
export function extractFontsFromHtml(html: string): string[] {
  const found = new Set<string>()
  const regex = /font-family:\s*['"]?([^;,'"}\n]+)/gi
  let m: RegExpExecArray | null
  while ((m = regex.exec(html)) !== null) {
    const raw = m[1].trim().replace(/['"]/g, '')
    const families = raw.split(',').map(f => f.trim().replace(/['"]/g, ''))
    for (const f of families) {
      if (!SYSTEM_FONTS.has(f) && FONT_FAMILIES.has(f.toLowerCase())) {
        found.add(f)
      }
    }
  }
  return [...found]
}

/**
 * Geef de URL terug voor een font-preview afbeelding via Google Fonts CSS.
 * Gebruik dit om een klein stukje tekst te renderen in het correcte font.
 */
export function fontPreviewUrl(family: string): string {
  return `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@400&display=block&text=AaBbCc`
}
