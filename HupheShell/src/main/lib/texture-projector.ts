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
    const offset = (bv.byteOffset || 0) + (acc.byteOffset || 0)
    const componentType = acc.componentType
    const components = acc.type === 'VEC3' ? 3 : acc.type === 'VEC2' ? 2 : 1
    const count = acc.count * components

    if (componentType === 5126) return new Float32Array(bin.buffer, bin.byteOffset + offset, count)
    if (componentType === 5123) return new Uint16Array(bin.buffer, bin.byteOffset + offset, count)
    if (componentType === 5125) return new Uint32Array(bin.buffer, bin.byteOffset + offset, count)
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
}

function buildCamera(cfg: CameraConfig, pixels: Buffer, w: number, h: number): Camera {
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
    pixels, w, h,
  }
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
  const atlasSize = input.atlasSize ?? 1024

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
    cameras.push(buildCamera(cfg, rawPixels, w, h))
    console.log('[texture-projector] Camera:', view.angle, w, 'x', h)
  }

  const atlas = Buffer.alloc(atlasSize * atlasSize * 4, 128)
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
    })
  } else {
    for (const mat of json.materials) {
      if (!mat.pbrMetallicRoughness) mat.pbrMetallicRoughness = {}
      mat.pbrMetallicRoughness.baseColorTexture = { index: 0 }
      mat.pbrMetallicRoughness.metallicFactor = mat.pbrMetallicRoughness.metallicFactor ?? 0
      mat.pbrMetallicRoughness.roughnessFactor = mat.pbrMetallicRoughness.roughnessFactor ?? 0.8
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
