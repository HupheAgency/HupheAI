interface CameraConfig { dx: number; dy: number; dz: number; ux: number; uy: number; uz: number }

const CAMERA_CONFIGS: Record<string, CameraConfig> = {
  front: { dx: 0, dy: 0, dz: -1, ux: 0, uy: 1, uz: 0 },
  hero:  { dx: 0, dy: 0, dz: -1, ux: 0, uy: 1, uz: 0 },
  rear:  { dx: 0, dy: 0, dz: 1,  ux: 0, uy: 1, uz: 0 },
  left:  { dx: 1, dy: 0, dz: 0,  ux: 0, uy: 1, uz: 0 },
  right: { dx: -1, dy: 0, dz: 0, ux: 0, uy: 1, uz: 0 },
  top:   { dx: 0, dy: -1, dz: 0, ux: 0, uy: 0, uz: -1 },
}

interface ParsedMesh {
  positions: Float32Array
  normals: Float32Array | null
  uvs: Float32Array
  indices: Uint16Array | Uint32Array | null
  triCount: number
}

function parseGlb(buf: Buffer): { json: any; binChunk: Buffer } {
  const magic = buf.readUInt32LE(0)
  if (magic !== 0x46546C67) throw new Error('Not a GLB file')
  const jsonLen = buf.readUInt32LE(12)
  const json = JSON.parse(buf.slice(20, 20 + jsonLen).toString('utf8'))
  const binOffset = 20 + jsonLen
  const binLen = buf.readUInt32LE(binOffset)
  const binChunk = buf.slice(binOffset + 8, binOffset + 8 + binLen)
  return { json, binChunk }
}

function extractMesh(json: any, bin: Buffer): ParsedMesh {
  const mesh = json.meshes[0]
  const prim = mesh.primitives[0]
  const accessors = json.accessors
  const bufferViews = json.bufferViews

  function getTypedArray(accIdx: number): Float32Array | Uint16Array | Uint32Array {
    const acc = accessors[accIdx]
    const bv = bufferViews[acc.bufferView]
    const baseOffset = (bv.byteOffset || 0) + (acc.byteOffset || 0)
    const componentType = acc.componentType
    const components = acc.type === 'VEC3' ? 3 : acc.type === 'VEC2' ? 2 : 1
    const stride = bv.byteStride || 0
    const bytesPerElement = componentType === 5126 ? 4 : 2
    const tightStride = components * bytesPerElement

    if (stride > 0 && stride !== tightStride) {
      // Interleaved: extract into a contiguous array
      const count = acc.count
      if (componentType === 5126) {
        const out = new Float32Array(count * components)
        for (let i = 0; i < count; i++) {
          const srcOff = bin.byteOffset + baseOffset + i * stride
          for (let c = 0; c < components; c++) {
            out[i * components + c] = new DataView(bin.buffer).getFloat32(srcOff + c * 4, true)
          }
        }
        return out
      }
      if (componentType === 5123) {
        const out = new Uint16Array(count * components)
        for (let i = 0; i < count; i++) {
          const srcOff = bin.byteOffset + baseOffset + i * stride
          for (let c = 0; c < components; c++) {
            out[i * components + c] = new DataView(bin.buffer).getUint16(srcOff + c * 2, true)
          }
        }
        return out
      }
      if (componentType === 5125) {
        const out = new Uint32Array(count * components)
        for (let i = 0; i < count; i++) {
          const srcOff = bin.byteOffset + baseOffset + i * stride
          for (let c = 0; c < components; c++) {
            out[i * components + c] = new DataView(bin.buffer).getUint32(srcOff + c * 4, true)
          }
        }
        return out
      }
      throw new Error(`Unsupported componentType: ${componentType}`)
    }

    // Tightly packed
    const count = acc.count * components
    if (componentType === 5126) return new Float32Array(bin.buffer, bin.byteOffset + baseOffset, count)
    if (componentType === 5123) return new Uint16Array(bin.buffer, bin.byteOffset + baseOffset, count)
    if (componentType === 5125) return new Uint32Array(bin.buffer, bin.byteOffset + baseOffset, count)
    throw new Error(`Unsupported componentType: ${componentType}`)
  }

  const positions = getTypedArray(prim.attributes.POSITION) as Float32Array
  const normals = prim.attributes.NORMAL !== undefined ? getTypedArray(prim.attributes.NORMAL) as Float32Array : null
  const uvs = getTypedArray(prim.attributes.TEXCOORD_0) as Float32Array

  let indices: Uint16Array | Uint32Array | null = null
  let triCount: number
  if (prim.indices !== undefined) {
    indices = getTypedArray(prim.indices) as Uint16Array | Uint32Array
    triCount = indices.length / 3
  } else {
    triCount = (positions.length / 3) / 3
  }

  return { positions, normals, uvs, indices, triCount }
}

function computeBBox(mesh: ParsedMesh): { cx: number; cy: number; cz: number; radius: number } {
  let minX = Infinity, minY = Infinity, minZ = Infinity
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity
  const vCount = mesh.positions.length / 3
  for (let i = 0; i < vCount; i++) {
    const x = mesh.positions[i * 3], y = mesh.positions[i * 3 + 1], z = mesh.positions[i * 3 + 2]
    if (x < minX) minX = x; if (x > maxX) maxX = x
    if (y < minY) minY = y; if (y > maxY) maxY = y
    if (z < minZ) minZ = z; if (z > maxZ) maxZ = z
  }
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2, cz = (minZ + maxZ) / 2
  const dx = maxX - minX, dy = maxY - minY, dz = maxZ - minZ
  return { cx, cy, cz, radius: Math.sqrt(dx * dx + dy * dy + dz * dz) / 2 }
}

interface Camera {
  dx: number; dy: number; dz: number
  rx: number; ry: number; rz: number
  ux: number; uy: number; uz: number
  pixels: Buffer; w: number; h: number
  bgR: number; bgG: number; bgB: number
}

function detectBackground(pixels: Buffer, w: number, h: number): [number, number, number] {
  let rSum = 0, gSum = 0, bSum = 0, count = 0
  const corners = [
    [0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1],
    [1, 0], [0, 1], [w - 2, 0], [w - 1, 1],
    [0, h - 2], [1, h - 1], [w - 2, h - 1], [w - 1, h - 2],
  ]
  for (const [x, y] of corners) {
    const off = (y * w + x) * 4
    rSum += pixels[off]; gSum += pixels[off + 1]; bSum += pixels[off + 2]; count++
  }
  return [Math.round(rSum / count), Math.round(gSum / count), Math.round(bSum / count)]
}

function isBackground(pixels: Buffer, off: number, bgR: number, bgG: number, bgB: number, threshold = 30): boolean {
  const dr = pixels[off] - bgR, dg = pixels[off + 1] - bgG, db = pixels[off + 2] - bgB
  return (dr * dr + dg * dg + db * db) < threshold * threshold
}

function buildCamera(cfg: CameraConfig, pixels: Buffer, w: number, h: number, bgR: number, bgG: number, bgB: number): Camera {
  const len = Math.sqrt(cfg.dx * cfg.dx + cfg.dy * cfg.dy + cfg.dz * cfg.dz)
  const dx = cfg.dx / len, dy = cfg.dy / len, dz = cfg.dz / len
  // right = dir × up
  const rx = dy * cfg.uz - dz * cfg.uy
  const ry = dz * cfg.ux - dx * cfg.uz
  const rz = dx * cfg.uy - dy * cfg.ux
  const rLen = Math.sqrt(rx * rx + ry * ry + rz * rz)
  // true up = right × dir
  const ux = (ry * dz - rz * dy)
  const uy = (rz * dx - rx * dz)
  const uz = (rx * dy - ry * dx)
  const uLen = Math.sqrt(ux * ux + uy * uy + uz * uz)
  return {
    dx, dy, dz,
    rx: rx / rLen, ry: ry / rLen, rz: rz / rLen,
    ux: ux / uLen, uy: uy / uLen, uz: uz / uLen,
    pixels, w, h, bgR, bgG, bgB,
  }
}

const DIGIT_GLYPHS: Record<string, number[]> = {
  '0': [0x7C,0xC6,0xCE,0xD6,0xE6,0xC6,0x7C],
  '1': [0x30,0x70,0x30,0x30,0x30,0x30,0xFC],
  '2': [0x7C,0xC6,0x06,0x3C,0x60,0xC0,0xFE],
  '3': [0x7C,0xC6,0x06,0x3C,0x06,0xC6,0x7C],
  '4': [0x1C,0x3C,0x6C,0xCC,0xFE,0x0C,0x0C],
}

function drawDigit(buf: Buffer, size: number, cx: number, cy: number, digit: string, r: number, g: number, b: number, scale: number) {
  const glyph = DIGIT_GLYPHS[digit]
  if (!glyph) return
  const h = glyph.length
  const w = 8
  for (let row = 0; row < h; row++) {
    for (let col = 0; col < w; col++) {
      if (!(glyph[row] & (0x80 >> col))) continue
      for (let sy = 0; sy < scale; sy++) {
        for (let sx = 0; sx < scale; sx++) {
          const px = cx - Math.floor(w * scale / 2) + col * scale + sx
          const py = cy - Math.floor(h * scale / 2) + row * scale + sy
          if (px < 0 || px >= size || py < 0 || py >= size) continue
          const off = (py * size + px) * 4
          buf[off] = r; buf[off + 1] = g; buf[off + 2] = b; buf[off + 3] = 255
        }
      }
    }
  }
}

function setPixel(buf: Buffer, size: number, x: number, y: number, r: number, g: number, b: number) {
  if (x < 0 || x >= size || y < 0 || y >= size) return
  const off = (y * size + x) * 4
  buf[off] = r; buf[off + 1] = g; buf[off + 2] = b; buf[off + 3] = 255
}

export function generateUVDebugAtlas(size: number): Buffer {
  const buf = Buffer.alloc(size * size * 4)

  const divisions = 4
  const majorCell = size / divisions
  const mediumCell = majorCell / 5
  const fineCell = mediumCell / 4

  const BG = [240, 240, 235]
  const FINE = [190, 190, 185]
  const MEDIUM = [120, 120, 115]
  const MAJOR = [40, 40, 35]
  const AXIS_R = [220, 50, 40]
  const AXIS_G = [40, 180, 50]

  // background fill
  for (let i = 0; i < size * size; i++) {
    const off = i * 4
    buf[off] = BG[0]; buf[off + 1] = BG[1]; buf[off + 2] = BG[2]; buf[off + 3] = 255
  }

  // fine grid
  for (let i = 0; i < size; i++) {
    const mod = i % fineCell
    if (mod < 1) {
      for (let j = 0; j < size; j++) {
        setPixel(buf, size, i, j, FINE[0], FINE[1], FINE[2])
        setPixel(buf, size, j, i, FINE[0], FINE[1], FINE[2])
      }
    }
  }

  // medium grid
  for (let i = 0; i < size; i++) {
    const mod = i % mediumCell
    if (mod < 1) {
      for (let j = 0; j < size; j++) {
        setPixel(buf, size, i, j, MEDIUM[0], MEDIUM[1], MEDIUM[2])
        setPixel(buf, size, j, i, MEDIUM[0], MEDIUM[1], MEDIUM[2])
      }
    }
  }

  // major grid (2px thick)
  for (let d = 0; d <= divisions; d++) {
    const pos = Math.round(d * majorCell)
    for (let t = -1; t <= 0; t++) {
      const p = pos + t
      if (p < 0 || p >= size) continue
      for (let j = 0; j < size; j++) {
        setPixel(buf, size, p, j, MAJOR[0], MAJOR[1], MAJOR[2])
        setPixel(buf, size, j, p, MAJOR[0], MAJOR[1], MAJOR[2])
      }
    }
  }

  // center axes (3px thick)
  const center = Math.round(size / 2)
  for (let t = -1; t <= 1; t++) {
    const p = center + t
    if (p < 0 || p >= size) continue
    for (let j = 0; j < size; j++) {
      setPixel(buf, size, j, p, AXIS_R[0], AXIS_R[1], AXIS_R[2])
      setPixel(buf, size, p, j, AXIS_G[0], AXIS_G[1], AXIS_G[2])
    }
  }
  // green over red at intersection
  for (let t = -1; t <= 1; t++) {
    for (let s = -1; s <= 1; s++) {
      setPixel(buf, size, center + s, center + t, AXIS_G[0], AXIS_G[1], AXIS_G[2])
    }
  }

  // digit labels at major grid intersections
  const digitScale = Math.max(2, Math.round(size / 512))
  for (let gx = 0; gx <= divisions; gx++) {
    for (let gy = 0; gy <= divisions; gy++) {
      const px = Math.round(gx * majorCell)
      const py = Math.round(gy * majorCell)
      const uVal = gx - divisions / 2
      const vVal = divisions / 2 - gy
      const label = Math.abs(uVal).toString()
      const labelOffset = digitScale * 5
      const isXAxis = gy === divisions / 2
      const isYAxis = gx === divisions / 2
      const lr = isXAxis ? AXIS_R[0] : isYAxis ? AXIS_G[0] : MAJOR[0]
      const lg = isXAxis ? AXIS_R[1] : isYAxis ? AXIS_G[1] : MAJOR[1]
      const lb = isXAxis ? AXIS_R[2] : isYAxis ? AXIS_G[2] : MAJOR[2]

      if (gx === divisions / 2 && gy === divisions / 2) {
        drawDigit(buf, size, px + labelOffset, py - labelOffset, '0', MAJOR[0], MAJOR[1], MAJOR[2], digitScale)
      } else if (isYAxis) {
        drawDigit(buf, size, px + labelOffset, py, Math.abs(vVal).toString(), lg, lg === AXIS_G[1] ? lg : lg, lb, digitScale)
      } else if (isXAxis) {
        drawDigit(buf, size, px, py - labelOffset, label, lr, lg, lb, digitScale)
      } else {
        drawDigit(buf, size, px + labelOffset, py - labelOffset, label, lr, lg, lb, digitScale)
      }
    }
  }

  return buf
}

// --- Smart UV Unwrap ---

interface UVIsland {
  triangles: number[]
  vertices: Set<number>
}

function buildAdjacency(mesh: ParsedMesh): Map<string, number[]> {
  const edgeToTri = new Map<string, number[]>()
  for (let t = 0; t < mesh.triCount; t++) {
    const i0 = mesh.indices ? mesh.indices[t * 3] : t * 3
    const i1 = mesh.indices ? mesh.indices[t * 3 + 1] : t * 3 + 1
    const i2 = mesh.indices ? mesh.indices[t * 3 + 2] : t * 3 + 2
    const edges = [[i0, i1], [i1, i2], [i2, i0]]
    for (const [a, b] of edges) {
      const key = Math.min(a, b) + ':' + Math.max(a, b)
      const list = edgeToTri.get(key)
      if (list) list.push(t)
      else edgeToTri.set(key, [t])
    }
  }
  return edgeToTri
}

function computeFaceNormals(mesh: ParsedMesh): Float32Array {
  const normals = new Float32Array(mesh.triCount * 3)
  for (let t = 0; t < mesh.triCount; t++) {
    const i0 = mesh.indices ? mesh.indices[t * 3] : t * 3
    const i1 = mesh.indices ? mesh.indices[t * 3 + 1] : t * 3 + 1
    const i2 = mesh.indices ? mesh.indices[t * 3 + 2] : t * 3 + 2
    const ax = mesh.positions[i1 * 3] - mesh.positions[i0 * 3]
    const ay = mesh.positions[i1 * 3 + 1] - mesh.positions[i0 * 3 + 1]
    const az = mesh.positions[i1 * 3 + 2] - mesh.positions[i0 * 3 + 2]
    const bx = mesh.positions[i2 * 3] - mesh.positions[i0 * 3]
    const by = mesh.positions[i2 * 3 + 1] - mesh.positions[i0 * 3 + 1]
    const bz = mesh.positions[i2 * 3 + 2] - mesh.positions[i0 * 3 + 2]
    let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz)
    if (len > 1e-10) { nx /= len; ny /= len; nz /= len }
    normals[t * 3] = nx; normals[t * 3 + 1] = ny; normals[t * 3 + 2] = nz
  }
  return normals
}

function splitIntoIslands(mesh: ParsedMesh, angleThreshold: number): UVIsland[] {
  const faceNormals = computeFaceNormals(mesh)
  const edgeToTri = buildAdjacency(mesh)
  const cosThreshold = Math.cos(angleThreshold * Math.PI / 180)

  const triToNeighbors: number[][] = Array.from({ length: mesh.triCount }, () => [])
  for (const tris of edgeToTri.values()) {
    if (tris.length !== 2) continue
    const [t0, t1] = tris
    const dot = faceNormals[t0 * 3] * faceNormals[t1 * 3] +
                faceNormals[t0 * 3 + 1] * faceNormals[t1 * 3 + 1] +
                faceNormals[t0 * 3 + 2] * faceNormals[t1 * 3 + 2]
    if (dot >= cosThreshold) {
      triToNeighbors[t0].push(t1)
      triToNeighbors[t1].push(t0)
    }
  }

  const visited = new Uint8Array(mesh.triCount)
  const islands: UVIsland[] = []

  for (let t = 0; t < mesh.triCount; t++) {
    if (visited[t]) continue
    const island: UVIsland = { triangles: [], vertices: new Set() }
    const queue = [t]
    visited[t] = 1
    while (queue.length > 0) {
      const cur = queue.pop()!
      island.triangles.push(cur)
      const i0 = mesh.indices ? mesh.indices[cur * 3] : cur * 3
      const i1 = mesh.indices ? mesh.indices[cur * 3 + 1] : cur * 3 + 1
      const i2 = mesh.indices ? mesh.indices[cur * 3 + 2] : cur * 3 + 2
      island.vertices.add(i0); island.vertices.add(i1); island.vertices.add(i2)
      for (const neighbor of triToNeighbors[cur]) {
        if (!visited[neighbor]) { visited[neighbor] = 1; queue.push(neighbor) }
      }
    }
    islands.push(island)
  }
  return islands
}

function unfoldIsland(mesh: ParsedMesh, island: UVIsland): Map<number, [number, number]> {
  const uvMap = new Map<number, [number, number]>()
  if (island.triangles.length === 0) return uvMap

  const firstTri = island.triangles[0]
  const fi0 = mesh.indices ? mesh.indices[firstTri * 3] : firstTri * 3
  const fi1 = mesh.indices ? mesh.indices[firstTri * 3 + 1] : firstTri * 3 + 1
  const fi2 = mesh.indices ? mesh.indices[firstTri * 3 + 2] : firstTri * 3 + 2

  const dx = mesh.positions[fi1 * 3] - mesh.positions[fi0 * 3]
  const dy = mesh.positions[fi1 * 3 + 1] - mesh.positions[fi0 * 3 + 1]
  const dz = mesh.positions[fi1 * 3 + 2] - mesh.positions[fi0 * 3 + 2]
  const edge01Len = Math.sqrt(dx * dx + dy * dy + dz * dz)

  uvMap.set(fi0, [0, 0])
  uvMap.set(fi1, [edge01Len, 0])

  const ex = mesh.positions[fi2 * 3] - mesh.positions[fi0 * 3]
  const ey = mesh.positions[fi2 * 3 + 1] - mesh.positions[fi0 * 3 + 1]
  const ez = mesh.positions[fi2 * 3 + 2] - mesh.positions[fi0 * 3 + 2]
  const edge02Len = Math.sqrt(ex * ex + ey * ey + ez * ez)
  const cosA = (edge01Len > 1e-10 && edge02Len > 1e-10)
    ? (dx * ex + dy * ey + dz * ez) / (edge01Len * edge02Len) : 1
  const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA))
  uvMap.set(fi2, [edge02Len * cosA, edge02Len * sinA])

  const edgeQueue: [number, number, number][] = []
  const processedTri = new Set<number>()
  processedTri.add(firstTri)

  function enqueueEdges(tri: number) {
    const i0 = mesh.indices ? mesh.indices[tri * 3] : tri * 3
    const i1 = mesh.indices ? mesh.indices[tri * 3 + 1] : tri * 3 + 1
    const i2 = mesh.indices ? mesh.indices[tri * 3 + 2] : tri * 3 + 2
    edgeQueue.push([i0, i1, tri], [i1, i2, tri], [i2, i0, tri])
  }
  enqueueEdges(firstTri)

  const triSet = new Set(island.triangles)
  const edgeToTriLocal = new Map<string, number[]>()
  for (const t of island.triangles) {
    const i0 = mesh.indices ? mesh.indices[t * 3] : t * 3
    const i1 = mesh.indices ? mesh.indices[t * 3 + 1] : t * 3 + 1
    const i2 = mesh.indices ? mesh.indices[t * 3 + 2] : t * 3 + 2
    for (const [a, b] of [[i0, i1], [i1, i2], [i2, i0]]) {
      const key = Math.min(a, b) + ':' + Math.max(a, b)
      const list = edgeToTriLocal.get(key)
      if (list) list.push(t)
      else edgeToTriLocal.set(key, [t])
    }
  }

  while (edgeQueue.length > 0) {
    const [ea, eb, srcTri] = edgeQueue.pop()!
    const key = Math.min(ea, eb) + ':' + Math.max(ea, eb)
    const adj = edgeToTriLocal.get(key)
    if (!adj) continue

    for (const neighborTri of adj) {
      if (processedTri.has(neighborTri)) continue
      if (!triSet.has(neighborTri)) continue

      const ni0 = mesh.indices ? mesh.indices[neighborTri * 3] : neighborTri * 3
      const ni1 = mesh.indices ? mesh.indices[neighborTri * 3 + 1] : neighborTri * 3 + 1
      const ni2 = mesh.indices ? mesh.indices[neighborTri * 3 + 2] : neighborTri * 3 + 2

      let sharedA = -1, sharedB = -1, opposite = -1
      const verts = [ni0, ni1, ni2]
      for (const v of verts) {
        if (v === ea || v === eb) {
          if (sharedA < 0) sharedA = v; else sharedB = v
        } else {
          opposite = v
        }
      }
      if (sharedA < 0 || sharedB < 0 || opposite < 0) continue
      if (!uvMap.has(sharedA) || !uvMap.has(sharedB)) continue

      const [uA, vA] = uvMap.get(sharedA)!
      const [uB, vB] = uvMap.get(sharedB)!

      const pAx = mesh.positions[sharedA * 3], pAy = mesh.positions[sharedA * 3 + 1], pAz = mesh.positions[sharedA * 3 + 2]
      const pBx = mesh.positions[sharedB * 3], pBy = mesh.positions[sharedB * 3 + 1], pBz = mesh.positions[sharedB * 3 + 2]
      const pOx = mesh.positions[opposite * 3], pOy = mesh.positions[opposite * 3 + 1], pOz = mesh.positions[opposite * 3 + 2]

      const eABx = pBx - pAx, eABy = pBy - pAy, eABz = pBz - pAz
      const eAOx = pOx - pAx, eAOy = pOy - pAy, eAOz = pOz - pAz
      const lenAB = Math.sqrt(eABx * eABx + eABy * eABy + eABz * eABz)
      const lenAO = Math.sqrt(eAOx * eAOx + eAOy * eAOy + eAOz * eAOz)

      if (lenAB < 1e-10 || lenAO < 1e-10) continue

      const cosAngle = (eABx * eAOx + eABy * eAOy + eABz * eAOz) / (lenAB * lenAO)
      const sinAngle = Math.sqrt(Math.max(0, 1 - cosAngle * cosAngle))

      const edgeU = uB - uA, edgeV = vB - vA
      const edgeLen2D = Math.sqrt(edgeU * edgeU + edgeV * edgeV)
      if (edgeLen2D < 1e-10) continue

      const dirU = edgeU / edgeLen2D, dirV = edgeV / edgeLen2D
      const perpU = -dirV, perpV = dirU

      const projAlong = lenAO * cosAngle * (edgeLen2D / lenAB)
      const projPerp = lenAO * sinAngle * (edgeLen2D / lenAB)

      // check which side: use cross product to pick consistent side
      const crossAB_AO = eABx * (eAOy * 0 - eAOz * 0) - eABy * (eAOx * 0 - eAOz * 0) + eABz * (eAOx * 0 - eAOy * 0)
      // Simpler: use face normal direction
      const cx = eABy * eAOz - eABz * eAOy
      const cy = eABz * eAOx - eABx * eAOz
      const cz = eABx * eAOy - eABy * eAOx

      // Determine winding by comparing with face normal of the source triangle
      const srcI0 = mesh.indices ? mesh.indices[srcTri * 3] : srcTri * 3
      const srcI1 = mesh.indices ? mesh.indices[srcTri * 3 + 1] : srcTri * 3 + 1
      const srcI2 = mesh.indices ? mesh.indices[srcTri * 3 + 2] : srcTri * 3 + 2
      const se1x = mesh.positions[srcI1 * 3] - mesh.positions[srcI0 * 3]
      const se1y = mesh.positions[srcI1 * 3 + 1] - mesh.positions[srcI0 * 3 + 1]
      const se1z = mesh.positions[srcI1 * 3 + 2] - mesh.positions[srcI0 * 3 + 2]
      const se2x = mesh.positions[srcI2 * 3] - mesh.positions[srcI0 * 3]
      const se2y = mesh.positions[srcI2 * 3 + 1] - mesh.positions[srcI0 * 3 + 1]
      const se2z = mesh.positions[srcI2 * 3 + 2] - mesh.positions[srcI0 * 3 + 2]
      const snx = se1y * se2z - se1z * se2y
      const sny = se1z * se2x - se1x * se2z
      const snz = se1x * se2y - se1y * se2x

      const side = (cx * snx + cy * sny + cz * snz) > 0 ? 1 : -1

      if (!uvMap.has(opposite)) {
        const newU = uA + dirU * projAlong + perpU * projPerp * side
        const newV = vA + dirV * projAlong + perpV * projPerp * side
        uvMap.set(opposite, [newU, newV])
      }

      processedTri.add(neighborTri)
      enqueueEdges(neighborTri)
    }
  }

  return uvMap
}

interface PackedRect { x: number; y: number; w: number; h: number }

function packIslands(rects: { w: number; h: number }[]): { packed: PackedRect[]; totalW: number; totalH: number } {
  const indexed = rects.map((r, i) => ({ ...r, i }))
  indexed.sort((a, b) => Math.max(b.w, b.h) - Math.max(a.w, a.h))

  let totalW = 0, totalH = 0
  const packed: PackedRect[] = new Array(rects.length)

  let curX = 0, curY = 0, rowH = 0
  const maxRowW = Math.ceil(Math.sqrt(indexed.reduce((s, r) => s + r.w * r.h, 0))) * 1.3

  for (const rect of indexed) {
    if (curX + rect.w > maxRowW) {
      curX = 0
      curY += rowH + 2
      rowH = 0
    }
    packed[rect.i] = { x: curX, y: curY, w: rect.w, h: rect.h }
    totalW = Math.max(totalW, curX + rect.w)
    totalH = Math.max(totalH, curY + rect.h)
    curX += rect.w + 2
    rowH = Math.max(rowH, rect.h)
  }

  return { packed, totalW, totalH }
}

function smartUVUnwrap(mesh: ParsedMesh, angleThreshold = 66): Float32Array {
  console.log('[uv-unwrap] Starting smart UV unwrap, angle threshold:', angleThreshold)
  const islands = splitIntoIslands(mesh, angleThreshold)
  console.log('[uv-unwrap] Found', islands.length, 'islands')

  const islandUVs: Map<number, [number, number]>[] = []
  const islandAreas: number[] = []

  for (const island of islands) {
    const uvs = unfoldIsland(mesh, island)
    islandUVs.push(uvs)

    // Compute 3D surface area of this island for proportional sizing
    let area = 0
    for (const t of island.triangles) {
      const i0 = mesh.indices ? mesh.indices[t * 3] : t * 3
      const i1 = mesh.indices ? mesh.indices[t * 3 + 1] : t * 3 + 1
      const i2 = mesh.indices ? mesh.indices[t * 3 + 2] : t * 3 + 2
      const ax = mesh.positions[i1 * 3] - mesh.positions[i0 * 3]
      const ay = mesh.positions[i1 * 3 + 1] - mesh.positions[i0 * 3 + 1]
      const az = mesh.positions[i1 * 3 + 2] - mesh.positions[i0 * 3 + 2]
      const bx = mesh.positions[i2 * 3] - mesh.positions[i0 * 3]
      const by = mesh.positions[i2 * 3 + 1] - mesh.positions[i0 * 3 + 1]
      const bz = mesh.positions[i2 * 3 + 2] - mesh.positions[i0 * 3 + 2]
      const cx = ay * bz - az * by, cy = az * bx - ax * bz, cz = ax * by - ay * bx
      area += Math.sqrt(cx * cx + cy * cy + cz * cz) * 0.5
    }
    islandAreas.push(area)
  }

  // Normalize each island's UVs to a unit square, then scale by sqrt(area) for proportional sizing
  const islandBounds: { w: number; h: number }[] = []
  const normalizedIslandUVs: Map<number, [number, number]>[] = []

  for (let i = 0; i < islands.length; i++) {
    const uvs = islandUVs[i]
    let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity
    for (const [u, v] of uvs.values()) {
      if (u < minU) minU = u; if (u > maxU) maxU = u
      if (v < minV) minV = v; if (v > maxV) maxV = v
    }
    const rangeU = maxU - minU || 0.001
    const rangeV = maxV - minV || 0.001
    const scale = Math.sqrt(islandAreas[i]) || 1

    const normalized = new Map<number, [number, number]>()
    for (const [vertIdx, [u, v]] of uvs) {
      normalized.set(vertIdx, [
        ((u - minU) / rangeU) * scale * (rangeU / Math.max(rangeU, rangeV)),
        ((v - minV) / rangeV) * scale * (rangeV / Math.max(rangeU, rangeV)),
      ])
    }
    normalizedIslandUVs.push(normalized)

    let nMaxU = 0, nMaxV = 0
    for (const [nu, nv] of normalized.values()) {
      if (nu > nMaxU) nMaxU = nu
      if (nv > nMaxV) nMaxV = nv
    }
    islandBounds.push({ w: nMaxU, h: nMaxV })
  }

  // Pack using normalized sizes
  const packScale = 1024
  const pixelRects = islandBounds.map(b => ({
    w: Math.max(4, Math.ceil(b.w * packScale) + 4),
    h: Math.max(4, Math.ceil(b.h * packScale) + 4),
  }))

  const { packed, totalW, totalH } = packIslands(pixelRects)
  const atlasW = Math.max(totalW, 1)
  const atlasH = Math.max(totalH, 1)
  console.log('[uv-unwrap] Atlas packing:', atlasW, 'x', atlasH)

  const vCount = mesh.positions.length / 3
  const newUVs = new Float32Array(vCount * 2)

  for (let i = 0; i < islands.length; i++) {
    const uvs = normalizedIslandUVs[i]
    const bounds = islandBounds[i]
    const rect = packed[i]
    const margin = 2

    for (const [vertIdx, [u, v]] of uvs) {
      const normalizedU = bounds.w > 0 ? u / bounds.w : 0
      const normalizedV = bounds.h > 0 ? v / bounds.h : 0
      const atlasU = (rect.x + margin + normalizedU * Math.max(0, rect.w - margin * 2)) / atlasW
      const atlasV = (rect.y + margin + normalizedV * Math.max(0, rect.h - margin * 2)) / atlasH
      newUVs[vertIdx * 2] = Math.min(1, Math.max(0, atlasU))
      newUVs[vertIdx * 2 + 1] = Math.min(1, Math.max(0, atlasV))
    }
  }

  console.log('[uv-unwrap] Done. Assigned UVs for', vCount, 'vertices')
  return newUVs
}

function buildGlbWithNewUVs(glbBuffer: Buffer, newUVs: Float32Array): Buffer {
  const { json, binChunk } = parseGlb(glbBuffer)
  const prim = json.meshes[0].primitives[0]
  const uvAccIdx = prim.attributes.TEXCOORD_0
  const acc = json.accessors[uvAccIdx]
  const bv = json.bufferViews[acc.bufferView]
  const bvOffset = bv.byteOffset || 0
  const accOffset = acc.byteOffset || 0
  const stride = bv.byteStride || 0
  const vCount = acc.count

  const newBin = Buffer.from(binChunk)

  if (stride > 0 && stride !== 8) {
    // Interleaved: write each UV pair at the correct stride offset
    for (let i = 0; i < vCount; i++) {
      const bufPos = bvOffset + accOffset + i * stride
      newBin.writeFloatLE(newUVs[i * 2], bufPos)
      newBin.writeFloatLE(newUVs[i * 2 + 1], bufPos + 4)
    }
  } else {
    // Tightly packed: copy the whole block
    const offset = bvOffset + accOffset
    const uvBytes = Buffer.from(newUVs.buffer, newUVs.byteOffset, newUVs.byteLength)
    uvBytes.copy(newBin, offset)
  }

  // update min/max
  let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity
  for (let i = 0; i < newUVs.length; i += 2) {
    if (newUVs[i] < minU) minU = newUVs[i]; if (newUVs[i] > maxU) maxU = newUVs[i]
    if (newUVs[i + 1] < minV) minV = newUVs[i + 1]; if (newUVs[i + 1] > maxV) maxV = newUVs[i + 1]
  }
  acc.min = [minU, minV]
  acc.max = [maxU, maxV]

  const jsonStr = JSON.stringify(json)
  const jsonBuf = Buffer.from(jsonStr, 'utf8')
  const paddedJsonLen = Math.ceil(jsonBuf.length / 4) * 4
  const paddedJson = Buffer.alloc(paddedJsonLen, 0x20)
  jsonBuf.copy(paddedJson)

  const totalLen = 12 + 8 + paddedJsonLen + 8 + newBin.length
  const glb = Buffer.alloc(totalLen)
  glb.writeUInt32LE(0x46546C67, 0)
  glb.writeUInt32LE(2, 4)
  glb.writeUInt32LE(totalLen, 8)
  glb.writeUInt32LE(paddedJsonLen, 12)
  glb.writeUInt32LE(0x4E4F534A, 16)
  paddedJson.copy(glb, 20)
  const binStart = 20 + paddedJsonLen
  glb.writeUInt32LE(newBin.length, binStart)
  glb.writeUInt32LE(0x004E4942, binStart + 4)
  newBin.copy(glb, binStart + 8)
  return glb
}

export async function applyDebugTexture(glbBuffer: Buffer, atlasSize = 2048): Promise<{ texturedGlbBuffer: Buffer; atlasBuffer: Buffer }> {
  const sharp = (await import('sharp')).default

  const { json, binChunk } = parseGlb(glbBuffer)
  const mesh = extractMesh(json, binChunk)

  console.log('[debug-texture] Re-unwrapping UVs...')
  const newUVs = smartUVUnwrap(mesh)
  const rewrappedGlb = buildGlbWithNewUVs(glbBuffer, newUVs)

  console.log('[debug-texture] Generating debug grid atlas...')
  const rawAtlas = generateUVDebugAtlas(atlasSize)
  const atlasBuffer = await sharp(rawAtlas, { raw: { width: atlasSize, height: atlasSize, channels: 4 } })
    .png({ compressionLevel: 6 })
    .toBuffer()

  const { json: newJson, binChunk: newBin } = parseGlb(rewrappedGlb)
  const texturedGlbBuffer = buildTexturedGlb(rewrappedGlb, newJson, newBin, atlasBuffer)
  return { texturedGlbBuffer, atlasBuffer }
}

export interface TextureProjectionInput {
  glbBuffer: Buffer
  views: Array<{ angle: string; imageBuffer: Buffer }>
  atlasSize?: number
}

export interface TextureProjectionOutput {
  texturedGlbBuffer: Buffer
  atlasBuffer: Buffer
  manifest: {
    atlas_size: number
    views_used: string[]
    triangles_textured: number
    triangles_total: number
  }
}

export async function projectTexture(input: TextureProjectionInput): Promise<TextureProjectionOutput> {
  const sharp = (await import('sharp')).default
  const atlasSize = input.atlasSize ?? 2048

  console.log('[texture-projector] Start. GLB size:', input.glbBuffer.length, 'views:', input.views.length, 'atlas:', atlasSize)

  console.log('[texture-projector] Parsing GLB (raw)...')
  const { json, binChunk } = parseGlb(input.glbBuffer)
  console.log('[texture-projector] GLB parsed. Extracting mesh...')
  const mesh = extractMesh(json, binChunk)
  console.log('[texture-projector] Mesh:', mesh.triCount, 'triangles,', mesh.positions.length / 3, 'vertices')

  const bbox = computeBBox(mesh)
  console.log('[texture-projector] BBox center:', bbox.cx.toFixed(3), bbox.cy.toFixed(3), bbox.cz.toFixed(3), 'radius:', bbox.radius.toFixed(3))

  const cameras: Camera[] = []
  for (const view of input.views) {
    const cfg = CAMERA_CONFIGS[view.angle] ?? CAMERA_CONFIGS.front
    const meta = await sharp(view.imageBuffer).metadata()
    const w = meta.width ?? 512, h = meta.height ?? 512
    const rawPixels = await sharp(view.imageBuffer).resize({ width: w, height: h }).raw().ensureAlpha().toBuffer()
    const [bgR, bgG, bgB] = detectBackground(rawPixels, w, h)
    cameras.push(buildCamera(cfg, rawPixels, w, h, bgR, bgG, bgB))
    console.log('[texture-projector] Camera:', view.angle, w, 'x', h, 'bg:', bgR, bgG, bgB)
  }

  const atlas = Buffer.alloc(atlasSize * atlasSize * 4, 0)
  let texturedCount = 0
  const logEvery = Math.max(1, Math.floor(mesh.triCount / 10))
  const fovScale = 0.8
  const camDist = bbox.radius * 2.5

  for (let t = 0; t < mesh.triCount; t++) {
    if (t % logEvery === 0) console.log(`[texture-projector] ${t}/${mesh.triCount}`)

    let i0: number, i1: number, i2: number
    if (mesh.indices) {
      i0 = mesh.indices[t * 3]; i1 = mesh.indices[t * 3 + 1]; i2 = mesh.indices[t * 3 + 2]
    } else {
      i0 = t * 3; i1 = t * 3 + 1; i2 = t * 3 + 2
    }

    const p0x = mesh.positions[i0 * 3], p0y = mesh.positions[i0 * 3 + 1], p0z = mesh.positions[i0 * 3 + 2]
    const p1x = mesh.positions[i1 * 3], p1y = mesh.positions[i1 * 3 + 1], p1z = mesh.positions[i1 * 3 + 2]
    const p2x = mesh.positions[i2 * 3], p2y = mesh.positions[i2 * 3 + 1], p2z = mesh.positions[i2 * 3 + 2]

    // face normal
    const e1x = p1x - p0x, e1y = p1y - p0y, e1z = p1z - p0z
    const e2x = p2x - p0x, e2y = p2y - p0y, e2z = p2z - p0z
    let nx = e1y * e2z - e1z * e2y
    let ny = e1z * e2x - e1x * e2z
    let nz = e1x * e2y - e1y * e2x
    const nLen = Math.sqrt(nx * nx + ny * ny + nz * nz)
    if (nLen < 1e-10) continue
    nx /= nLen; ny /= nLen; nz /= nLen

    // best camera: dot(normal, -camDir)
    let bestCam: Camera | null = null
    let bestDot = -Infinity
    for (const cam of cameras) {
      const d = -(nx * cam.dx + ny * cam.dy + nz * cam.dz)
      if (d > bestDot) { bestDot = d; bestCam = cam }
    }
    if (!bestCam || bestDot < 0.01) continue

    const uv0u = mesh.uvs[i0 * 2] * atlasSize, uv0v = mesh.uvs[i0 * 2 + 1] * atlasSize
    const uv1u = mesh.uvs[i1 * 2] * atlasSize, uv1v = mesh.uvs[i1 * 2 + 1] * atlasSize
    const uv2u = mesh.uvs[i2 * 2] * atlasSize, uv2v = mesh.uvs[i2 * 2 + 1] * atlasSize

    const minY = Math.max(0, Math.floor(Math.min(uv0v, uv1v, uv2v)))
    const maxY = Math.min(atlasSize - 1, Math.ceil(Math.max(uv0v, uv1v, uv2v)))

    const cam = bestCam
    const camPx = bbox.cx - cam.dx * camDist
    const camPy = bbox.cy - cam.dy * camDist
    const camPz = bbox.cz - cam.dz * camDist

    let filled = false
    for (let py = minY; py <= maxY; py++) {
      const scanY = py + 0.5
      // edge intersections
      const edges: number[] = []
      const eu = [uv0u, uv1u, uv2u, uv0u]
      const ev = [uv0v, uv1v, uv2v, uv0v]
      for (let e = 0; e < 3; e++) {
        const y0 = ev[e], y1 = ev[e + 1]
        if ((y0 <= scanY && y1 > scanY) || (y1 <= scanY && y0 > scanY)) {
          edges.push(eu[e] + (scanY - y0) / (y1 - y0) * (eu[e + 1] - eu[e]))
        }
      }
      if (edges.length < 2) continue
      if (edges[0] > edges[1]) { const tmp = edges[0]; edges[0] = edges[1]; edges[1] = tmp }

      const startX = Math.max(0, Math.floor(edges[0]))
      const endX = Math.min(atlasSize - 1, Math.ceil(edges[1]))

      for (let px = startX; px <= endX; px++) {
        const u = (px + 0.5) / atlasSize
        const v = (py + 0.5) / atlasSize

        // barycentric in UV space
        const denom = (uv1v / atlasSize - uv2v / atlasSize) * (uv0u / atlasSize - uv2u / atlasSize) +
                      (uv2u / atlasSize - uv1u / atlasSize) * (uv0v / atlasSize - uv2v / atlasSize)
        if (Math.abs(denom) < 1e-10) continue
        const w0 = ((uv1v / atlasSize - uv2v / atlasSize) * (u - uv2u / atlasSize) +
                     (uv2u / atlasSize - uv1u / atlasSize) * (v - uv2v / atlasSize)) / denom
        const w1 = ((uv2v / atlasSize - uv0v / atlasSize) * (u - uv2u / atlasSize) +
                     (uv0u / atlasSize - uv2u / atlasSize) * (v - uv2v / atlasSize)) / denom
        const w2 = 1 - w0 - w1
        if (w0 < -0.001 || w1 < -0.001 || w2 < -0.001) continue

        // world pos
        const wx = p0x * w0 + p1x * w1 + p2x * w2
        const wy = p0y * w0 + p1y * w1 + p2y * w2
        const wz = p0z * w0 + p1z * w1 + p2z * w2

        // project to view
        const tpx = wx - camPx, tpy = wy - camPy, tpz = wz - camPz
        const dist = tpx * cam.dx + tpy * cam.dy + tpz * cam.dz
        if (dist <= 0) continue

        const projR = (tpx * cam.rx + tpy * cam.ry + tpz * cam.rz) / dist
        const projU = (tpx * cam.ux + tpy * cam.uy + tpz * cam.uz) / dist

        const imgX = Math.floor((projR / fovScale + 0.5) * cam.w)
        const imgY = Math.floor((0.5 - projU / fovScale) * cam.h)
        if (imgX < 0 || imgX >= cam.w || imgY < 0 || imgY >= cam.h) continue

        const srcOff = (imgY * cam.w + imgX) * 4
        if (isBackground(cam.pixels, srcOff, cam.bgR, cam.bgG, cam.bgB)) continue
        const flippedY = atlasSize - 1 - py
        const dstOff = (flippedY * atlasSize + px) * 4
        atlas[dstOff] = cam.pixels[srcOff]
        atlas[dstOff + 1] = cam.pixels[srcOff + 1]
        atlas[dstOff + 2] = cam.pixels[srcOff + 2]
        atlas[dstOff + 3] = 255
        filled = true
      }
    }
    if (filled) texturedCount++
  }

  console.log('[texture-projector] Textured', texturedCount, '/', mesh.triCount, 'triangles')

  const atlasBuffer = await sharp(atlas, { raw: { width: atlasSize, height: atlasSize, channels: 4 } })
    .png({ compressionLevel: 6 })
    .toBuffer()
  console.log('[texture-projector] Atlas PNG:', atlasBuffer.length, 'bytes')

  // Build new GLB: copy original mesh data + add texture
  const texturedGlbBuffer = buildTexturedGlb(input.glbBuffer, json, binChunk, atlasBuffer)
  console.log('[texture-projector] Textured GLB:', texturedGlbBuffer.length, 'bytes')

  return {
    texturedGlbBuffer,
    atlasBuffer,
    manifest: {
      atlas_size: atlasSize,
      views_used: input.views.map(v => v.angle),
      triangles_textured: texturedCount,
      triangles_total: mesh.triCount,
    },
  }
}

function buildTexturedGlb(originalGlb: Buffer, gltfJson: any, binChunk: Buffer, pngAtlas: Buffer): Buffer {
  const json = JSON.parse(JSON.stringify(gltfJson))

  // Add PNG image to the binary buffer
  const pngOffset = binChunk.length
  const paddedPngLen = Math.ceil(pngAtlas.length / 4) * 4
  const newBin = Buffer.alloc(binChunk.length + paddedPngLen)
  binChunk.copy(newBin)
  pngAtlas.copy(newBin, pngOffset)

  // Add bufferView for the PNG
  if (!json.bufferViews) json.bufferViews = []
  const pngBvIdx = json.bufferViews.length
  json.bufferViews.push({
    buffer: 0,
    byteOffset: pngOffset,
    byteLength: pngAtlas.length,
  })

  // Update buffer length
  json.buffers[0].byteLength = newBin.length

  // Keep the proof GLB self-contained and boring for GLTFLoader:
  // one embedded PNG image, one texture, no stale provider WebP texture extensions.
  json.images = [{ bufferView: pngBvIdx, mimeType: 'image/png' }]
  json.textures = [{ source: 0 }]
  if (json.extensionsUsed) {
    json.extensionsUsed = json.extensionsUsed.filter((e: string) => e !== 'EXT_texture_webp')
    if (json.extensionsUsed.length === 0) delete json.extensionsUsed
  }
  if (json.extensionsRequired) {
    json.extensionsRequired = json.extensionsRequired.filter((e: string) => e !== 'EXT_texture_webp')
    if (json.extensionsRequired.length === 0) delete json.extensionsRequired
  }

  // Add or update material
  if (!json.materials) json.materials = []
  if (json.materials.length === 0) {
    json.materials.push({
      pbrMetallicRoughness: {
        baseColorTexture: { index: 0 },
        metallicFactor: 0,
        roughnessFactor: 0.8,
      },
      doubleSided: true,
    })
  } else {
    for (const mat of json.materials) {
      if (!mat.pbrMetallicRoughness) mat.pbrMetallicRoughness = {}
      mat.pbrMetallicRoughness.baseColorTexture = { index: 0 }
      mat.pbrMetallicRoughness.metallicFactor = 0
      mat.pbrMetallicRoughness.roughnessFactor = 0.8
      mat.doubleSided = true
      delete mat.pbrMetallicRoughness.metallicRoughnessTexture
      delete mat.normalTexture
      delete mat.occlusionTexture
      delete mat.emissiveTexture
    }
  }

  // Ensure all primitives reference a material
  for (const m of json.meshes) {
    for (const p of m.primitives) {
      if (p.material === undefined) p.material = 0
    }
  }

  // Build GLB
  const jsonStr = JSON.stringify(json)
  const jsonBuf = Buffer.from(jsonStr, 'utf8')
  const paddedJsonLen = Math.ceil(jsonBuf.length / 4) * 4
  const paddedJson = Buffer.alloc(paddedJsonLen, 0x20) // pad with spaces
  jsonBuf.copy(paddedJson)

  const totalLen = 12 + 8 + paddedJsonLen + 8 + newBin.length
  const glb = Buffer.alloc(totalLen)

  // Header
  glb.writeUInt32LE(0x46546C67, 0) // glTF
  glb.writeUInt32LE(2, 4)           // version
  glb.writeUInt32LE(totalLen, 8)

  // JSON chunk
  glb.writeUInt32LE(paddedJsonLen, 12)
  glb.writeUInt32LE(0x4E4F534A, 16) // JSON
  paddedJson.copy(glb, 20)

  // BIN chunk
  const binStart = 20 + paddedJsonLen
  glb.writeUInt32LE(newBin.length, binStart)
  glb.writeUInt32LE(0x004E4942, binStart + 4) // BIN
  newBin.copy(glb, binStart + 8)

  return glb
}
