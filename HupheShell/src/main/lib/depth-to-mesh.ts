import sharp from 'sharp'

interface CameraParams {
  projectionMatrix: number[]
  viewMatrix: number[]
  near: number
  far: number
  width: number
  height: number
}

export async function depthMapToGlb(
  depthBuffer: Buffer,
  camera: CameraParams,
  downsample = 4,
): Promise<Buffer> {
  const { data: rawPixels, info } = await sharp(depthBuffer)
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true })

  const dw = info.width
  const dh = info.height
  const stepX = Math.max(1, Math.round(dw / (camera.width / downsample)))
  const stepY = Math.max(1, Math.round(dh / (camera.height / downsample)))

  const invView = invertMatrix4(camera.viewMatrix)
  const invProj = invertMatrix4(camera.projectionMatrix)

  const positions: number[] = []
  const indices: number[] = []
  const colors: number[] = []
  const indexMap = new Map<string, number>()

  for (let py = 0; py < dh; py += stepY) {
    for (let px = 0; px < dw; px += stepX) {
      const depthVal = rawPixels[py * dw + px] / 255
      if (depthVal < 0.01) continue

      const linearDepth = camera.near + depthVal * (camera.far - camera.near)

      const ndcX = (px / dw) * 2 - 1
      const ndcY = 1 - (py / dh) * 2

      const clipPos = [ndcX * linearDepth, ndcY * linearDepth, -linearDepth, linearDepth]
      const viewPos = multiplyMat4Vec4(invProj, clipPos)
      const worldPos = multiplyMat4Vec4(invView, [
        viewPos[0] / viewPos[3],
        viewPos[1] / viewPos[3],
        viewPos[2] / viewPos[3],
        1,
      ])

      const key = `${px},${py}`
      const idx = positions.length / 3
      indexMap.set(key, idx)
      positions.push(worldPos[0] / worldPos[3], worldPos[1] / worldPos[3], worldPos[2] / worldPos[3])
      const c = depthVal
      colors.push(c, c, c, 1)
    }
  }

  for (let py = 0; py < dh - stepY; py += stepY) {
    for (let px = 0; px < dw - stepX; px += stepX) {
      const tl = indexMap.get(`${px},${py}`)
      const tr = indexMap.get(`${px + stepX},${py}`)
      const bl = indexMap.get(`${px},${py + stepY}`)
      const br = indexMap.get(`${px + stepX},${py + stepY}`)
      if (tl === undefined || tr === undefined || bl === undefined || br === undefined) continue

      const p = (i: number) => [positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]]
      const dist = (a: number[], b: number[]) =>
        Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2)

      const ptl = p(tl), ptr = p(tr), pbl = p(bl), pbr = p(br)
      const maxEdge = Math.max(dist(ptl, ptr), dist(ptl, pbl), dist(ptr, pbr), dist(pbl, pbr), dist(ptl, pbr))
      if (maxEdge > 2.0) continue

      indices.push(tl, bl, tr)
      indices.push(tr, bl, br)
    }
  }

  if (positions.length === 0) throw new Error('Depth map produced no valid 3D points')

  return buildGlb(new Float32Array(positions), new Uint32Array(indices), new Float32Array(colors))
}

function buildGlb(positions: Float32Array, indices: Uint32Array, colors: Float32Array): Buffer {
  const posBytes = Buffer.from(positions.buffer, positions.byteOffset, positions.byteLength)
  const idxBytes = Buffer.from(indices.buffer, indices.byteOffset, indices.byteLength)
  const colBytes = Buffer.from(colors.buffer, colors.byteOffset, colors.byteLength)

  const posBounds = computeBounds(positions, 3)

  const totalBinLen = align4(posBytes.length) + align4(idxBytes.length) + align4(colBytes.length)

  const posView = 0
  const posAccessor = 0
  const idxView = 1
  const idxAccessor = 1
  const colView = 2
  const colAccessor = 2

  const gltf = {
    asset: { version: '2.0', generator: 'HupheAI DepthToMesh' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{
      primitives: [{
        attributes: { POSITION: posAccessor, COLOR_0: colAccessor },
        indices: idxAccessor,
        mode: 4,
      }],
    }],
    accessors: [
      { bufferView: posView, componentType: 5126, count: positions.length / 3, type: 'VEC3', min: posBounds.min, max: posBounds.max },
      { bufferView: idxView, componentType: 5125, count: indices.length, type: 'SCALAR', min: [Math.min(...indices)], max: [Math.max(...indices)] },
      { bufferView: colView, componentType: 5126, count: colors.length / 4, type: 'VEC4' },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: posBytes.length, target: 34962 },
      { buffer: 0, byteOffset: align4(posBytes.length), byteLength: idxBytes.length, target: 34963 },
      { buffer: 0, byteOffset: align4(posBytes.length) + align4(idxBytes.length), byteLength: colBytes.length, target: 34962 },
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
    posBytes, Buffer.alloc(align4(posBytes.length) - posBytes.length),
    idxBytes, Buffer.alloc(align4(idxBytes.length) - idxBytes.length),
    colBytes, Buffer.alloc(align4(colBytes.length) - colBytes.length),
  ])

  const totalLen = 12 + 8 + jsonChunk.length + 8 + binChunk.length
  const header = Buffer.alloc(12)
  header.writeUInt32LE(0x46546C67, 0) // glTF
  header.writeUInt32LE(2, 4)
  header.writeUInt32LE(totalLen, 8)

  const jsonHeader = Buffer.alloc(8)
  jsonHeader.writeUInt32LE(jsonChunk.length, 0)
  jsonHeader.writeUInt32LE(0x4E4F534A, 4) // JSON

  const binHeader = Buffer.alloc(8)
  binHeader.writeUInt32LE(binChunk.length, 0)
  binHeader.writeUInt32LE(0x004E4942, 4) // BIN

  return Buffer.concat([header, jsonHeader, jsonChunk, binHeader, binChunk])
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
