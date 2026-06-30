import { buildGlb, invertMatrix4, multiplyMat4Vec4, parseGlbMesh } from './glb-utils'

interface CameraParams {
  projectionMatrix: number[]
  viewMatrix: number[]
  near: number
  far: number
  width: number
  height: number
  fovScale?: number
}

/**
 * Decode Three.js BasicDepthPacking PNG to metric depth Float32Array.
 * depth_01 = R/255 + G/(255*256) + B/(255*256*256)
 */
export async function decodeBasicDepthPacking(
  depthDataUrl: string,
  near: number,
  far: number,
): Promise<Float32Array> {
  const sharp = (await import('sharp')).default
  const base64 = depthDataUrl.replace(/^data:[^;]+;base64,/, '')
  const buf = Buffer.from(base64, 'base64')
  const { data, info } = await sharp(buf).raw().toBuffer({ resolveWithObject: true })
  const w = info.width, h = info.height
  const result = new Float32Array(w * h)
  const ch = info.channels
  for (let i = 0; i < w * h; i++) {
    const R = data[i * ch] / 255
    const G = ch > 1 ? data[i * ch + 1] / (255 * 256) : 0
    const B = ch > 2 ? data[i * ch + 2] / (255 * 256 * 256) : 0
    result[i] = near + (R + G + B) * (far - near)
  }
  return result
}

/**
 * Affine fit in disparity space: a * (mono/255) + b ≈ 1/knownMetric
 * Fit on geometry pixels (maskHole < 128 = product is present there).
 */
export async function affineDepthFit(
  monoDepthBuf: Buffer,
  knownDepthMetric: Float32Array,
  maskHoleBuf: Buffer,
  width: number,
  height: number,
): Promise<{ a: number; b: number }> {
  const sharp = (await import('sharp')).default
  const { data: monoData } = await sharp(monoDepthBuf)
    .resize(width, height, { fit: 'fill' }).grayscale().raw()
    .toBuffer({ resolveWithObject: true })
  const { data: maskData } = await sharp(maskHoleBuf)
    .resize(width, height, { fit: 'fill' }).grayscale().raw()
    .toBuffer({ resolveWithObject: true })

  let sumX = 0, sumY = 0, sumXX = 0, sumXY = 0, n = 0
  for (let i = 0; i < width * height; i++) {
    const isGeometry = maskData[i] < 128  // maskHole < 128 = geometry present
    const known = knownDepthMetric[i]
    if (!isGeometry || known < 0.01 || known > 50) continue
    const x = monoData[i] / 255           // mono disparity (Depth Anything output)
    const y = 1 / known                   // metric disparity
    sumX += x; sumY += y; sumXX += x * x; sumXY += x * y; n++
  }
  if (n < 100) return { a: 1, b: 0 }
  const denom = (n * sumXX - sumX * sumX) || 1
  const a = (n * sumXY - sumX * sumY) / denom
  const b = (sumY - a * sumX) / n
  return { a, b }
}

/**
 * Relative depth-ratio triangle cull (scale-invariant).
 * abs(z1-z2)/min(z1,z2) > maxRatio → depth discontinuity → curtain → cull.
 */
function isBadTriangle(
  cameraDepths: Float32Array,
  a: number,
  b: number,
  c: number,
  maxDepthRatio = 0.3,
): boolean {
  const za = cameraDepths[a], zb = cameraDepths[b], zc = cameraDepths[c]
  if (za <= 0 || zb <= 0 || zc <= 0) return true
  const minAB = Math.min(za, zb), minBC = Math.min(zb, zc), minAC = Math.min(za, zc)
  return (
    Math.abs(za - zb) / minAB > maxDepthRatio ||
    Math.abs(zb - zc) / minBC > maxDepthRatio ||
    Math.abs(za - zc) / minAC > maxDepthRatio
  )
}

/**
 * Unproject hole pixels into world-space and build a GLB mesh patch.
 * Uses relative depth-ratio cull (scale-invariant) to remove curtain triangles.
 */
export async function unprojectDepthPatch(
  alignedDepth: Float32Array,
  rgbBuf: Buffer,
  maskHoleBuf: Buffer,
  cameraParams: CameraParams,
  maxDepthRatio = 0.3,
  pixelStep = 4,
): Promise<Buffer> {
  const sharp = (await import('sharp')).default
  const { width: W, height: H } = cameraParams
  const fovScale = cameraParams.fovScale ?? 1

  const { data: rgbData, info: rgbInfo } = await sharp(rgbBuf)
    .resize(W, H, { fit: 'fill' }).raw().toBuffer({ resolveWithObject: true })
  const { data: maskData } = await sharp(maskHoleBuf)
    .resize(W, H, { fit: 'fill' }).grayscale().raw().toBuffer({ resolveWithObject: true })
  const ch = rgbInfo.channels

  const invView = invertMatrix4(cameraParams.viewMatrix)
  const fy = cameraParams.projectionMatrix[5] / fovScale
  const aspect = W / H

  const positions: number[] = []
  const colors: number[] = []
  const cameraDepths: number[] = []  // camera-space z per vertex, for depth-ratio cull
  const pixelToVertex = new Int32Array(W * H).fill(-1)

  for (let py = 0; py < H; py += pixelStep) {
    for (let px = 0; px < W; px += pixelStep) {
      const i = py * W + px
      if (maskData[i] <= 128) continue   // not a hole
      const depth = alignedDepth[i]
      if (!isFinite(depth) || depth <= 0) continue

      const ndcX = (px / W) * 2 - 1
      const ndcY = 1 - (py / H) * 2
      const camX = ndcX * (aspect / fy) * depth
      const camY = ndcY * (1 / fy) * depth
      const camZ = -depth

      const world = multiplyMat4Vec4(invView, [camX, camY, camZ, 1])
      const vIdx = positions.length / 3
      pixelToVertex[i] = vIdx
      positions.push(world[0] / world[3], world[1] / world[3], world[2] / world[3])
      cameraDepths.push(depth)
      colors.push(rgbData[i * ch] / 255, rgbData[i * ch + 1] / 255, rgbData[i * ch + 2] / 255, 1)
    }
  }

  if (positions.length === 0) return buildGlb(new Float32Array(0), new Float32Array(0), new Uint32Array(0))

  const posArr = new Float32Array(positions)
  const colArr = new Float32Array(colors)
  const depArr = new Float32Array(cameraDepths)
  const indices: number[] = []

  for (let py = 0; py < H - pixelStep; py += pixelStep) {
    for (let px = 0; px < W - pixelStep; px += pixelStep) {
      const v00 = pixelToVertex[py * W + px]
      const v10 = pixelToVertex[py * W + (px + pixelStep)]
      const v01 = pixelToVertex[(py + pixelStep) * W + px]
      const v11 = pixelToVertex[(py + pixelStep) * W + (px + pixelStep)]

      if (v00 >= 0 && v10 >= 0 && v01 >= 0 && !isBadTriangle(depArr, v00, v10, v01, maxDepthRatio)) {
        indices.push(v00, v10, v01)
      }
      if (v10 >= 0 && v11 >= 0 && v01 >= 0 && !isBadTriangle(depArr, v10, v11, v01, maxDepthRatio)) {
        indices.push(v10, v11, v01)
      }
    }
  }

  return buildGlb(posArr, colArr, new Uint32Array(indices))
}

/**
 * Merge two GLB buffers into one (incremental fusion during spiral bake).
 */
export async function mergeTwo(base: Buffer, patch: Buffer): Promise<Buffer> {
  const meshA = parseGlbMesh(base)
  const meshB = parseGlbMesh(patch)
  if (!meshA && !meshB) throw new Error('Beide patches zijn leeg.')
  if (!meshA) return patch
  if (!meshB) return base

  const offset = meshA.positions.length / 3
  const positions = new Float32Array(meshA.positions.length + meshB.positions.length)
  const colors = new Float32Array(meshA.colors.length + meshB.colors.length)
  const indices = new Uint32Array(meshA.indices.length + meshB.indices.length)

  positions.set(meshA.positions)
  positions.set(meshB.positions, meshA.positions.length)
  colors.set(meshA.colors)
  colors.set(meshB.colors, meshA.colors.length)
  indices.set(meshA.indices)
  for (let i = 0; i < meshB.indices.length; i++) {
    indices[meshA.indices.length + i] = meshB.indices[i] + offset
  }

  return buildGlb(positions, colors, indices)
}

/**
 * Merge multiple GLB patch buffers into one (used for finalize).
 */
export async function mergeGlbPatches(patches: Buffer[]): Promise<Buffer> {
  if (patches.length === 0) throw new Error('Geen patches om samen te voegen.')
  let result = patches[0]
  for (let i = 1; i < patches.length; i++) {
    result = await mergeTwo(result, patches[i])
  }
  return result
}

/**
 * Spiral camera poses starting from front (0°), expanding outward in small steps.
 * Order: right hemisphere → left hemisphere → elevated top views.
 * Every new pose borders already-built geometry (max 15° jump).
 */
export function computeSpiralPoses(
  orbitCenter: [number, number, number],
  cameraDistance: number,
  topElevationDeg = 25,
): Array<{ position: [number, number, number]; target: [number, number, number] }> {
  function poseAt(elDeg: number, azDeg: number): { position: [number, number, number]; target: [number, number, number] } {
    const elRad = (elDeg * Math.PI) / 180
    const azRad = (azDeg * Math.PI) / 180
    return {
      position: [
        orbitCenter[0] + cameraDistance * Math.cos(elRad) * Math.sin(azRad),
        orbitCenter[1] + cameraDistance * Math.sin(elRad),
        orbitCenter[2] + cameraDistance * Math.cos(elRad) * Math.cos(azRad),
      ],
      target: orbitCenter,
    }
  }

  const poses: Array<{ position: [number, number, number]; target: [number, number, number] }> = []

  // Right hemisphere: 15° steps to 165°
  for (let az = 15; az <= 165; az += 15) poses.push(poseAt(0, az))

  // Left hemisphere: -15° steps to -165°
  for (let az = -15; az >= -165; az -= 15) poses.push(poseAt(0, az))

  // Elevated views: spread across azimuths already covered
  for (const az of [0, 60, -60, 120, -120]) poses.push(poseAt(topElevationDeg, az))

  return poses
}
