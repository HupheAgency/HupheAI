/**
 * ad-to-html: converteert een afbeelding naar pixel-accurate HTML/CSS
 *
 * Gebruik:
 *   OPENROUTER_API_KEY=sk-or-... tsx convert.ts pad/naar/advertentie.png
 *
 * Output:
 *   output/result.html   — finale HTML
 *   output/candidate.png — laatste render
 *   output/diff.png      — pixelmatch diff (rood = afwijking)
 */

import fs from 'fs'
import path from 'path'
import { chromium } from 'playwright'
import sharp from 'sharp'
import { PNG } from 'pngjs'
import pixelmatch from 'pixelmatch'

const API_KEY = process.env.OPENROUTER_API_KEY
const MODEL = 'anthropic/claude-sonnet-4-6'
const MAX_ITERATIONS = 3
const ACCEPT_THRESHOLD = 0.02 // max 2% foute pixels

if (!API_KEY) {
  console.error('Zet OPENROUTER_API_KEY als environment variable.')
  process.exit(1)
}

const inputPath = process.argv[2]
if (!inputPath || !fs.existsSync(inputPath)) {
  console.error('Gebruik: tsx convert.ts <pad-naar-afbeelding>')
  process.exit(1)
}

const outputDir = path.join(path.dirname(inputPath), 'output')
fs.mkdirSync(outputDir, { recursive: true })

async function toDataUrl(filePath: string): Promise<string> {
  const buf = await sharp(filePath).png().toBuffer()
  return `data:image/png;base64,${buf.toString('base64')}`
}

async function getDimensions(filePath: string): Promise<{ width: number; height: number }> {
  const meta = await sharp(filePath).metadata()
  return { width: meta.width!, height: meta.height! }
}

async function callClaude(messages: object[]): Promise<string> {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${API_KEY}`,
      'HTTP-Referer': 'https://hupheai.app',
      'X-Title': 'HupheAI ad-to-html',
    },
    body: JSON.stringify({ model: MODEL, messages, temperature: 0, stream: false }),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`OpenRouter ${res.status}: ${err.slice(0, 300)}`)
  }
  const json = await res.json() as any
  return json.choices[0].message.content
}

function extractHtml(text: string): string {
  const fenced = text.match(/```(?:html)?\s*([\s\S]*?)```/)
  if (fenced) return fenced[1].trim()
  const start = text.indexOf('<!DOCTYPE')
  const alt = text.indexOf('<html')
  const begin = start >= 0 ? start : alt >= 0 ? alt : -1
  if (begin >= 0) return text.slice(begin).trim()
  return text.trim()
}

async function renderHtml(html: string, width: number, height: number, outPath: string): Promise<void> {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width, height } })

  // font-loading guard: wacht tot alle fonts geladen zijn
  await page.setContent(html, { waitUntil: 'networkidle' })
  await page.addStyleTag({ content: '*, *::before, *::after { animation-duration: 0ms !important; transition-duration: 0ms !important; }' })
  await page.evaluate(() => document.fonts.ready)

  await page.screenshot({ path: outPath, clip: { x: 0, y: 0, width, height } })
  await browser.close()
}

async function diffImages(refPath: string, candPath: string, diffPath: string): Promise<number> {
  const refPng = PNG.sync.read(fs.readFileSync(refPath))
  const candPng = PNG.sync.read(fs.readFileSync(candPath))

  const { width, height } = refPng
  const diffPng = new PNG({ width, height })

  const wrongPixels = pixelmatch(refPng.data, candPng.data, diffPng.data, width, height, {
    threshold: 0.1,
    includeAA: false,
  })

  fs.writeFileSync(diffPath, PNG.sync.write(diffPng))

  return wrongPixels / (width * height)
}

async function main() {
  const { width, height } = await getDimensions(inputPath)
  console.log(`\nAfbeelding: ${path.basename(inputPath)} (${width}×${height})`)

  // zet referentie om naar PNG voor pixelmatch
  const refPngPath = path.join(outputDir, 'reference.png')
  await sharp(inputPath).png().toFile(refPngPath)

  const refDataUrl = await toDataUrl(inputPath)
  const candPath = path.join(outputDir, 'candidate.png')
  const diffPath = path.join(outputDir, 'diff.png')
  const htmlPath = path.join(outputDir, 'result.html')

  // stap 1: genereer initiële HTML op basis van de afbeelding
  console.log('\nStap 1: Claude genereert initiële HTML...')
  const initResponse = await callClaude([
    {
      role: 'user',
      content: [
        {
          type: 'text',
          text: `Je krijgt een afbeelding van een advertentie. Bouw deze exact na in HTML en CSS.

Regels:
- Gebruik één enkel HTML-bestand met inline <style> en geen externe resources.
- Gebruik geen afbeeldingen of iframes — vervang foto's door placeholder-divs met dezelfde kleur/afmeting.
- De body heeft margin 0, padding 0, overflow hidden.
- Het root-element is exact ${width}×${height}px.
- Gebruik absolute positionering voor alle elementen zodat de layout pixelaccuraat is.
- Gebruik de exacte kleuren, fonts (of closest web-safe fallback), tekst en groottes die je ziet.
- Retourneer ALLEEN de HTML, geen uitleg.`,
        },
        { type: 'text', text: 'De advertentie:' },
        { type: 'image_url', image_url: { url: refDataUrl } },
      ],
    },
  ])

  let html = extractHtml(initResponse)
  fs.writeFileSync(htmlPath, html)

  let score = 1
  for (let i = 1; i <= MAX_ITERATIONS; i++) {
    console.log(`\nIteratie ${i}/${MAX_ITERATIONS}: renderen en vergelijken...`)

    await renderHtml(html, width, height, candPath)
    score = await diffImages(refPngPath, candPath, diffPath)
    const pct = (score * 100).toFixed(1)
    console.log(`  Diff-score: ${pct}% foute pixels`)

    if (score <= ACCEPT_THRESHOLD) {
      console.log(`  ✓ Onder drempel (${(ACCEPT_THRESHOLD * 100).toFixed(0)}%) — klaar.`)
      break
    }

    if (i === MAX_ITERATIONS) {
      console.log(`  ! Max iteraties bereikt. Status: requires_manual_review`)
      break
    }

    // stap 2+: stuur referentie + candidate + diff + HTML naar Claude voor correcties
    console.log(`  Claude analyseert het verschil...`)
    const candDataUrl = await toDataUrl(candPath)
    const diffDataUrl = await toDataUrl(diffPath)

    const fixResponse = await callClaude([
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `Je bent een HTML/CSS precisie-corrector. De huidige HTML render wijkt ${(score * 100).toFixed(1)}% af van het origineel.

Bekijk de drie afbeeldingen:
1. ORIGINEEL — het doel
2. HUIDIGE RENDER — wat er nu staat
3. DIFF — rode pixels = afwijkingen

Analyseer de diff en pas de HTML aan zodat het origineel zo exact mogelijk wordt nagebouwd.
Retourneer ALLEEN de volledige gecorrigeerde HTML, geen uitleg.

Huidige HTML:
\`\`\`html
${html}
\`\`\``,
          },
          { type: 'text', text: '1. ORIGINEEL:' },
          { type: 'image_url', image_url: { url: refDataUrl } },
          { type: 'text', text: '2. HUIDIGE RENDER:' },
          { type: 'image_url', image_url: { url: candDataUrl } },
          { type: 'text', text: '3. DIFF (rood = fout):' },
          { type: 'image_url', image_url: { url: diffDataUrl } },
        ],
      },
    ])

    html = extractHtml(fixResponse)
    fs.writeFileSync(htmlPath, html)
  }

  console.log(`\nResultaat opgeslagen in: ${outputDir}/`)
  console.log(`  result.html   — finale HTML`)
  console.log(`  candidate.png — laatste render`)
  console.log(`  diff.png      — pixelmatch diff`)
  console.log(`  Eindscore: ${(score * 100).toFixed(1)}% afwijking\n`)
}

main().catch((err) => {
  console.error('Fout:', err.message)
  process.exit(1)
})
