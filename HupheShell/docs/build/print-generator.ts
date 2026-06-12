export interface PrintFormat {
    id: 'A4' | 'A5' | 'A3' | 'SRA3' | 'DL';
    label: string;
    widthMm: number;
    heightMm: number;
}

export interface PrintPayload {
    title: string;
    body: string;
    imageSrc?: string; // base64 data URL
    format: PrintFormat['id'];
}

export interface GeneratedPrint {
    formatId: string;
    html: string;
}

export const PRINT_FORMATS: PrintFormat[] = [
    { id: 'A4', label: 'A4 (210 x 297 mm)', widthMm: 210, heightMm: 297 },
    { id: 'A3', label: 'A3 (297 x 420 mm)', widthMm: 297, heightMm: 420 },
    { id: 'A5', label: 'A5 (148 x 210 mm)', widthMm: 148, heightMm: 210 },
    { id: 'SRA3', label: 'SRA3 (320 x 450 mm)', widthMm: 320, heightMm: 450 },
    { id: 'DL', label: 'DL (99 x 210 mm)', widthMm: 99, heightMm: 210 },
];

/**
 * Genereert een standalone HTML5 document ontworpen voor print (PDF/Papier) op basis van mm-afmetingen.
 */
export function generateHtml5Print(payload: PrintPayload, format: PrintFormat): string {
    const { widthMm, heightMm, id } = format;

    // Proportionele lettergroottes op basis van het documentformaat in mm
    const baseScale = Math.min(widthMm, heightMm);
    const titleSize = Math.max(16, baseScale * 0.15);
    const bodySize = Math.max(10, baseScale * 0.05);

    const bgStyle = payload.imageSrc
        ? `background-image: url('${payload.imageSrc}'); background-size: cover; background-position: center;`
        : `background-color: #0a0a0a;`;

    return `<!DOCTYPE html>
<html lang="nl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="print.size" content="format=${id}">
  <title>Print ${id}</title>
  <style>
    @page {
      size: ${widthMm}mm ${heightMm}mm;
      margin: 0;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body, html {
      width: ${widthMm}mm;
      height: ${heightMm}mm;
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
      font-size: ${titleSize}mm;
      font-weight: 800;
      margin-bottom: ${titleSize * 0.5}mm;
      line-height: 1.2;
      text-shadow: 1px 1px 4px rgba(0,0,0,0.8);
    }
    .body {
      font-size: ${bodySize}mm;
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
</html>`;
}