export interface PrintFormat {
  id: string
  label: string
  group: 'Offline print' | 'Social'
  width: number
  height: number
  unit: 'mm' | 'px'
}

export interface PrintPayload {
  title: string
  body: string
  imageSrc?: string
  format?: PrintFormat['id']
  formats?: PrintFormat['id'][]
}

export interface GeneratedPrint {
  formatId: string
  html: string
}

export const PRINT_FORMATS: PrintFormat[] = [
  { id: 'A4', label: 'A4', group: 'Offline print', width: 210, height: 297, unit: 'mm' },
  { id: 'A3', label: 'A3', group: 'Offline print', width: 297, height: 420, unit: 'mm' },
  { id: 'A5', label: 'A5', group: 'Offline print', width: 148, height: 210, unit: 'mm' },
  { id: 'SRA3', label: 'SRA3', group: 'Offline print', width: 320, height: 450, unit: 'mm' },
  { id: 'DL', label: 'DL', group: 'Offline print', width: 99, height: 210, unit: 'mm' },
  { id: 'IG_SQUARE', label: 'Instagram vierkant', group: 'Social', width: 1080, height: 1080, unit: 'px' },
  { id: 'IG_PORTRAIT', label: 'Instagram portret', group: 'Social', width: 1080, height: 1350, unit: 'px' },
  { id: 'IG_STORY', label: 'Story / Reels', group: 'Social', width: 1080, height: 1920, unit: 'px' },
  { id: 'LINKEDIN', label: 'LinkedIn post', group: 'Social', width: 1200, height: 627, unit: 'px' },
  { id: 'SOCIAL_LANDSCAPE', label: 'Social landscape', group: 'Social', width: 1920, height: 1080, unit: 'px' },
]

export function generateHtml5Print(payload: PrintPayload, format: PrintFormat): string {
  const { width, height, unit, id } = format
  const widthCss = `${width}${unit}`
  const heightCss = `${height}${unit}`

  const baseScale = Math.min(width, height)
  const titleSize = unit === 'mm' ? Math.max(16, baseScale * 0.15) : Math.max(48, baseScale * 0.09)
  const bodySize = unit === 'mm' ? Math.max(10, baseScale * 0.05) : Math.max(24, baseScale * 0.035)
  const titleUnit = unit
  const bodyUnit = unit

  const bgStyle = payload.imageSrc
    ? `background-image: url('${payload.imageSrc}'); background-size: cover; background-position: center;`
    : `background-color: #0a0a0a;`

  return `<!DOCTYPE html>
<html lang="nl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="media.size" content="format=${id}">
  <title>Media ${id}</title>
  <style>
    @page {
      size: ${widthCss} ${heightCss};
      margin: 0;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body, html {
      width: ${widthCss};
      height: ${heightCss};
      font-family: system-ui, -apple-system, sans-serif;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .print-container {
      position: relative;
      width: 100%;
      height: 100%;
      ${bgStyle}
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      text-align: center;
      padding: 10%;
      color: #ffffff;
    }
    .overlay {
      position: absolute;
      inset: 0;
      background-color: rgba(0, 0, 0, 0.4);
      z-index: 1;
    }
    .content {
      position: relative;
      z-index: 2;
    }
    .title {
      font-size: ${titleSize}${titleUnit};
      font-weight: 800;
      margin-bottom: ${titleSize * 0.5}${titleUnit};
      line-height: 1.2;
      text-shadow: 1px 1px 4px rgba(0,0,0,0.8);
    }
    .body {
      font-size: ${bodySize}${bodyUnit};
      font-weight: 400;
      line-height: 1.5;
      text-shadow: 1px 1px 3px rgba(0,0,0,0.8);
      max-width: 80%;
      margin: 0 auto;
    }
  </style>
</head>
<body>
  <div class="print-container">
    ${payload.imageSrc ? '<div class="overlay"></div>' : ''}
    <div class="content">
      <div class="title">${payload.title}</div>
      <div class="body">${payload.body}</div>
    </div>
  </div>
</body>
</html>`
}
