import sharp from 'sharp'
import { extractDepthMap } from './depth-extractor'

interface ViewDefinition {
  label: string
  azimuth: number   // degrees around Y axis (0 = front, 90 = right, 180 = back, 270 = left)
  elevation: number  // degrees from horizontal (0 = level, 90 = top-down)
}

export const ENVIRONMENT_VIEWS: ViewDefinition[] = [
  { label: 'front',  azimuth: 0,   elevation: 0 },
  { label: 'right',  azimuth: 90,  elevation: 0 },
  { label: 'back',   azimuth: 180, elevation: 0 },
  { label: 'left',   azimuth: 270, elevation: 0 },
  { label: 'top',    azimuth: 0,   elevation: 90 },
]

interface Point3D {
  x: number
  y: number
  z: number
  r: number
  g: number
  b: number
  viewIndex: number
}

const DEPTH_NEAR = 0.3
const DEPTH_FAR = 6.0
const MERGE_DISTANCE = 0.08
const EDGE_THRESHOLD = 0.6
const DOWNSAMPLE = 6

export async function buildMultiViewMesh(
  viewImages: Buffer[],
  onProgress?: (step: string) => void,
): Promise<Buffer> {
  if (viewImages.length !== 5) throw new Error(`Expected 5 view images, got ${viewImages.length}`)

  // Step 1: Extract depth maps for all views
  onProgress?.('Extracting depth maps...')
  const depthMaps = await Promise.all(viewImages.map((img) => extractDepthMap(img)))

  // Step 2: Unproject each view into world-space points
  onProgress?.('Unprojecting to 3D...')
  const allPoints: Point3D[] = []

  for (let vi = 0; vi < viewImages.length; vi++) {
    const view = ENVIRONMENT_VIEWS[vi]
    const colorInfo = await sharp(viewImages[vi]).raw().toBuffer({ resolveWithObject: true })
    const depthInfo = await sharp(depthMaps[vi]).grayscale().raw().toBuffer({ resolveWithObject: true })

    const cw = colorInfo.info.width
    const ch = colorInfo.info.height
    const dw = depthInfo.info.width
    const dh = depthInfo.info.height
    const colorChannels = colorInfo.info.channels

    const stepX = Math.max(1, Math.round(dw / (320 / DOWNSAMPLE)))
    const stepY = Math.max(1, Math.round(dh / (180 / DOWNSAMPLE)))

    const azRad = (view.azimuth * Math.PI) / 180
    const elRad = (view.elevation * Math.PI) / 180

    // Camera basis vectors for this view
    const cosAz = Math.cos(azRad)
    const sinAz = Math.sin(azRad)
    const cosEl = Math.cos(elRad)
    const sinEl = Math.sin(elRad)

    // Forward direction (where camera looks FROM, toward origin)
    const fwdX = sinAz * cosEl
    const fwdY = sinEl
    const fwdZ = cosAz * cosEl

    // Right vector
    const rightX = cosAz
    const rightZ = -sinAz

    // Up vector (cross product of forward and right, adjusted for elevation)
    const upX = -sinAz * sinEl
    const upY = cosEl
    const upZ = -cosAz * sinEl

    const vfov = 60
    const halfTanY = Math.tan((vfov * Math.PI) / 360)
    const depthAspect = dw / dh
    const halfTanX = halfTanY * depthAspect

    const depthRange = DEPTH_FAR - DEPTH_NEAR

    for (let py = 0; py < dh; py += stepY) {
      for (let px = 0; px < dw; px += stepX) {
        const depthVal = depthInfo.data[py * dw + px] / 255
        if (depthVal < 0.02) continue

        const metricDepth = DEPTH_NEAR + (1 - depthVal) * depthRange

        const ndcX = (px / dw) * 2 - 1
        const ndcY = 1 - (py / dh) * 2

        // Camera-space position
        const camX = ndcX * halfTanX * metricDepth
        const camY = ndcY * halfTanY * metricDepth
        const camZ = -metricDepth

        // Transform to world space using view basis
        const wx = rightX * camX + upX * camY - fwdX * camZ
        const wy = camY * upY - fwdY * camZ
        const wz = rightZ * camX + upZ * camY - fwdZ * camZ

        // Sample color from the view image
        const cx = Math.min(cw - 1, Math.round((px / dw) * cw))
        const cy = Math.min(ch - 1, Math.round((py / dh) * ch))
        const ci = (cy * cw + cx) * colorChannels
        const r = colorInfo.data[ci] / 255
        const g = colorInfo.data[ci + 1] / 255
        const b = colorInfo.data[ci + 2] / 255

        allPoints.push({ x: wx, y: wy, z: wz, r, g, b, viewIndex: vi })
      }
    }
  }

  if (allPoints.length === 0) throw new Error('No valid 3D points from any view')

  // Step 3: Merge nearby points from different views
  onProgress?.('Merging point clouds...')
  const merged = mergePoints(allPoints)

  // Step 4: Build a grid-free mesh via nearest-neighbor triangulation
  onProgress?.('Triangulating mesh...')
  const { positions, colors, indices } = triangulatePoints(merged)

  if (positions.length === 0) throw new Error('Triangulation produced no geometry')

  onProgress?.('Building GLB...')
  return buildGlb(new Float32Array(positions), new Float32Array(colors), new Uint32Array(indices))
}

function mergePoints(points: Point3D[]): Point3D[] {
  // Spatial hash grid for efficient neighbor lookup
  const cellSize = MERGE_DISTANCE * 2
  const grid = new Map<string, number[]>()

  const result: Point3D[] = []
  const merged = new Uint8Array(points.length)

  for (let i = 0; i < points.length; i++) {
    const p = points[i]
    const key = `${Math.floor(p.x / cellSize)},${Math.floor(p.y / cellSize)},${Math.floor(p.z / cellSize)}`
    if (!grid.has(key)) grid.set(key, [])
    grid.get(key)!.push(i)
  }

  for (let i = 0; i < points.length; i++) {
    if (merged[i]) continue
    const p = points[i]
    const cx = Math.floor(p.x / cellSize)
    const cy = Math.floor(p.y / cellSize)
    const cz = Math.floor(p.z / cellSize)

    let sumX = p.x, sumY = p.y, sumZ = p.z
    let sumR = p.r, sumG = p.g, sumB = p.b
    let count = 1
    merged[i] = 1

    // Check neighboring cells
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dz = -1; dz <= 1; dz++) {
          const nkey = `${cx + dx},${cy + dy},${cz + dz}`
          const neighbors = grid.get(nkey)
          if (!neighbors) continue
          for (const j of neighbors) {
            if (merged[j]) continue
            const q = points[j]
            if (q.viewIndex === p.viewIndex) continue // only merge across views
            const dist = Math.sqrt((p.x - q.x) ** 2 + (p.y - q.y) ** 2 + (p.z - q.z) ** 2)
            if (dist < MERGE_DISTANCE) {
              sumX += q.x; sumY += q.y; sumZ += q.z
              sumR += q.r; sumG += q.g; sumB += q.b
              count++
              merged[j] = 1
            }
          }
        }
      }
    }

    result.push({
      x: sumX / count, y: sumY / count, z: sumZ / count,
      r: sumR / count, g: sumG / count, b: sumB / count,
      viewIndex: p.viewIndex,
    })
  }

  return result
}

function triangulatePoints(points: Point3D[]): { positions: number[]; colors: number[]; indices: number[] } {
  const positions: number[] = []
  const colors: number[] = []
  const indices: number[] = []

  // Build spatial grid for nearest-neighbor triangulation
  const cellSize = EDGE_THRESHOLD
  const grid = new Map<string, number[]>()

  for (let i = 0; i < points.length; i++) {
    const p = points[i]
    positions.push(p.x, p.y, p.z)
    colors.push(p.r, p.g, p.b, 1)

    const key = `${Math.floor(p.x / cellSize)},${Math.floor(p.y / cellSize)},${Math.floor(p.z / cellSize)}`
    if (!grid.has(key)) grid.set(key, [])
    grid.get(key)!.push(i)
  }

  // For each point, find neighbors and create triangles
  const edgeSet = new Set<string>()

  for (let i = 0; i < points.length; i++) {
    const p = points[i]
    const cx = Math.floor(p.x / cellSize)
    const cy = Math.floor(p.y / cellSize)
    const cz = Math.floor(p.z / cellSize)

    const neighbors: number[] = []
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dz = -1; dz <= 1; dz++) {
          const nkey = `${cx + dx},${cy + dy},${cz + dz}`
          const cell = grid.get(nkey)
          if (!cell) continue
          for (const j of cell) {
            if (j <= i) continue
            const q = points[j]
            const dist = Math.sqrt((p.x - q.x) ** 2 + (p.y - q.y) ** 2 + (p.z - q.z) ** 2)
            if (dist < EDGE_THRESHOLD) {
              neighbors.push(j)
            }
          }
        }
      }
    }

    // Form triangles from pairs of neighbors that are also close to each other
    for (let a = 0; a < neighbors.length; a++) {
      for (let b = a + 1; b < neighbors.length; b++) {
        const ja = neighbors[a]
        const jb = neighbors[b]
        const qa = points[ja]
        const qb = points[jb]
        const dab = Math.sqrt((qa.x - qb.x) ** 2 + (qa.y - qb.y) ** 2 + (qa.z - qb.z) ** 2)
        if (dab >= EDGE_THRESHOLD) continue

        // Deduplicate triangles
        const tri = [i, ja, jb].sort((x, y) => x - y)
        const triKey = `${tri[0]},${tri[1]},${tri[2]}`
        if (edgeSet.has(triKey)) continue
        edgeSet.add(triKey)

        indices.push(tri[0], tri[1], tri[2])
      }
    }
  }

  return { positions, colors, indices }
}

function buildGlb(positions: Float32Array, colors: Float32Array, indices: Uint32Array): Buffer {
  const posBytes = Buffer.from(positions.buffer, positions.byteOffset, positions.byteLength)
  const colBytes = Buffer.from(colors.buffer, colors.byteOffset, colors.byteLength)
  const idxBytes = Buffer.from(indices.buffer, indices.byteOffset, indices.byteLength)

  const posBounds = computeBounds(positions, 3)
  const idxBounds = minMax(indices)

  const posAligned = align4(posBytes.length)
  const colAligned = align4(colBytes.length)
  const idxAligned = align4(idxBytes.length)
  const totalBinLen = posAligned + colAligned + idxAligned
  const vertexCount = positions.length / 3

  const gltf = {
    asset: { version: '2.0', generator: 'HupheAI MultiViewMesh' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{
      primitives: [{
        attributes: { POSITION: 0, COLOR_0: 1 },
        indices: 2,
        mode: 4,
      }],
    }],
    accessors: [
      { bufferView: 0, componentType: 5126, count: vertexCount, type: 'VEC3', min: posBounds.min, max: posBounds.max },
      { bufferView: 1, componentType: 5126, count: vertexCount, type: 'VEC4' },
      { bufferView: 2, componentType: 5125, count: indices.length, type: 'SCALAR', min: [idxBounds.min], max: [idxBounds.max] },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: posBytes.length, target: 34962 },
      { buffer: 0, byteOffset: posAligned, byteLength: colBytes.length, target: 34962 },
      { buffer: 0, byteOffset: posAligned + colAligned, byteLength: idxBytes.length, target: 34963 },
    ],
    buffers: [{ byteLength: totalBinLen }],
  }

  const jsonStr = JSON.stringify(gltf)
  const jsonPad = align4(jsonStr.length) - jsonStr.length
  const jsonChunk = Buffer.concat([Buffer.from(jsonStr, 'utf8'), Buffer.alloc(jsonPad, 0x20)])
  const binChunk = Buffer.concat([
    posBytes, Buffer.alloc(posAligned - posBytes.length),
    colBytes, Buffer.alloc(colAligned - colBytes.length),
    idxBytes, Buffer.alloc(idxAligned - idxBytes.length),
  ])

  const totalLen = 12 + 8 + jsonChunk.length + 8 + binChunk.length
  const header = Buffer.alloc(12)
  header.writeUInt32LE(0x46546C67, 0)
  header.writeUInt32LE(2, 4)
  header.writeUInt32LE(totalLen, 8)

  const jsonHeader = Buffer.alloc(8)
  jsonHeader.writeUInt32LE(jsonChunk.length, 0)
  jsonHeader.writeUInt32LE(0x4E4F534A, 4)

  const binHeader = Buffer.alloc(8)
  binHeader.writeUInt32LE(binChunk.length, 0)
  binHeader.writeUInt32LE(0x004E4942, 4)

  return Buffer.concat([header, jsonHeader, jsonChunk, binHeader, binChunk])
}

function minMax(arr: Uint32Array) {
  let min = Infinity, max = -Infinity
  for (let i = 0; i < arr.length; i++) {
    if (arr[i] < min) min = arr[i]
    if (arr[i] > max) max = arr[i]
  }
  return { min, max }
}

function align4(n: number) { return (n + 3) & ~3 }

function computeBounds(arr: Float32Array, stride: number) {
  const min = Array(stride).fill(Infinity)
  const max = Array(stride).fill(-Infinity)
  for (let i = 0; i < arr.length; i += stride) {
    for (let j = 0; j < stride; j++) {
      if (arr[i + j] < min[j]) min[j] = arr[i + j]
      if (arr[i + j] > max[j]) max[j] = arr[i + j]
    }
  }
  return { min, max }
}
