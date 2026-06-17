import { useEffect, useRef, useState, type FormEvent } from 'react'
import { upsertAsset as upsertLibraryAsset } from '../lib/asset-library'
import { supabase } from '../lib/supabase'
import { notifyIfCreditsRequired } from '../lib/credits-required'
import { loadModuleModels, loadImagePipelinePrompt, type ImagePipelineSlot } from '../lib/atelier-module-config'

export type AtelierMediaProjectType = 'images' | 'video'

export interface AtelierMediaAsset {
  id: string
  src: string
  prompt: string
  modelId: string
  model: string
  modelLabel: string
  createdAt: string
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
  assets?: AtelierMediaAsset[]
  createdAt: string
}

export type AtelierMediaModel = {
  id: string
  label: string
  model: string
  description?: string
  modality?: string
}

const ATELIER_MEDIA_PROJECTS_STORAGE_KEY = 'huphe:atelier-media-projects:v1'

export function useAtelierMediaProjects() {
  const [projects, setProjects] = useState<AtelierMediaProject[]>(() => loadAtelierMediaProjects())

  useEffect(() => {
    saveAtelierMediaProjects(projects)
  }, [projects])

  return [projects, setProjects] as const
}

export function useAtelierMediaCreator({
  mediaType,
  project,
  onProjectGenerated,
  initialImageSrc,
}: {
  mediaType: AtelierMediaProjectType | null
  project?: AtelierMediaProject | null
  onProjectGenerated?: (project: AtelierMediaProject) => void
  initialImageSrc?: string | null
}) {
  const initialImageSrcRef = useRef(initialImageSrc)
  const [prompt, setPrompt] = useState('')
  const [models, setModels] = useState<AtelierMediaModel[]>([])
  const [selectedModelId, setSelectedModelId] = useState('')
  const [modelsLoading, setModelsLoading] = useState(false)
  const [modelMenuOpen, setModelMenuOpen] = useState(false)
  const [modelQuery, setModelQuery] = useState('')
  const [generating, setGenerating] = useState(false)
  const [resultItems, setResultItems] = useState<AtelierMediaAsset[]>([])
  const [activeResultIndex, setActiveResultIndex] = useState<number | null>(null)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const [error, setError] = useState('')

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
      if (nextModels.length === 0 && allowedModels.length > 0) {
        nextModels = allowedModels
          .filter((model) => model.modality === (mediaType === 'images' ? 'image' : 'video'))
          .map((model) => ({ id: model.id, label: model.label, model: model.model, modality: model.modality }))
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

  function stepLightbox(direction: -1 | 1) {
    if (resultItems.length === 0) return
    setLightboxIndex((current) => {
      const base = current ?? activeResultIndex ?? resultItems.length - 1
      return (base + direction + resultItems.length) % resultItems.length
    })
  }

  async function handleGenerate(event: FormEvent<HTMLFormElement>, maskDataUrl?: string, referenceImageOverride?: string) {
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

    setGenerating(true)
    setError('')
    try {
      const api = (window as any).api
      const { data: { session } } = await supabase!.auth.getSession()
      const accessToken = session?.access_token ?? undefined
      const res = mediaType === 'images'
        ? await api.generateAtelierImage(promptText, selectedModel.model, imagePipelineSystemPrompt, referenceImageSrc, accessToken, selectedModel.label, maskDataUrl)
        : await api.generateAtelierVideo(promptText, selectedModel.model, undefined, accessToken, referenceImageSrc)
      if (!res?.ok) {
        const errMsg = res?.error ?? 'Genereren mislukt.'
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
        setError(mediaType === 'images' ? 'Geen afbeelding ontvangen.' : 'Geen video ontvangen.')
        return
      }
      const createdAt = new Date().toISOString()
      const asset: AtelierMediaAsset = {
        id: createAtelierProjectId(),
        src,
        prompt: promptText,
        modelId: selectedModel.id,
        model: selectedModel.model,
        modelLabel: selectedModel.label,
        createdAt,
      }
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
        type: mediaType === 'video' ? 'video' : 'generated',
        prompt: promptText,
        modelId: selectedModel.id,
        createdAt,
        updatedAt: createdAt,
      })
      const nextAssets = [...resultItems, asset]
      setResultItems(nextAssets)
      setActiveResultIndex(nextAssets.length - 1)
      onProjectGenerated?.({
        id: project?.id ?? createAtelierProjectId(),
        type: mediaType,
        title: project?.title ?? createAtelierProjectTitle(promptText, mediaType),
        prompt: promptText,
        modelId: selectedModel.id,
        model: selectedModel.model,
        modelLabel: selectedModel.label,
        src,
        assets: nextAssets,
        createdAt: project?.createdAt ?? createdAt,
      })
    } catch (err: any) {
      const errMsg = err.message ?? 'Genereren mislukt.'
      if (!notifyIfCreditsRequired(err)) {
        setError(errMsg)
      }
    } finally {
      setGenerating(false)
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
    resultItems,
    activeResultIndex,
    setActiveResultIndex,
    lightboxIndex,
    setLightboxIndex,
    error,
    canGenerate,
    handleGenerate,
    handleSaveResult,
    handleDeleteAsset,
    stepLightbox,
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
