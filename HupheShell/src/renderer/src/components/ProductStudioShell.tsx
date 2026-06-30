import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { notifyIfCreditsRequired } from '../lib/credits-required'
import Scene3DEditor, { type Scene3DEditorHandle, type Scene3DRenderPacketPreview, type Scene3DSceneControls } from './Scene3DEditor'
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
  testOrbitSplat: (args: { projectId: string; imageUrl: string; arcDegrees?: number }) => Promise<any>
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
  const [allProjects, setAllProjects] = useState<any[]>([])
  const [renamingProjectId, setRenamingProjectId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [archivePreviewIndex, setArchivePreviewIndex] = useState<number | null>(null)
  const [aiDepthUrl, setAiDepthUrl] = useState<string | null>(null)
  const [envMeshUrls, setEnvMeshUrls] = useState<string[]>([])
  const [envViewUrls, setEnvViewUrls] = useState<string[]>([])
  const [envPanoramaUrl, setEnvPanoramaUrl] = useState<string | null>(null)
  const [envMappingEnabled, setEnvMappingEnabled] = useState(false)
  const [bakeProgress, setBakeProgress] = useState<{ phase: 'idle' | 'baking' | 'done' | 'error'; currentFrame: number; totalFrames: number; error?: string }>({ phase: 'idle', currentFrame: 0, totalFrames: 12 })
  const [orbitTest, setOrbitTest] = useState<{ phase: 'idle' | 'running' | 'done' | 'error'; step: string; colmap?: { registered: number; total: number; pct: number; pass: boolean }; videoUrl?: string; error?: string }>({ phase: 'idle', step: '' })
  const lastCameraParamsRef = useRef<{ projectionMatrix: number[]; viewMatrix: number[]; near: number; far: number; width: number; height: number; fovScale?: number } | null>(null)
  // Per-version local cache: model transform per archive photo (session only)
  const archiveTransformCache = useRef<Record<string, { position: [number,number,number]; rotation: [number,number,number]; scale: [number,number,number] }>>({})
  const activeArchiveVersionId = useRef<string | null>(null)
  const [sceneControls, setSceneControls] = useState<Scene3DSceneControls | null>(null)
  const [viewportOverlay, setViewportOverlay] = useState<'calibration' | 'light' | 'productLayer' | 'composite' | 'bgComposite' | '__depth' | null>(null)
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

  async function runOrbitTest() {
    const api = getProductStudioApi()
    if (!api || !project.backendProject) return
    const imageUrl = backgroundPlateUrl ?? project.sourceImage?.src
    if (!imageUrl) {
      setOrbitTest({ phase: 'error', step: '', error: 'Geen achtergrond foto geselecteerd.' })
      return
    }
    setOrbitTest({ phase: 'running', step: 'Video genereren via Seedance 2.0...' })
    try {
      setOrbitTest({ phase: 'running', step: 'Video genereren via Seedance 2.0...' })
      const result = await api.testOrbitSplat({ projectId: project.backendProject.id, imageUrl, arcDegrees: 120 })
      if (!result.ok) {
        setOrbitTest({ phase: 'error', step: '', error: result.error ?? 'Onbekende fout.' })
        return
      }
      setOrbitTest({ phase: 'done', step: '', colmap: result.colmap, videoUrl: result.videoUrl })
    } catch (err: any) {
      setOrbitTest({ phase: 'error', step: '', error: err?.message ?? 'Orbit test mislukt.' })
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
    const api = getProductStudioApi()
    if (!api || !(api as any).restoreRenderState) return

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

    try {
      const result = await (api as any).restoreRenderState({ renderPacketId: version.render_packet_id })
      if (!result?.ok) return

      const packet = result.packet as RenderPacket
      const scene = result.scene as StudioSceneVersion | null
      const manifest = packet.scene_manifest as any

      // Restore camera orbit position
      if (manifest?.camera?.position && manifest?.camera?.target) {
        studioRef.current?.setCameraOrbit(manifest.camera.position, manifest.camera.target)
      }

      // Restore model transform: eerst uit lokale cache, dan uit database
      const cached = archiveTransformCache.current[version.id]
      if (cached && studioRef.current) {
        const controls = studioRef.current.getSceneControls()
        const productObj = controls?.scene.objects.find((o) => o.type === 'gltf')
        if (controls && productObj) {
          controls.onObjectTransformed(productObj.id, cached.position, cached.rotation, cached.scale)
        }
      } else if (scene?.product_transform && studioRef.current) {
        const controls = studioRef.current.getSceneControls()
        if (controls) {
          const productObj = controls.scene.objects.find((o) => o.type === 'gltf')
          if (productObj) {
            const pt = scene.product_transform as { position?: [number, number, number]; rotation?: [number, number, number]; scale?: [number, number, number] }
            if (pt.position) controls.onObjectTransformed(productObj.id, pt.position, pt.rotation ?? productObj.rotation, pt.scale ?? productObj.scale)
          }
        }
      }

      // Set this version as active and switch to composite view
      setProject((prev) => ({
        ...prev,
        finalRenderRecord: version,
        finalRender: { prompt: version.prompt ?? '', src: version.output_url as string, createdAt: version.created_at },
        renderPacketRecord: packet,
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
                <p className="mt-1 text-xs text-white/36">Genereert een orbit-video van de achtergrond en test of COLMAP de frames kan reconstrueren. Diagnose: ≥80% = bruikbaar voor splat-training.</p>
              </div>
              <button
                type="button"
                onClick={() => void runOrbitTest()}
                disabled={orbitTest.phase === 'running' || !project.backendProject || (!backgroundPlateUrl && !project.sourceImage?.src)}
                className="shrink-0 rounded-full border border-emerald-400/25 px-3 py-1.5 text-xs font-medium text-emerald-400 hover:bg-emerald-400/10 disabled:cursor-not-allowed disabled:border-white/[0.06] disabled:text-white/24"
              >
                {orbitTest.phase === 'running' ? 'Bezig...' : orbitTest.phase === 'done' ? 'Opnieuw' : 'Starten'}
              </button>
            </div>
            {orbitTest.phase === 'running' && (
              <p className="mt-2 text-[10px] text-white/40">{orbitTest.step}</p>
            )}
            {orbitTest.phase === 'error' && (
              <p className="mt-2 rounded-md border border-red-400/20 bg-red-500/10 px-2 py-1.5 text-[10px] text-red-200">{orbitTest.error}</p>
            )}
            {orbitTest.phase === 'done' && orbitTest.colmap && (
              <div className={`mt-2 rounded-md border px-2 py-1.5 text-[10px] ${orbitTest.colmap.pass ? 'border-emerald-400/20 bg-emerald-500/10 text-emerald-200' : 'border-red-400/20 bg-red-500/10 text-red-200'}`}>
                {orbitTest.colmap.pass ? '✓ Geslaagd' : '✗ Gezakt'} — COLMAP: {orbitTest.colmap.registered}/{orbitTest.colmap.total} frames ({orbitTest.colmap.pct}%)
                {orbitTest.colmap.pass
                  ? ' — Video is geometrisch consistent. Splat training mogelijk.'
                  : ' — Video te inconsistent. Ander videomodel of meer camera-sturing nodig.'}
              </div>
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

  const overlayPasses: { key: 'calibration' | 'light' | 'productLayer' | 'composite' | 'bgComposite'; label: string; src: string | undefined; icon: string }[] = [
    { key: 'calibration', label: 'Calibration', src: calibrationPreviewUrl, icon: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z' },
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

  const viewportContent = (
    <div className="relative h-full w-full">
      {backgroundLocked && viewportOverlay === 'composite' && (
        <div className="pointer-events-none absolute left-3 top-3 z-40 flex items-center gap-1.5 rounded-full bg-black/50 px-2.5 py-1 backdrop-blur-sm">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-[#facc15]">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0110 0v4" />
          </svg>
          <span className="text-[11px] font-medium text-white/70">Achtergrond vergrendeld</span>
        </div>
      )}
      <ReconstructingOverlay visible={envReconstructing} label="Reconstructing environment" />
      <ReconstructingOverlay visible={finalLoading || !!busy} label={busy || 'Composing image'} />
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
        productOverlaySrc={undefined}
        productOverlayBlend="normal"
        backgroundPlateSrc={viewportOverlay === 'bgComposite' ? backgroundPlateUrl : undefined}
        transparentCanvas={viewportOverlay === 'bgComposite'}
        debugRings={debugRings}
        viewMode={viewMode}
        environmentMeshUrls={envMappingEnabled ? envMeshUrls : undefined}
      />
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
            <button
              type="button"
              onClick={() => setEnvMappingEnabled((v) => !v)}
              className={[
                'group/btn relative flex h-8 items-center gap-1 rounded-full px-2 transition-colors',
                envMappingEnabled
                  ? 'bg-[#facc15]/20 text-[#facc15]'
                  : 'text-white/50 hover:bg-white/10 hover:text-white/80',
              ].join(' ')}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
              <span className="text-[10px] font-semibold">Env</span>
              <div className="pointer-events-none absolute top-[calc(100%+8px)] left-1/2 -translate-x-1/2 rounded-full border border-white/[0.12] bg-white px-2.5 py-1 text-[10px] font-semibold text-black opacity-0 shadow-lg transition-opacity duration-150 group-hover/btn:opacity-100 whitespace-nowrap">
                {envMappingEnabled ? 'Environment mapping aan' : 'Environment mapping uit'}
                {envMeshUrls.length > 0 && ` (${envMeshUrls.length} meshes)`}
              </div>
            </button>
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
                      onClick={() => setArchivePreviewIndex(finalRenderVersions.indexOf(version))}
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
      {archivePreviewIndex !== null && finalRenderVersions[archivePreviewIndex] && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/85 backdrop-blur-sm"
          onClick={() => setArchivePreviewIndex(null)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowLeft' && archivePreviewIndex > 0) setArchivePreviewIndex(archivePreviewIndex - 1)
            if (e.key === 'ArrowRight' && archivePreviewIndex < finalRenderVersions.length - 1) setArchivePreviewIndex(archivePreviewIndex + 1)
            if (e.key === 'Escape') setArchivePreviewIndex(null)
          }}
          tabIndex={0}
          ref={(el) => el?.focus()}
        >
          <img
            src={finalRenderVersions[archivePreviewIndex].output_url ?? ''}
            alt=""
            className="max-h-[90vh] max-w-[90vw] rounded-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
          {archivePreviewIndex > 0 && (
            <button type="button" onClick={(e) => { e.stopPropagation(); setArchivePreviewIndex(archivePreviewIndex - 1) }} className="absolute left-4 rounded-full bg-black/50 p-2 text-white/70 hover:text-white">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
            </button>
          )}
          {archivePreviewIndex < finalRenderVersions.length - 1 && (
            <button type="button" onClick={(e) => { e.stopPropagation(); setArchivePreviewIndex(archivePreviewIndex + 1) }} className="absolute right-4 rounded-full bg-black/50 p-2 text-white/70 hover:text-white">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
            </button>
          )}
          <div className="absolute bottom-6 text-center text-sm text-white/50">
            {archivePreviewIndex + 1} / {finalRenderVersions.length}
          </div>
        </div>
      )}

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
