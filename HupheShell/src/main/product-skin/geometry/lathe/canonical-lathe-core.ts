export interface BinaryMask { width: number; height: number; data: Uint8Array }
export interface RgbaImage { width: number; height: number; data: Uint8Array }
export interface LatheProfilePoint { sourceY: number; centerX: number; radiusPx: number; v: number }
export interface LatheProfile {
  sourceWidth: number
  sourceHeight: number
  top: number
  bottom: number
  axisX: number
  maxRadiusPx: number
  points: LatheProfilePoint[]
}
export interface LatheGeometry {
  positions: Float32Array
  normals: Float32Array
  uvs: Float32Array
  indices: Uint32Array
  rings: number
  radialSegments: number
}
export interface CanonicalFlatmap {
  width: number
  height: number
  sourceRgba: Uint8Array
  confidence: Uint8Array
  unknownMask: Uint8Array
}

export interface CanonicalFlatmapLayer {
  flatmap: CanonicalFlatmap
  angleRadians: number
}

export interface CanonicalFlatmapComposite {
  compositeRgba: Uint8Array
  reconstructionRgba: Uint8Array
  confidence: Uint8Array
  unresolvedMask: Uint8Array
  reconstructedPixels: number
}

export interface ExtractProfileOptions {
  profileSamples?: number
  medianRadius?: number
  smoothRadius?: number
  minimumRowWidth?: number
  axisX?: number
  top?: number
  bottom?: number
}

interface RowExtent {
  y: number
  left: number
  right: number
  center: number
}

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value))

function median(values: number[]): number {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

function assertMask(mask: BinaryMask): void {
  if (!Number.isInteger(mask.width) || mask.width <= 0) throw new Error('Ongeldige maskerbreedte.')
  if (!Number.isInteger(mask.height) || mask.height <= 0) throw new Error('Ongeldige maskerhoogte.')
  if (mask.data.length !== mask.width * mask.height) throw new Error('Maskerdata heeft een ongeldige lengte.')
}

function assertImage(image: RgbaImage): void {
  if (!Number.isInteger(image.width) || image.width <= 0) throw new Error('Ongeldige afbeeldingsbreedte.')
  if (!Number.isInteger(image.height) || image.height <= 0) throw new Error('Ongeldige afbeeldingshoogte.')
  if (image.data.length !== image.width * image.height * 4) throw new Error('RGBA-data heeft een ongeldige lengte.')
}

function filterWindow(values: number[], radius: number, reducer: (window: number[]) => number): number[] {
  if (radius <= 0) return [...values]
  return values.map((_, index) => reducer(values.slice(
    Math.max(0, index - radius),
    Math.min(values.length, index + radius + 1),
  )))
}

function interpolateExtent(rows: RowExtent[], sourceY: number): RowExtent {
  if (sourceY <= rows[0].y) return rows[0]
  if (sourceY >= rows[rows.length - 1].y) return rows[rows.length - 1]
  let low = 0
  let high = rows.length - 1
  while (low + 1 < high) {
    const middle = Math.floor((low + high) / 2)
    if (rows[middle].y <= sourceY) low = middle
    else high = middle
  }
  const a = rows[low]
  const b = rows[high]
  const t = (sourceY - a.y) / Math.max(1e-8, b.y - a.y)
  return {
    y: sourceY,
    left: a.left + (b.left - a.left) * t,
    right: a.right + (b.right - a.right) * t,
    center: a.center + (b.center - a.center) * t,
  }
}

export function extractLatheProfile(
  mask: BinaryMask,
  sampleCountOrOptions: number | ExtractProfileOptions = 192,
): LatheProfile {
  assertMask(mask)
  const options = typeof sampleCountOrOptions === 'number'
    ? { profileSamples: sampleCountOrOptions }
    : sampleCountOrOptions
  const minimumRowWidth = Math.max(3, options.minimumRowWidth ?? 3)
  const rows: RowExtent[] = []
  for (let y = 0; y < mask.height; y++) {
    let left = mask.width
    let right = -1
    for (let x = 0; x < mask.width; x++) {
      if (mask.data[y * mask.width + x] === 0) continue
      left = Math.min(left, x)
      right = Math.max(right, x)
    }
    if (right - left + 1 >= minimumRowWidth) rows.push({ y, left, right, center: (left + right) / 2 })
  }
  if (rows.length < 8) throw new Error('Productmasker bevat te weinig bruikbare rijen voor een lathe-profiel.')
  const detectedTop = rows[0].y
  const detectedBottom = rows[rows.length - 1].y
  const top = clamp(options.top ?? detectedTop, detectedTop, detectedBottom - 1)
  const bottom = clamp(options.bottom ?? detectedBottom, top + 1, detectedBottom)
  const axisX = clamp(
    options.axisX ?? median(rows.filter((row) => row.y >= top && row.y <= bottom).map((row) => row.center)),
    0,
    mask.width - 1,
  )
  const sampleCount = Math.max(16, Math.floor(options.profileSamples ?? 192))
  const sampled: LatheProfilePoint[] = []
  for (let index = 0; index < sampleCount; index++) {
    const sourceY = top + (index / Math.max(1, sampleCount - 1)) * (bottom - top)
    const extent = interpolateExtent(rows, sourceY)
    const leftRadius = Math.max(0, axisX - extent.left)
    const rightRadius = Math.max(0, extent.right - axisX)
    sampled.push({
      sourceY,
      centerX: axisX,
      radiusPx: Math.max(0.5, Math.min(leftRadius, rightRadius)),
      v: 0,
    })
  }
  const medianRadius = Math.max(0, Math.floor(options.medianRadius ?? 2))
  const smoothRadius = Math.max(0, Math.floor(options.smoothRadius ?? 2))
  const medianRadii = filterWindow(sampled.map((point) => point.radiusPx), medianRadius, median)
  const radii = filterWindow(medianRadii, smoothRadius, (window) => (
    window.reduce((sum, value) => sum + value, 0) / Math.max(1, window.length)
  ))
  const smoothed = sampled.map((point, index) => ({ ...point, radiusPx: radii[index] }))
  let arcLength = 0
  const arcs = [0]
  for (let index = 1; index < smoothed.length; index++) {
    arcLength += Math.hypot(smoothed[index].sourceY - smoothed[index - 1].sourceY, smoothed[index].radiusPx - smoothed[index - 1].radiusPx)
    arcs.push(arcLength)
  }
  // Pixel row zero is top, while canonical V=1 is top.
  smoothed.forEach((point, index) => { point.v = arcLength > 0 ? 1 - arcs[index] / arcLength : 1 - index / (smoothed.length - 1) })
  return { sourceWidth: mask.width, sourceHeight: mask.height, top, bottom, axisX, maxRadiusPx: Math.max(...smoothed.map((point) => point.radiusPx)), points: smoothed }
}

export function buildCanonicalLatheGeometry(profile: LatheProfile, radialSegments = 192, worldHeight = 1): LatheGeometry {
  const columns = radialSegments + 1
  const positions = new Float32Array(profile.points.length * columns * 3)
  const normals = new Float32Array(positions.length)
  const uvs = new Float32Array(profile.points.length * columns * 2)
  const sourceHeight = Math.max(1, profile.bottom - profile.top)
  for (let ring = 0; ring < profile.points.length; ring++) {
    const point = profile.points[ring]
    const y = worldHeight * (0.5 - (point.sourceY - profile.top) / sourceHeight)
    const radius = worldHeight * point.radiusPx / sourceHeight
    const previous = profile.points[Math.max(0, ring - 1)]
    const next = profile.points[Math.min(profile.points.length - 1, ring + 1)]
    const slope = ((next.radiusPx - previous.radiusPx) / Math.max(1, next.sourceY - previous.sourceY))
    for (let segment = 0; segment <= radialSegments; segment++) {
      const u = segment / radialSegments
      const theta = u * Math.PI * 2 + Math.PI
      const sin = Math.sin(theta)
      const cos = Math.cos(theta)
      const vertex = ring * columns + segment
      positions.set([radius * sin, y, radius * cos], vertex * 3)
      const normalLength = Math.hypot(sin, slope, cos)
      normals.set([sin / normalLength, slope / normalLength, cos / normalLength], vertex * 3)
      uvs.set([u, point.v], vertex * 2)
    }
  }
  const indices = new Uint32Array((profile.points.length - 1) * radialSegments * 6)
  let cursor = 0
  for (let ring = 0; ring < profile.points.length - 1; ring++) {
    for (let segment = 0; segment < radialSegments; segment++) {
      const a = ring * columns + segment
      const b = a + columns
      indices.set([a, b, a + 1, a + 1, b, b + 1], cursor)
      cursor += 6
    }
  }
  return { positions, normals, uvs, indices, rings: profile.points.length, radialSegments }
}

function sampleBilinear(image: RgbaImage, x: number, y: number): [number, number, number, number] {
  const x0 = clamp(Math.floor(x), 0, image.width - 1), y0 = clamp(Math.floor(y), 0, image.height - 1)
  const x1 = Math.min(image.width - 1, x0 + 1), y1 = Math.min(image.height - 1, y0 + 1)
  const tx = clamp(x - x0, 0, 1), ty = clamp(y - y0, 0, 1)
  const output = [0, 0, 0, 0]
  for (let channel = 0; channel < 4; channel++) {
    const top = image.data[(y0 * image.width + x0) * 4 + channel] * (1 - tx) + image.data[(y0 * image.width + x1) * 4 + channel] * tx
    const bottom = image.data[(y1 * image.width + x0) * 4 + channel] * (1 - tx) + image.data[(y1 * image.width + x1) * 4 + channel] * tx
    output[channel] = Math.round(top * (1 - ty) + bottom * ty)
  }
  return output as [number, number, number, number]
}

export function projectSourceToCanonicalFlatmap(source: RgbaImage, mask: BinaryMask, profile: LatheProfile, width = 2048, height = 2048, maxSourceAngleDegrees = 78): CanonicalFlatmap {
  assertImage(source)
  assertMask(mask)
  if (source.width !== mask.width || source.height !== mask.height) {
    throw new Error('Bronafbeelding en productmasker moeten dezelfde afmetingen hebben.')
  }
  const sourceRgba = new Uint8Array(width * height * 4)
  const confidence = new Uint8Array(width * height)
  const unknownMask = new Uint8Array(width * height).fill(255)
  const maxAngle = maxSourceAngleDegrees * Math.PI / 180
  for (let y = 0; y < height; y++) {
    const normalizedY = y / Math.max(1, height - 1)
    const profilePosition = normalizedY * (profile.points.length - 1)
    const profileIndex = clamp(Math.floor(profilePosition), 0, profile.points.length - 1)
    const nextIndex = Math.min(profile.points.length - 1, profileIndex + 1)
    const profileT = profilePosition - profileIndex
    const current = profile.points[profileIndex]
    const next = profile.points[nextIndex]
    const point = {
      sourceY: current.sourceY + (next.sourceY - current.sourceY) * profileT,
      radiusPx: current.radiusPx + (next.radiusPx - current.radiusPx) * profileT,
    }
    for (let x = 0; x < width; x++) {
      const u = x / Math.max(1, width - 1)
      const theta = u * Math.PI * 2 - Math.PI
      if (Math.abs(theta) > Math.PI / 2) continue
      if (Math.abs(theta) > maxAngle) continue
      const sourceX = profile.axisX + Math.sin(theta) * point.radiusPx
      const sourceY = point.sourceY
      const maskX = clamp(Math.round(sourceX), 0, mask.width - 1), maskY = clamp(Math.round(sourceY), 0, mask.height - 1)
      if (mask.data[maskY * mask.width + maskX] === 0) continue
      const sample = sampleBilinear(source, sourceX, sourceY)
      const pixel = y * width + x
      sourceRgba.set([sample[0], sample[1], sample[2], 255], pixel * 4)
      confidence[pixel] = Math.round(Math.max(0, Math.cos(theta)) * 255)
      unknownMask[pixel] = 0
    }
  }
  return { width, height, sourceRgba, confidence, unknownMask }
}

export function composeCanonicalFlatmaps(
  source: CanonicalFlatmap,
  layers: CanonicalFlatmapLayer[],
): CanonicalFlatmapComposite {
  const { width, height } = source
  if (width < 2 || height < 1) throw new Error('Canonieke flatmap heeft ongeldige afmetingen.')
  const pixelCount = width * height
  if (
    source.sourceRgba.length !== pixelCount * 4 ||
    source.confidence.length !== pixelCount ||
    source.unknownMask.length !== pixelCount
  ) throw new Error('Canonieke bronflatmap heeft ongeldige buffers.')
  for (const { flatmap } of layers) {
    if (flatmap.width !== width || flatmap.height !== height) {
      throw new Error('Alle canonieke flatmaps moeten dezelfde afmetingen hebben.')
    }
  }

  // U=0 and U=1 are the same lathe seam. Work on the unique ring and copy the
  // first column to the duplicate seam column only after composition.
  const ringWidth = width - 1
  const compositeRgba = new Uint8Array(source.sourceRgba)
  const reconstructionRgba = new Uint8Array(pixelCount * 4)
  const confidence = new Uint8Array(source.confidence)
  const sumR = new Uint32Array(pixelCount)
  const sumG = new Uint32Array(pixelCount)
  const sumB = new Uint32Array(pixelCount)
  const sumWeight = new Uint32Array(pixelCount)

  for (const { flatmap, angleRadians } of layers) {
    const shift = Math.round((angleRadians / (Math.PI * 2)) * ringWidth)
    for (let y = 0; y < height; y++) {
      const row = y * width
      for (let x = 0; x < ringWidth; x++) {
        const sourcePixel = row + x
        const sourceOffset = sourcePixel * 4
        if (flatmap.sourceRgba[sourceOffset + 3] === 0) continue
        const destinationX = ((x + shift) % ringWidth + ringWidth) % ringWidth
        const destinationPixel = row + destinationX
        if (source.sourceRgba[destinationPixel * 4 + 3] !== 0) continue
        const weight = Math.max(1, flatmap.confidence[sourcePixel])
        sumR[destinationPixel] += flatmap.sourceRgba[sourceOffset] * weight
        sumG[destinationPixel] += flatmap.sourceRgba[sourceOffset + 1] * weight
        sumB[destinationPixel] += flatmap.sourceRgba[sourceOffset + 2] * weight
        sumWeight[destinationPixel] += weight
        confidence[destinationPixel] = Math.max(confidence[destinationPixel], flatmap.confidence[sourcePixel])
      }
    }
  }

  for (let y = 0; y < height; y++) {
    const row = y * width
    for (let x = 0; x < ringWidth; x++) {
      const pixel = row + x
      if (source.sourceRgba[pixel * 4 + 3] !== 0 || sumWeight[pixel] === 0) continue
      const offset = pixel * 4
      compositeRgba[offset] = Math.round(sumR[pixel] / sumWeight[pixel])
      compositeRgba[offset + 1] = Math.round(sumG[pixel] / sumWeight[pixel])
      compositeRgba[offset + 2] = Math.round(sumB[pixel] / sumWeight[pixel])
      compositeRgba[offset + 3] = 255
      reconstructionRgba.set(compositeRgba.subarray(offset, offset + 4), offset)
    }
  }

  // Canonical views normally overlap enough to cover the ring. If segmentation
  // leaves narrow holes, close them along the circumference instead of exposing
  // neutral material. These pixels remain reconstruction provenance.
  for (let y = 0; y < height; y++) {
    const row = y * width
    const known: number[] = []
    for (let x = 0; x < ringWidth; x++) {
      if (compositeRgba[(row + x) * 4 + 3] !== 0) known.push(x)
    }
    if (!known.length) continue
    for (let index = 0; index < known.length; index++) {
      const leftX = known[index]
      const rightX = known[(index + 1) % known.length]
      const span = (rightX - leftX + ringWidth) % ringWidth
      if (span <= 1) continue
      const leftPixel = row + leftX
      const rightPixel = row + rightX
      for (let step = 1; step < span; step++) {
        const x = (leftX + step) % ringWidth
        const pixel = row + x
        const offset = pixel * 4
        if (compositeRgba[offset + 3] !== 0) continue
        const t = step / span
        for (let channel = 0; channel < 3; channel++) {
          compositeRgba[offset + channel] = Math.round(
            compositeRgba[leftPixel * 4 + channel] * (1 - t) +
            compositeRgba[rightPixel * 4 + channel] * t,
          )
        }
        compositeRgba[offset + 3] = 255
        reconstructionRgba.set(compositeRgba.subarray(offset, offset + 4), offset)
        confidence[pixel] = Math.max(24, Math.min(confidence[leftPixel], confidence[rightPixel]))
      }
    }
  }

  const unresolvedMask = new Uint8Array(pixelCount)
  let reconstructedPixels = 0
  for (let y = 0; y < height; y++) {
    const row = y * width
    for (let x = 0; x < ringWidth; x++) {
      const pixel = row + x
      if (compositeRgba[pixel * 4 + 3] === 0) unresolvedMask[pixel] = 255
      if (reconstructionRgba[pixel * 4 + 3] !== 0) reconstructedPixels++
    }
    const first = row
    const seam = row + ringWidth
    compositeRgba.set(compositeRgba.subarray(first * 4, first * 4 + 4), seam * 4)
    reconstructionRgba.set(reconstructionRgba.subarray(first * 4, first * 4 + 4), seam * 4)
    confidence[seam] = confidence[first]
    unresolvedMask[seam] = unresolvedMask[first]
  }

  return { compositeRgba, reconstructionRgba, confidence, unresolvedMask, reconstructedPixels }
}

export function validateCanonicalLatheGeometry(geometry: LatheGeometry): { valid: true; maxTriangleUSpan: number } {
  const columns = geometry.radialSegments + 1
  let maxTriangleUSpan = 0
  for (let ring = 0; ring < geometry.rings; ring++) {
    const first = ring * columns, last = first + geometry.radialSegments
    for (let axis = 0; axis < 3; axis++) {
      if (Math.abs(geometry.positions[first * 3 + axis] - geometry.positions[last * 3 + axis]) > 1e-5) throw new Error('Lathe-seam deelt niet dezelfde 3D-positie.')
    }
    if (geometry.uvs[first * 2] !== 0 || geometry.uvs[last * 2] !== 1) throw new Error('Lathe-seam heeft geen expliciete U=0/U=1 duplicaten.')
  }
  for (let index = 0; index < geometry.indices.length; index += 3) {
    const values = [geometry.uvs[geometry.indices[index] * 2], geometry.uvs[geometry.indices[index + 1] * 2], geometry.uvs[geometry.indices[index + 2] * 2]]
    maxTriangleUSpan = Math.max(maxTriangleUSpan, Math.max(...values) - Math.min(...values))
  }
  if (maxTriangleUSpan > 1 / geometry.radialSegments + 1e-5) throw new Error(`Triangle overspant de UV-seam (${maxTriangleUSpan}).`)
  return { valid: true, maxTriangleUSpan }
}

export function hardMaskComposite(original: Uint8Array, edited: Uint8Array, mask: Uint8Array): Uint8Array {
  if (original.length !== edited.length || original.length !== mask.length * 4) throw new Error('Masker- en afbeeldingsafmetingen komen niet overeen.')
  const output = new Uint8Array(original)
  for (let pixel = 0; pixel < mask.length; pixel++) if (mask[pixel]) output.set(edited.subarray(pixel * 4, pixel * 4 + 4), pixel * 4)
  return output
}
