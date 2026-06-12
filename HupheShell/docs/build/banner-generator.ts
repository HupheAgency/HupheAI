export interface BannerSlide {
    id: string;
    texts: { role: 'heading' | 'copy'; value: string }[];
}

export interface BannerProject {
    id: string;
    imageSrc: string; // file:// path of base64 data URL
    slides: BannerSlide[];
    enabledFormats: string[];
    createdAt: string;
    updatedAt: string;
}

export interface BannerFormat {
    id: string;
    label: string;
    width: number;
    height: number;
}

export interface GeneratedBanner {
    formatId: string;
    html: string;
}

/**
 * Genereert een standalone HTML5 display banner (IAB standaard) op basis van een BannerProject.
 * Geen externe dependencies, alles (CSS, animaties, achtergrond) zit inline in de HTML.
 */
export function generateHtml5Banner(project: BannerProject, format: BannerFormat): string {
    const { width, height } = format;
    const hasAnimation = project.slides.length > 1;

    // Animatie timing: 3 seconde per slide in totaal
    // 0.0 - 0.5s: fade in
    // 0.5 - 2.5s: zichtbaar
    // 2.5 - 3.0s: fade out
    const SECONDS_PER_SLIDE = 3;
    const totalDuration = hasAnimation ? project.slides.length * SECONDS_PER_SLIDE : SECONDS_PER_SLIDE;

    const pFadeIn = ((0.5 / totalDuration) * 100).toFixed(2);
    const pVisible = ((2.5 / totalDuration) * 100).toFixed(2);
    const pFadeOut = ((3.0 / totalDuration) * 100).toFixed(2);

    const cssKeyframes = hasAnimation ? `
    @keyframes slideAnim {
      0% { opacity: 0; }
      ${pFadeIn}% { opacity: 1; }
      ${pVisible}% { opacity: 1; }
      ${pFadeOut}% { opacity: 0; }
      100% { opacity: 0; }
    }
  ` : '';

    // Responsieve lettergroottes (geschaald naar kleinste dimensie van de banner)
    const baseScale = Math.min(width, height);
    const headingSize = Math.max(14, baseScale * 0.12);
    const copySize = Math.max(11, baseScale * 0.07);

    // Bouw de HTML string
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
      background-color: rgba(0, 0, 0, 0.4);
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
      color: #fff;
      opacity: ${hasAnimation ? 0 : 1};
      ${hasAnimation ? `animation: slideAnim ${totalDuration}s infinite;` : ''}
    }
    ${cssKeyframes}
    ${project.slides.map((_, i) => `.slide:nth-of-type(${i + 1}) { animation-delay: ${i * SECONDS_PER_SLIDE}s; }`).join('\n    ')}
    .heading {
      font-size: ${headingSize}px;
      font-weight: 800;
      margin-bottom: 8px;
      line-height: 1.2;
      text-shadow: 1px 1px 4px rgba(0,0,0,0.6);
    }
    .copy {
      font-size: ${copySize}px;
      font-weight: 400;
      line-height: 1.4;
      text-shadow: 1px 1px 3px rgba(0,0,0,0.6);
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
</html>`;
}

/* =========================================================================
   VOOR CLAUDE: IPC Handler implementatie voor in src/main/index.ts
   =========================================================================

import { generateHtml5Banner } from './lib/banner-generator'
// IAB_FORMATS array uit de types importeren of declareren

ipcMain.handle('banner:generate', async (_event, project: BannerProject) => {
  try {
    const banners: GeneratedBanner[] = []
    
    for (const formatId of project.enabledFormats) {
      const format = IAB_FORMATS.find(f => f.id === formatId)
      if (!format) continue
      
      banners.push({
        formatId,
        html: generateHtml5Banner(project, format)
      })
    }
    
    return { ok: true, banners }
  } catch (error: any) {
    return { ok: false, error: error.message || 'Unknown error during banner generation' }
  }
})

========================================================================= */