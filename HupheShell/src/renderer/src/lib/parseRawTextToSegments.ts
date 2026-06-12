/**
 * ============================================================
 *  parseRawTextToSegments.ts
 * ============================================================
 *  Pure TypeScript utility to convert raw text to labeled segments.
 *  Used by TextReviewModal in the Atelier flow.
 * ============================================================
 */

export type SageTagRole = string // e.g., 'Heading', 'Klantnaam', 'Datum', 'Bodycopy'

export interface TextSegment {
  id: string
  text: string
  role: SageTagRole | null // null = unlabeled (red in UI)
  source: 'auto' | 'manual'
}

/**
 * Detects file type based on extension.
 * .md -> 'markdown', everything else -> 'plain'
 */
export function detectFileType(filename: string): 'markdown' | 'plain' {
  if (filename.toLowerCase().endsWith('.md')) {
    return 'markdown'
  }
  return 'plain'
}

/**
 * Strips basic markdown syntax (#, ##, ###, **, _, `)
 */
function stripMarkdown(text: string): string {
  return text
    .replace(/^#+\s+/, '') // Strip leading # for headers
    .replace(/\*\*(.*?)\*\*/g, '$1') // Strip **bold**
    .replace(/__(.*?)__/g, '$1') // Strip __bold__
    .replace(/\*(.*?)\*/g, '$1') // Strip *italic*
    .replace(/_(.*?)_/g, '$1') // Strip _italic_
    .replace(/`(.*?)`/g, '$1') // Strip `code`
    .trim()
}

/**
 * Helper to check if a text has multiple sentences.
 */
function hasMultipleSentences(text: string): boolean {
  const sentences = text.split(/[.!?]\s+/).filter(Boolean)
  return sentences.length > 1
}

/**
 * Returns true for a short ALL CAPS line with no sentence punctuation.
 * Works for single-word headings like "FRIETZAAK" and short phrases like "OUD VROUWTJE".
 */
function isHeadingLine(line: string): boolean {
  const trimmed = line.trim()
  if (!trimmed) return false
  const words = trimmed.split(/\s+/).filter(Boolean)
  return (
    words.length >= 1 &&
    words.length <= 6 &&
    words.every((w) => /[A-Za-z]/.test(w) && w === w.toUpperCase()) &&
    !/[.!?,]/.test(trimmed)
  )
}

/**
 * Converts Markdown text into segments.
 */
export function parseMarkdownToSegments(text: string): TextSegment[] {
  const blocks = text.split(/\n\s*\n/).filter((b) => b.trim().length > 0)
  const segments: TextSegment[] = []
  let counter = 0

  for (const block of blocks) {
    const raw = block.trim()
    let role: SageTagRole | null = null
    const cleanText = stripMarkdown(raw)

    if (raw.startsWith('# ')) {
      role = 'Heading'
    } else if (raw.startsWith('## ') || raw.startsWith('### ')) {
      role = 'Subheading'
    } else if (raw.startsWith('**')) {
      role = 'Subheading'
    } else if (raw.length > 60 || hasMultipleSentences(raw)) {
      role = 'Bodycopy'
    } else if (raw.length <= 60) {
      const hasNoPrefix = !raw.startsWith('#') && !raw.startsWith('*') && !raw.startsWith('_') && !raw.startsWith('>')
      const hasNoPunctuation = !/[.!?]$/.test(raw)
      role = hasNoPrefix && hasNoPunctuation ? null : 'Bodycopy'
    } else {
      role = 'Bodycopy'
    }

    segments.push({ id: `seg-${counter++}`, text: cleanText, role, source: 'auto' })
  }

  return segments
}

/**
 * Converts Plain text into segments.
 * Handles patterns like:
 *   HEADING\nbody paragraph\n\nNEXT HEADING\nbody...
 * Also normalises Unicode line separators (U+2028 / U+2029) to regular newlines.
 */
export function parsePlainTextToSegments(text: string): TextSegment[] {
  // Normalise exotic line endings: U+2028 LINE SEP, U+2029 PARA SEP, bare \r
  const normalised = text
    .replace(new RegExp('[\u2028\u2029]', 'g'), '\n')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')

  // Split on one or more blank lines to get sections
  const blocks = normalised.split(/\n{2,}/).filter((b) => b.trim().length > 0)
  const segments: TextSegment[] = []
  let counter = 0

  for (const block of blocks) {
    const lines = block.split('\n').map((l) => l.trim()).filter(Boolean)
    if (lines.length === 0) continue

    const first = lines[0]
    const bodyLines = lines.slice(1)

    if (isHeadingLine(first)) {
      segments.push({ id: `seg-${counter++}`, text: first, role: 'Heading', source: 'auto' })
      const bodyText = bodyLines.join(' ').trim()
      if (bodyText) {
        segments.push({ id: `seg-${counter++}`, text: bodyText, role: 'Bodycopy', source: 'auto' })
      }
    } else {
      const fullText = lines.join(' ').trim()
      const role: SageTagRole | null =
        fullText.length > 60 || hasMultipleSentences(fullText) ? 'Bodycopy' : null
      segments.push({ id: `seg-${counter++}`, text: fullText, role, source: 'auto' })
    }
  }

  return segments
}
