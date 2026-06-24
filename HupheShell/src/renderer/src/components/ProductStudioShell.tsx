import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { notifyIfCreditsRequired } from '../lib/credits-required'
import Scene3DEditor, { type Scene3DEditorHandle, type Scene3DRenderPacketPreview, type Scene3DSceneControls } from './Scene3DEditor'
import Scene3DPropertiesPanel from './Scene3DPropertiesPanel'
import { AtelierPromptBar } from './AtelierPromptBar'
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
  uploadRenderPass: (args: { projectId: string; passType: 'beauty' | 'depth' | 'normal' | 'object-mask' | 'calibration' | 'light-map'; dataUrl: string }) => Promise<any>
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

export default function ProductStudioShell({ initialImageSrc, renderLayout }: {
  initialImageSrc?: string | null
  renderLayout?: (sidebar: React.ReactNode, viewport: React.ReactNode) => React.ReactNode
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const contactSheetInputRef = useRef<HTMLInputElement>(null)
  const objectMaskInputRef = useRef<HTMLInputElement>(null)
  const studioRef = useRef<Scene3DEditorHandle>(null)
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
  const [rightTab, setRightTab] = useState<'editor' | 'studio'>('studio')
  const [sceneControls, setSceneControls] = useState<Scene3DSceneControls | null>(null)
  const [viewportOverlay, setViewportOverlay] = useState<'calibration' | 'light' | 'productLayer' | 'composite' | null>(null)

  useEffect(() => {
    if (rightTab !== 'editor') return
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

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(project)) } catch { /* ignore */ }
  }, [project])

  useEffect(() => {
    const projectId = getStoredProjectId(project)
    if (!projectId || hydratedProjectIdRef.current === projectId) return
    hydratedProjectIdRef.current = projectId
    void hydrateLatestState(projectId, false)
  }, [project.backendProject?.id, project.id])

  useEffect(() => {
    if (!activeStudioMeshUrl) return
    studioRef.current?.addModelFromUrl(activeStudioMeshUrl, texturedMeshReady ? 'Textured product' : 'Reconstructed product')
    if (texturedMeshReady) setRenderPacketStale(true)
  }, [activeStudioMeshUrl, texturedMeshReady])

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

  async function hydrateLatestState(projectId = getStoredProjectId(project), showBusy = true) {
    if (!projectId) return
    const api = getProductStudioApi()
    if (!api) return
    if (showBusy) setBusy('Project synchroniseren...')
    try {
      const result = await api.getLatestState(projectId)
      if (!result?.ok) throw new Error(result?.error || 'Project synchroniseren mislukt.')
      setProject((prev) => projectFromLatestState(prev, result))
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

    setProject((prev) => ({
      ...prev,
      canonicalSet,
      reconstruction,
      activeStep: 'mesh',
      updatedAt: new Date().toISOString(),
    }))
    const bestMeshUrl = reconstruction.textured_mesh_url ?? reconstruction.mesh_url
    if (bestMeshUrl) {
      studioRef.current?.addModelFromUrl(bestMeshUrl, reconstruction.textured_mesh_url ? 'Textured product' : 'Reconstructed product')
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

  async function captureRenderPacket() {
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
      ])
      const [beautyUpload, calibrationUpload, objectMaskUpload, lightMapUpload, depthUpload, normalUpload] = uploads
      if (beautyUpload && !beautyUpload.ok) throw new Error(beautyUpload.error || 'Beauty upload mislukt.')
      if (calibrationUpload && !calibrationUpload.ok) throw new Error(calibrationUpload.error || 'Calibration upload mislukt.')
      if (objectMaskUpload && !objectMaskUpload.ok) throw new Error(objectMaskUpload.error || 'Object-mask upload mislukt.')
      if (lightMapUpload && !lightMapUpload.ok) throw new Error(lightMapUpload.error || 'Light-map upload mislukt.')
      if (depthUpload && !depthUpload.ok) throw new Error(depthUpload.error || 'Depth upload mislukt.')
      if (normalUpload && !normalUpload.ok) throw new Error(normalUpload.error || 'Normal upload mislukt.')

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

      // Stap 1: product layer automatisch genereren na lock
      setBusy('Product layer genereren...')
      const plResult = await api.generateProductLayer({
        projectId: project.backendProject.id,
        renderPacketId: renderPacketRecord.id,
      })
      if (!plResult?.ok) {
        setFinalError(plResult?.error || 'Product layer genereren mislukt.')
      }
      await hydrateLatestState(project.backendProject.id, false)
    } catch (err: any) {
      if (!notifyIfCreditsRequired(err)) setFinalError(err?.message || 'Renderpacket opslaan mislukt.')
    } finally {
      setBusy(null)
    }
  }

  async function handleFinalPrompt(prompt: string) {
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
            <div className="mt-3">
              <AtelierPromptBar
                placeholder="Beschrijf de commercial productfoto..."
                busyPlaceholder="Final render wordt gemaakt..."
                loading={finalLoading}
                disabled={finalRenderBlocked}
                onSubmit={handleFinalPrompt}
              />
            </div>
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
                  <button type="button" onClick={downloadFinalRender} disabled={downloadStatus === 'Downloaden...'} className="rounded-full border border-white/[0.08] px-3 py-1 text-xs text-white/65 hover:bg-white/[0.06] disabled:text-white/24">
                    {downloadStatus ?? 'Download'}
                  </button>
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

  const overlayPasses: { key: 'calibration' | 'light' | 'productLayer' | 'composite'; label: string; src: string | undefined; icon: string }[] = [
    { key: 'calibration', label: 'Calibration', src: calibrationPreviewUrl, icon: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z' },
    { key: 'light', label: 'Light map', src: lightMapPreviewUrl, icon: 'M12 2L2 7l10 5 10-5zM2 17l10 5 10-5M2 12l10 5 10-5' },
    { key: 'productLayer', label: 'Product layer', src: productLayerUrl, icon: 'M12 2a10 10 0 100 20 10 10 0 000-20zM12 8v8M8 12h8' },
    { key: 'composite', label: 'Composite', src: finalCompositeUrl ?? project.finalRender?.src, icon: 'M4 4h16v16H4zM9 9h6v6H9z' },
  ]
  const activeOverlaySrc = viewportOverlay ? overlayPasses.find((p) => p.key === viewportOverlay)?.src : undefined

  const viewportContent = (
    <div className="relative h-full w-full">
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
        overlayImageSrc={activeOverlaySrc}
      />
      {sourceReady && (
        <div className="absolute bottom-4 left-20 z-10 flex items-center gap-2">
          <button
            type="button"
            onClick={captureRenderPacket}
            disabled={!!busy}
            className="flex items-center gap-2 rounded-full bg-[#facc15] px-4 py-2 text-sm font-bold text-black shadow-lg transition-all hover:bg-[#fde047] active:scale-95 disabled:opacity-40 disabled:active:scale-100"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="shrink-0">
              <circle cx="8" cy="8.5" r="3" stroke="currentColor" strokeWidth="1.5" fill="none" />
              <path d="M5.5 2.5h5l1 2h2a1 1 0 011 1v7a1 1 0 01-1 1h-11a1 1 0 01-1-1v-7a1 1 0 011-1h2l1-2z" stroke="currentColor" strokeWidth="1.5" fill="none" />
            </svg>
            {busy ? 'Bezig...' : 'Take picture'}
          </button>
          <div className="flex items-center gap-1 rounded-full border border-white/[0.10] bg-black/60 p-1 backdrop-blur-sm">
            {overlayPasses.map((pass) => (
              <button
                key={pass.key}
                type="button"
                disabled={!pass.src}
                onClick={() => setViewportOverlay((prev) => prev === pass.key ? null : pass.key)}
                className={[
                  'group relative flex h-8 w-8 items-center justify-center rounded-full transition-colors',
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
                <div className="pointer-events-none absolute bottom-[calc(100%+8px)] left-1/2 -translate-x-1/2 rounded-lg border border-white/[0.08] bg-[#1c1c1c] px-2 py-1 text-[10px] font-semibold text-white/85 opacity-0 shadow-xl transition-opacity group-hover:opacity-100 whitespace-nowrap">
                  {pass.label}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )

  const rightPanelContent = (
    <>
      <div className="flex shrink-0 border-b border-white/[0.08]">
        {(['editor', 'studio'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setRightTab(tab)}
            className={[
              'flex-1 py-3 text-center text-sm font-semibold transition-colors',
              rightTab === tab
                ? 'border-b-2 border-[#facc15] text-white'
                : 'text-white/40 hover:text-white/70',
            ].join(' ')}
          >
            {tab === 'editor' ? 'Editor' : 'Product Studio'}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {rightTab === 'editor' && sceneControls && (
          <div className="p-3">
            <Scene3DPropertiesPanel
              scene={sceneControls.scene}
              selectedObjectId={sceneControls.selectedObjectId}
              onUpdateObject={sceneControls.updateObject}
              onUpdateLight={sceneControls.updateLight}
              onEnvironmentChange={sceneControls.setEnvironment}
              inline
            />
          </div>
        )}
        {rightTab === 'editor' && !sceneControls && (
          <div className="flex h-32 items-center justify-center text-sm text-white/30">
            Laad een model om te bewerken
          </div>
        )}
        <div style={{ display: rightTab === 'studio' ? 'contents' : 'none' }}>
          {sidebarContent}
        </div>
      </div>
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
    </div>
  )
}
