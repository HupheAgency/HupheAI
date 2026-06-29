import sharp from 'sharp'

interface CameraParams {
  projectionMatrix: number[]
  viewMatrix: number[]
  near: number
  far: number
  width: number
  height: number
  fovScale?: number
}

export async function depthMapToGlb(
  depthBuffer: Buffer,
  camera: CameraParams,
  downsample = 6,
): Promise<Buffer> {
  const { data: rawPixels, info } = await sharp(depthBuffer)
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true })

  const dw = info.width
  const dh = info.height
  const stepX = Math.max(1, Math.round(dw / (camera.width / downsample)))
  const stepY = Math.max(1, Math.round(dh / (camera.height / downsample)))

  // Vertical FOV from projection matrix (column-major): proj[5] = 1/tan(vfov/2)
  // fovScale corrects for frame crop: the depth map covers only the frame area, not the full viewport
  const fy = camera.projectionMatrix[5]
  const scale = camera.fovScale ?? 1
  const halfTanY = (1 / fy) * scale
  const depthAspect = dw / dh
  const halfTanX = halfTanY * depthAspect

  const invView = invertMatrix4(camera.viewMatrix)

  // Depth Anything gives relative inverse depth: white (255) = close, black (0) = far
  const DEPTH_NEAR = 0.3
  const DEPTH_FAR = 6.0

  const positions: number[] = []
  const colors: number[] = []
  const indices: number[] = []
  const indexGrid: (number | undefined)[][] = []

  const depthRange = DEPTH_FAR - DEPTH_NEAR
  const rows = Math.ceil(dh / stepY)
  const cols = Math.ceil(dw / stepX)

  for (let gy = 0; gy < rows; gy++) {
    const row: (number | undefined)[] = []
    const py = gy * stepY
    for (let gx = 0; gx < cols; gx++) {
      const px = gx * stepX
      if (py >= dh || px >= dw) { row.push(undefined); continue }

      const depthVal = rawPixels[py * dw + px] / 255
      if (depthVal < 0.02) { row.push(undefined); continue }

      const metricDepth = DEPTH_NEAR + (1 - depthVal) * depthRange

      const ndcX = (px / dw) * 2 - 1
      const ndcY = 1 - (py / dh) * 2

      const camX = ndcX * halfTanX * metricDepth
      const camY = ndcY * halfTanY * metricDepth
      const camZ = -metricDepth

      const worldPos = multiplyMat4Vec4(invView, [camX, camY, camZ, 1])
      const wx = worldPos[0] / worldPos[3]
      const wy = worldPos[1] / worldPos[3]
      const wz = worldPos[2] / worldPos[3]

      const idx = positions.length / 3
      row.push(idx)
      positions.push(wx, wy, wz)

      const brightness = 1 - (metricDepth - DEPTH_NEAR) / depthRange
      colors.push(brightness, brightness, brightness, 1)
    }
    indexGrid.push(row)
  }

  // Triangulate grid — skip triangles that span large depth discontinuities
  for (let gy = 0; gy < rows - 1; gy++) {
    for (let gx = 0; gx < cols - 1; gx++) {
      const tl = indexGrid[gy][gx]
      const tr = indexGrid[gy][gx + 1]
      const bl = indexGrid[gy + 1][gx]
      const br = indexGrid[gy + 1][gx + 1]
      if (tl === undefined || tr === undefined || bl === undefined || br === undefined) continue

      const p = (i: number) => [positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]]
      const dist = (a: number[], b: number[]) =>
        Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2)

      const ptl = p(tl), ptr = p(tr), pbl = p(bl), pbr = p(br)
      const maxEdge = Math.max(dist(ptl, ptr), dist(ptl, pbl), dist(ptr, pbr), dist(pbl, pbr))
      if (maxEdge > 0.6) continue

      indices.push(tl, bl, tr)
      indices.push(tr, bl, br)
    }
  }

  if (positions.length === 0) throw new Error('Depth map produced no valid 3D points')

  return buildGlb(new Float32Array(positions), new Float32Array(colors), new Uint32Array(indices))
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
    asset: { version: '2.0', generator: 'HupheAI DepthToMesh' },
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
  const jsonChunk = Buffer.concat([
    Buffer.from(jsonStr, 'utf8'),
    Buffer.alloc(jsonPad, 0x20),
  ])

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

function minMax(arr: Uint32Array): { min: number; max: number } {
  let min = Infinity, max = -Infinity
  for (let i = 0; i < arr.length; i++) {
    if (arr[i] < min) min = arr[i]
    if (arr[i] > max) max = arr[i]
  }
  return { min, max }
}

function align4(n: number): number {
  return (n + 3) & ~3
}

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

function invertMatrix4(m: number[]): number[] {
  const a00 = m[0], a01 = m[1], a02 = m[2], a03 = m[3]
  const a10 = m[4], a11 = m[5], a12 = m[6], a13 = m[7]
  const a20 = m[8], a21 = m[9], a22 = m[10], a23 = m[11]
  const a30 = m[12], a31 = m[13], a32 = m[14], a33 = m[15]

  const b00 = a00 * a11 - a01 * a10
  const b01 = a00 * a12 - a02 * a10
  const b02 = a00 * a13 - a03 * a10
  const b03 = a01 * a12 - a02 * a11
  const b04 = a01 * a13 - a03 * a11
  const b05 = a02 * a13 - a03 * a12
  const b06 = a20 * a31 - a21 * a30
  const b07 = a20 * a32 - a22 * a30
  const b08 = a20 * a33 - a23 * a30
  const b09 = a21 * a32 - a22 * a31
  const b10 = a21 * a33 - a23 * a31
  const b11 = a22 * a33 - a23 * a32

  let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06
  if (Math.abs(det) < 1e-10) return [...m]
  det = 1.0 / det

  return [
    (a11 * b11 - a12 * b10 + a13 * b09) * det,
    (a02 * b10 - a01 * b11 - a03 * b09) * det,
    (a31 * b05 - a32 * b04 + a33 * b03) * det,
    (a22 * b04 - a21 * b05 - a23 * b03) * det,
    (a12 * b08 - a10 * b11 - a13 * b07) * det,
    (a00 * b11 - a02 * b08 + a03 * b07) * det,
    (a32 * b02 - a30 * b05 - a33 * b01) * det,
    (a20 * b05 - a22 * b02 + a23 * b01) * det,
    (a10 * b10 - a11 * b08 + a13 * b06) * det,
    (a01 * b08 - a00 * b10 - a03 * b06) * det,
    (a30 * b04 - a31 * b02 + a33 * b00) * det,
    (a21 * b02 - a20 * b04 - a23 * b00) * det,
    (a11 * b07 - a10 * b09 - a12 * b06) * det,
    (a00 * b09 - a01 * b07 + a02 * b06) * det,
    (a31 * b01 - a30 * b03 - a32 * b00) * det,
    (a20 * b03 - a21 * b01 + a22 * b00) * det,
  ]
}

function multiplyMat4Vec4(m: number[], v: number[]): number[] {
  return [
    m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12] * v[3],
    m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13] * v[3],
    m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14] * v[3],
    m[3] * v[0] + m[7] * v[1] + m[11] * v[2] + m[15] * v[3],
  ]
}
