# Three.js Studio RenderPacket Spec

Doel: bestaande Scene3D-state vertalen naar een reproduceerbaar RenderPacket voor final render.

## Bestaand

Frontend:
- `Scene3DState` in `src/renderer/src/lib/scene3d-types.ts`;
- `useScene3D` met project-specifieke storage key;
- `Scene3DViewport.captureAllPasses()`;
- `ProductStudioShell` toont beauty/textured/depth/normal previews.

## Gewenst RenderPacket

```ts
type RenderPacketManifest = {
  projectId: string
  canonicalReferenceSetId: string
  reconstructionVersionId: string
  studioSceneVersionId: string
  assets: {
    beautyUrl: string
    objectMaskUrl?: string
    depthUrl?: string
    normalUrl?: string
    albedoUrl?: string
    roughnessUrl?: string
    metallicUrl?: string
    shadowUrl?: string
  }
  camera: unknown
  lighting: unknown
  scene: unknown
  output: {
    aspectRatio: string
    resolution: '1k' | '2k' | '4k'
  }
  createdAt: string
}
```

## Mapping Van Scene3DState

- `objects`: product transform en proxy/model metadata.
- `lights`: lighting config.
- `cameras` + `activeCameraId`: camera config.
- `background` + `environment`: scene/environment config.
- `resolution`: output config.

## Capture Mapping

Bestaand:
- `beauty`: viewport screenshot.
- `textured`: current textured pass.
- `depth`: depth pass.
- `normal`: normal pass.

Nog nodig:
- `object-mask`;
- stable asset upload;
- metadata JSON upload;
- scene version id;
- reconstruction version id.

## Frontend Adapter

Frontend mag tijdelijk data URLs tonen, maar backend moet opslaan als storage URLs voordat een echte FinalRenderProvider wordt aangeroepen.

## Acceptatiecriteria

- RenderPacket kan opnieuw worden geladen.
- RenderPacket verwijst naar exacte canonical reference set.
- RenderPacket verwijst naar exacte reconstruction version.
- Providerfout verwijdert geen packet.
- Final render kan later worden herleid naar dit packet.

