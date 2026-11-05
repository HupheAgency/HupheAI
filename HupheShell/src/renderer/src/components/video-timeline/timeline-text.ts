import { textClips, type TimelineProject, type TimelineText } from '../../../../shared/video-timeline'

const FONT = '-apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif'

/** Draws a title on a frame of the project's size. Used by the preview and, as a transparent PNG, by the export. */
export function drawTitle(context: CanvasRenderingContext2D, text: TimelineText, width: number, height: number, alpha = 1) {
  const lines = text.content.split('\n')
  const size = Math.max(4, Math.round(text.size * height))
  context.save()
  context.globalAlpha = alpha
  context.font = `${text.bold ? '700' : '400'} ${size}px ${FONT}`
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  const lineHeight = size * 1.2
  const top = text.y * height - (lines.length - 1) * lineHeight / 2
  if (text.background) {
    const widest = Math.max(...lines.map(line => context.measureText(line).width), 1)
    const pad = size * 0.4
    context.fillStyle = 'rgba(0,0,0,0.6)'
    context.fillRect(text.x * width - widest / 2 - pad, top - lineHeight / 2 - pad / 2, widest + pad * 2, lines.length * lineHeight + pad)
  } else {
    context.shadowColor = 'rgba(0,0,0,0.65)'
    context.shadowBlur = size * 0.15
    context.shadowOffsetY = size * 0.04
  }
  context.fillStyle = text.color
  lines.forEach((line, i) => context.fillText(line, text.x * width, top + i * lineHeight))
  context.restore()
}

/** One transparent full-frame PNG per title clip, as data URLs keyed by clip id, for the exporter. */
export function renderTitleImages(project: TimelineProject): Record<string, string> {
  const images: Record<string, string> = {}
  for (const clip of textClips(project)) {
    const canvas = document.createElement('canvas')
    canvas.width = project.width; canvas.height = project.height
    const context = canvas.getContext('2d')
    if (!context || !clip.text?.content.trim()) continue
    drawTitle(context, clip.text, project.width, project.height)
    images[clip.id] = canvas.toDataURL('image/png')
  }
  return images
}
