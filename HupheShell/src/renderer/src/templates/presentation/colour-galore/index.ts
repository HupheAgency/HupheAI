import type { HtmlPresentationTemplate } from '../../../lib/html-presentation-templates'
import type { ShapeEntry } from '../../../components/WebSlidePreview'
import {
  skinToHtmlTemplateHtml,
  type PresentationFieldSpec,
  type PresentationImageSlotSpec,
  type PresentationSkin,
} from '../../../lib/presentation-template-skins'

// ── Colour Galore ────────────────────────────────────────────────────────────
// Expressief, fris en een tikje vreemd, maar nog steeds bruikbaar.
// Google Font-richting:
// - Display: "Archivo Black", "Bricolage Grotesque", "Space Grotesk"
// - Body: "Inter", "DM Sans"
// Let op: de renderer gebruikt nu één fontFamily op theme-level.
// Als je later per veld fonts ondersteunt, kun je display/body scheiden.

const paper = '#FFFDF6'
const ink = '#0B0B0B'
const black = '#050505'

const lime = '#DFFF00'
const acid = '#C6FF00'
const pink = '#FF5DBA'
const hotPink = '#FF2EA6'
const violet = '#6E28FF'
const purple = '#7C3CFF'
const cyan = '#45E0D0'
const aqua = '#62E5D4'
const orange = '#FF6A00'
const yellow = '#FFF200'
const sky = '#BFA7FF'
const blush = '#FFC1E3'
const mint = '#B9FFF4'
const muted = '#4A4742'
const softLine = '#E7E0D4'
const cream = '#F2EADF'

const W = 1920
const H = 1080
const M = 96

// ── Shapes ──────────────────────────────────────────────────────────────────
const rect = (x: number, y: number, width: number, height: number, fillColor: string): ShapeEntry => ({
  posX: x,
  posY: y,
  width,
  height,
  rotation: 8,
  fillColor,
})

const line = (x: number, y: number, width = 56, height = 4, fillColor = ink): ShapeEntry => ({
  posX: x,
  posY: y,
  width,
  height,
  rotation: 8,
  fillColor,
})

const circle = (x: number, y: number, size: number, fillColor: string): ShapeEntry => ({
  posX: x,
  posY: y,
  width: size,
  height: size,
  fillColor,
  borderRadius: size / 2,
} as ShapeEntry)

const pill = (x: number, y: number, width: number, height: number, fillColor: string): ShapeEntry => ({
  posX: x,
  posY: y,
  width,
  height,
  fillColor,
  borderRadius: height / 2,
} as ShapeEntry)

function roundedPolylinePath(points: Array<[number, number]>, radius: number): string {
  if (points.length < 2) return ''
  const commands = [`M ${points[0][0]} ${points[0][1]}`]

  for (let i = 1; i < points.length - 1; i += 1) {
    const prev = points[i - 1]
    const current = points[i]
    const next = points[i + 1]
    const prevDistance = Math.hypot(current[0] - prev[0], current[1] - prev[1])
    const nextDistance = Math.hypot(next[0] - current[0], next[1] - current[1])
    const r = Math.min(radius, prevDistance / 2, nextDistance / 2)
    const beforeX = current[0] + ((prev[0] - current[0]) / prevDistance) * r
    const beforeY = current[1] + ((prev[1] - current[1]) / prevDistance) * r
    const afterX = current[0] + ((next[0] - current[0]) / nextDistance) * r
    const afterY = current[1] + ((next[1] - current[1]) / nextDistance) * r

    commands.push(`L ${beforeX.toFixed(1)} ${beforeY.toFixed(1)}`)
    commands.push(`Q ${current[0]} ${current[1]} ${afterX.toFixed(1)} ${afterY.toFixed(1)}`)
  }

  const last = points[points.length - 1]
  commands.push(`L ${last[0]} ${last[1]}`)
  return commands.join(' ')
}

const agendaZigzag = (x: number, y: number, width: number, height: number, fillColor = lime): ShapeEntry => ({
  posX: x,
  posY: y,
  width,
  height,
  fillColor,
  svgStrokeWidth: 88,
  svgStrokeLinecap: 'butt',
  svgStrokeLinejoin: 'miter',
  svgViewBox: '0 0 700 820',
  svgStrokePath: roundedPolylinePath([
    [590, 78],
    [105, 158],
    [575, 260],
    [98, 374],
    [552, 488],
    [125, 604],
    [460, 744],
  ], 12),
})

// ── Field helpers ────────────────────────────────────────────────────────────
function f(opts: {
  role: string
  text: string
  x: number
  y: number
  width: number
  height: number
  fontSize: number
  fontWeight?: number
  color?: string
  alignment?: string
  letterSpacing?: number
  textTransform?: string
  autoFit?: boolean
  fontFamily?: string
  numberedList?: PresentationFieldSpec['numberedList']
}): PresentationFieldSpec {
  return {
    role: opts.role,
    x: opts.x,
    y: opts.y,
    width: opts.width,
    height: opts.height,
    fontSize: opts.fontSize,
    fontWeight: opts.fontWeight ?? 400,
    color: opts.color ?? ink,
    alignment: opts.alignment,
    letterSpacing: opts.letterSpacing,
    textTransform: opts.textTransform,
    autoFit: opts.autoFit,
    fontFamily: opts.fontFamily,
    numberedList: opts.numberedList,
    defaultText: opts.text,
  }
}

function label(text: string, x = M, y = 76, color = ink): PresentationFieldSpec {
  return f({
    role: 'label',
    text,
    x,
    y,
    width: 620,
    height: 32,
    fontSize: 16,
    fontWeight: 900,
    color,
    letterSpacing: 0.08,
    textTransform: 'uppercase',
  })
}

function head(text: string, x: number, y: number, width: number, height: number, size = 76, color = ink): PresentationFieldSpec {
  return f({
    role: 'heading',
    text,
    x,
    y,
    width,
    height,
    fontSize: size,
    fontWeight: 950,
    color,
    autoFit: true,
  })
}

function body(text: string, x: number, y: number, width: number, height: number, size = 28, color = muted): PresentationFieldSpec {
  return f({
    role: 'body',
    text,
    x,
    y,
    width,
    height,
    fontSize: size,
    fontWeight: 500,
    color,
  })
}

function small(text: string, role: string, x: number, y: number, width: number, height: number, size = 20, color = ink): PresentationFieldSpec {
  return f({
    role,
    text,
    x,
    y,
    width,
    height,
    fontSize: size,
    fontWeight: 700,
    color,
  })
}

function slot(x: number, y: number, width: number, height: number, role = 'image', background = cream): PresentationImageSlotSpec {
  return { role, x, y, width, height, background }
}

// ── Skin ─────────────────────────────────────────────────────────────────────
const createdAt = '2026-06-02T00:00:00.000Z'

export const colourGaloreSkin: PresentationSkin = {
  id: 'colour-galore',
  name: 'Colour Galore',
  description: 'Expressieve, kleurrijke presentatie-skin met vreemde vormen, harde typografie en frisse campagne-layouts.',
  createdAt,
  updatedAt: createdAt,
  slideWidth: W,
  slideHeight: H,
  theme: {
    fontFamily: '"Archivo Black", "Bricolage Grotesque", "Space Grotesk", Inter, Arial, sans-serif',
    background: paper,
    text: ink,
    mutedText: muted,
    accent: hotPink,
    darkBackground: black,
    darkText: paper,
    mediaBackground: cream,
  },
  layouts: [

    // 01
    {
      id: 'cover',
      name: '01. Cover',
      module: 'cover',
      background: paper,
      shapes: [
        line(M, 82, 58, 4, ink),
        rect(1320, 0, 600, 1080, blush),
        circle(1340, 115, 500, '#79C7FF'),
        circle(1755, 880, 95, violet),
        circle(1200, 872, 22, violet),
      ],
      fields: [
        label('Campagnepresentatie'),
        small('MAART 2026', 'date', 840, 76, 280, 32, 18, ink),
        head('MEER\nIMPACT\nMET IDEEËN\nDIE BLIJVEN.', M, 190, 830, 445, 78, ink),
        f({
          role: 'accent_word',
          text: 'IMPACT',
          x: 122,
          y: 282,
          width: 470,
          height: 95,
          fontSize: 78,
          fontWeight: 500,
          color: '#00B665',
        }),
        small('*', 'spark', 1180, 790, 80, 80, 62, violet),
      ],
      imageSlots: [slot(1370, 120, 430, 790, 'hero', '#79C7FF')],
    },

    // 02
    {
      id: 'agenda',
      name: '02. Agenda',
      module: 'agenda',
      background: sky,
      shapes: [
        agendaZigzag(860, 200, 900, 950, lime),
      ],
      fields: [
        f({
          role: 'heading',
          text: 'AGENDA',
          x: M,
          y: 76,
          width: 560,
          height: 125,
          fontSize: 92,
          fontWeight: 900,
          color: ink,
          fontFamily: '"Barlow Condensed", "Archivo Black", sans-serif',
        }),
        f({
          role: 'agenda_items',
          text: 'Het probleem\nDe context\nDe strategie\nHet idee\nDe campagne\nDe impact',
          x: 120,
          y: 265,
          width: 640,
          height: 585,
          fontSize: 30,
          fontWeight: 430,
          color: ink,
          numberedList: {
            start: 1,
            numberWidth: 96,
            gap: 42,
            rowHeight: 86,
            numberFontSize: 85,
            itemFontSize: 30,
            numberColor: violet,
            itemColor: ink,
          },
        }),
      ],
    },

    // 03
    {
      id: 'challenge',
      name: '03. Challenge',
      module: 'challenge',
      background: lime,
      shapes: [
        line(M, 82, 58, 4, ink),
        rect(1320, 620, 500, 90, pink),
        rect(1460, 780, 360, 90, pink),
        circle(1540, 100, 180, yellow),
      ],
      fields: [
        label('De uitdaging'),
        head('Te weinig jonge\nmensen stemmen.', M, 260, 820, 190, 66, ink),
        body('Bij de laatste verkiezingen bracht slechts 48% van de 18–35 jarigen hun stem uit. Terwijl hun toekomst hiermee wordt bepaald.', M, 560, 720, 160, 28, ink),
      ],
    },

    // 04
    {
      id: 'context',
      name: '04. Context',
      module: 'context',
      background: paper,
      shapes: [line(M, 82, 58, 4, ink)],
      fields: [
        label('Context'),
        head('Wat speelt er?', M, 180, 740, 90, 64, ink),
        small('◎', 'icon_1', M, 410, 90, 90, 62, ink),
        small('◉', 'icon_2', 700, 410, 90, 90, 62, ink),
        small('☺', 'icon_3', 1300, 410, 90, 90, 62, ink),
        small('Digitale ruis', 'title_1', M, 550, 390, 34, 24, ink),
        body('Jonge mensen worden overspoeld door informatie en meningen.', M, 600, 390, 100, 21, muted),
        small('Wantrouwen', 'title_2', 700, 550, 390, 34, 24, ink),
        body('Het vertrouwen in politiek en instituties is historisch laag.', 700, 600, 390, 100, 21, muted),
        small('Concurrentie', 'title_3', 1300, 550, 390, 34, 24, ink),
        body('Vrije tijd en entertainment concurreren om hun aandacht.', 1300, 600, 390, 100, 21, muted),
      ],
    },

    // 05
    {
      id: 'audience',
      name: '05. Audience',
      module: 'audience',
      background: blush,
      shapes: [
        line(M, 82, 58, 4, ink),
        rect(1430, 0, 490, 1080, '#FFC7E8'),
        rect(1340, 160, 520, 120, cyan),
        rect(1380, 330, 430, 120, cyan),
        rect(1300, 500, 560, 120, cyan),
      ],
      fields: [
        label('Onze doelgroep'),
        head('Jonge denkers.\nKritisch.\nIdealistisch.\nSelectief.', M, 230, 820, 280, 58, ink),
        small('Willen', 'label_1', M, 740, 180, 30, 18, ink),
        small('Impact maken', 'body_1', M, 790, 240, 42, 22, ink),
        small('Haken af op', 'label_2', 430, 740, 220, 30, 18, ink),
        small('belofte zonder bewijs', 'body_2', 430, 790, 300, 42, 22, ink),
        small('Kiezen waar ze', 'label_3', 810, 740, 240, 30, 18, ink),
        small('zich mee verbinden.', 'body_3', 810, 790, 320, 42, 22, ink),
      ],
      imageSlots: [slot(1430, 0, 490, 1080, 'portrait', '#FFC7E8')],
    },

    // 06
    {
      id: 'tension',
      name: '06. Tension',
      module: 'tension',
      background: paper,
      shapes: [
        rect(960, 0, 960, 1080, black),
        circle(914, 500, 92, lime),
        rect(1280, 820, 460, 70, cyan),
        line(M, 82, 58, 4, ink),
      ],
      fields: [
        label('De spanning'),
        head('Ze willen\nwel iets\nveranderen.', M, 350, 620, 230, 54, ink),
        small('vs.', 'versus', 936, 532, 60, 32, 18, black),
        head('Maar zien niet\nwaarom hun stem\nhet verschil maakt.', 1120, 350, 650, 230, 44, paper),
      ],
    },

    // 07
    {
      id: 'insight',
      name: '07. Insight',
      module: 'insight',
      background: violet,
      shapes: [
        line(M, 82, 58, 4, paper),
        rect(200, 835, 720, 20, pink),
        rect(1020, 835, 300, 20, orange),
      ],
      fields: [
        label('Het inzicht', M, 82, paper),
        head('Ze geloven niet dat\nhun stem ertoe doet.\nOmdat ze het effect\nnooit zien.', M, 290, 1300, 360, 70, paper),
        f({
          role: 'highlight',
          text: 'Omdat ze het effect\nnooit zien.',
          x: M,
          y: 502,
          width: 1180,
          height: 160,
          fontSize: 70,
          fontWeight: 950,
          color: lime,
        }),
      ],
    },

    // 08
    {
      id: 'strategy',
      name: '08. Strategy',
      module: 'strategy',
      background: mint,
      shapes: [
        circle(160, 300, 260, violet),
        circle(760, 290, 275, pink),
        rect(1300, 275, 300, 240, lime),
      ],
      fields: [
        label('Onze strategie'),
        head('IF', 205, 385, 180, 80, 58, paper),
        head('THEN', 815, 385, 250, 80, 50, ink),
        head('SO', 1370, 385, 180, 80, 58, ink),
        body('Als we laten zien\nwat hun stem echt verandert...', M, 660, 380, 140, 24, ink),
        body('...in dingen die\nze belangrijk vinden...', 740, 660, 380, 140, 24, ink),
        body('dan gaan ze\nwel stemmen.', 1310, 660, 350, 120, 24, ink),
      ],
    },

    // 09
    {
      id: 'creative-territories',
      name: '09. Creative Territories',
      module: 'creative-territories',
      background: paper,
      shapes: [
        line(M, 82, 58, 4, ink),
        rect(M, 300, 410, 280, orange),
        rect(625, 300, 410, 280, mint),
        rect(1250, 300, 410, 280, pink),
      ],
      fields: [
        label('Creative territories'),
        small('Real Impact', 'route_1_title', M, 630, 380, 34, 26, ink),
        body('Laat echte veranderingen zien door jongeren zelf.', M, 680, 390, 90, 21, muted),
        small('Future Framed', 'route_2_title', 625, 630, 390, 34, 26, ink),
        body('Verbind de toekomst visueel met keuzes van vandaag.', 625, 680, 390, 90, 21, muted),
        small('Voice Amplified', 'route_3_title', 1250, 630, 390, 34, 26, ink),
        body('Geef hun stem een podium dat je niet kunt negeren.', 1250, 680, 390, 90, 21, muted),
      ],
      imageSlots: [
        slot(M, 300, 410, 280, 'route-1', orange),
        slot(625, 300, 410, 280, 'route-2', mint),
        slot(1250, 300, 410, 280, 'route-3', pink),
      ],
    },

    // 10
    {
      id: 'route-detail',
      name: '10. Route Detail',
      module: 'route-detail',
      background: orange,
      shapes: [
        rect(1130, 0, 790, 1080, '#222222'),
        rect(1030, 0, 360, 1080, violet),
      ],
      fields: [
        label('Kiezen route'),
        head('Real\nImpact', M, 270, 600, 210, 78, ink),
        body('We maken het effect van stemmen zichtbaar in de wereld van vandaag. Geen abstracte beloftes, maar concrete veranderingen die jongeren raken.', M, 550, 620, 220, 26, ink),
      ],
      imageSlots: [slot(1130, 0, 790, 1080, 'hero', '#222222')],
    },

    // 11
    {
      id: 'big-idea',
      name: '11. Big Idea',
      module: 'big-idea',
      background: lime,
      shapes: [
        rect(175, 755, 720, 22, pink),
        rect(900, 755, 240, 22, orange),
      ],
      fields: [
        label('Het idee'),
        head('JOUW STEM.', M, 310, 1100, 120, 86, ink),
        f({
          role: 'accent_heading',
          text: 'JOUW IMPACT.',
          x: M,
          y: 480,
          width: 1050,
          height: 115,
          fontSize: 78,
          fontWeight: 500,
          color: ink,
        }),
      ],
    },

    // 12
    {
      id: 'why-it-works',
      name: '12. Why It Works',
      module: 'why-it-works',
      background: paper,
      shapes: [
        circle(160, 315, 72, violet),
        circle(760, 315, 72, lime),
        circle(1360, 315, 72, orange),
      ],
      fields: [
        label('Waarom dit werkt'),
        small('Persoonlijk', 'reason_1_title', M, 520, 360, 34, 24, ink),
        body('Maakt de link tussen stemmen en hun dagelijkse leven.', M, 575, 390, 95, 21, muted),
        small('Concreet', 'reason_2_title', 700, 520, 360, 34, 24, ink),
        body('Laat zien wat er verandert door hun keuze.', 700, 575, 390, 95, 21, muted),
        small('Motiverend', 'reason_3_title', 1300, 520, 360, 34, 24, ink),
        body('Geeft jongeren het gevoel dat zij de toekomst bepalen.', 1300, 575, 390, 95, 21, muted),
      ],
    },

    // 13
    {
      id: 'campaign-ecosystem',
      name: '13. Campaign Ecosystem',
      module: 'ecosystem',
      background: black,
      shapes: [
        circle(740, 230, 150, lime),
        circle(1300, 250, 150, pink),
        circle(420, 620, 150, violet),
        circle(980, 780, 150, orange),
        circle(1480, 620, 150, cyan),
        circle(1270, 800, 150, lime),
      ],
      fields: [
        label('Campagne-ecosysteem', M, 82, paper),
        head('JOUW STEM.\nJOUW IMPACT.', 770, 455, 450, 100, 42, paper),
        small('TVC / Video', 'node_1', 748, 285, 140, 30, 20, ink),
        small('Social', 'node_2', 1324, 305, 120, 30, 20, ink),
        small('Website', 'node_3', 440, 675, 120, 30, 20, paper),
        small('PR', 'node_4', 1030, 835, 80, 30, 20, ink),
        small('OOH', 'node_5', 1522, 675, 80, 30, 20, ink),
        small('Activatie', 'node_6', 1294, 855, 140, 30, 20, ink),
      ],
    },

    // 14
    {
      id: 'hero-asset',
      name: '14. Hero Asset',
      module: 'hero-asset',
      background: black,
      shapes: [
        rect(50, 815, 300, 72, violet),
        rect(1550, 770, 280, 72, hotPink),
      ],
      fields: [
        label('Hero asset', M, 82, paper),
        head('JOUW STEM.\nJOUW IMPACT.', M, 565, 780, 160, 64, paper),
      ],
      imageSlots: [slot(0, 0, 1920, 1080, 'hero_asset', '#222222')],
    },

    // 15
    {
      id: 'social',
      name: '15. Social',
      module: 'social',
      background: aqua,
      shapes: [
        rect(330, 300, 300, 560, black),
        rect(810, 300, 300, 560, black),
        rect(1290, 300, 300, 560, black),
        rect(150, 760, 110, 18, yellow),
        rect(1660, 650, 90, 18, yellow),
      ],
      fields: [
        label('Social'),
        small('Dit is wat er\nveranderde door\njouw stem.', 'phone_1', 365, 610, 230, 120, 30, paper),
        small('+300\nnieuwe\nfietspaden\nin jouw stad.', 'phone_2', 845, 540, 230, 180, 36, paper),
        small('Stem.\nVerander.\nMorgen.', 'phone_3', 1325, 590, 230, 140, 34, paper),
      ],
      imageSlots: [
        slot(330, 300, 300, 560, 'image-1', black),
        slot(810, 300, 300, 560, 'image-2', black),
        slot(1290, 300, 300, 560, 'image-3', black),
      ],
    },

    // 16
    {
      id: 'digital',
      name: '16. Digital',
      module: 'digital',
      background: sky,
      shapes: [
        rect(310, 220, 1180, 650, paper),
        rect(370, 280, 1060, 460, '#F7F4ED'),
        rect(80, 760, 360, 24, orange),
      ],
      fields: [
        label('Digital'),
        head('Zie wat jouw\nstem verandert.', 430, 350, 560, 130, 46, ink),
        small('Ontdek de impact', 'button', 435, 535, 240, 32, 20, ink),
      ],
      imageSlots: [slot(370, 280, 1060, 460, 'website', '#F7F4ED')],
    },

    // 17
    {
      id: 'ooh',
      name: '17. OOH',
      module: 'ooh',
      background: paper,
      shapes: [
        rect(195, 260, 670, 620, black),
        rect(1045, 260, 670, 620, lime),
        rect(1600, 230, 180, 50, violet),
      ],
      fields: [
        label('OOH'),
        head('JOUW STEM.\nJOUW IMPACT.', 260, 595, 520, 120, 42, paper),
        head('Jij kiest\nwat er\nmorgen\ngebeurt.', 1110, 445, 460, 280, 58, ink),
      ],
      imageSlots: [
        slot(195, 260, 670, 620, 'ooh-1', black),
        slot(1045, 260, 670, 620, 'ooh-2', lime),
      ],
    },

    // 18
    {
      id: 'activation',
      name: '18. Activation',
      module: 'activation',
      background: paper,
      shapes: [rect(940, 0, 980, 1080, cream)],
      fields: [
        label('Activatie'),
        head('Impact\nWall', M, 285, 520, 150, 66, ink),
        body('Een interactieve installatie waar bezoekers direct zien welke verandering mogelijk wordt door hun stem.', M, 490, 600, 230, 25, muted),
      ],
      imageSlots: [slot(940, 0, 980, 1080, 'activation_image', cream)],
    },

    // 19
    {
      id: 'extra-touchpoints',
      name: '19. Extra Touchpoints',
      module: 'touchpoints',
      background: blush,
      shapes: [
        circle(100, 265, 54, black),
        circle(100, 425, 54, black),
        circle(100, 585, 54, black),
        circle(1080, 265, 54, paper),
        circle(1080, 425, 54, paper),
      ],
      fields: [
        label('Extra touchpoints'),
        body('Radio\nKorte impactverhalen op de radio.', 170, 250, 640, 90, 24, ink),
        body('Influencers\nEchte gesprekken, geen scripts.', 170, 410, 640, 90, 24, ink),
        body('Partnerships\nSamen met organisaties die jongeren raken.', 170, 570, 680, 90, 24, ink),
        body('Email / CRM\nPersoonlijke reminders met impact in jouw buurt.', 1150, 250, 660, 100, 24, ink),
        body('Events\nDebatten en talks op scholen en festivals.', 1150, 410, 660, 100, 24, ink),
      ],
    },

    // 20
    {
      id: 'rollout',
      name: '20. Rollout',
      module: 'rollout',
      background: lime,
      shapes: [
        rect(150, 675, 1510, 4, ink),
        rect(1520, 210, 300, 30, hotPink),
        rect(1480, 310, 260, 30, hotPink),
      ],
      fields: [
        label('Rollout'),
        head('Campagneplanning', M, 260, 820, 100, 58, ink),
        small('APR\n\nTeaser', 'phase_1', 210, 600, 260, 120, 22, ink),
        small('MEI\n\nLancering', 'phase_2', 620, 600, 260, 120, 22, ink),
        small('MEI - JUNI\n\nAlways On', 'phase_3', 1030, 600, 260, 120, 22, ink),
        small('JUN\n\nElection Push', 'phase_4', 1440, 600, 260, 120, 22, ink),
      ],
    },

    // 21
    {
      id: 'kpi',
      name: '21. KPI',
      module: 'kpi',
      background: aqua,
      shapes: [
        line(M, 82, 58, 4, ink),
        circle(245, 265, 60, yellow),
        circle(735, 265, 60, yellow),
        circle(1215, 265, 60, yellow),
        circle(1660, 265, 60, yellow),
      ],
      fields: [
        label("KPI's"),
        head('+25%', M, 390, 300, 80, 52, ink),
        body('Stemintentie\n(18–34 jaar)', M, 505, 300, 70, 21, ink),
        head('+20%', 520, 390, 300, 80, 52, ink),
        body('Campagnebereik\nonder jongeren', 520, 505, 320, 70, 21, ink),
        head('+30%', 990, 390, 300, 80, 52, ink),
        body('Engagement op\nsocial content', 990, 505, 320, 70, 21, ink),
        head('+15%', 1450, 390, 300, 80, 52, ink),
        body('Werkelijke\nopkomst', 1450, 505, 320, 70, 21, ink),
      ],
    },

    // 22
    {
      id: 'impact',
      name: '22. Impact',
      module: 'impact',
      background: paper,
      shapes: [
        rect(1200, 200, 520, 90, pink),
        rect(1100, 370, 620, 90, pink),
        rect(1320, 540, 390, 90, pink),
      ],
      fields: [
        label('Impact'),
        head('Meer stemmen.\nMeer invloed.\nMeer toekomst.', M, 280, 780, 240, 58, ink),
      ],
      imageSlots: [slot(1120, 120, 700, 820, 'impact_image', '#FFD3EA')],
    },

    // 23
    {
      id: 'closing',
      name: '23. Closing',
      module: 'closing',
      background: violet,
      shapes: [
        rect(1490, 180, 380, 70, lime),
        rect(1390, 360, 500, 70, lime),
        rect(1500, 540, 360, 70, lime),
      ],
      fields: [
        label('Closing', M, 82, paper),
        head('JOUW STEM.\nJOUW IMPACT.', 820, 300, 640, 160, 66, paper),
        small('Stem 15 juni.', 'closing_date', 820, 600, 260, 30, 22, paper),
        small('jouwstemjouwimpact.nl', 'url', 820, 660, 360, 38, 22, ink),
      ],
    },
  ],
}

export const colourGaloreTemplate: HtmlPresentationTemplate = {
  id: colourGaloreSkin.id,
  name: colourGaloreSkin.name,
  description: colourGaloreSkin.description,
  source: 'system',
  createdAt: colourGaloreSkin.createdAt,
  updatedAt: colourGaloreSkin.updatedAt,
  html: skinToHtmlTemplateHtml(colourGaloreSkin),
  skin: colourGaloreSkin,
}
