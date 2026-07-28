import { createHash } from 'node:crypto'

type Vec3 = [number, number, number]
type Mat4 = number[]

interface ParsedGlb {
  json: any
  bin: Buffer
}

export interface GeometrySnapshot {
  fingerprintVersion: 1
  surfaceHash: string
  positionHash: string
  sceneTransformHash: string
  meshCount: number
  primitiveCount: number
  unsupportedPrimitiveCount: number
  vertexCount: number
  indexCount: number
  triangleCount: number
  bounds: {
    min: Vec3
    max: Vec3
    size: Vec3
  }
  triangles: Array<{
    key: string
    points: [Vec3, Vec3, Vec3]
    normal: Vec3
  }>
}

export interface GeometryIntegrityDiagnostics {
  geometry_preserved: boolean
  fingerprint_version: 1
  tolerance: number
  input: Omit<GeometrySnapshot, 'triangles'>
  output: Omit<GeometrySnapshot, 'triangles'>
  comparison: {
    surface_hash_equal: boolean
    scene_transform_hash_equal: boolean
    bounding_box_max_delta: number
    max_surface_deviation: number | null
    max_normal_angle_degrees: number | null
    vertex_count_delta: number
    index_count_delta: number
    triangle_count_delta: number
  }
  failure_reasons: string[]
}

const COMPONENT_BYTES: Record<number, number> = {
  5120: 1,
  5121: 1,
  5122: 2,
  5123: 2,
  5125: 4,
  5126: 4,
}

const TYPE_COMPONENTS: Record<string, number> = {
  SCALAR: 1,
  VEC2: 2,
  VEC3: 3,
  VEC4: 4,
  MAT2: 4,
  MAT3: 9,
  MAT4: 16,
}

const IDENTITY: Mat4 = [
  1, 0, 0, 0,
  0, 1, 0, 0,
  0, 0, 1, 0,
  0, 0, 0, 1,
]

function parseGlb(glb: Buffer): ParsedGlb {
  if (glb.length < 20 || glb.readUInt32LE(0) !== 0x46546c67) {
    throw new Error('Geometrycontrole ondersteunt alleen geldige GLB-bestanden.')
  }
  if (glb.readUInt32LE(4) !== 2) {
    throw new Error('Geometrycontrole ondersteunt alleen GLB versie 2.')
  }

  let offset = 12
  let json: any = null
  let bin: Buffer | null = null
  while (offset + 8 <= glb.length) {
    const length = glb.readUInt32LE(offset)
    const type = glb.readUInt32LE(offset + 4)
    const start = offset + 8
    const end = start + length
    if (end > glb.length) throw new Error('GLB bevat een ongeldige chunklengte.')
    if (type === 0x4e4f534a) {
      json = JSON.parse(glb.subarray(start, end).toString('utf8').trim())
    } else if (type === 0x004e4942 && !bin) {
      bin = glb.subarray(start, end)
    }
    offset = end
  }

  if (!json || !bin) throw new Error('GLB mist een JSON- of BIN-chunk.')
  return { json, bin }
}

function readComponent(bin: Buffer, offset: number, componentType: number, normalized = false): number {
  let value: number
  switch (componentType) {
    case 5120: value = bin.readInt8(offset); return normalized ? Math.max(value / 127, -1) : value
    case 5121: value = bin.readUInt8(offset); return normalized ? value / 255 : value
    case 5122: value = bin.readInt16LE(offset); return normalized ? Math.max(value / 32767, -1) : value
    case 5123: value = bin.readUInt16LE(offset); return normalized ? value / 65535 : value
    case 5125: value = bin.readUInt32LE(offset); return normalized ? value / 4294967295 : value
    case 5126: return bin.readFloatLE(offset)
    default: throw new Error(`Niet-ondersteund accessor componentType: ${componentType}`)
  }
}

function readAccessor(parsed: ParsedGlb, accessorIndex: number): number[][] {
  const accessor = parsed.json.accessors?.[accessorIndex]
  if (!accessor) throw new Error(`Accessor ${accessorIndex} ontbreekt.`)
  if (accessor.sparse) {
    throw new Error(`Sparse accessor ${accessorIndex} kan nog niet veilig worden gevalideerd.`)
  }
  const view = parsed.json.bufferViews?.[accessor.bufferView]
  if (!view || (view.buffer ?? 0) !== 0) {
    throw new Error(`Accessor ${accessorIndex} verwijst niet naar de ingebedde GLB-buffer.`)
  }

  const componentBytes = COMPONENT_BYTES[accessor.componentType]
  const components = TYPE_COMPONENTS[accessor.type]
  if (!componentBytes || !components) throw new Error(`Accessor ${accessorIndex} heeft een onbekend formaat.`)
  const stride = view.byteStride ?? componentBytes * components
  const base = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0)
  const values: number[][] = []

  for (let i = 0; i < accessor.count; i++) {
    const row: number[] = []
    for (let c = 0; c < components; c++) {
      row.push(readComponent(parsed.bin, base + i * stride + c * componentBytes, accessor.componentType, accessor.normalized))
    }
    values.push(row)
  }
  return values
}

function multiplyMat4(a: Mat4, b: Mat4): Mat4 {
  const out = new Array<number>(16).fill(0)
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      for (let k = 0; k < 4; k++) out[col * 4 + row] += a[k * 4 + row] * b[col * 4 + k]
    }
  }
  return out
}

function nodeMatrix(node: any): Mat4 {
  if (Array.isArray(node.matrix) && node.matrix.length === 16) return node.matrix.map(Number)
  const [x, y, z, w] = node.rotation ?? [0, 0, 0, 1]
  const [sx, sy, sz] = node.scale ?? [1, 1, 1]
  const [tx, ty, tz] = node.translation ?? [0, 0, 0]
  const x2 = x + x
  const y2 = y + y
  const z2 = z + z
  const xx = x * x2
  const xy = x * y2
  const xz = x * z2
  const yy = y * y2
  const yz = y * z2
  const zz = z * z2
  const wx = w * x2
  const wy = w * y2
  const wz = w * z2
  return [
    (1 - (yy + zz)) * sx, (xy + wz) * sx, (xz - wy) * sx, 0,
    (xy - wz) * sy, (1 - (xx + zz)) * sy, (yz + wx) * sy, 0,
    (xz + wy) * sz, (yz - wx) * sz, (1 - (xx + yy)) * sz, 0,
    tx, ty, tz, 1,
  ]
}

function transformPoint(matrix: Mat4, point: number[]): Vec3 {
  const [x, y, z] = point
  const w = matrix[3] * x + matrix[7] * y + matrix[11] * z + matrix[15]
  const divisor = w && w !== 1 ? w : 1
  return [
    (matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12]) / divisor,
    (matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13]) / divisor,
    (matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14]) / divisor,
  ]
}

function normalizedTriangleNormal(a: Vec3, b: Vec3, c: Vec3): Vec3 {
  const ab: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
  const ac: Vec3 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]]
  const cross: Vec3 = [
    ab[1] * ac[2] - ab[2] * ac[1],
    ab[2] * ac[0] - ab[0] * ac[2],
    ab[0] * ac[1] - ab[1] * ac[0],
  ]
  const length = Math.hypot(...cross)
  return length > 0 ? [cross[0] / length, cross[1] / length, cross[2] / length] : [0, 0, 0]
}

function pointKey(point: Vec3): string {
  return point.map(value => Math.round(value * 1e6)).join(',')
}

function triangleRecord(a: Vec3, b: Vec3, c: Vec3) {
  const points = [a, b, c].sort((left, right) => pointKey(left).localeCompare(pointKey(right))) as [Vec3, Vec3, Vec3]
  return {
    key: points.map(pointKey).join('|'),
    points,
    normal: normalizedTriangleNormal(a, b, c),
  }
}

function hashStrings(values: string[]): string {
  const hash = createHash('sha256')
  for (const value of values) hash.update(value).update('\n')
  return hash.digest('hex')
}

function worldMatrices(json: any): Map<number, Mat4> {
  const nodes = json.nodes ?? []
  const parents = new Map<number, number>()
  nodes.forEach((node: any, parent: number) => {
    for (const child of node.children ?? []) parents.set(child, parent)
  })
  const cache = new Map<number, Mat4>()
  const resolve = (index: number): Mat4 => {
    const known = cache.get(index)
    if (known) return known
    const local = nodeMatrix(nodes[index] ?? {})
    const parent = parents.get(index)
    const world = parent === undefined ? local : multiplyMat4(resolve(parent), local)
    cache.set(index, world)
    return world
  }
  nodes.forEach((_node: any, index: number) => resolve(index))
  return cache
}

export function inspectGlbGeometry(glb: Buffer): GeometrySnapshot {
  const parsed = parseGlb(glb)
  const matrices = worldMatrices(parsed.json)
  const meshNodes = new Map<number, Array<{ node: number; matrix: Mat4 }>>()
  for (const [nodeIndex, node] of (parsed.json.nodes ?? []).entries()) {
    if (node.mesh === undefined) continue
    const list = meshNodes.get(node.mesh) ?? []
    list.push({ node: nodeIndex, matrix: matrices.get(nodeIndex) ?? IDENTITY })
    meshNodes.set(node.mesh, list)
  }

  let primitiveCount = 0
  let unsupportedPrimitiveCount = 0
  let vertexCount = 0
  let indexCount = 0
  const triangles: GeometrySnapshot['triangles'] = []
  const positionKeys: string[] = []
  const transformKeys: string[] = []
  const boundsMin: Vec3 = [Infinity, Infinity, Infinity]
  const boundsMax: Vec3 = [-Infinity, -Infinity, -Infinity]

  const meshes = parsed.json.meshes ?? []
  meshes.forEach((mesh: any, meshIndex: number) => {
    const instances = meshNodes.get(meshIndex) ?? [{ node: -1, matrix: IDENTITY }]
    for (const instance of instances) {
      transformKeys.push(`${meshIndex}:${instance.node}:${instance.matrix.map(v => v.toPrecision(15)).join(',')}`)
    }
    for (const primitive of mesh.primitives ?? []) {
      primitiveCount++
      const positionAccessor = primitive.attributes?.POSITION
      if (positionAccessor === undefined) {
        unsupportedPrimitiveCount++
        continue
      }
      const positions = readAccessor(parsed, positionAccessor)
      const indices = primitive.indices === undefined
        ? positions.map((_position, index) => index)
        : readAccessor(parsed, primitive.indices).map(row => row[0])
      vertexCount += positions.length
      indexCount += primitive.indices === undefined ? 0 : indices.length
      if ((primitive.mode ?? 4) !== 4 || indices.length % 3 !== 0) {
        unsupportedPrimitiveCount++
        continue
      }

      for (const instance of instances) {
        const transformed = positions.map(position => transformPoint(instance.matrix, position))
        for (const point of transformed) {
          positionKeys.push(pointKey(point))
          for (let axis = 0; axis < 3; axis++) {
            boundsMin[axis] = Math.min(boundsMin[axis], point[axis])
            boundsMax[axis] = Math.max(boundsMax[axis], point[axis])
          }
        }
        for (let i = 0; i < indices.length; i += 3) {
          const a = transformed[indices[i]]
          const b = transformed[indices[i + 1]]
          const c = transformed[indices[i + 2]]
          if (!a || !b || !c) throw new Error('Primitive bevat een index buiten de POSITION-accessor.')
          triangles.push(triangleRecord(a, b, c))
        }
      }
    }
  })

  triangles.sort((a, b) => a.key.localeCompare(b.key))
  positionKeys.sort()
  transformKeys.sort()
  if (!Number.isFinite(boundsMin[0])) {
    boundsMin.fill(0)
    boundsMax.fill(0)
  }
  const size: Vec3 = [
    boundsMax[0] - boundsMin[0],
    boundsMax[1] - boundsMin[1],
    boundsMax[2] - boundsMin[2],
  ]

  return {
    fingerprintVersion: 1,
    surfaceHash: hashStrings(triangles.map(triangle => triangle.key)),
    positionHash: hashStrings(positionKeys),
    sceneTransformHash: hashStrings(transformKeys),
    meshCount: meshes.length,
    primitiveCount,
    unsupportedPrimitiveCount,
    vertexCount,
    indexCount,
    triangleCount: triangles.length,
    bounds: { min: boundsMin, max: boundsMax, size },
    triangles,
  }
}

function maxBoundsDelta(input: GeometrySnapshot, output: GeometrySnapshot): number {
  return Math.max(
    ...input.bounds.min.map((value, axis) => Math.abs(value - output.bounds.min[axis])),
    ...input.bounds.max.map((value, axis) => Math.abs(value - output.bounds.max[axis])),
  )
}

function surfaceDeviation(input: GeometrySnapshot, output: GeometrySnapshot): {
  distance: number | null
  normalAngle: number | null
} {
  if (input.triangles.length !== output.triangles.length) return { distance: null, normalAngle: null }
  let distance = 0
  let normalAngle = 0
  for (let i = 0; i < input.triangles.length; i++) {
    const left = input.triangles[i]
    const right = output.triangles[i]
    for (let point = 0; point < 3; point++) {
      distance = Math.max(
        distance,
        Math.hypot(
          left.points[point][0] - right.points[point][0],
          left.points[point][1] - right.points[point][1],
          left.points[point][2] - right.points[point][2],
        ),
      )
    }
    const dot = Math.min(1, Math.max(-1, Math.abs(
      left.normal[0] * right.normal[0]
      + left.normal[1] * right.normal[1]
      + left.normal[2] * right.normal[2],
    )))
    normalAngle = Math.max(normalAngle, Math.acos(dot) * 180 / Math.PI)
  }
  return { distance, normalAngle }
}

function withoutTriangles(snapshot: GeometrySnapshot): Omit<GeometrySnapshot, 'triangles'> {
  const { triangles: _triangles, ...summary } = snapshot
  return summary
}

export function compareGlbGeometry(
  inputGlb: Buffer,
  outputGlb: Buffer,
  tolerance = 1e-5,
): GeometryIntegrityDiagnostics {
  const input = inspectGlbGeometry(inputGlb)
  const output = inspectGlbGeometry(outputGlb)
  const boundsDelta = maxBoundsDelta(input, output)
  const deviation = surfaceDeviation(input, output)
  const failureReasons: string[] = []

  if (input.unsupportedPrimitiveCount || output.unsupportedPrimitiveCount) {
    failureReasons.push('Niet alle primitives konden als driehoeksoppervlak worden gevalideerd.')
  }
  if (input.surfaceHash !== output.surfaceHash) {
    failureReasons.push('De zichtbare driehoeksoppervlakken verschillen.')
  }
  if (input.sceneTransformHash !== output.sceneTransformHash) {
    failureReasons.push('Node- of scene-transforms verschillen.')
  }
  if (boundsDelta > tolerance) {
    failureReasons.push(`De bounding box wijkt ${boundsDelta} af (tolerantie ${tolerance}).`)
  }
  if (deviation.distance !== null && deviation.distance > tolerance) {
    failureReasons.push(`De maximale oppervlakteafwijking is ${deviation.distance}.`)
  }

  return {
    geometry_preserved: failureReasons.length === 0,
    fingerprint_version: 1,
    tolerance,
    input: withoutTriangles(input),
    output: withoutTriangles(output),
    comparison: {
      surface_hash_equal: input.surfaceHash === output.surfaceHash,
      scene_transform_hash_equal: input.sceneTransformHash === output.sceneTransformHash,
      bounding_box_max_delta: boundsDelta,
      max_surface_deviation: deviation.distance,
      max_normal_angle_degrees: deviation.normalAngle,
      vertex_count_delta: output.vertexCount - input.vertexCount,
      index_count_delta: output.indexCount - input.indexCount,
      triangle_count_delta: output.triangleCount - input.triangleCount,
    },
    failure_reasons: failureReasons,
  }
}

export function assertGlbGeometryPreserved(
  inputGlb: Buffer,
  outputGlb: Buffer,
  tolerance = 1e-5,
): GeometryIntegrityDiagnostics {
  const diagnostics = compareGlbGeometry(inputGlb, outputGlb, tolerance)
  if (!diagnostics.geometry_preserved) {
    throw new Error(`Texture wrapping heeft de geometrie gewijzigd: ${diagnostics.failure_reasons.join(' ')}`)
  }
  return diagnostics
}
