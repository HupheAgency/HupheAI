import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import * as THREE from 'three'
import { SplatFrameViewer, type SplatReferencePose } from './SplatFrameViewer'
import { SplatViewer } from './SplatViewer'
import { notifyIfCreditsRequired } from '../lib/credits-required'
import Scene3DEditor, { type Scene3DEditorHandle, type Scene3DRenderPacketPreview, type Scene3DSceneControls } from './Scene3DEditor'
import type { SplatAlignment } from './GaussianSplatBackground'
import Scene3DPropertiesPanel from './Scene3DPropertiesPanel'
import Scene3DEditorInline from './Scene3DEditorInline'
import { AtelierPromptBar, type AtelierPromptBarHandle } from './AtelierPromptBar'
import { ReconstructingOverlay } from './ReconstructingOverlay'
import type {
  CanonicalReferenceSet,
  FinalRenderVersion,
  PreservationPolicy,
  ProductProject as BackendProductProject,
  ProviderRun,
  ReconstructionVersion,
  ReferenceView as BackendReferenceView,
  RenderPacket,
  SourceAsset,
  StudioSceneVersion,
} from '../lib/product-studio-types'
import type { Scene3DState } from '../lib/scene3d-types'

type ReferenceStatus = 'observed' | 'inferred' | 'user-approved' | 'user-edited'
type ReferenceView = {
  id: string
  backendId?: string
  angle?: string
  label: string
  status: ReferenceStatus
  src?: string
}

type ProductStudioProject = {
  id: string
  name: string
  createdAt: string
  updatedAt: string
  sourceImage?: {
    name: string
    src: string
    mimeType: string
  }
  backendProject?: BackendProductProject
  sourceAsset?: SourceAsset
  basicProductAsset?: SourceAsset
  objectMaskAsset?: SourceAsset
  objectMaskUrl?: string
  canonicalSet?: CanonicalReferenceSet
  reconstruction?: ReconstructionVersion
  studioScene?: StudioSceneVersion
  renderPacketRecord?: RenderPacket
  references: ReferenceView[]
  activeStep: 'input' | 'references' | 'mesh' | 'studio' | 'final'
  preservationPolicy: PreservationPolicy
  renderPacket?: Scene3DRenderPacketPreview
  finalRenderRecord?: FinalRenderVersion
  finalRender?: {
    prompt: string
    src: string
    createdAt: string
  }
}

type ProviderStats = {
  runs: ProviderRun[]
  summary: {
    totalRuns: number
    completed: number
    failed: number
    processing: number
    totalLatencyMs: number
    totalCost: number
    byType: Record<string, { count: number; avgLatencyMs: number; totalCost: number; failRate: number }>
  }
}

function length3(v: [number, number, number]) {
  return Math.hypot(v[0], v[1], v[2])
}

function normalize3(v: [number, number, number]): [number, number, number] {
  const len = length3(v)
  if (len <= 0.000001) return [0, 0, 0]
  return [v[0] / len, v[1] / len, v[2] / len]
}

function cross3(a: [number, number, number], b: [number, number, number]): [number, number, number] {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ]
}

const STORAGE_KEY = 'huphe:product-studio-project:v1'

const STATUS_LABELS: Record<ReferenceStatus, string> = {
  observed: 'Echt',
  inferred: 'AI voorstel',
  'user-approved': 'Goedgekeurd',
  'user-edited': 'Aangepast',
}

const VIEW_LABELS: Record<string, string> = {
  hero: 'Hero',
  front: 'Front / bronfoto',
  left: 'Links',
  right: 'Rechts',
  rear: 'Achterkant',
  top: 'Bovenkant',
  custom: 'Custom',
}

const POLICY_HINTS: Record<PreservationPolicy, string> = {
  strict: 'Maximaal behoud van Beauty-vorm en masker. Beste keuze als camera, crop en silhouet exact moeten blijven.',
  balanced: 'Behoud vorm en positie, maar laat scene en product-polish iets realistischer verbeteren.',
  creative: 'Vrijere commercial look. Grotere kans dat vorm, materiaal of print verschuift.',
}

type ProductStudioApi = {
  createProject: (args: { name: string; outputAspectRatio?: string; productName?: string; productCategory?: string; knownDimensionMm?: number; brandName?: string; notes?: string }) => Promise<any>
  getProject: (id: string) => Promise<any>
  listProjects: () => Promise<any>
  renameProject: (args: { projectId: string; name: string }) => Promise<any>
  deleteProject: (args: { projectId: string }) => Promise<any>
  updateProject: (id: string, updates: Record<string, unknown>) => Promise<any>
  uploadSource: (args: { projectId: string; fileBuffer: ArrayBuffer; fileName: string; mimeType: string }) => Promise<any>
  normalizeInput: (args: { projectId: string; sourceAssetId: string }) => Promise<any>
  registerSourceAsReference: (args: { projectId: string; sourceAssetId: string; angle?: 'hero' | 'front' }) => Promise<any>
  getLatestState: (projectId: string) => Promise<any>
  generateReferenceViews: (args: { projectId: string; sourceAssetId: string; targetViews: Array<'left' | 'right' | 'rear' | 'top'>; productNotes?: string }) => Promise<any>
  listReferenceViews: (projectId: string) => Promise<any>
  updateViewStatus: (viewId: string, status: string, provenance?: string) => Promise<any>
  createCanonicalSet: (args: { projectId: string; viewIds: string[]; coverage: string }) => Promise<any>
  listReconstructions: (projectId: string) => Promise<any>
  startReconstruction: (args: { projectId: string; canonicalReferenceSetId: string; primaryImageUrl: string; route?: 'single-view' | 'multi-view' | 'primitive-proxy'; seed?: number }) => Promise<any>
  updateReconstructionStatus: (id: string, status: string) => Promise<any>
  createTexturedMesh: (args: { projectId: string; reconstructionVersionId: string; sourceViewIds?: string[] }) => Promise<any>
  getTextureStatus: (reconstructionVersionId: string) => Promise<any>
  retryTextureWrap: (reconstructionVersionId: string) => Promise<any>
  saveScene: (args: { projectId: string; reconstructionVersionId: string; camera: Record<string, unknown>; lights: Record<string, unknown>[]; productTransform: Record<string, unknown>; environment: Record<string, unknown>; output: Record<string, unknown> }) => Promise<any>
  uploadRenderPass: (args: { projectId: string; passType: 'beauty' | 'depth' | 'normal' | 'object-mask' | 'calibration' | 'light-map' | 'perspective'; dataUrl: string }) => Promise<any>
  createRenderPacket: (args: { projectId: string; canonicalReferenceSetId: string; reconstructionVersionId: string; studioSceneVersionId: string; beautyUrl: string; objectMaskUrl?: string; depthUrl?: string; normalUrl?: string; calibrationUrl?: string; lightMapUrl?: string; sceneManifest?: Record<string, unknown> }) => Promise<any>
  listFinalRenders: (projectId: string) => Promise<any>
  updateFinalRenderStatus: (id: string, status: string) => Promise<any>
  generateProductLayer: (args: { projectId: string; renderPacketId: string }) => Promise<any>
  generateFinalRender: (args: { projectId: string; renderPacketId: string; prompt: string; preservationPolicy?: 'strict' | 'balanced' | 'creative'; resolution?: '0.5K' | '1K' | '2K' | '4K' }) => Promise<any>
  generateCleanPlate: (args: { projectId: string; finalRenderVersionId: string }) => Promise<any>
  retryProviderRun: (runId: string) => Promise<any>
  rollbackCanonicalSet: (args: { projectId: string; targetVersion: number }) => Promise<any>
  rollbackReconstruction: (args: { projectId: string; targetReconstructionId: string }) => Promise<any>
  rollbackFinalRender: (args: { projectId: string; targetFinalRenderId: string }) => Promise<any>
  cleanupStorage: (projectId: string) => Promise<any>
  getProviderStats: (projectId: string) => Promise<any>
  downloadPng: (args: { imageUrl: string; suggestedName?: string }) => Promise<any>
  buildSeedMesh: (args: {
    projectId: string
    frontPhotoUrl: string
    depthKnownDataUrl: string
    maskHoleDataUrl: string
    manifest: {
      camera: { near: number; far: number; projectionMatrix: number[]; viewMatrix: number[] }
      viewport: { width: number; height: number; fovScale?: number }
    }
  }) => Promise<any>
  clearBakeCache: (args: { projectId: string }) => Promise<any>
  bakeKeyframe: (args: {
    projectId: string
    keyframeIndex: number
    rgbPartialDataUrl: string
    maskHoleDataUrl: string
    depthKnownDataUrl: string
    manifest: {
      camera: { near: number; far: number; projectionMatrix: number[]; viewMatrix: number[] }
      viewport: { width: number; height: number; fovScale?: number }
      prompt?: string
    }
  }) => Promise<any>
  finalizeBake: (args: { projectId: string }) => Promise<any>
  testOrbitSplat: (args: { projectId: string; renderVersionId?: string; imageUrl: string; arcDegrees?: number; force?: boolean; model?: 'seedance'; videoOnly?: boolean; poseOnly?: boolean; poseMethod?: 'colmap' | 'replicate' | 'fal' | 'runpod-vggt' }) => Promise<any>
  checkOrbitVideo: (args: { projectId: string; renderVersionId?: string; model?: 'seedance' }) => Promise<{ exists: boolean; videoUrl: string | null; orbitRunId?: string | null; colmap?: any; sampleClayUrls?: string[]; marble?: MarbleRunState | null }>
  loadSplat: (args?: { defaultDir?: string }) => Promise<{ ok: boolean; splatUrl?: string; localFloorY?: number; plyPath?: string }>
  getSplatPose: (args: { projectId: string; orbitRunId?: string; renderVersionId?: string }) => Promise<{ ok: boolean; pose?: SplatAlignment; error?: string }>
  saveSceneAlignment?: (args: { projectId: string; renderVersionId?: string; alignment: Record<string, unknown>; baseAlignment?: Record<string, unknown> | null }) => Promise<{ ok: boolean; error?: string }>
  loadSceneAlignment: (args: { projectId: string; renderVersionId?: string }) => Promise<{ ok: boolean; renderVersionId?: string | null; alignment?: SplatAlignment; baseAlignment?: SplatAlignment | null; error?: string }>
  marbleGenerate?: (args: { imageSrc: string; projectId: string; renderVersionId?: string; displayName?: string; textPrompt?: string; seed?: number; orbitRunId?: string }) => Promise<{ ok: boolean; error?: string } & MarbleRunState>
  onMarbleStep?: (cb: (data: { step: string; progress: number }) => void) => () => void
}

interface MarbleRunState {
  phase?: 'idle' | 'running' | 'done' | 'error'
  step?: string
  progress?: number
  thumbnailUrl?: string
  spzPath?: string
  splatPath?: string
  worldId?: string
  route?: 'video' | 'image'
  renderVersionId?: string | null
  orbitRunId?: string | null
  metricScaleFactor?: number
  groundPlaneOffset?: number
  thumbnailPath?: string
  panoUrl?: string
  colliderMeshUrl?: string
  totalCredits?: number
  error?: string
}

function getProductStudioApi(): ProductStudioApi | null {
  return ((window as any).api?.productStudio ?? null) as ProductStudioApi | null
}

function assertOk<T>(result: any, key: string): T {
  if (!result?.ok) throw new Error(result?.error || 'Product Studio actie mislukt.')
  return result[key] as T
}

function backendViewToReference(view: BackendReferenceView): ReferenceView {
  return {
    id: view.id,
    backendId: view.id,
    angle: view.angle,
    label: VIEW_LABELS[view.angle] ?? view.angle,
    status: view.provenance === 'observed' || view.provenance === 'user-approved' || view.provenance === 'user-edited'
      ? view.provenance
      : 'inferred',
    src: view.asset_url,
  }
}

function uniqueReferenceViews(views: ReferenceView[]): ReferenceView[] {
  const byAngle = new Map<string, ReferenceView>()
  for (const view of views) {
    byAngle.set(view.angle ?? view.id, view)
  }
  return Array.from(byAngle.values())
}

function deriveActiveStep(project: {
  sourceAsset?: SourceAsset
  canonicalSet?: CanonicalReferenceSet | null
  reconstruction?: ReconstructionVersion | null
  renderPacketRecord?: RenderPacket | null
  finalRenderRecord?: FinalRenderVersion | null
}): ProductStudioProject['activeStep'] {
  if (project.finalRenderRecord?.output_url || project.renderPacketRecord) return 'final'
  if (project.reconstruction?.status === 'approved') return 'studio'
  if (project.reconstruction || project.canonicalSet) return 'mesh'
  if (project.sourceAsset) return 'references'
  return 'input'
}

function createProject(): ProductStudioProject {
  const now = new Date().toISOString()
  return {
    id: `product_${Date.now()}`,
    name: `Product Studio ${new Date().toLocaleDateString('nl-NL')}`,
    createdAt: now,
    updatedAt: now,
    references: [],
    activeStep: 'input',
    preservationPolicy: 'balanced',
  }
}

function projectFromLatestState(prev: ProductStudioProject, snapshot: any): ProductStudioProject {
  const backendProject = snapshot.project as BackendProductProject | undefined
  if (!backendProject) return prev
  const sourceAssets = (snapshot.sourceAssets ?? []) as SourceAsset[]
  const references = (snapshot.referenceViews ?? []) as BackendReferenceView[]
  const sourceAsset = sourceAssets.find((asset) => asset.type === 'original-image')
    ?? sourceAssets.find((asset) => asset.type === 'normalized-image')
    ?? sourceAssets[0]
  const basicProductAsset = sourceAssets.find((asset) => asset.type === 'basic-product')
  const objectMaskAsset = sourceAssets.find((asset) => asset.type === 'object-mask') ?? sourceAssets.find((asset) => asset.type === 'manual-mask')
  const finalRenderRecord = (snapshot.latestFinalRender ?? undefined) as FinalRenderVersion | undefined
  const renderPacketRecord = (snapshot.latestRenderPacket ?? undefined) as RenderPacket | undefined
  const reconstruction = (snapshot.latestReconstruction ?? undefined) as ReconstructionVersion | undefined
  const canonicalSet = (snapshot.latestCanonicalSet ?? undefined) as CanonicalReferenceSet | undefined
  const studioScene = (snapshot.latestScene ?? undefined) as StudioSceneVersion | undefined
  const sourceImage = sourceAsset
    ? {
      name: backendProject.product_name || 'Bronfoto',
      src: sourceAsset.url,
      mimeType: sourceAsset.mime_type,
    }
    : prev.sourceImage
  return {
    ...prev,
    id: backendProject.id,
    name: backendProject.name,
    createdAt: backendProject.created_at,
    updatedAt: backendProject.updated_at,
    backendProject,
    sourceAsset,
    basicProductAsset,
    objectMaskAsset,
    objectMaskUrl: objectMaskAsset?.url ?? prev.objectMaskUrl,
    sourceImage,
    references: uniqueReferenceViews(references.map(backendViewToReference)),
    canonicalSet,
    reconstruction,
    studioScene,
    renderPacketRecord,
    finalRenderRecord,
    finalRender: finalRenderRecord?.output_url ? {
      prompt: finalRenderRecord.prompt ?? '',
      src: finalRenderRecord.output_url,
      createdAt: finalRenderRecord.created_at,
    } : prev.finalRender,
    activeStep: deriveActiveStep({ sourceAsset, canonicalSet, reconstruction, renderPacketRecord, finalRenderRecord }),
  }
}

function getStoredProjectId(project: ProductStudioProject): string | null {
  return project.backendProject?.id ?? (project.id.startsWith('product_') ? null : project.id)
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

function loadProject(): ProductStudioProject {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return { ...createProject(), ...JSON.parse(raw) }
  } catch { /* ignore */ }
  return createProject()
}

function buildSceneSavePayload(scene: Scene3DState) {
  const activeCamera = scene.cameras.find((camera) => camera.id === scene.activeCameraId) ?? scene.cameras[0]
  const productObject = scene.objects.find((object) => object.type === 'gltf') ?? scene.objects[0]
  return {
    camera: activeCamera ? {
      id: activeCamera.id,
      name: activeCamera.name,
      position: activeCamera.position,
      target: activeCamera.target,
      fov: activeCamera.fov,
    } : {},
    lights: scene.lights.map((light) => ({
      id: light.id,
      type: light.type,
      name: light.name,
      color: light.color,
      intensity: light.intensity,
      position: light.position,
      target: light.target,
    })),
    productTransform: productObject ? {
      objectId: productObject.id,
      name: productObject.name,
      type: productObject.type,
      gltfUrl: productObject.gltfUrl,
      position: productObject.position,
      rotation: productObject.rotation,
      scale: productObject.scale,
      pivot: productObject.pivot,
      material: productObject.material,
    } : {},
    environment: {
      environment: scene.environment,
      background: scene.background,
    },
    output: {
      resolution: scene.resolution,
      aspectRatio: scene.resolution[0] === scene.resolution[1] ? '1:1' : `${scene.resolution[0]}:${scene.resolution[1]}`,
    },
  }
}

function StepPill({ active, done, label }: { active: boolean; done?: boolean; label: string }) {
  return (
    <div className={[
      'flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition-colors',
      active ? 'border-[#facc15]/35 bg-[#facc15]/10 text-[#facc15]' : done ? 'border-white/[0.08] bg-white/[0.04] text-white/70' : 'border-white/[0.05] text-white/35',
    ].join(' ')}>
      <span className={['h-1.5 w-1.5 rounded-full', active ? 'bg-[#facc15]' : done ? 'bg-white/55' : 'bg-white/18'].join(' ')} />
      {label}
    </div>
  )
}

function InputStatusPill({ label, ready }: { label: string; ready: boolean }) {
  return (
    <div className={[
      'flex items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-[10px]',
      ready ? 'border-green-400/18 bg-green-500/8 text-green-300' : 'border-white/[0.06] bg-black/20 text-white/30',
    ].join(' ')}>
      <span className="truncate">{label}</span>
      <span className={['h-1.5 w-1.5 flex-shrink-0 rounded-full', ready ? 'bg-green-300' : 'bg-white/18'].join(' ')} />
    </div>
  )
}

function ManifestStatusPill({ label, ready }: { label: string; ready: boolean }) {
  return (
    <div className={[
      'flex items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-[10px]',
      ready ? 'border-[#facc15]/20 bg-[#facc15]/8 text-[#facc15]' : 'border-white/[0.06] bg-black/20 text-white/30',
    ].join(' ')}>
      <span className="truncate">{label}</span>
      <span className={['h-1.5 w-1.5 flex-shrink-0 rounded-full', ready ? 'bg-[#facc15]' : 'bg-white/18'].join(' ')} />
    </div>
  )
}

function ImageLightbox({
  image,
  currentIndex,
  total,
  onClose,
  onPrev,
  onNext,
}: {
  image: { label: string; src: string }
  currentIndex: number
  total: number
  onClose: () => void
  onPrev: () => void
  onNext: () => void
}) {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
      if (event.key === 'ArrowLeft') onPrev()
      if (event.key === 'ArrowRight') onNext()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose, onNext, onPrev])

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/88 p-4" role="dialog" aria-modal="true" aria-label={image.label} onClick={onClose}>
      <div className="flex max-h-full w-full max-w-5xl flex-col overflow-hidden rounded-lg border border-white/[0.12] bg-[#101010] shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 border-b border-white/[0.08] px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white/80">{image.label}</p>
            <p className="mt-0.5 text-[10px] text-white/34">{currentIndex + 1}/{total}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-white/[0.1] text-white/58 transition-colors hover:bg-white/[0.06] hover:text-white"
            aria-label="Sluiten"
          >
            <XIcon />
          </button>
        </div>
        <div className="relative min-h-0 flex-1 bg-black/55 p-4">
          {total > 1 && (
            <>
              <button
                type="button"
                onClick={onPrev}
                className="absolute left-4 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/[0.12] bg-black/60 text-xl text-white/70 transition-colors hover:bg-white/[0.08] hover:text-white"
                aria-label="Vorige afbeelding"
              >
                ‹
              </button>
              <button
                type="button"
                onClick={onNext}
                className="absolute right-4 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/[0.12] bg-black/60 text-xl text-white/70 transition-colors hover:bg-white/[0.08] hover:text-white"
                aria-label="Volgende afbeelding"
              >
                ›
              </button>
            </>
          )}
          <img src={image.src} alt={image.label} className="mx-auto max-h-[78vh] max-w-full object-contain" />
        </div>
      </div>
    </div>
  )
}

function IconButton({ label, onClick, tone = 'neutral', children }: { label: string; onClick: () => void; tone?: 'neutral' | 'approve' | 'reject'; children: ReactNode }) {
  const toneClass = tone === 'approve'
    ? 'border-[#facc15]/25 text-[#facc15] hover:bg-[#facc15]/10'
    : tone === 'reject'
      ? 'border-red-400/18 text-red-300/70 hover:bg-red-500/10 hover:text-red-200'
      : 'border-white/[0.08] text-white/45 hover:bg-white/[0.05] hover:text-white/70'
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`grid h-7 w-7 place-items-center rounded-full border transition-colors ${toneClass}`}
    >
      {children}
    </button>
  )
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4.5 10.5 8 14l7.5-8" />
    </svg>
  )
}

function XIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round">
      <path d="M5.5 5.5 14.5 14.5M14.5 5.5 5.5 14.5" />
    </svg>
  )
}

function RefreshIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 7a6 6 0 0 0-10.7-2.7L4 5.7" />
      <path d="M4 2.8v2.9h2.9" />
      <path d="M4 13a6 6 0 0 0 10.7 2.7l1.3-1.4" />
      <path d="M16 17.2v-2.9h-2.9" />
    </svg>
  )
}

function ReferenceCard({ view, onApprove, onReject, onRegenerate }: { view: ReferenceView; onApprove: () => void; onReject: () => void; onRegenerate?: () => void }) {
  return (
    <div className="overflow-hidden rounded-lg border border-white/[0.07] bg-[#151515]">
      <div className="aspect-[4/3] bg-black/35">
        {view.src ? (
          <img src={view.src} alt={view.label} className="h-full w-full object-contain" />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-white/28">Wacht op provider</div>
        )}
      </div>
      <div className="px-3 py-2">
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold text-white/80">{view.label}</p>
          <p className="mt-0.5 text-[11px] text-white/36">{STATUS_LABELS[view.status]}</p>
        </div>
        {(view.status === 'inferred' || onRegenerate) && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {onRegenerate && (
              <IconButton label="Vervang / opnieuw genereren" onClick={onRegenerate}>
                <RefreshIcon />
              </IconButton>
            )}
            {view.status === 'inferred' && (
              <>
                <IconButton label="Afwijzen" onClick={onReject} tone="reject">
                  <XIcon />
                </IconButton>
                <IconButton label="Goedkeuren" onClick={onApprove} tone="approve">
                  <CheckIcon />
                </IconButton>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// Marble splat bestanden worden URL-encoded in splatUrl — slashes worden %2F.
// Controleer op bestandsnaam (onveranderd na encoding) om marble-URLs te herkennen.
function isMarbleSplatUrl(url: string): boolean {
  return url.includes('world_hq.splat') || url.includes('world_preview.splat') || url.includes('world.splat')
}

function finiteNumber(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : fallback
}

function marbleGroupScale(metricScaleFactor: unknown): number {
  const metric = finiteNumber(metricScaleFactor, 0)
  if (metric <= 0) return 1
  return Math.max(0.001, Math.min(100, 1 / metric))
}

function marbleGroundOffsetY(groundPlaneOffset: unknown, scale: number): number {
  const ground = finiteNumber(groundPlaneOffset, 0)
  return Number.isFinite(ground) ? -ground * scale : 0
}

function isMarbleAlignment(alignment: Partial<SplatAlignment> | null | undefined): boolean {
  const url = alignment?.splatUrl ?? ''
  return alignment?.source === 'marble' || isMarbleSplatUrl(url) || Boolean(alignment?.spzPath?.endsWith('/world.spz'))
}

function localPathToHupheFileUrl(path: string | null | undefined): string | null {
  if (!path) return null
  if (/^(huphe:\/\/file\/|https?:\/\/|blob:|data:)/.test(path)) return path
  return `huphe://file/${encodeURIComponent(decodeURIComponent(path.replace(/^file:\/\//, '')))}`
}

const DEFAULT_BUBBLE_RADIUS = 3
const DEFAULT_BUBBLE_FEATHER = 0.1
const WORLDLABS_REFERENCE_FOV_Y = 50

function cloneSplatAlignment(alignment: SplatAlignment): SplatAlignment {
  return {
    ...alignment,
    position: [...alignment.position] as [number, number, number],
    quaternion: [...alignment.quaternion] as [number, number, number, number],
    sceneCenter: [...alignment.sceneCenter] as [number, number, number],
    transformPosition: alignment.transformPosition ? [...alignment.transformPosition] as [number, number, number] : undefined,
    transformQuaternion: alignment.transformQuaternion ? [...alignment.transformQuaternion] as [number, number, number, number] : undefined,
    worldReferencePosition: alignment.worldReferencePosition ? [...alignment.worldReferencePosition] as [number, number, number] : undefined,
    worldReferenceQuaternion: alignment.worldReferenceQuaternion ? [...alignment.worldReferenceQuaternion] as [number, number, number, number] : undefined,
    worldReferenceTarget: alignment.worldReferenceTarget ? [...alignment.worldReferenceTarget] as [number, number, number] : undefined,
  }
}

function fallbackImportBaseAlignment(alignment: SplatAlignment): SplatAlignment {
  const base = cloneSplatAlignment(alignment)
  return {
    ...base,
    groupPositionX: 0,
    groupPositionY: finiteNumber(base.groupPositionY, 0),
    groupPositionZ: 0,
    groupScale: 1,
    groupMaskSize: 20,
    groupMaskOffsetX: 0,
    groupMaskOffsetY: 0,
    groupMaskOffsetZ: 0,
    groupTiltX: 0,
    groupTiltZ: 0,
    cleanupAlpha: 15,
    cleanupScaleIqr: 3,
    cleanupPosSigma: 4,
    bubbleRadius: DEFAULT_BUBBLE_RADIUS,
    bubbleFeather: DEFAULT_BUBBLE_FEATHER,
  }
}

function manifestProductPosition(manifest: any): [number, number, number] | null {
  const pos = manifest?.product?.position
  if (Array.isArray(pos) && pos.length === 3) return [Number(pos[0]), Number(pos[1]), Number(pos[2])]
  const min = manifest?.product?.worldBounds?.min
  const max = manifest?.product?.worldBounds?.max
  if (Array.isArray(min) && Array.isArray(max) && min.length === 3 && max.length === 3) {
    return [
      (Number(min[0]) + Number(max[0])) / 2,
      (Number(min[1]) + Number(max[1])) / 2,
      (Number(min[2]) + Number(max[2])) / 2,
    ]
  }
  const target = manifest?.camera?.target
  if (Array.isArray(target) && target.length === 3) return [Number(target[0]), Number(target[1]), Number(target[2])]
  return null
}

function archiveProductTransform(manifest: any, productTransform: {
  position?: [number, number, number]
  rotation?: [number, number, number]
  scale?: [number, number, number]
}): {
  position?: [number, number, number]
  rotation?: [number, number, number]
  scale?: [number, number, number]
} {
  const cameraPosition = manifest?.camera?.position
  const cameraTarget = manifest?.camera?.target
  const screenBbox = manifest?.product?.screenBbox
  const worldMin = manifest?.product?.worldBounds?.min
  const worldMax = manifest?.product?.worldBounds?.max
  const viewportWidth = finiteNumber(manifest?.viewport?.width, 0)
  const viewportHeight = finiteNumber(manifest?.viewport?.height, 0)
  const fovScale = finiteNumber(manifest?.viewport?.fovScale, 1)
  const position = productTransform.position

  if (
    !position || !Array.isArray(cameraPosition) || !Array.isArray(cameraTarget)
    || !Array.isArray(worldMin) || !Array.isArray(worldMax)
    || !screenBbox || viewportWidth <= 0 || viewportHeight <= 0
    || fovScale <= 0 || fovScale >= 0.999
  ) return productTransform

  const frameHeight = viewportHeight * fovScale
  const frameWidth = frameHeight * (16 / 9)
  if (frameWidth <= 0 || frameHeight <= 0) return productTransform

  const frameLeft = (viewportWidth - frameWidth) / 2
  const frameTop = (viewportHeight - frameHeight) / 2
  const targetMinX = ((finiteNumber(screenBbox.x, 0) - frameLeft) / frameWidth) * 2 - 1
  const targetMaxX = ((finiteNumber(screenBbox.x, 0) + finiteNumber(screenBbox.width, 0) - frameLeft) / frameWidth) * 2 - 1
  const targetMaxY = 1 - ((finiteNumber(screenBbox.y, 0) - frameTop) / frameHeight) * 2
  const targetMinY = 1 - ((finiteNumber(screenBbox.y, 0) + finiteNumber(screenBbox.height, 0) - frameTop) / frameHeight) * 2

  const camera = new THREE.PerspectiveCamera(
    finiteNumber(manifest?.camera?.fov, WORLDLABS_REFERENCE_FOV_Y),
    16 / 9,
    0.1,
    1000,
  )
  camera.position.fromArray(cameraPosition)
  camera.lookAt(new THREE.Vector3().fromArray(cameraTarget))
  camera.updateMatrixWorld(true)

  const bounds = new THREE.Box3(
    new THREE.Vector3().fromArray(worldMin),
    new THREE.Vector3().fromArray(worldMax),
  )
  if (bounds.isEmpty()) return productTransform

  const projected: THREE.Vector3[] = []
  for (const x of [bounds.min.x, bounds.max.x]) {
    for (const y of [bounds.min.y, bounds.max.y]) {
      for (const z of [bounds.min.z, bounds.max.z]) {
        projected.push(new THREE.Vector3(x, y, z).project(camera))
      }
    }
  }
  const currentMinX = Math.min(...projected.map((point) => point.x))
  const currentMaxX = Math.max(...projected.map((point) => point.x))
  const currentMinY = Math.min(...projected.map((point) => point.y))
  const currentMaxY = Math.max(...projected.map((point) => point.y))
  const currentWidth = currentMaxX - currentMinX
  const currentHeight = currentMaxY - currentMinY
  const targetWidth = targetMaxX - targetMinX
  const targetHeight = targetMaxY - targetMinY
  if (currentWidth <= 0 || currentHeight <= 0 || targetWidth <= 0 || targetHeight <= 0) return productTransform

  const scaleFactor = Math.sqrt((targetWidth / currentWidth) * (targetHeight / currentHeight))
  if (!Number.isFinite(scaleFactor) || scaleFactor <= 0) return productTransform

  const boundsCenter = bounds.getCenter(new THREE.Vector3())
  const viewCenter = boundsCenter.clone().applyMatrix4(camera.matrixWorldInverse)
  const depth = -viewCenter.z
  if (depth <= 0) return productTransform
  const focalY = 1 / Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)
  const targetCenterX = (targetMinX + targetMaxX) / 2
  const targetCenterY = (targetMinY + targetMaxY) / 2
  const desiredViewCenter = new THREE.Vector3(
    targetCenterX * depth * camera.aspect / focalY,
    targetCenterY * depth / focalY,
    viewCenter.z,
  )
  const desiredWorldCenter = boundsCenter.clone().add(
    desiredViewCenter.sub(viewCenter).applyQuaternion(camera.quaternion),
  )
  const oldPosition = new THREE.Vector3().fromArray(position)
  const scaledCenterOffset = boundsCenter.clone().sub(oldPosition).multiplyScalar(scaleFactor)
  const correctedPosition = desiredWorldCenter.sub(scaledCenterOffset)
  const baseScale = productTransform.scale ?? [1, 1, 1]

  return {
    ...productTransform,
    position: correctedPosition.toArray() as [number, number, number],
    scale: baseScale.map((value) => finiteNumber(value, 1) * scaleFactor) as [number, number, number],
  }
}

type ArchiveProductTransform = {
  position?: [number, number, number]
  rotation?: [number, number, number]
  scale?: [number, number, number]
}

type MaskedSplatProductFit = {
  surfaceDepth: number
  viewMinX: number
  viewMaxX: number
  viewMinY: number
  viewMaxY: number
}

const maskedSplatDepthCache = new Map<string, Promise<MaskedSplatProductFit | null>>()

async function loadMaskPixels(url: string): Promise<{ data: Uint8ClampedArray; width: number; height: number }> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Masker kon niet worden geladen (HTTP ${response.status}).`)
  const bitmap = await createImageBitmap(await response.blob())
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('Geen 2D-canvas beschikbaar voor objectmasker.')
  context.drawImage(bitmap, 0, 0)
  bitmap.close()
  return {
    data: context.getImageData(0, 0, canvas.width, canvas.height).data,
    width: canvas.width,
    height: canvas.height,
  }
}

/**
 * Meet de voorste, dominante splatlaag binnen het productmasker. WorldLabs
 * bewaart de zichtbare productvorm in dezelfde referentieprojectie als frame 1;
 * zo krijgen we de ontbrekende diepte zonder de al uitgelijnde wereld te bewegen.
 */
function estimateMaskedSplatSurfaceDepth(
  alignment: SplatAlignment,
  manifest: any,
  objectMaskUrl: string,
): Promise<MaskedSplatProductFit | null> {
  const cacheKey = JSON.stringify([
    alignment.splatUrl,
    objectMaskUrl,
    alignment.transformPosition,
    alignment.transformQuaternion,
    alignment.transformScale,
    alignment.groupPositionX,
    alignment.groupPositionY,
    alignment.groupPositionZ,
    alignment.groupScale,
    alignment.groupTiltX,
    alignment.basisRotationY,
    alignment.groupTiltZ,
    alignment.worldReferencePosition,
    alignment.worldReferenceQuaternion,
    alignment.worldReferenceFovY,
  ])
  const cached = maskedSplatDepthCache.get(cacheKey)
  if (cached) return cached

  const pending = (async () => {
    if (!isMarbleAlignment(alignment) || !alignment.splatUrl.includes('.splat')) return null
    const cameraPosition = manifest?.camera?.position
    const cameraTarget = manifest?.camera?.target
    if (!Array.isArray(cameraPosition) || !Array.isArray(cameraTarget)) return null

    const [splatResponse, mask] = await Promise.all([
      fetch(alignment.splatUrl),
      loadMaskPixels(objectMaskUrl),
    ])
    if (!splatResponse.ok) throw new Error(`Splat kon niet worden gemeten (HTTP ${splatResponse.status}).`)
    const splat = await splatResponse.arrayBuffer()
    const bytes = new Uint8Array(splat)
    const values = new DataView(splat)

    const referencePosition = new THREE.Vector3(...(alignment.worldReferencePosition ?? [0, 0, 0]))
    const referenceQuaternionInverse = new THREE.Quaternion(...(alignment.worldReferenceQuaternion ?? [0, 0, 0, 1])).invert()
    const referenceFov = finiteNumber(alignment.worldReferenceFovY, WORLDLABS_REFERENCE_FOV_Y)
    const focalY = 1 / Math.tan(THREE.MathUtils.degToRad(referenceFov) / 2)
    const aspect = mask.width / mask.height

    const shotCamera = new THREE.PerspectiveCamera(WORLDLABS_REFERENCE_FOV_Y, aspect, 0.1, 1000)
    shotCamera.position.fromArray(cameraPosition)
    shotCamera.lookAt(new THREE.Vector3().fromArray(cameraTarget))
    shotCamera.updateMatrixWorld(true)

    const scenePosition = new THREE.Vector3(...(alignment.transformPosition ?? cameraPosition)).add(new THREE.Vector3(
      finiteNumber(alignment.groupPositionX, 0),
      finiteNumber(alignment.groupPositionY, 0),
      finiteNumber(alignment.groupPositionZ, 0),
    ))
    const sceneQuaternion = new THREE.Quaternion(...(alignment.transformQuaternion ?? [0, 0, 0, 1]))
      .multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(
        finiteNumber(alignment.groupTiltX, 0),
        finiteNumber(alignment.basisRotationY, 0),
        finiteNumber(alignment.groupTiltZ, 0),
        'XYZ',
      )))
      .multiply(new THREE.Quaternion(1, 0, 0, 0))
      .normalize()
    const sceneScale = finiteNumber(alignment.transformScale, 1) * finiteNumber(alignment.groupScale, 1)
    const x180 = new THREE.Quaternion(1, 0, 0, 0)
    const referencePoint = new THREE.Vector3()
    const worldPoint = new THREE.Vector3()
    const maskedPoints: Array<{ depth: number; x: number; y: number }> = []

    for (let offset = 0; offset + 32 <= splat.byteLength; offset += 32) {
      if (bytes[offset + 27] <= 5) continue
      const rawX = values.getFloat32(offset, true)
      const rawY = values.getFloat32(offset + 4, true)
      const rawZ = values.getFloat32(offset + 8, true)
      if (!Number.isFinite(rawX) || !Number.isFinite(rawY) || !Number.isFinite(rawZ)) continue

      referencePoint.set(rawX, rawY, rawZ).applyQuaternion(x180)
      referencePoint.sub(referencePosition).applyQuaternion(referenceQuaternionInverse)
      const referenceDepth = -referencePoint.z
      if (referenceDepth <= 0.05) continue
      const ndcX = (referencePoint.x / referenceDepth) * focalY / aspect
      const ndcY = (referencePoint.y / referenceDepth) * focalY
      const pixelX = Math.round((ndcX + 1) * 0.5 * (mask.width - 1))
      const pixelY = Math.round((1 - ndcY) * 0.5 * (mask.height - 1))
      if (pixelX < 0 || pixelY < 0 || pixelX >= mask.width || pixelY >= mask.height) continue
      const maskOffset = (pixelY * mask.width + pixelX) * 4
      if (mask.data[maskOffset] < 128 || mask.data[maskOffset + 3] < 128) continue

      worldPoint.set(rawX, rawY, rawZ).multiplyScalar(sceneScale).applyQuaternion(sceneQuaternion).add(scenePosition)
      worldPoint.applyMatrix4(shotCamera.matrixWorldInverse)
      const shotDepth = -worldPoint.z
      if (shotDepth > 0.05 && Number.isFinite(shotDepth)) {
        maskedPoints.push({ depth: shotDepth, x: worldPoint.x, y: worldPoint.y })
      }
    }
    const depths = maskedPoints.map((point) => point.depth)
    if (depths.length < 50) return null

    depths.sort((a, b) => a - b)
    const range = depths[depths.length - 1] - depths[0]
    const binWidth = Math.max(0.02 * Math.max(sceneScale, 0.001), range / 120)
    const histogram = new Map<number, number>()
    for (const depth of depths) {
      const bin = Math.round(depth / binWidth)
      histogram.set(bin, (histogram.get(bin) ?? 0) + 1)
    }
    const modeBin = [...histogram.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
    if (modeBin == null) return null
    const modeDepths = depths.filter((depth) => Math.abs(depth / binWidth - modeBin) <= 2)
    const surfaceDepth = modeDepths[Math.floor(modeDepths.length / 2)]
    const surfacePoints = maskedPoints.filter((point) => Math.abs(point.depth / binWidth - modeBin) <= 2)
    const quantile = (values: number[], fraction: number) => {
      const sorted = [...values].sort((a, b) => a - b)
      return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * fraction)))]
    }
    const fit: MaskedSplatProductFit = {
      surfaceDepth,
      viewMinX: quantile(surfacePoints.map((point) => point.x), 0.02),
      viewMaxX: quantile(surfacePoints.map((point) => point.x), 0.98),
      viewMinY: quantile(surfacePoints.map((point) => point.y), 0.02),
      viewMaxY: quantile(surfacePoints.map((point) => point.y), 0.98),
    }
    console.info('[ProductStudio] splat-productfit gemeten', JSON.stringify({
      pointsInMask: depths.length,
      ...fit,
      modePoints: modeDepths.length,
    }))
    return fit
  })().catch((error) => {
    console.warn('[ProductStudio] productdiepte uit splat meten mislukt:', error)
    return null
  })

  maskedSplatDepthCache.set(cacheKey, pending)
  return pending
}

function moveArchiveProductToSplatDepth(
  manifest: any,
  sourceTransform: ArchiveProductTransform,
  correctedTransform: ArchiveProductTransform,
  fit: MaskedSplatProductFit,
): ArchiveProductTransform {
  const cameraPositionValues = manifest?.camera?.position
  const cameraTargetValues = manifest?.camera?.target
  const worldMin = manifest?.product?.worldBounds?.min
  const worldMax = manifest?.product?.worldBounds?.max
  if (
    !correctedTransform.position || !Array.isArray(cameraPositionValues) || !Array.isArray(cameraTargetValues)
    || !Array.isArray(worldMin) || !Array.isArray(worldMax) || !sourceTransform.position
  ) return correctedTransform

  const camera = new THREE.PerspectiveCamera(WORLDLABS_REFERENCE_FOV_Y, 16 / 9, 0.1, 1000)
  camera.position.fromArray(cameraPositionValues)
  camera.lookAt(new THREE.Vector3().fromArray(cameraTargetValues))
  camera.updateMatrixWorld(true)

  const sourcePosition = new THREE.Vector3().fromArray(sourceTransform.position)
  const correctedPosition = new THREE.Vector3().fromArray(correctedTransform.position)
  const sourceScale = sourceTransform.scale ?? [1, 1, 1]
  const correctedScale = correctedTransform.scale ?? sourceScale
  const scaleFactor = correctedScale.reduce((sum, value, index) => (
    sum + finiteNumber(value, 1) / Math.max(Math.abs(finiteNumber(sourceScale[index], 1)), 0.000001)
  ), 0) / 3

  let nearestDepth = Number.POSITIVE_INFINITY
  let currentMinX = Number.POSITIVE_INFINITY
  let currentMaxX = Number.NEGATIVE_INFINITY
  let currentMinY = Number.POSITIVE_INFINITY
  let currentMaxY = Number.NEGATIVE_INFINITY
  for (const x of [Number(worldMin[0]), Number(worldMax[0])]) {
    for (const y of [Number(worldMin[1]), Number(worldMax[1])]) {
      for (const z of [Number(worldMin[2]), Number(worldMax[2])]) {
        const correctedCorner = new THREE.Vector3(x, y, z)
          .sub(sourcePosition)
          .multiplyScalar(scaleFactor)
          .add(correctedPosition)
          .applyMatrix4(camera.matrixWorldInverse)
        nearestDepth = Math.min(nearestDepth, -correctedCorner.z)
        currentMinX = Math.min(currentMinX, correctedCorner.x)
        currentMaxX = Math.max(currentMaxX, correctedCorner.x)
        currentMinY = Math.min(currentMinY, correctedCorner.y)
        currentMaxY = Math.max(currentMaxY, correctedCorner.y)
      }
    }
  }
  if (!Number.isFinite(nearestDepth) || nearestDepth <= 0.05 || fit.surfaceDepth <= 0.05) return correctedTransform

  const currentWidth = currentMaxX - currentMinX
  const currentHeight = currentMaxY - currentMinY
  const targetWidth = fit.viewMaxX - fit.viewMinX
  const targetHeight = fit.viewMaxY - fit.viewMinY
  if (currentWidth <= 0 || currentHeight <= 0 || targetWidth <= 0 || targetHeight <= 0) return correctedTransform
  const fitScale = Math.sqrt((targetWidth / currentWidth) * (targetHeight / currentHeight))
  if (!Number.isFinite(fitScale) || fitScale < 0.05 || fitScale > 20) return correctedTransform

  const sourceBoundsCenter = new THREE.Box3(
    new THREE.Vector3().fromArray(worldMin),
    new THREE.Vector3().fromArray(worldMax),
  ).getCenter(new THREE.Vector3())
  const correctedBoundsCenter = sourceBoundsCenter.sub(sourcePosition).multiplyScalar(scaleFactor).add(correctedPosition)
  const correctedCenterView = correctedBoundsCenter.clone().applyMatrix4(camera.matrixWorldInverse)
  const frontHalfDepth = Math.max(0, -correctedCenterView.z - nearestDepth) * fitScale
  const targetCenterView = new THREE.Vector3(
    (fit.viewMinX + fit.viewMaxX) / 2,
    (fit.viewMinY + fit.viewMaxY) / 2,
    -(fit.surfaceDepth + frontHalfDepth),
  )
  const targetCenterWorld = targetCenterView.applyMatrix4(camera.matrixWorld)
  const fittedPosition = targetCenterWorld.sub(
    correctedBoundsCenter.sub(correctedPosition).multiplyScalar(fitScale),
  )
  console.info('[ProductStudio] product op gekoppelde splatpunten geplaatst', JSON.stringify({
    nearestDepth,
    surfaceDepth: fit.surfaceDepth,
    fitScale,
    position: fittedPosition.toArray(),
  }))
  return {
    ...correctedTransform,
    position: fittedPosition.toArray() as [number, number, number],
    scale: correctedScale.map((value) => finiteNumber(value, 1) * fitScale) as [number, number, number],
  }
}

export default function ProductStudioShell({ initialImageSrc, renderLayout }: {
  initialImageSrc?: string | null
  renderLayout?: (sidebar: React.ReactNode, viewport: React.ReactNode) => React.ReactNode
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const contactSheetInputRef = useRef<HTMLInputElement>(null)
  const objectMaskInputRef = useRef<HTMLInputElement>(null)
  const studioRef = useRef<Scene3DEditorHandle>(null)
  const splatShotManifestRef = useRef<any>(null)
  const promptBarRef = useRef<AtelierPromptBarHandle>(null)
  const [backgroundLocked, setBackgroundLocked] = useState(false)
  const [envReconstructing, setEnvReconstructing] = useState(false)
  const hydratedProjectIdRef = useRef<string | null>(null)
  const [project, setProject] = useState<ProductStudioProject>(loadProject)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [finalLoading, setFinalLoading] = useState(false)
  const [finalError, setFinalError] = useState<string | null>(null)
  const [providerStats, setProviderStats] = useState<ProviderStats | null>(null)
  const [reconstructionVersions, setReconstructionVersions] = useState<ReconstructionVersion[]>([])
  const [finalRenderVersions, setFinalRenderVersions] = useState<FinalRenderVersion[]>([])
  const [compareSlider, setCompareSlider] = useState(50)
  const [renderPacketStale, setRenderPacketStale] = useState(false)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const [rightTab, setRightTab] = useState<'properties' | 'editor' | 'studio' | 'archive' | 'projects'>('studio')
  const [currentCameraState, setCurrentCameraState] = useState<{ position: [number, number, number]; target: [number, number, number] } | null>(null)
  const [allProjects, setAllProjects] = useState<any[]>([])
  const [renamingProjectId, setRenamingProjectId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [archivePreviewId, setArchivePreviewId] = useState<string | null>(null)
  const [aiDepthUrl, setAiDepthUrl] = useState<string | null>(null)
  const [envMeshUrls, setEnvMeshUrls] = useState<string[]>([])
  const [envViewUrls, setEnvViewUrls] = useState<string[]>([])
  const [envPanoramaUrl, setEnvPanoramaUrl] = useState<string | null>(null)
  const [envMappingEnabled, setEnvMappingEnabled] = useState(false)
  const [bakeProgress, setBakeProgress] = useState<{ phase: 'idle' | 'baking' | 'done' | 'error'; currentFrame: number; totalFrames: number; error?: string }>({ phase: 'idle', currentFrame: 0, totalFrames: 12 })
  const [orbitTest, setOrbitTest] = useState<{ phase: 'idle' | 'running' | 'done' | 'error'; step: string; progress: number; renderVersionId?: string | null; videoUrl?: string; orbitRunId?: string; error?: string }>({ phase: 'idle', step: '', progress: 0 })
  const [assetsPrep, setAssetsPrep] = useState<{ phase: 'idle' | 'running' | 'done' | 'error'; step: string; progress: number; colmap?: { registered: number; total: number; pct: number; pass: boolean; method?: string }; sampleClayUrls?: string[]; error?: string }>({ phase: 'idle', step: '', progress: 0 })
  const [splatTraining, setSplatTraining] = useState<{ phase: 'idle' | 'running' | 'done' | 'error'; step: string; progress: number; currentStep?: number; totalSteps?: number; error?: string }>({ phase: 'idle', step: '', progress: 0 })
  const [marbleGen, setMarbleGen] = useState<MarbleRunState>(() => {
    try {
      const raw = localStorage.getItem('huphe:marble-gen:v1')
      if (raw) return JSON.parse(raw)
    } catch { /* ignore */ }
    return { phase: 'idle', step: '', progress: 0 }
  })
  const [marblePrompt, setMarblePrompt] = useState('')
  const orbitBelongsToCurrentRender = Boolean(project.finalRenderRecord?.id && orbitTest.renderVersionId === project.finalRenderRecord.id)
  const orbitModel = 'seedance' as const
  const [poseMethod, setPoseMethod] = useState<'fal'>('fal')
  const [orbitConfirmOpen, setOrbitConfirmOpen] = useState(false)
  const [orbitVideoExpanded, setOrbitVideoExpanded] = useState(false)
  const [clayLightboxIndex, setClayLightboxIndex] = useState<number | null>(null)
  const [splatViewerUrl, setSplatViewerUrl] = useState<string | null>(null)
  const [splatFrameViewerOpen, setSplatFrameViewerOpen] = useState(false)
  const [splatFrameCompositeOpacity, setSplatFrameCompositeOpacity] = useState(0.5)
  const [splatFrameXFlip, setSplatFrameXFlip] = useState(true)
  const [splatFramePreferSpz, setSplatFramePreferSpz] = useState(true)
  const [splatFramePose, setSplatFramePose] = useState<SplatReferencePose | null>(null)
  const [splatAlignment, setSplatAlignment] = useState<SplatAlignment | null>(null)
  const [splatBaseAlignment, setSplatBaseAlignment] = useState<SplatAlignment | null>(null)
  const [splatVisible, setSplatVisible] = useState(true)
  const viewportShellRef = useRef<HTMLDivElement>(null)

  const applySplatAlignment = (alignment: SplatAlignment, baseAlignment?: SplatAlignment | null) => {
    const current = cloneSplatAlignment(alignment)
    const base = baseAlignment ? cloneSplatAlignment(baseAlignment) : cloneSplatAlignment(alignment)
    setSplatBaseAlignment(base)
    setSplatAlignment(current)
  }

  const resetSplatAlignmentToBase = () => {
    if (!splatBaseAlignment) return
    setSplatAlignment(cloneSplatAlignment(splatBaseAlignment))
  }

  const nudgeSplatAlignment = (dx: number, dy: number, dz = 0) => {
    setSplatAlignment((prev) => {
      if (!prev) return prev
      const currentX = finiteNumber(prev.groupPositionX, 0)
      const currentY = finiteNumber(prev.groupPositionY, 0)
      const currentZ = finiteNumber(prev.groupPositionZ, 0)
      const currentCenter = [
        finiteNumber(prev.sceneCenter?.[0], 0),
        finiteNumber(prev.sceneCenter?.[1], 0),
        finiteNumber(prev.sceneCenter?.[2], 0),
      ] as [number, number, number]
      return {
        ...prev,
        groupPositionX: currentX + dx,
        groupPositionY: currentY + dy,
        groupPositionZ: currentZ + dz,
        sceneCenter: [
          currentCenter[0] + dx,
          currentCenter[1] + dy,
          currentCenter[2] + dz,
        ],
      }
    })
  }

  const setSplatAlignmentAxis = (axis: 'x' | 'y' | 'z', value: number) => {
    setSplatAlignment((prev) => {
      if (!prev) return prev
      const safeValue = finiteNumber(value, 0)
      const currentX = finiteNumber(prev.groupPositionX, 0)
      const currentY = finiteNumber(prev.groupPositionY, 0)
      const currentZ = finiteNumber(prev.groupPositionZ, 0)
      const currentCenter = [
        finiteNumber(prev.sceneCenter?.[0], 0),
        finiteNumber(prev.sceneCenter?.[1], 0),
        finiteNumber(prev.sceneCenter?.[2], 0),
      ] as [number, number, number]
      const dx = axis === 'x' ? safeValue - currentX : 0
      const dy = axis === 'y' ? safeValue - currentY : 0
      const dz = axis === 'z' ? safeValue - currentZ : 0

      return {
        ...prev,
        groupPositionX: axis === 'x' ? safeValue : currentX,
        groupPositionY: axis === 'y' ? safeValue : currentY,
        groupPositionZ: axis === 'z' ? safeValue : currentZ,
        sceneCenter: [
          currentCenter[0] + dx,
          currentCenter[1] + dy,
          currentCenter[2] + dz,
        ],
      }
    })
  }

  const setSplatTilt = (axis: 'x' | 'z', value: number) => {
    setSplatAlignment((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        groupTiltX: axis === 'x' ? finiteNumber(value, 0) : finiteNumber(prev.groupTiltX, 0),
        groupTiltZ: axis === 'z' ? finiteNumber(value, 0) : finiteNumber(prev.groupTiltZ, 0),
      }
    })
  }

  const setSplatScale = (value: number) => {
    const safeValue = Math.max(0.1, Math.min(5, Number.isFinite(value) ? value : 1))
    setSplatAlignment((prev) => prev ? { ...prev, groupScale: safeValue } : prev)
  }

  const setSplatMaskSize = (value: number) => {
    const safeValue = Math.max(0.2, Math.min(50, Number.isFinite(value) ? value : 20))
    setSplatAlignment((prev) => prev ? { ...prev, groupMaskSize: safeValue } : prev)
  }

  const [splatReconverting, setSplatReconverting] = useState(false)

  const reconvertSplat = async () => {
    const api = getProductStudioApi()
    if (!api || !splatAlignment?.plyPath) return
    setSplatReconverting(true)
    try {
      const result = await api.reconvertSplat?.({
        plyPath: splatAlignment.plyPath,
        alphaThreshold: finiteNumber(splatAlignment.cleanupAlpha, 15),
        scaleIqrFactor: finiteNumber(splatAlignment.cleanupScaleIqr, 3),
        positionSigma: finiteNumber(splatAlignment.cleanupPosSigma, 4),
      })
      if (result?.ok && result.splatUrl) {
        setSplatAlignment((prev) => prev ? { ...prev, splatUrl: result.splatUrl } : prev)
      }
    } finally {
      setSplatReconverting(false)
    }
  }

  const setSplatMaskOffset = (axis: 'x' | 'y' | 'z', value: number) => {
    const safeValue = finiteNumber(value, 0)
    setSplatAlignment((prev) => prev ? {
      ...prev,
      groupMaskOffsetX: axis === 'x' ? safeValue : finiteNumber(prev.groupMaskOffsetX, 0),
      groupMaskOffsetY: axis === 'y' ? safeValue : finiteNumber(prev.groupMaskOffsetY, 0),
      groupMaskOffsetZ: axis === 'z' ? safeValue : finiteNumber(prev.groupMaskOffsetZ, 0),
    } : prev)
  }

  const applySplatToShotTransform = (alignment: SplatAlignment): SplatAlignment => {
    const manifest = renderManifestRef.current as any
    const cameraPos = manifest?.camera?.position
    const cameraTarget = manifest?.camera?.target
    const productPos = manifestProductPosition(manifest)
    if (!Array.isArray(cameraPos) || !Array.isArray(cameraTarget) || !productPos) return alignment

    const shotCamera = new THREE.Vector3(Number(cameraPos[0]), Number(cameraPos[1]), Number(cameraPos[2]))
    const shotTarget = new THREE.Vector3(Number(cameraTarget[0]), Number(cameraTarget[1]), Number(cameraTarget[2]))
    const shotObject = new THREE.PerspectiveCamera()
    shotObject.position.copy(shotCamera)
    shotObject.up.set(0, 1, 0)
    shotObject.lookAt(shotTarget)
    shotObject.updateMatrixWorld()

    const colmapCamera = new THREE.Vector3(...alignment.position)
    const colmapCenter = new THREE.Vector3(...alignment.sceneCenter)
    const sceneCenter = new THREE.Vector3(...productPos)
    const colmapDistance = colmapCamera.distanceTo(colmapCenter)
    const sceneDistance = shotCamera.distanceTo(sceneCenter)
    const transformScale = colmapDistance > 1e-5 && sceneDistance > 1e-5
      ? Math.max(0.001, Math.min(100, sceneDistance / colmapDistance))
      : 1

    const colmapQuat = new THREE.Quaternion(
      alignment.quaternion[0],
      alignment.quaternion[1],
      alignment.quaternion[2],
      alignment.quaternion[3],
    ).normalize()
    const transformQuat = shotObject.quaternion.clone().multiply(colmapQuat.clone().invert()).normalize()
    const transformedColmapCamera = colmapCamera.clone().applyQuaternion(transformQuat).multiplyScalar(transformScale)
    const transformPosition = shotCamera.clone().sub(transformedColmapCamera)

    return {
      ...alignment,
      splatToShot: true,
      transformPosition: [transformPosition.x, transformPosition.y, transformPosition.z],
      transformQuaternion: [transformQuat.x, transformQuat.y, transformQuat.z, transformQuat.w],
      transformScale,
      basisRotationY: 0,
      groupPositionX: finiteNumber(alignment.groupPositionX, 0),
      groupPositionY: finiteNumber(alignment.groupPositionY, 0),
      groupPositionZ: finiteNumber(alignment.groupPositionZ, 0),
      groupScale: finiteNumber(alignment.groupScale, 1),
    }
  }

  const applyMarbleBaseAlignment = (alignment: SplatAlignment): SplatAlignment => {
    const groupScale = marbleGroupScale(alignment.metricScaleFactor)
    const groupPositionY = marbleGroundOffsetY(alignment.groundPlaneOffset, groupScale)
    return {
      ...alignment,
      source: 'marble',
      splatToShot: false,
      transformPosition: undefined,
      transformQuaternion: undefined,
      transformScale: undefined,
      basisRotationY: Math.PI / 2,
      groupPositionX: 0,
      groupPositionY,
      groupPositionZ: 0,
      groupScale,
      groupTiltX: 0,
      groupTiltZ: 0,
      sceneCenter: alignment.sceneCenter ?? [0, 0, 0],
      position: alignment.position ?? [0, 1.5, 4],
      quaternion: alignment.quaternion ?? [0, 0, 0, 1],
      fovY: alignment.fovY ?? 60,
      width: alignment.width ?? 1920,
      height: alignment.height ?? 1080,
    }
  }

  // Berekent marbleToShot vanuit de echte referentiecamera van de WorldLabs-viewer.
  // Stappenplan:
  //   1. OpenCV → Three.js coördinatenconversie: 180° om X-as (Q_x180)
  //   2. Roteer Marble's startrichting naar de shot camera richting (Q_view)
  //   3. Verplaats origin naar shot camera positie
  //   4. Schaal met metric_scale_factor
  // Kalibratie per Marble-wereld opslaan/laden via localStorage.
  // marbleOriginInPS: vaste positie van Marble frame_0001 in de PS-wereld (onafhankelijk van camerahoek).
  // Voor elke nieuwe shot: groupPosition = marbleOriginInPS - transformPosition (nieuwe camera).
  interface MarbleCalibration {
    marbleOriginInPS: [number, number, number]
    groupScale: number
    basisRotationY: number
    groupTiltX: number
    groupTiltZ: number
    bubbleRadius: number
    groupMaskSize: number
    groupMaskOffsetX?: number
    groupMaskOffsetY?: number
    groupMaskOffsetZ?: number
    worldReferencePosition?: [number, number, number]
    worldReferenceQuaternion?: [number, number, number, number]
    worldReferenceTarget?: [number, number, number]
    worldReferenceFovY?: number
  }

  const marbleCalibrationIdentity = (alignment?: SplatAlignment | null): string | null => {
    if (!alignment) return null
    if (alignment.worldId) return `world:${alignment.worldId}`
    const metaWorldId = alignment.marbleMeta && typeof alignment.marbleMeta === 'object'
      ? (alignment.marbleMeta as { worldId?: unknown }).worldId
      : undefined
    if (typeof metaWorldId === 'string' && metaWorldId) return `world:${metaWorldId}`
    if (!alignment.splatUrl) return null
    const stableSource = alignment.splatUrl
      .split('?')[0]
      .replace(/(?:world(?:_hq)?\.(?:splat|spz)|[^/]+\.ply)$/i, '')
    return `source:${stableSource}`
  }

  const marbleCalibrationKey = (identity: string) => `marble-cal-${identity}`

  const loadMarbleCalibration = (alignment?: SplatAlignment | null): MarbleCalibration | null => {
    const identity = marbleCalibrationIdentity(alignment)
    if (!identity) return null
    try {
      const raw = localStorage.getItem(marbleCalibrationKey(identity))
      return raw ? (JSON.parse(raw) as MarbleCalibration) : null
    } catch { return null }
  }

  const saveMarbleCalibration = (alignment: SplatAlignment) => {
    const identity = marbleCalibrationIdentity(alignment)
    if (!identity || !alignment.splatToShot || !Array.isArray(alignment.transformPosition)) return
    const tx = finiteNumber(alignment.transformPosition[0], 0)
    const ty = finiteNumber(alignment.transformPosition[1], 0)
    const tz = finiteNumber(alignment.transformPosition[2], 0)
    const cal: MarbleCalibration = {
      marbleOriginInPS: [
        tx + finiteNumber(alignment.groupPositionX, 0),
        ty + finiteNumber(alignment.groupPositionY, 0),
        tz + finiteNumber(alignment.groupPositionZ, 0),
      ],
      groupScale: finiteNumber(alignment.groupScale, 1),
      basisRotationY: finiteNumber(alignment.basisRotationY, 0),
      groupTiltX: finiteNumber(alignment.groupTiltX, 0),
      groupTiltZ: finiteNumber(alignment.groupTiltZ, 0),
      bubbleRadius: finiteNumber(alignment.bubbleRadius, 0),
      groupMaskSize: finiteNumber(alignment.groupMaskSize, 20),
      groupMaskOffsetX: finiteNumber(alignment.groupMaskOffsetX, 0),
      groupMaskOffsetY: finiteNumber(alignment.groupMaskOffsetY, 0),
      groupMaskOffsetZ: finiteNumber(alignment.groupMaskOffsetZ, 0),
      worldReferencePosition: alignment.worldReferencePosition
        ? [...alignment.worldReferencePosition] as [number, number, number]
        : undefined,
      worldReferenceQuaternion: alignment.worldReferenceQuaternion
        ? [...alignment.worldReferenceQuaternion] as [number, number, number, number]
        : undefined,
      worldReferenceTarget: alignment.worldReferenceTarget
        ? [...alignment.worldReferenceTarget] as [number, number, number]
        : undefined,
      worldReferenceFovY: alignment.worldReferenceFovY,
    }
    try {
      localStorage.setItem(marbleCalibrationKey(identity), JSON.stringify(cal))
    } catch { /* ignore */ }
  }

  const applyMarbleShotTransform = (alignment: SplatAlignment, manifest: any, _baseAlignment?: SplatAlignment | null, _forceRecalculate = false): SplatAlignment => {
    const cameraPos = manifest?.camera?.position
    const cameraTarget = manifest?.camera?.target
    if (!Array.isArray(cameraPos) || !Array.isArray(cameraTarget)) {
      if (alignment.splatToShot && Array.isArray(alignment.transformPosition)) {
        return { ...alignment, source: 'marble' }
      }
      return applyMarbleBaseAlignment(alignment)
    }

    const shotCamera = new THREE.Vector3(Number(cameraPos[0]), Number(cameraPos[1]), Number(cameraPos[2]))
    const shotTarget = new THREE.Vector3(Number(cameraTarget[0]), Number(cameraTarget[1]), Number(cameraTarget[2]))
    const calibration = loadMarbleCalibration(alignment)
    const referenceFovY = alignment.worldReferenceFovY ?? calibration?.worldReferenceFovY
    // WorldLabs reconstrueert de wereld vanuit zijn eigen referentieprojectie.
    // manifest.camera.fov kan al voor de editor-viewport gecorrigeerd zijn en
    // zou hier een tweede crop/zoom veroorzaken. Gebruik daarom de gemeten FOV
    // van de WorldLabs-referentiecamera voor dezelfde beeldkadering.
    const worldFovY = finiteNumber(referenceFovY, WORLDLABS_REFERENCE_FOV_Y)
    const shotObject = new THREE.PerspectiveCamera(worldFovY, 16 / 9, 0.1, 1000)
    shotObject.position.copy(shotCamera)
    shotObject.up.set(0, 1, 0)
    shotObject.lookAt(shotTarget)
    shotObject.updateMatrixWorld(true)
    const shotQuaternion = shotObject.quaternion.clone().normalize()
    const referencePositionValues = alignment.worldReferencePosition ?? calibration?.worldReferencePosition
    const referenceQuaternionValues = alignment.worldReferenceQuaternion ?? calibration?.worldReferenceQuaternion
    const referenceTargetValues = alignment.worldReferenceTarget ?? calibration?.worldReferenceTarget
    const referencePosition = Array.isArray(referencePositionValues)
      ? new THREE.Vector3(...referencePositionValues)
      : new THREE.Vector3(0, 0, 0)
    const referenceQuaternion = Array.isArray(referenceQuaternionValues)
      ? new THREE.Quaternion(...referenceQuaternionValues).normalize()
      : new THREE.Quaternion()
    const transformQuaternion = shotQuaternion.clone().multiply(referenceQuaternion.clone().invert()).normalize()
    const transformScale = finiteNumber(alignment.transformScale, 1)
    const transformPosition = shotCamera.clone().sub(
      referencePosition.clone().applyQuaternion(transformQuaternion).multiplyScalar(transformScale),
    )

    return {
      ...alignment,
      source: 'marble',
      splatToShot: true,
      transformPosition: [transformPosition.x, transformPosition.y, transformPosition.z],
      transformQuaternion: [transformQuaternion.x, transformQuaternion.y, transformQuaternion.z, transformQuaternion.w],
      transformScale,
      worldReferencePosition: referencePositionValues,
      worldReferenceQuaternion: referenceQuaternionValues,
      worldReferenceTarget: referenceTargetValues,
      worldReferenceFovY: referenceFovY,
      basisRotationY: 0,
      bubbleRadius: 0,
      groupPositionX: 0,
      groupPositionY: 0,
      groupPositionZ: 0,
      groupScale: 1,
      groupTiltX: 0,
      groupTiltZ: 0,
      groupMaskSize: 20,
      groupMaskOffsetX: 0,
      groupMaskOffsetY: 0,
      groupMaskOffsetZ: 0,
      sceneCenter: [shotTarget.x, shotTarget.y, shotTarget.z],
      position: cameraPos as [number, number, number],
      quaternion: [shotQuaternion.x, shotQuaternion.y, shotQuaternion.z, shotQuaternion.w],
      fovY: worldFovY,
      width: alignment.width ?? 1920,
      height: alignment.height ?? 1080,
    }
  }

  const useWorldLabsReferencePose = (pose: SplatReferencePose, force = false) => {
    setSplatAlignment((current) => {
      if (!current || current.source !== 'marble') return current
      if (current.worldReferencePosition && !force) return current
      const withReference: SplatAlignment = {
        ...current,
        worldReferencePosition: [...pose.position],
        worldReferenceQuaternion: [...pose.quaternion],
        worldReferenceTarget: [...pose.target],
        worldReferenceFovY: pose.fovY,
        transformScale: 1,
      }
      saveMarbleCalibration(withReference)
      return applyMarbleShotTransform(withReference, splatShotManifestRef.current ?? renderManifestRef.current, splatBaseAlignment, true)
    })
  }

  const [splatPuntMode, setSplatPuntMode] = useState<'off' | 'foto' | 'scene'>('off')
  const [puntenFoto, setPuntenFoto] = useState<Array<{ x: number; y: number }>>([])
  const [puntenScene, setPuntenScene] = useState<Array<{ x: number; y: number }>>([])
  const [puntPanelPos, setPuntPanelPos] = useState<{ x: number; y: number } | null>(null)
  const [puntPanelW, setPuntPanelW] = useState(280)
  const [imgZoom, setImgZoom] = useState(1)
  const [imgOffset, setImgOffset] = useState({ x: 0, y: 0 })
  const [imgNaturalAspect, setImgNaturalAspect] = useState(4 / 3)
  const imgPanStartRef = useRef<{ x: number; y: number; ox: number; oy: number; moved: boolean } | null>(null)
  const imgContainerRef = useRef<HTMLDivElement | null>(null)

  // Non-passive wheel listener so we can prevent page scroll while zooming the image
  useEffect(() => {
    const el = imgContainerRef.current
    if (!el || splatPuntMode === 'off') return
    const handler = (e: WheelEvent) => {
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      const mx = e.clientX - rect.left
      const my = e.clientY - rect.top
      const factor = e.deltaY < 0 ? 1.2 : 1 / 1.2
      const imgH = Math.round(rect.width / imgNaturalAspect)
      setImgZoom((prevZoom) => {
        const newZoom = Math.max(1, Math.min(12, prevZoom * factor))
        setImgOffset((prevOffset) => ({
          x: Math.min(0, Math.max(rect.width - rect.width * newZoom, mx - ((mx - prevOffset.x) / prevZoom) * newZoom)),
          y: Math.min(0, Math.max(imgH - imgH * newZoom, my - ((my - prevOffset.y) / prevZoom) * newZoom)),
        }))
        return newZoom
      })
    }
    el.addEventListener('wheel', handler, { passive: false })
    return () => el.removeEventListener('wheel', handler)
  }, [splatPuntMode, imgNaturalAspect])

  const resetPuntMode = () => {
    setSplatPuntMode('off')
    setPuntenFoto([])
    setPuntenScene([])
    setImgZoom(1)
    setImgOffset({ x: 0, y: 0 })
  }

  const berekenPuntUitlijning = () => {
    const n = Math.min(puntenFoto.length, puntenScene.length)
    if (n < 1) return
    const viewportRect = viewportShellRef.current?.getBoundingClientRect()
    const frameRect = viewportShellRef.current?.querySelector('[data-scene-frame="true"]')?.getBoundingClientRect()
    if (!viewportRect || !frameRect || viewportRect.width <= 0 || viewportRect.height <= 0) return
    let fx = 0, fy = 0, sx = 0, sy = 0
    for (let i = 0; i < n; i++) {
      fx += (frameRect.left - viewportRect.left + puntenFoto[i].x * frameRect.width) / viewportRect.width
      fy += (frameRect.top - viewportRect.top + puntenFoto[i].y * frameRect.height) / viewportRect.height
      sx += puntenScene[i].x; sy += puntenScene[i].y
    }
    fx /= n; fy /= n; sx /= n; sy /= n
    const dx = fx - sx
    const dy = fy - sy

    const orbit = studioRef.current?.getSceneControls()?.getOrbitState()
    const cameraPosition = orbit?.position ?? splatAlignment?.position ?? [4, 3, 4]
    const cameraTarget = orbit?.target ?? splatAlignment?.sceneCenter ?? [0, 0.5, 0]
    const fov = splatAlignment?.fovY ?? sceneControls?.scene.cameras[0]?.fov ?? 50
    const forward = normalize3([
      cameraTarget[0] - cameraPosition[0],
      cameraTarget[1] - cameraPosition[1],
      cameraTarget[2] - cameraPosition[2],
    ])
    const right = normalize3(cross3(forward, [0, 1, 0]))
    const up = normalize3(cross3(right, forward))
    const distance = Math.max(0.001, length3([
      cameraPosition[0] - cameraTarget[0],
      cameraPosition[1] - cameraTarget[1],
      cameraPosition[2] - cameraTarget[2],
    ]))
    const viewHeight = 2 * distance * Math.tan((fov * Math.PI / 180) / 2)
    const viewWidth = viewHeight * (viewportRect.width / viewportRect.height)
    const worldShift: [number, number, number] = [
      right[0] * dx * viewWidth - up[0] * dy * viewHeight,
      right[1] * dx * viewWidth - up[1] * dy * viewHeight,
      right[2] * dx * viewWidth - up[2] * dy * viewHeight,
    ]

    setSplatAlignment((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        groupPositionX: (prev.groupPositionX ?? 0) + worldShift[0],
        groupPositionY: prev.groupPositionY + worldShift[1],
        groupPositionZ: (prev.groupPositionZ ?? 0) + worldShift[2],
        sceneCenter: [
          prev.sceneCenter[0] + worldShift[0],
          prev.sceneCenter[1] + worldShift[1],
          prev.sceneCenter[2] + worldShift[2],
        ],
      }
    })
    resetPuntMode()
  }

  const saveSceneAlignment = (alignment: SplatAlignment, renderVersionId?: string) => {
    const api = getProductStudioApi()
    if (!api || !project.backendProject?.id || !renderVersionId) return
    api.saveSceneAlignment?.({
      projectId: project.backendProject.id,
      renderVersionId,
      alignment: alignment as unknown as Record<string, unknown>,
      baseAlignment: (splatBaseAlignment ?? alignment) as unknown as Record<string, unknown>,
    })
      .catch((e: unknown) => console.warn('[scene.json] opslaan mislukt:', e))
  }

  const linkLegacySceneAlignmentToCurrentRender = async () => {
    const api = getProductStudioApi()
    const projectId = project.backendProject?.id
    const renderVersionId = project.finalRenderRecord?.id
    if (!api || !projectId || !renderVersionId) return

    try {
      // Laad altijd de alignment die bij deze specifieke render versie hoort.
      const res = await api.loadSceneAlignment({ projectId, renderVersionId })
      if (!res?.ok || !res.alignment?.splatUrl) {
        console.warn('[scene.json] uitlijning voor render versie niet gevonden:', res?.error)
        return
      }
      applySplatAlignment(res.alignment, res.baseAlignment ?? fallbackImportBaseAlignment(res.alignment))
    } catch (e) {
      console.warn('[scene.json] uitlijning koppelen mislukt:', e)
    }
  }

  const startSplatTraining = async () => {
    const api = getProductStudioApi()
    if (!api || !project.backendProject?.id) return
    const renderVersionId = project.finalRenderRecord?.id
    if (!renderVersionId || orbitTest.renderVersionId !== renderVersionId) return
    if (!assetsPrep.colmap?.pass) return
    setSplatTraining({ phase: 'running', step: 'Brush training starten...', progress: 0 })
    try {
      const result = await api.trainSplat({
        projectId: project.backendProject.id,
        orbitRunId: orbitTest.orbitRunId,
        renderVersionId,
        model: orbitModel,
      })
      if (!result.ok || !result.splatUrl) {
        setSplatTraining({ phase: 'error', step: result.error ?? 'Training mislukt', progress: 0, error: result.error })
        return
      }
      // Auto-load het PLY + COLMAP pose in de scene
      const nextAlignment: SplatAlignment = applySplatToShotTransform({
        splatUrl: result.splatUrl,
        plyPath: result.plyPath,
        ...(result.pose ?? {
          position: [0, 5, 6] as [number, number, number],
          quaternion: [0, 0, 0, 1] as [number, number, number, number],
          fovY: 50,
          width: 1920,
          height: 1080,
          sceneCenter: [0, 0, 0] as [number, number, number],
        }),
        groupPositionX: 0,
        groupPositionY: (result.pose?.groupPositionY ?? 0) - (result.localFloorY ?? 0),
        groupPositionZ: 0,
        groupTiltX: 0,
        groupTiltZ: 0,
        cleanupAlpha: 15,
        cleanupScaleIqr: 3,
        cleanupPosSigma: 4,
        bubbleRadius: DEFAULT_BUBBLE_RADIUS,
        bubbleFeather: DEFAULT_BUBBLE_FEATHER,
      })
      setSplatViewerUrl(null)
      applySplatAlignment(nextAlignment, nextAlignment)
      saveSceneAlignment(nextAlignment, renderVersionId)
      setSplatTraining({ phase: 'done', step: 'Training klaar!', progress: 100 })
    } catch (err: any) {
      setSplatTraining({ phase: 'error', step: err?.message ?? 'Training mislukt', progress: 0, error: err?.message })
    }
  }

  const startMarbleGenerate = async () => {
    const api = getProductStudioApi()
    if (!api || !api.marbleGenerate || !project.backendProject?.id) return
    const imageSrc = project.finalRenderRecord?.output_url ?? project.finalRender?.src
    if (!imageSrc) return
    setMarbleGen({ phase: 'running', step: 'Starten...', progress: 0 })
    const unsub = api.onMarbleStep?.((data) => {
      setMarbleGen((prev) => prev.phase === 'running' ? { ...prev, step: data.step, progress: data.progress } : prev)
    })
    try {
      const result = await api.marbleGenerate({
        imageSrc,
        projectId: project.backendProject.id,
        renderVersionId: project.finalRenderRecord?.id,
        displayName: project.backendProject.name,
        textPrompt: marblePrompt.trim() || undefined,
        orbitRunId: orbitTest.orbitRunId,
      })
      if (!result.ok) {
        setMarbleGen({ phase: 'error', step: result.error ?? 'Mislukt', progress: 0, error: result.error })
        return
      }
      setMarbleGen({
        phase: 'done',
        step: 'Klaar!',
        progress: 100,
        thumbnailUrl: result.thumbnailUrl,
        spzPath: result.spzPath,
        splatPath: result.splatPath,
        worldId: result.worldId,
        route: result.route,
        renderVersionId: result.renderVersionId ?? project.finalRenderRecord?.id ?? null,
        orbitRunId: result.orbitRunId ?? orbitTest.orbitRunId ?? null,
        metricScaleFactor: result.metricScaleFactor,
        groundPlaneOffset: result.groundPlaneOffset,
        panoUrl: result.panoUrl,
        totalCredits: result.totalCredits,
      })
    } catch (err: any) {
      setMarbleGen({ phase: 'error', step: err?.message ?? 'Mislukt', progress: 0, error: err?.message })
    } finally {
      unsub?.()
    }
  }

  // Persist marble gen state (niet tijdens genereren)
  useEffect(() => {
    if (marbleGen.phase === 'running') return
    try { localStorage.setItem('huphe:marble-gen:v1', JSON.stringify(marbleGen)) } catch { /* ignore */ }
  }, [marbleGen])

  // (Geen auto-load meer: marble wordt alleen geladen via restoreRenderState bij archive-klik)

  useEffect(() => {
    const handler = (e: Event) => {
      const { step, progress } = (e as CustomEvent<{ step: string; progress: number }>).detail
      setOrbitTest((prev) => prev.phase === 'running' ? { ...prev, step, progress } : prev)
    }
    window.addEventListener('product-studio:orbit-step', handler)
    return () => window.removeEventListener('product-studio:orbit-step', handler)
  }, [])

  useEffect(() => {
    const handler = (e: Event) => {
      const { step, progress } = (e as CustomEvent<{ step: string; progress: number }>).detail
      setAssetsPrep((prev) => prev.phase === 'running' ? { ...prev, step, progress } : prev)
    }
    window.addEventListener('product-studio:assets-step', handler)
    return () => window.removeEventListener('product-studio:assets-step', handler)
  }, [])

  useEffect(() => {
    const api = getProductStudioApi()
    if (!api) return
    const unsub = api.onTrainingProgress?.((data) => {
      setSplatTraining((prev) => prev.phase === 'running' ? { ...prev, step: data.step, progress: data.progress, currentStep: data.currentStep, totalSteps: data.totalSteps } : prev)
    })
    return () => unsub?.()
  }, [])

  useEffect(() => {
    const api = getProductStudioApi()
    if (!api || !project.backendProject?.id) return
    if (orbitTest.phase === 'running') return
    const renderVersionId = project.finalRenderRecord?.id
    let cancelled = false
    setOrbitTest({ phase: 'idle', step: '', progress: 0, renderVersionId })
    setAssetsPrep({ phase: 'idle', step: '', progress: 0 })
    setSplatTraining({ phase: 'idle', step: '', progress: 0 })
    api.checkOrbitVideo({ projectId: project.backendProject.id, renderVersionId, model: orbitModel }).then((res) => {
      if (cancelled) return
      if (res.exists && res.videoUrl) {
        setOrbitTest((prev) => prev.phase === 'idle' || prev.phase === 'done'
          ? { phase: 'done', step: '', progress: 100, renderVersionId, videoUrl: res.videoUrl!, orbitRunId: res.orbitRunId ?? prev.orbitRunId }
          : prev
        )
        // Herstel assetsPrep colmap + clay frames vanuit opgeslagen data (na herstart)
        if (res.colmap) {
          setAssetsPrep({ phase: 'done', step: '', progress: 100, colmap: res.colmap, sampleClayUrls: res.sampleClayUrls })
        }
        // Herstel marble state als world.spz (en eventueel world.splat) al op schijf staan
        if (res.marble?.spzPath) {
          setMarbleGen((prev) => {
            if (prev.phase === 'done' && prev.spzPath === res.marble!.spzPath && prev.splatPath === res.marble!.splatPath) return prev
            return {
              phase: 'done',
              step: 'Klaar!',
              progress: 100,
              spzPath: res.marble!.spzPath,
              splatPath: res.marble!.splatPath,
              worldId: res.marble!.worldId,
              route: res.marble!.route,
              renderVersionId: res.marble!.renderVersionId ?? renderVersionId ?? null,
              orbitRunId: res.marble!.orbitRunId ?? res.orbitRunId ?? null,
              metricScaleFactor: res.marble!.metricScaleFactor,
              groundPlaneOffset: res.marble!.groundPlaneOffset,
              panoUrl: res.marble!.panoUrl,
              totalCredits: res.marble!.totalCredits,
            }
          })
          // splatAlignment wordt geladen via restoreRenderState (niet hier), zodat de marble
          // niet automatisch verschijnt bij project-open.
        }
      } else {
        setOrbitTest({ phase: 'idle', step: '', progress: 0, renderVersionId })
      }
    }).catch(() => {})
    return () => { cancelled = true }
  }, [orbitModel, project.backendProject?.id, project.finalRenderRecord?.id])
  // Auto-save splat alignment naar scene.json na elke wijziging (debounced 1.5s)
  // Gebruik altijd de versie die actief bekeken wordt (activeArchiveVersionId), niet finalRenderRecord.
  // finalRenderRecord wijst naar de nieuwste render — bij archief-klikken is dat de VERKEERDE versie.
  useEffect(() => {
    const renderVersionId = activeArchiveVersionId.current ?? project.finalRenderRecord?.id
    if (!splatAlignment || !project.backendProject?.id || !renderVersionId) return
    const api = getProductStudioApi()
    if (!api) return
    const tid = setTimeout(() => {
      api.saveSceneAlignment?.({
        projectId: project.backendProject!.id,
        renderVersionId,
        alignment: splatAlignment as unknown as Record<string, unknown>,
        baseAlignment: (splatBaseAlignment ?? fallbackImportBaseAlignment(splatAlignment)) as unknown as Record<string, unknown>,
      })
        .catch((e: unknown) => console.warn('[scene.json] auto-save mislukt:', e))
    }, 1500)
    return () => clearTimeout(tid)
  }, [splatAlignment, splatBaseAlignment, project.backendProject?.id, project.finalRenderRecord?.id])

  const lastCameraParamsRef = useRef<{ projectionMatrix: number[]; viewMatrix: number[]; near: number; far: number; width: number; height: number; fovScale?: number } | null>(null)
  // Per-version local cache: model transform per archive photo (session only)
  const archiveTransformCache = useRef<Record<string, { position: [number,number,number]; rotation: [number,number,number]; scale: [number,number,number] }>>({})
  const activeArchiveVersionId = useRef<string | null>(null)
  const prevOverlayRef = useRef<'light' | 'productLayer' | 'composite' | 'bgComposite' | '__depth' | null>(null)
  const renderManifestRef = useRef<typeof renderManifest>(undefined)
  const [sceneControls, setSceneControls] = useState<Scene3DSceneControls | null>(null)
  const [viewportOverlay, setViewportOverlay] = useState<'light' | 'productLayer' | 'composite' | 'bgComposite' | '__depth' | null>(null)
  const [overlayOpacity, setOverlayOpacity] = useState(1)
  const [debugRings, setDebugRings] = useState<{ spacing: number; width: number } | undefined>({ spacing: 0.04, width: 0.002 })
  const [viewMode, setViewMode] = useState<'wireframe' | 'solid' | 'material' | 'rendered'>('material')
  const textureDeletedRef = useRef(false)

  useEffect(() => {
    if (rightTab !== 'properties' && rightTab !== 'editor') return
    const id = setInterval(() => {
      setSceneControls(studioRef.current?.getSceneControls() ?? null)
    }, 200)
    setSceneControls(studioRef.current?.getSceneControls() ?? null)
    return () => clearInterval(id)
  }, [rightTab])

  const sourceReady = Boolean(project.sourceImage?.src)
  const basicProductUrl = project.basicProductAsset?.url
  const referenceInputAsset = project.sourceAsset
  const shapeInputAsset = project.basicProductAsset
  const shapeInputUrl = basicProductUrl
  const basicShapeReady = Boolean(basicProductUrl)
  const usableReferenceAngles = new Set(project.references
    .filter((view) => view.status === 'observed' || view.status === 'user-approved' || view.status === 'user-edited')
    .map((view) => view.angle ?? view.id))
  const approvedCount = Math.min(4, usableReferenceAngles.size)
  const meshReady = Boolean(project.reconstruction?.mesh_url || project.reconstruction?.route === 'primitive-proxy')
  const textureStatus = project.reconstruction?.texture_status ?? 'none'
  const texturedMeshUrl = project.reconstruction?.textured_mesh_url ?? undefined
  const textureAtlasUrl = project.reconstruction?.texture_atlas_url ?? undefined
  const textureOutputMissing = textureStatus === 'completed' && !texturedMeshUrl
  const texturedMeshReady = Boolean(texturedMeshUrl && textureStatus === 'completed')
  const activeStudioMeshUrl = texturedMeshUrl ?? project.reconstruction?.mesh_url
  const textureInProgress = textureStatus === 'pending' || textureStatus === 'processing'
  const renderPacketReady = Boolean(project.renderPacketRecord || project.renderPacket)
  const finalRenderRequiresTexture = meshReady && !texturedMeshReady
  const finalRenderBlocked = !renderPacketReady || renderPacketStale || finalRenderRequiresTexture
  const hasPhoto = Boolean(project.finalRender?.src)
  const promptBarMode: import('./AtelierPromptBar').PromptBarMode =
    backgroundLocked ? 'locked'
    : hasPhoto && !renderPacketStale ? 'retry'
    : 'capture'
  const objectMaskUrl = project.objectMaskUrl ?? project.objectMaskAsset?.url ?? project.renderPacketRecord?.object_mask_url
  const canonicalReference = project.references.find((view) => view.status === 'user-approved' || view.status === 'observed' || view.status === 'user-edited')
  const beautyPreviewUrl = project.renderPacket?.beauty ?? project.renderPacket?.passes?.textured ?? project.renderPacketRecord?.beauty_url
  const calibrationPreviewUrl = project.renderPacket?.passes?.calibration ?? (project.renderPacketRecord?.auxiliary_asset_urls?.calibration_url as string | undefined)
  const lightMapPreviewUrl = project.renderPacket?.passes?.light ?? (project.renderPacketRecord?.auxiliary_asset_urls?.light_map_url as string | undefined)
  const depthPreviewUrl = project.renderPacket?.passes?.depth ?? project.renderPacketRecord?.depth_url
  const normalPreviewUrl = project.renderPacket?.passes?.normal ?? project.renderPacketRecord?.normal_url
  const scenePreviewUrl = project.finalRenderRecord?.scene_url
    ?? (project.finalRenderRecord?.metadata?.scene_url as string | undefined)
  const finalMetadata = project.finalRenderRecord?.metadata ?? {}
  const backgroundPlateUrl = project.finalRenderRecord?.background_plate_url ?? (finalMetadata.background_plate_url as string | undefined)
  const renderPacketProductLayerUrl = (project.renderPacketRecord as any)?.product_layer_url as string | undefined
  const finalRenderMatchesPacket = Boolean(project.finalRenderRecord?.render_packet_id && project.renderPacketRecord?.id && project.finalRenderRecord.render_packet_id === project.renderPacketRecord.id)
  const productLayerUrl = renderPacketProductLayerUrl
    ?? (finalRenderMatchesPacket ? project.finalRenderRecord?.product_layer_url : undefined)
    ?? (finalRenderMatchesPacket ? finalMetadata.product_layer_url as string | undefined : undefined)
  const shadowLayerUrl = project.finalRenderRecord?.shadow_layer_url ?? (finalMetadata.shadow_layer_url as string | undefined)
  const finalCompositeUrl = project.finalRenderRecord?.composite_url
    ?? (finalMetadata.composite_url as string | undefined)
    ?? (finalMetadata.final_composite_url as string | undefined)
    ?? project.finalRenderRecord?.output_url
  const beautyLayerLabel = texturedMeshReady ? 'Textured Beauty' : 'Beauty'
  const finalLayerPreviews: Array<[string, string | null | undefined]> = [
    ['Bron / ref-look', project.sourceImage?.src],
    ['Basic', basicProductUrl],
    ['Canonical', canonicalReference?.src],
    [beautyLayerLabel, beautyPreviewUrl],
    ['Calibration', calibrationPreviewUrl],
    ['Light map', lightMapPreviewUrl],
    ['Product layer', productLayerUrl],
    ...(scenePreviewUrl ? [['Scene', scenePreviewUrl] as [string, string | null | undefined]] : []),
    ['Composite', finalCompositeUrl ?? project.finalRender?.src],
    ['Background', backgroundPlateUrl],
    ...(shadowLayerUrl ? [['Shadow', shadowLayerUrl] as [string, string | null | undefined]] : []),
    ...(envPanoramaUrl ? [['Panorama 360°', envPanoramaUrl] as [string, string | null | undefined]] : []),
    ...envViewUrls.map((url, i) => [['Front', 'Rechts', 'Achter', 'Links', 'Boven'][i], url] as [string, string | null | undefined]),
  ]
  const availableLightboxPreviews = finalLayerPreviews
    .filter((entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1].length > 0)
  const lightboxImage = lightboxIndex === null ? null : availableLightboxPreviews[lightboxIndex] ?? null
  const openLightbox = (label: string, src: string) => {
    const index = availableLightboxPreviews.findIndex(([itemLabel, itemSrc]) => itemLabel === label && itemSrc === src)
    if (index >= 0) setLightboxIndex(index)
  }
  const showPreviousLightboxImage = () => {
    setLightboxIndex((current) => {
      if (current === null || availableLightboxPreviews.length === 0) return current
      return (current - 1 + availableLightboxPreviews.length) % availableLightboxPreviews.length
    })
  }
  const showNextLightboxImage = () => {
    setLightboxIndex((current) => {
      if (current === null || availableLightboxPreviews.length === 0) return current
      return (current + 1) % availableLightboxPreviews.length
    })
  }
  const renderManifest = project.renderPacket?.manifest ?? project.renderPacketRecord?.scene_manifest
  renderManifestRef.current = renderManifest
  const manifestStatus = [
    { label: 'Camera', ready: Boolean(renderManifest?.camera?.position?.length && renderManifest?.camera?.target?.length) },
    { label: 'Ground', ready: Boolean(renderManifest?.groundPlane?.screenLine) },
    { label: 'Product bbox', ready: Boolean(renderManifest?.product?.screenBbox) },
    { label: 'Calibration', ready: Boolean(calibrationPreviewUrl) },
    { label: 'Light map', ready: Boolean(lightMapPreviewUrl) },
    { label: 'Depth', ready: Boolean(depthPreviewUrl) },
    { label: 'Mask', ready: Boolean(objectMaskUrl) },
  ]
  const lockedCameraInputs = [
    { label: 'Beauty camera', ready: Boolean(beautyPreviewUrl) },
    { label: 'Depth', ready: Boolean(depthPreviewUrl) },
    { label: 'Normal', ready: Boolean(normalPreviewUrl) },
    { label: 'Calibration', ready: Boolean(calibrationPreviewUrl) },
    { label: 'Light map', ready: Boolean(lightMapPreviewUrl) },
    { label: 'Mask', ready: Boolean(objectMaskUrl) },
    { label: 'Source', ready: Boolean(project.sourceImage?.src) },
    { label: 'Basic shape', ready: basicShapeReady },
    { label: 'Textured mesh', ready: texturedMeshReady },
    { label: 'Canonical', ready: Boolean(canonicalReference?.src) },
  ]
  const lockedCameraReady = Boolean(beautyPreviewUrl && calibrationPreviewUrl && lightMapPreviewUrl && depthPreviewUrl && normalPreviewUrl && renderManifest?.camera && renderManifest?.groundPlane && project.sourceImage?.src && canonicalReference?.src && !renderPacketStale)
  const activeRuns = providerStats?.runs.filter((run) => run.status === 'queued' || run.status === 'processing') ?? []
  const failedRuns = providerStats?.runs.filter((run) => run.status === 'failed') ?? []
  const approvedAngles = usableReferenceAngles
  const hasWeakReferenceCoverage = sourceReady && !project.canonicalSet && (
    approvedCount < 3 || !approvedAngles.has('left') || !approvedAngles.has('right') || (!approvedAngles.has('rear') && !approvedAngles.has('top'))
  )
  const approvedBackendViewIds = project.references
    .filter((view) => view.backendId && (view.status === 'user-approved' || view.status === 'user-edited' || view.status === 'observed'))
    .map((view) => view.backendId as string)
  const sceneStorageKey = useMemo(() => `huphe:product-studio:${project.id}:scene3d`, [project.id])

  function markRenderPacketStale() {
    if (!renderPacketReady) return
    setRenderPacketStale(true)
  }

  useEffect(() => {
    if (!initialImageSrc || project.sourceImage?.src) return
    setProject((prev) => ({
      ...prev,
      sourceImage: { name: 'Gekoppelde afbeelding', src: initialImageSrc, mimeType: 'image/*' },
      references: [
        { id: 'front', label: 'Front / bronfoto', status: 'observed', src: initialImageSrc },
        { id: 'left', label: 'Links', status: 'inferred' },
        { id: 'right', label: 'Rechts', status: 'inferred' },
        { id: 'rear', label: 'Achterkant', status: 'inferred' },
      ],
      activeStep: 'references',
      updatedAt: new Date().toISOString(),
    }))
  }, [initialImageSrc, project.sourceImage?.src])

  useEffect(() => {
    if (project.sourceImage?.src) return
    let dataUrl: string | null = null
    try { dataUrl = sessionStorage.getItem('huphe:create3d-image') } catch { /* ignore */ }
    if (!dataUrl) return
    try { sessionStorage.removeItem('huphe:create3d-image') } catch { /* ignore */ }
    const byteString = atob(dataUrl.split(',')[1])
    const mimeMatch = dataUrl.match(/^data:(image\/\w+);/)
    const mimeType = mimeMatch?.[1] ?? 'image/png'
    const ext = mimeType.split('/')[1] ?? 'png'
    const ab = new ArrayBuffer(byteString.length)
    const ia = new Uint8Array(ab)
    for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i)
    const file = new File([ab], `product.${ext}`, { type: mimeType })
    void handleImageFile(file)
  }, [])

  // Heropen een specifiek project via de projectkiezer
  useEffect(() => {
    let resumeId: string | null = null
    try {
      resumeId = sessionStorage.getItem('huphe:resume-project-id')
      if (resumeId) sessionStorage.removeItem('huphe:resume-project-id')
    } catch { /* ignore */ }
    if (!resumeId) return
    setProject((prev) => ({ ...prev, backendProject: { id: resumeId } as any }))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(project)) } catch { /* ignore */ }
  }, [project])

  useEffect(() => {
    const projectId = getStoredProjectId(project)
    if (!projectId || hydratedProjectIdRef.current === projectId) return
    hydratedProjectIdRef.current = projectId
    void hydrateLatestState(projectId, false)
  }, [project.backendProject?.id, project.id])


  const activeStudioMeshBase = activeStudioMeshUrl?.split('?')[0] ?? null
  useEffect(() => {
    if (!activeStudioMeshUrl) return
    if (textureDeletedRef.current && texturedMeshReady) return
    studioRef.current?.addModelFromUrl(activeStudioMeshUrl, texturedMeshReady ? 'Textured product' : 'Reconstructed product')
    if (texturedMeshReady) setRenderPacketStale(true)
  }, [activeStudioMeshBase, texturedMeshReady])

  useEffect(() => {
    const projectId = getStoredProjectId(project)
    if (!projectId) return
    void refreshProviderStats(projectId)
    void refreshVersionLists(projectId)
  }, [project.backendProject?.id, project.id])

  useEffect(() => {
    if (activeRuns.length === 0) return
    const projectId = getStoredProjectId(project)
    if (!projectId) return
    const timer = window.setInterval(() => {
      void hydrateLatestState(projectId, false)
      void refreshProviderStats(projectId)
    }, 5000)
    return () => window.clearInterval(timer)
  }, [activeRuns.length, project.backendProject?.id, project.id])

  useEffect(() => {
    if (!textureInProgress || !project.reconstruction?.id) return
    const reconstructionId = project.reconstruction.id
    const api = getProductStudioApi()
    if (!api) return
    const timer = window.setInterval(() => {
      api.getTextureStatus(reconstructionId)
        .then((result) => {
          if (!result?.ok || !result.texture) return
          const texture = result.texture as Partial<ReconstructionVersion>
          setProject((prev) => ({
            ...prev,
            reconstruction: prev.reconstruction?.id === reconstructionId
              ? { ...prev.reconstruction, ...texture }
              : prev.reconstruction,
          }))
          if (texture.texture_status === 'completed' || texture.texture_status === 'failed') {
            const projectId = getStoredProjectId(project)
            if (projectId) void hydrateLatestState(projectId, false)
          }
        })
        .catch(() => null)
    }, 3000)
    return () => window.clearInterval(timer)
  }, [textureInProgress, project.reconstruction?.id, project.backendProject?.id, project.id])

  // Sync camera when entering/leaving bgComposite mode so 3D aligns with the render photo
  useEffect(() => {
    const prev = prevOverlayRef.current
    prevOverlayRef.current = viewportOverlay

    const manifest = (splatShotManifestRef.current ?? renderManifestRef.current) as any
    if (!manifest?.camera?.position || !manifest?.camera?.target || !studioRef.current) return

    if (viewportOverlay === 'bgComposite') {
      // Herstel camera naar render-positie met originele FOV.
      studioRef.current.setCameraOrbit(manifest.camera.position, manifest.camera.target, manifest.camera.fov)
    }
  }, [viewportOverlay])

  async function hydrateLatestState(projectId = getStoredProjectId(project), showBusy = true) {
    if (!projectId) return
    const api = getProductStudioApi()
    if (!api) return
    if (showBusy) setBusy('Project synchroniseren...')
    try {
      const result = await api.getLatestState(projectId)
      if (!result?.ok) throw new Error(result?.error || 'Project synchroniseren mislukt.')
      const activeArchiveId = activeArchiveVersionId.current
      setProject((prev) => {
        const next = projectFromLatestState(prev, result)
        if (!activeArchiveId || prev.finalRenderRecord?.id !== activeArchiveId) return next

        // Een herstelde archief-render is bewust de actieve canvas-state.
        // Achtergrond-polling mag dan wel projectdata verversen, maar niet de canvas
        // terugduwen naar de nieuwste final render uit de database.
        return {
          ...next,
          finalRenderRecord: prev.finalRenderRecord,
          finalRender: prev.finalRender,
          renderPacketRecord: prev.renderPacketRecord,
          studioScene: prev.studioScene,
          activeStep: 'final',
        }
      })
      void refreshProviderStats(projectId)
      void refreshVersionLists(projectId)
    } catch (err: any) {
      setError(err?.message || 'Project synchroniseren mislukt.')
      hydratedProjectIdRef.current = null
    } finally {
      if (showBusy) setBusy(null)
    }
  }

  async function refreshProviderStats(projectId = getStoredProjectId(project)) {
    if (!projectId) return
    const api = getProductStudioApi()
    if (!api) return
    const result = await api.getProviderStats(projectId)
    if (result?.ok) {
      setProviderStats({ runs: result.runs ?? [], summary: result.summary })
    }
  }

  async function refreshVersionLists(projectId = getStoredProjectId(project)) {
    if (!projectId) return
    const api = getProductStudioApi()
    if (!api) return
    const [reconResult, renderResult] = await Promise.all([
      api.listReconstructions(projectId).catch(() => null),
      api.listFinalRenders(projectId).catch(() => null),
    ])
    if (reconResult?.ok) setReconstructionVersions((reconResult.reconstructions ?? []) as ReconstructionVersion[])
    if (renderResult?.ok) setFinalRenderVersions((renderResult.renders ?? []) as FinalRenderVersion[])
  }

  async function ensureBackendProject(): Promise<BackendProductProject> {
    if (project.backendProject) return project.backendProject
    const api = getProductStudioApi()
    if (!api) throw new Error('Product Studio API is nog niet beschikbaar.')
    const backendProject = assertOk<BackendProductProject>(
      await api.createProject({ name: project.name, outputAspectRatio: '1:1' }),
      'project',
    )
    setProject((prev) => ({
      ...prev,
      id: backendProject.id,
      name: backendProject.name,
      backendProject,
      updatedAt: backendProject.updated_at,
    }))
    return backendProject
  }

  async function refreshReferenceViews(projectId = project.backendProject?.id) {
    const api = getProductStudioApi()
    if (!api || !projectId) return
    const result = await api.listReferenceViews(projectId)
    if (!result?.ok) throw new Error(result?.error || 'Reference views laden mislukt.')
    const backendViews = (result.views ?? []) as BackendReferenceView[]
    setProject((prev) => {
      const hasObservedSourceView = backendViews.some((view) => view.provenance === 'observed' && (view.angle === 'front' || view.angle === 'hero'))
      const sourceReference = prev.sourceImage?.src && !hasObservedSourceView
        ? [{ id: 'front', label: 'Front / bronfoto', status: 'observed' as ReferenceStatus, src: prev.sourceImage.src }]
        : []
      return {
        ...prev,
        references: uniqueReferenceViews([...sourceReference, ...backendViews.map(backendViewToReference)]),
        activeStep: backendViews.length > 0 ? 'references' : prev.activeStep,
        updatedAt: new Date().toISOString(),
      }
    })
  }

  async function handleImageFile(file: File | null) {
    setError(null)
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setError('Kies een afbeelding als bronfoto.')
      return
    }
    setBusy('Uploaden...')
    try {
      const src = await readFileAsDataUrl(file)
      const backendProject = await ensureBackendProject()
      const api = getProductStudioApi()
      if (!api) throw new Error('Product Studio API is nog niet beschikbaar.')
      const asset = assertOk<SourceAsset>(
        await api.uploadSource({
          projectId: backendProject.id,
          fileBuffer: await file.arrayBuffer(),
          fileName: file.name,
          mimeType: file.type,
        }),
        'asset',
      )
      const observedViewResult = await api.registerSourceAsReference({
        projectId: backendProject.id,
        sourceAssetId: asset.id,
        angle: 'front',
      }).catch(() => null)
      const observedReference = observedViewResult?.ok && observedViewResult.view
        ? backendViewToReference(observedViewResult.view as BackendReferenceView)
        : { id: 'front', label: 'Front / bronfoto', status: 'observed' as ReferenceStatus, src: asset.url || src }
      setProject((prev) => ({
        ...prev,
        id: backendProject.id,
        backendProject,
        sourceAsset: asset,
        sourceImage: { name: file.name, src: asset.url || src, mimeType: file.type },
        references: [
          observedReference,
          { id: 'left', label: 'Links', status: 'inferred' },
          { id: 'right', label: 'Rechts', status: 'inferred' },
          { id: 'rear', label: 'Achterkant', status: 'inferred' },
        ],
        activeStep: 'references',
        updatedAt: new Date().toISOString(),
      }))
      setBusy('Normaliseren...')
      try {
        const normalizeResult = await api.normalizeInput({ projectId: backendProject.id, sourceAssetId: asset.id })
        if (normalizeResult?.basicProduct) {
          const basicProductAsset = normalizeResult.basicProduct as SourceAsset
          setProject((prev) => ({
            ...prev,
            basicProductAsset,
            updatedAt: new Date().toISOString(),
          }))
        }
        void hydrateLatestState(backendProject.id, false)
      } catch {
        // Basic Product is optional for this step; canonical views must keep using the original source/ref-look.
      }
      setBusy('Views genereren...')
      await api.generateReferenceViews({
        projectId: backendProject.id,
        sourceAssetId: asset.id,
        targetViews: ['left', 'right', 'rear'],
        productNotes: backendProject.notes,
      }).then((result) => {
        if (result?.ok) void hydrateLatestState(backendProject.id, false)
      }).catch(() => {})
    } catch (err: any) {
      if (!notifyIfCreditsRequired(err)) setError(err?.message || 'Upload mislukt.')
    } finally {
      setBusy(null)
    }
  }

  async function splitContactSheet(src: string): Promise<string[]> {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = reject
      img.src = src
    })
    const cellWidth = Math.floor(image.naturalWidth / 2)
    const cellHeight = Math.floor(image.naturalHeight / 2)
    const crops: string[] = []
    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < 2; col++) {
        const canvas = document.createElement('canvas')
        canvas.width = cellWidth
        canvas.height = cellHeight
        const context = canvas.getContext('2d')
        if (!context) continue
        context.drawImage(image, col * cellWidth, row * cellHeight, cellWidth, cellHeight, 0, 0, cellWidth, cellHeight)
        crops.push(canvas.toDataURL('image/png'))
      }
    }
    return crops
  }

  async function handleContactSheetFile(file: File | null) {
    setError(null)
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setError('Kies een afbeelding met een 2x2 contact sheet.')
      return
    }
    const sheetSrc = await readFileAsDataUrl(file)
    const crops = await splitContactSheet(sheetSrc)
    const source = project.sourceImage?.src
    setProject((prev) => ({
      ...prev,
      references: [
        { id: 'front', label: 'Front / bronfoto', status: source ? 'observed' : 'inferred', src: source ?? crops[0] },
        { id: 'left', label: 'Links', status: 'inferred', src: crops[1] },
        { id: 'right', label: 'Rechts', status: 'inferred', src: crops[2] },
        { id: 'rear', label: 'Achterkant', status: 'inferred', src: crops[3] },
      ],
      activeStep: 'references',
      updatedAt: new Date().toISOString(),
    }))
  }

  async function handleObjectMaskFile(file: File | null) {
    setFinalError(null)
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setFinalError('Kies een afbeelding als object-mask.')
      return
    }
    const api = getProductStudioApi()
    if (!api || !project.backendProject) {
      setFinalError('Upload eerst een bronfoto via de backend.')
      return
    }
    setBusy('Object-mask uploaden...')
    try {
      const dataUrl = await readFileAsDataUrl(file)
      const result = await api.uploadRenderPass({
        projectId: project.backendProject.id,
        passType: 'object-mask',
        dataUrl,
      })
      if (!result?.ok || !result.url) throw new Error(result?.error || 'Object-mask upload mislukt.')
      setProject((prev) => ({
        ...prev,
        objectMaskUrl: result.url,
        updatedAt: new Date().toISOString(),
      }))
    } catch (err: any) {
      setFinalError(err?.message || 'Object-mask upload mislukt.')
    } finally {
      setBusy(null)
    }
  }

  function approveReference(id: string) {
    const view = project.references.find((item) => item.id === id)
    if (view?.backendId) {
      const api = getProductStudioApi()
      void api?.updateViewStatus(view.backendId, 'active', 'user-approved').catch((err: any) => {
        setError(err?.message || 'View goedkeuren mislukt.')
      })
    }
    setProject((prev) => ({
      ...prev,
      references: prev.references.map((view) => view.id === id ? { ...view, status: 'user-approved', src: view.src ?? prev.sourceImage?.src } : view),
      updatedAt: new Date().toISOString(),
    }))
  }

  function rejectReference(id: string) {
    const view = project.references.find((item) => item.id === id)
    if (view?.backendId) {
      const api = getProductStudioApi()
      void api?.updateViewStatus(view.backendId, 'rejected').catch((err: any) => {
        setError(err?.message || 'View afwijzen mislukt.')
      })
    }
    setProject((prev) => ({
      ...prev,
      references: prev.references.filter((view) => view.id !== id),
      updatedAt: new Date().toISOString(),
    }))
  }

  async function generateBackendReferenceViews() {
    setError(null)
    if (!project.backendProject || !referenceInputAsset) {
      setError('Upload eerst een bronfoto via de backend.')
      return
    }
    const api = getProductStudioApi()
    if (!api) {
      setError('Product Studio API is nog niet beschikbaar.')
      return
    }
    setBusy('Views genereren...')
    try {
      const existingAngles = new Set(project.references.map((view) => view.angle ?? view.id))
      const targetViews = (['left', 'right', 'rear'] as Array<'left' | 'right' | 'rear'>)
        .filter((angle) => !existingAngles.has(angle))
      if (targetViews.length === 0) {
        setError('Alle standaardhoeken bestaan al. Gebruik het rondje op een kaart om die specifieke view te vervangen.')
        return
      }
      const result = await api.generateReferenceViews({
        projectId: project.backendProject.id,
        sourceAssetId: referenceInputAsset.id,
        targetViews,
        productNotes: project.backendProject.notes,
      })
      if (!result?.ok) throw new Error(result?.error || 'Views genereren mislukt.')
      await hydrateLatestState(project.backendProject.id, false)
    } catch (err: any) {
      if (!notifyIfCreditsRequired(err)) setError(err?.message || 'Views genereren mislukt.')
    } finally {
      setBusy(null)
    }
  }

  async function regenerateReferenceView(view: ReferenceView) {
    setError(null)
    if (!project.backendProject || !referenceInputAsset || !view.angle) {
      setError('Deze view kan nog niet opnieuw worden gegenereerd.')
      return
    }
    if (!['left', 'right', 'rear', 'top'].includes(view.angle)) {
      setError('De bronfoto zelf kan niet als AI-view worden vervangen.')
      return
    }
    const api = getProductStudioApi()
    if (!api) {
      setError('Product Studio API is nog niet beschikbaar.')
      return
    }
    setBusy(`${view.label} opnieuw genereren...`)
    try {
      if (view.backendId) {
        await api.updateViewStatus(view.backendId, 'superseded').catch(() => null)
      }
      const result = await api.generateReferenceViews({
        projectId: project.backendProject.id,
        sourceAssetId: referenceInputAsset.id,
        targetViews: [view.angle as 'left' | 'right' | 'rear' | 'top'],
        productNotes: project.backendProject.notes,
      })
      if (!result?.ok) throw new Error(result?.error || 'View opnieuw genereren mislukt.')
      await hydrateLatestState(project.backendProject.id, false)
    } catch (err: any) {
      if (!notifyIfCreditsRequired(err)) setError(err?.message || 'View opnieuw genereren mislukt.')
    } finally {
      setBusy(null)
    }
  }

  async function ensureCanonicalAndReconstruction(route: 'single-view' | 'multi-view' | 'primitive-proxy' = 'primitive-proxy', forceReconstruction = false): Promise<{ canonicalSet: CanonicalReferenceSet; reconstruction: ReconstructionVersion }> {
    const api = getProductStudioApi()
    if (!api) throw new Error('Product Studio API is nog niet beschikbaar.')
    if (!project.backendProject) throw new Error('Maak eerst een project aan.')
    if (!project.sourceImage?.src) throw new Error('Upload eerst een bronfoto.')
    if (route !== 'primitive-proxy' && !shapeInputUrl) {
      throw new Error('Basic shape ontbreekt nog. Wacht tot de grijze Basic Product klaar is voordat je TRELLIS start.')
    }

    let canonicalSet = project.canonicalSet
    if (!canonicalSet) {
      if (approvedBackendViewIds.length === 0) {
        throw new Error('Accepteer minimaal een gegenereerde reference view voordat je een canonical set maakt.')
      }
      canonicalSet = assertOk<CanonicalReferenceSet>(
        await api.createCanonicalSet({
          projectId: project.backendProject.id,
          viewIds: approvedBackendViewIds,
          coverage: approvedBackendViewIds.length >= 3 ? 'partial-multiview' : 'limited-single-view',
        }),
        'set',
      )
    }

    let reconstruction = forceReconstruction ? undefined : project.reconstruction
    if (!reconstruction) {
      reconstruction = assertOk<ReconstructionVersion>(
        await api.startReconstruction({
          projectId: project.backendProject.id,
          canonicalReferenceSetId: canonicalSet.id,
          primaryImageUrl: route === 'primitive-proxy' ? project.sourceImage.src : shapeInputUrl!,
          route,
        }),
        'reconstruction',
      )
    }

    const hadReconstruction = !!project.reconstruction
    setProject((prev) => ({
      ...prev,
      canonicalSet,
      reconstruction,
      activeStep: 'mesh',
      updatedAt: new Date().toISOString(),
    }))
    if (!hadReconstruction) {
      const bestMeshUrl = reconstruction.textured_mesh_url ?? reconstruction.mesh_url
      if (bestMeshUrl) {
        studioRef.current?.addModelFromUrl(bestMeshUrl, reconstruction.textured_mesh_url ? 'Textured product' : 'Reconstructed product')
      }
    }
    return { canonicalSet, reconstruction }
  }

  async function startMeshReview(route: 'single-view' | 'multi-view' | 'primitive-proxy' = 'primitive-proxy') {
    setError(null)
    setBusy(route === 'primitive-proxy' ? 'Proxy mesh maken...' : 'Reconstructie starten...')
    try {
      const result = await ensureCanonicalAndReconstruction(route)
      if (route !== result.reconstruction.route && !result.reconstruction.mesh_url) {
        setProject((prev) => ({ ...prev, reconstruction: undefined }))
        await ensureCanonicalAndReconstruction(route)
      }
      await hydrateLatestState(project.backendProject?.id, false)
    } catch (err: any) {
      if (!notifyIfCreditsRequired(err)) setError(err?.message || 'Reconstructie starten mislukt.')
    } finally {
      setBusy(null)
    }
  }

  async function regenerateMesh(route: 'single-view' | 'multi-view' | 'primitive-proxy') {
    setError(null)
    setBusy(route === 'primitive-proxy' ? 'Proxy opnieuw maken...' : 'Mesh opnieuw genereren...')
    try {
      const api = getProductStudioApi()
      if (project.reconstruction?.id && api) {
        await api.updateReconstructionStatus(project.reconstruction.id, 'rejected').catch(() => null)
      }
      const result = await ensureCanonicalAndReconstruction(route, true)
      if (result.reconstruction.mesh_url) {
        studioRef.current?.addModelFromUrl(result.reconstruction.mesh_url, 'Reconstructed product')
      }
      setRenderPacketStale(true)
      await hydrateLatestState(project.backendProject?.id, false)
    } catch (err: any) {
      if (!notifyIfCreditsRequired(err)) setError(err?.message || 'Mesh opnieuw genereren mislukt.')
    } finally {
      setBusy(null)
    }
  }

  async function setMeshStatus(status: 'approved' | 'rejected') {
    if (!project.reconstruction) return
    const api = getProductStudioApi()
    if (!api) {
      setError('Product Studio API is nog niet beschikbaar.')
      return
    }
    setBusy(status === 'approved' ? 'Mesh goedkeuren...' : 'Mesh afwijzen...')
    try {
      const result = await api.updateReconstructionStatus(project.reconstruction.id, status)
      if (!result?.ok) throw new Error(result?.error || 'Mesh status wijzigen mislukt.')
      setProject((prev) => ({
        ...prev,
        reconstruction: prev.reconstruction ? { ...prev.reconstruction, status } : prev.reconstruction,
        activeStep: status === 'approved' ? 'studio' : 'mesh',
        updatedAt: new Date().toISOString(),
      }))
      await hydrateLatestState(project.backendProject?.id, false)
    } catch (err: any) {
      setError(err?.message || 'Mesh status wijzigen mislukt.')
    } finally {
      setBusy(null)
    }
  }

  async function startTextureWrap(forceRetry = false) {
    textureDeletedRef.current = false
    const projectId = getStoredProjectId(project)
    const reconstructionId = project.reconstruction?.id
    if (!projectId || !reconstructionId) {
      setError('Maak eerst een mesh voordat je product texture maakt.')
      return
    }
    const api = getProductStudioApi()
    if (!api) {
      setError('Product Studio API is nog niet beschikbaar.')
      return
    }
    const sourceViewIds = project.canonicalSet?.view_ids?.length
      ? project.canonicalSet.view_ids
      : approvedBackendViewIds
    setBusy(forceRetry ? 'Texture opnieuw starten...' : 'Product texture voorbereiden...')
    setError(null)
    try {
      const result = await api.createTexturedMesh({ projectId, reconstructionVersionId: reconstructionId, sourceViewIds })
      if (!result?.ok) throw new Error(result?.error || 'Texture wrapping starten mislukt.')
      setProject((prev) => ({
        ...prev,
        reconstruction: prev.reconstruction
          ? {
              ...prev.reconstruction,
              texture_status: 'pending',
              texture_error: null,
              texture_source_view_ids: sourceViewIds,
            }
          : prev.reconstruction,
      }))
      await hydrateLatestState(projectId, false)
    } catch (err: any) {
      setError(err?.message || 'Texture wrapping starten mislukt.')
    } finally {
      setBusy(null)
    }
  }

  function resetProject() {
    setProject(createProject())
    setRenderPacketStale(false)
    setError(null)
    setFinalError(null)
  }

  async function runOrbitTest(force = false) {
    const api = getProductStudioApi()
    if (!api || !project.backendProject) return
    const imageUrl = backgroundPlateUrl ?? project.sourceImage?.src
    if (!imageUrl) {
      setOrbitTest({ phase: 'error', step: '', progress: 0, renderVersionId: project.finalRenderRecord?.id, error: 'Geen achtergrond foto geselecteerd.' })
      return
    }
    const renderVersionId = project.finalRenderRecord?.id
    if (!force) {
      const check = await api.checkOrbitVideo({ projectId: project.backendProject.id, renderVersionId, model: orbitModel })
      if (check.exists) {
        setOrbitConfirmOpen(true)
        return
      }
    }
    const modelLabel = 'Seedance 2.0'
    setOrbitTest({ phase: 'running', step: `Video genereren via ${modelLabel}...`, progress: 2, renderVersionId })
    setAssetsPrep({ phase: 'idle', step: '', progress: 0 })
    setSplatTraining({ phase: 'idle', step: '', progress: 0 })
    try {
      const result = await api.testOrbitSplat({ projectId: project.backendProject.id, renderVersionId, imageUrl, arcDegrees: 270, force, model: orbitModel, poseMethod, videoOnly: true })
      if (!result.ok) {
        setOrbitTest({ phase: 'error', step: '', progress: 0, renderVersionId, error: result.error ?? 'Onbekende fout.' })
        return
      }
      setOrbitTest({ phase: 'done', step: '', progress: 100, renderVersionId, videoUrl: result.videoUrl, orbitRunId: result.orbitRunId })
    } catch (err: any) {
      setOrbitTest({ phase: 'error', step: '', progress: 0, renderVersionId, error: err?.message ?? 'Orbit test mislukt.' })
    }
  }

  async function runPoseOnly() {
    const api = getProductStudioApi()
    if (!api || !project.backendProject) return
    const imageUrl = backgroundPlateUrl ?? project.sourceImage?.src ?? ''
    const renderVersionId = project.finalRenderRecord?.id
    const methodLabel = 'VGGT · RunPod'
    setOrbitTest({ phase: 'running', step: `Pose-analyse starten (${methodLabel})...`, progress: 2, renderVersionId })
    try {
      const result = await api.testOrbitSplat({ projectId: project.backendProject.id, renderVersionId, imageUrl, model: orbitModel, poseOnly: true, poseMethod })
      if (!result.ok) {
        setOrbitTest({ phase: 'error', step: '', progress: 0, renderVersionId, error: result.error ?? 'Onbekende fout.' })
        return
      }
      setOrbitTest({ phase: 'done', step: '', progress: 100, renderVersionId, colmap: result.colmap, videoUrl: result.videoUrl ?? undefined, orbitRunId: result.orbitRunId })
    } catch (err: any) {
      setOrbitTest({ phase: 'error', step: '', progress: 0, renderVersionId, error: err?.message ?? 'Pose-analyse mislukt.' })
    }
  }

  async function runPrepareAssets() {
    const api = getProductStudioApi()
    if (!api || !project.backendProject) return
    const renderVersionId = project.finalRenderRecord?.id
    setAssetsPrep({ phase: 'running', step: 'Assets voorbereiden...', progress: 0 })
    setSplatTraining({ phase: 'idle', step: '', progress: 0 })
    try {
      const result = await api.prepareAssets({ projectId: project.backendProject.id, renderVersionId })
      if (!result.ok) {
        setAssetsPrep({ phase: 'error', step: '', progress: 0, error: result.error ?? 'Voorbereiding mislukt.' })
        return
      }
      setAssetsPrep({ phase: 'done', step: '', progress: 100, colmap: result.colmap, sampleClayUrls: result.sampleClayUrls })
      // Zet orbitRunId over naar orbitTest als die er al stond
      if (result.orbitRunId) {
        setOrbitTest((prev) => ({ ...prev, orbitRunId: result.orbitRunId }))
      }
    } catch (err: any) {
      setAssetsPrep({ phase: 'error', step: '', progress: 0, error: err?.message ?? 'Assets voorbereiding mislukt.' })
    }
  }

  async function startBakeMode() {
    if (!project.backendProject?.id) return
    const api = getProductStudioApi()
    if (!api) return

    const projectId = project.backendProject.id
    const frontPhotoUrl = backgroundPlateUrl ?? project.sourceImage?.src
    if (!frontPhotoUrl) {
      setBakeProgress({ phase: 'error', currentFrame: 0, totalFrames: 0, error: 'Geen achtergrond foto gevonden.' })
      return
    }

    const orbitState = studioRef.current?.getSceneControls()?.getOrbitState()
    const target: [number, number, number] = orbitState?.target ?? [0, 0.5, 0]
    const camPos = orbitState?.position ?? [0, 2, 4]
    const dist = Math.sqrt(
      (camPos[0] - target[0]) ** 2 +
      (camPos[1] - target[1]) ** 2 +
      (camPos[2] - target[2]) ** 2,
    )

    // Probe bake: klein en snel debuggen voordat we de volledige ronde draaien.
    const BAKE_PROBE_FRAME_LIMIT = 6
    // Spiraal-poses: klein van stap, elke pose grenst aan gebouwde geometrie
    const spiralPoses = computeSpiralPoses(target, dist).slice(0, BAKE_PROBE_FRAME_LIMIT)
    const TOTAL = spiralPoses.length
    const sceneDescription = project.finalRenderRecord?.prompt?.trim()
    const prompt = [
      sceneDescription ? `Scene description: ${sceneDescription}` : 'Scene description: the same existing product photography environment.',
      '',
      'Inpaint only the masked missing area.',
      'Continue the existing scene exactly.',
      'Match the surrounding perspective, lighting, materials, colors and texture.',
      'Do not change any unmasked pixels.',
      'Do not add new objects, people, products, text or focal elements.',
      'Fill the hole as a seamless natural continuation of the current environment.',
      'Photorealistic.',
    ].join('\n')

    setBakeProgress({ phase: 'baking', currentFrame: 0, totalFrames: TOTAL })
    try {
      await api.clearBakeCache({ projectId })

      // Fase 0: Front-frame capturen voor seed mesh
      const frontFrame = await studioRef.current?.captureKeyframe(camPos, target)
      if (!frontFrame) throw new Error('Front frame capture mislukt.')

      const seedResult = await api.buildSeedMesh({
        projectId,
        frontPhotoUrl,
        depthKnownDataUrl: frontFrame.depthKnown,
        maskHoleDataUrl: frontFrame.maskHole,
        manifest: {
          camera: {
            near: frontFrame.manifest.camera.near,
            far: frontFrame.manifest.camera.far,
            projectionMatrix: frontFrame.manifest.camera.projectionMatrix,
            viewMatrix: frontFrame.manifest.camera.viewMatrix,
          },
          viewport: {
            width: frontFrame.manifest.viewport.width,
            height: frontFrame.manifest.viewport.height,
            fovScale: frontFrame.manifest.viewport.fovScale,
          },
        },
      })
      if (!seedResult?.ok) throw new Error(seedResult?.error ?? 'Seed mesh bouwen mislukt.')

      // Seed mesh in viewport laden — volgende captures zien de achtergrond
      setEnvMeshUrls([seedResult.seedMeshUrl])
      setEnvMappingEnabled(true)
      await sleep(1500)

      // Spiraal-loop
      for (let i = 0; i < spiralPoses.length; i++) {
        setBakeProgress({ phase: 'baking', currentFrame: i + 1, totalFrames: TOTAL })

        const frame = await studioRef.current?.captureKeyframe(spiralPoses[i].position, spiralPoses[i].target)
        if (!frame) throw new Error(`Frame ${i} capture mislukt.`)

        const result = await api.bakeKeyframe({
          projectId,
          keyframeIndex: i,
          rgbPartialDataUrl: frame.rgbPartial,
          maskHoleDataUrl: frame.maskHole,
          depthKnownDataUrl: frame.depthKnown,
          manifest: {
            camera: {
              near: frame.manifest.camera.near,
              far: frame.manifest.camera.far,
              projectionMatrix: frame.manifest.camera.projectionMatrix,
              viewMatrix: frame.manifest.camera.viewMatrix,
            },
            viewport: {
              width: frame.manifest.viewport.width,
              height: frame.manifest.viewport.height,
              fovScale: frame.manifest.viewport.fovScale,
            },
            prompt,
          },
        })
        if (!result?.ok) throw new Error(result?.error ?? `Frame ${i} bake mislukt.`)

        // Geaccumuleerde mesh terugvoeren in renderer vóór volgende capture
        if (result.accumulatedMeshUrl) {
          setEnvMeshUrls([result.accumulatedMeshUrl])
          await sleep(800)
        }
      }

      // Finalize: sla op als permanente env mesh
      const finalResult = await api.finalizeBake({ projectId })
      if (!finalResult?.ok) throw new Error(finalResult?.error ?? 'Bake finaliseren mislukt.')

      setEnvMeshUrls([finalResult.meshUrl])
      setBakeProgress({ phase: 'done', currentFrame: TOTAL, totalFrames: TOTAL })
    } catch (err: any) {
      setBakeProgress({ phase: 'error', currentFrame: 0, totalFrames: TOTAL, error: err.message })
    } finally {
      if (orbitState) studioRef.current?.setCameraOrbit(orbitState.position, orbitState.target)
    }
  }

  function sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms))
  }

  function computeSpiralPoses(
    center: [number, number, number],
    distance: number,
    topElevationDeg = 25,
  ): Array<{ position: [number, number, number]; target: [number, number, number] }> {
    function poseAt(elDeg: number, azDeg: number): { position: [number, number, number]; target: [number, number, number] } {
      const elRad = (elDeg * Math.PI) / 180
      const azRad = (azDeg * Math.PI) / 180
      return {
        position: [
          center[0] + distance * Math.cos(elRad) * Math.sin(azRad),
          center[1] + distance * Math.sin(elRad),
          center[2] + distance * Math.cos(elRad) * Math.cos(azRad),
        ],
        target: center,
      }
    }
    const poses: Array<{ position: [number, number, number]; target: [number, number, number] }> = []
    for (let az = 15; az <= 165; az += 15) poses.push(poseAt(0, az))
    for (let az = -15; az >= -165; az -= 15) poses.push(poseAt(0, az))
    for (const az of [0, 60, -60, 120, -120]) poses.push(poseAt(topElevationDeg, az))
    return poses
  }

  async function captureRenderPacket(promptOverride?: string) {
    activeArchiveVersionId.current = null
    splatShotManifestRef.current = null
    const packet = await studioRef.current?.captureRenderPacketPreview()
    if (!packet?.beauty && !packet?.passes) {
      setFinalError('Kan nog geen preview uit de studio maken.')
      return
    }
    setFinalError(null)
    setBusy('Renderpacket opslaan...')
    try {
      const api = getProductStudioApi()
      if (!api) throw new Error('Product Studio API is nog niet beschikbaar.')
      if (!project.backendProject) throw new Error('Maak eerst een project aan.')
      const { canonicalSet, reconstruction } = await ensureCanonicalAndReconstruction()

      const uploads = await Promise.all([
        packet.beauty ? api.uploadRenderPass({ projectId: project.backendProject.id, passType: 'beauty', dataUrl: packet.beauty }) : Promise.resolve(null),
        packet.passes?.calibration ? api.uploadRenderPass({ projectId: project.backendProject.id, passType: 'calibration', dataUrl: packet.passes.calibration }) : Promise.resolve(null),
        packet.passes?.mask ? api.uploadRenderPass({ projectId: project.backendProject.id, passType: 'object-mask', dataUrl: packet.passes.mask }) : Promise.resolve(null),
        packet.passes?.light ? api.uploadRenderPass({ projectId: project.backendProject.id, passType: 'light-map', dataUrl: packet.passes.light }) : Promise.resolve(null),
        packet.passes?.depth ? api.uploadRenderPass({ projectId: project.backendProject.id, passType: 'depth', dataUrl: packet.passes.depth }) : Promise.resolve(null),
        packet.passes?.normal ? api.uploadRenderPass({ projectId: project.backendProject.id, passType: 'normal', dataUrl: packet.passes.normal }) : Promise.resolve(null),
        packet.passes?.perspective ? api.uploadRenderPass({ projectId: project.backendProject.id, passType: 'perspective', dataUrl: packet.passes.perspective }) : Promise.resolve(null),
      ])
      const [beautyUpload, calibrationUpload, objectMaskUpload, lightMapUpload, depthUpload, normalUpload, perspectiveUpload] = uploads
      if (beautyUpload && !beautyUpload.ok) throw new Error(beautyUpload.error || 'Beauty upload mislukt.')
      if (calibrationUpload && !calibrationUpload.ok) throw new Error(calibrationUpload.error || 'Calibration upload mislukt.')
      if (objectMaskUpload && !objectMaskUpload.ok) throw new Error(objectMaskUpload.error || 'Object-mask upload mislukt.')
      if (lightMapUpload && !lightMapUpload.ok) throw new Error(lightMapUpload.error || 'Light-map upload mislukt.')
      if (depthUpload && !depthUpload.ok) throw new Error(depthUpload.error || 'Depth upload mislukt.')
      if (normalUpload && !normalUpload.ok) throw new Error(normalUpload.error || 'Normal upload mislukt.')
      if (perspectiveUpload && !perspectiveUpload.ok) throw new Error(perspectiveUpload.error || 'Perspective upload mislukt.')

      if (packet.manifest?.camera) {
        lastCameraParamsRef.current = {
          projectionMatrix: packet.manifest.camera.projectionMatrix,
          viewMatrix: packet.manifest.camera.viewMatrix,
          near: packet.manifest.camera.near,
          far: packet.manifest.camera.far,
          width: packet.manifest.viewport.width,
          height: packet.manifest.viewport.height,
          fovScale: packet.manifest.viewport.fovScale,
        }
      }

      const scene = studioRef.current?.getScene()
      if (!scene) throw new Error('Kan de 3D scene niet lezen.')
      const scenePayload = buildSceneSavePayload(scene)

      const studioScene = assertOk<StudioSceneVersion>(
        await api.saveScene({
          projectId: project.backendProject.id,
          reconstructionVersionId: reconstruction.id,
          camera: scenePayload.camera,
          lights: scenePayload.lights,
          productTransform: scenePayload.productTransform,
          environment: scenePayload.environment,
          output: {
            ...scenePayload.output,
            sceneManifest: packet.manifest,
          },
        }),
        'scene',
      )

      const renderPacketRecord = assertOk<RenderPacket>(
        await api.createRenderPacket({
          projectId: project.backendProject.id,
          canonicalReferenceSetId: canonicalSet.id,
          reconstructionVersionId: reconstruction.id,
          studioSceneVersionId: studioScene.id,
          beautyUrl: beautyUpload?.url ?? packet.beauty ?? packet.passes?.textured,
          objectMaskUrl: objectMaskUpload?.url ?? objectMaskUrl,
          depthUrl: depthUpload?.url,
          normalUrl: normalUpload?.url,
          calibrationUrl: calibrationUpload?.url,
          lightMapUrl: lightMapUpload?.url,
          perspectiveUrl: perspectiveUpload?.url,
          sceneManifest: packet.manifest ?? undefined,
        }),
        'packet',
      )

      setProject((prev) => ({
        ...prev,
        canonicalSet,
        reconstruction,
        studioScene,
        renderPacketRecord,
        renderPacket: packet,
        activeStep: 'final',
        updatedAt: new Date().toISOString(),
      }))
      setRenderPacketStale(false)

      // Stap 1: product layer genereren
      setBusy('Product layer genereren...')
      const plResult = await api.generateProductLayer({
        projectId: project.backendProject.id,
        renderPacketId: renderPacketRecord.id,
      })
      if (!plResult?.ok) {
        setFinalError(plResult?.error || 'Product layer genereren mislukt.')
        await hydrateLatestState(project.backendProject.id, false)
        return
      }

      if (backgroundLocked && project.finalRenderRecord?.background_plate_url) {
        // Locked modus: hergebruik bestaande achtergrond, composiet maken met nieuwe product layer
        setBusy('Composiet maken...')
        const existingBgUrl = project.finalRenderRecord.background_plate_url as string
        const newPlUrl = (plResult as any).productLayerUrl as string | undefined
        if (newPlUrl && (api as any).composeLockedView) {
          const composeResult = await (api as any).composeLockedView({
            projectId: project.backendProject.id,
            renderPacketId: renderPacketRecord.id,
            backgroundPlateUrl: existingBgUrl,
            productLayerUrl: newPlUrl,
            prompt: project.finalRender?.prompt ?? '',
          })
          if (composeResult?.ok && composeResult.version) {
            const v = composeResult.version as FinalRenderVersion
            setProject((prev) => ({
              ...prev,
              finalRenderRecord: v,
              finalRender: { prompt: v.prompt ?? prev.finalRender?.prompt ?? '', src: composeResult.compositeUrl, createdAt: v.created_at },
              activeStep: 'final',
              updatedAt: new Date().toISOString(),
            }))
            setFinalRenderVersions((prev) => [v, ...prev])
          }
        }
        triggerAiDepthExtraction(existingBgUrl)
        setViewportOverlay('composite')
        await hydrateLatestState(project.backendProject.id, false)
      } else {
        // Open modus: genereer nieuwe achtergrond
        const prompt = promptOverride || promptBarRef.current?.getValue() || project.finalRender?.prompt || ''
        if (!prompt) {
          setFinalError('Voer een prompt in voor de achtergrond.')
          await hydrateLatestState(project.backendProject.id, false)
          return
        }
        if (!promptOverride) promptBarRef.current?.clearValue()
        setBusy('Achtergrond genereren...')
        setFinalLoading(true)
        const finalResult = await api.generateFinalRender({
          projectId: project.backendProject.id,
          renderPacketId: renderPacketRecord.id,
          prompt,
          preservationPolicy: project.preservationPolicy,
          resolution: '2K',
        })
        const render = assertOk<FinalRenderVersion>(finalResult, 'render')
        const renderWithScene: FinalRenderVersion = finalResult.sceneUrl
          ? { ...render, scene_url: finalResult.sceneUrl, metadata: { ...(render.metadata ?? {}), scene_url: finalResult.sceneUrl } }
          : render
        if (!render.output_url) throw new Error('Final render is opgeslagen zonder output URL.')
        setProject((prev) => ({
          ...prev,
          finalRenderRecord: renderWithScene,
          finalRender: { prompt: render.prompt ?? prompt, src: render.output_url as string, createdAt: render.created_at },
          activeStep: 'final',
          updatedAt: new Date().toISOString(),
        }))
        const depthSource = (finalResult.backgroundPlateUrl ?? render.background_plate_url ?? render.output_url) as string
        triggerAiDepthExtraction(depthSource)
        setFinalLoading(false)
        setViewportOverlay('composite')
      }
      await hydrateLatestState(project.backendProject.id, false)
    } catch (err: any) {
      if (!notifyIfCreditsRequired(err)) setFinalError(err?.message || 'Renderpacket opslaan mislukt.')
    } finally {
      setBusy(null)
      setFinalLoading(false)
    }
  }

  async function restoreRenderState(version: FinalRenderVersion) {
    console.log('[restore] aangeroepen — version.id:', version.id, 'render_packet_id:', version.render_packet_id)
    const api = getProductStudioApi()
    if (!api || !(api as any).restoreRenderState) {
      console.warn('[restore] gestopt: api ontbreekt of restoreRenderState niet beschikbaar', { api: !!api, hasMethod: !!(api as any)?.restoreRenderState })
      return
    }

    // Sla huidige model-transform op vóór we wisselen
    const prevId = activeArchiveVersionId.current
    if (prevId) {
      const controls = studioRef.current?.getSceneControls()
      const productObj = controls?.scene.objects.find((o) => o.type === 'gltf')
      if (productObj) {
        archiveTransformCache.current[prevId] = {
          position: productObj.position,
          rotation: productObj.rotation,
          scale: productObj.scale,
        }
      }
    }
    activeArchiveVersionId.current = version.id
    // Wis huidige marble direct — wordt hersteld door loadSceneAlignment of expliciete checkOrbitVideo
    setSplatAlignment(null)
    setSplatBaseAlignment(null)
    setOrbitTest({ phase: 'idle', step: '', progress: 0, renderVersionId: version.id })
    setSplatTraining({ phase: 'idle', step: '', progress: 0 })
    setOrbitVideoExpanded(false)

    try {
      const result = await (api as any).restoreRenderState({ renderPacketId: version.render_packet_id })
      console.log('[restore] IPC result:', result?.ok, result?.error)
      if (!result?.ok) return

      const packet = result.packet as RenderPacket
      const scene = result.scene as StudioSceneVersion | null
      const manifest = packet.scene_manifest as any
      const shotManifest = manifest
      splatShotManifestRef.current = shotManifest
      let restoredProductSourceTransform: ArchiveProductTransform | null = null
      let restoredProductTransform: ArchiveProductTransform | null = null

      // Het renderpacket bewaart de live camera waarmee deze specifieke foto is
      // opgebouwd. Die camera is ook het projectieanker van de gekoppelde splat.
      if (shotManifest?.camera?.position && shotManifest?.camera?.target) {
        studioRef.current?.setCameraOrbit(
          shotManifest.camera.position,
          shotManifest.camera.target,
          shotManifest.camera.fov,
        )
      }

      // De studioscene is de versiegebonden bron voor de producttransform. Een
      // tijdelijke editorcache van een eerdere sessie mag een archiefshot niet
      // overschrijven; anders staat de wereld goed maar het product verkeerd.
      if (scene?.product_transform && studioRef.current) {
        const controls = studioRef.current.getSceneControls()
        if (controls) {
          const productObj = controls.scene.objects.find((o) => o.type === 'gltf')
          if (productObj) {
            restoredProductSourceTransform = scene.product_transform as ArchiveProductTransform
            const pt = archiveProductTransform(manifest, restoredProductSourceTransform)
            restoredProductTransform = pt
            if (pt.position) controls.onObjectTransformed(productObj.id, pt.position, pt.rotation ?? productObj.rotation, pt.scale ?? productObj.scale)
          }
        }
      } else {
        const cached = archiveTransformCache.current[version.id]
        const controls = studioRef.current?.getSceneControls()
        const productObj = controls?.scene.objects.find((o) => o.type === 'gltf')
        if (cached && controls && productObj) {
          controls.onObjectTransformed(productObj.id, cached.position, cached.rotation, cached.scale)
        }
      }

      // Set this version as active and switch to composite view
      setProject((prev) => ({
        ...prev,
        finalRenderRecord: version,
        finalRender: { prompt: version.prompt ?? '', src: version.output_url as string, createdAt: version.created_at },
        renderPacketRecord: packet,
        studioScene: scene ?? prev.studioScene,
        activeStep: 'final',
        updatedAt: new Date().toISOString(),
      }))
      setViewportOverlay('composite')
      setRightTab('studio')
      setRenderPacketStale(false)

      // Restore lock state based on version metadata
      const meta = (version.layer_metadata ?? {}) as Record<string, unknown>
      const shouldLock = Boolean(meta.env_views_ready || meta.locked_view)
      setBackgroundLocked(shouldLock)

      // If locked, restore the env mesh and load env views
      if (shouldLock) {
        let meshUrl = meta.env_mesh_url as string | undefined
        if (!meshUrl) {
          const bgUrl = version.background_plate_url ?? meta.env_source_background
          const sibling = finalRenderVersions.find((v) => {
            const m = (v.layer_metadata ?? {}) as Record<string, unknown>
            return m.env_mesh_url && (m.env_source_background === bgUrl || v.background_plate_url === bgUrl)
          })
          meshUrl = (sibling?.layer_metadata as any)?.env_mesh_url
        }
        if (meshUrl) {
          setEnvMeshUrls((prev) => prev.includes(meshUrl!) ? prev : [...prev, meshUrl!])
        }
        // Load env view thumbnails
        const bgUrl = (meta.env_source_background ?? version.background_plate_url) as string
        if (bgUrl && project.backendProject) {
          const envApi = getProductStudioApi()
          if (envApi && (envApi as any).getEnvViews) {
            ;(envApi as any).getEnvViews({ projectId: project.backendProject.id, backgroundPlateUrl: bgUrl })
              .then((r: any) => {
                if (r?.ok && r.viewUrls) setEnvViewUrls(r.viewUrls)
                if (r?.panoramaUrl) setEnvPanoramaUrl(r.panoramaUrl)
              })
          }
        }
      } else {
        setEnvViewUrls([])
        setEnvPanoramaUrl(null)
      }

      // Trigger depth extraction for env mesh
      const depthSource = (version.background_plate_url ?? version.output_url) as string
      if (depthSource) triggerAiDepthExtraction(depthSource)

      // Laad splat alleen als deze archieffoto gekoppeld is aan de getrainde 3D omgeving.
      // Gebruik expliciete IPC-calls (niet het reactieve checkOrbitVideo-effect) want dat effect
      // vuurt niet opnieuw als de renderVersionId niet veranderd is (zelfde foto als huidig project).
      const projectId = project.backendProject?.id
      if (projectId) {
        const splatApi = getProductStudioApi()
        const alignRestoredProductToSplat = async (alignment: SplatAlignment) => {
          const maskUrl = (packet as any).object_mask_url
            ?? project.objectMaskUrl
            ?? project.objectMaskAsset?.url
          if (!maskUrl || !restoredProductSourceTransform || !restoredProductTransform) return
          const productFit = await estimateMaskedSplatSurfaceDepth(alignment, shotManifest, maskUrl)
          if (productFit == null || activeArchiveVersionId.current !== version.id) return
          const depthCorrected = moveArchiveProductToSplatDepth(
            shotManifest,
            restoredProductSourceTransform,
            restoredProductTransform,
            productFit,
          )
          const controls = studioRef.current?.getSceneControls()
          const productObj = controls?.scene.objects.find((object) => object.type === 'gltf')
          if (controls && productObj && depthCorrected.position) {
            controls.onObjectTransformed(
              productObj.id,
              depthCorrected.position,
              depthCorrected.rotation ?? productObj.rotation,
              depthCorrected.scale ?? productObj.scale,
            )
          }
        }
        splatApi?.loadSceneAlignment?.({ projectId, renderVersionId: version.id }).then((res) => {
          if (res?.ok && res.alignment?.splatUrl && res.renderVersionId === version.id) {
            // Opgeslagen alignment gevonden.
            // Marble-alignments altijd herberekenen vanuit manifest-cameraData — de shot
            // transform is deterministisch en de opgeslagen quaternion kan verouderd zijn
            // (bv. Q_x180-fout of oud Object3D.lookAt). splatToShot in de save wordt genegeerd.
            const base = res.baseAlignment ?? fallbackImportBaseAlignment(res.alignment)
            // Verrijk de alignment met metricScaleFactor uit marbleGen als die ontbreekt in scene.json
            const enriched: SplatAlignment = (res.alignment.source === 'marble' && res.alignment.metricScaleFactor == null)
              ? { ...res.alignment, metricScaleFactor: marbleGen.metricScaleFactor ?? undefined, groundPlaneOffset: res.alignment.groundPlaneOffset ?? marbleGen.groundPlaneOffset ?? undefined }
              : res.alignment
            const alignment = enriched.source === 'marble'
              ? applyMarbleShotTransform(enriched, shotManifest, base)
              : enriched
            // Voor marble is het reset-anker de berekende shot-uitlijning (niet de ruwe COLMAP base).
            // Zo gaat Reset terug naar de automatisch berekende positie, niet naar de import-state.
            applySplatAlignment(alignment, enriched.source === 'marble' ? alignment : base)
            void alignRestoredProductToSplat(alignment)
          } else {
            setSplatBaseAlignment(null)
            setSplatAlignment(null)
            // Geen opgeslagen alignment — controleer of dit orbit-versie een marble heeft.
            // checkOrbitVideo is al uitgevoerd door het reactieve effect, maar dat
            // effect kan niet opnieuw vuren als de version-ID niet veranderd is.
            // Vandaar expliciete call hier.
            splatApi?.checkOrbitVideo?.({ projectId, renderVersionId: version.id, model: orbitModel }).then((orbitRes) => {
              if (orbitRes?.marble?.splatPath) {
                const marbleSplatUrl = `huphe://file/${encodeURIComponent(orbitRes.marble.splatPath)}`
                const baseAlignmentForShot: SplatAlignment = {
                  splatUrl: marbleSplatUrl,
                  spzPath: orbitRes.marble.spzPath,
                  source: 'marble',
                  renderVersionId: version.id,
                  orbitRunId: orbitRes.marble.orbitRunId ?? orbitRes.orbitRunId ?? undefined,
                  worldId: orbitRes.marble.worldId,
                  route: orbitRes.marble.route,
                  metricScaleFactor: orbitRes.marble.metricScaleFactor,
                  groundPlaneOffset: orbitRes.marble.groundPlaneOffset,
                  marbleMeta: {
                    panoUrl: orbitRes.marble.panoUrl,
                    colliderMeshUrl: orbitRes.marble.colliderMeshUrl,
                    totalCredits: orbitRes.marble.totalCredits,
                  },
                  position: [0, 1.5, 4] as [number, number, number],
                  quaternion: [0, 0, 0, 1] as [number, number, number, number],
                  fovY: 60, width: 1920, height: 1080,
                  sceneCenter: [0, 0, 0] as [number, number, number],
                  groupPositionY: 0,
                  groupScale: 1,
                  bubbleRadius: DEFAULT_BUBBLE_RADIUS,
                  bubbleFeather: DEFAULT_BUBBLE_FEATHER,
                }
                const nextAlignment = applyMarbleShotTransform(baseAlignmentForShot, shotManifest, baseAlignmentForShot)
                setSplatBaseAlignment((prev) => prev ?? cloneSplatAlignment(nextAlignment))
                setSplatAlignment((prev) => prev ?? nextAlignment) // loadSceneAlignment al ingesteld
                void alignRestoredProductToSplat(nextAlignment)
              }
            }).catch(() => {})
          }
        }).catch(() => {})
      }
    } catch (err: any) {
      console.error('[restore] Failed:', err.message)
    }
  }

  function triggerAiDepthExtraction(imageUrl: string) {
    const api = getProductStudioApi()
    if (!api || !(api as any).extractDepth) return
    setAiDepthUrl(null)

    let camParams = lastCameraParamsRef.current
    if (!camParams) {
      const manifest = project.renderPacket?.manifest ?? project.renderPacketRecord?.scene_manifest
      if (manifest?.camera && manifest?.viewport) {
        camParams = {
          projectionMatrix: manifest.camera.projectionMatrix,
          viewMatrix: manifest.camera.viewMatrix,
          near: manifest.camera.near,
          far: manifest.camera.far,
          width: manifest.viewport.width,
          height: manifest.viewport.height,
          fovScale: manifest.viewport.fovScale,
        }
      }
    }

    console.log('[depth] triggerAiDepthExtraction camParams:', !!camParams, camParams ? `proj length=${camParams.projectionMatrix?.length} w=${camParams.width}` : 'null')
    ;(api as any).extractDepth({
      imageUrl,
      projectId: project.backendProject?.id,
      cameraParams: camParams ?? undefined,
    }).then((result: any) => {
      if (result?.ok && result.depthDataUrl) {
        setAiDepthUrl(result.depthDataUrl)
        console.log('[depth] AI depth map ready')
      }
      if (result?.ok && result.meshUrl) {
        setEnvMeshUrls((prev) => [...prev, result.meshUrl])
        console.log('[depth] Environment mesh added:', result.meshUrl)
      }
      if (!result?.ok) console.error('[depth] extraction failed:', result?.error)
    }).catch((err: any) => console.error('[depth] extraction failed:', err))
  }

  async function handleFinalPrompt(prompt: string) {
    activeArchiveVersionId.current = null
    if (renderPacketStale) {
      setFinalError('De studio preview is verouderd. Klik eerst op Update preview zodat de huidige camera en productpositie worden gebruikt.')
      return
    }
    if (meshReady && !texturedMeshReady) {
      setFinalError('Maak eerst een textured mesh en klik daarna op Update preview. Deze sprint test route 2: de Beauty moet al print en materiaal uit 3D bevatten.')
      return
    }
    const beauty = project.renderPacket?.beauty ?? project.renderPacket?.passes?.textured
    if (!beauty && !project.renderPacketRecord?.beauty_url) {
      setFinalError('Maak eerst een preview uit de studio.')
      return
    }
    setFinalLoading(true)
    setFinalError(null)
    try {
      const productApi = getProductStudioApi()
      if (productApi && project.backendProject && project.renderPacketRecord) {
        const result = await productApi.generateFinalRender({
          projectId: project.backendProject.id,
          renderPacketId: project.renderPacketRecord.id,
          prompt,
          preservationPolicy: project.preservationPolicy,
          resolution: '2K',
        })
        const render = assertOk<FinalRenderVersion>(result, 'render')
        const renderWithScene: FinalRenderVersion = result.sceneUrl
          ? { ...render, scene_url: result.sceneUrl, metadata: { ...(render.metadata ?? {}), scene_url: result.sceneUrl } }
          : render
        if (!render.output_url) throw new Error('Final render is opgeslagen zonder output URL.')
        setProject((prev) => ({
          ...prev,
          finalRenderRecord: renderWithScene,
          finalRender: { prompt: render.prompt ?? prompt, src: render.output_url as string, createdAt: render.created_at },
          activeStep: 'final',
          updatedAt: new Date().toISOString(),
        }))
        const depthSource = (result.backgroundPlateUrl ?? render.background_plate_url ?? render.output_url) as string
        triggerAiDepthExtraction(depthSource)
        setViewportOverlay('composite')
        await hydrateLatestState(project.backendProject.id, false)
        return
      }

      const api = (window as any).api
      if (!api?.generateScene3D || !beauty) throw new Error('Final render API is nog niet beschikbaar.')
      const policyInstruction = {
        strict: 'Behoud productidentiteit, logo, vorm en materiaal maximaal. Verander het product niet.',
        balanced: 'Behoud het product herkenbaar en verbeter vooral licht, compositie en commerciële uitstraling.',
        creative: 'Maak een vrijere commerciële interpretatie, maar houd de productidentiteit herkenbaar.',
      }[project.preservationPolicy]
      const result = await api.generateScene3D(beauty, `${policyInstruction}\n\n${prompt}`, project.sourceImage?.src)
      if (!result?.ok || !result.imageUrl) {
        throw new Error(result?.error || 'Final render mislukt.')
      }
      setProject((prev) => ({
        ...prev,
        finalRender: { prompt, src: result.imageUrl, createdAt: new Date().toISOString() },
        activeStep: 'final',
        updatedAt: new Date().toISOString(),
      }))
    } catch (err: any) {
      if (!notifyIfCreditsRequired(err)) setFinalError(err?.message || 'Final render mislukt.')
    } finally {
      setFinalLoading(false)
    }
  }

  const [downloadStatus, setDownloadStatus] = useState<string | null>(null)

  function downloadFinalRender() {
    const src = project.finalRender?.src
    if (!src) return
    const api = getProductStudioApi()
    if (api && src.startsWith('https://')) {
      setDownloadStatus('Downloaden...')
      void api.downloadPng({
        imageUrl: src,
        suggestedName: `${project.name.replace(/[^a-z0-9_-]+/gi, '_')}_final.png`,
      }).then((result) => {
        if (result?.ok) {
          setDownloadStatus('Opgeslagen in Downloads')
          setTimeout(() => setDownloadStatus(null), 3000)
        } else {
          setFinalError(result?.error || 'Download mislukt.')
          setDownloadStatus(null)
        }
      })
      return
    }
    const link = document.createElement('a')
    link.href = src
    link.download = `${project.name.replace(/[^a-z0-9_-]+/gi, '-').toLowerCase()}-final.png`
    link.click()
  }

  async function retryRun(runId: string) {
    const api = getProductStudioApi()
    if (!api) return
    setBusy('Provider run opnieuw klaarzetten...')
    try {
      const result = await api.retryProviderRun(runId)
      if (!result?.ok) throw new Error(result?.error || 'Retry mislukt.')
      await refreshProviderStats()
      await hydrateLatestState(getStoredProjectId(project), false)
    } catch (err: any) {
      setError(err?.message || 'Retry mislukt.')
    } finally {
      setBusy(null)
    }
  }

  async function rollbackCanonicalSet() {
    const api = getProductStudioApi()
    const projectId = getStoredProjectId(project)
    const currentVersion = project.canonicalSet?.version
    if (!api || !projectId || !currentVersion || currentVersion <= 1) return
    setBusy('Canonical set terugzetten...')
    try {
      const result = await api.rollbackCanonicalSet({ projectId, targetVersion: currentVersion - 1 })
      if (!result?.ok) throw new Error(result?.error || 'Rollback mislukt.')
      await hydrateLatestState(projectId, false)
    } catch (err: any) {
      setError(err?.message || 'Canonical rollback mislukt.')
    } finally {
      setBusy(null)
    }
  }

  async function rollbackReconstruction(targetReconstructionId: string) {
    const api = getProductStudioApi()
    const projectId = getStoredProjectId(project)
    if (!api || !projectId) return
    setBusy('Reconstructie terugzetten...')
    try {
      const result = await api.rollbackReconstruction({ projectId, targetReconstructionId })
      if (!result?.ok) throw new Error(result?.error || 'Rollback mislukt.')
      await hydrateLatestState(projectId, false)
    } catch (err: any) {
      setError(err?.message || 'Reconstructie rollback mislukt.')
    } finally {
      setBusy(null)
    }
  }

  async function rollbackFinalRender(targetFinalRenderId: string) {
    const api = getProductStudioApi()
    const projectId = getStoredProjectId(project)
    if (!api || !projectId) return
    setBusy('Final render terugzetten...')
    try {
      const result = await api.rollbackFinalRender({ projectId, targetFinalRenderId })
      if (!result?.ok) throw new Error(result?.error || 'Rollback mislukt.')
      await hydrateLatestState(projectId, false)
    } catch (err: any) {
      setFinalError(err?.message || 'Final render rollback mislukt.')
    } finally {
      setBusy(null)
    }
  }

  async function cleanupStorage() {
    const api = getProductStudioApi()
    const projectId = getStoredProjectId(project)
    if (!api || !projectId) return
    setBusy('Opslag opschonen...')
    try {
      const result = await api.cleanupStorage(projectId)
      if (!result?.ok) throw new Error(result?.error || 'Opschonen mislukt.')
      await hydrateLatestState(projectId, false)
    } catch (err: any) {
      setError(err?.message || 'Opschonen mislukt.')
    } finally {
      setBusy(null)
    }
  }

  const sidebarContent = (
    <>
      <div className="border-b border-white/[0.08] px-5 py-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase text-[#facc15]/80">Product Studio</p>
            <h2 className="mt-1 text-lg font-semibold text-white">{project.name}</h2>
          </div>
          <div className="flex items-center gap-2">
            {getStoredProjectId(project) && (
              <button type="button" onClick={() => void hydrateLatestState()} className="rounded-full border border-white/[0.08] px-3 py-1.5 text-xs text-white/55 hover:bg-white/[0.06] hover:text-white">
                Sync
              </button>
            )}
            <button type="button" onClick={resetProject} className="rounded-full border border-white/[0.08] px-3 py-1.5 text-xs text-white/55 hover:bg-white/[0.06] hover:text-white">
              Nieuw
            </button>
          </div>
        </div>
        {busy && <p className="mt-3 rounded-full border border-[#facc15]/15 bg-[#facc15]/8 px-3 py-1.5 text-xs text-[#facc15]">{busy}</p>}
        <div className="mt-4 flex flex-wrap gap-2">
          <StepPill label="Input" active={project.activeStep === 'input'} done={sourceReady} />
          <StepPill label="Views" active={project.activeStep === 'references'} done={approvedCount >= 2 || Boolean(project.canonicalSet)} />
          <StepPill label="Mesh" active={project.activeStep === 'mesh'} done={meshReady} />
          <StepPill label="Texture" active={meshReady && !texturedMeshReady && project.activeStep !== 'input' && project.activeStep !== 'references'} done={texturedMeshReady} />
          <StepPill label="Studio" active={project.activeStep === 'studio'} done={renderPacketReady} />
          <StepPill label="Final" active={project.activeStep === 'final'} done={Boolean(project.finalRender?.src || project.finalRenderRecord?.output_url)} />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => {
              void handleImageFile(event.target.files?.[0] ?? null)
              event.currentTarget.value = ''
            }}
          />
          <input
            ref={contactSheetInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => {
              void handleContactSheetFile(event.target.files?.[0] ?? null)
              event.currentTarget.value = ''
            }}
          />
          <input
            ref={objectMaskInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => {
              void handleObjectMaskFile(event.target.files?.[0] ?? null)
              event.currentTarget.value = ''
            }}
          />

          <section>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white/85">Bronfoto</h3>
              <button type="button" onClick={() => fileInputRef.current?.click()} className="text-xs text-[#facc15] hover:text-[#fde68a]">
                {sourceReady ? 'Vervang' : 'Upload'}
              </button>
            </div>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="mt-3 flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-lg border border-dashed border-white/[0.12] bg-black/30 text-sm text-white/35 transition-colors hover:border-[#facc15]/35 hover:text-white/65"
            >
              {project.sourceImage?.src ? (
                <img src={project.sourceImage.src} alt="Bronfoto" className="h-full w-full object-contain" />
              ) : (
                <span>Kies een productfoto</span>
              )}
            </button>
            {error && <p className="mt-2 text-xs text-red-300">{error}</p>}
          </section>

          <section className="mt-6 rounded-lg border border-white/[0.07] bg-white/[0.03] p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-white/70">Product basis</p>
                <p className="mt-1 text-xs text-white/36">
                  Bron bewaart print en materiaal voor views en polish. Basic Product is alleen de neutrale grijze vorm voor mesh en positionering.
                </p>
              </div>
              <span className={[
                'rounded-full border px-2 py-1 text-[10px]',
                basicShapeReady ? 'border-green-400/18 bg-green-500/8 text-green-300' : 'border-[#facc15]/18 bg-[#facc15]/8 text-[#facc15]',
              ].join(' ')}>
                {basicShapeReady ? 'Basic shape ready' : 'Wacht op backend'}
              </span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {([
                ['Bron / ref-look', project.sourceImage?.src],
                ['Basic shape', basicProductUrl],
              ] as Array<[string, string | null | undefined]>).map(([label, src]) => (
                <div key={label} className="overflow-hidden rounded-md border border-white/[0.06] bg-black/30">
                  <div className="aspect-[4/3]">
                    {src ? <img src={src} alt={label} className="h-full w-full object-contain" /> : <div className="flex h-full items-center justify-center px-3 text-center text-[10px] text-white/24">Nog niet aangemaakt</div>}
                  </div>
                  <p className="px-2 py-1 text-[10px] text-white/38">{label}</p>
                </div>
              ))}
            </div>
            {!basicShapeReady && sourceReady && (
              <p className="mt-2 rounded-md border border-[#facc15]/15 bg-[#facc15]/8 px-2 py-1.5 text-[10px] leading-relaxed text-[#facc15]">
                Complexe prints zijn nog minder stabiel tot Claude de Basic Product generatie activeert. De app valt tijdelijk terug op de bronfoto als vorminput.
              </p>
            )}
          </section>

          <section className="mt-6">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white/85">Canonical views</h3>
              <div className="flex items-center gap-3">
                <button type="button" onClick={generateBackendReferenceViews} disabled={!referenceInputAsset || Boolean(busy)} className="text-xs text-[#facc15] hover:text-[#fde68a] disabled:text-white/22">
                  Genereer
                </button>
                <button type="button" onClick={() => contactSheetInputRef.current?.click()} className="text-xs text-[#facc15] hover:text-[#fde68a]">
                  Contact sheet
                </button>
                <span className="text-xs text-white/32">{approvedCount}/4 bruikbaar</span>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              {project.references.map((view) => (
                <ReferenceCard
                  key={view.id}
                  view={view}
                  onApprove={() => approveReference(view.id)}
                  onReject={() => rejectReference(view.id)}
                  onRegenerate={view.angle && ['left', 'right', 'rear', 'top'].includes(view.angle) ? () => void regenerateReferenceView(view) : undefined}
                />
              ))}
            </div>
            {hasWeakReferenceCoverage && (
              <div className="mt-3 rounded-lg border border-[#facc15]/18 bg-[#facc15]/8 p-3">
                <p className="text-xs font-semibold text-[#facc15]">Safe Camera Zone</p>
                <p className="mt-1 text-xs text-white/42">
                  Er zijn nog weinig goedgekeurde hoeken. Blijf voorlopig dicht bij de front/side camera of genereer extra views voordat je een extreme camera kiest.
                </p>
              </div>
            )}
          </section>

          <section className="mt-6 rounded-lg border border-white/[0.07] bg-white/[0.03] p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-white/70">Mesh review</p>
	                <p className="mt-1 text-xs text-white/36">
	                  {project.reconstruction
	                    ? `${project.reconstruction.route} - ${project.reconstruction.status}`
	                    : basicShapeReady
	                      ? 'Maak eerst een canonical set en start de reconstructie vanuit Basic shape.'
	                      : 'Wacht op Basic shape; TRELLIS gebruikt geen print-views of bronfoto voor mesh.'}
	                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void startMeshReview('single-view')}
                  disabled={!basicShapeReady || Boolean(busy)}
                  className="rounded-full border border-[#facc15]/25 px-3 py-1.5 text-xs font-medium text-[#facc15] hover:bg-[#facc15]/10 disabled:border-white/[0.05] disabled:text-white/24"
                >
                  TRELLIS
                </button>
                <button
                  type="button"
                  onClick={() => void startMeshReview('primitive-proxy')}
                  disabled={!project.sourceImage?.src || Boolean(busy)}
                  className="rounded-full border border-white/[0.08] px-3 py-1.5 text-xs font-medium text-white/50 hover:bg-white/[0.06] disabled:text-white/24"
                >
                  Proxy
                </button>
              </div>
            </div>
            {project.reconstruction && (
              <div className="mt-3 space-y-2">
                <div className="rounded-md border border-white/[0.06] bg-black/20 p-2 text-[11px] text-white/42">
                  {project.reconstruction.mesh_url ? 'GLB geladen in studio.' : 'Proxy fallback: gebruik de bestaande primitive in de studio tot een GLB beschikbaar is.'}
                </div>
                {project.reconstruction.status === 'approved' ? (
                  <div className="flex items-center gap-2 rounded-md border border-green-500/20 bg-green-500/8 px-3 py-1.5">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 flex-shrink-0 text-green-400">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
                    </svg>
                    <span className="text-xs text-green-400">Mesh goedgekeurd</span>
                  </div>
                ) : project.reconstruction.status === 'rejected' ? (
                  <div className="flex items-center gap-2 rounded-md border border-red-500/20 bg-red-500/8 px-3 py-1.5">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 flex-shrink-0 text-red-400">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" />
                    </svg>
                    <span className="text-xs text-red-400">Mesh afgewezen</span>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void setMeshStatus('approved')}
                      className="rounded-full border border-[#facc15]/25 px-3 py-1 text-xs text-[#facc15] hover:bg-[#facc15]/10"
                    >
                      Goedkeur
                    </button>
                    <button
                      type="button"
                      onClick={() => void setMeshStatus('rejected')}
                      className="rounded-full border border-white/[0.08] px-3 py-1 text-xs text-white/50 hover:bg-white/[0.06]"
                    >
                      Afwijs
                    </button>
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => void regenerateMesh('single-view')}
                    disabled={!basicShapeReady || Boolean(busy)}
                    className="rounded-full border border-white/[0.08] px-3 py-1 text-xs text-white/50 hover:bg-white/[0.06] disabled:text-white/24"
                  >
                    Regeneer TRELLIS
                  </button>
                  <button
                    type="button"
                    onClick={() => void regenerateMesh('primitive-proxy')}
                    disabled={Boolean(busy)}
                    className="rounded-full border border-white/[0.08] px-3 py-1 text-xs text-white/50 hover:bg-white/[0.06] disabled:text-white/24"
                  >
                    Proxy fallback
                  </button>
                </div>
              </div>
            )}
          </section>

          <section className="mt-6 rounded-lg border border-white/[0.07] bg-white/[0.03] p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-white/70">Texture product</p>
                <p className="mt-1 text-xs text-white/36">
                  {texturedMeshReady
                    ? 'Textured mesh klaar. Studio gebruikt nu het product met print/look als 3D bron.'
                    : textureInProgress
                      ? 'Texture wrap staat klaar voor de provider. Zodra de backend output levert, laadt de Studio automatisch de textured mesh.'
                      : textureStatus === 'failed' || textureOutputMissing
                        ? 'Texture wrapping is mislukt. De grijze mesh blijft bruikbaar als fallback.'
                        : meshReady
                          ? 'Volgende stap: projecteer de bron/canonical productlook op de mesh.'
                          : 'Maak eerst een mesh voordat texture wrapping mogelijk is.'}
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <span className={[
                  'rounded-full border px-2 py-1 text-[10px]',
                  texturedMeshReady
                    ? 'border-green-400/20 bg-green-500/8 text-green-300'
                    : textureStatus === 'failed' || textureOutputMissing
                      ? 'border-red-400/20 bg-red-500/8 text-red-200'
                      : textureInProgress
                        ? 'border-[#facc15]/20 bg-[#facc15]/8 text-[#facc15]'
                        : 'border-white/[0.08] text-white/38',
                ].join(' ')}>
                  {textureOutputMissing ? 'mesh ontbreekt' : textureStatus === 'none' ? 'geen texture' : textureStatus}
                </span>
                {textureStatus !== 'none' && (
                  <button
                    type="button"
                    title="Texture verwijderen"
                    onClick={() => {
                      textureDeletedRef.current = true
                      setProject((prev) => ({
                        ...prev,
                        reconstruction: prev.reconstruction
                          ? { ...prev.reconstruction, texture_status: 'none' as any, textured_mesh_url: undefined, texture_atlas_url: undefined, texture_error: undefined }
                          : undefined,
                      }))
                      const meshUrl = project.reconstruction?.mesh_url
                      if (meshUrl) {
                        studioRef.current?.addModelFromUrl(meshUrl, 'Reconstructed product')
                      }
                    }}
                    className="flex h-5 w-5 items-center justify-center rounded-full text-white/25 hover:bg-white/[0.08] hover:text-white/60"
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="rounded-md border border-white/[0.06] bg-black/20 p-2">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/34">Grey shape</p>
                <p className="mt-1 truncate text-[11px] text-white/42">{project.reconstruction?.mesh_url || 'Nog geen GLB'}</p>
              </div>
              <div className="rounded-md border border-white/[0.06] bg-black/20 p-2">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/34">Textured mesh</p>
                <p className="mt-1 truncate text-[11px] text-white/42">{texturedMeshUrl || 'Nog niet beschikbaar'}</p>
              </div>
            </div>
            {textureAtlasUrl && (
              <div className="mt-3 overflow-hidden rounded-md border border-white/[0.06] bg-black/30">
                <div className="aspect-[2/1]">
                  <img src={textureAtlasUrl} alt="Texture atlas" className="h-full w-full object-contain" />
                </div>
                <p className="px-2 py-1 text-[10px] text-white/38">Texture atlas</p>
              </div>
            )}
            {project.reconstruction?.texture_error && (
              <p className="mt-3 rounded-md border border-red-400/20 bg-red-500/8 px-2 py-1.5 text-[10px] text-red-200">
                {project.reconstruction.texture_error}
              </p>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void startTextureWrap(false)}
                disabled={!meshReady || textureInProgress || Boolean(busy)}
                className="rounded-full border border-[#facc15]/25 px-3 py-1.5 text-xs font-medium text-[#facc15] hover:bg-[#facc15]/10 disabled:border-white/[0.05] disabled:text-white/24"
              >
                Texture product
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!texturedMeshUrl) return
                  studioRef.current?.addModelFromUrl(texturedMeshUrl, 'Textured product')
                  setRenderPacketStale(true)
                }}
                disabled={!texturedMeshUrl}
                className="rounded-full border border-white/[0.08] px-3 py-1.5 text-xs font-medium text-white/50 hover:bg-white/[0.06] disabled:text-white/24"
              >
                Laad preview
              </button>
              <button
                type="button"
                onClick={() => void startTextureWrap(true)}
                disabled={!meshReady || Boolean(busy)}
                className="rounded-full border border-white/[0.08] px-3 py-1.5 text-xs font-medium text-white/50 hover:bg-white/[0.06] disabled:text-white/24"
              >
                Opnieuw texturen
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (!project.backendProject || !project.reconstruction) return
                  setBusy('UV debug grid toepassen...')
                  try {
                    const api = getProductStudioApi()
                    if (!api) throw new Error('API niet beschikbaar.')
                    const result = await (api as any).applyDebugTexture({
                      projectId: project.backendProject.id,
                      reconstructionVersionId: project.reconstruction.id,
                    })
                    if (!result?.ok) throw new Error(result?.error || 'Debug texture mislukt.')
                    await hydrateLatestState(project.backendProject.id, false)
                    if (result.texturedMeshUrl) {
                      studioRef.current?.addModelFromUrl(result.texturedMeshUrl, 'Textured product')
                    }
                  } catch (err: any) {
                    setError(err.message)
                  } finally {
                    setBusy(null)
                  }
                }}
                disabled={!meshReady || Boolean(busy)}
                className="rounded-full border border-white/[0.08] px-3 py-1.5 text-xs font-medium text-white/50 hover:bg-white/[0.06] disabled:text-white/24"
              >
                UV Debug
              </button>
            </div>
            {!texturedMeshReady && meshReady && (
              <p className="mt-3 rounded-md border border-[#facc15]/15 bg-[#facc15]/8 px-2 py-1.5 text-[10px] text-[#facc15]">
                Final is voor deze sprint geblokkeerd tot Beauty uit een textured mesh komt. Zo testen we eerst echt of wrapping werkt.
              </p>
            )}
          </section>

          {(envViewUrls.length > 0 || envPanoramaUrl) && (
            <section className="mt-6">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-white/85">Multiview omgeving</h3>
                <span className="text-xs text-white/32">{envViewUrls.length}/5 aanzichten</span>
              </div>
              {envPanoramaUrl && (
                <div className="mt-3 overflow-hidden rounded-lg border border-white/[0.06] bg-black/30 transition-colors hover:border-white/[0.15]">
                  <button type="button" onClick={() => openLightbox('Panorama 360°', envPanoramaUrl)} className="w-full">
                    <img src={envPanoramaUrl} alt="Panorama 360°" className="w-full object-cover" style={{ aspectRatio: '4/1' }} />
                  </button>
                  <div className="bg-gradient-to-t from-black/70 to-transparent px-2 py-1.5">
                    <span className="text-[10px] font-medium text-white/60">Panorama 360°</span>
                  </div>
                </div>
              )}
              <div className="mt-3 grid grid-cols-2 gap-3">
                {envViewUrls.map((url, i) => {
                  const label = ['Front', 'Rechts', 'Achter', 'Links', 'Boven'][i]
                  return (
                    <div
                      key={i}
                      className="group relative overflow-hidden rounded-lg border border-white/[0.06] bg-black/30 transition-colors hover:border-white/[0.15]"
                    >
                      <button
                        type="button"
                        onClick={() => openLightbox(label, url)}
                        className="w-full"
                      >
                        <img src={url} alt={label} className="aspect-video w-full object-cover" />
                      </button>
                      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent px-2 py-1.5">
                        <span className="text-[10px] font-medium text-white/60">{label}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          )}

          <section className="mt-6 rounded-lg border border-white/[0.07] bg-white/[0.03] p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-white/70">Omgeving opbouwen</p>
                <p className="mt-1 text-xs text-white/36">Bouwt de omgeving op via 27 spiraal-poses (seed → rechts → links → bovenaanzicht). Duurt 2-5 minuten.</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {(bakeProgress.phase === 'done' || bakeProgress.phase === 'error') && (
                  <button
                    type="button"
                    onClick={() => {
                      const api = getProductStudioApi()
                      if (!api || !project.backendProject) return
                      void api.clearBakeCache({ projectId: project.backendProject.id }).then(() => {
                        setBakeProgress({ phase: 'idle', currentFrame: 0, totalFrames: 12 })
                      })
                    }}
                    className="rounded-full border border-white/[0.08] px-2.5 py-1.5 text-xs font-medium text-white/40 hover:bg-white/[0.06] hover:text-white/60"
                  >
                    Wis cache
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void startBakeMode()}
                  disabled={bakeProgress.phase === 'baking' || !project.backendProject}
                  className="rounded-full border border-[#818cf8]/25 px-3 py-1.5 text-xs font-medium text-[#818cf8] hover:bg-[#818cf8]/10 disabled:cursor-not-allowed disabled:border-white/[0.06] disabled:text-white/24"
                >
                  {bakeProgress.phase === 'baking'
                    ? `Bezig (${bakeProgress.currentFrame}/${bakeProgress.totalFrames})`
                    : bakeProgress.phase === 'done'
                      ? 'Opnieuw opbouwen'
                      : 'Opbouwen'}
                </button>
              </div>
            </div>
            {bakeProgress.phase === 'error' && (
              <p className="mt-2 rounded-md border border-red-400/20 bg-red-500/10 px-2 py-1.5 text-[10px] text-red-200">{bakeProgress.error}</p>
            )}
            {bakeProgress.phase === 'done' && (
              <p className="mt-2 rounded-md border border-[#818cf8]/15 bg-[#818cf8]/8 px-2 py-1.5 text-[10px] text-[#818cf8]">Environment mesh gebakken en geladen in de 3D viewport.</p>
            )}
          </section>

          <section className="mt-4 rounded-lg border border-white/[0.07] bg-white/[0.03] p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-white/70">Orbit splat test</p>
                <p className="mt-1 text-xs text-white/36">Genereert een orbit-video van de achtergrond en test of VGGT de frames kan reconstrueren. Diagnose: ≥80% = bruikbaar voor splat-training.</p>
              </div>
              <div className="flex shrink-0 flex-col gap-1.5">
                {orbitBelongsToCurrentRender && orbitTest.phase === 'done' && orbitTest.videoUrl && (
                  <button
                    type="button"
                    onClick={() => void runPoseOnly()}
                    disabled={orbitTest.phase === 'running' || !orbitBelongsToCurrentRender}
                    className="rounded-full border border-violet-400/25 px-3 py-1 text-[10px] font-medium text-violet-400 hover:bg-violet-400/10 disabled:cursor-not-allowed disabled:border-white/[0.06] disabled:text-white/24"
                  >
                    Pose opnieuw
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void runOrbitTest()}
                  disabled={orbitTest.phase === 'running' || !project.backendProject || (!backgroundPlateUrl && !project.sourceImage?.src)}
                  className="rounded-full border border-emerald-400/25 px-3 py-1.5 text-xs font-medium text-emerald-400 hover:bg-emerald-400/10 disabled:cursor-not-allowed disabled:border-white/[0.06] disabled:text-white/24"
                >
                  {orbitTest.phase === 'running' ? 'Bezig...' : orbitBelongsToCurrentRender && orbitTest.phase === 'done' ? 'Opnieuw' : 'Starten'}
                </button>
              </div>
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <span className="self-center text-[9px] font-medium uppercase tracking-wider text-white/20">Pose:</span>
              <button
                type="button"
                disabled={orbitTest.phase === 'running'}
                className="rounded-full border px-2 py-0.5 text-[9px] font-medium border-violet-400/40 bg-violet-400/10 text-violet-300 disabled:cursor-not-allowed"
              >
                VGGT · RunPod
              </button>
            </div>
            {orbitTest.phase === 'running' && (
              <div className="mt-3">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-[10px] text-white/50">{orbitTest.step}</p>
                  <p className="text-[10px] text-white/30">{orbitTest.progress}%</p>
                </div>
                <div className="h-1 w-full rounded-full bg-white/[0.06]">
                  <div
                    className="h-1 rounded-full bg-emerald-400/70 transition-all duration-500"
                    style={{ width: `${orbitTest.progress}%` }}
                  />
                </div>
              </div>
            )}
            {orbitTest.phase === 'error' && (
              <p className="mt-2 rounded-md border border-red-400/20 bg-red-500/10 px-2 py-1.5 text-[10px] text-red-200">{orbitTest.error}</p>
            )}
            {/* Stap 1 resultaat: orbit video */}
            {orbitBelongsToCurrentRender && orbitTest.videoUrl && (
              <div className="mt-3">
                <div className="relative cursor-pointer group" onClick={() => setOrbitVideoExpanded(true)}>
                  <video
                    key={orbitTest.videoUrl}
                    src={orbitTest.videoUrl}
                    loop
                    autoPlay
                    muted
                    className="w-full rounded-md border border-white/[0.07]"
                    style={{ maxHeight: 200, pointerEvents: 'none' }}
                  />
                  <div className="absolute inset-0 flex items-center justify-center rounded-md bg-black/0 group-hover:bg-black/30 transition-colors">
                    <span className="opacity-0 group-hover:opacity-100 transition-opacity rounded-full bg-black/60 px-3 py-1.5 text-[11px] font-medium text-white">Vergroot</span>
                  </div>
                </div>
              </div>
            )}

            {/* Stap 2: "Maak 3D assets" knop */}
            {orbitBelongsToCurrentRender && orbitTest.phase === 'done' && orbitTest.videoUrl && assetsPrep.phase !== 'running' && (
              <button
                type="button"
                onClick={runPrepareAssets}
                className="mt-2 w-full rounded-md border border-blue-400/25 bg-blue-500/10 py-1.5 text-[11px] font-medium text-blue-300 hover:bg-blue-500/20"
              >
                {assetsPrep.phase === 'done' ? '↻ 3D assets opnieuw voorbereiden' : '▶ Maak 3D assets'}
              </button>
            )}

            {/* Stap 2 voortgang */}
            {assetsPrep.phase === 'running' && (
              <div className="mt-2 rounded-md border border-blue-400/15 bg-blue-500/8 p-2">
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-[10px] font-medium text-blue-300">3D assets voorbereiden...</span>
                  <span className="text-[10px] tabular-nums text-blue-400/80">{assetsPrep.progress}%</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                  <div className="h-full rounded-full bg-blue-400 transition-all duration-500" style={{ width: `${assetsPrep.progress}%` }} />
                </div>
                <p className="mt-1 truncate text-[9px] text-blue-300/50">{assetsPrep.step}</p>
              </div>
            )}

            {assetsPrep.phase === 'error' && (
              <p className="mt-2 rounded-md border border-red-400/20 bg-red-500/10 px-2 py-1.5 text-[10px] text-red-200">{assetsPrep.error}</p>
            )}

            {/* Stap 2 resultaat: clay frame grid */}
            {assetsPrep.phase === 'done' && assetsPrep.sampleClayUrls && assetsPrep.sampleClayUrls.length > 0 && (
              <div className="mt-2 grid grid-cols-3 gap-1">
                {assetsPrep.sampleClayUrls.map((url, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setClayLightboxIndex(i)}
                    className="relative group focus:outline-none"
                  >
                    <img src={url} className="w-full rounded aspect-video object-cover opacity-90 group-hover:opacity-100 transition-opacity" />
                    <div className="absolute inset-0 flex items-center justify-center rounded opacity-0 group-hover:opacity-100 transition-opacity bg-black/30">
                      <span className="text-[9px] text-white font-medium">🔍</span>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* COLMAP kwaliteitsindicator */}
            {assetsPrep.phase === 'done' && assetsPrep.colmap && (
              <div className={`mt-2 rounded-md border px-2 py-1.5 text-[10px] ${assetsPrep.colmap.pass ? 'border-emerald-400/20 bg-emerald-500/10 text-emerald-200' : 'border-red-400/20 bg-red-500/10 text-red-200'}`}>
                {assetsPrep.colmap.pass ? '✓ Geslaagd' : '✗ Gezakt'} — VGGT · RunPod: {assetsPrep.colmap.registered}/{assetsPrep.colmap.total} frames ({assetsPrep.colmap.pct}%)
                {assetsPrep.colmap.pass
                  ? ' — Poses kloppen. .ply training mogelijk.'
                  : ' — Te inconsistent voor training.'}
              </div>
            )}

            {/* Stap 3: .ply training */}
            {orbitBelongsToCurrentRender && assetsPrep.phase === 'done' && assetsPrep.colmap?.pass && (
              <div className="mt-2">
                {splatTraining.phase !== 'running' && (
                  <button
                    type="button"
                    disabled={splatTraining.phase === 'running'}
                    onClick={startSplatTraining}
                    className="w-full rounded-md border border-emerald-400/25 bg-emerald-500/10 py-1.5 text-[11px] font-medium text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-40"
                  >
                    {splatTraining.phase === 'done' ? '✓ Maak .ply (opnieuw)' : '▶ Maak .ply'}
                  </button>
                )}
                {splatTraining.phase === 'running' && (
                  <div className="rounded-md border border-emerald-400/15 bg-emerald-500/8 p-2">
                    <div className="mb-1.5 flex items-center justify-between">
                      <span className="text-[10px] font-medium text-emerald-300">RunPod training...</span>
                      <span className="text-[10px] tabular-nums text-emerald-400/80">
                        {splatTraining.currentStep != null
                          ? `${splatTraining.currentStep.toLocaleString()} / ${(splatTraining.totalSteps ?? 30000).toLocaleString()}`
                          : `${splatTraining.progress}%`}
                      </span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                      <div
                        className="h-full rounded-full bg-emerald-400 transition-all duration-500"
                        style={{ width: `${splatTraining.progress}%` }}
                      />
                    </div>
                    <p className="mt-1 truncate text-[9px] text-emerald-300/50">{splatTraining.step}</p>
                  </div>
                )}
                {splatTraining.phase === 'error' && (
                  <div className="mt-1 rounded-md border border-red-400/20 bg-red-500/8 p-2">
                    <p className="text-[10px] text-red-300">✗ {splatTraining.error}</p>
                    <button type="button" onClick={startSplatTraining} className="mt-1 text-[9px] text-red-300/60 underline hover:text-red-300">
                      Opnieuw proberen
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Marble: alternatieve route — omgeving genereren direct vanuit foto */}
            {(project.finalRenderRecord?.output_url || project.finalRender?.src) && (
              <div className="mt-3 rounded-md border border-amber-400/20 bg-amber-500/5 p-2">
                <p className="mb-1.5 text-[9px] font-medium uppercase tracking-wide text-amber-400/60">Alternatief · Marble</p>
                {marbleGen.phase === 'idle' || marbleGen.phase === 'error' ? (
                  <>
                    <textarea
                      value={marblePrompt}
                      onChange={(e) => setMarblePrompt(e.target.value)}
                      placeholder="Optioneel: beschrijf de ruimte (360° rondom, voor én achter). Leeg = Marble genereert automatisch."
                      rows={3}
                      className="mb-1.5 w-full resize-none rounded-md border border-amber-400/20 bg-black/30 px-2 py-1.5 text-[10px] leading-relaxed text-amber-100/80 placeholder:text-amber-400/30 focus:border-amber-400/40 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={startMarbleGenerate}
                      className="w-full rounded-md border border-amber-400/30 bg-amber-500/15 py-1.5 text-[11px] font-medium text-amber-300 hover:bg-amber-500/25"
                    >
                      ◆ Genereer omgeving met Marble
                      {orbitTest.orbitRunId && <span className="ml-1 text-[9px] opacity-60">· via orbit video</span>}
                    </button>
                    {marbleGen.phase === 'error' && (
                      <p className="mt-1 text-[9px] text-red-300">✗ {marbleGen.error}</p>
                    )}
                  </>
                ) : marbleGen.phase === 'running' ? (
                  <div className="rounded-md border border-amber-400/15 bg-amber-500/8 p-2">
                    <div className="mb-1.5 flex items-center justify-between">
                      <span className="text-[10px] font-medium text-amber-300">Marble genereert...</span>
                      <span className="text-[10px] tabular-nums text-amber-400/80">{marbleGen.progress}%</span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                      <div className="h-full rounded-full bg-amber-400 transition-all duration-500" style={{ width: `${marbleGen.progress}%` }} />
                    </div>
                    <p className="mt-1 truncate text-[9px] text-amber-300/50">{marbleGen.step}</p>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {marbleGen.thumbnailUrl && (
                      <img src={marbleGen.thumbnailUrl} alt="Marble world" className="w-full rounded object-cover" style={{ aspectRatio: '16/9' }} />
                    )}
                    <p className="text-[9px] text-amber-300/70">✓ World gegenereerd · {marbleGen.worldId}</p>
                    <button
                      type="button"
                      onClick={startMarbleGenerate}
                      className="w-full rounded-md border border-amber-400/20 py-1 text-[9px] text-amber-400/60 hover:text-amber-300"
                    >
                      Opnieuw genereren
                    </button>
                  </div>
                )}
              </div>
            )}

            <button
              type="button"
              onClick={async () => {
                const api = getProductStudioApi()
                if (!api) return
                const defaultDir = splatAlignment?.plyPath
                  ? splatAlignment.plyPath.replace(/\/[^/]+$/, '')
                  : undefined
                const result = await api.loadSplat({ defaultDir })
                if (result.ok && result.splatUrl) setSplatViewerUrl(result.splatUrl)
              }}
              className="mt-2 w-full rounded-md border border-violet-400/25 bg-violet-500/10 py-1.5 text-[11px] font-medium text-violet-300 hover:bg-violet-500/20"
            >
              Gaussian Splat bekijken (.ply kiezen)
            </button>
            <button
              type="button"
              onClick={() => void linkLegacySceneAlignmentToCurrentRender()}
              disabled={!project.backendProject?.id || !project.finalRenderRecord?.id}
              className="mt-1.5 w-full rounded-md border border-amber-400/25 bg-amber-500/10 py-1.5 text-[11px] font-medium text-amber-300 hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:border-white/[0.06] disabled:bg-white/[0.02] disabled:text-white/24"
            >
              Koppel bestaande 3D render aan deze afbeelding
            </button>
            <button
              type="button"
              onClick={async () => {
                const api = getProductStudioApi()
                if (!api || !project.backendProject?.id) return
                let currentSplatUrl = splatAlignment?.splatUrl
                let currentPlyPath = splatAlignment?.plyPath
                let currentSpzPath = splatAlignment?.spzPath
                let currentSource = splatAlignment?.source
                let localFloorY = 0

                // Fallback voor lege state: alleen dan een bestand kiezen.
                if (!currentSplatUrl) {
                  const defaultDir = splatAlignment?.plyPath
                    ? splatAlignment.plyPath.replace(/\/[^/]+$/, '')
                    : undefined
                  const splatResult = await api.loadSplat({ defaultDir })
                  if (!splatResult.ok || !splatResult.splatUrl) return
                  currentSplatUrl = splatResult.splatUrl
                  currentPlyPath = splatResult.plyPath
                  localFloorY = splatResult.localFloorY ?? 0
                  currentSource = 'manual'
                }

                if (splatAlignment && isMarbleAlignment({ ...splatAlignment, splatUrl: currentSplatUrl })) {
                  // Live manifest heeft de actuele camerahoek; render-packet manifest is de fallback.
                  const liveManifest = studioRef.current?.captureRenderManifest?.()
                  const manifest = liveManifest ?? renderManifestRef.current
                  // forceRecalculate=true: knop herberekent altijd de shot-positie (nieuw camerastandpunt).
                  // Kalibratie (groupScale, basisRotationY, tilt) wordt via wasCalibrated meegenomen;
                  // groupPosition wordt gereset (is per-shot).
                  const nextAlignment = applyMarbleShotTransform(
                    { ...splatAlignment, splatUrl: currentSplatUrl, plyPath: currentPlyPath, spzPath: currentSpzPath, source: 'marble' as const },
                    manifest,
                    null,
                    true,
                  )
                  setSplatViewerUrl(null)
                  applySplatAlignment(nextAlignment, nextAlignment)
                  return
                }

                const poseResult = await api.getSplatPose({
                  projectId: project.backendProject.id,
                  orbitRunId: orbitBelongsToCurrentRender ? orbitTest.orbitRunId : undefined,
                  renderVersionId: project.finalRenderRecord?.id,
                })
                if (!poseResult.ok || !poseResult.pose) {
                  console.error('[splatAlignment] pose ophalen mislukt:', poseResult.error)
                  return
                }
                const nextAlignment: SplatAlignment = applySplatToShotTransform({
                  splatUrl: currentSplatUrl,
                  plyPath: currentPlyPath,
                  spzPath: currentSpzPath,
                  source: currentSource,
                  renderVersionId: splatAlignment?.renderVersionId ?? project.finalRenderRecord?.id,
                  orbitRunId: splatAlignment?.orbitRunId ?? orbitTest.orbitRunId ?? undefined,
                  worldId: splatAlignment?.worldId,
                  route: splatAlignment?.route,
                  metricScaleFactor: splatAlignment?.metricScaleFactor,
                  groundPlaneOffset: splatAlignment?.groundPlaneOffset,
                  marbleMeta: splatAlignment?.marbleMeta,
                  ...poseResult.pose,
                  groupPositionX: poseResult.pose.groupPositionX ?? 0,
                  groupPositionY: (poseResult.pose.groupPositionY ?? 0) - localFloorY,
                  groupPositionZ: poseResult.pose.groupPositionZ ?? 0,
                  groupScale: poseResult.pose.groupScale ?? 1,
                  groupMaskSize: poseResult.pose.groupMaskSize ?? 20,
                  bubbleRadius: poseResult.pose.bubbleRadius ?? DEFAULT_BUBBLE_RADIUS,
                  bubbleFeather: poseResult.pose.bubbleFeather ?? DEFAULT_BUBBLE_FEATHER,
                  sceneCenter: [
                    poseResult.pose.sceneCenter[0],
                    poseResult.pose.sceneCenter[1] - localFloorY,
                    poseResult.pose.sceneCenter[2],
                  ],
                })
                setSplatViewerUrl(null)
                applySplatAlignment(nextAlignment, nextAlignment)
              }}
              className="mt-1.5 w-full rounded-md border border-sky-400/25 bg-sky-500/10 py-1.5 text-[11px] font-medium text-sky-300 hover:bg-sky-500/20"
            >
              {splatAlignment?.source === 'marble' ? '↺ Achtergrond op shot uitlijnen' : '3D achtergrond uitlijnen (COLMAP)'}
            </button>
            {splatAlignment?.splatToShot && marbleCalibrationIdentity(splatAlignment) && (
              <div className="mt-1.5 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (!splatAlignment) return
                    saveMarbleCalibration(splatAlignment)
                  }}
                  className="flex-1 rounded-md border border-emerald-400/25 bg-emerald-500/10 py-1.5 text-[11px] font-medium text-emerald-300 hover:bg-emerald-500/20"
                >
                  ✓ Sla op als standaard
                </button>
                {(() => {
                  const cal = loadMarbleCalibration(splatAlignment)
                  return cal ? (
                    <span className="text-[10px] text-emerald-400/60" title={`Opgeslagen: schaal ${cal.groupScale.toFixed(2)}, rotatie ${(cal.basisRotationY * 180 / Math.PI).toFixed(1)}°`}>
                      ✓ opgeslagen
                    </span>
                  ) : null
                })()}
              </div>
            )}
            {splatAlignment && (
              <>
                <div className="mt-2 rounded-md border border-white/[0.08] bg-black/20 p-2">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-[11px] font-semibold text-white/60">Achtergrond positie</p>
                      <p className="mt-0.5 text-[10px] text-white/30">
                        Sleep of vul exact de offset in.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={resetSplatAlignmentToBase}
                      disabled={!splatBaseAlignment}
                      className="rounded-full border border-white/10 px-2.5 py-1 text-[10px] font-medium text-white/45 hover:bg-white/[0.06] hover:text-white/70 disabled:cursor-not-allowed disabled:opacity-35"
                    >
                      Reset
                    </button>
                  </div>
                  <div className="mt-3 space-y-2.5">
                    {([
                      { axis: 'x' as const, label: 'X', icon: '↔', title: 'Links / Rechts', value: finiteNumber(splatAlignment.groupPositionX, 0) },
                      { axis: 'y' as const, label: 'Y', icon: '↕', title: 'Omhoog / Omlaag', value: finiteNumber(splatAlignment.groupPositionY, 0) },
                      { axis: 'z' as const, label: 'Z', icon: '⇄', title: 'Dichterbij / Verder weg', value: finiteNumber(splatAlignment.groupPositionZ, 0) },
                    ]).map((control) => (
                      <div key={control.axis} className="grid grid-cols-[18px_1fr_64px] items-center gap-2">
                        <span className="text-[10px] font-semibold text-white/45" title={`${control.label}: ${control.title}`}>{control.icon}</span>
                        <input
                          type="range"
                          min="-10"
                          max="10"
                          step="0.01"
                          value={control.value}
                          onChange={(event) => setSplatAlignmentAxis(control.axis, finiteNumber(event.currentTarget.value, 0))}
                          className="h-1.5 w-full accent-[#facc15]"
                        />
                        <input
                          type="number"
                          step="0.01"
                          value={Number(finiteNumber(control.value, 0).toFixed(2))}
                          onChange={(event) => setSplatAlignmentAxis(control.axis, finiteNumber(event.currentTarget.value, 0))}
                          className="h-7 rounded-md border border-white/10 bg-white/[0.04] px-2 text-right text-[11px] font-medium text-white/65 outline-none focus:border-[#facc15]/40"
                        />
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 grid grid-cols-[48px_1fr_64px] items-center gap-2">
                    <span className="text-[10px] font-semibold text-white/45">Schaal</span>
                    <input
                      type="range"
                      min="0.2"
                      max="3"
                      step="0.01"
                      value={finiteNumber(splatAlignment.groupScale, 1)}
                      onChange={(event) => setSplatScale(finiteNumber(event.currentTarget.value, 1))}
                      className="h-1.5 w-full accent-[#facc15]"
                    />
                    <input
                      type="number"
                      min="0.1"
                      step="0.01"
                      value={Number(finiteNumber(splatAlignment.groupScale, 1).toFixed(2))}
                      onChange={(event) => setSplatScale(finiteNumber(event.currentTarget.value, 1))}
                      className="h-7 rounded-md border border-white/10 bg-white/[0.04] px-2 text-right text-[11px] font-medium text-white/65 outline-none focus:border-[#facc15]/40"
                    />
                  </div>
                  <div className="mt-3 grid grid-cols-[48px_1fr_64px] items-center gap-2">
                    <span className="text-[10px] font-semibold text-white/45">Masker</span>
                    <input
                      type="range"
                      min="0.5"
                      max="30"
                      step="0.1"
                      value={finiteNumber(splatAlignment.groupMaskSize, 20)}
                      onChange={(event) => setSplatMaskSize(finiteNumber(event.currentTarget.value, 20))}
                      className="h-1.5 w-full accent-emerald-400"
                    />
                    <input
                      type="number"
                      min="0.2"
                      step="0.1"
                      value={Number(finiteNumber(splatAlignment.groupMaskSize, 20).toFixed(1))}
                      onChange={(event) => setSplatMaskSize(finiteNumber(event.currentTarget.value, 20))}
                      className="h-7 rounded-md border border-white/10 bg-white/[0.04] px-2 text-right text-[11px] font-medium text-white/65 outline-none focus:border-emerald-400/40"
                    />
                  </div>
                  <p className="mt-3 text-[10px] font-semibold text-white/40">Masker verschuiven</p>
                  <div className="mt-1.5 space-y-2.5">
                    {([
                      { axis: 'x' as const, label: 'L/R', title: 'Links/rechts', value: finiteNumber(splatAlignment.groupMaskOffsetX, 0) },
                      { axis: 'y' as const, label: 'H', title: 'Hoogte', value: finiteNumber(splatAlignment.groupMaskOffsetY, 0) },
                      { axis: 'z' as const, label: 'V/A', title: 'Voor/achter', value: finiteNumber(splatAlignment.groupMaskOffsetZ, 0) },
                    ]).map((control) => (
                      <div key={control.axis} className="grid grid-cols-[18px_1fr_64px] items-center gap-2">
                        <span className="text-[10px] font-semibold text-white/45" title={control.title}>{control.label}</span>
                        <input
                          type="range"
                          min="-10"
                          max="10"
                          step="0.05"
                          value={control.value}
                          onChange={(event) => setSplatMaskOffset(control.axis, finiteNumber(event.currentTarget.value, 0))}
                          className="h-1.5 w-full accent-emerald-400"
                        />
                        <input
                          type="number"
                          step="0.05"
                          value={Number(finiteNumber(control.value, 0).toFixed(2))}
                          onChange={(event) => setSplatMaskOffset(control.axis, finiteNumber(event.currentTarget.value, 0))}
                          className="h-7 rounded-md border border-white/10 bg-white/[0.04] px-2 text-right text-[11px] font-medium text-white/65 outline-none focus:border-emerald-400/40"
                        />
                      </div>
                    ))}
                  </div>
                  {splatAlignment.plyPath && (
                    <>
                      <p className="mt-3 text-[10px] font-semibold text-white/40">Schoonmaak filters</p>
                      <div className="mt-1.5 space-y-2.5">
                        <div className="grid grid-cols-[48px_1fr_64px] items-center gap-2">
                          <span className="text-[10px] font-semibold text-white/45" title="Alpha-drempel (0-255): hogere waarde verwijdert meer mist">Mist</span>
                          <input
                            type="range"
                            min="0"
                            max="80"
                            step="1"
                            value={finiteNumber(splatAlignment.cleanupAlpha, 15)}
                            onChange={(e) => {
                              const value = finiteNumber(e.currentTarget.value, 15)
                              setSplatAlignment((prev) => prev ? { ...prev, cleanupAlpha: value } : prev)
                            }}
                            className="h-1.5 w-full accent-violet-400"
                          />
                          <input
                            type="number"
                            min="0"
                            max="255"
                            step="1"
                            value={finiteNumber(splatAlignment.cleanupAlpha, 15)}
                            onChange={(e) => {
                              const value = finiteNumber(e.currentTarget.value, 15)
                              setSplatAlignment((prev) => prev ? { ...prev, cleanupAlpha: value } : prev)
                            }}
                            className="h-7 rounded-md border border-white/10 bg-white/[0.04] px-2 text-right text-[11px] font-medium text-white/65 outline-none focus:border-violet-400/40"
                          />
                        </div>
                        <div className="grid grid-cols-[48px_1fr_64px] items-center gap-2">
                          <span className="text-[10px] font-semibold text-white/45" title="IQR-factor voor schaalfilter: lagere waarde verwijdert meer grote splats">Schaal</span>
                          <input
                            type="range"
                            min="1"
                            max="10"
                            step="0.5"
                            value={finiteNumber(splatAlignment.cleanupScaleIqr, 3)}
                            onChange={(e) => {
                              const value = finiteNumber(e.currentTarget.value, 3)
                              setSplatAlignment((prev) => prev ? { ...prev, cleanupScaleIqr: value } : prev)
                            }}
                            className="h-1.5 w-full accent-violet-400"
                          />
                          <input
                            type="number"
                            min="0.5"
                            step="0.5"
                            value={finiteNumber(splatAlignment.cleanupScaleIqr, 3)}
                            onChange={(e) => {
                              const value = finiteNumber(e.currentTarget.value, 3)
                              setSplatAlignment((prev) => prev ? { ...prev, cleanupScaleIqr: value } : prev)
                            }}
                            className="h-7 rounded-md border border-white/10 bg-white/[0.04] px-2 text-right text-[11px] font-medium text-white/65 outline-none focus:border-violet-400/40"
                          />
                        </div>
                        <div className="grid grid-cols-[48px_1fr_64px] items-center gap-2">
                          <span className="text-[10px] font-semibold text-white/45" title="Bounding box: lagere waarde knipt verder buiten de kern">Rand</span>
                          <input
                            type="range"
                            min="1"
                            max="8"
                            step="0.5"
                            value={finiteNumber(splatAlignment.cleanupPosSigma, 4)}
                            onChange={(e) => {
                              const value = finiteNumber(e.currentTarget.value, 4)
                              setSplatAlignment((prev) => prev ? { ...prev, cleanupPosSigma: value } : prev)
                            }}
                            className="h-1.5 w-full accent-violet-400"
                          />
                          <input
                            type="number"
                            min="0.5"
                            step="0.5"
                            value={finiteNumber(splatAlignment.cleanupPosSigma, 4)}
                            onChange={(e) => {
                              const value = finiteNumber(e.currentTarget.value, 4)
                              setSplatAlignment((prev) => prev ? { ...prev, cleanupPosSigma: value } : prev)
                            }}
                            className="h-7 rounded-md border border-white/10 bg-white/[0.04] px-2 text-right text-[11px] font-medium text-white/65 outline-none focus:border-violet-400/40"
                          />
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={splatReconverting}
                        onClick={reconvertSplat}
                        className="mt-2 w-full rounded-md border border-violet-400/30 bg-violet-500/10 py-1.5 text-[11px] font-medium text-violet-300 hover:bg-violet-500/20 disabled:cursor-wait disabled:opacity-50"
                      >
                        {splatReconverting ? 'Herconverteren...' : '↻ Herconverteren met deze filters'}
                      </button>
                    </>
                  )}
                  <p className="mt-3 text-[10px] font-semibold text-white/40">Draaien</p>
                  <div className="mt-1.5 space-y-2.5">
                    <div className="grid grid-cols-[18px_1fr_64px] items-center gap-2">
                      <span className="text-[10px] font-semibold text-white/45" title="Y-as: horizontaal draaien (links/rechts)">↻</span>
                      <input
                        type="range"
                        min={-Math.PI}
                        max={Math.PI}
                        step="0.01"
                        value={finiteNumber(splatAlignment.basisRotationY, 0)}
                        onChange={(event) => { const v = finiteNumber(event.currentTarget.value, 0); setSplatAlignment((prev) => prev ? { ...prev, basisRotationY: v } : prev) }}
                        className="h-1.5 w-full accent-sky-400"
                      />
                      <input
                        type="number"
                        step="0.01"
                        value={Number(finiteNumber(splatAlignment.basisRotationY, 0).toFixed(2))}
                        onChange={(event) => { const v = finiteNumber(event.currentTarget.value, 0); setSplatAlignment((prev) => prev ? { ...prev, basisRotationY: v } : prev) }}
                        className="h-7 rounded-md border border-white/10 bg-white/[0.04] px-2 text-right text-[11px] font-medium text-white/65 outline-none focus:border-sky-400/40"
                      />
                    </div>
                  </div>
                  <p className="mt-3 text-[10px] font-semibold text-white/40">Kanteling</p>
                  <div className="mt-1.5 space-y-2.5">
                    {([
                      { axis: 'x' as const, label: '↕', title: 'Voor/achter kantelen', value: finiteNumber(splatAlignment.groupTiltX, 0) },
                      { axis: 'z' as const, label: '↔', title: 'Links/rechts kantelen', value: finiteNumber(splatAlignment.groupTiltZ, 0) },
                    ]).map((control) => (
                      <div key={control.axis} className="grid grid-cols-[18px_1fr_64px] items-center gap-2">
                        <span className="text-[10px] font-semibold text-white/45" title={control.title}>{control.label}</span>
                        <input
                          type="range"
                          min="-0.5"
                          max="0.5"
                          step="0.001"
                          value={control.value}
                          onChange={(event) => setSplatTilt(control.axis, finiteNumber(event.currentTarget.value, 0))}
                          className="h-1.5 w-full accent-sky-400"
                        />
                        <input
                          type="number"
                          step="0.001"
                          value={Number(finiteNumber(control.value, 0).toFixed(3))}
                          onChange={(event) => setSplatTilt(control.axis, finiteNumber(event.currentTarget.value, 0))}
                          className="h-7 rounded-md border border-white/10 bg-white/[0.04] px-2 text-right text-[11px] font-medium text-white/65 outline-none focus:border-sky-400/40"
                        />
                      </div>
                    ))}
                  </div>
                  <p className="mt-3 text-[10px] font-semibold text-white/40">Camera bubble</p>
                  <div className="mt-1.5 space-y-2.5">
                    <div className="grid grid-cols-[48px_1fr_64px] items-center gap-2">
                      <span className="text-[10px] font-semibold text-white/45" title="Straal van de onzichtbare bol rond de camera (0 = uit)">Straal</span>
                      <input
                        type="range"
                        min="0"
                        max="10"
                        step="0.1"
                        value={finiteNumber(splatAlignment.bubbleRadius, DEFAULT_BUBBLE_RADIUS)}
                        onChange={(e) => {
                          const value = finiteNumber(e.currentTarget.value, DEFAULT_BUBBLE_RADIUS)
                          setSplatAlignment((prev) => prev ? { ...prev, bubbleRadius: value } : prev)
                        }}
                        className="h-1.5 w-full accent-amber-400"
                      />
                      <input
                        type="number"
                        min="0"
                        max="10"
                        step="0.1"
                        value={Number(finiteNumber(splatAlignment.bubbleRadius, DEFAULT_BUBBLE_RADIUS).toFixed(1))}
                        onChange={(e) => {
                          const value = finiteNumber(e.currentTarget.value, DEFAULT_BUBBLE_RADIUS)
                          setSplatAlignment((prev) => prev ? { ...prev, bubbleRadius: value } : prev)
                        }}
                        className="h-7 rounded-md border border-white/10 bg-white/[0.04] px-2 text-right text-[11px] font-medium text-white/65 outline-none focus:border-amber-400/40"
                      />
                    </div>
                    <div className="grid grid-cols-[48px_1fr_64px] items-center gap-2">
                      <span className="text-[10px] font-semibold text-white/45" title="Breedte van de zachte overgangsrand">Rand</span>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        value={finiteNumber(splatAlignment.bubbleFeather, DEFAULT_BUBBLE_FEATHER)}
                        onChange={(e) => {
                          const value = finiteNumber(e.currentTarget.value, DEFAULT_BUBBLE_FEATHER)
                          setSplatAlignment((prev) => prev ? { ...prev, bubbleFeather: value } : prev)
                        }}
                        className="h-1.5 w-full accent-amber-400"
                      />
                      <input
                        type="number"
                        min="0"
                        max="2"
                        step="0.05"
                        value={Number(finiteNumber(splatAlignment.bubbleFeather, DEFAULT_BUBBLE_FEATHER).toFixed(2))}
                        onChange={(e) => {
                          const value = finiteNumber(e.currentTarget.value, DEFAULT_BUBBLE_FEATHER)
                          setSplatAlignment((prev) => prev ? { ...prev, bubbleFeather: value } : prev)
                        }}
                        className="h-7 rounded-md border border-white/10 bg-white/[0.04] px-2 text-right text-[11px] font-medium text-white/65 outline-none focus:border-amber-400/40"
                      />
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (splatPuntMode !== 'off') {
                      resetPuntMode()
                    } else {
                      setSplatPuntMode('foto')
                    }
                  }}
                  className={`mt-1 w-full rounded-md border py-1.5 text-[11px] font-medium ${
                    splatPuntMode !== 'off'
                      ? 'border-orange-400/40 bg-orange-500/20 text-orange-300 hover:bg-orange-500/30'
                      : 'border-orange-400/20 bg-orange-500/8 text-orange-300/70 hover:bg-orange-500/15'
                  }`}
                >
                  {splatPuntMode !== 'off' ? '✕ Punt-uitlijning stoppen' : 'Punt-uitlijning'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSplatAlignment(null)
                    setSplatBaseAlignment(null)
                    resetPuntMode()
                  }}
                  className="mt-1 w-full rounded-md border border-white/10 bg-white/[0.04] py-1.5 text-[11px] font-medium text-white/40 hover:bg-white/[0.07]"
                >
                  Achtergrond verwijderen
                </button>
              </>
            )}
          </section>

          <section className="mt-6 rounded-lg border border-white/[0.07] bg-white/[0.03] p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-white/70">Render packet</p>
                <p className="mt-1 text-xs text-white/36">Beauty, depth, normals en optioneel object-mask voor protected regions.</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => objectMaskInputRef.current?.click()}
                  disabled={!project.backendProject}
                  className="rounded-full border border-white/[0.08] px-3 py-1.5 text-xs font-medium text-white/50 hover:bg-white/[0.06] disabled:text-white/24"
                >
                  Mask
                </button>
                <button
                  type="button"
                  onClick={captureRenderPacket}
                  className="rounded-full border border-[#facc15]/25 px-3 py-1.5 text-xs font-medium text-[#facc15] hover:bg-[#facc15]/10"
                >
                  {project.renderPacketRecord ? 'Update preview' : 'Maak preview'}
                </button>
              </div>
            </div>
            {project.renderPacketRecord && (
              <p className={[
                'mt-3 rounded-md border px-2 py-1.5 text-[10px]',
                renderPacketStale ? 'border-red-400/20 bg-red-500/10 text-red-200' : 'border-[#facc15]/15 bg-[#facc15]/8 text-[#facc15]',
              ].join(' ')}>
                {renderPacketStale
                  ? 'Preview verouderd: camera, object, licht of environment is gewijzigd. Klik op Update preview voordat je final rendert.'
                  : 'Final render gebruikt deze opgeslagen Beauty snapshot. Camera of object verplaatst? Klik eerst op Update preview.'}
              </p>
            )}
            <div className={[
              'mt-3 rounded-lg border p-3',
              renderPacketStale
                ? 'border-red-400/20 bg-red-500/8'
                : lockedCameraReady
                  ? 'border-green-400/18 bg-green-500/8'
                  : 'border-white/[0.07] bg-black/20',
            ].join(' ')}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className={[
                    'text-xs font-semibold',
                    renderPacketStale ? 'text-red-200' : lockedCameraReady ? 'text-green-300' : 'text-white/62',
                  ].join(' ')}>
                    {renderPacketStale ? 'Locked Camera verlopen' : lockedCameraReady ? 'Locked Camera klaar' : 'Locked Camera voorbereiding'}
                  </p>
                  <p className="mt-1 text-[11px] leading-relaxed text-white/38">
                    Beauty is de fotografiecamera. Met route 2 moet deze Beauty uit de textured mesh komen, zodat print, materiaal en hoek al in 3D kloppen.
                  </p>
                </div>
                <span className="rounded-full border border-white/[0.08] px-2 py-1 text-[10px] text-white/38">
                  Experimental
                </span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {lockedCameraInputs.map((input) => (
                  <InputStatusPill key={input.label} label={input.label} ready={input.ready} />
                ))}
              </div>
              <div className="mt-3 border-t border-white/[0.06] pt-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/34">Scene manifest</p>
                  {renderManifest?.capturedAt && (
                    <span className="text-[10px] text-white/28">
                      {new Date(renderManifest.capturedAt).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  )}
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {manifestStatus.map((item) => (
                    <ManifestStatusPill key={item.label} label={item.label} ready={item.ready} />
                  ))}
                </div>
                {renderManifest?.product?.screenBbox && (
                  <p className="mt-2 text-[10px] text-white/30">
                    Product bbox {Math.round(renderManifest.product.screenBbox.width)}x{Math.round(renderManifest.product.screenBbox.height)}px · camera bepaalt compositie en horizon.
                  </p>
                )}
              </div>
            </div>
            {(beautyPreviewUrl || calibrationPreviewUrl || lightMapPreviewUrl || depthPreviewUrl || normalPreviewUrl || objectMaskUrl) && (
              <div className="mt-3 grid grid-cols-4 gap-2">
                {[
                  [beautyLayerLabel, beautyPreviewUrl],
                  ['Calibration', calibrationPreviewUrl],
                  ['Light map', lightMapPreviewUrl],
                  ['Depth', depthPreviewUrl],
                  ['Normals', normalPreviewUrl],
                  ['Mask', objectMaskUrl],
                ].map(([label, src]) => (
                  <div key={label} className="overflow-hidden rounded-md border border-white/[0.06] bg-black/30">
                    <div className="aspect-square">{src && <img src={src} alt={label} className="h-full w-full object-cover" />}</div>
                    <p className="px-2 py-1 text-[10px] text-white/38">{label}</p>
                  </div>
                ))}
              </div>
            )}
            {project.renderPacketRecord && (
              <div className="mt-3 space-y-1 rounded-md border border-white/[0.06] bg-black/20 p-2 text-[10px] text-white/36">
                <p className="truncate">Beauty: {project.renderPacketRecord.beauty_url}</p>
                {project.renderPacketRecord.auxiliary_asset_urls?.calibration_url && <p className="truncate">Calibration: {project.renderPacketRecord.auxiliary_asset_urls.calibration_url}</p>}
                {project.renderPacketRecord.auxiliary_asset_urls?.light_map_url && <p className="truncate">Light map: {project.renderPacketRecord.auxiliary_asset_urls.light_map_url}</p>}
                {project.renderPacketRecord.depth_url && <p className="truncate">Depth: {project.renderPacketRecord.depth_url}</p>}
                {project.renderPacketRecord.normal_url && <p className="truncate">Normals: {project.renderPacketRecord.normal_url}</p>}
                {project.renderPacketRecord.object_mask_url && <p className="truncate">Mask: {project.renderPacketRecord.object_mask_url}</p>}
              </div>
            )}
            {objectMaskUrl && !project.renderPacketRecord?.object_mask_url && (
              <p className="mt-2 rounded-md border border-[#facc15]/15 bg-[#facc15]/8 px-2 py-1 text-[10px] text-[#facc15]">
                Object-mask staat klaar en wordt meegenomen bij het volgende renderpacket.
              </p>
            )}
          </section>

          <section className="mt-6">
            <h3 className="text-sm font-semibold text-white/85">Final render</h3>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {([
                ['strict', 'Strict'],
                ['balanced', 'Balanced'],
                ['creative', 'Creative'],
              ] as Array<[PreservationPolicy, string]>).map(([policy, label]) => (
                <button
                  key={policy}
                  type="button"
                  onClick={() => setProject((prev) => ({ ...prev, preservationPolicy: policy }))}
                  className={[
                    'rounded-full border px-3 py-1.5 text-xs transition-colors',
                    project.preservationPolicy === policy ? 'border-[#facc15]/35 bg-[#facc15]/10 text-[#facc15]' : 'border-white/[0.07] text-white/42 hover:bg-white/[0.05] hover:text-white/70',
                  ].join(' ')}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="mt-2 rounded-md border border-white/[0.06] bg-black/20 px-3 py-2 text-[11px] leading-relaxed text-white/42">
              {POLICY_HINTS[project.preservationPolicy]} Route 2 gebruikt eerst een textured 3D product. Daarna pas maken we background en composite.
            </p>
            <div className={[
              'mt-3 rounded-md border px-3 py-2',
              renderPacketStale ? 'border-red-400/20 bg-red-500/8' : lockedCameraReady ? 'border-green-400/18 bg-green-500/8' : 'border-white/[0.06] bg-black/20',
            ].join(' ')}>
              <div className="flex items-center justify-between gap-3">
                <p className={[
                  'text-[11px] font-semibold',
                  renderPacketStale ? 'text-red-200' : lockedCameraReady ? 'text-green-300' : 'text-white/50',
                ].join(' ')}>
                  Locked Camera {lockedCameraReady ? 'ready' : renderPacketStale ? 'verlopen' : 'nog niet compleet'}
                </p>
                <span className="rounded-full border border-white/[0.08] px-2 py-1 text-[10px] text-white/36">
                  Textured mesh route
                </span>
              </div>
              <p className="mt-1 text-[11px] leading-relaxed text-white/38">
                Testregel: Beauty moet al het echte product bevatten vanuit de textured mesh. Final mag daarna productpositie en productlook niet opnieuw verzinnen.
              </p>
            </div>
            {finalRenderRequiresTexture && (
              <p className="mt-3 rounded-md border border-[#facc15]/15 bg-[#facc15]/8 px-3 py-2 text-[11px] text-[#facc15]">
                Wacht met Final render tot `Texture product` klaar is en je daarna `Update preview` hebt geklikt.
              </p>
            )}
            {renderPacketStale && (
              <p className="mt-2 text-xs text-red-300">Update eerst de preview; anders gebruikt de backend de vorige camera en Beauty snapshot.</p>
            )}
            {finalError && <p className="mt-2 text-xs text-red-300">{finalError}</p>}
            {(project.sourceImage?.src || beautyPreviewUrl || project.finalRender?.src) && (
              <div className="mt-3 grid grid-cols-2 gap-2">
                {finalLayerPreviews.map(([label, src]) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => { if (src) openLightbox(label, src) }}
                    disabled={!src}
                    className="overflow-hidden rounded-md border border-white/[0.06] bg-black/30 text-left transition-colors hover:border-white/[0.18] hover:bg-white/[0.04] disabled:cursor-default disabled:hover:border-white/[0.06] disabled:hover:bg-black/30"
                  >
                    <div className="aspect-[4/3]">
                      {src ? <img src={src} alt={label} className="h-full w-full object-contain" /> : <div className="flex h-full items-center justify-center text-[10px] text-white/24">Nog leeg</div>}
                    </div>
                    <p className="px-2 py-1 text-[10px] text-white/38">{label}</p>
                  </button>
                ))}
              </div>
            )}
            {project.finalRender?.src && (
              <div className="mt-3 overflow-hidden rounded-lg border border-white/[0.07] bg-[#151515]">
                <div className="aspect-[4/3] bg-black/35">
                  <img src={project.finalRender.src} alt="Final render" className="h-full w-full object-contain" />
                </div>
                <div className="flex items-center justify-between gap-3 px-3 py-2">
                  <p className="min-w-0 truncate text-xs text-white/48">{project.finalRender.prompt}</p>
                  <div className="flex items-center gap-1.5">
                    {backgroundPlateUrl && project.finalRenderRecord && project.renderPacketRecord && (
                      <button
                        type="button"
                        disabled={!!busy || finalLoading}
                        onClick={async () => {
                          activeArchiveVersionId.current = null
                          setBusy('Nieuwe hoek genereren...')
                          setFinalError(null)
                          try {
                            const prevViewMode = viewMode
                            const prevRings = debugRings
                            setDebugRings(undefined)
                            setViewMode('material')
                            await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
                            const packet = await studioRef.current?.captureRenderPacketPreview()
                            setViewMode(prevViewMode)
                            setDebugRings(prevRings)
                            if (!packet?.beauty) throw new Error('Kan geen screenshot maken vanuit de huidige hoek.')
                            const newManifest = studioRef.current?.getScene()
                              ? (studioRef.current as any).captureRenderManifest?.() ?? packet.manifest
                              : packet.manifest
                            const api = getProductStudioApi()
                            if (!api) throw new Error('API niet beschikbaar.')
                            const result = await (api as any).generateAngleVariant({
                              projectId: project.backendProject!.id,
                              renderPacketId: project.renderPacketRecord!.id,
                              originalFinalRenderVersionId: project.finalRenderRecord!.id,
                              originalPrompt: project.finalRender?.prompt ?? '',
                              originalManifest: project.renderPacketRecord!.scene_manifest,
                              newManifest: newManifest ?? packet.manifest,
                              newBeautyDataUrl: packet.beauty,
                              newCalibrationDataUrl: packet.passes?.calibration,
                              newPerspectiveDataUrl: packet.passes?.perspective,
                              newDepthDataUrl: packet.passes?.depth,
                            })
                            if (!result?.ok) throw new Error(result?.error || 'Angle variant genereren mislukt.')
                            if (result.render?.output_url) triggerAiDepthExtraction(result.backgroundPlateUrl ?? result.render.background_plate_url ?? result.render.output_url)
                            await hydrateLatestState(project.backendProject!.id, false)
                          } catch (err: any) {
                            setFinalError(err.message)
                          } finally {
                            setBusy(null)
                          }
                        }}
                        className="rounded-full border border-white/[0.08] px-3 py-1 text-xs text-white/65 hover:bg-white/[0.06] disabled:text-white/24"
                      >
                        Nieuwe hoek
                      </button>
                    )}
                    <button type="button" onClick={downloadFinalRender} disabled={downloadStatus === 'Downloaden...'} className="rounded-full border border-white/[0.08] px-3 py-1 text-xs text-white/65 hover:bg-white/[0.06] disabled:text-white/24">
                      {downloadStatus ?? 'Download'}
                    </button>
                  </div>
                </div>
              </div>
            )}
            {project.finalRender?.src && beautyPreviewUrl && (
              <div className="mt-3 rounded-lg border border-white/[0.07] bg-white/[0.03] p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold text-white/70">Beauty versus Final</p>
                    <p className="mt-0.5 text-[10px] text-white/34">Controleer camera, crop, schaal en productpositie.</p>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={compareSlider}
                    onChange={(event) => setCompareSlider(Number(event.target.value))}
                    className="w-28 accent-[#facc15]"
                  />
                </div>
                <div className="relative mt-3 aspect-[4/3] overflow-hidden rounded-md bg-black/35">
                  <img
                    src={beautyPreviewUrl}
                    alt="Voor"
                    className="absolute inset-0 h-full w-full object-contain"
                  />
                  <div className="absolute inset-y-0 left-0 overflow-hidden" style={{ width: `${compareSlider}%` }}>
                    <img src={project.finalRender.src} alt="Na" className="h-full w-full object-contain" style={{ width: `${10000 / Math.max(compareSlider, 1)}%` }} />
                  </div>
                  <div className="absolute inset-y-0 w-px bg-[#facc15]" style={{ left: `${compareSlider}%` }} />
                  <div className="absolute bottom-2 left-2 rounded-full bg-black/70 px-2 py-1 text-[10px] text-white/60">Final</div>
                  <div className="absolute bottom-2 right-2 rounded-full bg-black/70 px-2 py-1 text-[10px] text-white/60">Beauty</div>
                </div>
              </div>
            )}
          </section>

          <section className="mt-6 rounded-lg border border-white/[0.07] bg-white/[0.03] p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-white/70">Jobs & kosten</p>
                <p className="mt-1 text-xs text-white/36">
                  {providerStats
                    ? `${providerStats.summary.totalRuns} runs · ${providerStats.summary.processing} actief · ${providerStats.summary.failed} failed`
                    : 'Nog geen providerdata.'}
                </p>
              </div>
              {getStoredProjectId(project) && (
                <button
                  type="button"
                  onClick={() => void refreshProviderStats()}
                  className="rounded-full border border-white/[0.08] px-3 py-1.5 text-xs text-white/55 hover:bg-white/[0.06]"
                >
                  Refresh
                </button>
              )}
            </div>
            {providerStats?.summary.totalRuns ? (
              <div className="mt-3 space-y-2">
                <div className="grid grid-cols-3 gap-2 text-[10px] text-white/38">
                  <div className="rounded-md border border-white/[0.06] bg-black/20 p-2">Latency {Math.round(providerStats.summary.totalLatencyMs / Math.max(providerStats.summary.completed, 1))}ms</div>
                  <div className="rounded-md border border-white/[0.06] bg-black/20 p-2">Kosten {providerStats.summary.totalCost ? providerStats.summary.totalCost.toFixed(3) : '-'}</div>
                  <div className="rounded-md border border-white/[0.06] bg-black/20 p-2">Failed {providerStats.summary.failed}</div>
                </div>
                {providerStats.runs.slice(0, 4).map((run) => (
                  <div key={run.id} className="flex items-center justify-between gap-2 rounded-md border border-white/[0.06] bg-black/20 px-2 py-1.5">
                    <div className="min-w-0">
                      <p className="truncate text-[11px] text-white/62">{run.provider_type} · {run.status}</p>
                      <p className="truncate text-[10px] text-white/30">{run.model_name} · retry {run.retry_count}</p>
                    </div>
                    {run.status === 'failed' && (
                      <button type="button" onClick={() => void retryRun(run.id)} className="rounded-full border border-[#facc15]/25 px-2.5 py-1 text-[10px] text-[#facc15] hover:bg-[#facc15]/10">
                        Retry
                      </button>
                    )}
                  </div>
                ))}
              </div>
            ) : null}
          </section>

          <section className="mt-6 rounded-lg border border-white/[0.07] bg-white/[0.03] p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-white/70">Rollback</p>
                <p className="mt-1 text-xs text-white/36">Zet canonical, mesh of final render terug naar een eerdere versie.</p>
              </div>
              {getStoredProjectId(project) && (
                <button type="button" onClick={() => void cleanupStorage()} className="rounded-full border border-white/[0.08] px-3 py-1.5 text-xs text-white/50 hover:bg-white/[0.06]">
                  Cleanup
                </button>
              )}
            </div>
            <div className="mt-3 space-y-2">
              <button
                type="button"
                onClick={() => void rollbackCanonicalSet()}
                disabled={!project.canonicalSet || project.canonicalSet.version <= 1}
                className="w-full rounded-md border border-white/[0.06] bg-black/20 px-3 py-2 text-left text-xs text-white/55 hover:bg-white/[0.05] disabled:text-white/22"
              >
                Canonical terug naar v{Math.max((project.canonicalSet?.version ?? 1) - 1, 1)}
              </button>
              {reconstructionVersions.slice(0, 3).map((version) => (
                <button
                  key={version.id}
                  type="button"
                  onClick={() => void rollbackReconstruction(version.id)}
                  disabled={version.id === project.reconstruction?.id}
                  className="w-full rounded-md border border-white/[0.06] bg-black/20 px-3 py-2 text-left text-xs text-white/55 hover:bg-white/[0.05] disabled:text-white/22"
                >
                  Mesh {version.route} · {version.status} · {new Date(version.created_at).toLocaleDateString('nl-NL')}
                </button>
              ))}
              {finalRenderVersions.slice(0, 3).map((version) => (
                <button
                  key={version.id}
                  type="button"
                  onClick={() => void rollbackFinalRender(version.id)}
                  disabled={version.id === project.finalRenderRecord?.id}
                  className="w-full rounded-md border border-white/[0.06] bg-black/20 px-3 py-2 text-left text-xs text-white/55 hover:bg-white/[0.05] disabled:text-white/22"
                >
                  Final {version.status} · {version.resolution} · {new Date(version.created_at).toLocaleDateString('nl-NL')}
                </button>
              ))}
            </div>
          </section>
        </div>

        <div className="border-t border-white/[0.08] p-4">
          <button
            type="button"
            disabled={!sourceReady}
            onClick={() => {
              setProject((prev) => ({ ...prev, activeStep: prev.reconstruction ? 'studio' : 'mesh' }))
              if (!project.reconstruction) void startMeshReview('single-view')
            }}
            className={[
              'h-10 w-full rounded-full text-sm font-semibold transition-colors',
              sourceReady ? 'bg-white text-black hover:bg-[#facc15]' : 'bg-white/[0.05] text-white/25',
            ].join(' ')}
          >
            Open studio
          </button>
        </div>

    </>
  )

  const overlayPasses: { key: 'light' | 'productLayer' | 'composite' | 'bgComposite'; label: string; src: string | undefined; icon: string }[] = [
    { key: 'light', label: 'Light map', src: lightMapPreviewUrl, icon: 'M12 2L2 7l10 5 10-5zM2 17l10 5 10-5M2 12l10 5 10-5' },
    { key: 'productLayer', label: 'Product layer', src: productLayerUrl, icon: 'M12 2a10 10 0 100 20 10 10 0 000-20zM12 8v8M8 12h8' },
    { key: 'composite', label: 'Composite', src: finalCompositeUrl ?? project.finalRender?.src, icon: 'M4 4h16v16H4zM9 9h6v6H9z' },
    { key: 'bgComposite', label: 'Background + product', src: backgroundPlateUrl, icon: 'M4 4h16v16H4zM12 2v4M12 18v4M2 12h4M18 12h4' },
  ]
  const activeOverlaySrc = viewportOverlay === '__depth'
    ? (aiDepthUrl ?? depthPreviewUrl)
    : viewportOverlay === 'bgComposite'
    ? undefined  // handled separately as layered composite
    : viewportOverlay ? overlayPasses.find((p) => p.key === viewportOverlay)?.src : undefined
  const splatFrameSplatSrc = splatAlignment?.splatUrl ?? null
  const derivedFrameSpzSrc = splatFrameSplatSrc?.replace(/world_hq\.splat(?=\?|$)/i, 'world.spz') ?? null
  const splatFrameSpzSrc = localPathToHupheFileUrl(splatAlignment?.spzPath)
    ?? (derivedFrameSpzSrc !== splatFrameSplatSrc ? derivedFrameSpzSrc : null)
  const splatFrameViewerSrc = splatFramePreferSpz && splatFrameSpzSrc
    ? splatFrameSpzSrc
    : splatFrameSplatSrc ?? splatFrameSpzSrc
  const splatFrameCompositeSrc = finalCompositeUrl ?? project.finalRender?.src ?? backgroundPlateUrl ?? project.sourceImage?.src

  const viewportContent = (
    <div ref={viewportShellRef} className="relative h-full w-full">
      {backgroundLocked && viewportOverlay === 'composite' && (
        <div className="pointer-events-none absolute left-3 top-3 z-40 flex items-center gap-1.5 rounded-full bg-black/50 px-2.5 py-1 backdrop-blur-sm">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-[#facc15]">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0110 0v4" />
          </svg>
          <span className="text-[11px] font-medium text-white/70">Achtergrond vergrendeld</span>
        </div>
      )}
      {/* Point-alignment: transparent canvas overlay for picking scene points */}
      {splatPuntMode === 'scene' && (
        <div
          className="absolute inset-0 z-30 cursor-crosshair"
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect()
            const x = (e.clientX - rect.left) / rect.width
            const y = (e.clientY - rect.top) / rect.height
            setPuntenScene((prev) => [...prev, { x, y }])
          }}
        >
          {puntenScene.map((p, i) => (
            <div
              key={i}
              className="pointer-events-none absolute flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white/60 bg-sky-500 text-[9px] font-bold text-white shadow-lg"
              style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}
            >
              {i + 1}
            </div>
          ))}
          <div className="pointer-events-none absolute bottom-20 left-1/2 -translate-x-1/2">
            <div className="rounded-full bg-black/70 px-4 py-2 text-[11px] text-sky-200 backdrop-blur-sm">
              {puntenScene.length < puntenFoto.length
                ? `Klik punt ${puntenScene.length + 1} van ${puntenFoto.length} aan in de scène`
                : 'Klik "Uitlijnen" om toe te passen'}
            </div>
          </div>
        </div>
      )}
      {/* Point-alignment: draggable/resizable/zoomable photo panel */}
      {splatPuntMode !== 'off' && (() => {
        const refImg = finalCompositeUrl ?? project.finalRender?.src ?? backgroundPlateUrl ?? project.sourceImage?.src
        if (!refImg) return null
        const imgH = Math.round(puntPanelW / imgNaturalAspect)
        const panelX = puntPanelPos?.x ?? (window.innerWidth - puntPanelW - 16)
        const panelY = puntPanelPos?.y ?? (window.innerHeight - imgH - 160)

        const startPanelDrag = (e: React.MouseEvent) => {
          e.preventDefault()
          const ox = e.clientX - panelX
          const oy = e.clientY - panelY
          const onMove = (ev: MouseEvent) => {
            setPuntPanelPos({
              x: Math.max(0, Math.min(window.innerWidth - puntPanelW, ev.clientX - ox)),
              y: Math.max(0, Math.min(window.innerHeight - 60, ev.clientY - oy)),
            })
          }
          const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
          window.addEventListener('mousemove', onMove)
          window.addEventListener('mouseup', onUp)
        }

        const startResizeDrag = (e: React.MouseEvent) => {
          e.preventDefault()
          e.stopPropagation()
          const startX = e.clientX
          const startW = puntPanelW
          const onMove = (ev: MouseEvent) => {
            setPuntPanelW(Math.max(200, Math.min(700, startW + (ev.clientX - startX))))
          }
          const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
          window.addEventListener('mousemove', onMove)
          window.addEventListener('mouseup', onUp)
        }

        const onImgMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
          if (e.button !== 0) return
          imgPanStartRef.current = { x: e.clientX, y: e.clientY, ox: imgOffset.x, oy: imgOffset.y, moved: false }
        }

        const onImgMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
          if (!imgPanStartRef.current) return
          const dx = e.clientX - imgPanStartRef.current.x
          const dy = e.clientY - imgPanStartRef.current.y
          if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
            imgPanStartRef.current.moved = true
            const rect = e.currentTarget.getBoundingClientRect()
            const cw = rect.width
            const ch = imgH
            setImgOffset({
              x: Math.min(0, Math.max(cw - cw * imgZoom, imgPanStartRef.current.ox + dx)),
              y: Math.min(0, Math.max(ch - ch * imgZoom, imgPanStartRef.current.oy + dy)),
            })
          }
        }

        const onImgMouseUp = (e: React.MouseEvent<HTMLDivElement>) => {
          const start = imgPanStartRef.current
          imgPanStartRef.current = null
          if (!start || start.moved || splatPuntMode !== 'foto') return
          const rect = e.currentTarget.getBoundingClientRect()
          const x = Math.max(0, Math.min(1, (e.clientX - rect.left - imgOffset.x) / (rect.width * imgZoom)))
          const y = Math.max(0, Math.min(1, (e.clientY - rect.top - imgOffset.y) / (imgH * imgZoom)))
          setPuntenFoto((prev) => [...prev, { x, y }])
        }

        return (
          <div
            className="fixed z-50 overflow-hidden rounded-xl border border-white/15 bg-black/90 shadow-2xl backdrop-blur-md"
            style={{ left: panelX, top: panelY, width: puntPanelW }}
          >
            {/* Draggable header */}
            <div
              className="flex cursor-grab items-center justify-between px-2.5 py-2 select-none active:cursor-grabbing"
              onMouseDown={startPanelDrag}
            >
              <span className="text-[11px] font-semibold text-white/70">
                {splatPuntMode === 'foto' ? '📍 Stap 1: klik punten op composite' : '📍 Stap 2: klik in de scène'}
              </span>
              <button type="button" onClick={resetPuntMode} className="ml-2 shrink-0 text-[13px] leading-none text-white/40 hover:text-white/70">✕</button>
            </div>

            {/* Zoomable/pannable image area */}
            <div
              ref={imgContainerRef}
              className="relative mx-2 overflow-hidden rounded-lg select-none"
              style={{
                height: imgH,
                cursor: imgZoom > 1
                  ? (imgPanStartRef.current?.moved ? 'grabbing' : 'grab')
                  : (splatPuntMode === 'foto' ? 'crosshair' : 'default'),
              }}
              onMouseDown={onImgMouseDown}
              onMouseMove={onImgMouseMove}
              onMouseUp={onImgMouseUp}
              onMouseLeave={() => { imgPanStartRef.current = null }}
            >
              {/* Scaled image + markers in one layer */}
              <div
                style={{
                  position: 'absolute',
                  left: imgOffset.x,
                  top: imgOffset.y,
                  width: `${imgZoom * 100}%`,
                  height: `${imgZoom * 100}%`,
                }}
              >
                <img
                  src={refImg}
                  className="block h-full w-full"
                  style={{ objectFit: 'fill', pointerEvents: 'none', userSelect: 'none' }}
                  draggable={false}
                  onLoad={(e) => {
                    const img = e.currentTarget
                    if (img.naturalHeight > 0) setImgNaturalAspect(img.naturalWidth / img.naturalHeight)
                  }}
                />
                {puntenFoto.map((p, i) => (
                  <div
                    key={i}
                    className="pointer-events-none absolute flex h-5 w-5 items-center justify-center rounded-full border-2 border-white/70 bg-orange-500 text-[8px] font-bold text-white shadow-lg"
                    style={{
                      left: `${p.x * 100}%`,
                      top: `${p.y * 100}%`,
                      transform: `translate(-50%, -50%) scale(${1 / imgZoom})`,
                    }}
                  >
                    {i + 1}
                  </div>
                ))}
              </div>
              {/* Zoom level indicator */}
              {imgZoom > 1 && (
                <div className="pointer-events-none absolute right-1.5 top-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[9px] text-white/60">
                  {Math.round(imgZoom * 100)}%
                </div>
              )}
            </div>

            {/* Controls */}
            <div className="px-2.5 pb-2.5 pt-2 space-y-1.5">
              {imgZoom > 1 && (
                <button
                  type="button"
                  onClick={() => { setImgZoom(1); setImgOffset({ x: 0, y: 0 }) }}
                  className="rounded border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[9px] text-white/40 hover:bg-white/[0.08]"
                >
                  Reset zoom
                </button>
              )}
              {splatPuntMode === 'foto' && puntenFoto.length === 0 && (
                <p className="text-[9px] text-white/40">Scroll om in te zoomen · Klik herkenbare punten in de achtergrond aan (bijv. hoeken van het blok)</p>
              )}
              {splatPuntMode === 'foto' && puntenFoto.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSplatPuntMode('scene')}
                  className="w-full rounded-md border border-sky-400/25 bg-sky-500/20 py-1.5 text-[11px] font-medium text-sky-300 hover:bg-sky-500/30"
                >
                  Klaar → Klik nu in de scène ({puntenFoto.length} punt{puntenFoto.length !== 1 ? 'en' : ''})
                </button>
              )}
              {splatPuntMode === 'scene' && (
                <>
                  {puntenScene.length >= puntenFoto.length && puntenFoto.length > 0 && (
                    <button
                      type="button"
                      onClick={berekenPuntUitlijning}
                      className="w-full rounded-md border border-emerald-400/25 bg-emerald-500/20 py-1.5 text-[11px] font-medium text-emerald-300 hover:bg-emerald-500/30"
                    >
                      Uitlijnen toepassen
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => { setSplatPuntMode('foto'); setPuntenScene([]) }}
                    className="w-full rounded-md border border-white/10 bg-white/[0.04] py-1 text-[11px] font-medium text-white/40 hover:bg-white/[0.07]"
                  >
                    ← Composite opnieuw
                  </button>
                </>
              )}
              <p className="text-center text-[9px] text-white/25">
                {puntenFoto.length} composite · {puntenScene.length} scène
              </p>
            </div>

            {/* Resize handle */}
            <div
              className="absolute bottom-0 right-0 h-5 w-5 cursor-se-resize opacity-40 hover:opacity-80"
              onMouseDown={startResizeDrag}
            >
              <svg width="10" height="10" viewBox="0 0 10 10" className="absolute bottom-1 right-1 text-white/60">
                <path d="M9 1L1 9M9 5L5 9M9 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
              </svg>
            </div>
          </div>
        )
      })()}
      <ReconstructingOverlay visible={envReconstructing} label="Reconstructing environment" />
      <ReconstructingOverlay visible={finalLoading || !!busy} label={busy || 'Composing image'} />
      {splatFrameViewerOpen && splatFrameViewerSrc && (
        <div className="pointer-events-none absolute inset-4 z-[45] flex items-center justify-center">
          <div
            className="pointer-events-auto relative overflow-hidden rounded-sm border border-cyan-300/55 bg-black shadow-2xl"
            style={{ aspectRatio: '16 / 9', width: 'min(92%, calc((100vh - 180px) * 16 / 9))' }}
          >
            <SplatFrameViewer
              src={splatFrameViewerSrc}
              xFlip={splatFrameXFlip}
              onPoseChange={setSplatFramePose}
              onReadyPose={(pose) => useWorldLabsReferencePose(pose)}
            />
            {splatFrameCompositeSrc && splatFrameCompositeOpacity > 0 && (
              <img
                src={splatFrameCompositeSrc}
                draggable={false}
                className="pointer-events-none absolute inset-0 h-full w-full object-cover"
                style={{ opacity: splatFrameCompositeOpacity }}
              />
            )}
            <div className="pointer-events-none absolute left-2 top-2 rounded-full border border-white/10 bg-black/70 px-2.5 py-1 text-[10px] font-semibold text-cyan-100 shadow-lg backdrop-blur">
              {splatFramePose
                ? `WorldLabs frame · cam ${splatFramePose.position.map((value) => value.toFixed(2)).join(', ')}`
                : 'WorldLabs frame · camera laden'}
            </div>
            <div className="absolute bottom-2 left-2 right-2 flex flex-wrap items-center justify-between gap-2 rounded-full border border-white/10 bg-black/72 px-3 py-2 shadow-xl backdrop-blur-md">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-medium text-white/45">Composite</span>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={splatFrameCompositeOpacity}
                  onChange={(e) => setSplatFrameCompositeOpacity(Number(e.currentTarget.value))}
                  className="h-1 w-28 accent-cyan-300"
                />
                <span className="w-7 text-right text-[10px] font-medium text-white/45">
                  {Math.round(splatFrameCompositeOpacity * 100)}%
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                {splatFramePose && (
                  <button
                    type="button"
                    onClick={() => useWorldLabsReferencePose(splatFramePose, true)}
                    className="rounded-full border border-cyan-300/35 bg-cyan-400/15 px-2.5 py-1 text-[10px] font-semibold text-cyan-100 transition-colors hover:bg-cyan-400/25"
                  >
                    Gebruik huidige view als basis
                  </button>
                )}
                {splatFrameSpzSrc && splatFrameSplatSrc && (
                  <button
                    type="button"
                    onClick={() => setSplatFramePreferSpz((v) => !v)}
                    className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10px] font-semibold text-white/55 transition-colors hover:bg-white/[0.10]"
                  >
                    {splatFramePreferSpz ? 'SPZ' : 'SPLAT'}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setSplatFrameXFlip((v) => !v)}
                  className={[
                    'rounded-full border px-2.5 py-1 text-[10px] font-semibold transition-colors',
                    splatFrameXFlip
                      ? 'border-cyan-300/35 bg-cyan-400/15 text-cyan-100'
                      : 'border-white/10 bg-white/[0.04] text-white/45 hover:bg-white/[0.08]',
                  ].join(' ')}
                >
                  X flip {splatFrameXFlip ? 'aan' : 'uit'}
                </button>
                <button
                  type="button"
                  onClick={() => setSplatFrameViewerOpen(false)}
                  className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10px] font-semibold text-white/55 transition-colors hover:bg-white/[0.10]"
                >
                  Sluiten
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {!splatViewerUrl && (
        <Scene3DEditor
          ref={studioRef}
          key={sceneStorageKey}
          storageKey={sceneStorageKey}
          className="h-full w-full rounded-lg"
          onSceneDirty={() => {
            markRenderPacketStale()
            setSceneControls(studioRef.current?.getSceneControls() ?? null)
          }}
          hideProperties
          overlayImageSrc={viewportOverlay === 'bgComposite' ? undefined : activeOverlaySrc}
          overlayOpacity={overlayOpacity}
          productOverlaySrc={undefined}
          productOverlayBlend="normal"
          backgroundPlateSrc={viewportOverlay === 'bgComposite' ? backgroundPlateUrl : undefined}
          transparentCanvas={viewportOverlay === 'bgComposite'}
          debugRings={debugRings}
          viewMode={viewMode}
          environmentMeshUrls={envMappingEnabled ? envMeshUrls : undefined}
          splatAlignment={splatVisible ? splatAlignment : null}
          onOrbitChange={(position, target) => setCurrentCameraState({ position, target })}
        />
      )}
      {sourceReady && (
        <div className="pointer-events-none absolute inset-0 z-20">
          <div className="pointer-events-auto absolute bottom-8 left-1/2 flex w-[clamp(360px,40%,640px)] -translate-x-1/2 items-center gap-2">
            <div className="min-w-0 flex-1">
              <AtelierPromptBar
                ref={promptBarRef}
                placeholder="Beschrijf de commercial productfoto..."
                busyPlaceholder="Foto wordt gemaakt..."
                loading={finalLoading || !!busy}
                disabled={false}
                onSubmit={(prompt) => {
                  if (promptBarMode === 'retry' && !prompt) {
                    void handleFinalPrompt(project.finalRender!.prompt)
                  } else {
                    void captureRenderPacket(prompt || undefined)
                  }
                }}
                mode={promptBarMode}
                onToggleLock={async () => {
                  const willLock = !backgroundLocked

                  // Confirm before unlocking — this deletes the panorama and env views
                  if (!willLock && backgroundLocked) {
                    const confirmed = window.confirm(
                      'Weet je zeker dat je de achtergrond wilt ontgrendelen? De panorama en alle omgevingsaanzichten worden verwijderd.'
                    )
                    if (!confirmed) return
                    // Delete env view files
                    const api = getProductStudioApi()
                    if (api && project.finalRenderRecord?.background_plate_url && project.backendProject) {
                      ;(api as any).deleteEnvViews?.({
                        projectId: project.backendProject.id,
                        backgroundPlateUrl: project.finalRenderRecord.background_plate_url as string,
                      })
                      // Clear env metadata on the version
                      if (project.finalRenderRecord) {
                        const versionId = project.finalRenderRecord.id
                        const cleanMeta = { ...(project.finalRenderRecord.layer_metadata ?? {}) } as Record<string, unknown>
                        delete cleanMeta.env_mesh_url
                        delete cleanMeta.env_views_ready
                        delete cleanMeta.env_source_background
                        setProject((prev) => ({
                          ...prev,
                          finalRenderRecord: prev.finalRenderRecord ? { ...prev.finalRenderRecord, layer_metadata: cleanMeta } : prev.finalRenderRecord,
                        }))
                        setFinalRenderVersions((prev) => prev.map((v) => v.id === versionId ? { ...v, layer_metadata: cleanMeta } : v))
                        ;(api as any).updateFinalRenderMetadata?.({ versionId, layerMetadata: cleanMeta })
                      }
                    }
                    setEnvViewUrls([])
                    setEnvPanoramaUrl(null)
                    setEnvMeshUrls([])
                    setBackgroundLocked(false)
                    return
                  }

                  setBackgroundLocked(willLock)
                  if (willLock && project.finalRenderRecord?.background_plate_url && project.backendProject) {
                    const bgUrl = project.finalRenderRecord.background_plate_url as string
                    const projectId = project.backendProject.id
                    setEnvReconstructing(true)
                    const api = getProductStudioApi()
                    if (api && (api as any).reconstructEnvironment) {
                      ;(api as any).reconstructEnvironment({ backgroundPlateUrl: bgUrl, projectId })
                        .then((result: any) => {
                          if (result?.ok && result.meshUrl) {
                            setEnvMeshUrls((prev) => [...prev, result.meshUrl])
                            if (result.viewUrls) setEnvViewUrls(result.viewUrls)
                            if (result.panoramaUrl) setEnvPanoramaUrl(result.panoramaUrl)
                            console.log('[env-reconstruct] Multi-view mesh ready:', result.meshUrl)
                            // Persist env mesh info on the source version
                            if (project.finalRenderRecord) {
                              const versionId = project.finalRenderRecord.id
                              const updatedMeta = { ...(project.finalRenderRecord.layer_metadata ?? {}), env_mesh_url: result.meshUrl, env_views_ready: true, env_source_background: result.backgroundPlateUrl ?? bgUrl }
                              setProject((prev) => ({
                                ...prev,
                                finalRenderRecord: prev.finalRenderRecord ? { ...prev.finalRenderRecord, layer_metadata: updatedMeta } : prev.finalRenderRecord,
                              }))
                              setFinalRenderVersions((prev) => prev.map((v) => v.id === versionId ? { ...v, layer_metadata: updatedMeta } : v))
                              // Update in database
                              ;(api as any).updateFinalRenderMetadata?.({ versionId, layerMetadata: updatedMeta })
                            }
                          }
                          if (!result?.ok) console.error('[env-reconstruct] Failed:', result?.error)
                        })
                        .catch((err: any) => console.error('[env-reconstruct] Failed:', err))
                        .finally(() => setEnvReconstructing(false))
                    } else {
                      setEnvReconstructing(false)
                    }
                  }
                }}
              />
            </div>
          </div>
          {finalError && (
            <p className="pointer-events-auto absolute bottom-24 left-1/2 w-[clamp(360px,40%,640px)] -translate-x-1/2 rounded-xl border border-red-400/20 bg-black/75 px-3 py-2 text-xs text-red-200 shadow-xl backdrop-blur">
              {finalError}
            </p>
          )}
          <div className="group pointer-events-auto absolute right-4 top-4 flex items-center justify-end gap-2">
          <div className="pointer-events-none flex translate-x-2 items-center gap-1 rounded-full border border-white/[0.10] bg-black/70 p-1 opacity-0 shadow-2xl backdrop-blur-xl transition-all duration-200 group-hover:pointer-events-auto group-hover:translate-x-0 group-hover:opacity-100">
            {([
              { mode: 'rings' as const, label: 'Rings', icon: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z' },
              { mode: 'solid' as const, label: 'Solid', icon: 'M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5' },
              { mode: 'material' as const, label: 'Material', icon: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 4a6 6 0 1 1 0 12 6 6 0 0 0 0-12z' },
              { mode: 'rendered' as const, label: 'Rendered', icon: 'M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83' },
              { mode: 'depth' as const, label: 'Depth map', icon: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3a7 7 0 0 1 7 7H5a7 7 0 0 1 7-7z' },
            ]).map((v) => {
              const active = v.mode === 'depth'
                ? viewportOverlay === '__depth'
                : v.mode === 'rings' ? !!debugRings : (!debugRings && viewMode === v.mode && viewportOverlay !== '__depth')
              return (
              <button
                key={v.mode}
                type="button"
                onClick={() => {
                  if (v.mode === 'depth') {
                    setViewportOverlay((prev) => prev === '__depth' ? null : '__depth' as any)
                  } else if (v.mode === 'rings') {
                    setViewportOverlay(null)
                    setDebugRings({ spacing: 0.04, width: 0.002 })
                    setViewMode('material')
                  } else {
                    setViewportOverlay(null)
                    setDebugRings(undefined)
                    setViewMode(v.mode)
                  }
                }}
                className={[
                  'group/btn relative flex h-8 w-8 items-center justify-center rounded-full transition-colors',
                  active
                    ? 'bg-white/20 text-white'
                    : 'text-white/50 hover:bg-white/10 hover:text-white/80',
                ].join(' ')}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d={v.icon} />
                </svg>
                <div className="pointer-events-none absolute top-[calc(100%+8px)] left-1/2 -translate-x-1/2 rounded-full border border-white/[0.12] bg-white px-2.5 py-1 text-[10px] font-semibold text-black opacity-0 shadow-lg transition-opacity duration-150 group-hover/btn:opacity-100 whitespace-nowrap">
                  {v.label}
                </div>
              </button>
              )
            })}
            <div className="mx-0.5 h-5 w-px bg-white/15" />
            {splatAlignment && (
              <button
                type="button"
                onClick={() => setSplatVisible((v) => !v)}
                className={[
                  'group/btn relative flex h-8 items-center gap-1 rounded-full px-2 transition-colors',
                  splatVisible
                    ? 'bg-sky-500/20 text-sky-400'
                    : 'text-white/50 hover:bg-white/10 hover:text-white/80',
                ].join(' ')}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
                </svg>
                <span className="text-[10px] font-semibold">3D</span>
                <div className="pointer-events-none absolute top-[calc(100%+8px)] left-1/2 -translate-x-1/2 rounded-full border border-white/[0.12] bg-white px-2.5 py-1 text-[10px] font-semibold text-black opacity-0 shadow-lg transition-opacity duration-150 group-hover/btn:opacity-100 whitespace-nowrap">
                  {splatVisible ? '3D achtergrond aan' : '3D achtergrond uit'}
                </div>
              </button>
            )}
            {splatFrameViewerSrc && (
              <button
                type="button"
                onClick={() => {
                  setSplatViewerUrl(null)
                  setSplatFrameViewerOpen((v) => !v)
                }}
                className={[
                  'group/btn relative flex h-8 items-center gap-1 rounded-full px-2 transition-colors',
                  splatFrameViewerOpen
                    ? 'bg-cyan-400/20 text-cyan-200'
                    : 'text-white/50 hover:bg-white/10 hover:text-white/80',
                ].join(' ')}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="5" width="18" height="14" rx="2" />
                  <path d="M8 9h8M8 13h5" />
                </svg>
                <span className="text-[10px] font-semibold">WL</span>
                <div className="pointer-events-none absolute top-[calc(100%+8px)] left-1/2 -translate-x-1/2 rounded-full border border-white/[0.12] bg-white px-2.5 py-1 text-[10px] font-semibold text-black opacity-0 shadow-lg transition-opacity duration-150 group-hover/btn:opacity-100 whitespace-nowrap">
                  WorldLabs splat in fotokader
                </div>
              </button>
            )}
            <div className="mx-0.5 h-5 w-px bg-white/15" />
            {overlayPasses.map((pass) => (
              <button
                key={pass.key}
                type="button"
                disabled={!pass.src}
                onClick={() => setViewportOverlay((prev) => prev === pass.key ? null : pass.key)}
                className={[
                  'group/btn relative flex h-8 w-8 items-center justify-center rounded-full transition-colors',
                  !pass.src
                    ? 'cursor-not-allowed text-white/15'
                    : viewportOverlay === pass.key
                      ? 'bg-white/20 text-white'
                      : 'text-white/50 hover:bg-white/10 hover:text-white/80',
                ].join(' ')}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d={pass.icon} />
                </svg>
                <div className="pointer-events-none absolute top-[calc(100%+8px)] left-1/2 -translate-x-1/2 rounded-full border border-white/[0.12] bg-white px-2.5 py-1 text-[10px] font-semibold text-black opacity-0 shadow-lg transition-opacity duration-150 group-hover/btn:opacity-100 whitespace-nowrap">
                  {pass.label}
                </div>
              </button>
            ))}
            {activeOverlaySrc && viewportOverlay && viewportOverlay !== 'bgComposite' && (
              <>
                <div className="mx-0.5 h-5 w-px bg-white/15" />
                <div className="flex items-center gap-2 rounded-full border border-white/10 bg-black/50 px-3 py-1 backdrop-blur-sm">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-white/50">
                    <circle cx="12" cy="12" r="10" /><path d="M12 8v8M8 12h8" />
                  </svg>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={overlayOpacity}
                    onChange={(e) => setOverlayOpacity(Number(e.currentTarget.value))}
                    className="h-1 w-20 accent-white/70"
                    title={`Transparantie: ${Math.round(overlayOpacity * 100)}%`}
                  />
                  <span className="w-7 text-right text-[10px] font-medium text-white/45">{Math.round(overlayOpacity * 100)}%</span>
                </div>
              </>
            )}
          </div>
          <button
            type="button"
            aria-label="Views tonen"
            title="Views"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/[0.10] bg-black/70 text-white/80 shadow-2xl backdrop-blur-xl transition-colors group-hover:bg-white group-hover:text-black"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </button>
          </div>
        </div>
      )}
    </div>
  )

  const rightPanelContent = (
    <>
      <div className="flex shrink-0 border-b border-white/[0.08]">
        {(['properties', 'editor', 'studio', 'archive', 'projects'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => {
              setRightTab(tab)
              if (tab === 'projects') {
                const api = getProductStudioApi()
                if (api?.listProjects) {
                  void api.listProjects().then((r: any) => { if (r?.projects) setAllProjects(r.projects) })
                }
              }
            }}
            className={[
              'flex-1 py-2.5 text-center text-xs font-semibold transition-colors',
              rightTab === tab
                ? 'border-b-2 border-[#facc15] text-white'
                : 'text-white/40 hover:text-white/70',
            ].join(' ')}
          >
            {tab === 'properties' ? 'Properties' : tab === 'editor' ? 'Editor' : tab === 'archive' ? 'Archive' : tab === 'projects' ? 'Projects' : 'Studio'}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {rightTab === 'properties' && sceneControls && (
          <div className="p-3">
            <Scene3DPropertiesPanel
              scene={sceneControls.scene}
              selectedObjectId={sceneControls.selectedObjectId}
              onUpdateObject={sceneControls.updateObject}
              onUpdateLight={sceneControls.updateLight}
              onEnvironmentChange={sceneControls.setEnvironment}
              cameraState={currentCameraState ?? sceneControls.getOrbitState()}
              onSetCamera={(position, target) => {
                setCurrentCameraState({ position, target })
                studioRef.current?.setCameraOrbit(position, target)
              }}
              inline
            />
          </div>
        )}
        {rightTab === 'properties' && !sceneControls && (
          <div className="flex h-32 items-center justify-center text-sm text-white/30">
            Laad een model om te bewerken
          </div>
        )}
        {rightTab === 'editor' && sceneControls && (
          <Scene3DEditorInline externalControls={sceneControls} />
        )}
        {rightTab === 'editor' && !sceneControls && (
          <div className="flex h-32 items-center justify-center text-sm text-white/30">
            Laad een model om te bewerken
          </div>
        )}
        <div style={{ display: rightTab === 'studio' ? 'contents' : 'none' }}>
          {sidebarContent}
        </div>
        {rightTab === 'archive' && (
          <div className="p-2">
            {finalRenderVersions.length === 0 ? (
              <div className="flex h-32 items-center justify-center text-sm text-white/30">
                Nog geen renders
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                {finalRenderVersions.map((version) => (
                  <div
                    key={version.id}
                    className="group relative overflow-hidden rounded-lg border border-white/[0.06] bg-black/30 transition-colors hover:border-white/[0.15]"
                  >
                    <button
                      type="button"
                      onClick={() => void restoreRenderState(version)}
                      className="w-full"
                    >
                      {version.output_url ? (
                        <img src={version.output_url} alt="" className="w-full" loading="lazy" />
                      ) : (
                        <div className="flex aspect-video items-center justify-center text-xs text-white/20">Geen preview</div>
                      )}
                    </button>
                    <div className="absolute right-1.5 top-1.5 flex items-center gap-1">
                      {version.layer_metadata?.env_views_ready && (
                        <div
                          title="3D omgeving beschikbaar"
                          className="flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white/50 backdrop-blur-sm"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 2L2 7l10 5 10-5-10-5z" />
                            <path d="M2 17l10 5 10-5" />
                            <path d="M2 12l10 5 10-5" />
                          </svg>
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => void restoreRenderState(version)}
                        title="Herstel camera en positie van dit moment"
                        className="flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white/50 backdrop-blur-sm transition-colors hover:bg-black/80 hover:text-white"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="12" r="10" />
                          <polyline points="12 6 12 12 16 14" />
                        </svg>
                      </button>
                    </div>
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent px-2 py-1.5">
                      <span className="text-[10px] text-white/60">
                        {new Date(version.created_at).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        {version.layer_metadata?.route === 'angle-variant' ? ' · Hoekvariant' : ''}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      {(() => {
        const archiveIdx = archivePreviewId ? finalRenderVersions.findIndex((v) => v.id === archivePreviewId) : -1
        const archiveVersion = archiveIdx >= 0 ? finalRenderVersions[archiveIdx] : null
        if (!archiveVersion) return null
        return (
          <div
            className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/85 backdrop-blur-sm"
            onClick={() => setArchivePreviewId(null)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowLeft' && archiveIdx > 0) setArchivePreviewId(finalRenderVersions[archiveIdx - 1].id)
              if (e.key === 'ArrowRight' && archiveIdx < finalRenderVersions.length - 1) setArchivePreviewId(finalRenderVersions[archiveIdx + 1].id)
              if (e.key === 'Escape') setArchivePreviewId(null)
            }}
            tabIndex={0}
            ref={(el) => el?.focus()}
          >
            <img
              src={archiveVersion.output_url ?? ''}
              alt=""
              className="max-h-[90vh] max-w-[90vw] rounded-lg shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            />
            {archiveIdx > 0 && (
              <button type="button" onClick={(e) => { e.stopPropagation(); setArchivePreviewId(finalRenderVersions[archiveIdx - 1].id) }} className="absolute left-4 rounded-full bg-black/50 p-2 text-white/70 hover:text-white">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
              </button>
            )}
            {archiveIdx < finalRenderVersions.length - 1 && (
              <button type="button" onClick={(e) => { e.stopPropagation(); setArchivePreviewId(finalRenderVersions[archiveIdx + 1].id) }} className="absolute right-4 rounded-full bg-black/50 p-2 text-white/70 hover:text-white">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
              </button>
            )}
            <div className="absolute bottom-6 text-center text-sm text-white/50">
              {archiveIdx + 1} / {finalRenderVersions.length}
            </div>
          </div>
        )
      })()}

      {rightTab === 'projects' && (
        <div className="p-3">
          {allProjects.length === 0 ? (
            <div className="flex h-32 items-center justify-center text-sm text-white/30">
              Geen projecten gevonden
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {allProjects.map((p) => (
                <div
                  key={p.id}
                  className={`group flex items-center gap-2.5 rounded-xl border px-3 py-2.5 transition-colors ${p.id === project.backendProject?.id ? 'border-[#facc15]/25 bg-[#facc15]/5' : 'border-white/[0.06] hover:border-white/[0.12] hover:bg-white/[0.03]'}`}
                >
                  {p.source_image_url ? (
                    <img src={p.source_image_url} alt="" className="h-10 w-10 shrink-0 rounded-lg object-cover" />
                  ) : (
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/[0.05]">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-white/25"><path d="M12 3l9 5v8l-9 5-9-5V8z"/></svg>
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    {renamingProjectId === p.id ? (
                      <input
                        autoFocus
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            const api = getProductStudioApi()
                            if (api?.renameProject && renameValue.trim()) {
                              void api.renameProject({ projectId: p.id, name: renameValue.trim() }).then(() => {
                                setAllProjects((prev) => prev.map((x) => x.id === p.id ? { ...x, name: renameValue.trim(), product_name: renameValue.trim() } : x))
                              })
                            }
                            setRenamingProjectId(null)
                          }
                          if (e.key === 'Escape') setRenamingProjectId(null)
                        }}
                        onBlur={() => setRenamingProjectId(null)}
                        className="w-full rounded bg-white/[0.08] px-1.5 py-0.5 text-sm text-white outline-none ring-1 ring-[#facc15]/40"
                      />
                    ) : (
                      <p className="truncate text-sm font-medium text-white/80">{p.product_name || p.name || 'Naamloos'}</p>
                    )}
                    <p className="mt-0.5 text-[10px] text-white/30">{new Date(p.updated_at).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      title="Hernoem"
                      onClick={() => { setRenamingProjectId(p.id); setRenameValue(p.product_name || p.name || '') }}
                      className="rounded-lg p-1.5 text-white/25 opacity-0 transition-opacity hover:text-white/60 group-hover:opacity-100"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    </button>
                    <button
                      type="button"
                      title="Verwijder project"
                      onClick={() => {
                        if (!confirm(`Project "${p.product_name || p.name || 'Naamloos'}" verwijderen?`)) return
                        const api = getProductStudioApi()
                        if (!api?.deleteProject) return
                        void api.deleteProject({ projectId: p.id }).then(() => {
                          setAllProjects((prev) => prev.filter((x) => x.id !== p.id))
                        })
                      }}
                      className="rounded-lg p-1.5 text-white/25 opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
                    </button>
                    {p.id !== project.backendProject?.id && (
                      <button
                        type="button"
                        title="Open project"
                        onClick={() => {
                          try { sessionStorage.setItem('huphe:resume-project-id', p.id) } catch { /* ignore */ }
                          setProject((prev) => ({ ...prev, backendProject: { id: p.id } as any }))
                        }}
                        className="rounded-lg p-1.5 text-white/25 opacity-0 transition-opacity hover:text-white/60 group-hover:opacity-100"
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  )

  if (!sourceReady && !busy) {
    const emptyState = (
      <div className="flex h-full min-h-0 w-full items-center justify-center bg-[#0a0a0a] text-white">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(event) => {
            void handleImageFile(event.target.files?.[0] ?? null)
            event.currentTarget.value = ''
          }}
        />
        <div className="flex flex-col items-center gap-6">
          <div className="flex h-20 w-20 items-center justify-center rounded-3xl border border-white/[0.08] bg-white/[0.04] text-[#facc15]">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3l9 5v8l-9 5-9-5V8z" />
              <path d="M12 13l9-5" />
              <path d="M12 13l-9-5" />
              <path d="M12 13v9" />
            </svg>
          </div>
          <div className="text-center">
            <h2 className="text-xl font-semibold text-white">Product Studio</h2>
            <p className="mt-2 max-w-sm text-sm leading-relaxed text-white/40">Upload een productfoto en de studio genereert automatisch reference views, een 3D model en fotorealistische renders.</p>
          </div>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="rounded-full bg-[#facc15] px-6 py-3 text-sm font-semibold text-black transition-colors hover:bg-[#fde68a]"
          >
            Create 3D
          </button>
          {error && <p className="text-xs text-red-300">{error}</p>}
        </div>
      </div>
    )
    if (renderLayout) return <>{renderLayout(null, emptyState)}</>
    return emptyState
  }

  if (busy && !sourceReady) {
    const loadingState = (
      <div className="flex h-full min-h-0 w-full items-center justify-center bg-[#0a0a0a] text-white">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#facc15]/20 border-t-[#facc15]" />
          <p className="text-sm text-[#facc15]">{busy}</p>
          {error && <p className="mt-2 text-xs text-red-300">{error}</p>}
        </div>
      </div>
    )
    if (renderLayout) return <>{renderLayout(null, loadingState)}</>
    return loadingState
  }

  const clayUrls = assetsPrep.sampleClayUrls ?? []
  const clayLightbox = clayLightboxIndex !== null && clayUrls.length > 0 ? (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/90 backdrop-blur-sm"
      onClick={() => setClayLightboxIndex(null)}
      onKeyDown={(e) => {
        if (e.key === 'Escape') setClayLightboxIndex(null)
        if (e.key === 'ArrowLeft') setClayLightboxIndex((i) => i !== null ? (i - 1 + clayUrls.length) % clayUrls.length : null)
        if (e.key === 'ArrowRight') setClayLightboxIndex((i) => i !== null ? (i + 1) % clayUrls.length : null)
      }}
      tabIndex={-1}
      ref={(el) => el?.focus()}
    >
      <img
        src={clayUrls[clayLightboxIndex]}
        className="max-h-[85vh] max-w-[85vw] rounded-lg shadow-2xl object-contain"
        onClick={(e) => e.stopPropagation()}
      />
      {/* teller */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-[11px] text-white/70">
        {clayLightboxIndex + 1} / {clayUrls.length}
      </div>
      {/* links */}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setClayLightboxIndex((i) => i !== null ? (i - 1 + clayUrls.length) % clayUrls.length : null) }}
        className="absolute left-4 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-3 text-white/70 hover:bg-white/20 text-lg leading-none"
      >
        ‹
      </button>
      {/* rechts */}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setClayLightboxIndex((i) => i !== null ? (i + 1) % clayUrls.length : null) }}
        className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-3 text-white/70 hover:bg-white/20 text-lg leading-none"
      >
        ›
      </button>
      {/* sluiten */}
      <button
        type="button"
        onClick={() => setClayLightboxIndex(null)}
        className="absolute right-6 top-6 rounded-full bg-white/10 p-2 text-white/60 hover:bg-white/20"
      >
        ✕
      </button>
    </div>
  ) : null

  const orbitVideoModal = orbitVideoExpanded && orbitBelongsToCurrentRender && orbitTest.videoUrl ? (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/90 backdrop-blur-sm"
      onClick={() => setOrbitVideoExpanded(false)}
    >
      <video
        src={orbitTest.videoUrl}
        controls
        loop
        autoPlay
        muted
        className="max-h-[90vh] max-w-[90vw] rounded-lg shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      />
      <button
        type="button"
        onClick={() => setOrbitVideoExpanded(false)}
        className="absolute right-6 top-6 rounded-full bg-white/10 p-2 text-white/60 hover:bg-white/20"
      >
        ✕
      </button>
    </div>
  ) : null

  const orbitConfirmModal = orbitConfirmOpen ? (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={() => setOrbitConfirmOpen(false)}
    >
      <div
        className="w-[320px] rounded-lg border border-white/10 bg-[#161616] p-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-sm font-semibold text-white/80">Er bestaat al een render</p>
        <p className="mt-1.5 text-xs text-white/45">Wil je een nieuwe orbit-video genereren? De bestaande video wordt verwijderd.</p>
        <div className="mt-3 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setOrbitConfirmOpen(false)}
            className="rounded-full border border-white/10 px-3 py-1.5 text-xs text-white/60 hover:bg-white/[0.06]"
          >
            Annuleren
          </button>
          <button
            type="button"
            onClick={() => {
              setOrbitConfirmOpen(false)
              void runOrbitTest(true)
            }}
            className="rounded-full border border-emerald-400/25 px-3 py-1.5 text-xs font-medium text-emerald-400 hover:bg-emerald-400/10"
          >
            Ja, nieuwe maken
          </button>
        </div>
      </div>
    </div>
  ) : null

  if (renderLayout) {
    return (
      <>
        {renderLayout(rightPanelContent, viewportContent)}
        {lightboxImage && (
          <ImageLightbox
            image={{ label: lightboxImage[0], src: lightboxImage[1] }}
            currentIndex={lightboxIndex ?? 0}
            total={availableLightboxPreviews.length}
            onClose={() => setLightboxIndex(null)}
            onPrev={showPreviousLightboxImage}
            onNext={showNextLightboxImage}
          />
        )}
        {orbitConfirmModal}
        {orbitVideoModal}
        {clayLightbox}
        {splatViewerUrl && <SplatViewer src={splatViewerUrl} onClose={() => setSplatViewerUrl(null)} />}
      </>
    )
  }

  return (
    <div className="flex h-full min-h-0 w-full bg-[#0a0a0a] text-white">
      <main className="min-w-0 flex-1 p-4">
        {viewportContent}
      </main>
      <aside className="flex w-[360px] flex-shrink-0 flex-col border-l border-white/[0.08] bg-[#111]">
        {rightPanelContent}
      </aside>
      {lightboxImage && (
        <ImageLightbox
          image={{ label: lightboxImage[0], src: lightboxImage[1] }}
          currentIndex={lightboxIndex ?? 0}
          total={availableLightboxPreviews.length}
          onClose={() => setLightboxIndex(null)}
          onPrev={showPreviousLightboxImage}
          onNext={showNextLightboxImage}
        />
      )}
      {orbitConfirmModal}
      {clayLightbox}
    </div>
  )
}
