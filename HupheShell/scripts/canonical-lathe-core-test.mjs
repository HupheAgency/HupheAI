import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { build } from 'esbuild'

const temporaryDirectory = await mkdtemp(join(tmpdir(), 'huphe-lathe-test-'))
const bundlePath = join(temporaryDirectory, 'canonical-lathe-core.mjs')

try {
  await build({
    entryPoints: ['src/main/product-skin/geometry/lathe/canonical-lathe-core.ts'],
    bundle: true,
    format: 'esm',
    platform: 'node',
    outfile: bundlePath,
  })

  const {
    buildCanonicalLatheGeometry,
    extractLatheProfile,
    hardMaskComposite,
    projectSourceToCanonicalFlatmap,
    validateCanonicalLatheGeometry,
  } = await import(pathToFileURL(bundlePath).href)

  const width = 160
  const height = 240
  const mask = new Uint8Array(width * height)
  const source = new Uint8Array(width * height * 4)

  for (let y = 20; y <= 219; y++) {
    const normalizedY = (y - 20) / 199
    const radius = 18 + 32 * Math.sin(normalizedY * Math.PI)
    for (let x = 0; x < width; x++) {
      const inside = Math.abs(x - 80) <= radius
      if (inside) mask[y * width + x] = 255
      const pixel = (y * width + x) * 4
      source.set([x, y, (x + y) % 256, 255], pixel)
    }
  }

  // Simulate segmentation bleed on one silhouette edge. The rotational axis
  // and radius must not follow this asymmetric protrusion.
  for (let y = 82; y <= 116; y++) {
    for (let x = 128; x <= 145; x++) mask[y * width + x] = 255
  }

  const profile = extractLatheProfile(
    { width, height, data: mask },
    { profileSamples: 96, medianRadius: 2, smoothRadius: 2 },
  )
  assert.equal(profile.points.length, 96)
  assert.ok(Math.abs(profile.axisX - 80) < 0.6)
  assert.ok(profile.maxRadiusPx > 48)
  assert.ok(profile.maxRadiusPx < 53, 'Asymmetric mask bleed must not inflate the lathe radius')
  assert.ok(profile.points.every((point) => point.centerX === profile.axisX))

  const radialSegments = 128
  const geometry = buildCanonicalLatheGeometry(profile, radialSegments, 2)
  assert.equal(geometry.positions.length / 3, profile.points.length * (radialSegments + 1))
  assert.equal(geometry.indices.length, (profile.points.length - 1) * radialSegments * 6)
  const validation = validateCanonicalLatheGeometry(geometry)
  assert.equal(validation.valid, true)
  assert.ok(validation.maxTriangleUSpan <= 1 / radialSegments + 1e-5)

  // Triangle winding and authored normals must both face outward.
  for (let index = 0; index < geometry.indices.length; index += 3) {
    const ia = geometry.indices[index]
    const ib = geometry.indices[index + 1]
    const ic = geometry.indices[index + 2]
    const a = geometry.positions.subarray(ia * 3, ia * 3 + 3)
    const b = geometry.positions.subarray(ib * 3, ib * 3 + 3)
    const c = geometry.positions.subarray(ic * 3, ic * 3 + 3)
    const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
    const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]]
    const face = [
      ab[1] * ac[2] - ab[2] * ac[1],
      ab[2] * ac[0] - ab[0] * ac[2],
      ab[0] * ac[1] - ab[1] * ac[0],
    ]
    const normal = geometry.normals.subarray(ia * 3, ia * 3 + 3)
    const dot = face[0] * normal[0] + face[1] * normal[1] + face[2] * normal[2]
    assert.ok(dot >= -1e-8, `Triangle ${index / 3} faces inward`)
  }

  const columns = radialSegments + 1
  for (let ring = 0; ring < profile.points.length; ring++) {
    const first = ring * columns
    const last = first + radialSegments
    assert.equal(geometry.uvs[first * 2], 0)
    assert.equal(geometry.uvs[last * 2], 1)
    for (let axis = 0; axis < 3; axis++) {
      assert.ok(Math.abs(geometry.positions[first * 3 + axis] - geometry.positions[last * 3 + axis]) < 1e-5)
    }
  }

  const flatmap = projectSourceToCanonicalFlatmap(
    { width, height, data: source },
    { width, height, data: mask },
    profile,
    512,
    512,
  )
  const frontPixel = 256 * 512 + 256
  const rearPixel = 256 * 512
  assert.equal(flatmap.sourceRgba[frontPixel * 4 + 3], 255)
  assert.ok(flatmap.confidence[frontPixel] > 240)
  assert.equal(flatmap.unknownMask[frontPixel], 0)
  assert.equal(flatmap.sourceRgba[rearPixel * 4 + 3], 0)
  assert.equal(flatmap.confidence[rearPixel], 0)
  assert.equal(flatmap.unknownMask[rearPixel], 255)

  const original = new Uint8Array([10, 20, 30, 255, 40, 50, 60, 255])
  const edited = new Uint8Array([110, 120, 130, 255, 140, 150, 160, 255])
  const composited = hardMaskComposite(original, edited, new Uint8Array([0, 255]))
  assert.deepEqual([...composited], [10, 20, 30, 255, 140, 150, 160, 255])

  console.log('Canonical LATHE core: seam, UV, source evidence, unknown mask and hard-mask tests passed.')
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true })
}
