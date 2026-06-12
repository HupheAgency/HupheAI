import type { HtmlPresentationTemplate } from '../../../lib/html-presentation-templates'
import type { ShapeEntry } from '../../../components/WebSlidePreview'
import {
  type PresentationFieldSpec,
  type PresentationImageSlotSpec,
  type PresentationLayoutSpec,
  type PresentationSkin,
} from '../../../lib/presentation-template-skins'

// ── Palette ──────────────────────────────────────────────────────────────────
const chalk     = '#F6F4EF'
const snow      = '#FFFFFF'
const ink       = '#111111'
const offInk    = '#1B1A18'
const slate     = '#6F6B63'
const muted     = '#A8A39A'
const line      = '#DDD8CE'
const cream     = '#E8E4DB'
const paper     = '#F1EEE7'
const night     = '#111111'
const darkPanel = '#1B1A18'
const sand      = '#B9A98E'

// ── Canvas ───────────────────────────────────────────────────────────────────
const W = 1920
const H = 1080
const M = 96

// ── Shapes ───────────────────────────────────────────────────────────────────
const rect = (x: number, y: number, width: number, height: number, fillColor = cream): ShapeEntry =>
  ({ posX: x, posY: y, width, height, fillColor })

const lineShape = (x: number, y: number, width = 52, height = 3, fillColor = ink): ShapeEntry =>
  ({ posX: x, posY: y, width, height, fillColor })

const hLine = (x: number, y: number, width: number, fillColor = line): ShapeEntry =>
  ({ posX: x, posY: y, width, height: 1, fillColor })

// ── Field helpers ─────────────────────────────────────────────────────────────
function field(opts: {
  role: string; text: string
  x: number; y: number; width: number; height: number
  fontSize: number; fontWeight?: number; color?: string
  alignment?: string; letterSpacing?: number; textTransform?: string
  autoFit?: boolean
}): PresentationFieldSpec {
  return {
    role: opts.role, x: opts.x, y: opts.y, width: opts.width, height: opts.height,
    fontSize: opts.fontSize, fontWeight: opts.fontWeight ?? 400,
    color: opts.color ?? ink, alignment: opts.alignment,
    letterSpacing: opts.letterSpacing, textTransform: opts.textTransform,
    autoFit: opts.autoFit,
    defaultText: opts.text,
  }
}

function label(text: string, x = M, y = 82, color = ink): PresentationFieldSpec {
  return field({ role: 'label', text, x, y, width: 520, height: 28, fontSize: 16,
    fontWeight: 800, color, letterSpacing: 0.08, textTransform: 'uppercase' })
}

function heading(text: string, x: number, y: number, width: number, height: number, size = 76, color = ink): PresentationFieldSpec {
  return field({ role: 'heading', text, x, y, width, height, fontSize: size, fontWeight: 900, color, autoFit: true })
}

function body(text: string, x: number, y: number, width: number, height: number, size = 30, color = slate): PresentationFieldSpec {
  return field({ role: 'body', text, x, y, width, height, fontSize: size, fontWeight: 400, color })
}

function small(text: string, role: string, x: number, y: number, width: number, height: number, size = 20, color = slate): PresentationFieldSpec {
  return field({ role, text, x, y, width, height, fontSize: size, fontWeight: 500, color })
}

function metric(text: string, role: string, x: number, y: number, width: number, height: number, size = 64): PresentationFieldSpec {
  return field({ role, text, x, y, width, height, fontSize: size, fontWeight: 900, color: ink })
}

function slot(x: number, y: number, width: number, height: number, role = 'image', background = cream): PresentationImageSlotSpec {
  return { role, x, y, width, height, background }
}

// ── Skin ─────────────────────────────────────────────────────────────────────
const createdAt = '2026-06-02T00:00:00.000Z'

export const studioCleanSkin: PresentationSkin = {
  id: 'studio-clean',
  name: 'Studio Clean',
  description: 'Clean, editorial bureau presentatie met 23 verhaalgedreven layouts voor strategie, campagne en executie.',
  createdAt,
  updatedAt: createdAt,
  slideWidth: W,
  slideHeight: H,
  theme: {
    fontFamily: 'Inter, "Helvetica Neue", Arial, sans-serif',
    background: chalk,
    text: ink,
    mutedText: slate,
    accent: sand,
    darkBackground: night,
    darkText: chalk,
    mediaBackground: cream,
  },
  layouts: [

    // 01 Cover
    {
      id: 'cover',
      name: '01. Cover',
      module: 'cover',
      background: chalk,
      shapes: [
        lineShape(M, 84, 60, 4),
        rect(1484, 0, 436, 1080, paper),
      ],
      fields: [
        heading('De titel van\nde campagne\nof presentatie.', M, 166, 760, 450, 82),
        body('Bureaunaam · Klantnaam · Maand Jaar', M, 760, 480, 90, 22, offInk),
        small('Campagne · Datum', 'footer', M, 980, 500, 32, 16, muted),
      ],
      imageSlots: [slot(1484, 0, 436, 1080, 'hero')],
    },

    // 02 Agenda
    {
      id: 'agenda',
      name: '02. Agenda',
      module: 'agenda',
      background: snow,
      shapes: [
        lineShape(M, 84, 60, 4),
        rect(1460, 0, 460, 1080, paper),
      ],
      fields: [
        label('Agenda'),
        small('01     Inleiding en context',        'item_1', 780, 292, 520, 36, 24, ink),
        small('02     Het probleem en de spanning',  'item_2', 780, 372, 520, 36, 24, ink),
        small('03     Strategische richting',        'item_3', 780, 452, 520, 36, 24, ink),
        small('04     Het campagne-idee',            'item_4', 780, 532, 520, 36, 24, ink),
        small('05     Middelen en uitwerking',       'item_5', 780, 612, 520, 36, 24, ink),
        small('06     Planning en impact',           'item_6', 780, 692, 520, 36, 24, ink),
      ],
      imageSlots: [slot(1460, 0, 460, 1080, 'hero')],
    },

    // 03 Challenge
    {
      id: 'challenge',
      name: '03. Challenge',
      module: 'challenge',
      background: chalk,
      shapes: [lineShape(M, 84, 60, 4)],
      fields: [
        label('De uitdaging'),
        heading('Benoem hier het\nkernprobleem van\nde campagne.', M, 250, 820, 210, 74),
        body('Geef context. Wat zijn de feiten, cijfers of signalen die de urgentie van dit probleem aantonen?', M, 545, 720, 160, 28),
        small('Probleem',              'tag_1',    1240, 280, 220, 32, 18, muted),
        small('Gevolg',               'tag_2',    1240, 420, 220, 32, 18, muted),
        small('Doel',                 'tag_3',    1240, 560, 220, 32, 18, muted),
        small('Benoem het kernprobleem',       'problem', 1240, 315, 520, 42, 30, ink),
        small('Wat staat er op het spel',      'effect',  1240, 455, 520, 42, 30, ink),
        small('Wat wil de campagne bereiken',  'goal',    1240, 595, 540, 42, 30, ink),
      ],
    },

    // 04 Context
    {
      id: 'context',
      name: '04. Context',
      module: 'context',
      background: snow,
      shapes: [lineShape(M, 84, 60, 4)],
      fields: [
        label('Context'),
        heading('Wat speelt er?', M, 185, 760, 100, 68),
        metric('01',  'number_1', M,    460, 160, 80, 42),
        metric('02',  'number_2', 650,  460, 160, 80, 42),
        metric('03',  'number_3', 1205, 460, 160, 80, 42),
        small('Marktcontext',              'title_1', M,    550, 380, 40, 24, ink),
        small('Beschrijf de markt\nen sector in kort.', 'body_1', M,    600, 440, 90, 22, slate),
        small('Culturele ontwikkeling',    'title_2', 650,  550, 380, 40, 24, ink),
        small('Wat verandert er\nin gedrag en cultuur?', 'body_2', 650,  600, 440, 90, 22, slate),
        small('Concurrentiedruk',          'title_3', 1205, 550, 380, 40, 24, ink),
        small('Welke obstakels\nof alternatieven spelen?', 'body_3', 1205, 600, 440, 90, 22, slate),
      ],
    },

    // 05 Audience
    {
      id: 'audience',
      name: '05. Audience',
      module: 'audience',
      background: chalk,
      shapes: [
        lineShape(M, 84, 60, 4),
        rect(1380, 0, 540, 1080, paper),
      ],
      fields: [
        label('Onze doelgroep'),
        heading('Beschrijf de\ndoelgroep in\nvier woorden.', M, 210, 720, 300, 64),
        small('Willen',         'label_1',    M,   720, 220, 30, 18, muted),
        small('iets betekenen', 'audience_1', M,   770, 260, 50, 24, ink),
        small('Haken af op',    'label_2',    440, 720, 220, 30, 18, muted),
        small('lege beloftes',  'audience_2', 440, 770, 300, 50, 24, ink),
        small('Kiezen waar ze', 'label_3',    820, 720, 220, 30, 18, muted),
        small('hun energie\naan geven', 'audience_3', 820, 770, 340, 50, 24, ink),
      ],
      imageSlots: [slot(1380, 0, 540, 1080, 'portrait')],
    },

    // 06 Tension
    {
      id: 'tension',
      name: '06. Tension',
      module: 'tension',
      background: chalk,
      shapes: [
        rect(960, 0, 960, 1080, night),
        lineShape(M, 84, 60, 4),
        lineShape(1056, 84, 60, 4, snow),
        rect(922, 520, 76, 76, snow),
      ],
      fields: [
        label('De spanning'),
        heading('Ze willen\ngraag iets\nbereiken.', M, 372, 600, 245, 58),
        field({ role: 'versus', text: 'vs.', x: 936, y: 548, width: 50, height: 32, fontSize: 18, fontWeight: 800, color: ink, alignment: 'center' }),
        heading('Maar weten niet\nhoe zij het\nverschil maken.', 1100, 372, 620, 245, 48, snow),
      ],
    },

    // 07 Insight
    {
      id: 'insight',
      name: '07. Insight',
      module: 'insight',
      background: night,
      shapes: [lineShape(M, 84, 60, 4, snow), lineShape(M, 740, 86, 3, snow)],
      fields: [
        label('Het inzicht', M, 82, snow),
        heading('Ze geloven niet dat\nhun keuze ertoe doet.\nOmdat ze het effect\nniet zien.', M, 310, 1280, 360, 70, snow),
      ],
    },

    // 08 Strategy
    {
      id: 'strategy',
      name: '08. Strategy',
      module: 'strategy',
      background: snow,
      shapes: [lineShape(M, 84, 60, 4)],
      fields: [
        label('Onze strategie'),
        heading('Als we __________ wat hun keuze\necht verandert, dan gaan ze\nanders handelen.', M, 330, 1540, 170, 44),
        small('Maak het concreet\nen persoonlijk.',           'strategy_1', M,    660, 380, 70, 24, slate),
        small('Van abstractie naar\nhun werkelijkheid.',      'strategy_2', 710,  660, 380, 70, 24, slate),
        small('Geef ze het gevoel\ndat zij het verschil maken.', 'strategy_3', 1320, 660, 420, 90, 24, slate),
      ],
    },

    // 09 Creative Territories — 3 image slots (één per route)
    {
      id: 'creative-territories',
      name: '09. Creative Territories',
      module: 'creative-territories',
      background: chalk,
      shapes: [
        lineShape(M, 84, 60, 4),
        rect(M,    305, 470, 300, paper),
        rect(725,  305, 470, 300, paper),
        rect(1350, 305, 470, 300, darkPanel),
      ],
      fields: [
        label('Creative territories'),
        small('Route A',                                      'route_1_title', M,    650, 430, 34, 28, ink),
        small('Beschrijf de eerste creatieve richting kort.', 'route_1_body',  M,    700, 430, 90, 22, slate),
        small('Route B',                                      'route_2_title', 725,  650, 430, 34, 28, ink),
        small('Beschrijf de tweede creatieve richting kort.', 'route_2_body',  725,  700, 430, 90, 22, slate),
        small('Route C',                                      'route_3_title', 1350, 650, 430, 34, 28, chalk),
        small('Beschrijf de derde creatieve richting kort.',  'route_3_body',  1350, 700, 430, 90, 22, muted),
      ],
      imageSlots: [
        slot(M,    305, 470, 300, 'route-1', paper),
        slot(725,  305, 470, 300, 'route-2', paper),
        slot(1350, 305, 470, 300, 'route-3', darkPanel),
      ],
    },

    // 10 Route Detail
    {
      id: 'route-detail',
      name: '10. Route Detail',
      module: 'route-detail',
      background: chalk,
      shapes: [lineShape(M, 84, 60, 4), rect(1230, 0, 690, 1080, paper)],
      fields: [
        label('Gekozen route'),
        heading('Route A:\nBenoem de\ngekozen richting.', M, 305, 680, 90, 64),
        body('Beschrijf de gekozen creatieve richting in concrete termen. Toon, belofte, doelgroep en middelen.', M, 435, 620, 250, 28),
      ],
      imageSlots: [slot(1230, 0, 690, 1080, 'hero')],
    },

    // 11 Big Idea
    {
      id: 'big-idea',
      name: '11. Big Idea',
      module: 'big-idea',
      background: chalk,
      shapes: [lineShape(M, 84, 60, 4)],
      fields: [
        label('Het idee'),
        heading('HET CAMPAGNE-\nIDEE IN TWEE\nZINNEN.', M, 360, 1320, 210, 92),
      ],
    },

    // 12 Why It Works
    {
      id: 'why-it-works',
      name: '12. Why It Works',
      module: 'why-it-works',
      background: snow,
      shapes: [lineShape(M, 84, 60, 4)],
      fields: [
        label('Waarom dit werkt'),
        metric('→',  'icon_1', M,    285, 120, 90, 48),
        metric('↗',  'icon_2', 700,  285, 120, 90, 48),
        metric('★',  'icon_3', 1300, 285, 120, 90, 48),
        small('Persoonlijk',    'reason_1_title', M,    520, 360, 34, 26, ink),
        small('Maakt de link tussen het idee\nen het dagelijkse leven.', 'reason_1_body', M,    575, 420, 110, 22, slate),
        small('Concreet',       'reason_2_title', 700,  520, 360, 34, 26, ink),
        small('Laat zien wat er\nverandert door de keuze.', 'reason_2_body', 700,  575, 420, 110, 22, slate),
        small('Motiverend',     'reason_3_title', 1300, 520, 360, 34, 26, ink),
        small('Geeft de doelgroep\nhet gevoel dat zij tellen.', 'reason_3_body', 1300, 575, 420, 110, 22, slate),
      ],
    },

    // 13 Campaign Ecosystem
    {
      id: 'campaign-ecosystem',
      name: '13. Campaign Ecosystem',
      module: 'ecosystem',
      background: chalk,
      shapes: [
        lineShape(M, 84, 60, 4),
        rect(760,  315, 400, 160, snow),
        rect(250,  590, 320, 110, snow),
        rect(610,  760, 320, 110, snow),
        rect(995,  760, 320, 110, snow),
        rect(1350, 590, 320, 110, snow),
      ],
      fields: [
        label('Campagne-ecosysteem'),
        heading('Campagne-idee', 760, 360, 400, 90, 36),
        small('TVC / Video', 'node_1', 250,  630, 320, 30, 24, ink),
        small('Website',     'node_2', 610,  800, 320, 30, 24, ink),
        small('Social',      'node_3', 995,  800, 320, 30, 24, ink),
        small('OOH',         'node_4', 1350, 630, 320, 30, 24, ink),
      ],
    },

    // 14 Hero Asset
    {
      id: 'hero-asset',
      name: '14. Hero Asset',
      module: 'hero-asset',
      background: night,
      shapes: [rect(0, 0, W, H, night)],
      fields: [
        label('Hero asset', M, 82, snow),
        heading('Het dragende\ncampagnemiddel\nvan het verhaal.', M, 570, 780, 180, 72, snow),
      ],
      imageSlots: [slot(0, 0, W, H, 'hero-asset', '#222222')],
    },

    // 15 Social — 3 image slots (één per telefoon)
    {
      id: 'social',
      name: '15. Social',
      module: 'social',
      background: snow,
      shapes: [
        lineShape(M, 84, 60, 4),
        rect(330,  300, 300, 560, darkPanel),
        rect(810,  300, 300, 560, darkPanel),
        rect(1290, 300, 300, 560, darkPanel),
      ],
      fields: [
        label('Social'),
        small('Beeldinhoud\nvoor het eerste\nformat.',  'phone_1', 365,  610, 230, 120, 32, snow),
        small('Beeldinhoud\nvoor het tweede\nformat.',  'phone_2', 845,  610, 230, 120, 32, snow),
        small('Beeldinhoud\nvoor het derde\nformat.',   'phone_3', 1325, 610, 230, 120, 32, snow),
      ],
      imageSlots: [
        slot(330,  300, 300, 560, 'image-1', '#222222'),
        slot(810,  300, 300, 560, 'image-2', '#222222'),
        slot(1290, 300, 300, 560, 'image-3', '#222222'),
      ],
    },

    // 16 Digital
    {
      id: 'digital',
      name: '16. Digital',
      module: 'digital',
      background: chalk,
      shapes: [
        lineShape(M, 84, 60, 4),
        rect(310, 225, 1180, 650, snow),
        rect(370, 285, 1060, 460, paper),
      ],
      fields: [
        label('Digital'),
        heading('Bekijk de campagne\nin de digitale\nomgeving.', 430, 350, 560, 130, 50),
        small('Ontdek meer', 'button', 435, 530, 240, 32, 22, ink),
      ],
      imageSlots: [slot(370, 285, 1060, 460, 'website')],
    },

    // 17 OOH — 2 image slots (één per paneel)
    {
      id: 'ooh',
      name: '17. OOH',
      module: 'ooh',
      background: snow,
      shapes: [
        lineShape(M, 84, 60, 4),
        rect(210,  265, 660, 620, paper),
        rect(1050, 265, 660, 620, paper),
      ],
      fields: [
        label('OOH'),
        heading('Campagne-\nboodschap\nvoor buitenreclame.', 285,  595, 500, 115, 44, snow),
        heading('De campagne\nin de publieke\nruimte.',       1110, 465, 460, 260, 58, snow),
      ],
      imageSlots: [
        slot(210,  265, 660, 620, 'ooh-1'),
        slot(1050, 265, 660, 620, 'ooh-2'),
      ],
    },

    // 18 Activation
    {
      id: 'activation',
      name: '18. Activation',
      module: 'activation',
      background: chalk,
      shapes: [lineShape(M, 84, 60, 4), rect(980, 0, 940, 1080, paper)],
      fields: [
        label('Activatie'),
        heading('Activatie-\nconcept', M, 270, 520, 150, 70),
        body('Beschrijf het activatieconcept. Wat doen mensen, waar, en wat nemen ze mee?', M, 480, 620, 230, 28),
        heading('WAT WIL JIJ\nVERANDEREN?', 1160, 180, 560, 130, 50),
      ],
      imageSlots: [slot(980, 0, 940, 1080, 'activation')],
    },

    // 19 Extra Touchpoints
    {
      id: 'extra-touchpoints',
      name: '19. Extra Touchpoints',
      module: 'touchpoints',
      background: snow,
      shapes: [lineShape(M, 84, 60, 4)],
      fields: [
        label('Extra touchpoints'),
        small('→   Radio\nKorte campagneverhalen op de radio.',               'touch_1', M,    260, 680, 90, 26, ink),
        small('→   Influencers\nEchte gesprekken, geen scripts.',              'touch_2', M,    420, 680, 90, 26, ink),
        small('→   Partnerships\nSamen met organisaties die de doelgroep raken.', 'touch_3', M, 580, 700, 90, 26, ink),
        small('→   E-mail / CRM\nPersoonlijke berichten met relevante content.', 'touch_4', 1050, 260, 700, 90, 26, ink),
        small('→   Events\nActivaties op locatie of digitaal.',                'touch_5', 1050, 420, 700, 90, 26, ink),
      ],
    },

    // 20 Rollout
    {
      id: 'rollout',
      name: '20. Rollout',
      module: 'rollout',
      background: chalk,
      shapes: [lineShape(M, 84, 60, 4), hLine(210, 650, 1500, sand)],
      fields: [
        label('Rollout'),
        heading('Campagneplanning', M, 250, 780, 100, 64),
        small('Fase 1\n\nTeaser',        'phase_1', 210,  575, 260, 120, 22, ink),
        small('Fase 2\n\nLancering',     'phase_2', 620,  575, 260, 120, 22, ink),
        small('Fase 3\n\nAlways On',     'phase_3', 1030, 575, 260, 120, 22, ink),
        small('Fase 4\n\nOptimalisatie', 'phase_4', 1440, 575, 260, 120, 22, ink),
      ],
    },

    // 21 KPI
    {
      id: 'kpi',
      name: '21. KPI',
      module: 'kpi',
      background: snow,
      shapes: [lineShape(M, 84, 60, 4)],
      fields: [
        label("KPI's"),
        metric('+25%', 'kpi_1', M,    330, 300, 90, 58),
        small('Benoem KPI 1\nen de doelstelling.', 'kpi_1_label', M,    445, 320, 80, 22, ink),
        metric('+20%', 'kpi_2', 520,  330, 300, 90, 58),
        small('Benoem KPI 2\nen de doelstelling.', 'kpi_2_label', 520,  445, 340, 80, 22, ink),
        metric('+30%', 'kpi_3', 975,  330, 300, 90, 58),
        small('Benoem KPI 3\nen de doelstelling.', 'kpi_3_label', 975,  445, 340, 80, 22, ink),
        metric('+15%', 'kpi_4', 1430, 330, 300, 90, 58),
        small('Benoem KPI 4\nen de doelstelling.', 'kpi_4_label', 1430, 445, 340, 80, 22, ink),
      ],
    },

    // 22 Impact
    {
      id: 'impact',
      name: '22. Impact',
      module: 'impact',
      background: chalk,
      shapes: [lineShape(M, 84, 60, 4), rect(1100, 0, 820, 1080, paper)],
      fields: [
        label('Impact'),
        heading('Meer bereik.\nMeer impact.\nMeer resultaat.', M, 300, 850, 260, 64),
      ],
      imageSlots: [slot(1100, 0, 820, 1080, 'impact')],
    },

    // 23 Closing
    {
      id: 'closing',
      name: '23. Closing',
      module: 'closing',
      background: night,
      shapes: [lineShape(M, 84, 60, 4, snow)],
      fields: [
        heading('Vragen?\nWe gaan\ngraag aan\nde slag.', 950, 290, 700, 310, 74, snow),
        small('hallo@bureau.nl · bureau.nl', 'closing_meta', 955, 660, 500, 80, 24, chalk),
      ],
    },

  ],
}

export const studioCleanTemplate: HtmlPresentationTemplate = {
  id: studioCleanSkin.id,
  name: studioCleanSkin.name,
  description: studioCleanSkin.description,
  source: 'system',
  createdAt: studioCleanSkin.createdAt,
  updatedAt: studioCleanSkin.updatedAt,
  skin: studioCleanSkin,
}
