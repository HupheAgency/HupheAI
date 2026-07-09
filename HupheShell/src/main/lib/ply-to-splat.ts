/**
 * Converteert een Gaussian Splat .ply bestand (zoals Brush exporteert)
 * naar het binaire .splat formaat dat @react-three/drei <Splat> verwacht.
 *
 * .splat formaat: 32 bytes per vertex
 *   - 12 bytes: position xyz (float32 × 3)
 *   - 12 bytes: scale xyz (float32 × 3, exp() toegepast)
 *   -  4 bytes: color rgba (uint8 × 4, sigmoid toegepast op f_dc en opacity)
 *   -  4 bytes: rotation quaternion (int8 × 4, genormaliseerd naar -128..128)
 *
 * Filters (twee passes):
 *   1. Alpha-drempel  — lage-opacity mist/floaters (instelbaar, default 15/255 ≈ 6%)
 *   2. Schaalfilter   — IQR outlier: Q3 + 3×IQR van max(sx,sy,sz)
 *   3. Bounding box   — posities buiten 4×standaarddeviatie van het gemiddelde
 */

import { readFile, writeFile } from 'fs/promises'
import { join, dirname, basename } from 'path'

const sigmoid = (x: number) => 1 / (1 + Math.exp(-x))

interface PlyProperty {
  name: string
  type: string
  offset: number
  byteSize: number
}

function byteSize(type: string): number {
  switch (type) {
    case 'float': case 'float32': return 4
    case 'double': case 'float64': return 8
    case 'int': case 'int32': case 'uint': case 'uint32': return 4
    case 'short': case 'int16': case 'ushort': case 'uint16': return 2
    case 'char': case 'int8': case 'uchar': case 'uint8': return 1
    default: return 4
  }
}

function readFloat(buf: Buffer, offset: number, littleEndian = true): number {
  return littleEndian ? buf.readFloatLE(offset) : buf.readFloatBE(offset)
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  const idx = Math.max(0, Math.min(sorted.length - 1, Math.floor(p * sorted.length)))
  return sorted[idx]
}

function meanStd(values: number[]): { mean: number; std: number } {
  if (values.length === 0) return { mean: 0, std: 1 }
  const mean = values.reduce((s, v) => s + v, 0) / values.length
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length
  return { mean, std: Math.sqrt(variance) || 1 }
}

export interface PlyToSplatOptions {
  alphaThreshold?: number   // uint8, default 15 (~6%)
  positionSigma?: number    // std-dev multiplier for bounding box, default 4
  scaleIqrFactor?: number   // Tukey fence multiplier for scale, default 3
}

export async function plyToSplat(
  plyPath: string,
  options: PlyToSplatOptions = {},
): Promise<{ splatPath: string; localFloorY: number }> {
  const {
    alphaThreshold = 15,
    positionSigma = 4,
    scaleIqrFactor = 3,
  } = options

  const raw = await readFile(plyPath)

  // Parse header
  const headerEnd = raw.indexOf('\nend_header\n')
  if (headerEnd < 0) throw new Error('Ongeldige PLY header')
  const header = raw.subarray(0, headerEnd + 1).toString('ascii')
  const dataStart = headerEnd + '\nend_header\n'.length

  const lines = header.split('\n')
  let numVertices = 0
  const properties: PlyProperty[] = []
  let byteOffset = 0
  let littleEndian = true

  for (const line of lines) {
    const parts = line.trim().split(/\s+/)
    if (parts[0] === 'format') {
      littleEndian = parts[1] !== 'binary_big_endian'
    } else if (parts[0] === 'element' && parts[1] === 'vertex') {
      numVertices = parseInt(parts[2])
    } else if (parts[0] === 'property' && parts[1] !== 'list') {
      const type = parts[1]
      const name = parts[2]
      properties.push({ name, type, offset: byteOffset, byteSize: byteSize(type) })
      byteOffset += byteSize(type)
    }
  }

  const rowSize = byteOffset
  const data = raw.subarray(dataStart)

  const get = (row: number, name: string): number => {
    const prop = properties.find((p) => p.name === name)
    if (!prop) return 0
    const off = row * rowSize + prop.offset
    if (prop.type === 'float' || prop.type === 'float32') return readFloat(data, off, littleEndian)
    if (prop.type === 'double' || prop.type === 'float64') {
      return littleEndian ? data.readDoubleBE(off) : data.readDoubleLE(off)
    }
    return readFloat(data, off, littleEndian)
  }

  // 2DGS PLY heeft alleen scale_0 en scale_1 (platte disc, geen dikte).
  // Als scale_2 ontbreekt, is get() = 0 → Math.exp(0) = 1 → ster-explosie.
  // Gebruik een zeer dunne fallback zodat de disc plat blijft.
  const hasScale2 = properties.some((p) => p.name === 'scale_2')
  const getScale2 = hasScale2
    ? (row: number) => get(row, 'scale_2')
    : (row: number) => Math.min(get(row, 'scale_0'), get(row, 'scale_1')) - 5  // ~1% van de kleinste schaal

  // ── Pass 1: verzamel statistieken voor alle alpha-valide vertices ──────────
  const xs: number[] = [], ys: number[] = [], zs: number[] = []
  const maxScales: number[] = []

  for (let i = 0; i < numVertices; i++) {
    const opacity = sigmoid(get(i, 'opacity'))
    if (opacity * 255 < alphaThreshold) continue

    xs.push(get(i, 'x'))
    ys.push(get(i, 'y'))
    zs.push(get(i, 'z'))

    const s = Math.max(
      Math.exp(get(i, 'scale_0')),
      Math.exp(get(i, 'scale_1')),
      Math.exp(getScale2(i)),
    )
    maxScales.push(s)
  }

  // Schaalgrens via Tukey-fence (IQR)
  const sortedScales = [...maxScales].sort((a, b) => a - b)
  const q1 = percentile(sortedScales, 0.25)
  const q3 = percentile(sortedScales, 0.75)
  const iqr = q3 - q1
  const maxScaleAllowed = q3 + scaleIqrFactor * iqr

  // Positiegrenzen via mean ± sigma × std per as
  const statX = meanStd(xs)
  const statY = meanStd(ys)
  const statZ = meanStd(zs)
  const bounds = {
    xMin: statX.mean - positionSigma * statX.std, xMax: statX.mean + positionSigma * statX.std,
    yMin: statY.mean - positionSigma * statY.std, yMax: statY.mean + positionSigma * statY.std,
    zMin: statZ.mean - positionSigma * statZ.std, zMax: statZ.mean + positionSigma * statZ.std,
  }

  console.log(`[ply-to-splat] filters: alpha≥${alphaThreshold}, maxScale≤${maxScaleAllowed.toFixed(3)} (IQR×${scaleIqrFactor}), pos bounds X[${bounds.xMin.toFixed(2)},${bounds.xMax.toFixed(2)}] Y[${bounds.yMin.toFixed(2)},${bounds.yMax.toFixed(2)}] Z[${bounds.zMin.toFixed(2)},${bounds.zMax.toFixed(2)}]`)

  // ── Pass 2: schrijf gefilterde vertices ───────────────────────────────────
  const out = Buffer.allocUnsafe(numVertices * 32)
  const yValues: number[] = []
  let validVertices = 0
  let filteredScale = 0, filteredBounds = 0

  for (let i = 0; i < numVertices; i++) {
    const opacity = sigmoid(get(i, 'opacity'))
    if (opacity * 255 < alphaThreshold) continue

    const x = get(i, 'x')
    const y = get(i, 'y')
    const z = get(i, 'z')

    // Bounding box filter
    if (x < bounds.xMin || x > bounds.xMax ||
        y < bounds.yMin || y > bounds.yMax ||
        z < bounds.zMin || z > bounds.zMax) {
      filteredBounds++
      continue
    }

    // Schaalfilter
    const sx = Math.exp(get(i, 'scale_0'))
    const sy = Math.exp(get(i, 'scale_1'))
    const sz = Math.exp(getScale2(i))
    if (Math.max(sx, sy, sz) > maxScaleAllowed) {
      filteredScale++
      continue
    }

    const base = validVertices * 32
    validVertices++
    yValues.push(y)

    out.writeFloatLE(x, base + 0)
    out.writeFloatLE(y, base + 4)
    out.writeFloatLE(z, base + 8)
    out.writeFloatLE(sx, base + 12)
    out.writeFloatLE(sy, base + 16)
    out.writeFloatLE(sz, base + 20)

    const SH_C0 = 0.28209479177387814
    const clamp = (v: number) => Math.min(255, Math.max(0, Math.round(v)))
    out[base + 24] = clamp((0.5 + SH_C0 * get(i, 'f_dc_0')) * 255)
    out[base + 25] = clamp((0.5 + SH_C0 * get(i, 'f_dc_1')) * 255)
    out[base + 26] = clamp((0.5 + SH_C0 * get(i, 'f_dc_2')) * 255)
    out[base + 27] = clamp(opacity * 255)

    const qw = get(i, 'rot_0')
    const qx = get(i, 'rot_1')
    const qy = get(i, 'rot_2')
    const qz = get(i, 'rot_3')
    const len = Math.sqrt(qw * qw + qx * qx + qy * qy + qz * qz) || 1
    out.writeUInt8(clamp((qw / len) * 128 + 128), base + 28)
    out.writeUInt8(clamp((qx / len) * 128 + 128), base + 29)
    out.writeUInt8(clamp((qy / len) * 128 + 128), base + 30)
    out.writeUInt8(clamp((qz / len) * 128 + 128), base + 31)
  }

  yValues.sort((a, b) => a - b)
  const localFloorY = yValues.length
    ? yValues[Math.max(0, Math.min(yValues.length - 1, Math.floor(yValues.length * 0.05)))]
    : 0

  const splatPath = join(dirname(plyPath), basename(plyPath, '.ply') + '.splat')
  await writeFile(splatPath, out.subarray(0, validVertices * 32))
  console.log(`[ply-to-splat] ${numVertices} vertices → ${validVertices} geldig (−${filteredScale} schaal, −${filteredBounds} bounds) → ${splatPath} | floorY=${localFloorY.toFixed(3)}`)
  return { splatPath, localFloorY }
}
