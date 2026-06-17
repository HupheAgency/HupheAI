import React, { useEffect, useMemo, useRef, useState } from 'react'
import { sanitizeHtml, sanitizeFullHtml } from '../lib/html-sanitize'
import { PanelLayerRow, PanelLayerDragHandle } from './RightPanelShell'
import { LeftToolTooltip } from './LeftPanelShell'
import { UnsavedChangesDialog } from './UnsavedChangesDialog'
import { buildFontLinkTag, extractFontsFromHtml } from '../lib/google-fonts'
import { FontPicker } from './FontPicker'
import {
  IcoCollapse, IcoCode, IcoDuplicate, IcoEye, IcoEyeOff,
  IcoGrip, IcoLayerBox, IcoLayerHeading, IcoLayerImage, IcoLayerText,
  IcoLink, IcoLock, IcoLockOpen, IcoTrash,
} from './Icons'
import { useAtelierPrint, type GeneratedMedia } from '../hooks/useAtelierPrint'
import AtelierSetupShell from './AtelierSetupShell'
import AtelierRightPanel, { type AtelierProjectsPanelConfig } from './AtelierRightPanel'
import type { AtelierCreationType } from './AtelierCreationModeButtons'
import type { SavedPrintProject } from '../lib/atelier-project-store'
import type { CrossFormatSeed } from '../lib/atelier-cross-format'
import type { MediaAsset } from '../lib/media-asset-store'
import { loadAssets as loadLegacyMediaAssets, upsertAsset as upsertLegacyMediaAsset } from '../lib/media-asset-store'
import { loadAtelierMediaProjects, type AtelierMediaModel } from '../hooks/useAtelierMedia'
import { AtelierPromptBar } from './AtelierPromptBar'
import MediaAssetPicker from './MediaAssetPicker'
import PrintFunnelStep, { MEDIA_FORMATS, type PrintFunnelPayload } from './PrintFunnelStep'
import { AdToHtmlToolPanel as AdToHtmlConvertPanel } from './AtelierMediaPanel'
import { loadAssets as loadLibraryAssets, resolveAssetSrc } from '../lib/asset-library'
import { fetchCopyBlocksByIds, resolveCopyContent, type CopyBlock } from '../lib/copy-library'
import { loadLinkedTextSources, loadSavedImagesAsMediaAssets, mergeMediaAssetSources } from '../lib/atelier-linked-sources'

type EditorSectionId = 'positie' | 'inhoud' | 'stijl' | 'fx' | 'masker'

export function getSeedAsset(seed?: CrossFormatSeed | null): { assetId?: string; src?: string } {
  const assetId = seed?.assetRefs[0]?.assetId
  return assetId ? { assetId, src: resolveAssetSrc(assetId) } : {}
}

export function getSeedCopy(seed?: CrossFormatSeed | null): { heading: string; body: string; button: string } {
  const refs = seed?.copyRefs ?? []
  const blocks = fetchCopyBlocksByIds(refs.map((ref) => ref.copyBlockId), { includeArchived: true })
  const contentFor = (roles: string[]) => {
    const ref = refs.find((item) => roles.includes(item.role))
    if (!ref) return ''
    return resolveCopyContent(ref.copyBlockId, undefined, undefined, blocks.find((block) => block.id === ref.copyBlockId)?.content ?? '')
  }
  return {
    heading: contentFor(['heading', 'title']),
    body: contentFor(['copy', 'body']),
    button: contentFor(['button']),
  }
}

function loadEditorSourceAssetsSync(): MediaAsset[] {
  const libraryAssets = loadLibraryAssets()
    .filter((asset) => asset.type === 'image' || asset.type === 'generated' || asset.mimeType?.startsWith('image/'))
    .map<MediaAsset>((asset) => ({
      id: asset.id,
      name: asset.name,
      src: asset.thumbnailSrc || asset.src,
      mimeType: asset.mimeType || 'image/jpeg',
      width: asset.width,
      height: asset.height,
      createdAt: asset.createdAt,
      updatedAt: asset.updatedAt,
    }))
  const mediaProjects = loadAtelierMediaProjects()
    .filter((project) => project.type === 'images' && project.src)
    .map<MediaAsset>((project) => ({
      id: `atelier-image:${project.id}`,
      name: project.title || 'Atelier afbeelding',
      src: project.src,
      mimeType: 'image/jpeg',
      createdAt: project.createdAt,
      updatedAt: project.createdAt,
    }))
  return mergeMediaAssetSources(loadLegacyMediaAssets(), libraryAssets, mediaProjects)
}

async function loadEditorSourceAssets(): Promise<MediaAsset[]> {
  const savedImages = await loadSavedImagesAsMediaAssets()
  return mergeMediaAssetSources(loadEditorSourceAssetsSync(), savedImages)
}

export function getSeedCopyIds(seed?: CrossFormatSeed | null): { titleCopyBlockId?: string; bodyCopyBlockId?: string } {
  const refs = seed?.copyRefs ?? []
  return {
    titleCopyBlockId: refs.find((item) => ['heading', 'title'].includes(item.role))?.copyBlockId,
    bodyCopyBlockId: refs.find((item) => ['copy', 'body'].includes(item.role))?.copyBlockId,
  }
}

export default function PrintFlow({
  onShellLevel,
  onCreationTypeSelect,
  onClearCreationType,
  savedProjects,
  activeProjectId,
  onSaveProject,
  mediaAssets,
  onSaveMediaAsset,
  projectsPanel,
  seed,
  onPromptSubmit,
  promptMessages,
  autonomousPayload,
  chatModels,
  chatModelsLoading,
  chatSelectedModelId,
  onChatModelSelect,
  tabBar,
}: {
  onShellLevel?: (level: 'landing' | 'funnel' | 'editor') => void
  onCreationTypeSelect?: (type: AtelierCreationType) => void
  onClearCreationType?: () => void
  savedProjects: SavedPrintProject[]
  activeProjectId: string | null
  onSaveProject: (project: SavedPrintProject) => void
  mediaAssets?: MediaAsset[]
  onSaveMediaAsset?: (asset: MediaAsset) => void
  projectsPanel?: AtelierProjectsPanelConfig
  seed?: CrossFormatSeed | null
  onPromptSubmit?: (prompt: string) => void | Promise<void>
  promptMessages?: Array<{ role: 'user' | 'assistant'; content: string; model?: string }>
  autonomousPayload?: { title: string; body: string; formats?: string[] } | null
  chatModels?: import('../hooks/useAtelierMedia').AtelierMediaModel[]
  chatModelsLoading?: boolean
  chatSelectedModelId?: string
  onChatModelSelect?: (id: string) => void
  tabBar?: React.ReactNode
}) {
  const {
    step,
    payload,
    setPayload,
    generatedMedia,
    generating,
    error,
    saveConfirm,
    handleComplete,
    handleSave,
    backToInput,
    importHtml,
  } = useAtelierPrint({
    savedProjects,
    activeProjectId,
    onSaveProject,
    onSaveMediaAsset,
    onShellLevel,
    seed,
    getSeedAsset,
    getSeedCopy,
    getSeedCopyIds,
  })

  useEffect(() => {
    const handler = (e: Event) => {
      const { html, width, height } = (e as CustomEvent).detail
      importHtml(html, width, height)
    }
    window.addEventListener('huphe:import-to-editor', handler)
    return () => window.removeEventListener('huphe:import-to-editor', handler)
  }, [importHtml])

  useEffect(() => {
    if (!autonomousPayload) return
    setPayload((prev) => ({
      title: autonomousPayload.title,
      body: autonomousPayload.body,
      imageSrc: prev?.imageSrc,
      assetId: prev?.assetId,
      titleCopyBlockId: prev?.titleCopyBlockId,
      bodyCopyBlockId: prev?.bodyCopyBlockId,
      lockedCopy: prev?.lockedCopy,
      format: prev?.format,
      formats: autonomousPayload.formats?.length ? autonomousPayload.formats : (prev?.formats ?? []),
    }))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autonomousPayload?.title, autonomousPayload?.body])

  if (step === 'result' && generatedMedia.length > 0) {
    return (
      <PrintResultView
        items={generatedMedia}
        payload={payload}
        projectsPanel={projectsPanel}
        onSaveHtml={(html, formatId) => handleSave(html, formatId)}
        saveConfirm={saveConfirm}
        onBack={backToInput}
        onExport={() => (window as any).api.print.export({ prints: generatedMedia, title: payload?.title ?? 'media' })}
        chatModels={chatModels}
        chatModelsLoading={chatModelsLoading}
        chatSelectedModelId={chatSelectedModelId}
        onChatModelSelect={onChatModelSelect}
        tabBar={tabBar}
      />
    )
  }

  if (step === 'result') {
    const loadingLabel = payload?.formats?.some((format) => /social|instagram|facebook|linkedin|twitter/i.test(format))
      ? 'Media laden…'
      : 'Advertentie laden…'
    return (
      <div className="flex h-full w-full flex-col bg-[#0a0a0a]">
        {tabBar}
        <div className="flex flex-1 items-center justify-center">
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="h-10 w-10 animate-spin rounded-full border border-white/[0.10] border-t-[#facc15]" />
            <div>
              <p className="text-sm font-medium text-white/70">{loadingLabel}</p>
              <p className="mt-1 text-xs text-white/30">De opgeslagen print wordt opgebouwd.</p>
            </div>
          </div>
          {error && (
            <div className="absolute bottom-8 left-1/2 -translate-x-1/2 rounded-xl bg-red-900/80 px-4 py-2.5 text-xs text-red-200">{error}</div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="relative h-full w-full flex flex-col">
      {tabBar}
      <div className="relative flex-1 min-h-0">
      <AtelierSetupShell
        type="print"
        inputPlaceholder="Vertel wat voor media je wilt maken..."
        onCreationTypeSelect={onCreationTypeSelect}
        onClearCreationType={onClearCreationType}
        onPromptSubmit={onPromptSubmit}
        promptMessages={promptMessages}
        projectsPanel={projectsPanel}
        chatModels={chatModels}
        chatModelsLoading={chatModelsLoading}
        chatSelectedModelId={chatSelectedModelId}
        onChatModelSelect={onChatModelSelect}
        convertContent={<AdToHtmlConvertPanel />}
      >
        <PrintFunnelStep
          onComplete={handleComplete}
          initialPayload={payload ?? undefined}
          mediaAssets={mediaAssets}
          onSaveMediaAsset={onSaveMediaAsset}
          targetProjectId={activeProjectId ? `print:${activeProjectId}` : undefined}
        />
      </AtelierSetupShell>
      {generating && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="text-white/70 text-sm">Genereren…</div>
        </div>
      )}
      {error && (
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 rounded-xl bg-red-900/80 px-4 py-2.5 text-xs text-red-200">{error}</div>
      )}
      </div>
    </div>
  )
}

function PrintResultView({
  items,
  payload,
  projectsPanel,
  onBack,
  onExport,
  onSaveHtml,
  saveConfirm,
  chatModels = [],
  chatModelsLoading = false,
  chatSelectedModelId = '',
  onChatModelSelect,
  tabBar,
}: {
  items: GeneratedMedia[]
  payload: PrintFunnelPayload | null
  projectsPanel?: AtelierProjectsPanelConfig
  onBack: () => void
  onExport: () => void
  onSaveHtml?: (html: string, formatId: string) => void
  saveConfirm?: boolean
  chatModels?: AtelierMediaModel[]
  chatModelsLoading?: boolean
  chatSelectedModelId?: string
  onChatModelSelect?: (id: string) => void
  tabBar?: React.ReactNode
}) {
  const [activeFormatId, setActiveFormatId] = useState(items[0]?.formatId ?? '')
  const [chatMessages, setChatMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string; model?: string }>>([])
  const [isWaiting, setIsWaiting] = useState(false)
  const [streamTokens, setStreamTokens] = useState(0)
  const [forceChatTabKey, setForceChatTabKey] = useState(0)
  const streamAccRef = useRef('')  // accumulated stream text
  const [designBrief, setDesignBrief] = useState<string | null>(null)
  const [briefLoading, setBriefLoading] = useState(false)
  const briefGeneratedRef = useRef(false)
  const sourceImageBase64Ref = useRef<string | null>(null)
  const [brandRefImages, setBrandRefImages] = useState<string[]>([])
  const brandRefImagesRef = useRef<string[]>([])
  const brandWebsiteCountRef = useRef(0)
  const [brandResearchLoading, setBrandResearchLoading] = useState(false)
  const brandResearchDoneRef = useRef(false)
  const [lastScreenshot, setLastScreenshot] = useState<string | null>(null)
  const lastScreenshotRef = useRef<string | null>(null)
  const [capturingScreenshot, setCapturingScreenshot] = useState(false)
  const [isReviewing, setIsReviewing] = useState(false)
  const isReviewingRef = useRef(false)
  const [selectedEl, setSelectedEl] = useState<EditElType | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [hoveredElId, setHoveredElId] = useState<string | null>(null)
  const [isEditingText, setIsEditingText] = useState(false)
  const [activeTool, setActiveTool] = useState('select')
  const [imageToolPickerOpen, setImageToolPickerOpen] = useState(false)
  const [imageToolAssets, setImageToolAssets] = useState<MediaAsset[]>(() => loadEditorSourceAssetsSync())
  const [pendingImageInsertPoint, setPendingImageInsertPoint] = useState<{ x: number; y: number } | null>(null)
  const [editorSectionRequest, setEditorSectionRequest] = useState<{ section: EditorSectionId; token: number } | null>(null)
  const activeToolRef = useRef('select')
  useEffect(() => { activeToolRef.current = activeTool }, [activeTool])
  const isDirtyRef = useRef(false)
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false)

  useEffect(() => {
    // Registreer dirty-check op window zodat AppShell navigatie kan onderscheppen
    ;(window as any).__editorIsDirty = () => isDirtyRef.current
    ;(window as any).__editorRequestSave = () => {
      if (!onSaveHtml) return
      const imageSrc = payload?.imageSrc
      const base64 = sourceImageBase64Ref.current
      const currentHtml = htmlRef.current
      const cleanHtml = (imageSrc && base64 && (imageSrc.startsWith('file://') || imageSrc.startsWith('/var/') || imageSrc.startsWith('/tmp/')))
        ? currentHtml.split(imageSrc).join(base64)
        : currentHtml
      onSaveHtml(cleanHtml, activeFormatId)
      isDirtyRef.current = false
    }
    return () => {
      delete (window as any).__editorIsDirty
      delete (window as any).__editorRequestSave
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onSaveHtml, activeFormatId])

  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (!isDirtyRef.current) return
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [])
  const pendingInsertedElementRef = useRef<{ id: string; editText: boolean } | null>(null)
  const editDragRef = useRef<{ elId: string; startMx: number; startMy: number; startLeft: number; startTop: number; offsetParentLeft: number; offsetParentTop: number; isImgPan: boolean; startObjX: number; startObjY: number; elW: number; elH: number; companions: Array<{ id: string; startLeft: number; startTop: number; offsetParentLeft: number; offsetParentTop: number }> } | null>(null)
  const editElementsRef = useRef<EditEl[]>([])
  const selectedIdsRef = useRef<Set<string>>(selectedIds)

  // View overlay state
  const [showGrid, setShowGrid] = useState(false)
  const [gridSize, setGridSize] = useState(20)
  const [showGuides, setShowGuides] = useState(true)
  const [guides, setGuides] = useState<Array<{ id: string; type: 'h' | 'v'; pos: number }>>([])
  const [viewMenuOpen, setViewMenuOpen] = useState(false)
  const guideDragRef = useRef<{ id: string; startPos: number; startMouse: number } | null>(null)

  function requestEditorSection(section: EditorSectionId) {
    setEditorSectionRequest({ section, token: Date.now() })
  }

  function handleToolSelect(tool: string) {
    if (tool === 'mask') {
      if (selectedEl) requestEditorSection('masker')
      setActiveTool('select')
      return
    }
    if (tool === 'eyedrop') {
      void pickColorForSelection()
      return
    }
    setActiveTool(tool)
  }

  async function pickColorForSelection() {
    if (!selectedEl) return
    const EyeDropperCtor = (window as any).EyeDropper
    if (!EyeDropperCtor) return
    try {
      const result = await new EyeDropperCtor().open()
      const color = result?.sRGBHex
      if (!color) return
      if (selectedEl.tag === 'img') return
      const prop = selectedEl.text ? 'color' : 'backgroundColor'
      applyProp(selectedEl.id, { [prop]: color })
      requestEditorSection(selectedEl.text ? 'inhoud' : 'stijl')
    } catch {
      // User cancelled the picker.
    }
  }

  function insertImageFromAsset(result: { assetId: string; src: string }, asset?: MediaAsset) {
    const point = pendingImageInsertPoint ?? { x: Math.round(pxWidth / 2), y: Math.round(pxHeight / 2) }
    const id = `he-manual-${Date.now()}`
    const name = asset?.name ?? 'Afbeelding'
    const width = Math.min(240, Math.round(pxWidth * 0.45))
    const height = Math.round(width * 0.66)
    const img = `<img data-huphe-id="${id}" data-huphe-name="${escapeHtml(name)}" data-huphe-source-type="asset" data-huphe-source-id="${escapeHtml(result.assetId)}" data-huphe-source-name="${escapeHtml(name)}" src="${escapeHtml(result.src)}" style="position:absolute;left:${point.x - Math.round(width / 2)}px;top:${point.y - Math.round(height / 2)}px;width:${width}px;height:${height}px;object-fit:cover;border-radius:8px;" alt="">`
    pendingInsertedElementRef.current = { id, editText: false }
    pushHtml(htmlRef.current.replace(/<\/body>/i, img + '</body>'))
    setImageToolPickerOpen(false)
    setPendingImageInsertPoint(null)
    setActiveTool('select')
  }

  async function capturePreview(): Promise<string | null> {
    setCapturingScreenshot(true)
    try {
      const result = await (window as any).api?.print?.capturePreview?.({
        html: htmlRef.current,
        width: Math.round(pxWidth),
        height: Math.round(pxHeight),
      }) as { ok: boolean; base64?: string } | undefined
      if (result?.ok && result.base64) {
        lastScreenshotRef.current = result.base64
        setLastScreenshot(result.base64)
        return result.base64
      }
    } catch { /* screenshot optioneel */ } finally {
      setCapturingScreenshot(false)
    }
    return null
  }

  async function runBrandResearch(userPrompt: string): Promise<void> {
    if (brandResearchDoneRef.current) return
    brandResearchDoneRef.current = true
    setBrandResearchLoading(true)
    try {
      const result = await (window as any).api?.brand?.research?.({ query: userPrompt, numImages: 3 }) as { ok: boolean; websiteScreenshot?: string; images?: string[]; error?: string } | undefined
      if (result?.ok) {
        const all: string[] = []
        if (result.websiteScreenshot) all.push(result.websiteScreenshot)
        if (result.images?.length) all.push(...result.images)
        brandWebsiteCountRef.current = result.websiteScreenshot ? 1 : 0
        brandRefImagesRef.current = all
        setBrandRefImages(all)
      }
    } catch { /* research optioneel */ } finally {
      setBrandResearchLoading(false)
    }
  }

  async function reviewDesign(html: string, model: string): Promise<{ html: string; reason: string } | null> {
    if (isReviewingRef.current) return null
    isReviewingRef.current = true
    const screenshot = await capturePreview()
    if (!screenshot) { isReviewingRef.current = false; return null }
    setIsReviewing(true)
    streamAccRef.current = ''
    try {
      const result = await (window as any).api?.atelierChat?.complete?.({
        model,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Je bent een strenge creative director. Beoordeel dit ontwerp op twee punten tegelijk:\n\n1. LEESBAARHEID — Zijn koppen en headlines minimaal 70% leesbaar? Niet afgesneden, niet onleesbaar door contrast of overlap?\n\n2. TEKST-BEELD HARMONIE — Werken tekst en beeld samen als één geheel?\n   - Staat tekst op een drukke plek zonder voldoende contrast/separatie?\n   - Ondersteunt de afbeelding het verhaal van de tekst, of concurreren ze?\n   - Is er een duidelijke visuele hiërarchie: weet het oog waar het als eerste heen moet?\n\nHuidige HTML:\n${html}\n\nAls beide checks slagen: {"ok":true}\nAls aanpassing nodig is: {"ok":false,"html":"...complete verbeterde HTML, behoud visueel concept maar verbeter tekst-beeld relatie en leesbaarheid...","reason":"...max 1 zin: wat je gecorrigeerd hebt..."}\n\nGEEN markdown, alleen JSON.`,
            },
            { type: 'image_url', image_url: { url: `data:image/png;base64,${screenshot}` } },
          ],
        }],
      }) as { ok?: boolean; content?: string } | undefined
      if (result?.ok && result.content) {
        const raw = result.content.replace(/^```(?:json)?\s*/m, '').replace(/\s*```$/m, '').trim()
        const parsed = JSON.parse(raw) as { ok?: boolean; html?: string; reason?: string }
        if (!parsed.ok && parsed.html) {
          const fixed = payload?.imageSrc ? fixSourceImageSrc(parsed.html, payload.imageSrc) : parsed.html
          return { html: fixed, reason: parsed.reason ?? 'Ontwerp gecorrigeerd.' }
        }
      }
    } catch { /* review is optioneel */ } finally {
      setIsReviewing(false)
      isReviewingRef.current = false
      streamAccRef.current = ''
    }
    return null
  }

  const activeItem = items.find((item) => item.formatId === activeFormatId) ?? items[0]
  const activeFormat = MEDIA_FORMATS.find((f) => f.id === activeItem?.formatId)
  const isConverted = activeItem?.formatId?.startsWith('converted-') ?? false
  const convertedDims = isConverted ? activeItem!.formatId.replace('converted-', '').split('x').map(Number) : null
  const pxWidth = activeFormat ? (activeFormat.unit === 'mm' ? activeFormat.width * 3.7795 : activeFormat.width) : (convertedDims?.[0] ?? 794)
  const pxHeight = activeFormat ? (activeFormat.unit === 'mm' ? activeFormat.height * 3.7795 : activeFormat.height) : (convertedDims?.[1] ?? 1123)
  const previewScale = Math.min(1, 620 / pxWidth, 700 / pxHeight)
  const selectedModelId = chatSelectedModelId || chatModels[0]?.id || ''

  // Strategy 3: generate design brief once when editor opens with content + model
  useEffect(() => {
    if (briefGeneratedRef.current || !selectedModelId) return
    if (!payload?.title && !payload?.body) return
    briefGeneratedRef.current = true
    setBriefLoading(true)
    const briefPrompt = `Analyseer deze print advertentie-content en schrijf een ultrakort design brief.

Content:
- Titel: "${payload?.title ?? ''}"
- Body: "${payload?.body ?? ''}"
- Formaat: "${activeFormat?.label ?? 'A4'}"
- Achtergrondafbeelding: ${payload?.imageSrc ? 'ja' : 'nee'}

Antwoord ALLEEN als dit JSON object (geen markdown):
{"brand_tone":"...","typography_direction":"...","composition_intention":"...","color_approach":"..."}

Maximaal 12 woorden per veld. Wees specifiek en opinionated.`
    void (window as any).api?.atelierChat?.complete?.({
      model: selectedModelId,
      messages: [{ role: 'user' as const, content: briefPrompt }],
    }).then((result: any) => {
      setBriefLoading(false)
      if (result?.ok && result.content) {
        try {
          const raw = result.content.replace(/```json?\s*/g, '').replace(/```/g, '').trim()
          const parsed = JSON.parse(raw)
          setDesignBrief([
            `Toon: ${parsed.brand_tone}`,
            `Typografie: ${parsed.typography_direction}`,
            `Compositie: ${parsed.composition_intention}`,
            `Kleur: ${parsed.color_approach}`,
          ].join(' · '))
        } catch { /* brief silently fails */ }
      }
    }).catch(() => setBriefLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedModelId])

  // Capture initial screenshot once the editor has rendered
  useEffect(() => {
    const timer = setTimeout(() => { void capturePreview() }, 1500)
    return () => clearTimeout(timer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Fetch source image as base64 so AI can see it via vision.
  // Also replaces any file:// path embedded in the HTML with the stable base64 data URI,
  // so saved documents don't depend on temp files that are cleaned up between sessions.
  useEffect(() => {
    if (!payload?.imageSrc) return
    const srcToReplace = payload.imageSrc
    fetch(srcToReplace)
      .then((res) => res.blob())
      .then((blob) => new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onloadend = () => resolve(reader.result as string)
        reader.onerror = reject
        reader.readAsDataURL(blob)
      }))
      .then((dataUrl) => {
        sourceImageBase64Ref.current = dataUrl
        if (srcToReplace.startsWith('file://') || srcToReplace.startsWith('/var/') || srcToReplace.startsWith('/tmp/')) {
          setHtml(prev => prev.includes(srcToReplace) ? prev.split(srcToReplace).join(dataUrl) : prev)
        }
      })
      .catch(() => { /* vision is optional */ })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payload?.imageSrc])

  // Listen to streaming tokens — count them and attempt live HTML extraction
  useEffect(() => {
    function onChunk(e: Event) {
      const token: string = (e as CustomEvent).detail ?? ''
      streamAccRef.current += token
      setStreamTokens((n) => n + 1)

      // Live HTML extraction: once we see the html field start, try to render partial HTML
      const acc = streamAccRef.current
      const htmlMarker = '"html":"'
      const markerIdx = acc.indexOf(htmlMarker)
      if (markerIdx !== -1) {
        const raw = acc.slice(markerIdx + htmlMarker.length)
        // Unescape JSON string content and look for a closeable HTML document
        try {
          const partial = raw.replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\"/g, '"').replace(/\\\\/g, '\\')
          const closeIdx = partial.lastIndexOf('</html>')
          if (closeIdx !== -1) {
            const candidate = partial.slice(0, closeIdx + 7)
            if (candidate.includes('<html') && candidate.length > 200) {
              setHtml(candidate)
            }
          }
        } catch { /* partial parse failed */ }
      }
    }
    window.addEventListener('atelier:stream-chunk', onChunk)
    return () => window.removeEventListener('atelier:stream-chunk', onChunk)
  }, [])

  // Edit mode: reporter script in iframe sends element positions + computed styles via postMessage
  type EditEl = { id: string; tag: string; text: string; name: string; left: number; top: number; width: number; height: number; position: string; fontSize: string; color: string; fontFamily: string; fontWeight: string; textAlign: string; offsetParentLeft: number; offsetParentTop: number; objectFit: string; objectPosition: string; visibility: string; fontStyle: string; textDecoration: string; lineHeight: string; letterSpacing: string; borderRadius: string; filter: string; transform: string; outline: string; locked?: boolean; parentHupheId?: string; linkGroupId?: string; sourceType?: ElementSourceType; sourceId?: string; sourceName?: string; sourceLocked?: boolean }
  const [editElements, setEditElements] = useState<EditEl[]>([])
  const [lockedIds, setLockedIds] = useState<Set<string>>(new Set())
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const flatteningRef = useRef(false)
  const clipboardRef = useRef<string | null>(null)
  const [pendingText, setPendingText] = useState<string | null>(null)

  function sendPropToIframe(id: string, props: Record<string, string>) {
    iframeRef.current?.contentWindow?.postMessage({ type: 'huphe-prop-update', id, props }, '*')
  }

  function applyProp(id: string, props: Record<string, string>) {
    sendPropToIframe(id, props)
    commitSilent(updateElementPropertiesById(htmlRef.current, id, props))
    setSelectedEl(prev => {
      if (!prev || prev.id !== id) return prev
      const updated = { ...prev }
      if (props.fontSize !== undefined) updated.fontSize = props.fontSize
      if (props.color !== undefined) updated.color = props.color
      if (props.fontFamily !== undefined) updated.fontFamily = props.fontFamily
      if (props.fontWeight !== undefined) updated.fontWeight = props.fontWeight
      if (props.textAlign !== undefined) updated.textAlign = props.textAlign
      if (props.visibility !== undefined) updated.visibility = props.visibility
      return updated
    })
    if (props.visibility !== undefined) {
      setEditElements(prev => prev.map(e => e.id === id ? { ...e, visibility: props.visibility! } : e))
    }
  }

  function toggleVisibility(id: string) {
    const el = editElements.find(e => e.id === id)
    if (!el) return
    const newVis = el.visibility === 'hidden' ? 'visible' : 'hidden'
    setEditElements(prev => prev.map(e => e.id === id ? { ...e, visibility: newVis } : e))
    sendPropToIframe(id, { visibility: newVis })
    commitSilent(updateElementPropertiesById(htmlRef.current, id, { visibility: newVis }))
  }

  function toggleLayerLock(id: string) {
    const isLocked = lockedIds.has(id)
    const nextLocked = !isLocked
    setLockedIds(prev => {
      const next = new Set(prev)
      if (nextLocked) next.add(id)
      else next.delete(id)
      return next
    })
    setEditElements(prev => prev.map(e => e.id === id ? { ...e, locked: nextLocked } : e))
    setSelectedEl(prev => prev?.id === id ? { ...prev, locked: nextLocked } : prev)
    iframeRef.current?.contentWindow?.postMessage({
      type: 'huphe-attr-update',
      id,
      attrs: { 'data-huphe-locked': nextLocked ? 'true' : null },
    }, '*')
    commitSilent(updateElementLockById(htmlRef.current, id, nextLocked))
  }

  function deleteEl(id: string) {
    const parser = new DOMParser()
    const doc = parser.parseFromString(htmlRef.current, 'text/html')
    const el = doc.querySelector(`[data-huphe-id="${id}"]`)
    if (el) {
      // Rescue any nested huphe-id children: move them to be siblings with corrected positions
      const parentEl = el.parentElement
      if (parentEl) {
        const parentData = editElementsRef.current.find(e => e.id === id)
        Array.from(el.querySelectorAll('[data-huphe-id]')).forEach(child => {
          const childId = child.getAttribute('data-huphe-id')!
          const childData = editElementsRef.current.find(e => e.id === childId)
          if (childData && parentData) {
            const newLeft = Math.round(childData.left - parentData.offsetParentLeft)
            const newTop = Math.round(childData.top - parentData.offsetParentTop)
            let s = child.getAttribute('style') || ''
            s = s.replace(/(?:^|;)\s*left\s*:[^;]*(;|$)/gi, ';')
                 .replace(/(?:^|;)\s*top\s*:[^;]*(;|$)/gi, ';')
                 .replace(/^;+/, '').replace(/;;+/g, ';')
            child.setAttribute('style', s + `;left:${newLeft}px;top:${newTop}px;position:absolute`)
          }
          parentEl.insertBefore(child, el)
        })
      }
      el.remove()
    }
    pushHtml('<!doctype html>\n' + doc.documentElement.outerHTML)
    if (selectedEl?.id === id) { setSelectedEl(null); setPendingText(null) }
    setSelectedIds(prev => { const s = new Set(prev); s.delete(id); return s })
    setEditElements(prev => prev.filter(e => e.id !== id))
    setLockedIds(prev => { const next = new Set(prev); next.delete(id); return next })
  }

  function duplicateEl(id: string) {
    const parser = new DOMParser()
    const doc = parser.parseFromString(htmlRef.current, 'text/html')
    const el = doc.querySelector(`[data-huphe-id="${id}"]`)
    if (!el) return
    const clone = el.cloneNode(true) as HTMLElement
    const newId = Math.random().toString(36).slice(2, 10)
    clone.setAttribute('data-huphe-id', newId)
    clone.removeAttribute('data-huphe-link')
    let s = clone.getAttribute('style') || ''
    const leftMatch = s.match(/left\s*:\s*(-?\d+(?:\.\d+)?)px/)
    const topMatch = s.match(/top\s*:\s*(-?\d+(?:\.\d+)?)px/)
    const newLeft = (leftMatch ? parseFloat(leftMatch[1]) : 0) + 10
    const newTop = (topMatch ? parseFloat(topMatch[1]) : 0) + 10
    s = s.replace(/(?:^|;)\s*left\s*:[^;]*(;|$)/gi, ';').replace(/(?:^|;)\s*top\s*:[^;]*(;|$)/gi, ';').replace(/^;+/, '').replace(/;;+/g, ';')
    clone.setAttribute('style', s + `;left:${newLeft}px;top:${newTop}px`)
    el.parentElement?.appendChild(clone)
    pushHtml('<!doctype html>\n' + doc.documentElement.outerHTML)
  }

  function reorderEl(dragId: string, targetId: string, panelPos: 'before' | 'after') {
    if (dragId === targetId) return
    const parser = new DOMParser()
    const doc = parser.parseFromString(htmlRef.current, 'text/html')
    const dragEl = doc.querySelector(`[data-huphe-id="${dragId}"]`)
    const targetEl = doc.querySelector(`[data-huphe-id="${targetId}"]`)
    if (!dragEl || !targetEl) return
    dragEl.remove()
    // panel 'before' = visually above target = higher z-index = later in HTML
    if (panelPos === 'before') targetEl.after(dragEl)
    else targetEl.before(dragEl)
    pushHtml('<!doctype html>\n' + doc.documentElement.outerHTML)
    setEditElements(prev => {
      const dragged = prev.find(e => e.id === dragId)
      if (!dragged) return prev
      const without = prev.filter(e => e.id !== dragId)
      const targetIdx = without.findIndex(e => e.id === targetId)
      if (targetIdx === -1) return prev
      const insertAt = panelPos === 'before' ? targetIdx + 1 : targetIdx
      return [...without.slice(0, insertAt), dragged, ...without.slice(insertAt)]
    })
  }

  function linkLayers(ids: string[]) {
    if (ids.length < 2) return
    const groupId = Math.random().toString(36).slice(2, 10)
    const parser = new DOMParser()
    const doc = parser.parseFromString(htmlRef.current, 'text/html')
    for (const id of ids) {
      const el = doc.querySelector(`[data-huphe-id="${id}"]`)
      el?.setAttribute('data-huphe-link', groupId)
    }
    const next = '<!doctype html>\n' + doc.documentElement.outerHTML
    commitSilent(next)
    setEditElements(prev => prev.map(e => ids.includes(e.id) ? { ...e, linkGroupId: groupId } : e))
  }

  function unlinkLayer(id: string) {
    const el = editElementsRef.current.find(e => e.id === id)
    const groupId = el?.linkGroupId
    if (!groupId) return
    const groupIds = editElementsRef.current.filter(e => e.linkGroupId === groupId).map(e => e.id)
    const parser = new DOMParser()
    const doc = parser.parseFromString(htmlRef.current, 'text/html')
    for (const gid of groupIds) {
      const domEl = doc.querySelector(`[data-huphe-id="${gid}"]`)
      domEl?.removeAttribute('data-huphe-link')
    }
    const next = '<!doctype html>\n' + doc.documentElement.outerHTML
    commitSilent(next)
    setEditElements(prev => prev.map(e => groupIds.includes(e.id) ? { ...e, linkGroupId: '' } : e))
  }

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.data?.type !== 'huphe-layout') return
      if (e.source !== iframeRef.current?.contentWindow) return
      const items: EditEl[] = e.data.items ?? []
      setEditElements(items)
      setLockedIds(new Set(items.filter((item) => item.locked).map((item) => item.id)))

      const pendingInserted = pendingInsertedElementRef.current
      if (pendingInserted) {
        const inserted = items.find((item) => item.id === pendingInserted.id)
        if (inserted) {
          setSelectedEl(inserted)
          setSelectedIds(new Set([inserted.id]))
          setPendingText(null)
          setIsEditingText(pendingInserted.editText)
          pendingInsertedElementRef.current = null
        }
      }

      // Auto-flatten: if any element is nested inside another huphe-id element, restructure
      // the HTML to make all layers siblings, preserving their visual positions.
      if (flatteningRef.current) return
      const nested = items.filter(el => el.parentHupheId)
      if (nested.length === 0) return
      flatteningRef.current = true
      setTimeout(() => { flatteningRef.current = false }, 2000)

      const parser = new DOMParser()
      const doc = parser.parseFromString(htmlRef.current, 'text/html')
      let changed = false
      nested.forEach(child => {
        const parent = items.find(p => p.id === child.parentHupheId)
        if (!parent) return
        const childEl = doc.querySelector(`[data-huphe-id="${child.id}"]`)
        const parentEl = doc.querySelector(`[data-huphe-id="${parent.id}"]`)
        if (!childEl || !parentEl || !parentEl.parentElement) return
        // Compute child's position relative to the canvas (parent's offsetParent)
        const newLeft = Math.round(child.left - parent.offsetParentLeft)
        const newTop = Math.round(child.top - parent.offsetParentTop)
        // Rewrite child's style to use the new absolute position
        let s = childEl.getAttribute('style') || ''
        s = s.replace(/(?:^|;)\s*left\s*:[^;]*(;|$)/gi, ';')
             .replace(/(?:^|;)\s*top\s*:[^;]*(;|$)/gi, ';')
             .replace(/^;+/, '').replace(/;;+/g, ';')
        s += `;left:${newLeft}px;top:${newTop}px;position:absolute`
        childEl.setAttribute('style', s)
        // Insert child as a sibling right before the parent element
        parentEl.parentElement.insertBefore(childEl, parentEl)
        changed = true
      })
      if (changed) {
        commitSilent('<!doctype html>\n' + doc.documentElement.outerHTML)
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  useEffect(() => {
    function onViewCmd(e: Event) {
      const cmd = (e as CustomEvent<string>).detail
      if (cmd === 'toggle-grid') setShowGrid(v => !v)
      else if (cmd === 'toggle-guides') setShowGuides(v => !v)
      else if (cmd === 'add-guide-h') { setGuides(g => [...g, { id: Math.random().toString(36).slice(2), type: 'h' as const, pos: Math.round(pxHeight / 2) }]); setShowGuides(true) }
      else if (cmd === 'add-guide-v') { setGuides(g => [...g, { id: Math.random().toString(36).slice(2), type: 'v' as const, pos: Math.round(pxWidth / 2) }]); setShowGuides(true) }
      else if (cmd === 'clear-guides') setGuides([])
    }
    window.addEventListener('atelier:view-command', onViewCmd)
    return () => window.removeEventListener('atelier:view-command', onViewCmd)
  }, [pxHeight, pxWidth])

  const [html, setHtml] = useState(() => {
    const savedHtml = items.find(i => i.formatId === activeFormatId)?.html ?? items[0]?.html
    return (savedHtml && !savedHtml.includes('<!-- Advertentie wordt door AI gegenereerd -->'))
      ? savedHtml
      : createPrintAdHtml(payload, activeFormat ?? { width: pxWidth, height: pxHeight })
  })
  const htmlRef = useRef(html)
  const [htmlHistory, setHtmlHistory] = useState<string[]>([])
  // Live positions during drag (keyed by element id) — iframe stays unchanged while dragging
  const [editLivePos, setEditLivePos] = useState<Record<string, { left: number; top: number }>>({})

  // iframeDoc: stable iframe content. Only reloaded on structural changes (undo/redo, delete, AI result, format switch).
  // Drag/applyProp/text edits go through postMessage only — no reload needed.
  function buildIframeDoc(rawHtml: string): string {
    const fonts = extractFontsFromHtml(rawHtml)
    const fontLink = buildFontLinkTag(fonts)
    const withIds = injectEditIds(rawHtml)
    const withFonts = fontLink
      ? withIds.replace(/<\/head>/i, fontLink + '</head>')
      : withIds
    return withFonts.replace('</body>', HUPHE_REPORTER_SCRIPT + '</body>')
  }
  const [iframeDoc, setIframeDoc] = useState(() => buildIframeDoc(html))

  // Inject data-huphe-id attributes into the real HTML state.
  // updateElement* functions search htmlRef.current for these IDs — without this they find nothing.
  // Also handles undo/reset (html changes → re-inject).
  useEffect(() => {
    const injected = injectEditIds(html)
    if (injected !== html) {
      setHtml(injected)
      setIframeDoc(buildIframeDoc(injected))
    }
  }, [html])

  const [htmlFuture, setHtmlFuture] = useState<string[]>([])
  const syncHtmlTimer = useRef<ReturnType<typeof setTimeout>>()

  function reloadIframe(nextHtml: string) {
    setIframeDoc(buildIframeDoc(nextHtml))
  }

  // Structural change: reloads the iframe (undo, redo, delete, AI result, broncode edit, reset).
  function pushHtml(nextHtml: string) {
    setHtmlHistory((prev) => [...prev.slice(-19), htmlRef.current])
    setHtmlFuture([])
    setHtml(nextHtml)
    reloadIframe(nextHtml)
    isDirtyRef.current = true
  }

  // Silent commit: used for drag-end, applyProp, text-edit — postMessage already handled visuals.
  // Updates the HTML source + undo history without touching the iframe.
  function commitSilent(nextHtml: string) {
    setHtmlHistory((prev) => [...prev.slice(-19), htmlRef.current])
    setHtmlFuture([])
    htmlRef.current = nextHtml
    setHtml(nextHtml)
    isDirtyRef.current = true
    onSaveHtml?.(nextHtml, activeFormatId)
    clearTimeout(syncHtmlTimer.current)
    syncHtmlTimer.current = setTimeout(() => { setHtml(htmlRef.current) }, 1500)
  }

  function undoHtml() {
    setHtmlHistory((prev) => {
      if (prev.length === 0) return prev
      const last = prev[prev.length - 1]
      setHtmlFuture((f) => [...f.slice(-19), htmlRef.current])
      setHtml(last)
      reloadIframe(last)
      return prev.slice(0, -1)
    })
  }

  function redoHtml() {
    setHtmlFuture((prev) => {
      if (prev.length === 0) return prev
      const next = prev[prev.length - 1]
      setHtmlHistory((h) => [...h.slice(-19), htmlRef.current])
      setHtml(next)
      reloadIframe(next)
      return prev.slice(0, -1)
    })
  }

  // Stable ref so the keydown listener always sees latest state without re-registering.
  const shortcutRef = useRef({ undoHtml, redoHtml, selectedEl, selectedIds, setSelectedEl, setSelectedIds, setPendingText, setIsEditingText, pushHtml, commitSilent, sendPropToIframe, htmlRef, setActiveTool, clipboardRef })
  shortcutRef.current = { undoHtml, redoHtml, selectedEl, selectedIds, setSelectedEl, setSelectedIds, setPendingText, setIsEditingText, pushHtml, commitSilent, sendPropToIframe, htmlRef, setActiveTool, clipboardRef }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const active = document.activeElement
      const inText = active?.tagName === 'INPUT' || active?.tagName === 'TEXTAREA'
      const { undoHtml, redoHtml, selectedEl, selectedIds, setSelectedEl, setSelectedIds, setPendingText, setIsEditingText, pushHtml, commitSilent, sendPropToIframe, htmlRef, setActiveTool, clipboardRef } = shortcutRef.current

      // ⌘Z / Ctrl+Z — undo
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
        if (inText) return
        e.preventDefault(); undoHtml(); return
      }
      // ⌘⇧Z / Ctrl+Y / Ctrl+⇧Z — redo
      if ((e.metaKey || e.ctrlKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        if (inText) return
        e.preventDefault(); redoHtml(); return
      }
      // ⌘C / Ctrl+C — kopieer geselecteerd element
      if ((e.metaKey || e.ctrlKey) && e.key === 'c' && !inText) {
        if (!selectedEl) return
        const parser = new DOMParser()
        const doc = parser.parseFromString(htmlRef.current, 'text/html')
        const el = doc.querySelector(`[data-huphe-id="${selectedEl.id}"]`)
        if (el) { clipboardRef.current = el.outerHTML; e.preventDefault() }
        return
      }
      // ⌘V / Ctrl+V — plak gekopieerd element
      if ((e.metaKey || e.ctrlKey) && e.key === 'v' && !inText) {
        const clip = clipboardRef.current
        if (!clip) return
        e.preventDefault()
        const parser = new DOMParser()
        const doc = parser.parseFromString(htmlRef.current, 'text/html')
        const tmp = document.createElement('div')
        tmp.innerHTML = sanitizeFullHtml(clip)
        const clone = tmp.firstElementChild as HTMLElement
        if (!clone) return
        const newId = Math.random().toString(36).slice(2, 10)
        clone.setAttribute('data-huphe-id', newId)
        clone.removeAttribute('data-huphe-link')
        let s = clone.getAttribute('style') || ''
        const leftMatch = s.match(/left\s*:\s*(-?\d+(?:\.\d+)?)px/)
        const topMatch = s.match(/top\s*:\s*(-?\d+(?:\.\d+)?)px/)
        const newLeft = (leftMatch ? parseFloat(leftMatch[1]) : 0) + 10
        const newTop = (topMatch ? parseFloat(topMatch[1]) : 0) + 10
        s = s.replace(/(?:^|;)\s*left\s*:[^;]*(;|$)/gi, ';').replace(/(?:^|;)\s*top\s*:[^;]*(;|$)/gi, ';').replace(/^;+/, '').replace(/;;+/g, ';')
        clone.setAttribute('style', s + `;left:${newLeft}px;top:${newTop}px`)
        doc.body.appendChild(clone)
        pushHtml('<!doctype html>\n' + doc.documentElement.outerHTML)
        return
      }
      // Tool shortcuts
      if (!inText && !e.metaKey && !e.ctrlKey) {
        if (e.key === 't' || e.key === 'T') { setActiveTool('text'); return }
        if (e.key === 'r' || e.key === 'R') { setActiveTool('rect'); return }
        if (e.key === 'o' || e.key === 'O') { setActiveTool('ellipse'); return }
        if (e.key === 'l' || e.key === 'L') { setActiveTool('line'); return }
      }
      // Escape — reset tool / deselect
      if (e.key === 'Escape' && !inText) {
        setActiveTool('select'); setSelectedEl(null); setSelectedIds(new Set()); setPendingText(null); setIsEditingText(false); return
      }
      if (!selectedEl && selectedIds.size === 0) return
      // Backspace / Delete — verwijder alle geselecteerde elementen
      if ((e.key === 'Backspace' || e.key === 'Delete') && !inText) {
        e.preventDefault()
        const idsToDelete = selectedIds.size > 0 ? selectedIds : (selectedEl ? new Set([selectedEl.id]) : new Set<string>())
        const parser = new DOMParser()
        const doc = parser.parseFromString(htmlRef.current, 'text/html')
        idsToDelete.forEach((id) => doc.querySelector(`[data-huphe-id="${id}"]`)?.remove())
        pushHtml('<!doctype html>\n' + doc.documentElement.outerHTML)
        setSelectedEl(null); setSelectedIds(new Set()); setPendingText(null)
        return
      }
      if (!selectedEl) return
      // Pijltjestoetsen — nudge 1px (Shift = 10px)
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key) && !inText) {
        e.preventDefault()
        const step = e.shiftKey ? 10 : 1
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0
        const cssLeft = selectedEl.left - selectedEl.offsetParentLeft + dx
        const cssTop = selectedEl.top - selectedEl.offsetParentTop + dy
        const nudged = updateElementPositionById(htmlRef.current, selectedEl.id, cssLeft, cssTop)
        sendPropToIframe(selectedEl.id, { left: `${cssLeft}px`, top: `${cssTop}px`, position: 'absolute' })
        commitSilent(nudged)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const [canvasScale, setCanvasScale] = useState(1)
  const [canvasOffset, setCanvasOffset] = useState({ x: 0, y: 0 })
  const canvasContainerRef = useRef<HTMLDivElement>(null)
  const canvasElRef = useRef<HTMLDivElement>(null)
  const canvasScaleRef = useRef(1)
  const canvasIsDragging = useRef(false)
  const canvasDragStart = useRef({ mx: 0, my: 0, ox: 0, oy: 0 })

  useEffect(() => { htmlRef.current = html }, [html])
  useEffect(() => { canvasScaleRef.current = canvasScale }, [canvasScale])
  useEffect(() => { editElementsRef.current = editElements }, [editElements])
  useEffect(() => { selectedIdsRef.current = selectedIds }, [selectedIds])

  useEffect(() => {
    setCanvasScale(1)
    setCanvasOffset({ x: 0, y: 0 })
  }, [activeFormatId])

  useEffect(() => {
    const el = canvasContainerRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      if (e.ctrlKey) {
        const rect = el.getBoundingClientRect()
        const cx = e.clientX - rect.left - rect.width / 2
        const cy = e.clientY - rect.top - rect.height / 2
        setCanvasScale((prev) => {
          const next = Math.min(5, Math.max(0.15, prev - e.deltaY * 0.01))
          setCanvasOffset((prevOffset) => ({
            x: prevOffset.x + (cx - prevOffset.x) * (1 - next / prev),
            y: prevOffset.y + (cy - prevOffset.y) * (1 - next / prev),
          }))
          canvasScaleRef.current = next
          return next
        })
      } else {
        setCanvasOffset((prev) => ({ x: prev.x - e.deltaX, y: prev.y - e.deltaY }))
      }
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  useEffect(() => {
    const el = canvasContainerRef.current
    if (!el) return
    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return
      if (activeToolRef.current !== 'select') return
      if ((e.target as Element).closest('[data-edit-overlay]')) return
      const target = e.target as Element
      if (target.closest('button')) return
      canvasIsDragging.current = true
      canvasDragStart.current = { mx: e.clientX, my: e.clientY, ox: 0, oy: 0 }
      setCanvasOffset((prev) => {
        canvasDragStart.current.ox = prev.x
        canvasDragStart.current.oy = prev.y
        return prev
      })
      el.style.cursor = 'grabbing'
    }
    const onMouseMove = (e: MouseEvent) => {
      if (!canvasIsDragging.current) return
      setCanvasOffset({ x: canvasDragStart.current.ox + e.clientX - canvasDragStart.current.mx, y: canvasDragStart.current.oy + e.clientY - canvasDragStart.current.my })
    }
    const onMouseUp = () => { canvasIsDragging.current = false; el.style.cursor = '' }
    el.addEventListener('mousedown', onMouseDown)
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      el.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [])

  function resetHtml() {
    pushHtml(createPrintAdHtml(payload, activeFormat ?? { width: pxWidth, height: pxHeight }))
  }

  function exportCurrentPdf() {
    ;(window as any).api.print.exportPdf({ html, title: payload?.title ?? 'advertentie', formatId: activeFormatId })
  }

  function exportCurrentHtml() {
    const currentHtml = htmlRef.current
    const print = activeItem ? { ...activeItem, html: currentHtml } : { formatId: activeFormatId, html: currentHtml }
    ;(window as any).api.print.export({ prints: [print], title: payload?.title ?? 'advertentie' }).catch?.(() => onExport())
  }

  async function submitPrompt(userPrompt: string) {
    if (!userPrompt || isWaiting) return
    const model = selectedModelId || undefined
    if (!model) return
    const currentHtml = htmlRef.current
    const isFirstGen = !currentHtml.includes('</div>') && !currentHtml.includes('position:absolute')
    const newMessages: typeof chatMessages = [...chatMessages, { role: 'user' as const, content: userPrompt }]
    setChatMessages(newMessages)
    setIsWaiting(true)
    setSelectedEl(null)
    setSelectedIds(new Set())
    setStreamTokens(0)
    streamAccRef.current = ''
    setForceChatTabKey((k) => k + 1)

    // Await brand research on first generation (max 8s) so references are ready before the AI call
    if (isFirstGen) {
      await Promise.race([runBrandResearch(userPrompt), new Promise(r => setTimeout(r, 8000))])
    }

    const canvasW = activeFormat ? `${activeFormat.width}${activeFormat.unit ?? 'px'}` : `${Math.round(pxWidth)}px`
    const canvasH = activeFormat ? `${activeFormat.height}${activeFormat.unit ?? 'px'}` : `${Math.round(pxHeight)}px`
    const systemPrompt = `Je bent een wereldklasse art director en grafisch ontwerper. Je hebt volledige creatieve vrijheid om een prachtige, publicatieklare advertentie te maken.
${designBrief ? `\nDESIGN BRIEF (context):\n${designBrief}\n` : ''}
CANVASFORMAAT — ABSOLUUT HEILIG, NOOIT AANPASSEN:
html en body krijgen altijd: width:${canvasW}; height:${canvasH}; margin:0; padding:0; overflow:hidden;
Gebruik NOOIT vw, vh of clamp() — alleen absolute pt/px/mm waardes voor fonts en afstanden.

CREATIEVE VRIJHEID:
- Jij bepaalt alles: layout, typografie, kleurpalet, compositie, stijl, sfeer, typografische hiërarchie
- Geen voorgeschreven HTML-klassen of structuur — gebruik wat werkt voor jouw ontwerp
- Maak visueel krachtige advertenties op het niveau van een toptijdschrift of prijswinnende campagne
- Gebruik de beschikbare afbeelding creatief: als achtergrond, accent, of compositieanker
- Verander NOOIT de src van <img> tags

Antwoord UITSLUITEND als dit JSON (GEEN markdown, GEEN tekst erbuiten):
{"design_rationale":"max 2 zinnen: creatieve aanpak en keuze","html":"...compleet HTML document...","message":"...wat je maakte in 1 zin..."}`

    type MsgContent = string | Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }>
    const historyMessages: { role: 'user' | 'assistant'; content: MsgContent }[] = []
    for (let i = 0; i < newMessages.length - 1; i++) {
      historyMessages.push({ role: newMessages[i].role, content: newMessages[i].content })
    }
    const screenshot = lastScreenshotRef.current
    const sourceImage = sourceImageBase64Ref.current
    const isFirstGeneration = isFirstGen
    const elementsContext = [
      `BESCHIKBARE ELEMENTEN (gebruik deze als ingrediënten):`,
      `- Formaat: ${activeFormat?.label ?? 'onbekend'} (${canvasW} × ${canvasH})`,
      payload?.title ? `- Titel: "${payload.title}"` : `- Titel: (niet beschikbaar)`,
      payload?.body ? `- Body tekst: "${payload.body}"` : `- Body tekst: (niet beschikbaar)`,
      sourceImage
        ? `- Afbeelding: bijgevoegd als vision — gebruik kleuren, compositie en sfeer. De src in de HTML is de correcte URL — verander die NOOIT.`
        : payload?.imageSrc
          ? `- Afbeelding: beschikbaar via id="source-image" in de HTML`
          : `- Afbeelding: niet beschikbaar`,
    ].join('\n')
    // Always send current HTML so AI knows the correct image src — even on first generation
    const htmlLabel = isFirstGeneration ? 'Initiële HTML (canvas nog leeg — ontwerp volledig van nul, maar behoud de img src):' : 'Huidige HTML:'
    const contextPrefix = `${elementsContext}\n\n${htmlLabel}\n${currentHtml}\n\n`

    // Build vision image blocks: source image, brand references, canvas screenshot
    type ImgBlock = { type: 'image_url'; image_url: { url: string } }
    const imageBlocks: ImgBlock[] = []
    if (sourceImage) imageBlocks.push({ type: 'image_url', image_url: { url: sourceImage } })
    for (const ref of brandRefImagesRef.current) imageBlocks.push({ type: 'image_url', image_url: { url: ref } })
    if (screenshot && !isFirstGeneration) imageBlocks.push({ type: 'image_url', image_url: { url: `data:image/png;base64,${screenshot}` } })

    const notes: string[] = []
    const imgOffset = sourceImage ? 1 : 0
    if (sourceImage) notes.push('Afbeelding 1 = bronafbeelding voor de advertentie')
    const websiteCount = brandWebsiteCountRef.current
    const adCount = brandRefImagesRef.current.length - websiteCount
    if (websiteCount > 0) {
      const n = imgOffset + 1
      notes.push(`Afbeelding ${n} = screenshot van de HUIDIGE MERKWEBSITE — dit is de meest recente visuele identiteit: kleurenpalet, typografie, stijl en tone. Gebruik dit als primaire stijlgids`)
    }
    if (adCount > 0) {
      const start = imgOffset + websiteCount + 1
      const end = imgOffset + brandRefImagesRef.current.length
      notes.push(`Afbeelding${adCount > 1 ? `en ${start}–${end}` : ` ${start}`} = gevonden advertenties van dit merk — gebruik als visuele referentie voor campagnestijl en compositie`)
    }
    if (screenshot && !isFirstGeneration) notes.push(`Afbeelding ${imageBlocks.length} = screenshot van de huidige advertentie`)
    const visionNote = notes.length ? notes.join('. ') + '.\n\n' : ''

    const lastContent: MsgContent = imageBlocks.length > 0
      ? [
          { type: 'text', text: `${contextPrefix}${visionNote}Instructie: ${userPrompt}` },
          ...imageBlocks,
        ]
      : `${contextPrefix}Instructie: ${userPrompt}`
    historyMessages.push({ role: 'user', content: lastContent })

    void (window as any).api?.atelierChat?.complete?.({
      model,
      systemPrompt,
      messages: historyMessages,
    }).then((result: { ok?: boolean; content?: string; model?: string; error?: string } | undefined) => {
      setIsWaiting(false)
      setStreamTokens(0)
      streamAccRef.current = ''
      if (result?.ok && result.content) {
        const raw = result.content.replace(/^```(?:json)?\s*/m, '').replace(/\s*```$/m, '').trim()
        let newHtml: string | null = null
        let message = 'Advertentie bijgewerkt.'
        let rationale: string | null = null
        try {
          const parsed = JSON.parse(raw) as { html?: string; message?: string; design_rationale?: string }
          if (parsed.html) { newHtml = parsed.html; message = parsed.message || message }
          if (parsed.design_rationale) rationale = parsed.design_rationale
        } catch {
          if (raw.includes('<html') || raw.includes('<!doctype')) {
            newHtml = raw
          } else {
            message = raw
          }
        }
        if (newHtml) {
          const safeHtml = payload?.imageSrc ? fixSourceImageSrc(newHtml, payload.imageSrc) : newHtml
          pushHtml(safeHtml)
          setTimeout(async () => {
            streamAccRef.current = ''
            const review = await reviewDesign(safeHtml, model)
            if (review) {
              pushHtml(review.html)
              setChatMessages((prev) => [...prev, { role: 'assistant', content: `↻ ${review.reason}` }])
              setTimeout(() => { void capturePreview() }, 800)
            } else {
              void capturePreview()
            }
          }, 1200)
        }
        const chatContent = rationale ? `💡 ${rationale}\n\n${message}` : message
        setChatMessages((prev) => [...prev, { role: 'assistant', content: chatContent, model: result.model }])
      } else {
        setChatMessages((prev) => [...prev, { role: 'assistant', content: result?.error ?? 'Er is iets misgegaan.', model: undefined }])
      }
    }).catch(() => {
      setIsWaiting(false)
      setChatMessages((prev) => [...prev, { role: 'assistant', content: 'Er is iets misgegaan.', model: undefined }])
    })
  }

  function handlePromptSubmit(userPrompt: string) {
    if (!userPrompt || isWaiting) return
    void submitPrompt(userPrompt)
  }

  function handleBack() {
    if (isDirtyRef.current) {
      setShowUnsavedDialog(true)
    } else {
      onBack()
    }
  }

  function handleSaveAndLeave() {
    if (onSaveHtml) {
      const imageSrc = payload?.imageSrc
      const base64 = sourceImageBase64Ref.current
      const currentHtml = htmlRef.current
      const cleanHtml = (imageSrc && base64 && (imageSrc.startsWith('file://') || imageSrc.startsWith('/var/') || imageSrc.startsWith('/tmp/')))
        ? currentHtml.split(imageSrc).join(base64)
        : currentHtml
      onSaveHtml(cleanHtml, activeFormatId)
    }
    isDirtyRef.current = false
    onBack()
  }

  return (
    <div className="relative flex h-full w-full flex-col bg-[#0a0a0a]">
      {showUnsavedDialog && (
        <UnsavedChangesDialog
          description="Als je nu weggaat gaan je laatste wijzigingen verloren."
          onSaveAndLeave={onSaveHtml ? handleSaveAndLeave : undefined}
          onLeaveWithout={() => { isDirtyRef.current = false; setShowUnsavedDialog(false); onBack() }}
          onCancel={() => setShowUnsavedDialog(false)}
        />
      )}
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-white/[0.07] flex-shrink-0">
        <button
          type="button"
          onClick={handleBack}
          className="flex items-center gap-1.5 text-white/50 hover:text-white transition-colors text-sm"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M10 12L6 8L10 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <select
          value={activeItem?.formatId ?? ''}
          onChange={(e) => setActiveFormatId(e.target.value)}
          className="h-8 rounded-lg border border-white/[0.08] bg-[#141414] px-3 text-xs text-white/70 outline-none"
        >
          {items.map((item) => {
            const format = MEDIA_FORMATS.find((f) => f.id === item.formatId)
            return (
              <option key={item.formatId} value={item.formatId}>
                {format ? `${format.label} · ${format.width}×${format.height}${format.unit}` : item.formatId}
              </option>
            )
          })}
        </select>

        {/* Weergave opties zijn verplaatst naar het native Weergave menu */}
        {false && (
          <div className="relative">
          {viewMenuOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setViewMenuOpen(false)} />
              <div className="absolute left-0 top-full mt-1.5 z-50 w-52 rounded-xl border border-white/[0.1] bg-[#1c1c1c] py-1.5 shadow-2xl">
                <div className="px-3 pt-1 pb-0.5 text-[9px] font-bold uppercase tracking-[0.18em] text-white/25">Raster</div>
                <button
                  type="button"
                  className="flex w-full items-center justify-between px-3 py-1.5 text-xs text-white/70 hover:bg-white/[0.05] hover:text-white transition-colors"
                  onClick={() => setShowGrid(v => !v)}
                >
                  Raster tonen
                  {showGrid && (
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path d="M2 6L5 9L10 3" stroke="#00ffcc" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </button>
                {showGrid && (
                  <div className="flex items-center gap-1 px-3 pb-1.5">
                    <span className="text-[10px] text-white/30 mr-1">Cel:</span>
                    {[10, 20, 50, 100].map(s => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setGridSize(s)}
                        className={[
                          'rounded px-1.5 py-0.5 text-[10px] transition-colors',
                          gridSize === s ? 'bg-white/[0.14] text-white' : 'text-white/35 hover:text-white/70',
                        ].join(' ')}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                )}

                <div className="mt-0.5 border-t border-white/[0.06] px-3 pt-2 pb-0.5 text-[9px] font-bold uppercase tracking-[0.18em] text-white/25">Hulplijnen</div>
                <button
                  type="button"
                  className="flex w-full items-center justify-between px-3 py-1.5 text-xs text-white/70 hover:bg-white/[0.05] hover:text-white transition-colors"
                  onClick={() => setShowGuides(v => !v)}
                >
                  Hulplijnen tonen
                  {showGuides && (
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path d="M2 6L5 9L10 3" stroke="#00ffcc" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </button>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-white/70 hover:bg-white/[0.05] hover:text-white transition-colors"
                  onClick={() => {
                    setGuides(g => [...g, { id: Math.random().toString(36).slice(2), type: 'h', pos: Math.round(pxHeight / 2) }])
                    setShowGuides(true)
                  }}
                >
                  <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                    <path d="M1 5.5h9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                    <path d="M5.5 2v7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeOpacity="0.3" />
                  </svg>
                  Horizontale lijn
                </button>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-white/70 hover:bg-white/[0.05] hover:text-white transition-colors"
                  onClick={() => {
                    setGuides(g => [...g, { id: Math.random().toString(36).slice(2), type: 'v', pos: Math.round(pxWidth / 2) }])
                    setShowGuides(true)
                  }}
                >
                  <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                    <path d="M5.5 1v9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                    <path d="M2 5.5h7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeOpacity="0.3" />
                  </svg>
                  Verticale lijn
                </button>
                {guides.length > 0 && (
                  <>
                    <div className="my-1 border-t border-white/[0.06]" />
                    <button
                      type="button"
                      className="flex w-full items-center px-3 py-1.5 text-xs text-red-400/70 hover:bg-white/[0.05] hover:text-red-400 transition-colors"
                      onClick={() => setGuides([])}
                    >
                      Hulplijnen wissen
                    </button>
                  </>
                )}
              </div>
            </>
          )}
          </div>
        )}

        <div className="flex-1" />
        {onSaveHtml && (
          <button
          type="button"
          onClick={() => {
            const imageSrc = payload?.imageSrc
            const base64 = sourceImageBase64Ref.current
            const currentHtml = htmlRef.current
            const cleanHtml = (imageSrc && base64 && (imageSrc.startsWith('file://') || imageSrc.startsWith('/var/') || imageSrc.startsWith('/tmp/')))
              ? currentHtml.split(imageSrc).join(base64)
              : currentHtml
            onSaveHtml(cleanHtml, activeFormatId)
            isDirtyRef.current = false
          }}
            className="flex h-8 items-center gap-1.5 rounded-lg border border-white/[0.08] px-3 text-xs text-white/60 transition-colors hover:border-white/20 hover:text-white"
          >
            {saveConfirm ? '✓ Opgeslagen' : 'Opslaan'}
          </button>
        )}
        {isReviewing && (
          <span className="flex items-center gap-1 text-[11px] text-[#facc15]/50">
            <svg className="animate-spin" width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
            Ontwerp checken…
          </span>
        )}
        {!isReviewing && capturingScreenshot && (
          <span className="flex items-center gap-1 text-[11px] text-white/25">
            <svg className="animate-spin" width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
            Screenshot
          </span>
        )}
        {lastScreenshot && !capturingScreenshot && (
          <span className="flex items-center gap-1 text-[11px] text-white/20" title="AI kan de advertentie visueel zien">
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" /><path d="M2 12C4.667 6 8 3 12 3s7.333 3 10 9c-2.667 6-6 9-10 9S4.667 18 2 12z" />
            </svg>
            AI ziet canvas
          </span>
        )}
        <button
          type="button"
          onClick={undoHtml}
          disabled={htmlHistory.length === 0}
          className="text-white/40 hover:text-white transition-colors text-xs disabled:opacity-25 disabled:cursor-not-allowed"
          title="Ongedaan maken  ⌘Z"
        >
          ↩ Undo
        </button>
        <button
          type="button"
          onClick={redoHtml}
          disabled={htmlFuture.length === 0}
          className="text-white/40 hover:text-white transition-colors text-xs disabled:opacity-25 disabled:cursor-not-allowed"
          title="Opnieuw  ⌘⇧Z"
        >
          ↪ Redo
        </button>
        <button
          type="button"
          onClick={resetHtml}
          className="text-white/40 hover:text-white transition-colors text-xs"
        >
          Herlaad
        </button>
        <button
          type="button"
          onClick={exportCurrentPdf}
          className="h-8 rounded-lg bg-[#facc15] px-4 text-xs font-semibold text-black hover:bg-[#fde047] transition-colors"
        >
          Exporteer PDF
        </button>
        <button
          type="button"
          onClick={exportCurrentHtml}
          className="h-8 rounded-lg border border-white/[0.08] px-4 text-xs text-white/60 hover:border-white/20 hover:text-white transition-colors"
        >
          HTML
        </button>
      </div>

      {tabBar}

      {/* Main content */}
      <div className="flex min-h-0 flex-1">
        {/* Left toolbar */}
        <LeftEditorToolbar activeTool={activeTool} onToolSelect={handleToolSelect} hasSelection={!!selectedEl} />

        {/* Canvas area */}
        <div
          ref={canvasContainerRef}
          className={['relative flex min-w-0 flex-1 flex-col items-center justify-center overflow-hidden pb-28 select-none', activeTool !== 'select' ? 'cursor-crosshair' : 'cursor-grab active:cursor-grabbing'].join(' ')}
          onClick={(e) => {
            if ((e.target as Element).closest('[data-edit-overlay]')) return
            if (activeTool !== 'select' && canvasElRef.current) {
              const rect = canvasElRef.current.getBoundingClientRect()
              if (
                e.clientX < rect.left ||
                e.clientX > rect.right ||
                e.clientY < rect.top ||
                e.clientY > rect.bottom
              ) {
                return
              }
              const x = Math.round((e.clientX - rect.left) / rect.width * pxWidth)
              const y = Math.round((e.clientY - rect.top) / rect.height * pxHeight)
              if (activeTool === 'image') {
                setPendingImageInsertPoint({ x, y })
                setImageToolAssets(loadEditorSourceAssetsSync())
                void loadEditorSourceAssets().then(setImageToolAssets)
                setImageToolPickerOpen(true)
                return
              }
              const id = `he-manual-${Date.now()}`
              const templates: Record<string, string> = {
                text:    `<div data-huphe-id="${id}" data-huphe-name="Tekst" style="position:absolute;left:${x - 100}px;top:${y - 16}px;color:#111111;font-size:24px;font-weight:700;width:200px;line-height:1.2;">Koptekst</div>`,
                rect:    `<div data-huphe-id="${id}" data-huphe-name="Vorm" style="position:absolute;left:${x - 60}px;top:${y - 40}px;width:120px;height:80px;background:rgba(0,0,0,0.15);border-radius:4px;"></div>`,
                ellipse: `<div data-huphe-id="${id}" data-huphe-name="Ellips" style="position:absolute;left:${x - 50}px;top:${y - 50}px;width:100px;height:100px;background:rgba(0,0,0,0.15);border-radius:50%;"></div>`,
                line:    `<div data-huphe-id="${id}" data-huphe-name="Lijn" style="position:absolute;left:${x - 60}px;top:${y - 1}px;width:120px;height:2px;background:#111111;"></div>`,
              }
              const tmpl = templates[activeTool]
              if (tmpl) {
                const next = htmlRef.current.replace(/<\/body>/i, tmpl + '</body>')
                pendingInsertedElementRef.current = { id, editText: activeTool === 'text' }
                pushHtml(next)
                setActiveTool('select')
              }
              return
            }
            setSelectedEl(null)
            setSelectedIds(new Set())
            setPendingText(null)
            setIsEditingText(false)
          }}
        >
          <div
            ref={canvasElRef}
            className="relative bg-white shadow-2xl"
            style={{
              width: pxWidth * previewScale,
              height: pxHeight * previewScale,
              transform: `translate(${canvasOffset.x}px, ${canvasOffset.y}px) scale(${canvasScale})`,
            }}
          >
            <iframe
              ref={iframeRef}
              srcDoc={iframeDoc}
              title="advertentie preview"
              className="absolute left-0 top-0 border-none"
              style={{
                width: pxWidth,
                height: pxHeight,
                transform: `scale(${previewScale})`,
                transformOrigin: 'top left',
                pointerEvents: 'none',
              }}
            />
            {/* Grid overlay */}
            {showGrid && (
              <div
                className="pointer-events-none absolute inset-0 z-20"
                style={{
                  backgroundImage: `linear-gradient(to right, rgba(0,153,255,0.18) 1px, transparent 1px), linear-gradient(to bottom, rgba(0,153,255,0.18) 1px, transparent 1px)`,
                  backgroundSize: `${gridSize * previewScale}px ${gridSize * previewScale}px`,
                }}
              />
            )}

            {/* Guide lines */}
            {showGuides && guides.map(guide => (
              <div
                key={guide.id}
                className="absolute z-30 group"
                style={guide.type === 'h' ? {
                  left: 0,
                  right: 0,
                  top: guide.pos * previewScale - 0.5,
                  height: 1,
                  backgroundColor: 'rgba(0,120,255,0.85)',
                  cursor: 'ns-resize',
                  pointerEvents: 'auto',
                } : {
                  top: 0,
                  bottom: 0,
                  left: guide.pos * previewScale - 0.5,
                  width: 1,
                  backgroundColor: 'rgba(0,120,255,0.85)',
                  cursor: 'ew-resize',
                  pointerEvents: 'auto',
                }}
                onMouseDown={(e) => {
                  e.stopPropagation()
                  const startMouse = guide.type === 'h' ? e.clientY : e.clientX
                  guideDragRef.current = { id: guide.id, startPos: guide.pos, startMouse }
                  const onMove = (me: MouseEvent) => {
                    if (!guideDragRef.current) return
                    const totalScale = previewScale * canvasScaleRef.current
                    const delta = (guide.type === 'h' ? me.clientY - guideDragRef.current.startMouse : me.clientX - guideDragRef.current.startMouse) / totalScale
                    const max = guide.type === 'h' ? pxHeight : pxWidth
                    const newPos = Math.max(0, Math.min(max, guideDragRef.current.startPos + delta))
                    setGuides(gs => gs.map(g => g.id === guide.id ? { ...g, pos: newPos } : g))
                  }
                  const onUp = () => {
                    guideDragRef.current = null
                    window.removeEventListener('mousemove', onMove)
                    window.removeEventListener('mouseup', onUp)
                  }
                  window.addEventListener('mousemove', onMove)
                  window.addEventListener('mouseup', onUp)
                }}
                onDoubleClick={(e) => {
                  e.stopPropagation()
                  setGuides(gs => gs.filter(g => g.id !== guide.id))
                }}
                title={`${Math.round(guide.pos)}px — sleep om te verplaatsen, dubbelklik om te verwijderen`}
              >
                <div
                  className="absolute"
                  style={guide.type === 'h' ? { left: 0, right: 0, top: -4, height: 9 } : { top: 0, bottom: 0, left: -4, width: 9 }}
                />
                <div
                  className="absolute rounded bg-[#0077ff] px-1 py-0.5 text-[8px] font-mono text-white opacity-0 group-hover:opacity-100 pointer-events-none select-none transition-opacity"
                  style={guide.type === 'h' ? { left: 4, top: 2 } : { top: 4, left: 2 }}
                >
                  {Math.round(guide.pos)}px
                </div>
              </div>
            ))}

            {/* Edit overlays — React handles all pointer events, iframe stays pointer-events:none */}
            {editElements.map((el) => {
              const livePos = editLivePos[el.id]
              const dispLeft = (livePos?.left ?? el.left) * previewScale
              const dispTop = (livePos?.top ?? el.top) * previewScale
              const isSelected = selectedEl?.id === el.id
              const isMultiSelected = !isSelected && selectedIds.has(el.id)
              const isLocked = lockedIds.has(el.id) || !!el.locked
              const isHidden = el.visibility === 'hidden'
              return (
                <div
                  key={el.id}
                  data-edit-overlay="true"
                  style={{
                    position: 'absolute',
                    left: dispLeft,
                    top: dispTop,
                    width: el.width * previewScale,
                    height: el.height * previewScale,
                    cursor: activeTool !== 'select' ? 'crosshair' : isLocked ? 'not-allowed' : el.tag === 'img' && el.objectFit === 'cover' ? 'grab' : isSelected && isEditingText ? 'text' : 'move',
                    border: isSelected ? '1px solid #facc15' : isMultiSelected ? '1px solid rgba(99,179,237,0.8)' : hoveredElId === el.id ? '1px dashed rgba(250,204,21,0.35)' : isHidden ? '1px dashed rgba(255,255,255,0.12)' : '1px dashed transparent',
                    boxSizing: 'border-box',
                    pointerEvents: activeTool !== 'select' || isLocked ? 'none' : 'auto',
                    zIndex: 10,
                    opacity: isHidden ? 0.4 : 1,
                  }}
                  onMouseEnter={() => !isLocked && setHoveredElId(el.id)}
                  onMouseLeave={() => setHoveredElId(null)}
                  onMouseDown={(e) => {
                    if (activeTool !== 'select') return
                    if (isLocked) return
                    if (isSelected && isEditingText) return
                    e.stopPropagation()
                    if (e.shiftKey) {
                      setSelectedIds(prev => {
                        const s = new Set(prev)
                        if (s.has(el.id)) { s.delete(el.id) } else { s.add(el.id) }
                        return s
                      })
                      if (!isSelected) setSelectedEl({ ...el, left: livePos?.left ?? el.left, top: livePos?.top ?? el.top })
                      return
                    }
                    const wasAlreadySelected = isSelected
                    const startLeft = livePos?.left ?? el.left
                    const startTop = livePos?.top ?? el.top
                    const isImgPan = el.tag === 'img' && el.objectFit === 'cover'
                    const startObjPos = isImgPan ? parseObjPosPx(el.objectPosition, el.width, el.height) : { x: 0, y: 0 }
                    setPendingText(null)
                    setIsEditingText(false)
                    setSelectedEl({ ...el, left: startLeft, top: startTop })
                    // If dragging an element that's part of a multi-selection, keep the full selection.
                    // Otherwise reset to just this element.
                    const currentSelectedIds = selectedIdsRef.current
                    const isPartOfMulti = currentSelectedIds.size > 1 && currentSelectedIds.has(el.id)
                    if (!isPartOfMulti) setSelectedIds(new Set([el.id]))
                    const multiCompanions = isPartOfMulti
                      ? editElementsRef.current
                          .filter(e => e.id !== el.id && currentSelectedIds.has(e.id))
                          .map(e => ({ id: e.id, startLeft: e.left, startTop: e.top, offsetParentLeft: e.offsetParentLeft, offsetParentTop: e.offsetParentTop }))
                      : []
                    const linkedGroupId = el.linkGroupId
                    const linkedCompanions = linkedGroupId
                      ? editElementsRef.current
                          .filter(e => e.id !== el.id && e.linkGroupId === linkedGroupId && !currentSelectedIds.has(e.id))
                          .map(e => ({ id: e.id, startLeft: e.left, startTop: e.top, offsetParentLeft: e.offsetParentLeft, offsetParentTop: e.offsetParentTop }))
                      : []
                    const companions = [...multiCompanions, ...linkedCompanions]
                    editDragRef.current = {
                      elId: el.id,
                      startMx: e.clientX, startMy: e.clientY,
                      startLeft, startTop,
                      offsetParentLeft: el.offsetParentLeft, offsetParentTop: el.offsetParentTop,
                      isImgPan,
                      startObjX: startObjPos.x, startObjY: startObjPos.y,
                      elW: el.width, elH: el.height,
                      companions,
                    }
                    const onMove = (me: MouseEvent) => {
                      const drag = editDragRef.current
                      if (!drag) return
                      const scale = previewScale * canvasScaleRef.current
                      if (drag.isImgPan) {
                        const newX = drag.startObjX + (me.clientX - drag.startMx) / scale
                        const newY = drag.startObjY + (me.clientY - drag.startMy) / scale
                        iframeRef.current?.contentWindow?.postMessage(
                          { type: 'huphe-prop-update', id: drag.elId, props: { objectPosition: `${Math.round(newX)}px ${Math.round(newY)}px` } }, '*'
                        )
                      } else {
                        const dmx = me.clientX - drag.startMx
                        const dmy = me.clientY - drag.startMy
                        const newLeft = drag.startLeft + dmx / scale
                        const newTop = drag.startTop + dmy / scale
                        const elId = drag.elId
                        const livePosUpdate: Record<string, { left: number; top: number }> = {
                          [elId]: { left: newLeft, top: newTop },
                        }
                        for (const c of drag.companions) {
                          livePosUpdate[c.id] = { left: c.startLeft + dmx / scale, top: c.startTop + dmy / scale }
                        }
                        setEditLivePos((prev) => ({ ...prev, ...livePosUpdate }))
                        setSelectedEl((prev) => prev ? { ...prev, left: newLeft, top: newTop } : null)
                        const cssLeft = Math.round(newLeft - drag.offsetParentLeft)
                        const cssTop = Math.round(newTop - drag.offsetParentTop)
                        iframeRef.current?.contentWindow?.postMessage(
                          { type: 'huphe-prop-update', id: elId, props: { left: `${cssLeft}px`, top: `${cssTop}px`, position: 'absolute' } }, '*'
                        )
                        for (const c of drag.companions) {
                          const cLeft = Math.round((c.startLeft + dmx / scale) - c.offsetParentLeft)
                          const cTop = Math.round((c.startTop + dmy / scale) - c.offsetParentTop)
                          iframeRef.current?.contentWindow?.postMessage(
                            { type: 'huphe-prop-update', id: c.id, props: { left: `${cLeft}px`, top: `${cTop}px`, position: 'absolute' } }, '*'
                          )
                        }
                      }
                    }
                    const onUp = (me: MouseEvent) => {
                      if (editDragRef.current) {
                        const drag = editDragRef.current
                        const scale = previewScale * canvasScaleRef.current
                        const dx = me.clientX - drag.startMx
                        const dy = me.clientY - drag.startMy
                        const wasDrag = Math.abs(dx) > 4 || Math.abs(dy) > 4
                        if (drag.isImgPan) {
                          const newX = drag.startObjX + dx / scale
                          const newY = drag.startObjY + dy / scale
                          const objPos = `${Math.round(newX)}px ${Math.round(newY)}px`
                          const updated = updateElementPropertiesById(htmlRef.current, drag.elId, { objectPosition: objPos })
                          if (updated !== htmlRef.current) {
                            commitSilent(updated)
                            setEditElements(prev => prev.map(e =>
                              e.id === drag.elId ? { ...e, objectPosition: objPos } : e
                            ))
                          }
                          setSelectedEl((prev) => prev ? { ...prev, objectPosition: objPos } : null)
                        } else if (wasDrag) {
                          const viewportLeft = drag.startLeft + dx / scale
                          const viewportTop = drag.startTop + dy / scale
                          const newLeft = viewportLeft - drag.offsetParentLeft
                          const newTop = viewportTop - drag.offsetParentTop
                          let updated = updateElementPositionById(htmlRef.current, drag.elId, newLeft, newTop)
                          const syncMap: Record<string, { left: number; top: number }> = {
                            [drag.elId]: { left: Math.round(viewportLeft), top: Math.round(viewportTop) },
                          }
                          for (const c of drag.companions) {
                            const cViewLeft = c.startLeft + dx / scale
                            const cViewTop = c.startTop + dy / scale
                            updated = updateElementPositionById(updated, c.id, cViewLeft - c.offsetParentLeft, cViewTop - c.offsetParentTop)
                            syncMap[c.id] = { left: Math.round(cViewLeft), top: Math.round(cViewTop) }
                          }
                          if (updated !== htmlRef.current) {
                            commitSilent(updated)
                            setEditElements(prev => prev.map(e => syncMap[e.id] ? { ...e, ...syncMap[e.id] } : e))
                          }
                        } else if (el.tag !== 'img' && wasAlreadySelected) {
                          setIsEditingText(true)
                        }
                        editDragRef.current = null
                      }
                      setEditLivePos({})
                      setHoveredElId(null)
                      window.removeEventListener('mousemove', onMove)
                      window.removeEventListener('mouseup', onUp)
                    }
                    window.addEventListener('mousemove', onMove)
                    window.addEventListener('mouseup', onUp)
                  }}
                >
                  {isSelected && isEditingText && el.tag !== 'img' && (
                    <textarea
                      // eslint-disable-next-line jsx-a11y/no-autofocus
                      autoFocus
                      value={pendingText ?? el.text}
                      onChange={(e) => {
                        setPendingText(e.target.value)
                        sendPropToIframe(el.id, { text: e.target.value })
                      }}
                      onBlur={() => {
                        if (pendingText !== null) {
                          commitSilent(updateElementPropertiesById(htmlRef.current, el.id, { text: pendingText }))
                          setPendingText(null)
                        }
                        setIsEditingText(false)
                      }}
                      onKeyDown={(e) => {
                        e.stopPropagation()
                        if (e.key === 'Escape') {
                          setPendingText(null)
                          setIsEditingText(false)
                        }
                      }}
                      style={{
                        position: 'absolute', inset: 0,
                        width: '100%', height: '100%',
                        background: 'transparent',
                        color: 'transparent',
                        caretColor: '#facc15',
                        border: 'none', outline: 'none',
                        resize: 'none', overflow: 'hidden',
                        padding: 0, margin: 0,
                        fontSize: `${parseFloat(el.fontSize) * previewScale}px`,
                        fontWeight: el.fontWeight,
                        textAlign: el.textAlign as React.CSSProperties['textAlign'],
                        lineHeight: 'inherit',
                      }}
                    />
                  )}
                </div>
              )
            })}
            {/* Scanning animation — shown while AI is generating */}
            {isWaiting && <ScanOverlay isEdit={chatMessages.length > 0} />}
            {/* Empty start state — shown only when canvas is still the blank skeleton */}
            {chatMessages.length === 0 && !isWaiting && html.includes('<!-- Advertentie wordt door AI gegenereerd -->') && (
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/60 backdrop-blur-[2px]">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.06] text-white/40">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
                  </svg>
                </div>
                <p className="text-center text-sm font-medium text-white/50">Beschrijf wat je wilt maken</p>
                <p className="max-w-[220px] text-center text-xs leading-relaxed text-white/25">
                  {[
                    payload?.title && `"${payload.title}"`,
                    sourceImageBase64Ref.current ? 'afbeelding zichtbaar voor AI' : payload?.imageSrc ? 'afbeelding laden…' : null,
                  ].filter(Boolean).join(' · ') || 'Typ een prompt hieronder om te beginnen'}
                </p>
              </div>
            )}
          </div>

          {/* Promptbar */}
          <div className="absolute bottom-6 left-1/2 flex w-[min(760px,calc(100%-64px))] -translate-x-1/2 flex-col gap-2">
            <AtelierPromptBar
              placeholder={chatMessages.length === 0 ? 'Beschrijf wat je wilt maken...' : 'Geef een nieuwe opdracht of aanpassing...'}
              busyPlaceholder={streamTokens > 0 ? `AI ontwerpt... (${streamTokens} tokens)` : 'AI is aan het werk...'}
              loading={isWaiting}
              disabled={isWaiting}
              models={chatModels}
              selectedModelId={selectedModelId}
              modelsLoading={chatModelsLoading}
              dropdownPosition="top"
              onModelSelect={(id) => onChatModelSelect?.(id)}
              onSubmit={handlePromptSubmit}
              trailing={<>
                {brandResearchLoading && (
                <span className="flex flex-shrink-0 items-center gap-1 text-xs text-white/25">
                  <svg className="animate-spin" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                  </svg>
                </span>
                )}
                {briefLoading && (
                <span className="flex flex-shrink-0 items-center gap-1 text-xs text-white/25">
                  <svg className="animate-spin" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                  </svg>
                </span>
                )}
                {designBrief && !briefLoading && (
                <span className="max-w-[160px] flex-shrink-0 truncate rounded-full border border-[#facc15]/15 bg-[#facc15]/[0.04] px-2 py-0.5 text-xs text-[#facc15]/50" title={designBrief}>
                  {designBrief}
                </span>
                )}
              </>}
            />
          </div>
        </div>

        {/* Right panel */}
        <AtelierRightPanel
          projectsPanel={projectsPanel}
          bodyClassName="h-full"
          chatMessages={chatMessages}
          chatIsWaiting={isWaiting}
          forceShowChat={forceChatTabKey}
          convertContent={<AdToHtmlConvertPanel />}
        >
          <PrintEditorPanel
            selectedEl={selectedEl}
            selectedIds={selectedIds}
            onSelectEl={(el, shiftKey) => {
              if (shiftKey) {
                setSelectedIds(prev => { const s = new Set(prev); s.has(el.id) ? s.delete(el.id) : s.add(el.id); return s })
                setSelectedEl(el)
              } else {
                setSelectedEl(el); setSelectedIds(new Set([el.id])); setPendingText(null); setIsEditingText(false)
              }
            }}
            editElements={editElements}
            lockedIds={lockedIds}
            onToggleLock={toggleLayerLock}
            onDeleteEl={deleteEl}
            onVisibilityToggle={toggleVisibility}
            onRenameLayer={(id, name) => {
              const next = updateElementNameById(htmlRef.current, id, name)
              commitSilent(next)
              setEditElements(prev => prev.map(e => e.id === id ? { ...e, name } : e))
            }}
            onDuplicateEl={duplicateEl}
            onReorderEl={reorderEl}
            onLinkLayers={linkLayers}
            onUnlinkLayer={unlinkLayer}
            pendingText={pendingText}
            setPendingText={setPendingText}
            sendPropToIframe={sendPropToIframe}
            applyProp={applyProp}
            onDeselectEl={() => { setSelectedEl(null); setSelectedIds(new Set()); setPendingText(null) }}
            html={html}
            onHtmlChange={(next) => { pushHtml(next) }}
            disabled={isWaiting}
            htmlRef={htmlRef}
            sectionRequest={editorSectionRequest}
          />
        </AtelierRightPanel>
      </div>
      {imageToolPickerOpen && (
        <MediaAssetPicker
          assets={imageToolAssets}
          onSelect={(result) => insertImageFromAsset(result, imageToolAssets.find((asset) => asset.id === result.assetId))}
          onUpload={(asset) => {
            upsertLegacyMediaAsset(asset)
            setImageToolAssets(loadEditorSourceAssetsSync())
            void loadEditorSourceAssets().then(setImageToolAssets)
          }}
          onClose={() => {
            setImageToolPickerOpen(false)
            setPendingImageInsertPoint(null)
            setActiveTool('select')
          }}
        />
      )}
    </div>
  )
}

type ElementSourceType = 'asset' | 'copy'
type EditElType = { id: string; tag: string; text: string; name: string; left: number; top: number; width: number; height: number; position: string; fontSize: string; color: string; fontFamily: string; fontWeight: string; textAlign: string; offsetParentLeft: number; offsetParentTop: number; objectFit: string; objectPosition: string; visibility: string; fontStyle: string; textDecoration: string; lineHeight: string; letterSpacing: string; borderRadius: string; filter: string; transform: string; outline: string; locked?: boolean; parentHupheId?: string; linkGroupId?: string; sourceType?: ElementSourceType; sourceId?: string; sourceName?: string; sourceLocked?: boolean }

function parseBrightness(filter: string): number {
  const m = filter.match(/brightness\(([0-9.]+)\)/)
  return m ? Math.round(parseFloat(m[1]) * 100) : 100
}
function setBrightnessFilter(filter: string, pct: number): string {
  let f = filter.replace(/brightness\([^)]*\)\s*/g, '').trim()
  if (pct !== 100) f = `brightness(${pct / 100}) ${f}`
  return f.trim()
}
function parseBorderWidth(border: string): number {
  if (!border || border === 'none') return 0
  const m = border.match(/(\d+)px/)
  return m ? parseInt(m[1]) : 0
}
function parseRotation(transform: string): number {
  const m = transform.match(/rotate\(\s*(-?\d+(?:\.\d+)?)\s*deg\)/)
  return m ? Math.round(parseFloat(m[1])) : 0
}
function parseBlur(filter: string): number {
  const m = filter.match(/blur\(\s*(-?\d+(?:\.\d+)?)\s*px\)/)
  return m ? Math.round(parseFloat(m[1])) : 0
}
function parseLineHeight(lh: string): string {
  if (!lh || lh === 'normal') return '1.4'
  const n = parseFloat(lh)
  return isNaN(n) ? '1.4' : String(Math.round(n * 10) / 10)
}
function parseLetterSpacing(ls: string): string {
  if (!ls || ls === 'normal') return '0'
  return String(Math.round(parseFloat(ls) * 100) / 100)
}
function parseBorderRadius(br: string): string {
  if (!br || br === '0px') return '0'
  return String(Math.round(parseFloat(br)))
}
function toggleDecoration(current: string, decoration: string): string {
  const parts = current.split(/\s+/).filter(p => p !== 'none' && p !== '' && p !== 'solid' && !p.startsWith('rgb') && !p.startsWith('#') && !/^\d/.test(p))
  const idx = parts.indexOf(decoration)
  if (idx >= 0) parts.splice(idx, 1); else parts.push(decoration)
  return parts.length ? parts.join(' ') : 'none'
}
const IMG_FILTERS: Record<string, string> = {
  'Auto': '',
  'Warm': 'sepia(0.25) saturate(1.4) brightness(1.05)',
  'Koel': 'hue-rotate(20deg) saturate(1.2) brightness(1.02)',
  'B&W': 'grayscale(1)',
}
function getActiveImgFilter(filter: string): string {
  if (filter.includes('grayscale')) return 'B&W'
  if (filter.includes('sepia')) return 'Warm'
  if (filter.includes('hue-rotate')) return 'Koel'
  return 'Auto'
}

function PrintEditorPanel({
  selectedEl,
  selectedIds,
  editElements,
  lockedIds,
  onToggleLock,
  onSelectEl,
  onDeleteEl,
  onDuplicateEl,
  onReorderEl,
  onVisibilityToggle,
  onRenameLayer,
  onLinkLayers,
  onUnlinkLayer,
  pendingText,
  setPendingText,
  sendPropToIframe,
  applyProp,
  onDeselectEl,
  html,
  onHtmlChange,
  disabled = false,
  htmlRef,
  sectionRequest,
}: {
  selectedEl: EditElType | null
  selectedIds: Set<string>
  editElements: EditElType[]
  lockedIds: Set<string>
  onToggleLock: (id: string) => void
  onSelectEl: (el: EditElType, shiftKey?: boolean) => void
  onDeleteEl: (id: string) => void
  onDuplicateEl: (id: string) => void
  onReorderEl: (dragId: string, targetId: string, panelPos: 'before' | 'after') => void
  onVisibilityToggle: (id: string) => void
  pendingText: string | null
  setPendingText: (v: string | null) => void
  sendPropToIframe: (id: string, props: Record<string, string>) => void
  applyProp: (id: string, props: Record<string, string>) => void
  onDeselectEl: () => void
  onRenameLayer: (id: string, name: string) => void
  onLinkLayers: (ids: string[]) => void
  onUnlinkLayer: (id: string) => void
  html: string
  onHtmlChange: (html: string) => void
  disabled?: boolean
  htmlRef: React.MutableRefObject<string>
  sectionRequest?: { section: EditorSectionId; token: number } | null
}) {
  const [showCode, setShowCode] = useState(false)
  const [opacity, setOpacity] = useState(100)
  const [layersOpen, setLayersOpen] = useState(true)
  const [assetPickerOpen, setAssetPickerOpen] = useState(false)
  const [textSourceOpen, setTextSourceOpen] = useState(false)
  const [sourceSearch, setSourceSearch] = useState('')
  const [assetOptions, setAssetOptions] = useState<MediaAsset[]>(() => loadEditorSourceAssetsSync())
  const [copySourceOptions, setCopySourceOptions] = useState<CopyBlock[]>(() => loadLinkedTextSources())
  const [activeSection, setActiveSection] = useState<EditorSectionId>('positie')

  useEffect(() => { setOpacity(100) }, [selectedEl?.id])
  useEffect(() => {
    if (sectionRequest) setActiveSection(sectionRequest.section)
  }, [sectionRequest?.token])
  useEffect(() => {
    setAssetPickerOpen(false)
    setTextSourceOpen(false)
    setSourceSearch('')
  }, [selectedEl?.id])

  const cssLeft = selectedEl ? Math.round(selectedEl.left - selectedEl.offsetParentLeft) : 0
  const cssTop  = selectedEl ? Math.round(selectedEl.top  - selectedEl.offsetParentTop)  : 0
  const isImg   = selectedEl?.tag === 'img'

  function updateSelectedSource(nextHtml: string, patch: Partial<EditElType>) {
    onHtmlChange(nextHtml)
    if (!selectedEl) return
    const updated = { ...selectedEl, ...patch }
    onSelectEl(updated)
  }

  function linkAssetSource(result: { assetId: string; src: string }, asset?: MediaAsset) {
    if (!selectedEl) return
    const sourceName = asset?.name ?? result.assetId
    updateSelectedSource(
      updateElementSourceById(htmlRef.current, selectedEl.id, {
        type: 'asset',
        id: result.assetId,
        name: sourceName,
        src: result.src,
      }),
      { sourceType: 'asset', sourceId: result.assetId, sourceName },
    )
    setAssetPickerOpen(false)
  }

  function linkTextSource(block: CopyBlock) {
    if (!selectedEl) return
    updateSelectedSource(
      updateElementSourceById(htmlRef.current, selectedEl.id, {
        type: 'copy',
        id: block.id,
        name: block.name,
        text: block.content,
      }),
      { sourceType: 'copy', sourceId: block.id, sourceName: block.name, text: block.content },
    )
    setTextSourceOpen(false)
    setPendingText(null)
  }

  function unlinkSource() {
    if (!selectedEl) return
    updateSelectedSource(
      updateElementSourceById(htmlRef.current, selectedEl.id, null),
      { sourceType: undefined, sourceId: undefined, sourceName: undefined, sourceLocked: undefined },
    )
  }

  function toggleSourceLock() {
    if (!selectedEl?.sourceType) return
    const locked = !selectedEl.sourceLocked
    updateSelectedSource(
      updateElementSourceLockById(htmlRef.current, selectedEl.id, locked),
      { sourceLocked: locked },
    )
  }

  if (showCode) {
    return (
      <div className="flex h-full flex-col">
        {/* Code header */}
        <div className="flex flex-shrink-0 items-center justify-between border-b border-white/[0.07] px-5 py-3">
          <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-white/40">Broncode</span>
          <button type="button" onClick={() => setShowCode(false)}
            className="flex h-6 w-6 items-center justify-center rounded text-white/30 transition-colors hover:bg-white/[0.07] hover:text-white/70"
            title="Terug naar editor">
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M1 1l8 8M9 1L1 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
          </button>
        </div>
        {/* Code textarea */}
        <textarea
          value={html}
          onChange={(e) => onHtmlChange(e.target.value)}
          disabled={disabled}
          className="flex-1 resize-none bg-[#111111] p-4 font-mono text-[11px] leading-relaxed text-white/60 outline-none focus:bg-[#0f0f0f] disabled:cursor-not-allowed disabled:opacity-40"
          spellCheck={false}
        />
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">

      {/* ── Lagen — altijd zichtbaar, inklapbaar ── */}
      <div className="flex-shrink-0 border-b border-white/[0.07]">
        <div className="flex items-center px-5 py-2.5">
          <button
            type="button"
            onClick={() => setLayersOpen(v => !v)}
            className="flex flex-1 items-center justify-between text-[10px] font-bold uppercase tracking-[0.18em] text-white/35 transition-colors hover:text-white/60"
          >
            Lagen
            <IcoCollapse open={layersOpen} />
          </button>
          {selectedIds.size >= 2 && (
            <button
              type="button"
              onClick={() => onLinkLayers([...selectedIds])}
              title="Koppel geselecteerde lagen"
              className="ml-2 flex h-5 items-center gap-1 rounded px-1.5 text-[10px] text-white/40 transition-colors hover:bg-white/[0.06] hover:text-[#facc15]/80"
            >
              <IcoLink size={11} />
              Koppel
            </button>
          )}
        </div>
        {layersOpen && (
          <div className="max-h-48 overflow-y-auto px-3 pb-2">
            <LayersPanel
              elements={[...editElements].reverse()}
              selectedId={selectedEl?.id ?? null}
              selectedIds={selectedIds}
              lockedIds={lockedIds}
              onSelect={(el, shiftKey) => onSelectEl(el, shiftKey)}
              onToggleLock={onToggleLock}
              onToggleVisibility={(id) => onVisibilityToggle(id)}
              onDelete={onDeleteEl}
              onDuplicate={onDuplicateEl}
              onReorder={onReorderEl}
              onRenameLayer={onRenameLayer}
              onUnlinkLayer={onUnlinkLayer}
            />
          </div>
        )}
      </div>

      {/* ── Bewerkingsicoontjes ── */}
      <div className="flex-shrink-0 border-b border-white/[0.07]">
        <div className="flex items-center justify-around px-1 py-2">
          <EditorTab
            icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 9l-3 3 3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3M2 12h20M12 2v20"/></svg>}
            label="Positie" active={activeSection === 'positie'} disabled={!selectedEl} onClick={() => setActiveSection('positie')} />
          <EditorTab
            icon={isImg
              ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
              : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7V4h16v3M9 20h6M12 4v16"/></svg>
            }
            label={isImg ? 'Afb.' : 'Tekst'} active={activeSection === 'inhoud'} disabled={!selectedEl} onClick={() => setActiveSection('inhoud')} />
          <EditorTab
            icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l10 10-10 10L2 12z"/></svg>}
            label="Stijl" active={activeSection === 'stijl'} disabled={!selectedEl} onClick={() => setActiveSection('stijl')} />
          <EditorTab
            icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14"/></svg>}
            label="FX" active={activeSection === 'fx'} disabled={!selectedEl} onClick={() => setActiveSection('fx')} />
          <EditorTab
            icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="8" strokeDasharray="3 2.5"/></svg>}
            label="Masker" active={activeSection === 'masker'} disabled={!selectedEl} onClick={() => setActiveSection('masker')} />
        </div>
      </div>

      {/* Section content */}
      <div className="flex-1 overflow-y-auto px-5 pb-4 pt-2">

        {!selectedEl && (
          <p className="mt-3 text-[11px] leading-relaxed text-white/25">Selecteer een element om het te bewerken.</p>
        )}

        {activeSection === 'positie' && (selectedEl ? (
          <>
            <div className="mb-3 grid grid-cols-2 gap-2">
              <PropInput label="X" value={String(cssLeft)} unit="px" onCommit={(v) => { const n = parseInt(v); if (!isNaN(n)) applyProp(selectedEl.id, { left: `${n}px`, top: `${Math.round(selectedEl.top - selectedEl.offsetParentTop)}px`, position: 'absolute' }) }} />
              <PropInput label="Y" value={String(cssTop)} unit="px" onCommit={(v) => { const n = parseInt(v); if (!isNaN(n)) applyProp(selectedEl.id, { left: `${Math.round(selectedEl.left - selectedEl.offsetParentLeft)}px`, top: `${n}px`, position: 'absolute' }) }} />
              <PropInput label="Breedte" value={String(Math.round(selectedEl.width))} unit="px" onCommit={(v) => { const n = parseInt(v); if (!isNaN(n)) applyProp(selectedEl.id, { width: `${n}px` }) }} />
              <PropInput label="Hoogte" value={String(Math.round(selectedEl.height))} unit="px" onCommit={(v) => { const n = parseInt(v); if (!isNaN(n)) applyProp(selectedEl.id, { height: `${n}px` }) }} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <PropInput label="Rotatie" value={String(parseRotation(selectedEl.transform))} unit="°" onCommit={(v) => { const n = parseInt(v); if (!isNaN(n)) applyProp(selectedEl.id, { transform: `rotate(${n}deg)` }) }} />
              <PropInput label="Radius" value={parseBorderRadius(selectedEl.borderRadius)} unit="px" onCommit={(v) => { const n = parseInt(v); if (!isNaN(n)) applyProp(selectedEl.id, { borderRadius: `${n}px` }) }} />
            </div>
          </>
        ) : <NoSelectionHint />)}

        {activeSection === 'inhoud' && (selectedEl ? (isImg ? (
          <>
            <SourceLinkPanel
              kind="asset"
              selectedEl={selectedEl}
              onOpenAssetPicker={() => {
                setAssetOptions(loadEditorSourceAssetsSync())
                void loadEditorSourceAssets().then(setAssetOptions)
                setAssetPickerOpen(true)
              }}
              onOpenTextPicker={() => {}}
              onUnlink={unlinkSource}
              onToggleLock={toggleSourceLock}
            />
            <p className="mb-4 text-xs leading-relaxed text-white/40">Sleep het beeld om de uitsnede aan te passen.</p>
            <div className="space-y-2">
              <WIPSection>
                <div className="space-y-2">
                <div className="flex items-center justify-between"><span className="text-[10px] text-white/25">Achtergrond verwijderen</span><div className="h-5 w-8 rounded-full border border-white/[0.08] bg-white/[0.04]" /></div>
                <div className="flex items-center justify-between"><span className="text-[10px] text-white/25">Generative Fill</span><div className="h-5 w-14 rounded-lg border border-white/[0.08] bg-white/[0.04]" /></div>
                </div>
              </WIPSection>
                <div>
                  <div className="mb-1 flex items-center justify-between">
                    <p className="text-[10px] text-white/40">Belichting</p>
                    <span className="text-[10px] tabular-nums text-white/30">{parseBrightness(selectedEl.filter)}%</span>
                  </div>
                  <input type="range" min="0" max="200" value={parseBrightness(selectedEl.filter)} className="w-full h-1.5 accent-[#facc15]"
                    onChange={(e) => { const v = parseInt(e.target.value); sendPropToIframe(selectedEl.id, { filter: setBrightnessFilter(selectedEl.filter, v) }) }}
                    onMouseUp={(e) => { const v = parseInt((e.target as HTMLInputElement).value); applyProp(selectedEl.id, { filter: setBrightnessFilter(selectedEl.filter, v) }) }}
                  />
                </div>
                <div>
                  <p className="mb-1 text-[10px] text-white/40">Filters</p>
                  <div className="flex gap-1">{Object.keys(IMG_FILTERS).map(f => {
                    const active = getActiveImgFilter(selectedEl.filter) === f
                    return <button key={f} type="button" onClick={() => applyProp(selectedEl.id, { filter: IMG_FILTERS[f] })} className={['flex h-6 items-center rounded-md border px-2 text-[10px] transition-colors', active ? 'border-[#facc15]/30 bg-[#facc15]/[0.08] text-[#facc15]' : 'border-white/[0.08] text-white/40 hover:bg-white/[0.06] hover:text-white'].join(' ')}>{f}</button>
                  })}</div>
                </div>
              </div>
          </>
        ) : (
          <>
            <SourceLinkPanel
              kind="copy"
              selectedEl={selectedEl}
              onOpenAssetPicker={() => {}}
              onOpenTextPicker={() => {
                setCopySourceOptions(loadLinkedTextSources())
                setTextSourceOpen((open) => !open)
                setAssetPickerOpen(false)
              }}
              onUnlink={unlinkSource}
              onToggleLock={toggleSourceLock}
            />
            {textSourceOpen && (
              <TextSourcePicker
                sources={copySourceOptions}
                search={sourceSearch}
                onSearch={setSourceSearch}
                onSelect={linkTextSource}
              />
            )}
            <div className="mb-4">
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-white/30">Inhoud</p>
              <input value={pendingText ?? selectedEl.text}
                onChange={(e) => { setPendingText(e.target.value); sendPropToIframe(selectedEl.id, { text: e.target.value }) }}
                onBlur={() => { if (pendingText !== null) { onHtmlChange(updateElementPropertiesById(htmlRef.current, selectedEl.id, { text: pendingText })); setPendingText(null) } }}
                onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') { setPendingText(null); (e.target as HTMLInputElement).blur() } }}
                className="h-8 w-full rounded-lg border border-white/[0.1] bg-white/[0.06] px-2.5 text-sm text-white/80 outline-none focus:border-[#facc15]/40" placeholder="Tekst…" />
            </div>
            <div className="mb-4">
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-white/30">Lettertype</p>
              <FontPicker
                value={selectedEl.fontFamily?.split(',')[0].trim().replace(/['"]/g, '') ?? ''}
                onChange={(family) => applyProp(selectedEl.id, { fontFamily: `'${family}', sans-serif` })}
              />
            </div>
            <div className="mb-4 flex items-end gap-3">
              <div>
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-white/30">Grootte</p>
                <div className="flex items-center gap-1">
                  <button type="button" className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/[0.08] text-[14px] leading-none text-white/50 transition-colors hover:bg-white/[0.08] hover:text-white" onClick={() => { const c = parseFloat(selectedEl.fontSize) || 16; applyProp(selectedEl.id, { fontSize: `${Math.max(6, Math.round(c - 1))}px` }) }}>−</button>
                  <span className="w-10 text-center text-xs tabular-nums text-white/60">{Math.round(parseFloat(selectedEl.fontSize) || 16)}px</span>
                  <button type="button" className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/[0.08] text-[14px] leading-none text-white/50 transition-colors hover:bg-white/[0.08] hover:text-white" onClick={() => { const c = parseFloat(selectedEl.fontSize) || 16; applyProp(selectedEl.id, { fontSize: `${Math.round(c + 1)}px` }) }}>+</button>
                </div>
              </div>
              <button type="button" title="Vet"
                className={['flex h-7 w-9 items-center justify-center rounded-lg border text-sm font-bold transition-colors', (selectedEl.fontWeight === 'bold' || parseInt(selectedEl.fontWeight) >= 700) ? 'border-[#facc15]/30 bg-[#facc15]/[0.08] text-[#facc15]' : 'border-white/[0.08] text-white/40 hover:bg-white/[0.06] hover:text-white'].join(' ')}
                onClick={() => { const b = selectedEl.fontWeight === 'bold' || parseInt(selectedEl.fontWeight) >= 700; applyProp(selectedEl.id, { fontWeight: b ? '400' : 'bold' }) }}>B</button>
            </div>
            <div className="mb-4">
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-white/30">Uitlijning</p>
              <div className="flex items-center gap-1">
                {(['left', 'center', 'right'] as const).map(a => (
                  <button key={a} type="button" className={['flex h-7 w-9 items-center justify-center rounded-lg border transition-colors', selectedEl.textAlign === a ? 'border-[#facc15]/30 bg-[#facc15]/[0.08] text-[#facc15]' : 'border-white/[0.08] text-white/40 hover:bg-white/[0.06] hover:text-white'].join(' ')} onClick={() => applyProp(selectedEl.id, { textAlign: a })}>
                    {a === 'left' && <svg width="11" height="9" viewBox="0 0 11 9" fill="none"><path d="M1 1h9M1 4.5h6M1 8h9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>}
                    {a === 'center' && <svg width="11" height="9" viewBox="0 0 11 9" fill="none"><path d="M1 1h9M2.5 4.5h6M1 8h9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>}
                    {a === 'right' && <svg width="11" height="9" viewBox="0 0 11 9" fill="none"><path d="M1 1h9M4 4.5h6M1 8h9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>}
                  </button>
                ))}
              </div>
            </div>
            <div className="mb-4">
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-white/30">Kleur</p>
              <label className="flex cursor-pointer items-center gap-2.5">
                <div className="h-7 w-7 flex-shrink-0 rounded-lg border border-white/20" style={{ backgroundColor: selectedEl.color || '#ffffff' }} />
                <input type="color" className="sr-only" value={rgbToHex(selectedEl.color || 'rgb(0,0,0)')} onChange={(e) => applyProp(selectedEl.id, { color: e.target.value })} />
                <span className="font-mono text-xs text-white/40">{selectedEl.color || '#ffffff'}</span>
              </label>
            </div>
            <div className="mb-2 grid grid-cols-2 gap-2">
              <PropInput label="Regelafstand" value={parseLineHeight(selectedEl.lineHeight)} unit="×" onCommit={(v) => { const n = parseFloat(v); if (!isNaN(n)) applyProp(selectedEl.id, { lineHeight: String(n) }) }} />
              <PropInput label="Spatiëring" value={parseLetterSpacing(selectedEl.letterSpacing)} unit="em" onCommit={(v) => { const n = parseFloat(v); if (!isNaN(n)) applyProp(selectedEl.id, { letterSpacing: `${n}em` }) }} />
            </div>
            <div className="flex gap-1">
              {([['I', 'italic', 'fontStyle', 'font-style:italic'], ['U', 'underline', 'textDecoration', ''], ['S', 'line-through', 'textDecoration', '']] as const).map(([label, val]) => {
                const isActive = label === 'I' ? selectedEl.fontStyle === 'italic' : selectedEl.textDecoration.includes(val)
                return (
                  <button key={label} type="button"
                    className={['flex h-7 w-9 items-center justify-center rounded-lg border text-sm transition-colors', label === 'I' ? 'italic' : label === 'U' ? 'underline' : 'line-through', isActive ? 'border-[#facc15]/30 bg-[#facc15]/[0.08] text-[#facc15]' : 'border-white/[0.08] text-white/40 hover:bg-white/[0.06] hover:text-white'].join(' ')}
                    onClick={() => {
                      if (label === 'I') {
                        applyProp(selectedEl.id, { fontStyle: selectedEl.fontStyle === 'italic' ? 'normal' : 'italic' })
                      } else {
                        applyProp(selectedEl.id, { textDecoration: toggleDecoration(selectedEl.textDecoration, val) })
                      }
                    }}
                  >{label}</button>
                )
              })}
            </div>
          </>
        )) : <NoSelectionHint />)}

        {activeSection === 'stijl' && (selectedEl ? (
          <>
            <div className="mb-4">
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-white/30">Opaciteit</p>
              <div className="flex items-center gap-2">
                <input type="range" min="0" max="100" value={opacity} className="flex-1 h-1.5 accent-[#facc15]"
                  onChange={(e) => { const v = parseInt(e.target.value); setOpacity(v); sendPropToIframe(selectedEl.id, { opacity: String(v / 100) }) }}
                  onMouseUp={() => applyProp(selectedEl.id, { opacity: String(opacity / 100) })} />
                <span className="w-9 text-right text-xs tabular-nums text-white/50">{opacity}%</span>
              </div>
            </div>
            <div className="space-y-3">
              <div>
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-white/30">Mengmodus</p>
                <select
                  value={selectedEl ? (selectedEl as any).mixBlendMode || 'normal' : 'normal'}
                  onChange={(e) => applyProp(selectedEl.id, { mixBlendMode: e.target.value })}
                  className="h-8 w-full rounded-lg border border-white/[0.1] bg-[#131313] px-2.5 text-xs text-white/60 outline-none focus:border-[#facc15]/40"
                >
                  {['normal','multiply','screen','overlay','darken','lighten','color-dodge','color-burn','hard-light','soft-light','difference','exclusion'].map(m => (
                    <option key={m} value={m}>{m.charAt(0).toUpperCase() + m.slice(1).replace(/-/g, ' ')}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <PropInput label="Hoekradius" value={parseBorderRadius(selectedEl.borderRadius)} unit="px" onCommit={(v) => { const n = parseInt(v); if (!isNaN(n)) applyProp(selectedEl.id, { borderRadius: `${n}px` }) }} />
                <PropInput label="Omtrek" value={String(parseBorderWidth(selectedEl.outline))} unit="px" onCommit={(v) => { const n = parseInt(v); if (!isNaN(n)) applyProp(selectedEl.id, { outline: n > 0 ? `${n}px solid rgba(255,255,255,0.8)` : 'none' }) }} />
              </div>
            </div>
          </>
        ) : <NoSelectionHint />)}

        {activeSection === 'fx' && (selectedEl ? (
          <div className="space-y-4">
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-white/30">Slagschaduw</p>
                <button type="button" onClick={() => applyProp(selectedEl.id, { boxShadow: '4px 4px 12px rgba(0,0,0,0.5)' })} className="text-[10px] text-white/40 hover:text-white transition-colors">+ Toevoegen</button>
              </div>
              {selectedEl.filter.includes('drop-shadow') || (selectedEl as any).boxShadow
                ? <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-[11px] text-white/40">Schaduw actief</div>
                : <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-[11px] text-white/20">Geen schaduwen</div>
              }
            </div>
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-white/30">Gloed</p>
                <button type="button" onClick={() => applyProp(selectedEl.id, { boxShadow: '0 0 20px rgba(250,204,21,0.6)' })} className="text-[10px] text-white/40 hover:text-white transition-colors">+ Toevoegen</button>
              </div>
              <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-[11px] text-white/20">Geen gloed</div>
            </div>
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-white/30">Vervaging</p>
                <span className="text-xs tabular-nums text-white/40">{parseBlur(selectedEl.filter)}px</span>
              </div>
              <input type="range" min="0" max="30" value={parseBlur(selectedEl.filter)} className="w-full h-1.5 accent-[#facc15]"
                onChange={(e) => { const v = parseInt(e.target.value); sendPropToIframe(selectedEl.id, { filter: v > 0 ? `blur(${v}px)` : '' }) }}
                onMouseUp={(e) => { const v = parseInt((e.target as HTMLInputElement).value); applyProp(selectedEl.id, { filter: v > 0 ? `blur(${v}px)` : '' }) }}
              />
            </div>
          </div>
        ) : <NoSelectionHint />)}

        {activeSection === 'masker' && (selectedEl ? (
          <div className="space-y-1">
            {([
              { label: 'Geen masker',      clip: 'none' },
              { label: 'Rechthoekig',      clip: 'inset(0px)' },
              { label: 'Afgerond',         clip: 'inset(0px round 12px)' },
              { label: 'Ellips',           clip: 'ellipse(50% 50% at 50% 50%)' },
              { label: 'Cirkel',           clip: 'circle(50% at 50% 50%)' },
            ] as const).map(({ label, clip }) => {
              const curClip = (selectedEl as any).clipPath || ''
              const isActive = clip === 'none' ? (!curClip || curClip === 'none') : curClip === clip
              return (
                <button key={label} type="button"
                  onClick={() => applyProp(selectedEl.id, { clipPath: clip === 'none' ? '' : clip })}
                  className={['flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-[11px] text-left transition-colors', isActive ? 'border-[#facc15]/30 bg-[#facc15]/[0.06] text-[#facc15]' : 'border-white/[0.06] text-white/40 hover:bg-white/[0.04] hover:text-white/70'].join(' ')}
                >{label}</button>
              )
            })}
            <WIPSection>
              <div className="mt-1 space-y-1">
                {['Vrij masker', 'AI Smart Masker'].map(m => (
                  <div key={m} className="flex items-center gap-2 rounded-lg border border-white/[0.04] px-3 py-2 text-[11px] text-white/20">{m}</div>
                ))}
              </div>
            </WIPSection>
          </div>
        ) : <NoSelectionHint />)}

      </div>

      {/* Code button — pinned to bottom */}
      <div className="flex flex-shrink-0 items-center justify-end border-t border-white/[0.05] px-4 py-2">
        <button
          type="button"
          onClick={() => setShowCode(true)}
          title="Broncode bekijken"
          className="flex items-center gap-1.5 rounded px-2 py-1 text-[10px] font-mono text-white/20 transition-colors hover:bg-white/[0.05] hover:text-white/50"
        >
          <IcoCode size={12} />
          broncode
        </button>
      </div>
      {assetPickerOpen && (
        <MediaAssetPicker
          assets={assetOptions}
          onSelect={(result) => linkAssetSource(result, assetOptions.find((asset) => asset.id === result.assetId))}
          onUpload={(asset) => {
            upsertLegacyMediaAsset(asset)
            setAssetOptions(loadEditorSourceAssetsSync())
            void loadEditorSourceAssets().then(setAssetOptions)
          }}
          onClose={() => setAssetPickerOpen(false)}
        />
      )}
    </div>
  )
}

function layerLabel(el: EditElType): string {
  if (el.name) return el.name
  if (el.tag === 'img') return 'Afbeelding'
  if (/^h[1-6]$/.test(el.tag)) return el.text || 'Koptekst'
  if (el.tag === 'p') return el.text || 'Bodytekst'
  if (el.tag === 'span') return el.text || 'Tekst'
  if (el.text) return el.text.slice(0, 28)
  return 'Element'
}

function SourceLinkPanel({
  kind,
  selectedEl,
  onOpenAssetPicker,
  onOpenTextPicker,
  onUnlink,
  onToggleLock,
}: {
  kind: 'asset' | 'copy'
  selectedEl: EditElType
  onOpenAssetPicker: () => void
  onOpenTextPicker: () => void
  onUnlink: () => void
  onToggleLock: () => void
}) {
  const isLinked = selectedEl.sourceType === kind && !!selectedEl.sourceId
  const label = kind === 'asset' ? 'Asset' : 'Tekstdocument'
  return (
    <div className="mb-4 rounded-lg border border-white/[0.07] bg-white/[0.025] p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-white/30">Bron</p>
        {isLinked && (
          <button
            type="button"
            onClick={onToggleLock}
            className={['h-6 rounded-md border px-2 text-[10px] transition-colors', selectedEl.sourceLocked ? 'border-[#facc15]/30 text-[#facc15]' : 'border-white/[0.07] text-white/35 hover:text-white/65'].join(' ')}
          >
            {selectedEl.sourceLocked ? 'Locked' : 'Auto'}
          </button>
        )}
      </div>
      {isLinked ? (
        <div className="space-y-2">
          <div className="rounded-md border border-[#facc15]/15 bg-[#facc15]/[0.04] px-2.5 py-2">
            <p className="truncate text-xs font-medium text-[#facc15]/85">{selectedEl.sourceName || selectedEl.sourceId}</p>
            <p className="mt-0.5 text-[10px] text-white/28">{label} gekoppeld</p>
          </div>
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={kind === 'asset' ? onOpenAssetPicker : onOpenTextPicker}
              className="flex h-7 flex-1 items-center justify-center rounded-md border border-white/[0.07] text-[11px] text-white/42 transition-colors hover:bg-white/[0.05] hover:text-white/70"
            >
              Vervang
            </button>
            <button
              type="button"
              onClick={onUnlink}
              className="flex h-7 items-center justify-center rounded-md border border-white/[0.07] px-2.5 text-[11px] text-white/35 transition-colors hover:bg-red-500/[0.08] hover:text-red-300"
            >
              Ontkoppel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={kind === 'asset' ? onOpenAssetPicker : onOpenTextPicker}
          className="flex h-8 w-full items-center justify-center rounded-md border border-white/[0.08] text-xs text-white/50 transition-colors hover:bg-white/[0.05] hover:text-white/75"
        >
          {kind === 'asset' ? 'Koppel asset' : 'Koppel tekst'}
        </button>
      )}
    </div>
  )
}

function TextSourcePicker({
  sources,
  search,
  onSearch,
  onSelect,
}: {
  sources: CopyBlock[]
  search: string
  onSearch: (value: string) => void
  onSelect: (source: CopyBlock) => void
}) {
  const q = search.trim().toLowerCase()
  const filtered = q
    ? sources.filter((source) => `${source.name} ${source.content} ${(source.tags ?? []).join(' ')}`.toLowerCase().includes(q))
    : sources

  return (
    <div className="mb-4 rounded-lg border border-white/[0.07] bg-[#111] p-2">
      <input
        autoFocus
        value={search}
        onChange={(event) => onSearch(event.target.value)}
        placeholder="Zoek tekstbron..."
        className="mb-2 h-8 w-full rounded-md border border-white/[0.08] bg-white/[0.04] px-2.5 text-xs text-white/70 outline-none placeholder:text-white/25 focus:border-white/[0.16]"
      />
      <div className="max-h-44 overflow-y-auto">
        {filtered.length === 0 ? (
          <p className="px-2 py-3 text-center text-xs text-white/25">Geen tekstbronnen gevonden.</p>
        ) : (
          filtered.map((source) => (
            <button
              key={source.id}
              type="button"
              onClick={() => onSelect(source)}
              className="flex w-full flex-col rounded-md px-2 py-2 text-left transition-colors hover:bg-white/[0.05]"
            >
              <span className="truncate text-xs font-medium text-white/70">{source.name}</span>
              <span className="mt-0.5 line-clamp-2 text-[10px] leading-4 text-white/30">{source.content}</span>
            </button>
          ))
        )}
      </div>
    </div>
  )
}

function LayerTypeIcon({ tag }: { tag: string }) {
  if (tag === 'img') return <IcoLayerImage />
  if (/^h[1-6]$/.test(tag)) return <IcoLayerHeading />
  if (tag === 'p' || tag === 'span') return <IcoLayerText />
  return <IcoLayerBox />
}

function LayersPanel({
  elements, selectedId, selectedIds, lockedIds, onSelect, onToggleLock, onToggleVisibility, onDelete, onDuplicate, onReorder, onRenameLayer, onUnlinkLayer,
}: {
  elements: EditElType[]
  selectedId: string | null
  selectedIds: Set<string>
  lockedIds: Set<string>
  onSelect: (el: EditElType, shiftKey?: boolean) => void
  onToggleLock: (id: string) => void
  onToggleVisibility: (id: string) => void
  onDelete: (id: string) => void
  onDuplicate: (id: string) => void
  onReorder: (dragId: string, targetId: string, panelPos: 'before' | 'after') => void
  onRenameLayer: (id: string, name: string) => void
  onUnlinkLayer: (id: string) => void
}) {
  const [hovered, setHovered] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [dragId, setDragId] = useState<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)
  const [dragOverPos, setDragOverPos] = useState<'before' | 'after'>('before')

  function startRename(el: EditElType) {
    setEditingId(el.id)
    setEditingName(layerLabel(el))
  }

  function commitRename(id: string) {
    if (editingId !== id) return
    onRenameLayer(id, editingName.trim())
    setEditingId(null)
  }

  function handleDragOver(e: React.DragEvent, targetId: string) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setDragOverId(targetId)
    setDragOverPos(e.clientY < rect.top + rect.height / 2 ? 'before' : 'after')
  }

  function handleDrop(e: React.DragEvent, targetId: string) {
    e.preventDefault()
    if (dragId && dragId !== targetId) onReorder(dragId, targetId, dragOverPos)
    setDragId(null); setDragOverId(null)
  }

  if (elements.length === 0) {
    return <p className="mt-4 text-center text-[11px] text-white/25">Geen elementen gevonden.<br/>Genereer eerst een ontwerp.</p>
  }
  return (
    <div className="mt-1" onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) { setDragOverId(null) } }}>
      {elements.map((el) => {
        const isSelected = el.id === selectedId
        const isMultiSelected = !isSelected && selectedIds.has(el.id)
        const isLocked = lockedIds.has(el.id) || !!el.locked
        const isHidden = el.visibility === 'hidden'
        const isDragging = dragId === el.id
        const isDropTarget = dragOverId === el.id
        return (
          <div key={el.id} className="relative">
            {isDropTarget && dragOverPos === 'before' && (
              <div className="pointer-events-none absolute inset-x-0 top-0 h-0.5 rounded-full bg-[#facc15]/70" />
            )}
            <PanelLayerRow
              draggable
              active={isSelected}
              selected={isMultiSelected}
              dragging={isDragging}
              dropTarget={isDropTarget && dragOverPos === 'after'}
              onDragStart={(e) => { setDragId(el.id); e.dataTransfer.effectAllowed = 'move' }}
              onDragOver={(e) => handleDragOver(e, el.id)}
              onDrop={(e) => handleDrop(e, el.id)}
              onDragEnd={() => { setDragId(null); setDragOverId(null) }}
              onMouseEnter={() => setHovered(el.id)}
              onMouseLeave={() => setHovered(null)}
            >
              <PanelLayerDragHandle />

              {/* Type icon */}
              <span className={['flex-shrink-0', isHidden ? 'opacity-35' : ''].join(' ')}>
                <LayerTypeIcon tag={el.tag} />
              </span>

              {/* Label — click to select, double-click to rename */}
              {editingId === el.id ? (
                <input
                  autoFocus
                  className="min-w-0 flex-1 truncate rounded bg-black/40 px-1 text-[11px] text-white outline-none ring-1 ring-[#facc15]/50"
                  value={editingName}
                  onChange={(e) => setEditingName(e.target.value)}
                  onBlur={() => commitRename(el.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); commitRename(el.id) }
                    if (e.key === 'Escape') { e.stopPropagation(); setEditingId(null) }
                  }}
                />
              ) : (
                <button
                  type="button"
                  onClick={(e) => onSelect(el, e.shiftKey)}
                  onDoubleClick={() => startRename(el)}
                  className={['min-w-0 flex-1 truncate text-left text-[11px]', isHidden ? 'opacity-35' : ''].join(' ')}
                  title={layerLabel(el)}
                >
                  {layerLabel(el)}
                </button>
              )}

              {/* Action icons — always visible */}
              <div className="flex flex-shrink-0 items-center gap-0.5 pr-1">
                {/* Duplicate */}
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onDuplicate(el.id) }}
                  title="Dupliceren"
                  className="flex h-5 w-5 items-center justify-center rounded text-white/25 hover:bg-white/[0.08] hover:text-white/70"
                >
                  <IcoDuplicate size={11} />
                </button>
                {/* Link indicator / unlink button */}
                {el.linkGroupId && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onUnlinkLayer(el.id) }}
                    title="Ontkoppelen"
                    className="flex h-5 w-5 items-center justify-center rounded text-[#facc15]/60 hover:bg-white/[0.08] hover:text-[#facc15]"
                  >
                    <IcoLink size={11} />
                  </button>
                )}
                {/* Visibility */}
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onToggleVisibility(el.id) }}
                  title={isHidden ? 'Tonen' : 'Verbergen'}
                  className={['flex h-5 w-5 items-center justify-center rounded hover:bg-white/[0.08]', isHidden ? 'text-white/60 hover:text-white/90' : 'text-white/25 hover:text-white/70'].join(' ')}
                >
                  {isHidden ? <IcoEyeOff size={11} /> : <IcoEye size={11} />}
                </button>

                {/* Lock */}
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onToggleLock(el.id) }}
                title={isLocked ? 'Ontgrendelen' : 'Vergrendelen'}
                className={['flex h-5 w-5 items-center justify-center rounded hover:bg-white/[0.08]', isLocked ? 'text-[#facc15]/80 hover:text-[#facc15]' : 'text-white/25 hover:text-white/70'].join(' ')}
              >
                {isLocked ? <IcoLock size={10} /> : <IcoLockOpen size={10} />}
              </button>

                {/* Delete */}
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onDelete(el.id) }}
                  title="Verwijderen"
                  className="flex h-5 w-5 items-center justify-center rounded text-white/25 hover:bg-red-500/10 hover:text-red-400"
                >
                  <IcoTrash size={10} />
                </button>
              </div>
            </PanelLayerRow>
            {isDropTarget && dragOverPos === 'after' && (
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-[#facc15]/70" />
            )}
          </div>
        )
      })}
    </div>
  )
}

function EditorTab({ icon, label, active, wip, disabled, onClick }: {
  icon: React.ReactNode; label: string; active: boolean; wip?: boolean; disabled?: boolean; onClick: () => void
}) {
  const unavailable = disabled && !wip
  return (
    <button
      type="button"
      onClick={unavailable ? undefined : onClick}
      title={wip ? `${label} · Nog in ontwikkeling` : disabled ? 'Selecteer een element' : label}
      className={[
        'flex flex-col items-center gap-1 rounded-lg px-2 py-1.5 transition-colors',
        active
          ? 'text-[#facc15]'
          : unavailable
          ? 'cursor-not-allowed text-white/15'
          : wip
          ? 'cursor-pointer text-white/20 hover:text-white/38'
          : 'text-white/38 hover:text-white/70',
      ].join(' ')}
    >
      {icon}
      <span className="text-[8px] font-semibold uppercase tracking-widest leading-none">
        {label}
      </span>
    </button>
  )
}

function NoSelectionHint() {
  return (
    <p className="text-xs leading-relaxed text-white/30">Selecteer een element om deze opties te zien.</p>
  )
}

/* ─── Helper sub-components for the editor panel ─── */

function EditorSection({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(true)
  return (
    <div className="border-t border-white/[0.05] py-3">
      <button type="button" onClick={() => setOpen((v) => !v)}
        className="mb-2.5 flex w-full items-center justify-between text-[10px] font-bold uppercase tracking-[0.18em] text-white/30 hover:text-white/50 transition-colors">
        {title}
        <IcoCollapse open={open} />
      </button>
      {open && children}
    </div>
  )
}

function WIPSection({ children }: { children: React.ReactNode }) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative" onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
      <div className="pointer-events-none select-none opacity-30">{children}</div>
      {show && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="rounded-full border border-white/[0.12] bg-[#1a1a1a] px-3 py-1.5 text-[10px] text-white/60 shadow-xl">
            Nog in ontwikkeling
          </span>
        </div>
      )}
    </div>
  )
}

function PropInput({ label, value, unit, onCommit, disabled = false }: {
  label: string; value: string; unit?: string; onCommit?: (v: string) => void; disabled?: boolean
}) {
  const [local, setLocal] = useState(value)
  useEffect(() => { setLocal(value) }, [value])
  return (
    <div>
      <p className="mb-1 text-[9px] font-semibold uppercase tracking-widest text-white/25">{label}</p>
      <div className="flex h-7 items-center gap-1 rounded-lg border border-white/[0.1] bg-white/[0.05] px-2 text-xs text-white/70">
        <input type="text" value={local} disabled={disabled}
          className="min-w-0 flex-1 bg-transparent outline-none disabled:opacity-40"
          onChange={(e) => setLocal(e.target.value)}
          onBlur={() => onCommit?.(local)}
          onKeyDown={(e) => { if (e.key === 'Enter') { onCommit?.(local); (e.target as HTMLInputElement).blur() } }}
        />
        {unit && <span className="flex-shrink-0 text-white/25">{unit}</span>}
      </div>
    </div>
  )
}

/* ─── Left editor toolbar ─── */

function LeftEditorToolbar({ activeTool, onToolSelect, hasSelection }: { activeTool: string; onToolSelect: (t: string) => void; hasSelection: boolean }) {
  type ToolDef = { id: string; label: string; icon: React.ReactNode; wip?: boolean }
  const groups: ToolDef[][] = [
    [{ id: 'select', label: 'Selecteren', icon: <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2.5 2L7 11.5L9 8L12 6.5L2.5 2Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/></svg> }],
    [
      { id: 'text',    label: 'Tekst toevoegen (T)',      icon: <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 3.5h10M7 3.5v7M4.5 10.5h5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg> },
      { id: 'rect',    label: 'Rechthoek (R)',             icon: <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="2" y="2" width="10" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.3"/></svg> },
      { id: 'ellipse', label: 'Ellips (O)',                icon: <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><ellipse cx="7" cy="7" rx="4.5" ry="4.5" stroke="currentColor" strokeWidth="1.3"/></svg> },
      { id: 'line',    label: 'Lijn (L)',                  icon: <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 12L12 2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg> },
      { id: 'pen',     label: 'Pen / Vectoren',            icon: <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M9 2L12 5L5.5 11.5L2 12L2.5 8.5L9 2Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/><path d="M8 3L11 6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>, wip: true },
    ],
    [
      { id: 'image',   label: 'Afbeelding invoegen',      icon: <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="1.5" y="2.5" width="11" height="9" rx="1" stroke="currentColor" strokeWidth="1.3"/><path d="M1.5 9L4.5 6L7 8.5L9.5 6.5L12.5 9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/><circle cx="5" cy="5" r="1" fill="currentColor"/></svg> },
      { id: 'video',   label: 'Video invoegen',           icon: <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="1.5" y="2.5" width="11" height="9" rx="1" stroke="currentColor" strokeWidth="1.3"/><path d="M5.5 5.5L9.5 7L5.5 8.5V5.5Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/></svg>, wip: true },
    ],
    [
      { id: 'mask',     label: hasSelection ? 'Masker' : 'Masker · selecteer eerst een laag', icon: <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="5" cy="7" r="3.5" stroke="currentColor" strokeWidth="1.3" strokeDasharray="2 1.5"/><circle cx="9" cy="7" r="3.5" stroke="currentColor" strokeWidth="1.3"/></svg> },
      { id: 'eyedrop',  label: hasSelection ? 'Kleurprikker' : 'Kleurprikker · selecteer eerst een laag', icon: <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M10 2L12 4L6 10L3 11L4 8L10 2Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/><path d="M3 11L2 12.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg> },
    ],
  ]

  return (
    <div className="flex w-12 flex-shrink-0 flex-col items-center gap-0.5 overflow-y-auto border-r border-white/[0.06] bg-[#131313] px-2 py-4">
      {groups.map((group, gi) => (
        <React.Fragment key={gi}>
          {gi > 0 && <div className="my-1.5 h-px w-6 bg-white/[0.08]" />}
          {group.map((tool) => (
            tool.wip ? (
              <WIPTool key={tool.id} label={tool.label}>
                <div className="flex h-8 w-8 items-center justify-center rounded-lg text-white/20">
                  {tool.icon}
                </div>
              </WIPTool>
            ) : (
              <ToolTip key={tool.id} label={tool.label}>
                <button type="button"
                  onClick={() => onToolSelect(tool.id)}
                  className={[
                    'flex h-8 w-8 items-center justify-center rounded-lg transition-colors',
                    activeTool === tool.id
                      ? 'bg-[#facc15]/10 text-[#facc15]'
                      : 'text-white/40 hover:bg-white/[0.07] hover:text-white',
                  ].join(' ')}
                >
                  {tool.icon}
                </button>
              </ToolTip>
            )
          ))}
        </React.Fragment>
      ))}
    </div>
  )
}

function ToolTip({ label, children }: { label: string; children: React.ReactNode }) {
  return <LeftToolTooltip label={label}>{children}</LeftToolTooltip>
}

function WIPTool({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <LeftToolTooltip label={label} wip>
      <div className="cursor-not-allowed opacity-35">
        <div className="pointer-events-none">{children}</div>
      </div>
    </LeftToolTooltip>
  )
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function fixSourceImageSrc(html: string, correctSrc: string): string {
  const escaped = correctSrc.replace(/"/g, '&quot;')
  // Fix src when id="source-image" appears before src
  let fixed = html.replace(
    /(<img\b[^>]*\bid=["']source-image["'][^>]*?)\bsrc=["'][^"']*["']/gi,
    `$1src="${escaped}"`
  )
  // Fix src when src appears before id="source-image"
  fixed = fixed.replace(
    /(<img\b[^>]*?)\bsrc=["'][^"']*["']([^>]*?\bid=["']source-image["'])/gi,
    `$1src="${escaped}"$2`
  )
  return fixed
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function createPrintAdHtml(
  payload: PrintFunnelPayload | null,
  format: { width: number; height: number; unit?: string },
): string {
  const isPrint = format.unit === 'mm'
  const w = isPrint ? `${format.width}mm` : `${format.width}px`
  const h = isPrint ? `${format.height}mm` : `${format.height}px`
  const imageSrc = payload?.imageSrc ?? ''
  // Minimal skeleton — AI designs everything from scratch
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html,body{width:${w};height:${h};overflow:hidden;background:#f5f5f3}
@page{size:${w} ${h};margin:0}
</style>
</head>
<body>
${imageSrc ? `<img id="source-image" src="${escapeHtml(imageSrc)}" style="display:none" alt="">` : ''}
<!-- Advertentie wordt door AI gegenereerd -->
</body>
</html>`
}

// Reporter script runs inside the iframe: sends element bounding rects + computed styles via postMessage,
// and listens for huphe-prop-update messages to apply live property changes without HTML round-trips.
const HUPHE_REPORTER_SCRIPT = `<script>(function(){
  function report(){
    var items=[];
    var all=document.querySelectorAll('[data-huphe-id]');
    for(var i=0;i<all.length;i++){
      var el=all[i];
      var r=el.getBoundingClientRect();
      if(r.width===0&&r.height===0)continue;
      var cs=window.getComputedStyle(el);
      var par=el.offsetParent;var parRect=par?par.getBoundingClientRect():{left:0,top:0};var parentHupheId=par&&par.getAttribute?par.getAttribute('data-huphe-id')||'':'';var linkGroupId=el.getAttribute('data-huphe-link')||'';
      items.push({id:el.getAttribute('data-huphe-id'),tag:el.tagName.toLowerCase(),text:(el.innerText||'').trim().slice(0,80),name:el.getAttribute('data-huphe-name')||'',left:Math.round(r.left),top:Math.round(r.top),width:Math.round(r.width),height:Math.round(r.height),position:cs.position,fontSize:cs.fontSize,color:cs.color,fontFamily:cs.fontFamily,fontWeight:cs.fontWeight,textAlign:cs.textAlign,offsetParentLeft:Math.round(parRect.left),offsetParentTop:Math.round(parRect.top),objectFit:cs.objectFit,objectPosition:cs.objectPosition,visibility:cs.visibility,fontStyle:cs.fontStyle,textDecoration:cs.textDecoration,lineHeight:cs.lineHeight,letterSpacing:cs.letterSpacing,borderRadius:cs.borderRadius,filter:cs.filter,transform:el.style.transform||'',outline:el.style.outline||'',locked:el.getAttribute('data-huphe-locked')==='true',parentHupheId:parentHupheId,linkGroupId:linkGroupId,sourceType:el.getAttribute('data-huphe-source-type')||'',sourceId:el.getAttribute('data-huphe-source-id')||'',sourceName:el.getAttribute('data-huphe-source-name')||'',sourceLocked:el.getAttribute('data-huphe-source-locked')==='true'});
    }
    window.parent.postMessage({type:'huphe-layout',items:items},'*');
  }
  window.addEventListener('message',function(e){
    if(!e.data)return;
    if(e.data.type==='huphe-report'){report();return;}
    if(e.data.type==='huphe-attr-update'){
      var attrEl=document.querySelector('[data-huphe-id="'+e.data.id+'"]');
      if(!attrEl)return;
      var attrs=e.data.attrs||{};
      for(var ak in attrs){if(attrs[ak]===null||attrs[ak]===undefined||attrs[ak]==='')attrEl.removeAttribute(ak);else attrEl.setAttribute(ak,attrs[ak]);}
      report();
      return;
    }
    if(e.data.type!=='huphe-prop-update')return;
    var el=document.querySelector('[data-huphe-id="'+e.data.id+'"]');
    if(!el)return;
    var p=e.data.props;
    if(p.text!==undefined)el.innerHTML=p.text;
    var s=el.getAttribute('style')||'';
    var handled=['text'];
    function setCss(css,val){handled.push(css.replace(/-([a-z])/g,function(_,c){return c.toUpperCase();}));s=s.replace(new RegExp('(?:^|;)\\\\s*'+css.replace(/[-]/g,'[-]')+'\\\\s*:[^;]*(;|$)','gi'),';')+';'+css+':'+val;}
    if(p.left!==undefined)setCss('left',p.left);
    if(p.top!==undefined)setCss('top',p.top);
    if(p.position!==undefined)setCss('position',p.position);
    if(p.visibility!==undefined)setCss('visibility',p.visibility);
    if(p.fontSize!==undefined)setCss('font-size',p.fontSize);
    if(p.color!==undefined)setCss('color',p.color);
    if(p.fontFamily!==undefined)setCss('font-family',p.fontFamily);
    if(p.fontWeight!==undefined)setCss('font-weight',p.fontWeight);
    if(p.textAlign!==undefined)setCss('text-align',p.textAlign);
    if(p.objectPosition!==undefined)setCss('object-position',p.objectPosition);
    for(var k in p){if(handled.indexOf(k)>=0)continue;var css=k.replace(/([A-Z])/g,'-$1').toLowerCase();s=s.replace(new RegExp('(?:^|;)\\\\s*'+css.replace(/[-]/g,'[-]')+'\\\\s*:[^;]*(;|$)','gi'),';')+';'+css+':'+p[k];}
    el.setAttribute('style',s.replace(/^;+/,'').replace(/;;+/g,';'));
  });
  if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',report);}else{report();}
})();<\/script>`

function injectEditIds(html: string): string {
  let counter = 0
  const allowed = /^(div|p|h[1-6]|span|section|article|header|footer|main|figure|img)$/i
  return html.replace(/<([a-zA-Z][a-zA-Z0-9]*)([^>]*)(\/?>)/g, (match, tag, attrs, close) => {
    if (!allowed.test(tag)) return match
    if (/data-huphe-id/i.test(attrs)) return match
    return `<${tag}${attrs} data-huphe-id="he-${counter++}"${close}`
  })
}

function updateElementNameById(html: string, id: string, name: string): string {
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')
  const el = doc.querySelector(`[data-huphe-id="${id}"]`)
  if (!el) return html
  if (name) el.setAttribute('data-huphe-name', name)
  else el.removeAttribute('data-huphe-name')
  return '<!doctype html>\n' + doc.documentElement.outerHTML
}

function updateElementPositionById(html: string, id: string, newLeft: number, newTop: number): string {
  return updateElementPropertiesById(html, id, { left: `${Math.round(newLeft)}px`, top: `${Math.round(newTop)}px`, position: 'absolute' })
}

function updateElementPropertiesById(html: string, id: string, props: Record<string, string>): string {
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')
  const el = doc.querySelector(`[data-huphe-id="${id}"]`)
  if (!el) return html
  if (props.text !== undefined) { el.innerHTML = sanitizeHtml(props.text); delete props.text }
  let s = el.getAttribute('style') ?? ''
  for (const [prop, val] of Object.entries(props)) {
    const cssName = prop.replace(/([A-Z])/g, '-$1').toLowerCase()
    s = s.replace(new RegExp(`\\b${cssName}\\s*:[^;]*(;|$)`, 'gi'), '')
    s += `;${cssName}:${val}`
  }
  el.setAttribute('style', s.replace(/^;+/, '').replace(/;;+/g, ';'))
  return '<!doctype html>\n' + doc.documentElement.outerHTML
}

function updateElementLockById(html: string, id: string, locked: boolean): string {
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')
  const el = doc.querySelector(`[data-huphe-id="${id}"]`)
  if (!el) return html
  if (locked) el.setAttribute('data-huphe-locked', 'true')
  else el.removeAttribute('data-huphe-locked')
  return '<!doctype html>\n' + doc.documentElement.outerHTML
}

function updateElementSourceById(
  html: string,
  id: string,
  source: { type: ElementSourceType; id: string; name: string; src?: string; text?: string } | null,
): string {
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')
  const el = doc.querySelector(`[data-huphe-id="${id}"]`)
  if (!el) return html

  if (!source) {
    el.removeAttribute('data-huphe-source-type')
    el.removeAttribute('data-huphe-source-id')
    el.removeAttribute('data-huphe-source-name')
    el.removeAttribute('data-huphe-source-locked')
    return '<!doctype html>\n' + doc.documentElement.outerHTML
  }

  el.setAttribute('data-huphe-source-type', source.type)
  el.setAttribute('data-huphe-source-id', source.id)
  el.setAttribute('data-huphe-source-name', source.name)
  el.removeAttribute('data-huphe-source-locked')

  if (source.type === 'asset' && source.src && el.tagName.toLowerCase() === 'img') {
    el.setAttribute('src', source.src)
  }
  if (source.type === 'copy' && source.text !== undefined) {
    el.innerHTML = escapeHtml(source.text).replace(/\n/g, '<br>')
  }

  return '<!doctype html>\n' + doc.documentElement.outerHTML
}

function updateElementSourceLockById(html: string, id: string, locked: boolean): string {
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')
  const el = doc.querySelector(`[data-huphe-id="${id}"]`)
  if (!el) return html
  if (locked) el.setAttribute('data-huphe-source-locked', 'true')
  else el.removeAttribute('data-huphe-source-locked')
  return '<!doctype html>\n' + doc.documentElement.outerHTML
}

function parseObjPosPx(str: string, elW: number, elH: number): { x: number; y: number } {
  const parts = (str || '50% 50%').trim().split(/\s+/)
  const toNum = (v: string, dim: number) => {
    if (!v) return dim * 0.5
    if (v.endsWith('%')) return parseFloat(v) / 100 * dim
    return parseFloat(v)
  }
  return { x: toNum(parts[0], elW), y: toNum(parts[1] ?? parts[0], elH) }
}

function rgbToHex(rgb: string): string {
  const m = rgb.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/)
  if (!m) return '#000000'
  return '#' + [m[1], m[2], m[3]].map(n => parseInt(n).toString(16).padStart(2, '0')).join('')
}

function cleanEditAnnotations(html: string): string {
  return html
    .replace(/\s+data-huphe-id="[^"]*"/g, '')
    .replace(/<script>\(function\(\)\{[\s\S]*?huphe[\s\S]*?<\/script>/g, '')
}

function ScanOverlay({ isEdit = false }: { isEdit?: boolean }) {
  return (
    <div
      className="pointer-events-none absolute inset-0 overflow-hidden"
      style={isEdit
        ? { background: 'rgba(5,5,5,0.58)', backdropFilter: 'blur(3px)' }
        : { background: '#050505' }
      }
    >
      <style>{`
        .sc-line {
          position: absolute;
          box-shadow: 0 0 5px 0px rgba(0, 255, 204, 0.5);
        }
        .sc-h {
          left: 0; width: 100%; height: 1px;
          background: linear-gradient(to right, transparent 5%, #00ffcc, transparent 95%);
        }
        .sc-v {
          top: 0; height: 100%; width: 1px;
          background: linear-gradient(to bottom, transparent 5%, #00ffcc, transparent 95%);
        }
        .sc-hf1 { top: -5%; animation: sc-vfull 6s linear infinite; }
        .sc-vf1 { left: -5%; animation: sc-hfull 7s linear infinite; }
        .sc-vi1 { left: -5%; opacity: 0.6; animation: sc-hi75 2.5s linear infinite alternate; }
        .sc-vi2 { left: -5%; opacity: 0.7; animation: sc-hi60 4s linear infinite alternate 1s; }
        .sc-vi3 { left: -5%; opacity: 0.5; animation: sc-hi40 1.8s linear infinite alternate 0.5s; }
        .sc-hi1 { top: -5%; opacity: 0.6; animation: sc-vi70 3s linear infinite alternate 1.5s; }
        .sc-hi2 { top: -5%; opacity: 0.4; animation: sc-vi50 5s linear infinite alternate 2s; }
        @keyframes sc-vfull  { 0% { top: -5%; }   100% { top: 105%; } }
        @keyframes sc-hfull  { 0% { left: -5%; }  100% { left: 105%; } }
        @keyframes sc-hi75   { from { left: -5%; } to { left: 75%; } }
        @keyframes sc-hi60   { from { left: -5%; } to { left: 60%; } }
        @keyframes sc-hi40   { from { left: -5%; } to { left: 40%; } }
        @keyframes sc-vi70   { from { top: -5%; }  to { top: 70%; } }
        @keyframes sc-vi50   { from { top: -5%; }  to { top: 50%; } }
      `}</style>
      <div className="sc-line sc-h sc-hf1" />
      <div className="sc-line sc-v sc-vf1" />
      <div className="sc-line sc-v sc-vi1" />
      <div className="sc-line sc-v sc-vi2" />
      <div className="sc-line sc-v sc-vi3" />
      <div className="sc-line sc-h sc-hi1" />
      <div className="sc-line sc-h sc-hi2" />
    </div>
  )
}

function PrintEditorIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="3" width="14" height="18" rx="1.5" />
      <path d="M8 8h8" />
      <path d="M8 12h5" />
      <path d="M8 16h8" />
    </svg>
  )
}
