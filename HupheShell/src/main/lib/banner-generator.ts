export interface BannerSlide {
  id: string
  texts: { role: 'heading' | 'copy' | 'button'; value: string }[]
}

export interface BannerProject {
  id: string
  imageSrc: string
  styleReferenceSrc?: string
  styleReferenceName?: string
  styleReferenceAnalysis?: string
  styleMode?: 'reference' | 'autonomous'
  slides: BannerSlide[]
  enabledFormats: string[]
  createdAt: string
  updatedAt: string
}

export interface BannerFormat {
  id: string
  label: string
  width: number
  height: number
}

export interface GeneratedBanner {
  formatId: string
  html: string
}

export const IAB_FORMATS: BannerFormat[] = [
  { id: '300x250', label: 'Medium Rectangle', width: 300, height: 250 },
  { id: '728x90', label: 'Leaderboard', width: 728, height: 90 },
  { id: '160x600', label: 'Wide Skyscraper', width: 160, height: 600 },
  { id: '300x600', label: 'Half Page', width: 300, height: 600 },
  { id: '320x50', label: 'Mobile Banner', width: 320, height: 50 },
  { id: '320x100', label: 'Large Mobile Banner', width: 320, height: 100 },
  { id: '468x60', label: 'Full Banner', width: 468, height: 60 },
  { id: '234x60', label: 'Half Banner', width: 234, height: 60 },
  { id: '120x600', label: 'Skyscraper', width: 120, height: 600 },
  { id: '970x90', label: 'Super Leaderboard', width: 970, height: 90 },
  { id: '970x250', label: 'Billboard', width: 970, height: 250 },
  { id: '300x1050', label: 'Portrait', width: 300, height: 1050 },
  { id: '250x250', label: 'Square', width: 250, height: 250 },
  { id: '200x200', label: 'Small Square', width: 200, height: 200 },
]

export function generateHtml5Banner(project: BannerProject, format: BannerFormat): string {
  const { width, height } = format
  const hasAnimation = project.slides.length > 1
  const design = deriveBannerDesign(project)

  const SECONDS_PER_SLIDE = 3
  const totalDuration = hasAnimation ? project.slides.length * SECONDS_PER_SLIDE : SECONDS_PER_SLIDE

  const pFadeIn = ((0.5 / totalDuration) * 100).toFixed(2)
  const pVisible = ((2.5 / totalDuration) * 100).toFixed(2)
  const pFadeOut = ((3.0 / totalDuration) * 100).toFixed(2)

  const cssKeyframes = hasAnimation ? `
    @keyframes slideAnim {
      0% { opacity: 0; }
      ${pFadeIn}% { opacity: 1; }
      ${pVisible}% { opacity: 1; }
      ${pFadeOut}% { opacity: 0; }
      100% { opacity: 0; }
    }
  ` : ''

  const baseScale = Math.min(width, height)
  const headingSize = Math.max(14, baseScale * 0.12)
  const copySize = Math.max(11, baseScale * 0.07)
  const buttonSize = Math.max(10, baseScale * 0.062)

  return `<!DOCTYPE html>
<html lang="nl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="ad.size" content="width=${width},height=${height}">
  <title>Banner ${width}x${height}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body, html {
      width: ${width}px;
      height: ${height}px;
      overflow: hidden;
      font-family: system-ui, -apple-system, sans-serif;
      background-color: #000;
    }
    .banner-container {
      position: relative;
      width: 100%;
      height: 100%;
      cursor: pointer;
    }
    .bg-image {
      position: absolute;
      inset: 0;
      background-image: url('${project.imageSrc}');
      background-size: cover;
      background-position: center;
      z-index: 1;
    }
    .overlay {
      position: absolute;
      inset: 0;
      background: ${design.overlay};
      z-index: 2;
    }
    .slide {
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      padding: 10%;
      z-index: 3;
      color: ${design.textColor};
      opacity: ${hasAnimation ? 0 : 1};
      ${hasAnimation ? `animation: slideAnim ${totalDuration}s infinite;` : ''}
    }
    ${cssKeyframes}
    ${project.slides.map((_, i) => `.slide:nth-of-type(${i + 1}) { animation-delay: ${i * SECONDS_PER_SLIDE}s; }`).join('\n    ')}
    .heading {
      font-size: ${headingSize}px;
      font-weight: ${design.headingWeight};
      margin-bottom: 8px;
      line-height: 1.2;
      text-shadow: ${design.textShadow};
    }
    .copy {
      font-size: ${copySize}px;
      font-weight: 400;
      line-height: 1.4;
      text-shadow: ${design.textShadow};
    }
    .button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      margin-top: 12px;
      border-radius: ${design.buttonRadius};
      background: ${design.accent};
      color: ${design.buttonText};
      padding: 0.65em 1.15em;
      font-size: ${buttonSize}px;
      font-weight: 800;
      line-height: 1;
      text-shadow: none;
    }
  </style>
</head>
<body>
  <div class="banner-container" id="banner">
    <div class="bg-image"></div>
    <div class="overlay"></div>
    ${project.slides.map(slide => `
    <div class="slide">
      ${slide.texts.map(t => `<div class="${t.role}">${t.value}</div>`).join('\n      ')}
    </div>`).join('')}
  </div>
</body>
</html>`
}

function deriveBannerDesign(project: BannerProject) {
  const styleText = `${project.styleReferenceName ?? ''} ${project.styleReferenceAnalysis ?? ''}`.toLowerCase()
  const hasReference = project.styleMode === 'reference' || Boolean(project.styleReferenceSrc)
  const light = /\b(wit|white|clean|minimal|licht|pastel|beige|cream)\b/.test(styleText)
  const bold = /\b(bold|vet|contrast|zwart|black|neon|sport|sale|actie)\b/.test(styleText)
  const corporate = /\b(corporate|zakelijk|business|blue|blauw|grid|strak)\b/.test(styleText)

  if (hasReference && light) {
    return {
      overlay: 'linear-gradient(90deg, rgba(255,255,255,0.86), rgba(255,255,255,0.38))',
      textColor: '#111111',
      accent: corporate ? '#2563eb' : '#111111',
      buttonText: '#ffffff',
      headingWeight: 800,
      textShadow: 'none',
      buttonRadius: '10px',
    }
  }

  if (hasReference && corporate) {
    return {
      overlay: 'linear-gradient(90deg, rgba(5,12,28,0.82), rgba(5,12,28,0.38))',
      textColor: '#f8fafc',
      accent: '#60a5fa',
      buttonText: '#07111f',
      headingWeight: 750,
      textShadow: '0 2px 12px rgba(0,0,0,0.45)',
      buttonRadius: '8px',
    }
  }

  if (hasReference || bold) {
    return {
      overlay: 'linear-gradient(135deg, rgba(0,0,0,0.72), rgba(0,0,0,0.22))',
      textColor: '#ffffff',
      accent: '#facc15',
      buttonText: '#111111',
      headingWeight: 900,
      textShadow: '0 2px 14px rgba(0,0,0,0.62)',
      buttonRadius: '999px',
    }
  }

  return {
    overlay: 'linear-gradient(135deg, rgba(0,0,0,0.62), rgba(0,0,0,0.24))',
    textColor: '#ffffff',
    accent: '#facc15',
    buttonText: '#111111',
    headingWeight: 800,
    textShadow: '0 2px 12px rgba(0,0,0,0.55)',
    buttonRadius: '999px',
  }
}
