import { Accessor, Document, NodeIO } from '@gltf-transform/core'
import type { LatheGeometry } from '../geometry/lathe/canonical-lathe-core'

export interface CanonicalLathePlacement {
  center: [number, number, number]
}

export async function exportCanonicalLatheGlb(
  geometry: LatheGeometry,
  previewTexturePng: Buffer,
  placement: CanonicalLathePlacement,
): Promise<Buffer> {
  const document = new Document()
  const buffer = document.createBuffer('canonical-lathe-buffer')

  const position = document.createAccessor('POSITION')
    .setType(Accessor.Type.VEC3)
    .setArray(geometry.positions)
    .setBuffer(buffer)
  const normal = document.createAccessor('NORMAL')
    .setType(Accessor.Type.VEC3)
    .setArray(geometry.normals)
    .setBuffer(buffer)
  const uv = document.createAccessor('TEXCOORD_0')
    .setType(Accessor.Type.VEC2)
    .setArray(geometry.uvs)
    .setBuffer(buffer)
  const indices = document.createAccessor('INDICES')
    .setType(Accessor.Type.SCALAR)
    .setArray(geometry.indices)
    .setBuffer(buffer)

  const texture = document.createTexture('canonical-preview-texture')
    .setMimeType('image/png')
    .setImage(previewTexturePng)
  const material = document.createMaterial('canonical-product-skin')
    .setBaseColorTexture(texture)
    .setMetallicFactor(0)
    .setRoughnessFactor(0.5)
    .setDoubleSided(false)
  const primitive = document.createPrimitive()
    .setAttribute('POSITION', position)
    .setAttribute('NORMAL', normal)
    .setAttribute('TEXCOORD_0', uv)
    .setIndices(indices)
    .setMaterial(material)
  const mesh = document.createMesh('canonical-lathe-mesh').addPrimitive(primitive)
  const node = document.createNode('canonical-lathe-product')
    .setMesh(mesh)
    .setTranslation(placement.center)
  document.createScene('canonical-product-scene').addChild(node)

  return Buffer.from(await new NodeIO().writeBinary(document))
}
