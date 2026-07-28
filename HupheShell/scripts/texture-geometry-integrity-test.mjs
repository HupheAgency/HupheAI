import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import { build } from 'esbuild'

const outfile = '/tmp/huphe-geometry-integrity-test.mjs'
await build({
  entryPoints: ['src/main/lib/geometry-integrity.ts'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile,
  logLevel: 'silent',
})
const { compareGlbGeometry } = await import(`${pathToFileURL(outfile).href}?v=${Date.now()}`)

function pad4(buffer, fill = 0) {
  const padded = Buffer.alloc(Math.ceil(buffer.length / 4) * 4, fill)
  buffer.copy(padded)
  return padded
}

function createGlb({ positions, indices, translation = [0, 0, 0] }) {
  const positionBuffer = Buffer.alloc(positions.length * 4)
  positions.forEach((value, index) => positionBuffer.writeFloatLE(value, index * 4))
  const indexBuffer = Buffer.alloc(indices.length * 2)
  indices.forEach((value, index) => indexBuffer.writeUInt16LE(value, index * 2))
  const bin = Buffer.concat([positionBuffer, indexBuffer])
  const vertexCount = positions.length / 3
  const json = {
    asset: { version: '2.0' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, translation }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
    buffers: [{ byteLength: bin.length }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: positionBuffer.length },
      { buffer: 0, byteOffset: positionBuffer.length, byteLength: indexBuffer.length },
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: vertexCount, type: 'VEC3' },
      { bufferView: 1, componentType: 5123, count: indices.length, type: 'SCALAR' },
    ],
  }
  const jsonBuffer = pad4(Buffer.from(JSON.stringify(json)), 0x20)
  const binBuffer = pad4(bin)
  const totalLength = 12 + 8 + jsonBuffer.length + 8 + binBuffer.length
  const glb = Buffer.alloc(totalLength)
  glb.writeUInt32LE(0x46546c67, 0)
  glb.writeUInt32LE(2, 4)
  glb.writeUInt32LE(totalLength, 8)
  glb.writeUInt32LE(jsonBuffer.length, 12)
  glb.writeUInt32LE(0x4e4f534a, 16)
  jsonBuffer.copy(glb, 20)
  const binStart = 20 + jsonBuffer.length
  glb.writeUInt32LE(binBuffer.length, binStart)
  glb.writeUInt32LE(0x004e4942, binStart + 4)
  binBuffer.copy(glb, binStart + 8)
  return glb
}

const input = createGlb({
  positions: [
    0, 0, 0,
    1, 0, 0,
    1, 1, 0,
    0, 1, 0,
  ],
  indices: [0, 1, 2, 0, 2, 3],
})

const identical = compareGlbGeometry(input, Buffer.from(input))
assert.equal(identical.geometry_preserved, true, 'Identieke GLB moet slagen.')

const seamDuplicated = createGlb({
  positions: [
    0, 0, 0,
    1, 0, 0,
    1, 1, 0,
    0, 0, 0,
    1, 1, 0,
    0, 1, 0,
  ],
  indices: [0, 1, 2, 3, 4, 5],
})
const seamResult = compareGlbGeometry(input, seamDuplicated)
assert.equal(seamResult.geometry_preserved, true, 'UV-naadduplicatie zonder oppervlaktewijziging moet slagen.')
assert.equal(seamResult.comparison.vertex_count_delta, 2)

const deformed = createGlb({
  positions: [
    0, 0, 0,
    1, 0, 0,
    1, 1.2, 0,
    0, 1, 0,
  ],
  indices: [0, 1, 2, 0, 2, 3],
})
const deformationResult = compareGlbGeometry(input, deformed)
assert.equal(deformationResult.geometry_preserved, false, 'Verplaatste vertex moet falen.')
assert.equal(deformationResult.comparison.surface_hash_equal, false)

const transformed = createGlb({
  positions: [
    0, 0, 0,
    1, 0, 0,
    1, 1, 0,
    0, 1, 0,
  ],
  indices: [0, 1, 2, 0, 2, 3],
  translation: [0, 0.1, 0],
})
const transformResult = compareGlbGeometry(input, transformed)
assert.equal(transformResult.geometry_preserved, false, 'Gewijzigde node-transform moet falen.')
assert.equal(transformResult.comparison.scene_transform_hash_equal, false)

console.log('Texture geometry integrity: 4/4 tests geslaagd.')
