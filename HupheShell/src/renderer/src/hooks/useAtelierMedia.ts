import { useEffect, useRef, useState, type FormEvent } from 'react'
import { upsertAsset as upsertLibraryAsset } from '../lib/asset-library'
import { supabase } from '../lib/supabase'
import { notifyIfCreditsRequired } from '../lib/credits-required'
import { loadModuleModels, loadImagePipelinePrompt, type ImagePipelineSlot } from '../lib/atelier-module-config'
import { loadVideoGenerationSettings, saveVideoGenerationSettings, type VideoGenerationSettings } from '../lib/video-generation-settings'

export interface AtelierVideoCapability {
  model_id: string
  provider?: string
  markup_pct: number
  video_cost_estimate: number
  supported_durations: number[]
  supported_resolutions: string[]
  supported_aspect_ratios: string[]
  generate_audio: boolean
  seed: boolean
  bitrate_mode: boolean
  codec: boolean
  supports_end_image: boolean
  pricing_skus: Record<string, string>
  supports_references?: boolean
  reference_limits?: { image: number; video: number; audio: number }
  supports_auto_duration?: boolean
  supports_draft?: boolean
  draft_rate_per_second?: number
  draft_finalize_rate_per_second?: number
}

export type VideoTaskMode = 'reference' | 'editing' | 'extension'

export type VideoReferenceKind = 'image' | 'video' | 'audio'

export interface VideoReferenceSlot {
  id: string
  kind: VideoReferenceKind
  status: 'uploading' | 'ready' | 'error'
  previewSrc?: string
  fileUrl?: string
  fileName?: string
  error?: string
  // gemeten duur (video/audio), gebruikt om fal's combinatie-limiet (max 30.2s totaal
  // per modaliteit) client-side te controleren vóór upload.
  durationSec?: number
}

export type AtelierMediaProjectType = 'images' | 'video'

export interface AtelierMediaAsset {
  id: string
  src: string
  thumbnailSrc?: string
  prompt: string
  modelId: string
  model: string
  modelLabel: string
  createdAt: string
  // Alleen gezet voor een 480p-draft (bytedance/seedance-2.5 draft-modus) die nog niet
  // naar 1080p gerenderd is -- draftDuration is de billing-basis die finalize later
  // tegen hetzelfde getal moet afrekenen (zie runFalDraftCompleteJob).
  isDraft?: boolean
  draftId?: string
  draftDuration?: number
}

export interface AtelierMediaProject {
  id: string
  type: AtelierMediaProjectType
  title: string
  prompt: string
  modelId: string
  model: string
  modelLabel: string
  src: string
  thumbnailSrc?: string
  assets?: AtelierMediaAsset[]
  createdAt: string
}

export type AtelierVideoJobStatus = 'in_progress' | 'completed' | 'failed' | 'cancelled'

export interface AtelierVideoJob {
  id: string
  prompt: string
  modelLabel: string
  status: AtelierVideoJobStatus
  progressLabel: string
  progressPct: number
  thumbnailSrc?: string
  resultSrc?: string
  error?: string
  createdAt: string
  finishedAt?: string
}

export type AtelierMediaModel = {
  id: string
  label: string
  model: string
  description?: string
  modality?: string
  provider?: string
}

const ATELIER_MEDIA_PROJECTS_STORAGE_KEY = 'huphe:atelier-media-projects:v1'
const ATELIER_VIDEO_JOBS_STORAGE_KEY = 'huphe:atelier-video-jobs:v1'

export function useAtelierMediaProjects() {
  const [projects, setProjects] = useState<AtelierMediaProject[]>(() => loadAtelierMediaProjects())

  useEffect(() => {
    saveAtelierMediaProjects(projects)
  }, [projects])

  return [projects, setProjects] as const
}

// Chronologische lijst van video-generaties (actief + recent), los van de
// projectenlijst -- een job is er al voordat er een geslaagd project/asset is,
// en blijft ook na mislukken/annuleren zichtbaar voor de Job Queue-tab.
export function useAtelierVideoJobs() {
  const [jobs, setJobs] = useState<AtelierVideoJob[]>(() => loadAtelierVideoJobs())

  useEffect(() => {
    saveAtelierVideoJobs(jobs)
  }, [jobs])

  return [jobs, setJobs] as const
}

function loadAtelierVideoJobs(): AtelierVideoJob[] {
  try {
    const raw = window.localStorage.getItem(ATELIER_VIDEO_JOBS_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    // Een job die bij app-afsluiten nog 'in_progress' was, is sowieso niet meer te
    // volgen (de main-process pollinglus leeft niet door een herstart heen) --
    // markeer als mislukt zodat de Job Queue geen eeuwig draaiende spinner toont.
    return parsed.map((j: AtelierVideoJob) => j.status === 'in_progress'
      ? { ...j, status: 'failed' as const, error: 'Onderbroken (app herstart).', finishedAt: j.finishedAt ?? new Date().toISOString() }
      : j)
  } catch {
    return []
  }
}

function saveAtelierVideoJobs(jobs: AtelierVideoJob[]) {
  try {
    window.localStorage.setItem(ATELIER_VIDEO_JOBS_STORAGE_KEY, JSON.stringify(jobs.slice(0, 30)))
  } catch {
    // Jobs zijn een UI-hulp; falen met opslaan mag de generator niet blokkeren.
  }
}

export function useAtelierMediaCreator({
  mediaType,
  project,
  onProjectGenerated,
  initialImageSrc,
  setVideoJobs,
}: {
  mediaType: AtelierMediaProjectType | null
  project?: AtelierMediaProject | null
  onProjectGenerated?: (project: AtelierMediaProject) => void
  initialImageSrc?: string | null
  setVideoJobs?: (updater: (jobs: AtelierVideoJob[]) => AtelierVideoJob[]) => void
}) {
  const initialImageSrcRef = useRef(initialImageSrc)
  // requestId van de video-generatie die nu loopt (zo ja) -- cancelGeneration()
  // leest dit om te weten welke job hij moet annuleren.
  const currentVideoRequestIdRef = useRef<string | null>(null)
  const [prompt, setPrompt] = useState('')
  const [models, setModels] = useState<AtelierMediaModel[]>([])
  const [selectedModelId, setSelectedModelId] = useState('')
  const [modelsLoading, setModelsLoading] = useState(false)
  const [modelMenuOpen, setModelMenuOpen] = useState(false)
  const [modelQuery, setModelQuery] = useState('')
  const [generating, setGenerating] = useState(false)
  const [generatingLabel, setGeneratingLabel] = useState('')
  const [resultItems, setResultItems] = useState<AtelierMediaAsset[]>([])
  const [activeResultIndex, setActiveResultIndex] = useState<number | null>(null)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [videoCapabilities, setVideoCapabilities] = useState<AtelierVideoCapability[]>([])
  const [videoSettings, setVideoSettings] = useState<VideoGenerationSettings | null>(null)
  const [videoReferences, setVideoReferences] = useState<VideoReferenceSlot[]>([])
  const [videoTask, setVideoTask] = useState<VideoTaskMode>('reference')

  useEffect(() => {
    if (!mediaType) return
    let cancelled = false
    const activeProject = project?.type === mediaType ? project : null
    setModelsLoading(true)
    setError('')
    setResultItems([])
    setActiveResultIndex(null)
    setLightboxIndex(null)
    setPrompt('')
    setSelectedModelId('')

    async function loadModels() {
      const api = (window as any).api
      const wanted = mediaType === 'images' ? 'image' : 'video'
      const keywords = mediaType === 'images'
        ? ['image', 'imagen', 'flux', 'banana', 'seedream', 'recraft']
        : ['video', 'veo', 'kling', 'runway', 'luma', 'pika']

      let nextModels: AtelierMediaModel[] = []
      let loadError = ''

      try {
        const res = await api.engine.listOpenRouterModelsByModality(wanted)
        if (res?.ok) nextModels = res.models ?? []
        else loadError = res?.error ?? ''
      } catch (err: any) {
        loadError = err.message ?? ''
      }

      if (nextModels.length === 0) {
        const seen = new Set<string>()
        for (const keyword of keywords) {
          try {
            const res = await api.engine.searchOpenRouterModels(keyword)
            if (!res?.ok) continue
            for (const model of res.models ?? []) {
              const value = `${model.id ?? ''} ${model.label ?? ''} ${model.model ?? ''} ${model.description ?? ''} ${model.modality ?? ''}`.toLowerCase()
              if (!keywords.some((kw) => value.includes(kw)) || seen.has(model.id) || !isAtelierModelForMedia(model, mediaType)) continue
              seen.add(model.id)
              nextModels.push(model)
            }
          } catch {
            // Keep searching other keywords.
          }
        }
      }

      if (cancelled) return
      const allowedModels = loadModuleModels(mediaType)
      const allowedIds = new Set(allowedModels.map((model) => model.id || model.model))
      nextModels = nextModels
        .filter((model) => isAtelierModelForMedia(model, mediaType))
        .filter((model) => allowedIds.size === 0 || allowedIds.has(model.id) || allowedIds.has(model.model))
        .map((model) => {
          const allowedMatch = allowedModels.find((a) => a.id === model.id || a.model === model.model)
          return allowedMatch?.provider ? { ...model, provider: allowedMatch.provider } : model
        })
      if (nextModels.length === 0 && allowedModels.length > 0) {
        nextModels = allowedModels
          .filter((model) => model.modality === (mediaType === 'images' ? 'image' : 'video'))
          .map((model) => ({ id: model.id, label: model.label, model: model.model, modality: model.modality, provider: model.provider }))
      }
      const preferredModelId = activeProject?.modelId
      const preferredModel = activeProject?.model
      setModels(nextModels)
      setSelectedModelId(
        nextModels.find((model) => model.id === preferredModelId)?.id
        ?? nextModels.find((model) => model.model === preferredModel)?.id
        ?? nextModels[0]?.id
        ?? ''
      )
      if (nextModels.length === 0 && loadError) setError(loadError)
      setModelsLoading(false)
    }

    loadModels()

    return () => { cancelled = true }
  }, [mediaType, project?.id])

  useEffect(() => {
    if (mediaType !== 'video') {
      setVideoCapabilities([])
      return
    }
    let cancelled = false
    async function loadCapabilities() {
      try {
        const api = (window as any).api
        const { data: { session } } = await supabase!.auth.getSession()
        const res = await api.getVideoCapabilities(session?.access_token ?? undefined)
        if (!cancelled && res?.ok) setVideoCapabilities(res.models ?? [])
      } catch {
        // Zonder live capabilities valt submit terug op vaste server-side defaults.
      }
    }
    loadCapabilities()
    return () => { cancelled = true }
  }, [mediaType])

  useEffect(() => {
    if (!mediaType) return
    if (!project || project.type !== mediaType) {
      setPrompt('')
      const src = initialImageSrcRef.current
      if (src) {
        const asset: AtelierMediaAsset = {
          id: `initial_${Date.now()}`,
          src,
          prompt: '',
          modelId: '',
          model: '',
          modelLabel: '',
          createdAt: new Date().toISOString(),
        }
        setResultItems([asset])
        setActiveResultIndex(0)
      } else {
        setResultItems([])
        setActiveResultIndex(null)
      }
      setLightboxIndex(null)
      setError('')
      return
    }
    const assets = project.assets?.length
      ? project.assets
      : [{
        id: `${project.id}_asset`,
        src: project.src,
        prompt: project.prompt,
        modelId: project.modelId,
        model: project.model,
        modelLabel: project.modelLabel,
        createdAt: project.createdAt,
      }]
    setPrompt(project.prompt)
    setResultItems(assets)
    setActiveResultIndex(assets.length > 0 ? assets.length - 1 : null)
    setLightboxIndex(null)
    setSelectedModelId(project.modelId)
    setError('')
  }, [mediaType, project?.id, project?.assets?.length, project?.src])

  const selectedModel = models.find((model) => model.id === selectedModelId)
    ?? models.find((model) => project?.model && model.model === project.model)
    ?? models[0]
  const q = modelQuery.trim().toLowerCase()
  const filteredModels = q
    ? models.filter((model) => `${model.label} ${model.model}`.toLowerCase().includes(q))
    : models
  const canGenerate = !!mediaType && prompt.trim().length > 0 && !!selectedModel && !generating

  const selectedVideoCapability = selectedModel
    ? videoCapabilities.find((c) => c.model_id === selectedModel.model)
    : undefined

  useEffect(() => {
    if (mediaType !== 'video' || !selectedModel) return
    const capability = videoCapabilities.find((c) => c.model_id === selectedModel.model)
    if (!capability) return
    const stored = loadVideoGenerationSettings(selectedModel.model)
    setVideoSettings({
      duration: stored?.duration === 'auto' && capability.supports_auto_duration
        ? 'auto'
        : typeof stored?.duration === 'number' && capability.supported_durations.includes(stored.duration)
        ? stored.duration
        : capability.supported_durations[0] ?? 5,
      resolution: stored?.resolution && capability.supported_resolutions.includes(stored.resolution)
        ? stored.resolution
        : capability.supported_resolutions[0] ?? '720p',
      aspectRatio: stored?.aspectRatio && capability.supported_aspect_ratios.includes(stored.aspectRatio)
        ? stored.aspectRatio
        : capability.supported_aspect_ratios[0] ?? '16:9',
      generateAudio: capability.generate_audio ? (stored?.generateAudio ?? true) : false,
      seed: capability.seed ? stored?.seed : undefined,
      bitrateMode: capability.bitrate_mode ? (stored?.bitrateMode ?? 'standard') : undefined,
      codec: capability.codec ? (stored?.codec ?? 'auto') : undefined,
    })
  }, [mediaType, selectedModel?.model, videoCapabilities])

  useEffect(() => {
    setVideoReferences([])
    setVideoTask('reference')
  }, [mediaType, selectedModel?.model])

  function updateVideoSettings(patch: Partial<VideoGenerationSettings>) {
    setVideoSettings((current) => {
      if (!current || !selectedModel) return current
      const next = { ...current, ...patch }
      saveVideoGenerationSettings(selectedModel.model, next)
      return next
    })
  }

  function stepLightbox(direction: -1 | 1) {
    if (resultItems.length === 0) return
    setLightboxIndex((current) => {
      const base = current ?? activeResultIndex ?? resultItems.length - 1
      return (base + direction + resultItems.length) % resultItems.length
    })
  }

  async function handleGenerate(event: FormEvent<HTMLFormElement>, maskDataUrl?: string, referenceImageOverride?: string, endImageOverride?: string) {
    event.preventDefault()
    if (!canGenerate || !selectedModel || !mediaType) return
    const promptText = prompt.trim()
    setPrompt('')

    const referenceAsset = activeResultIndex != null && resultItems[activeResultIndex]
      ? resultItems[activeResultIndex]
      : (resultItems.length > 0 ? resultItems[resultItems.length - 1] : null)
    const referenceImageSrc = mediaType === 'images' ? referenceAsset?.src : referenceImageOverride

    let imagePipelineSystemPrompt: string | undefined
    if (mediaType === 'images') {
      let slot: ImagePipelineSlot
      if (maskDataUrl) {
        slot = 'mask-edit'
      } else if (referenceImageSrc) {
        slot = 'edit'
      } else {
        slot = 'generate'
      }
      const template = loadImagePipelinePrompt(slot)
      imagePipelineSystemPrompt = template.replace('{{prompt}}', promptText)
    }

    const requestId = mediaType === 'video' ? createAtelierProjectId() : undefined
    if (requestId) {
      currentVideoRequestIdRef.current = requestId
      const newJob: AtelierVideoJob = {
        id: requestId,
        prompt: promptText,
        modelLabel: selectedModel.label,
        status: 'in_progress',
        progressLabel: 'Video-aanvraag wordt verstuurd...',
        progressPct: 0,
        createdAt: new Date().toISOString(),
      }
      setVideoJobs?.((jobs) => [newJob, ...jobs].slice(0, 30))
    }
    const updateJob = (patch: Partial<AtelierVideoJob>) => {
      if (!requestId) return
      setVideoJobs?.((jobs) => jobs.map((j) => (j.id === requestId ? { ...j, ...patch } : j)))
    }

    setGenerating(true)
    setError('')
    let unsubscribeProgress: (() => void) | undefined
    try {
      const api = (window as any).api
      const { data: { session } } = await supabase!.auth.getSession()
      const accessToken = session?.access_token ?? undefined
      if (mediaType === 'video') {
        setGeneratingLabel('Video-aanvraag wordt verstuurd...')
        unsubscribeProgress = api.onVideoGenerateProgress((data: { step: string; progress: number }) => {
          setGeneratingLabel(data.step)
          updateJob({ progressLabel: data.step, progressPct: data.progress })
        })
      }
      const readyImageRefs = videoReferences.filter((r) => r.kind === 'image' && r.status === 'ready' && r.fileUrl).map((r) => r.fileUrl!)
      const readyVideoRefs = videoReferences.filter((r) => r.kind === 'video' && r.status === 'ready' && r.fileUrl).map((r) => r.fileUrl!)
      const readyAudioRefs = videoReferences.filter((r) => r.kind === 'audio' && r.status === 'ready' && r.fileUrl).map((r) => r.fileUrl!)
      const hasVideoReferences = readyImageRefs.length > 0 || readyVideoRefs.length > 0 || readyAudioRefs.length > 0
      const res = mediaType === 'images'
        ? await api.generateAtelierImage(promptText, selectedModel.model, imagePipelineSystemPrompt, referenceImageSrc, accessToken, selectedModel.label, maskDataUrl)
        : await api.generateAtelierVideo(promptText, selectedModel.model, undefined, accessToken, referenceImageSrc, videoSettings ?? undefined, selectedModel.provider as 'openrouter' | 'fal' | undefined, hasVideoReferences ? { imageUrls: readyImageRefs, videoUrls: readyVideoRefs, audioUrls: readyAudioRefs, task: videoTask } : undefined, requestId, endImageOverride)
      if (!res?.ok) {
        if (res?.cancelled) {
          updateJob({ status: 'cancelled', progressLabel: 'Geannuleerd', finishedAt: new Date().toISOString() })
          return
        }
        const errMsg = res?.error ?? 'Genereren mislukt.'
        updateJob({ status: 'failed', error: errMsg, finishedAt: new Date().toISOString() })
        if (!notifyIfCreditsRequired(errMsg)) {
          setError(errMsg)
        }
        return
      }
      const isLocalUrl = (s: string) => s.startsWith('file://') || s.startsWith('huphe://')
      let src = res.filePath
        ? (isLocalUrl(res.filePath) ? res.filePath : `file://${res.filePath}`)
        : (res.imageUrl ?? res.videoUrl ?? '')
      // When main couldn't download the URL immediately, retry from renderer
      if (!res.filePath && res.imageUrl) {
        try {
          const dlRes = await api.downloadImageUrl(res.imageUrl)
          if (dlRes?.ok && dlRes.filePath) {
            src = isLocalUrl(dlRes.filePath) ? dlRes.filePath : `file://${dlRes.filePath}`
          }
        } catch {}
      }
      console.log('[useAtelierMedia] res.filePath:', res.filePath, 'res.imageUrl:', res.imageUrl, '→ src:', src)
      if (!src) {
        const errMsg = mediaType === 'images' ? 'Geen afbeelding ontvangen.' : 'Geen video ontvangen.'
        updateJob({ status: 'failed', error: errMsg, finishedAt: new Date().toISOString() })
        setError(errMsg)
        return
      }
      const thumbnailSrc = mediaType === 'video' ? await captureVideoThumbnail(src) : undefined
      const createdAt = new Date().toISOString()
      const asset: AtelierMediaAsset = {
        id: createAtelierProjectId(),
        src,
        thumbnailSrc,
        prompt: promptText,
        modelId: selectedModel.id,
        model: selectedModel.model,
        modelLabel: selectedModel.label,
        createdAt,
        isDraft: res.draftId != null,
        draftId: res.draftId ?? undefined,
        draftDuration: res.draftId != null ? res.resolvedDuration : undefined,
      }
      updateJob({ status: 'completed', resultSrc: src, thumbnailSrc, finishedAt: createdAt })
      // Log to Supabase when logged in — always with is_live=false; updated when published
      if (supabase && session?.user?.id) {
        supabase.from('generations').insert({
          user_id: session.user.id,
          prompt: promptText,
          model: selectedModel.model,
          model_label: selectedModel.label,
          media_type: mediaType,
          file_name: src.split('/').pop() ?? '',
          project_id: project?.id ?? null,
          is_live: false,
          created_at: createdAt,
        }).then(({ error }) => {
          if (error) console.warn('[useAtelierMedia] Supabase generation log mislukt:', error.message)
        })
      }
      upsertLibraryAsset({
        id: asset.id,
        name: createAtelierProjectTitle(promptText, mediaType),
        src,
        thumbnailSrc,
        type: mediaType === 'video' ? 'video' : 'generated',
        prompt: promptText,
        modelId: selectedModel.id,
        createdAt,
        updatedAt: createdAt,
      })
      const nextAssets = [...resultItems, asset]
      setResultItems(nextAssets)
      setActiveResultIndex(nextAssets.length - 1)
      if (mediaType === 'video') setVideoReferences([])
      onProjectGenerated?.({
        id: project?.id ?? createAtelierProjectId(),
        type: mediaType,
        title: project?.title ?? createAtelierProjectTitle(promptText, mediaType),
        prompt: promptText,
        modelId: selectedModel.id,
        model: selectedModel.model,
        modelLabel: selectedModel.label,
        src,
        thumbnailSrc,
        assets: nextAssets,
        createdAt: project?.createdAt ?? createdAt,
      })
    } catch (err: any) {
      const errMsg = err.message ?? 'Genereren mislukt.'
      updateJob({ status: 'failed', error: errMsg, finishedAt: new Date().toISOString() })
      if (!notifyIfCreditsRequired(err)) {
        setError(errMsg)
      }
    } finally {
      unsubscribeProgress?.()
      setGenerating(false)
      setGeneratingLabel('')
      if (requestId && currentVideoRequestIdRef.current === requestId) currentVideoRequestIdRef.current = null
    }
  }

  async function cancelGeneration() {
    const requestId = currentVideoRequestIdRef.current
    if (!requestId) return
    try {
      const api = (window as any).api
      const { data: { session } } = await supabase!.auth.getSession()
      await api.cancelVideoGeneration(requestId, session?.access_token ?? undefined)
    } catch (err) {
      console.warn('[useAtelierMedia] cancelGeneration mislukt:', err)
    }
  }

  async function handleDeleteAsset(assetId: string) {
    const asset = resultItems.find((item) => item.id === assetId)
    if (!asset) return
    const nextItems = resultItems.filter((item) => item.id !== assetId)
    setResultItems(nextItems)
    if (nextItems.length === 0) {
      setActiveResultIndex(null)
    } else if (activeResultIndex != null) {
      const newIndex = Math.min(activeResultIndex, nextItems.length - 1)
      setActiveResultIndex(newIndex)
    }
    if (asset.src.startsWith('file://') || asset.src.startsWith('huphe://')) {
      try { await (window as any).api.deleteLocalFile(asset.src) } catch {}
    }
    if (nextItems.length > 0) {
      const activeSrc = nextItems[Math.min(activeResultIndex ?? 0, nextItems.length - 1)]?.src ?? nextItems[nextItems.length - 1].src
      onProjectGenerated?.({
        id: project?.id ?? createAtelierProjectId(),
        type: (mediaType ?? 'images') as AtelierMediaProjectType,
        title: project?.title ?? createAtelierProjectTitle(asset.prompt, (mediaType ?? 'images') as AtelierMediaProjectType),
        prompt: asset.prompt,
        modelId: asset.modelId,
        model: asset.model,
        modelLabel: asset.modelLabel,
        src: activeSrc,
        assets: nextItems,
        createdAt: project?.createdAt ?? asset.createdAt,
      })
    }
  }

  // Rendert een eerder gemaakte 480p-draft (zie handleGenerate's `res.draftId`) door
  // naar het volledige 1080p-resultaat, en vervangt het draft-asset in-place -- de
  // gebruiker ziet hetzelfde kaartje, alleen straks in volledige kwaliteit.
  async function handleRenderFinal(assetId: string) {
    const asset = resultItems.find((item) => item.id === assetId)
    if (!asset?.isDraft || !asset.draftId || asset.draftDuration == null) return

    const requestId = createAtelierProjectId()
    currentVideoRequestIdRef.current = requestId
    const newJob: AtelierVideoJob = {
      id: requestId,
      prompt: asset.prompt,
      modelLabel: asset.modelLabel,
      status: 'in_progress',
      progressLabel: 'Finalize-aanvraag wordt verstuurd...',
      progressPct: 0,
      createdAt: new Date().toISOString(),
    }
    setVideoJobs?.((jobs) => [newJob, ...jobs].slice(0, 30))
    const updateJob = (patch: Partial<AtelierVideoJob>) => {
      setVideoJobs?.((jobs) => jobs.map((j) => (j.id === requestId ? { ...j, ...patch } : j)))
    }

    setGenerating(true)
    setGeneratingLabel('Finalize-aanvraag wordt verstuurd...')
    setError('')
    let unsubscribeProgress: (() => void) | undefined
    try {
      const api = (window as any).api
      const { data: { session } } = await supabase!.auth.getSession()
      const accessToken = session?.access_token ?? undefined
      unsubscribeProgress = api.onVideoGenerateProgress((data: { step: string; progress: number }) => {
        setGeneratingLabel(data.step)
        updateJob({ progressLabel: data.step, progressPct: data.progress })
      })
      const res = await api.renderVideoDraftFinal(asset.model, asset.draftId, asset.draftDuration, videoSettings?.codec, accessToken, requestId)
      if (!res?.ok) {
        if (res?.cancelled) {
          updateJob({ status: 'cancelled', progressLabel: 'Geannuleerd', finishedAt: new Date().toISOString() })
          return
        }
        const errMsg = res?.error ?? 'Renderen mislukt.'
        updateJob({ status: 'failed', error: errMsg, finishedAt: new Date().toISOString() })
        if (!notifyIfCreditsRequired(errMsg)) setError(errMsg)
        return
      }
      const isLocalUrl = (s: string) => s.startsWith('file://') || s.startsWith('huphe://')
      const src = res.filePath ? (isLocalUrl(res.filePath) ? res.filePath : `file://${res.filePath}`) : ''
      if (!src) {
        const errMsg = 'Geen video ontvangen.'
        updateJob({ status: 'failed', error: errMsg, finishedAt: new Date().toISOString() })
        setError(errMsg)
        return
      }
      const thumbnailSrc = await captureVideoThumbnail(src)
      const finishedAt = new Date().toISOString()
      updateJob({ status: 'completed', resultSrc: src, thumbnailSrc, finishedAt })
      upsertLibraryAsset({
        id: asset.id,
        name: createAtelierProjectTitle(asset.prompt, 'video'),
        src,
        thumbnailSrc,
        type: 'video',
        prompt: asset.prompt,
        modelId: asset.modelId,
        createdAt: asset.createdAt,
        updatedAt: finishedAt,
      })
      const nextAssets = resultItems.map((item) =>
        item.id === assetId ? { ...item, src, thumbnailSrc, isDraft: false, draftId: undefined, draftDuration: undefined } : item,
      )
      setResultItems(nextAssets)
      const activeSrc = (activeResultIndex != null ? nextAssets[activeResultIndex]?.src : undefined) ?? src
      onProjectGenerated?.({
        id: project?.id ?? createAtelierProjectId(),
        type: 'video',
        title: project?.title ?? createAtelierProjectTitle(asset.prompt, 'video'),
        prompt: asset.prompt,
        modelId: asset.modelId,
        model: asset.model,
        modelLabel: asset.modelLabel,
        src: activeSrc,
        assets: nextAssets,
        createdAt: project?.createdAt ?? asset.createdAt,
      })
    } catch (err: any) {
      const errMsg = err.message ?? 'Renderen mislukt.'
      updateJob({ status: 'failed', error: errMsg, finishedAt: new Date().toISOString() })
      if (!notifyIfCreditsRequired(err)) setError(errMsg)
    } finally {
      unsubscribeProgress?.()
      setGenerating(false)
      setGeneratingLabel('')
      if (currentVideoRequestIdRef.current === requestId) currentVideoRequestIdRef.current = null
    }
  }

  async function handleSaveResult(src: string) {
    try {
      const api = (window as any).api
      const res = await api.engine.saveImage({ src })
      if (!res?.ok && !res?.canceled) setError(res?.error ?? 'Afbeelding opslaan mislukt.')
    } catch (err: any) {
      setError(err.message ?? 'Afbeelding opslaan mislukt.')
    }
  }

  return {
    prompt,
    setPrompt,
    modelsLoading,
    selectedModel,
    selectedModelId,
    setSelectedModelId,
    modelMenuOpen,
    setModelMenuOpen,
    modelQuery,
    setModelQuery,
    filteredModels,
    generating,
    generatingLabel,
    resultItems,
    setResultItems,
    activeResultIndex,
    setActiveResultIndex,
    lightboxIndex,
    setLightboxIndex,
    error,
    canGenerate,
    handleGenerate,
    cancelGeneration,
    handleSaveResult,
    handleDeleteAsset,
    handleRenderFinal,
    stepLightbox,
    videoSettings,
    updateVideoSettings,
    selectedVideoCapability,
    videoReferences,
    setVideoReferences,
    videoTask,
    setVideoTask,
  }
}

export function loadAtelierMediaProjects(): AtelierMediaProject[] {
  try {
    const raw = window.localStorage.getItem(ATELIER_MEDIA_PROJECTS_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .map(normalizeAtelierMediaProject)
      .filter((project): project is AtelierMediaProject => Boolean(project))
  } catch {
    return []
  }
}

export function saveAtelierMediaProjects(projects: AtelierMediaProject[]) {
  try {
    window.localStorage.setItem(ATELIER_MEDIA_PROJECTS_STORAGE_KEY, JSON.stringify(projects.slice(0, 80)))
  } catch {
    // Projecten zijn een UI-hulp; falen met opslaan mag de generator niet blokkeren.
  }
}

function normalizeAtelierMediaProject(value: unknown): AtelierMediaProject | null {
  if (!value || typeof value !== 'object') return null
  const item = value as Partial<AtelierMediaProject>
  if (item.type !== 'images' && item.type !== 'video') return null
  if (!item.src) return null
  const fallbackAsset: AtelierMediaAsset = {
    id: `${item.id ?? createAtelierProjectId()}_asset`,
    src: item.src,
    thumbnailSrc: item.thumbnailSrc,
    prompt: item.prompt,
    modelId: item.modelId ?? item.model ?? '',
    model: item.model ?? '',
    modelLabel: item.modelLabel ?? item.model ?? 'Model',
    createdAt: item.createdAt ?? new Date().toISOString(),
  }
  const assets = Array.isArray(item.assets)
    ? item.assets
      .map((asset) => normalizeAtelierMediaAsset(asset))
      .filter((asset): asset is AtelierMediaAsset => Boolean(asset))
    : []
  const normalizedAssets = assets.length > 0 ? assets : [fallbackAsset]
  return {
    id: item.id ?? createAtelierProjectId(),
    type: item.type,
    title: item.title ?? createAtelierProjectTitle(item.prompt, item.type),
    prompt: item.prompt,
    modelId: item.modelId ?? item.model ?? '',
    model: item.model ?? '',
    modelLabel: item.modelLabel ?? item.model ?? 'Model',
    src: item.src,
    thumbnailSrc: item.thumbnailSrc,
    assets: normalizedAssets,
    createdAt: item.createdAt ?? new Date().toISOString(),
  }
}

function normalizeAtelierMediaAsset(value: unknown): AtelierMediaAsset | null {
  if (!value || typeof value !== 'object') return null
  const item = value as Partial<AtelierMediaAsset>
  if (!item.src) return null
  return {
    id: item.id ?? createAtelierProjectId(),
    src: item.src,
    thumbnailSrc: item.thumbnailSrc,
    prompt: item.prompt ?? '',
    modelId: item.modelId ?? item.model ?? '',
    model: item.model ?? '',
    modelLabel: item.modelLabel ?? item.model ?? 'Model',
    createdAt: item.createdAt ?? new Date().toISOString(),
  }
}

const IMAGE_PROJECT_PATHS_KEY = 'huphe:image-project-paths:v1'

export function markImageAsProject(src: string) {
  try {
    const raw = localStorage.getItem(IMAGE_PROJECT_PATHS_KEY)
    const paths: string[] = raw ? JSON.parse(raw) : []
    if (!paths.includes(src)) {
      paths.push(src)
      localStorage.setItem(IMAGE_PROJECT_PATHS_KEY, JSON.stringify(paths))
    }
  } catch {}
}

export function unmarkImageAsProject(src: string) {
  try {
    const raw = localStorage.getItem(IMAGE_PROJECT_PATHS_KEY)
    const paths: string[] = raw ? JSON.parse(raw) : []
    localStorage.setItem(IMAGE_PROJECT_PATHS_KEY, JSON.stringify(paths.filter(p => p !== src)))
  } catch {}
}

export function isImageAProject(src: string): boolean {
  try {
    const raw = localStorage.getItem(IMAGE_PROJECT_PATHS_KEY)
    const paths: string[] = raw ? JSON.parse(raw) : []
    return paths.includes(src)
  } catch { return false }
}

// Legt één frame van een gegenereerde video vast als thumbnail (canvas-snapshot,
// want <img> kan geen videobestanden tonen) -- faalt stil (undefined) zodat de
// generieke project-icon placeholder het overneemt in plaats van de generatie te blokkeren.
async function captureVideoThumbnail(videoSrc: string): Promise<string | undefined> {
  const capture = async (): Promise<string | undefined> => {
    const video = document.createElement('video')
    video.src = videoSrc
    video.muted = true
    video.playsInline = true
    video.preload = 'auto'
    await new Promise<void>((resolve, reject) => {
      video.addEventListener('loadeddata', () => resolve(), { once: true })
      video.addEventListener('error', () => reject(new Error('video thumbnail load mislukt')), { once: true })
    })
    video.currentTime = Math.min(0.1, (video.duration || 0.2) / 2)
    await new Promise<void>((resolve) => {
      video.addEventListener('seeked', () => resolve(), { once: true })
    })
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth || 320
    canvas.height = video.videoHeight || 180
    const ctx = canvas.getContext('2d')
    if (!ctx) return undefined
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/jpeg', 0.7)
  }
  try {
    return await Promise.race([
      capture(),
      new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), 4000)),
    ])
  } catch {
    return undefined
  }
}

export function createAtelierProjectId() {
  return `atelier_${Date.now()}_${Math.random().toString(36).slice(2)}`
}

export function createAtelierProjectTitle(prompt: string, type: AtelierMediaProjectType) {
  const title = prompt.replace(/\s+/g, ' ').trim().split(' ').slice(0, 6).join(' ')
  return title || (type === 'images' ? 'Nieuw beeld' : 'Nieuwe video')
}

function getAtelierModelOutputModalities(model: AtelierMediaModel): string[] {
  const modality = (model.modality ?? '').toLowerCase()
  if (!modality) return []
  const outputPart = modality.includes('->') ? modality.split('->').pop() ?? '' : modality
  return outputPart.split(',').map((item) => item.trim()).filter(Boolean)
}

function isAtelierModelForMedia(model: AtelierMediaModel, mediaType: AtelierMediaProjectType) {
  const wanted = mediaType === 'images' ? 'image' : 'video'
  const outputModalities = getAtelierModelOutputModalities(model)

  const id = String(model.model || model.id || '').toLowerCase()
  const label = String(model.label ?? '').toLowerCase()
  const value = `${id} ${label}`
  const provider = id.split('/')[0] ?? ''

  if (wanted === 'image') {
    const imageProviders = ['black-forest-labs', 'stability-ai', 'stabilityai', 'ideogram', 'ideogram-ai', 'recraft', 'recraft-ai', 'sourceful', 'bytedance-seed', 'fal-ai']
    const imageKeywords = ['image-preview', 'image-generation', 'nano-banana', 'banana', 'flux', 'stable-diffusion', 'sdxl', 'dall-e', 'imagen', 'midjourney', 'riverflow', 'seedream', 'recraft']
    return outputModalities.includes(wanted) || imageProviders.includes(provider) || imageKeywords.some((keyword) => value.includes(keyword))
  }

  const videoProviders = ['runway', 'luma', 'pika', 'minimax', 'kling', 'wan']
  const videoKeywords = ['video-generation', 'text-to-video', 'image-to-video', 'veo', 'kling', 'runway', 'luma', 'pika', 'minimax', 'hailuo', 'seedance']
  return outputModalities.includes(wanted) || videoProviders.includes(provider) || videoKeywords.some((keyword) => value.includes(keyword))
}
