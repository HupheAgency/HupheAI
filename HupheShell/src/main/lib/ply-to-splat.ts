/**
 * Converteert een Gaussian Splat .ply bestand (zoals Brush exporteert)
 * naar het binaire .splat formaat dat @react-three/drei <Splat> verwacht.
 *
 * .splat formaat: 32 bytes per vertex
 *   - 12 bytes: position xyz (float32 × 3)
 *   - 12 bytes: scale xyz (float32 × 3, exp() toegepast)
 *   -  4 bytes: color rgba (uint8 × 4, sigmoid toegepast op f_dc en opacity)
 *   -  4 bytes: rotation quaternion (int8 × 4, genormaliseerd naar -128..128)
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

export async function plyToSplat(plyPath: string): Promise<{ splatPath: string; localFloorY: number }> {
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

  // Output buffer: 32 bytes per vertex
  const out = Buffer.allocUnsafe(numVertices * 32)
  const yValues: number[] = []

  for (let i = 0; i < numVertices; i++) {
    const base = i * 32
    const x = get(i, 'x')
    const y = get(i, 'y')
    const z = get(i, 'z')
    yValues.push(y)

    // Position (float32 × 3)
    out.writeFloatLE(x, base + 0)
    out.writeFloatLE(y, base + 4)
    out.writeFloatLE(z, base + 8)

    // Scale (exp van log-scale, float32 × 3)
    out.writeFloatLE(Math.exp(get(i, 'scale_0')), base + 12)
    out.writeFloatLE(Math.exp(get(i, 'scale_1')), base + 16)
    out.writeFloatLE(Math.exp(get(i, 'scale_2')), base + 20)

    // Color RGBA (uint8): lineaire SH DC formule — geen sigmoid op kleur
    const SH_C0 = 0.28209479177387814
    const clamp = (v: number) => Math.min(255, Math.max(0, Math.round(v)))
    const r = clamp((0.5 + SH_C0 * get(i, 'f_dc_0')) * 255)
    const g = clamp((0.5 + SH_C0 * get(i, 'f_dc_1')) * 255)
    const b = clamp((0.5 + SH_C0 * get(i, 'f_dc_2')) * 255)
    const a = clamp(sigmoid(get(i, 'opacity')) * 255)
    out[base + 24] = r
    out[base + 25] = g
    out[base + 26] = b
    out[base + 27] = a

    // Rotation quaternion: genormaliseerd naar uint8 (0..255, mapping: q * 128 + 128)
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
  await writeFile(splatPath, out)
  console.log(`[ply-to-splat] ${numVertices} vertices → ${splatPath} | localFloorY=${localFloorY.toFixed(3)}`)
  return { splatPath, localFloorY }
}
