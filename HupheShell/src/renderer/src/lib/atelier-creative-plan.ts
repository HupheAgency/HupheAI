import type { TemplateData, TemplateLayout } from '../components/WebSlidePreview'
import type { AtelierIntent } from './atelier-intent'

export type CreativeSlidePurpose = 'cover' | 'story' | 'visual' | 'quote' | 'data' | 'closing'

export interface TemplateLayoutProfile {
  name: string
  textCount: number
  imageCount: number
  hasImage: boolean
  hasLargeText: boolean
  hasBodyText: boolean
  hasTable: boolean
  roles: string[]
  score: number
}

export interface AtelierCreativePlan {
  subject: string
  intentType: AtelierIntent['type']
  styleDirection: string
  templateName?: string
  rationale: string
  layoutProfiles: TemplateLayoutProfile[]
  slides: Array<{
    purpose: CreativeSlidePurpose
    layoutName?: string
    headline: string
    body?: string
    visualPrompt?: string
  }>
}

export function buildAtelierCreativePlan(intent: AtelierIntent, templateData?: TemplateData | null): AtelierCreativePlan {
  const layoutProfiles = templateData ? analyzeTemplateLayouts(templateData) : []
  const styleDirection = intent.theme
    ? `Werk binnen de stijl van ${intent.theme}: gebruik de bestaande template-hiërarchie, kleuren, typografie en beeldvlakken als leidraad.`
    : inferStyleDirection(intent.subject)
  const bestCover = pickLayout(layoutProfiles, 'cover')
  const bestVisual = pickLayout(layoutProfiles, 'visual') ?? bestCover
  const bestStory = pickLayout(layoutProfiles, 'story') ?? bestCover
  const bestClosing = pickLayout(layoutProfiles, 'closing') ?? bestCover

  const slideCount = intent.pageCount ?? 4

  return {
    subject: intent.subject,
    intentType: intent.type,
    styleDirection,
    templateName: intent.templateName,
    rationale: buildRationale(intent, layoutProfiles),
    layoutProfiles,
    slides: buildCreativeSlides(intent, styleDirection, slideCount, {
      cover: bestCover?.name,
      story: bestStory?.name,
      visual: bestVisual?.name,
      closing: bestClosing?.name,
    }),
  }
}

export function summarizeCreativePlan(plan: AtelierCreativePlan): string {
  const layouts = plan.layoutProfiles.length > 0
    ? ` Ik zie ${plan.layoutProfiles.length} template-layout${plan.layoutProfiles.length === 1 ? '' : 's'} en kies automatisch de beste cover-, verhaal- en beeldlayouts.`
    : ' Zonder template kies ik zelf een passende visuele richting.'
  return `${plan.styleDirection}${layouts}`
}

function analyzeTemplateLayouts(templateData: TemplateData): TemplateLayoutProfile[] {
  return templateData.layouts
    .map((layout) => profileLayout(layout))
    .sort((a, b) => b.score - a.score)
}

function profileLayout(layout: TemplateLayout): TemplateLayoutProfile {
  const roles = layout.textItems.map((item) => item.role).filter(Boolean)
  const imageCount = layout.images.length + (layout.imageSlot || layout.imageFrame || layout.hasImageSageTag ? 1 : 0)
  const hasLargeText = layout.textItems.some((item) => (item.fontSize ?? 0) >= 36 || /title|heading|headline/i.test(item.role ?? ''))
  const hasBodyText = layout.textItems.some((item) => /body|copy|text|paragraph/i.test(item.role ?? ''))
  const hasTable = Boolean(layout.keynoteTable)
  return {
    name: layout.name,
    textCount: layout.textItems.length,
    imageCount,
    hasImage: imageCount > 0,
    hasLargeText,
    hasBodyText,
    hasTable,
    roles,
    score: (hasLargeText ? 3 : 0) + (imageCount > 0 ? 3 : 0) + (hasBodyText ? 2 : 0) + Math.min(layout.textItems.length, 4),
  }
}

function pickLayout(profiles: TemplateLayoutProfile[], purpose: CreativeSlidePurpose): TemplateLayoutProfile | undefined {
  if (profiles.length === 0) return undefined
  if (purpose === 'cover') return profiles.find((layout) => layout.hasLargeText && layout.hasImage) ?? profiles.find((layout) => layout.hasLargeText) ?? profiles[0]
  if (purpose === 'visual') return profiles.find((layout) => layout.hasImage) ?? profiles[0]
  if (purpose === 'data') return profiles.find((layout) => layout.hasTable) ?? profiles.find((layout) => layout.hasBodyText) ?? profiles[0]
  if (purpose === 'story') return profiles.find((layout) => layout.hasBodyText) ?? profiles[0]
  return profiles.find((layout) => layout.hasLargeText) ?? profiles[0]
}

function inferStyleDirection(subject: string): string {
  const normalized = subject.toLowerCase()
  if (/(universum|ruimte|planeet|sterren|kosmos|galaxy|space)/i.test(normalized)) {
    return 'Kies een kosmische, donkere en filmische stijl met diepe contrasten, grote visuals en korte verwonderende copy.'
  }
  if (/(western|cowboy|woestijn|sheriff|film|script|scenario)/i.test(normalized)) {
    return 'Kies een filmische western-stijl met warme stofkleuren, sterke typografie, scènegevoel en dramatische spanning.'
  }
  if (/(saas|software|platform|startup|pitch|b2b)/i.test(normalized)) {
    return 'Kies een strakke productpresentatie met rustige typografie, duidelijke hiërarchie en bewijsvoering.'
  }
  if (/(festival|muziek|event|feest|club)/i.test(normalized)) {
    return 'Kies een energieke event-stijl met uitgesproken kleur, ritme, grote titels en dynamische beeldkeuzes.'
  }
  return 'Kies een uitgesproken visuele richting die past bij het onderwerp, met duidelijke hiërarchie en variatie tussen tekst- en beeldslides.'
}

function buildRationale(intent: AtelierIntent, profiles: TemplateLayoutProfile[]): string {
  if (intent.theme) {
    return `Het gekozen thema "${intent.theme}" bepaalt de visuele grenzen; binnen die grenzen kiest de planner de layouts met de beste tekst/beeld-balans.`
  }
  if (profiles.length > 0) {
    return 'Er is geen thema opgegeven, dus de planner combineert onderwerp-associaties met de sterkste beschikbare layouts.'
  }
  return 'Er is geen thema of template beschikbaar, dus de planner kiest zelf een creatieve richting op basis van het onderwerp.'
}

function visualPromptFor(subject: string, styleDirection: string, purpose: string): string {
  return `${purpose} for ${subject}. ${styleDirection}`
}

function buildCreativeSlides(
  intent: AtelierIntent,
  styleDirection: string,
  count: number,
  layouts: Partial<Record<CreativeSlidePurpose, string>>,
): AtelierCreativePlan['slides'] {
  const subject = intent.subject
  const topic = titleCase(subject)
  const sequence: Array<{
    purpose: CreativeSlidePurpose
    headline: string
    body?: string
    visual?: string
  }> = [
    {
      purpose: 'cover',
      headline: topic,
      body: intent.theme ? `In de stijl van ${intent.theme}` : 'Een eigen visuele richting, afgestemd op het onderwerp.',
      visual: 'hero cover',
    },
    {
      purpose: 'story',
      headline: `De kern van ${subject}`,
      body: 'Maak direct duidelijk waar het verhaal over gaat en waarom het publiek moet blijven kijken.',
    },
    {
      purpose: 'visual',
      headline: `Beeldwereld van ${subject}`,
      body: 'Vertaal het onderwerp naar sfeer, ritme, kleur en compositie.',
      visual: 'signature visual',
    },
    {
      purpose: 'story',
      headline: `Waarom ${subject} nu relevant is`,
      body: 'Geef context, urgentie en een concreet haakje voor de doelgroep.',
    },
    {
      purpose: 'data',
      headline: 'Bewijs en observaties',
      body: 'Gebruik feiten, voorbeelden of scherpe observaties om het verhaal geloofwaardig te maken.',
    },
    {
      purpose: 'quote',
      headline: 'Een sterke gedachte',
      body: 'Plaats een korte zin of inzicht dat het idee memorabel maakt.',
    },
    {
      purpose: 'story',
      headline: 'De opbouw',
      body: 'Werk toe naar een heldere ontwikkeling: begin, spanning, inzicht en conclusie.',
    },
    {
      purpose: 'visual',
      headline: 'Het bepalende beeld',
      body: 'Gebruik hier de meest uitgesproken visuele keuze van het ontwerp.',
      visual: 'key scene',
    },
    {
      purpose: 'story',
      headline: 'Wat het publiek meeneemt',
      body: 'Vat de belangrijkste belofte, les of boodschap compact samen.',
    },
    {
      purpose: 'closing',
      headline: 'Slotbeeld',
      body: 'Eindig met een duidelijke conclusie of call-to-action.',
      visual: 'closing mood',
    },
  ]

  const middle = sequence.slice(1, sequence.length - 1)
  const getSlide = (i: number) => {
    if (i === 0) return sequence[0]
    if (i === count - 1 && count > 1) return sequence[sequence.length - 1]
    return middle[(i - 1) % middle.length]
  }

  return Array.from({ length: count }, (_, i) => {
    const slide = getSlide(i)
    return {
      purpose: slide.purpose,
      layoutName: layouts[slide.purpose] ?? layouts.story ?? layouts.cover,
      headline: slide.headline || `${topic} ${i + 1}`,
      body: slide.body,
      visualPrompt: slide.visual ? visualPromptFor(subject, styleDirection, slide.visual) : undefined,
    }
  })
}

function titleCase(value: string): string {
  return value.replace(/\w\S*/g, (word) => word.charAt(0).toUpperCase() + word.slice(1))
}
