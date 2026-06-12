/**
 * Render de shapes-laag van een layout naar een PNG dataURL.
 * Gebruikt een offscreen Canvas op 1920×1080.
 * Achtergrondkleur + shapes (fills, SVG paths, gradients) worden getekend;
 * tekstvelden en image slots worden NIET meegenomen (die worden als placeholders
 * in Keynote ingevoegd).
 */

import type { LayoutSpec, ShapeEntry } from '../components/WebSlidePreview'

const CANVAS_W = 1920
const CANVAS_H = 1080

function hexToRgba(hex: string, alpha = 1): string {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : alpha
  return `rgba(${r},${g},${b},${a})`
}

function drawShape(ctx: CanvasRenderingContext2D, shape: ShapeEntry) {
  const { posX, posY, width, height, fillColor, fillGradient, fillGradientAngle, opacity } = shape as any
  const svgPath = (shape as any).svgStrokePath as string | undefined
  const strokeW = (shape as any).svgStrokeWidth as number | undefined
  const strokeCap = (shape as any).svgStrokeLinecap as CanvasLineCap | undefined
  const strokeJoin = (shape as any).svgStrokeLinejoin as CanvasLineJoin | undefined

  ctx.save()
  ctx.globalAlpha = typeof opacity === 'number' ? opacity : 1

  if (svgPath) {
    // SVG path shapes (zigzag, etc.) — draw as stroked path
    const scaleX = (width ?? 1920) / 1920
    const scaleY = (height ?? 1080) / 1080
    ctx.translate(posX ?? 0, posY ?? 0)
    ctx.scale(scaleX, scaleY)

    const path = new Path2D(svgPath)
    if (fillColor && fillColor !== 'transparent' && fillColor !== 'none') {
      ctx.fillStyle = hexToRgba(fillColor)
      ctx.fill(path)
    }
    if (strokeW) {
      ctx.strokeStyle = hexToRgba(fillColor ?? '#000000')
      ctx.lineWidth = strokeW
      if (strokeCap) ctx.lineCap = strokeCap
      if (strokeJoin) ctx.lineJoin = strokeJoin
      ctx.stroke(path)
    }
  } else {
    // Rectangle shapes
    const x = posX ?? 0
    const y = posY ?? 0
    const w = width ?? CANVAS_W
    const h = height ?? CANVAS_H

    if (fillGradient && Array.isArray(fillGradient)) {
      const angle = ((fillGradientAngle ?? 90) * Math.PI) / 180
      const cx = x + w / 2, cy = y + h / 2
      const len = Math.sqrt(w * w + h * h) / 2
      const grad = ctx.createLinearGradient(
        cx - Math.cos(angle) * len, cy - Math.sin(angle) * len,
        cx + Math.cos(angle) * len, cy + Math.sin(angle) * len,
      )
      for (const stop of fillGradient) {
        grad.addColorStop(stop.position ?? 0, hexToRgba(stop.color, stop.alpha ?? 1))
      }
      ctx.fillStyle = grad
    } else if (fillColor && fillColor !== 'transparent') {
      ctx.fillStyle = hexToRgba(fillColor)
    } else {
      ctx.restore()
      return
    }

    const r = (shape as any).cornerRadius ?? 0
    if (r > 0) {
      ctx.beginPath()
      ctx.roundRect(x, y, w, h, r)
      ctx.fill()
    } else {
      ctx.fillRect(x, y, w, h)
    }
  }

  ctx.restore()
}

export async function renderLayoutShapesToPng(layout: LayoutSpec): Promise<string> {
  const canvas = document.createElement('canvas')
  canvas.width = CANVAS_W
  canvas.height = CANVAS_H

  const ctx = canvas.getContext('2d')!

  // Achtergrondkleur
  const bgColor = (layout as any).backgroundColor
  if (bgColor && bgColor !== 'transparent') {
    ctx.fillStyle = hexToRgba(bgColor)
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H)
  }

  // Teken shapes
  for (const shape of layout.shapes ?? []) {
    drawShape(ctx, shape as ShapeEntry)
  }

  // Assets (decoratieve afbeeldingen) als afbeelding renderen
  const assets = (layout as any).assets ?? []
  for (const asset of assets) {
    if (!asset.dataUrl) continue
    await new Promise<void>((resolve) => {
      const img = new Image()
      img.onload = () => {
        ctx.save()
        ctx.globalAlpha = asset.opacity ?? 1
        ctx.drawImage(img, asset.posX ?? 0, asset.posY ?? 0, asset.width ?? 100, asset.height ?? 100)
        ctx.restore()
        resolve()
      }
      img.onerror = () => resolve()
      img.src = asset.dataUrl
    })
  }

  return canvas.toDataURL('image/png')
}

export async function renderAllLayoutsToPngs(
  templateData: { layouts: LayoutSpec[] },
): Promise<Record<string, string>> {
  const result: Record<string, string> = {}
  for (const layout of templateData.layouts) {
    const name = (layout as any).name as string
    if (!name) continue
    result[name] = await renderLayoutShapesToPng(layout)
  }
  return result
}
