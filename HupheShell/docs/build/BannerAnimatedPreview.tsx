import { useMemo } from 'react'

interface BannerAnimatedPreviewProps {
  slides: { texts: { role: 'heading' | 'copy'; value: string }[] }[]
  imageSrc: string
  width: number
  height: number
  containerWidth: number
}

export default function BannerAnimatedPreview({
  slides,
  imageSrc,
  width,
  height,
  containerWidth,
}: BannerAnimatedPreviewProps) {
  const scale = containerWidth / width
  const scaledHeight = height * scale

  const html = useMemo(() => {
    const safeSlides = slides.length > 0 ? slides : [{ texts: [] }]
    const duration = safeSlides.length * 3
    const framePct = 100 / safeSlides.length
    const fadePct = (0.5 / duration) * 100
    const visiblePct = ((3 - 0.5) / duration) * 100
    const baseFontSize = Math.max(10, Math.min(width, height) * 0.08)
    const bg = escapeHtmlAttribute(imageSrc)

    const frames = safeSlides.map((slide, index) => {
      const headings = slide.texts.filter((text) => text.role === 'heading' && text.value.trim())
      const copy = slide.texts.filter((text) => text.role === 'copy' && text.value.trim())
      const headingHtml = headings.length > 0
        ? headings.map((text) => `<div>${escapeHtml(text.value)}</div>`).join('')
        : '<div>&nbsp;</div>'
      const copyHtml = copy.length > 0
        ? copy.map((text) => `<div>${escapeHtml(text.value)}</div>`).join('')
        : ''

      return `
        <section class="frame" style="animation-delay: ${index * 3}s;">
          <div class="content">
            <div class="heading">${headingHtml}</div>
            ${copyHtml ? `<div class="copy">${copyHtml}</div>` : ''}
          </div>
        </section>
      `
    }).join('')

    return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      * { box-sizing: border-box; }
      html, body {
        margin: 0;
        width: ${width}px;
        height: ${height}px;
        overflow: hidden;
        background: #0a0a0a;
        font-family: Arial, Helvetica, sans-serif;
      }
      .stage {
        position: relative;
        width: ${width}px;
        height: ${height}px;
        overflow: hidden;
        background-color: #0a0a0a;
        background-image: ${bg ? `url("${bg}")` : 'none'};
        background-size: cover;
        background-position: center;
      }
      .stage::before {
        content: "";
        position: absolute;
        inset: 0;
        background: rgba(0, 0, 0, 0.4);
      }
      .frame {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: ${Math.max(12, baseFontSize * 1.1)}px;
        opacity: 0;
        animation: hupheFrameFade ${duration}s linear infinite;
      }
      .content {
        position: relative;
        z-index: 1;
        width: 100%;
        text-align: center;
        color: #fff;
        text-shadow: 0 2px 12px rgba(0, 0, 0, 0.45);
      }
      .heading {
        font-size: ${baseFontSize * 1.35}px;
        line-height: 0.95;
        font-weight: 800;
        letter-spacing: 0;
      }
      .copy {
        margin-top: ${Math.max(6, baseFontSize * 0.45)}px;
        font-size: ${baseFontSize * 0.68}px;
        line-height: 1.18;
        font-weight: 600;
        color: rgba(255, 255, 255, 0.86);
      }
      @keyframes hupheFrameFade {
        0% {
          opacity: 0;
          transform: translateY(8px);
        }
        ${fadePct}% {
          opacity: 1;
          transform: translateY(0);
        }
        ${visiblePct}% {
          opacity: 1;
          transform: translateY(0);
        }
        ${framePct}% {
          opacity: 0;
          transform: translateY(-8px);
        }
        100% {
          opacity: 0;
          transform: translateY(-8px);
        }
      }
    </style>
  </head>
  <body>
    <main class="stage">
      ${frames}
    </main>
  </body>
</html>`
  }, [slides, imageSrc, width, height])

  return (
    <div
      style={{ width: containerWidth, height: scaledHeight }}
      className="overflow-hidden rounded-xl border border-white/[0.10]"
    >
      <iframe
        srcDoc={html}
        sandbox="allow-scripts"
        title="Banner animatie preview"
        style={{
          width,
          height,
          border: 'none',
          display: 'block',
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
        }}
      />
    </div>
  )
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function escapeHtmlAttribute(value: string) {
  return escapeHtml(value).replace(/\n/g, '')
}
