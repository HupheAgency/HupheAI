export type ProductFamily = 'lathe' | 'cylinder' | 'box' | 'pouch' | 'freeform'

export type ProductSkinLayerV2 = {
  id: string
  name: string
  type: 'image' | 'group' | 'guide'
  assetId?: string | null
  maskAssetId?: string | null
  children?: ProductSkinLayerV2[]
  visible: boolean
  locked: boolean
  exportable: boolean
  opacity?: number
  blendMode?: 'normal'
  provenance?: 'observed' | 'reconstructed' | 'user' | 'system'
}

export type ProductSkinAssetV2 = {
  id: string
  sha256: string
  mimeType: string
  relativePath: string
  url: string
  roles: string[]
  immutable: true
}

export interface ProductSkinDocumentV2 {
  schemaVersion: 2
  documentType: 'product-skin'
  id: string
  projectId: string
  reconstructionVersionId: string
  createdAt: string
  productFamily: ProductFamily
  source: {
    imageAssetId: string | null
    productMaskAssetId: string
    calibration: {
      kind: 'front-orthographic-approximation'
      axisX: number
      top: number
      bottom: number
      sourceWidth: number
      sourceHeight: number
    }
  }
  geometry: {
    meshAssetId: string
    seam: { kind: 'rear'; u: 0 }
    uvLayout: {
      kind: 'lathe-canonical-wrap'
      rings: number
      radialSegments: number
      vertexCount: number
      triangleCount: number
      maxTriangleUSpan: number
    }
    profile: {
      maxRadiusPx: number
      points: Array<{ sourceY: number; centerX: number; radiusPx: number; v: number }>
    }
  }
  canvas: {
    width: number
    height: number
    colorSpace: 'srgb'
    compositeAssetId: string
    layers: ProductSkinLayerV2[]
  }
  maps: {
    sourceConfidenceAssetId: string
    unknownMaskAssetId: string
  }
  aiJobs: Array<{
    id: string
    capability: string
    provider: string
    model: string
    status: string
  }>
  assets: ProductSkinAssetV2[]
}
