import type { AtelierCreationType } from '../components/AtelierCreationModeButtons'

export type AtelierIntentStatus = 'ready' | 'needs_clarification' | 'chat'

export interface AtelierIntent {
  type: AtelierCreationType
  subject: string
  theme?: string
  templateName?: string
  formatHints: string[]
  pageCount?: number
  rawPrompt: string
  missing: Array<'type' | 'subject' | 'theme'>
  status: AtelierIntentStatus
  relevant: boolean
  clarification?: string
}

const TYPE_PATTERNS: Array<{ type: AtelierCreationType; patterns: RegExp[] }> = [
  { type: 'presentation', patterns: [/\bpresentatie\b/i, /\bdeck\b/i, /\bslides?\b/i, /\bkeynote\b/i, /\bpptx?\b/i] },
  { type: 'banners', patterns: [/\bbanners?\b/i, /\bbannerset\b/i, /\badvertentie\s?banner\b/i, /\bdisplay ad\b/i] },
  { type: 'print', patterns: [/\bprint\b/i, /\ba4\b/i, /\bflyer\b/i, /\bposter\b/i, /\badvertentie\b/i] },
  { type: 'images', patterns: [/\bafbeelding\b/i, /\bbeeld\b/i, /\bimage\b/i, /\bfoto\b/i, /\billustratie\b/i] },
  { type: 'video', patterns: [/\bvideo\b/i, /\bclip\b/i, /\breel\b/i, /\banimatie\b/i] },
]

const THEME_PATTERNS = [
  /\bin de stijl van\s+(.+)$/i,
  /\bin stijl van\s+(.+)$/i,
  /\bstijl\s+(.+)$/i,
  /\btheme\s+(.+)$/i,
  /\bthema\s+(.+)$/i,
  /\btemplate\s+(.+)$/i,
]

const SUBJECT_PATTERNS = [
  /\bover\s+(.+?)(?=\s+in de stijl van|\s+in stijl van|\s+stijl\s+|\s+theme\s+|\s+thema\s+|\s+template\s+|$)/i,
  /\bvoor\s+(.+?)(?=\s+in de stijl van|\s+in stijl van|\s+stijl\s+|\s+theme\s+|\s+thema\s+|\s+template\s+|$)/i,
]

const CREATION_ACTION_PATTERNS = [
  /\b(maak|maken|genereer|genereer|ontwerp|bouw|creeer|creëer|produceer|zet)\b/i,
  /\b(ik wil|kun je|kan je|laten we|we moeten)\b/i,
  /\b(style|stijl|thema|template|campagne|concept|deck|set)\b/i,
]

const GENERAL_CHAT_PATTERNS = [
  /\b(hoi|hallo|hey|dank|thanks|hoe gaat|wat kun je|wie ben je)\b/i,
  /\b(leg uit|wat betekent|waarom|hoe werkt)\b/i,
]

export function parseAtelierIntent(
  prompt: string,
  fallbackType?: AtelierCreationType | null,
  previousIntent?: AtelierIntent | null,
): AtelierIntent {
  const rawPrompt = prompt.trim()
  const detectedType = detectType(rawPrompt)
  const relevant = isAtelierRelevant(rawPrompt, detectedType, fallbackType, previousIntent)
  const type = detectedType ?? previousIntent?.type ?? fallbackType ?? 'presentation'
  const theme = mergeTheme(cleanCapturedValue(matchFirst(rawPrompt, THEME_PATTERNS)), rawPrompt, previousIntent)
  const subject = mergeSubject(cleanSubject(rawPrompt, type), rawPrompt, previousIntent)
  const formatHints = detectFormatHints(rawPrompt)
  const pageCount = detectPageCount(rawPrompt) ?? previousIntent?.pageCount
  const missing: AtelierIntent['missing'] = []

  if (!relevant) {
    return {
      type,
      subject,
      theme,
      templateName: theme,
      formatHints,
      pageCount,
      rawPrompt,
      missing,
      relevant: false,
      status: 'chat',
    }
  }

  if (!type) missing.push('type')
  if (!subject) missing.push('subject')
  // Thema/template is een creatieve voorkeur, geen blokkade. Als het ontbreekt,
  // mag AI zelf een passende richting kiezen.

  return {
    type,
    subject,
    theme: theme || previousIntent?.theme,
    templateName: theme || previousIntent?.templateName,
    formatHints,
    pageCount,
    rawPrompt,
    missing,
    relevant: true,
    status: missing.length > 0 ? 'needs_clarification' : 'ready',
    clarification: buildClarification(type, missing),
  }
}

export function findClientByTemplateHint<T extends { id: string; name: string }>(clients: T[], hint?: string): T | undefined {
  const normalizedHint = normalize(hint ?? '')
  if (!normalizedHint) return undefined
  return clients.find((client) => {
    const normalizedName = normalize(client.name)
    return normalizedName.includes(normalizedHint) || normalizedHint.includes(normalizedName)
  })
}

function detectType(prompt: string): AtelierCreationType | undefined {
  return TYPE_PATTERNS.find((item) => item.patterns.some((pattern) => pattern.test(prompt)))?.type
}

function isAtelierRelevant(
  prompt: string,
  detectedType?: AtelierCreationType,
  fallbackType?: AtelierCreationType | null,
  previousIntent?: AtelierIntent | null,
): boolean {
  if (!prompt.trim()) return false
  if (previousIntent?.status === 'needs_clarification') return true
  if (detectedType) return true
  if (fallbackType && CREATION_ACTION_PATTERNS.some((pattern) => pattern.test(prompt))) return true
  if (GENERAL_CHAT_PATTERNS.some((pattern) => pattern.test(prompt))) return false
  return false
}

function cleanSubject(prompt: string, type: AtelierCreationType): string {
  const captured = cleanCapturedValue(matchFirst(prompt, SUBJECT_PATTERNS))
  if (captured) return captured

  let value = prompt
  TYPE_PATTERNS.find((item) => item.type === type)?.patterns.forEach((pattern) => {
    value = value.replace(pattern, '')
  })
  THEME_PATTERNS.forEach((pattern) => {
    value = value.replace(pattern, '')
  })
  return cleanCapturedValue(value)
}

function mergeSubject(subject: string, prompt: string, previousIntent?: AtelierIntent | null): string {
  if (subject) return subject
  if (previousIntent?.status === 'needs_clarification' && previousIntent.missing.includes('subject')) {
    return cleanCapturedValue(prompt)
  }
  return previousIntent?.subject ?? ''
}

function mergeTheme(theme: string, prompt: string, previousIntent?: AtelierIntent | null): string {
  if (theme) return theme
  if (userDeclinedTheme(prompt)) return ''
  if (previousIntent?.status === 'needs_clarification' && previousIntent.missing.includes('theme')) {
    return cleanCapturedValue(prompt.replace(/\bstijl\b/i, '').replace(/\bthema\b/i, '').replace(/\btemplate\b/i, ''))
  }
  return previousIntent?.theme ?? ''
}

function userDeclinedTheme(prompt: string): boolean {
  return /\b(geen|zonder|maakt niet uit|verzin|bedenk zelf|kies zelf|vrije stijl|geen thema|geen template)\b/i.test(prompt)
}

function detectFormatHints(prompt: string): string[] {
  const hints = new Set<string>()
  const lower = prompt.toLowerCase()
  if (/\ba4\b/.test(lower)) hints.add('a4')
  if (/\bposter\b/.test(lower)) hints.add('poster')
  if (/\binstagram\b/.test(lower)) hints.add('instagram')
  if (/\blinkedin\b/.test(lower)) hints.add('linkedin')
  if (/\bdisplay\b|\biab\b/.test(lower)) hints.add('display')
  return [...hints]
}

function detectPageCount(prompt: string): number | undefined {
  const match = prompt.match(/\b(\d{1,2})\s*(pagina'?s|slides?|sheets?|beelden|items)\b/i)
  if (!match?.[1]) return undefined
  const value = Number(match[1])
  if (!Number.isFinite(value)) return undefined
  return Math.min(30, Math.max(1, value))
}

function matchFirst(prompt: string, patterns: RegExp[]): string {
  for (const pattern of patterns) {
    const match = prompt.match(pattern)
    if (match?.[1]) return match[1]
  }
  return ''
}

function cleanCapturedValue(value: string): string {
  return value
    .replace(/[?.!,;:]+$/g, '')
    .replace(/^(een|de|het)\s+/i, '')
    .trim()
}

function normalize(value: string): string {
  return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()
}

function buildClarification(type: AtelierCreationType, missing: AtelierIntent['missing']): string | undefined {
  if (missing.includes('subject')) return 'Waar moet ik dit over maken?'
  if (missing.includes('theme')) {
    if (type === 'presentation') return 'Wil je dit in een specifiek thema of template?'
    if (type === 'banners') return 'Wil je de banners in een specifieke merkstijl of campagne-template?'
    if (type === 'print') return 'Wil je dit in een specifiek thema, merk of print-template?'
  }
  return undefined
}
