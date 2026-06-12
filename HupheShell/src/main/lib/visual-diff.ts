import sharp from 'sharp'

/**
 * Deterministic visual diff (Phase 1c) — the "judge" of the calibration loop.
 *
 * Compares a Keynote reference render against the HTML render of the same layout
 * and produces objective numbers: a global similarity (SSIM), a mean pixel
 * difference, optional per-element region scores, and a heatmap. The AI loop
 * proposes changes; THIS module decides whether they are accepted (a change is
 * only kept if it improves the score). No model judgement is trusted here.
 */

export interface RegionRect {
  /** Stable element id from parse_key.py (e.g. "shape:3110211"). */
  id: string
  /** Bounds in template coordinates (same space as parse_key posX/posY/width/height). */
  posX: number
  posY: number
  width: number
  height: number
}

export interface RegionScore {
  id: string
  /** SSIM within this region (1 = identical, lower = worse). */
  ssim: number
  /** Mean per-pixel difference within the region, 0..1. */
  pixelDiff: number
}

export interface DiffResult {
  /** Global structural similarity, 1 = identical. */
  ssim: number
  /** Global mean per-pixel difference, 0..1 (0 = identical). */
  pixelDiff: number
  /** Image size the comparison ran at. */
  width: number
  height: number
  /** Per-region scores, sorted worst-first, when regions were supplied. */
  regions: RegionScore[]
  /** Diff heatmap PNG (brighter = larger difference), base64 data URL. */
  heatmap: string
}

interface Gray {
  data: Uint8ClampedArray
  width: number
  height: number
}

/** Decode a PNG/JPEG buffer to a fixed-size grayscale pixel plane. */
async function toGray(buf: Buffer, width: number, height: number): Promise<Gray> {
  const { data } = await sharp(buf)
    .resize(width, height, { fit: 'fill' })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true })
  return { data: new Uint8ClampedArray(data), width, height }
}

const C1 = (0.01 * 255) ** 2
const C2 = (0.03 * 255) ** 2

/**
 * Windowed SSIM over a rectangular area of two grayscale planes.
 * Uses non-overlapping 8×8 windows — a good accuracy/speed tradeoff.
 * Returns the mean SSIM across windows (1 = identical).
 */
function ssimRegion(
  a: Gray,
  b: Gray,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  win = 8,
): number {
  let total = 0
  let count = 0
  for (let wy = y0; wy + win <= y1; wy += win) {
    for (let wx = x0; wx + win <= x1; wx += win) {
      let sumA = 0, sumB = 0, sumAA = 0, sumBB = 0, sumAB = 0
      const n = win * win
      for (let yy = 0; yy < win; yy++) {
        const row = (wy + yy) * a.width
        for (let xx = 0; xx < win; xx++) {
          const idx = row + wx + xx
          const va = a.data[idx]
          const vb = b.data[idx]
          sumA += va; sumB += vb
          sumAA += va * va; sumBB += vb * vb
          sumAB += va * vb
        }
      }
      const muA = sumA / n
      const muB = sumB / n
      const varA = sumAA / n - muA * muA
      const varB = sumBB / n - muB * muB
      const cov = sumAB / n - muA * muB
      const ssim =
        ((2 * muA * muB + C1) * (2 * cov + C2)) /
        ((muA * muA + muB * muB + C1) * (varA + varB + C2))
      total += ssim
      count++
    }
  }
  return count > 0 ? total / count : 1
}

/** Mean per-pixel |difference| over a region, normalised to 0..1. */
function pixelDiffRegion(
  a: Gray,
  b: Gray,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): number {
  let sum = 0
  let count = 0
  for (let yy = y0; yy < y1; yy++) {
    const row = yy * a.width
    for (let xx = x0; xx < x1; xx++) {
      const idx = row + xx
      sum += Math.abs(a.data[idx] - b.data[idx])
      count++
    }
  }
  return count > 0 ? sum / count / 255 : 0
}

/** Build a red-on-black heatmap PNG (base64 data URL) from the abs difference. */
async function buildHeatmap(a: Gray, b: Gray): Promise<string> {
  const { width, height } = a
  const rgb = Buffer.alloc(width * height * 3)
  for (let i = 0; i < a.data.length; i++) {
    const d = Math.abs(a.data[i] - b.data[i])
    rgb[i * 3] = d            // red channel = difference magnitude
    rgb[i * 3 + 1] = 0
    rgb[i * 3 + 2] = 0
  }
  const png = await sharp(rgb, { raw: { width, height, channels: 3 } }).png().toBuffer()
  return `data:image/png;base64,${png.toString('base64')}`
}

export interface CompareOptions {
  /** Comparison resolution (reference is resized to this). Default 960×540. */
  width?: number
  height?: number
  /** Template coordinate space, to map region rects into image pixels. */
  templateWidth?: number
  templateHeight?: number
  /** Element rects (in template coordinates) to score individually. */
  regions?: RegionRect[]
}

/**
 * Compare a reference image (Keynote) against a candidate (HTML).
 * Both are resized to the same comparison resolution before scoring.
 */
export async function compareImages(
  referencePng: Buffer,
  candidatePng: Buffer,
  opts: CompareOptions = {},
): Promise<DiffResult> {
  const width = opts.width ?? 960
  const height = opts.height ?? 540

  const [ref, cand] = await Promise.all([
    toGray(referencePng, width, height),
    toGray(candidatePng, width, height),
  ])

  const ssim = ssimRegion(ref, cand, 0, 0, width, height)
  const pixelDiff = pixelDiffRegion(ref, cand, 0, 0, width, height)

  const regions: RegionScore[] = []
  if (opts.regions && opts.templateWidth && opts.templateHeight) {
    const sx = width / opts.templateWidth
    const sy = height / opts.templateHeight
    for (const r of opts.regions) {
      const x0 = Math.max(0, Math.floor(r.posX * sx))
      const y0 = Math.max(0, Math.floor(r.posY * sy))
      const x1 = Math.min(width, Math.ceil((r.posX + r.width) * sx))
      const y1 = Math.min(height, Math.ceil((r.posY + r.height) * sy))
      if (x1 - x0 < 2 || y1 - y0 < 2) continue
      regions.push({
        id: r.id,
        ssim: ssimRegion(ref, cand, x0, y0, x1, y1),
        pixelDiff: pixelDiffRegion(ref, cand, x0, y0, x1, y1),
      })
    }
    // Worst (lowest SSIM) first — that's where the AI loop should focus.
    regions.sort((p, q) => p.ssim - q.ssim)
  }

  const heatmap = await buildHeatmap(ref, cand)
  return { ssim, pixelDiff, width, height, regions, heatmap }
}
