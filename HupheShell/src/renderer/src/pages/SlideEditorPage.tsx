import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import logo from '../assets/logo.png'
import { supabase } from '../lib/supabase'
import { WebSlidePreview, getImageRenderGeometry, imageNaturalSizeCache } from '../components/WebSlidePreview'
import type { KeynoteTable, KeynoteTableCell, LayerHoverTarget, TemplateData, TemplateLayout } from '../components/WebSlidePreview'
import { useLivePresentation } from '../hooks/useLivePresentation'
import { useLiveAtelierProject } from '../hooks/useLiveAtelierProject'
import { pushAtelierProjectToSupabase, fetchAtelierProjectById, fetchLiveAtelierProjects } from '../lib/atelier-project-sync'
import { shareAssetToSupabase } from '../lib/atelier-asset-sync'
import { useVoiceCommand, type VoiceCommandAction } from '../hooks/useVoiceCommand'
import { useMeetingNotes } from '../hooks/useMeetingNotes'
import TextReviewModal, { type TextSegment } from '../components/TextReviewModal'
import { parseMarkdownToSegments, parsePlainTextToSegments, detectFileType } from '../lib/parseRawTextToSegments'
import ExportPreflightModal from '../components/ExportPreflightModal'
import ExportProgressModal from '../components/ExportProgressModal'
import PresenterNotesField from '../components/PresenterNotesField'
import { type DrawingAnnotation, type TextHighlight } from '../components/SlideCommentThread'
import PresenceAvatars from '../components/PresenceAvatars'
import PdfImportReviewScreen, { type DetectedElement as OcrElement } from '../components/PdfImportReviewScreen'
import SharePermissionsModal from '../components/SharePermissionsModal'
import TableBlockEditor from '../components/TableBlockEditor'
import PresentationModeOverlay from '../components/PresentationModeOverlay'
import type { TableCell, TableElement, TableRow } from '../lib/ir/types'
import { getCachedSageTags, getCachedPreviewBlock } from '../lib/perf-preview-cache'
import { useAnnotationState } from '../hooks/useAnnotationState'
import { useRightPanelState } from '../hooks/useRightPanelState'
import {
  useAtelierMediaProjects,
  unmarkImageAsProject,
  loadAtelierMediaProjects,
  type AtelierMediaProject,
  type AtelierMediaModel,
} from '../hooks/useAtelierMedia'
import { clearPrintPayload } from '../hooks/useAtelierPrint'
import RightEditorPanel from '../components/RightEditorPanel'
import LeftEditorPanel from '../components/LeftEditorPanel'
import AnimatedPixelBackground from '../components/AnimatedPixelBackground'
import MeetingNotesDrawer from '../components/MeetingNotesDrawer'
import PdfExportCapture from '../components/PdfExportCapture'
import { useCalibration, type CalibrationReport } from '../hooks/useCalibration'
import { notifyCreditsRequired, notifyIfCreditsRequired } from '../lib/credits-required'
import AtelierCreationModeButtons, {
  ATELIER_CREATION_OPTIONS,
  type AtelierCreationSelection,
  type AtelierCreationType,
} from '../components/AtelierCreationModeButtons'
import AtelierRightPanel, { type AtelierProjectsPanelConfig, type AtelierSidebarPanelType, type SidebarProject } from '../components/AtelierRightPanel'
import { AtelierThinkingBubble } from '../components/AtelierSetupShell'
import AtelierCreationPlaceholder from '../components/AtelierCreationPlaceholder'
import { AtelierCreationSidebar, PlusTinyIcon, AtelierModeChip, AtelierModelIcon } from '../components/AtelierSharedUI'
import { IcoPanelToggle } from '../components/Icons'
import { AtelierModelPickerButton } from '../components/AtelierModelPickerButton'
import { AtelierMediaCreationPanel } from '../components/AtelierMediaPanel'
import PrintFlow from '../components/PrintFlow'
import BannerFlow from '../components/BannerFlow'
import { persistTemplate, resolveTemplateData } from '../lib/template-storage'
import {
  loadBannerProjects, loadPrintProjects,
  upsertBannerProject, upsertPrintProject,
  removeBannerProject, removePrintProject,
  type AtelierProjectFreshnessTarget, type AtelierSavedProject, type ProjectAssetRef, type ProjectCopyRef, type SavedBannerProject, type SavedPrintProject,
} from '../lib/atelier-project-store'
import { type MediaAsset } from '../lib/media-asset-store'
import { fetchAssetsByIds, loadAssets as loadLibraryAssets, upsertAsset as upsertLibraryAsset, resolveAssetSrc } from '../lib/asset-library'
import { loadSavedImagesAsMediaAssets, mergeMediaAssetSources } from '../lib/atelier-linked-sources'
import { buildProjectFromRefs, type CrossFormatSeed } from '../lib/atelier-cross-format'
import { findClientByTemplateHint, parseAtelierIntent, type AtelierIntent } from '../lib/atelier-intent'
import { buildAtelierCreativePlan, summarizeCreativePlan, type AtelierCreativePlan } from '../lib/atelier-creative-plan'
import { loadModuleModels, loadModulePrompt } from '../lib/atelier-module-config'
import {
  getHtmlPresentationTemplate,
  getKeynoteBackedClientIds,
  htmlTemplateIdFromClientId,
  htmlTemplateToTemplateData,
  isHtmlTemplateClientId,
  loadHtmlTemplateOptions,
} from '../lib/html-presentation-templates'
import { useAtelierAnalysis } from '../hooks/useAtelierAnalysis'
import { useAtelierExport } from '../hooks/useAtelierExport'
import AtelierUploadFlow from '../components/AtelierUploadFlow'
import { getSageTags, getFields, autoResolveTag, resolvedTag, buildPreviewBlock, layoutHasImageSlot, formatDynamicDate, isDateFieldRole } from '../lib/editor-types'
import type { Block, SavedComment, Overrides, ImageFitMode } from '../lib/editor-types'

function makeTableId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
}

function getTableColumnCount(rows: TableRow[]): number {
  return Math.max(1, ...rows.map((row) => row.cells.length))
}

function createTableCell(): TableCell {
  return { id: makeTableId('cell'), content: '', style: {} }
}

function normalizeTableWidths(widths: number[], columnCount: number): number[] {
  const fallback = Array.from({ length: columnCount }, () => 100 / columnCount)
  const next = Array.from({ length: columnCount }, (_, index) => {
    const width = widths[index]
    return Number.isFinite(width) && width > 0 ? width : fallback[index]
  })
  const total = next.reduce((sum, width) => sum + width, 0)
  if (total <= 0) return fallback
  return next.map((width) => (width / total) * 100)
}

function resizeTableGrid(table: TableElement, rowCount: number, columnCount: number): TableElement {
  const safeRowCount = Math.max(1, Math.min(60, Math.round(rowCount)))
  const safeColumnCount = Math.max(1, Math.min(24, Math.round(columnCount)))
  const sourceRows = table.rows.length > 0 ? table.rows : [{ id: makeTableId('row'), cells: [createTableCell()] }]
  const nextRows: TableRow[] = Array.from({ length: safeRowCount }, (_, rowIndex) => {
    const sourceRow = sourceRows[rowIndex]
    return {
      ...(sourceRow ?? { id: makeTableId('row') }),
      id: sourceRow?.id ?? makeTableId('row'),
      cells: Array.from({ length: safeColumnCount }, (_, columnIndex) => ({
        ...(sourceRow?.cells[columnIndex] ?? createTableCell()),
        id: sourceRow?.cells[columnIndex]?.id ?? makeTableId('cell'),
        content: sourceRow?.cells[columnIndex]?.content ?? '',
        style: sourceRow?.cells[columnIndex]?.style ?? {},
      })),
    }
  })

  return {
    ...table,
    rows: nextRows,
    col_widths: normalizeTableWidths(table.col_widths ?? [], safeColumnCount),
    header_rows: Math.min(table.header_rows ?? 0, safeRowCount),
    header_cols: Math.min(table.header_cols ?? 0, safeColumnCount),
  }
}

function resizeKeynoteTableGrid(table: KeynoteTable, rowCount: number, columnCount: number): KeynoteTable {
  const safeRowCount = Math.max(1, Math.min(60, Math.round(rowCount)))
  const safeColumnCount = Math.max(1, Math.min(24, Math.round(columnCount)))
  const fallbackRowHeight = table.rowHeights[table.rowHeights.length - 1] ?? table.defaultRowHeight
  const fallbackColumnWidth = table.columnWidths[table.columnWidths.length - 1] ?? table.defaultColumnWidth

  const cells = Object.entries(table.cells ?? {}).reduce<Record<string, KeynoteTableCell>>((next, [key, cell]) => {
    const [rowRaw, columnRaw] = key.split(',')
    const row = Number(rowRaw)
    const column = Number(columnRaw)
    if (Number.isInteger(row) && Number.isInteger(column) && row < safeRowCount && column < safeColumnCount) {
      next[key] = cell
    }
    return next
  }, {})

  return {
    ...table,
    rows: safeRowCount,
    columns: safeColumnCount,
    rowHeights: Array.from({ length: safeRowCount }, (_, index) => table.rowHeights[index] ?? fallbackRowHeight),
    columnWidths: Array.from({ length: safeColumnCount }, (_, index) => table.columnWidths[index] ?? fallbackColumnWidth),
    headerRows: Math.min(table.headerRows ?? 0, safeRowCount),
    headerColumns: Math.min(table.headerColumns ?? 0, safeColumnCount),
    cells,
  }
}
import { setAutoSaveDraft, migrateLocalStorageDraft } from '../lib/indexeddb-autosave'
import {
  PRESENTATION_EXTENSIONS, IMAGE_EXTENSIONS, MAPPING_SKIP,
  parseBlocks, formatBytes, fileExtension, imageFileMeta, imageFitMode, clampNumber,
  isPresentationFile, roleAliases, layoutFields, pickPresentationLayout,
  presentationSlidesToMdText, keynoteSlidesToMdText, createBlankCanvasAnalysis, buildMappings,
  deriveKeynoteSageTagMappings,
  type PostAnalysisState,
} from '../lib/atelier-import-utils'
export type { PostAnalysisState } from '../lib/atelier-import-utils'

interface HupheProject {
  version: 1
  name: string
  savedAt: string
  templateClientId: string
  mdText: string
  blocks: Block[]
  overrides: Overrides
  slideComments?: Record<string, SavedComment[]>
  globalStylePrompt?: string
  assetRefs?: ProjectAssetRef[]
  copyRefs?: ProjectCopyRef[]
  locked?: boolean
  _filePath?: string
  supabasePresentationId?: string
}

interface LocalPresentationProjectMeta {
  name: string
  savedAt: string | null
  templateClientId: string | null
  supabasePresentationId: string | null
  filePath: string
  slideCount?: number
}

interface Props {
  onBack: () => void
  onModuleSelect?: (moduleId: string) => void
  allowedModuleSlugs?: Set<string>
  backLabel?: string
  initialProject?: HupheProject | null
  embedded?: boolean
  onAnalysisComplete?: (result: PostAnalysisState) => void
  initialAnalysis?: PostAnalysisState
  /** When set, the editor auto-connects to this live Supabase presentation */
  initialPresentationId?: string
  onShellLevelChange?: (level: 'landing' | 'funnel' | 'editor') => void
  onCreationTypeClear?: () => void
  initialCreationType?: AtelierCreationSelection
  initialCreationToken?: number
  /** Wanneer gezet: open dit live atelier-project direct na inladen */
  joinAtelierProjectId?: string | null
  joinAtelierProjectType?: string | null
  /** Wanneer gezet: laad deze afbeelding als startpunt in de media-creator */
  initialImageSrc?: string | null
  /** Wanneer gezet: open dit bestaande media-project direct */
  initialMediaProjectId?: string | null
}

interface Client { id: string; name: string }
type AtelierPromptMessage = { role: 'user' | 'assistant'; content: string; model?: string }
const ATELIER_CHAT_MODEL_KEY = 'huphe:atelier-chat-model'
const MEDIA_CHAT_MODEL_KEY = 'huphe:atelier-chat-model:media'
const BANNER_CHAT_MODEL_KEY = 'huphe:atelier-chat-model:banner'
const SAVED_OPENROUTER_MODELS_KEY = 'huphe:saved-openrouter-models'

export const MODULE_DEFAULT_MODELS: Record<string, string> = {
  media: 'google/gemini-2.5-pro',
  banner: 'google/gemini-2.5-pro',
  presentation: 'anthropic/claude-sonnet-4-5',
}

function loadPersonalOpenRouterModels(): AtelierMediaModel[] {
  try {
    const saved = JSON.parse(localStorage.getItem(SAVED_OPENROUTER_MODELS_KEY) ?? '[]')
    if (!Array.isArray(saved)) return []
    return saved.map((model: any) => ({
      id: model.id ?? model.model,
      label: model.label ?? model.name ?? model.id ?? model.model,
      model: model.model ?? model.id,
    })).filter((model: AtelierMediaModel) => model.id && model.model)
  } catch {
    return []
  }
}

function modelsForModule(moduleType: 'presentation' | 'banners' | 'print'): AtelierMediaModel[] {
  const configured = loadModuleModels(moduleType).map((model) => ({
    id: model.id,
    label: model.label,
    model: model.model,
    description: model.provider,
    modality: model.modality,
  }))
  const byId = new Map<string, AtelierMediaModel>()
  for (const model of [...configured, ...loadPersonalOpenRouterModels()]) {
    if (!model.id || model.modality === 'image' || model.modality === 'video') continue
    byId.set(model.id, model)
  }
  return Array.from(byId.values())
}

type Mode = '1' | '2'
type EditorHistorySnapshot = {
  blocks: Block[]
  overrides: Overrides
  activeIdx: number
}

const ALLOWED_EXTENSIONS = ['.txt', '.md', '.docx', '.key', '.ppt', '.pptx', '.jpg', '.jpeg', '.png']

function loadImageAssetsFromLibrary(): MediaAsset[] {
  return loadLibraryAssets()
    .filter((a) => !a.deletedAt && a.mimeType?.startsWith('image/'))
    .map((a) => ({
      id: a.id,
      name: a.name,
      src: a.src,
      mimeType: a.mimeType ?? 'image',
      width: a.width,
      height: a.height,
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
    }))
}

function atelierMediaProjectsToAssets(): MediaAsset[] {
  const now = new Date().toISOString()
  return loadAtelierMediaProjects()
    .filter((p) => p.type === 'images' && p.src)
    .map((p) => {
      const ext = p.src.split('.').pop()?.toLowerCase()
      const mimeType = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : ext === 'gif' ? 'image/gif' : 'image/jpeg'
      return {
        id: `atelier-media:${p.id}`,
        name: p.title || p.prompt.slice(0, 60) || 'Atelier beeld',
        src: p.src,
        mimeType,
        createdAt: p.createdAt,
        updatedAt: p.createdAt ?? now,
      }
    })
}

/** Strip large binary fields (dataUrl, rawData) from template data before DB persist.
 *  In-memory templateData keeps the full version; only the stored copy is stripped.
 *  This prevents statement timeouts caused by multi-MB base64 payloads.
 */
function stripTemplateForStorage(td: TemplateData): TemplateData {
  return {
    ...td,
    layouts: td.layouts.map((layout) => {
      const stripped: Record<string, unknown> = { ...layout }
      if (stripped.assets) {
        stripped.assets = (stripped.assets as any[]).map(({ dataUrl: _du, rawData: _rd, ...rest }) => rest)
      }
      if (stripped.images) {
        stripped.images = (stripped.images as any[]).map(({ dataUrl: _du, rawData: _rd, ...rest }) => rest)
      }
      if (stripped.imageSlot) {
        const { rawData: _rd, ...rest } = stripped.imageSlot as any
        stripped.imageSlot = rest
      }
      if (stripped.textItems) {
        stripped.textItems = (stripped.textItems as any[]).map(({ rawData: _rd, ...rest }) => rest)
      }
      delete stripped.previewDataUrl
      delete stripped.rawData
      return stripped as any
    }),
  }
}

async function loadLinkedImageAssets(): Promise<MediaAsset[]> {
  const savedImages = await loadSavedImagesAsMediaAssets()
  return mergeMediaAssetSources(loadImageAssetsFromLibrary(), savedImages, atelierMediaProjectsToAssets())
}

export default function SlideEditorPage({ onBack, onModuleSelect, allowedModuleSlugs, backLabel, initialProject, embedded, onAnalysisComplete, initialAnalysis, initialPresentationId, onShellLevelChange, onCreationTypeClear, initialCreationType, initialCreationToken, joinAtelierProjectId, joinAtelierProjectType, initialImageSrc, initialMediaProjectId }: Props) {
  const [moduleDropdownOpen, setModuleDropdownOpen] = useState(false)
  const moduleDropdownRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!moduleDropdownOpen) return
    const close = (e: MouseEvent) => {
      if (moduleDropdownRef.current && !moduleDropdownRef.current.contains(e.target as Node)) setModuleDropdownOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [moduleDropdownOpen])

  // ── Upload step state ──────────────────────────────────────────────────
  const [step, setStep] = useState<'upload' | 'editor'>('upload')
  // True while a saved project is loading on mount — shows a clean spinner
  // instead of the creation/landing screen (no flash) and guarantees we never
  // get stuck there (cleared in the load effect's finally).
  const [projectLoading, setProjectLoading] = useState<boolean>(!!initialProject)
  const [mode, setMode] = useState<Mode | null>(null)
  const {
    file, setFile,
    isDragging, setIsDragging,
    fileError, setFileError,
    analysing, setAnalysing,
    analyseError, setAnalyseError,
    textMode, setTextMode,
    imageMode, setImageMode,
    importingKey, setImportingKey,
    keyImportError, setKeyImportError,
    uploadFileRef,
    handleDragOver, handleDragLeave, handleUploadInputChange,
  } = useAtelierAnalysis(validateAndSetFile)

  // ── Shared state ───────────────────────────────────────────────────────
  const [clients, setClients] = useState<Client[]>([])
  const [clientsLoading, setClientsLoading] = useState(true)
  const [templateClientIds, setTemplateClientIds] = useState<Set<string>>(new Set())
  const [htmlTemplateOptions, setHtmlTemplateOptions] = useState(() => loadHtmlTemplateOptions())
  const [templateClientId, setTemplateClientId] = useState('')
  const [mdText, setMdText] = useState('')
  const [blocks, setBlocks] = useState<Block[]>([])
  const [templateData, setTemplateData] = useState<TemplateData | null>(null)
  const [sageTagMappings, setSageTagMappings] = useState<Record<string, Record<string, string>>>({})
  const [userTagNames, setUserTagNames] = useState<Record<string, Record<string, string>>>({})
  const [mappings, setMappings] = useState<Record<string, Record<number, string>>>({})
  const [bgColors, setBgColors] = useState<Record<string, string>>({})
  // AI visual calibration corrections, keyed by layout name → applied to previews.
  const [layoutCorrections, setLayoutCorrections] = useState<Record<string, import('../components/WebSlidePreview').LayoutCorrections>>({})
  const [placeholderUrl, setPlaceholderUrl] = useState<string | undefined>()
  const [overrides, setOverrides] = useState<Overrides>({})
  const [activeIdx, setActiveIdx] = useState(0)
  const [selectedSlideIds, setSelectedSlideIds] = useState<Set<string>>(new Set())
  const [lastSelectedIdx, setLastSelectedIdx] = useState<number | null>(null)
  const [presenting, setPresenting] = useState(false)
  const [bulkLayoutOpen, setBulkLayoutOpen] = useState(false)
  const [slideTypeMenuOpen, setSlideTypeMenuOpen] = useState<string | null>(null)
  const [atelierCreationType, setAtelierCreationType] = useState<AtelierCreationSelection>(initialCreationType ?? null)
  const [atelierShellLevel, setAtelierShellLevel] = useState<'landing' | 'funnel' | 'editor'>(
    initialCreationType && initialCreationType !== 'presentation' ? 'funnel' : 'landing'
  )
  const [atelierProjectSearch, setAtelierProjectSearch] = useState('')
  const [atelierPromptValue, setAtelierPromptValue] = useState('')
  const [atelierPromptWaiting, setAtelierPromptWaiting] = useState(false)
  const [atelierPromptMessages, setAtelierPromptMessages] = useState<AtelierPromptMessage[]>([])
  const atelierPromptInputRef = useRef<HTMLInputElement>(null)
  const atelierPromptScrollRef = useRef<HTMLDivElement>(null)
  const [atelierChatModels, setAtelierChatModels] = useState<AtelierMediaModel[]>([])
  const [atelierModelsLoading, setAtelierModelsLoading] = useState(true)
  const [atelierSelectedModelId, setAtelierSelectedModelId] = useState(() => localStorage.getItem(ATELIER_CHAT_MODEL_KEY) ?? '')
  const [printSelectedModelId, setPrintSelectedModelId] = useState(
    () => localStorage.getItem(MEDIA_CHAT_MODEL_KEY) ?? MODULE_DEFAULT_MODELS.media
  )
  const [bannerSelectedModelId, setBannerSelectedModelId] = useState(
    () => localStorage.getItem(BANNER_CHAT_MODEL_KEY) ?? MODULE_DEFAULT_MODELS.banner
  )
  const [lastAtelierIntent, setLastAtelierIntent] = useState<AtelierIntent | null>(null)
  const [atelierCreationResetKey, setAtelierCreationResetKey] = useState(0)
  const [atelierMediaProjects, setAtelierMediaProjects] = useAtelierMediaProjects()
  const [activeAtelierProjectId, setActiveAtelierProjectId] = useState<string | null>(
    initialMediaProjectId ?? null
  )
  const [crossFormatSeed, setCrossFormatSeed] = useState<CrossFormatSeed | null>(null)
  const [savedBannerProjects, setSavedBannerProjects] = useState<SavedBannerProject[]>(() => loadBannerProjects())
  const [activeBannerProjectId, setActiveBannerProjectId] = useState<string | null>(initialCreationType === 'banners' ? initialMediaProjectId ?? null : null)
  const [savedPrintProjects, setSavedPrintProjects] = useState<SavedPrintProject[]>(() => loadPrintProjects())
  const [activePrintProjectId, setActivePrintProjectId] = useState<string | null>(initialCreationType === 'print' ? initialMediaProjectId ?? null : null)
  const [openPrintProjectIds, setOpenPrintProjectIds] = useState<string[]>(() =>
    initialCreationType === 'print' && initialMediaProjectId ? [initialMediaProjectId] : []
  )
  const [pendingBannerAuto, setPendingBannerAuto] = useState<{ heading: string; copy: string; cta: string; formats?: string[] } | null>(null)
  const [pendingPrintAuto, setPendingPrintAuto] = useState<{ title: string; body: string; formats?: string[] } | null>(null)
  const [mediaAssets, setMediaAssets] = useState<MediaAsset[]>(() => loadImageAssetsFromLibrary())
  const exportRef = useRef<HTMLDivElement>(null)

  const [presentationTabs, setPresentationTabs] = useState<{ id: string; name: string; path: string }[]>([])
  const [activePresentationTabId, setActivePresentationTabId] = useState<string | null>(null)
  const [hiddenRightTabs, setHiddenRightTabs] = useState<string[]>([])
  function toggleRightTab(tabId: string) {
    setHiddenRightTabs(prev => prev.includes(tabId) ? prev.filter(t => t !== tabId) : [...prev, tabId])
  }

  const projectPath_ref = useRef<string | null>(null)
  const [projectPath, setProjectPath] = useState<string | null>(null)
  const [projectName, setProjectName] = useState<string | null>(null)
  const [supabasePresentationId, setSupabasePresentationId] = useState<string | null>(initialProject?.supabasePresentationId ?? null)
  const [presentationAssetRefs, setPresentationAssetRefs] = useState<ProjectAssetRef[]>(initialProject?.assetRefs ?? [])
  const [presentationCopyRefs, setPresentationCopyRefs] = useState<ProjectCopyRef[]>(initialProject?.copyRefs ?? [])
  const [presentationLocked, setPresentationLocked] = useState(initialProject?.locked ?? false)
  const [savedPresentations, setSavedPresentations] = useState<SidebarProject[]>([])
  const [saving, setSaving] = useState(false)
  const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const hasInitializedRef = useRef(false)
  const loadingProjectMdTextRef = useRef<string | null>(null)
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastAutoSaveRef = useRef('')
  const undoStackRef = useRef<EditorHistorySnapshot[]>([])
  const redoStackRef = useRef<EditorHistorySnapshot[]>([])
  const currentHistoryRef = useRef<EditorHistorySnapshot | null>(null)
  const currentHistoryKeyRef = useRef('')
  const pendingHistoryBaseRef = useRef<EditorHistorySnapshot | null>(null)
  const pendingHistoryNextRef = useRef<EditorHistorySnapshot | null>(null)
  const pendingHistoryKeyRef = useRef('')
  const historyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const applyingHistoryRef = useRef(false)
  const [historyCounts, setHistoryCounts] = useState({ undo: 0, redo: 0 })
  const selectedSlideIdsRef = useRef<Set<string>>(new Set())

  const aiResolvedRef = useRef(false)

  const [globalStylePrompt, setGlobalStylePrompt] = useState('')

  const [imgGenState, setImgGenState] = useState<Record<string, { open: boolean; prompt: string; loading: boolean; error: string }>>({})
  const [openImageAdjustIds, setOpenImageAdjustIds] = useState<Set<string>>(new Set())
  const [imageScaleInputs, setImageScaleInputs] = useState<Record<string, string>>({})
  const [imageRotationInputs, setImageRotationInputs] = useState<Record<string, string>>({})

  const activeAtelierProject = useMemo(() => {
    if (!activeAtelierProjectId) return null
    return atelierMediaProjects.find((project) => project.id === activeAtelierProjectId) ?? null
  }, [activeAtelierProjectId, atelierMediaProjects])

  useEffect(() => {
    let cancelled = false
    const api = (window as any).api
    Promise.resolve(api?.engine?.listAgents?.()).then((res: any) => {
      if (cancelled) return
      const agents: AtelierMediaModel[] = (res?.agents ?? []).map((agent: any) => ({
        id: agent.id,
        label: agent.label ?? agent.id,
        model: agent.model ?? agent.id,
      }))
      const configured = modelsForModule('presentation')
      const merged = new Map<string, AtelierMediaModel>()
      for (const model of [...configured, ...agents]) merged.set(model.id, model)
      const nextModels = Array.from(merged.values())
      setAtelierChatModels(nextModels)
      const saved = localStorage.getItem(ATELIER_CHAT_MODEL_KEY)
      if (!saved) {
        const first = nextModels[0]?.id ?? ''
        if (first) {
          setAtelierSelectedModelId(first)
          localStorage.setItem(ATELIER_CHAT_MODEL_KEY, first)
        }
      }
      setAtelierModelsLoading(false)
    }).catch(() => setAtelierModelsLoading(false))
    return () => {
      cancelled = true
    }
  }, [])

  const bannerChatModels = useMemo(() => modelsForModule('banners'), [])
  const printChatModels = useMemo(() => modelsForModule('print'), [])

  useEffect(() => {
    if (atelierSelectedModelId) localStorage.setItem(ATELIER_CHAT_MODEL_KEY, atelierSelectedModelId)
  }, [atelierSelectedModelId])

  useEffect(() => {
    if (printSelectedModelId) localStorage.setItem(MEDIA_CHAT_MODEL_KEY, printSelectedModelId)
  }, [printSelectedModelId])

  useEffect(() => {
    if (bannerSelectedModelId) localStorage.setItem(BANNER_CHAT_MODEL_KEY, bannerSelectedModelId)
  }, [bannerSelectedModelId])

  useEffect(() => {
    const scrollEl = atelierPromptScrollRef.current
    if (!scrollEl) return
    requestAnimationFrame(() => {
      scrollEl.scrollTop = scrollEl.scrollHeight
    })
  }, [atelierPromptMessages.length, atelierPromptWaiting])

  function setShellLevel(level: 'landing' | 'funnel' | 'editor') {
    setAtelierShellLevel(level)
    onShellLevelChange?.(level)
  }

  function resetPresentationCreationFlow() {
    loadingProjectMdTextRef.current = null
    setFile(null)
    setIsDragging(false)
    setFileError('')
    setAnalyseError('')
    setAnalysing(false)
    setTextMode(null)
    setImageMode(null)
    setImportingKey(false)
    setKeyImportError('')
    setTemplateClientId('')
    setMdText('')
    setBlocks([])
    setTemplateData(null)
    setSageTagMappings({})
    setUserTagNames({})
    setMappings({})
    setBgColors({})
    setPlaceholderUrl(undefined)
    setOverrides({})
    setSlideComments({})
    setProjectPath(null)
    setProjectName(null)
    setSupabasePresentationId(null)
    setPresentationAssetRefs([])
    setPresentationCopyRefs([])
    setPresentationLocked(false)
    setGlobalStylePrompt('')
    setActiveIdx(0)
    setSelectedSlideIds(new Set())
    setLastSelectedIdx(null)
    setImportBanner(null)
    setFidelityItems([])
    setShowFidelityReport(false)
    setStep('upload')
  }

  function projectMetaToSidebarProject(project: LocalPresentationProjectMeta): SidebarProject {
    const savedAt = project.savedAt ?? new Date().toISOString()
    return {
      id: project.filePath,
      type: 'presentation',
      name: project.name || 'Naamloze presentatie',
      subtitle: project.slideCount ? `${project.slideCount} slide${project.slideCount === 1 ? '' : 's'}` : undefined,
      createdAt: savedAt,
    }
  }

  async function refreshSavedPresentations() {
    try {
      const res = await (window as any).api?.listProjects?.()
      const projects = (res?.ok ? res.projects : []) as LocalPresentationProjectMeta[]
      setSavedPresentations((projects ?? [])
        .slice()
        .sort((a, b) => new Date(b.savedAt ?? 0).getTime() - new Date(a.savedAt ?? 0).getTime())
        .map(projectMetaToSidebarProject))
    } catch {
      setSavedPresentations([])
    }
  }

  async function applyLoadedPresentationProject(project: HupheProject) {
    loadingProjectMdTextRef.current = project.mdText
    setTemplateClientId(project.templateClientId)
    setMdText(project.mdText)
    setBlocks(project.blocks)
    setOverrides(project.overrides ?? {})
    setSlideComments(project.slideComments ?? {})
    setProjectPath(project._filePath ?? null)
    setProjectName(project.name)
    setSupabasePresentationId(project.supabasePresentationId ?? null)
    setPresentationAssetRefs(project.assetRefs ?? [])
    setPresentationCopyRefs(project.copyRefs ?? [])
    setPresentationLocked(project.locked ?? false)
    setGlobalStylePrompt(project.globalStylePrompt ?? '')
    setActiveIdx(0)
    setSelectedSlideIds(new Set())
    setLastSelectedIdx(null)

    if (project.templateClientId) {
      const [localTd, localMappings] = await Promise.all([
        (window as any).api?.getLocalTemplateData?.(project.templateClientId),
        (window as any).api?.getLocalMappings?.(project.templateClientId),
      ])
      let resolvedTd = localTd?.ok ? localTd.templateData : null
      let rawMappings: any = localMappings ?? null
      // Supabase als fallback als lokaal niets beschikbaar is
      if ((!resolvedTd || !rawMappings) && supabase) {
        const [tRes, mRes] = await Promise.all([
          resolvedTd ? Promise.resolve(null) : supabase.from('templates').select('template_data').eq('client_id', project.templateClientId).maybeSingle(),
          rawMappings ? Promise.resolve(null) : supabase.from('template_mappings').select('mappings').eq('client_id', project.templateClientId).maybeSingle(),
        ])
        if (!resolvedTd && tRes?.data?.template_data) {
          resolvedTd = await resolveTemplateData(supabase, tRes.data.template_data)
        }
        if (!rawMappings) rawMappings = (mRes?.data?.mappings as any) ?? {}
      }
      rawMappings = rawMappings ?? {}
      if (resolvedTd) {
        setTemplateData(resolvedTd)
        setSageTagMappings(rawMappings['_mdToSageTag'] ?? {})
        setBgColors(rawMappings['_bgColors'] ?? {})
        setLayoutCorrections(rawMappings['_visualCorrections'] ?? {})
        setMappings(buildMappings(rawMappings, resolvedTd))
      }
    }

    setStep('editor')
    setShellLevel('editor')
  }

  async function savePresentationProjectPatch(patch: Partial<Pick<HupheProject, 'assetRefs' | 'copyRefs' | 'locked'>>) {
    if (!projectPath || blocks.length === 0 || !templateClientId) return
    const projectData = buildProjectData(undefined, undefined, patch)
    const result = await (window as any).api?.saveProject?.(projectData, projectPath)
    if (result?.ok) void refreshSavedPresentations()
  }

  function applyAtelierCreationSelection(type: AtelierCreationSelection) {
    setAtelierCreationType(type)
    setAtelierProjectSearch('')
    setActiveAtelierProjectId(null)
    setActiveBannerProjectId(null)
    setActivePrintProjectId(null)
    resetPresentationCreationFlow()
    if (type === 'print') clearPrintPayload()
    setAtelierCreationResetKey((key) => key + 1)
    setShellLevel(type && type !== 'presentation' ? 'funnel' : 'landing')
  }

  function handleAtelierCreationSelect(type: AtelierCreationType) {
    applyAtelierCreationSelection(type)
  }

  function handleCrossFormatCreate(targetType: AtelierCreationType) {
    const sourceProject = atelierCreationType === 'banners'
      ? savedBannerProjects.find((project) => project.id === activeBannerProjectId)
      : atelierCreationType === 'print'
        ? savedPrintProjects.find((project) => project.id === activePrintProjectId)
        : null

    const seed = buildProjectFromRefs(targetType, sourceProject?.assetRefs ?? [], sourceProject?.copyRefs ?? [])
    setCrossFormatSeed(seed)
    applyAtelierCreationSelection(targetType)
    setShellLevel(targetType && targetType !== 'presentation' ? 'funnel' : 'landing')
  }

  function handleRefreshActiveProjectAssets() {
    if (atelierCreationType === 'presentation' && projectPath) {
      const assetsById = new Map(fetchAssetsByIds(presentationAssetRefs.map((ref) => ref.assetId), { includeArchived: true }).map((asset) => [asset.id, asset]))
      const refreshedRefs = presentationAssetRefs.map((ref) => {
        const asset = assetsById.get(ref.assetId)
        return asset && !asset.deletedAt ? { ...ref, sourceUpdatedAt: asset.updatedAt } : ref
      })
      setPresentationAssetRefs(refreshedRefs)
      void savePresentationProjectPatch({ assetRefs: refreshedRefs })
      return
    }
    if (atelierCreationType === 'banners' && activeBannerProjectId) {
      const project = savedBannerProjects.find((item) => item.id === activeBannerProjectId)
      if (!project) return
      const assetsById = new Map(fetchAssetsByIds((project.assetRefs ?? []).map((ref) => ref.assetId), { includeArchived: true }).map((asset) => [asset.id, asset]))
      const refreshed: SavedBannerProject = {
        ...project,
        imageSrc: resolveAssetSrc(project.assetId, project.imageSrc),
        assetRefs: project.assetRefs?.map((ref) => {
          const asset = assetsById.get(ref.assetId)
          return asset && !asset.deletedAt ? { ...ref, sourceUpdatedAt: asset.updatedAt } : ref
        }),
        updatedAt: new Date().toISOString(),
      }
      handleSaveBannerProject(refreshed)
    }
    if (atelierCreationType === 'print' && activePrintProjectId) {
      const project = savedPrintProjects.find((item) => item.id === activePrintProjectId)
      if (!project) return
      const assetsById = new Map(fetchAssetsByIds((project.assetRefs ?? []).map((ref) => ref.assetId), { includeArchived: true }).map((asset) => [asset.id, asset]))
      const refreshed: SavedPrintProject = {
        ...project,
        imageSrc: resolveAssetSrc(project.assetId, project.imageSrc),
        assetRefs: project.assetRefs?.map((ref) => {
          const asset = assetsById.get(ref.assetId)
          return asset && !asset.deletedAt ? { ...ref, sourceUpdatedAt: asset.updatedAt } : ref
        }),
        updatedAt: new Date().toISOString(),
      }
      handleSavePrintProject(refreshed)
    }
  }

  function handleToggleActiveProjectLock() {
    if (atelierCreationType === 'presentation' && projectPath) {
      const nextLocked = !presentationLocked
      setPresentationLocked(nextLocked)
      void savePresentationProjectPatch({ locked: nextLocked })
      return
    }
    if (atelierCreationType === 'banners' && activeBannerProjectId) {
      const project = savedBannerProjects.find((item) => item.id === activeBannerProjectId)
      if (project) handleSaveBannerProject({ ...project, locked: !project.locked, updatedAt: new Date().toISOString() })
    }
    if (atelierCreationType === 'print' && activePrintProjectId) {
      const project = savedPrintProjects.find((item) => item.id === activePrintProjectId)
      if (project) handleSavePrintProject({ ...project, locked: !project.locked, updatedAt: new Date().toISOString() })
    }
  }

  function handleClearAtelierCreationSelect() {
    applyAtelierCreationSelection(null)
    onCreationTypeClear?.()
  }

  async function handleAtelierPromptSubmit(prompt: string, fallbackType: AtelierCreationType) {
    const promptHistory = atelierPromptMessages
    const intent = parseAtelierIntent(prompt, fallbackType, lastAtelierIntent)
    setLastAtelierIntent(intent)
    setAtelierPromptMessages((messages) => [...messages, { role: 'user', content: prompt }])

    if (intent.type !== atelierCreationType && intent.status !== 'chat') {
      applyAtelierCreationSelection(intent.type)
    }

    const matchedClient = findClientByTemplateHint(clients, intent.templateName)
    if (matchedClient && templateClientIds.has(matchedClient.id)) {
      setTemplateClientId(matchedClient.id)
    }

    // For banners and print: always go through conversational module-prompt flow with KLAAR detection
    if (intent.type === 'banners' || intent.type === 'print') {
      const moduleHint = intent.status === 'chat'
        ? 'vrij gesprek over deze module'
        : intent.status === 'needs_clarification'
          ? `vraag wat ontbreekt: ${intent.clarification ?? 'vraag wat je nog nodig hebt'}`
          : `verzoek ontvangen voor ${intent.type}: ${intent.subject || 'onderwerp onbekend'}`
      const assistantMessage = await buildAtelierModelReply(prompt, intent, promptHistory, moduleHint)
      const klaar = extractKlaarSignal(assistantMessage.content)
      const displayContent = klaar ? stripKlaarSignal(assistantMessage.content) : assistantMessage.content
      setAtelierPromptMessages((messages) => [...messages, { role: 'assistant', content: displayContent, model: assistantMessage.model }])
      if (klaar) {
        if (intent.type === 'banners') {
          const p = klaar as { heading?: string; copy?: string; cta?: string; formats?: string[] }
          setPendingBannerAuto({ heading: p.heading ?? intent.subject, copy: p.copy ?? '', cta: p.cta ?? 'Meer weten', formats: p.formats })
        } else {
          const p = klaar as { title?: string; body?: string; formats?: string[] }
          setPendingPrintAuto({ title: p.title ?? intent.subject, body: p.body ?? '', formats: p.formats })
        }
      }
      return
    }

    if (intent.status === 'chat') {
      const assistantMessage = await buildAtelierModelReply(prompt, intent, promptHistory, 'autonome chat')
      setAtelierPromptMessages((messages) => [...messages, { role: 'assistant', content: assistantMessage.content, model: assistantMessage.model }])
      return
    }

    if (intent.status === 'needs_clarification') {
      const assistantMessage = await buildAtelierModelReply(prompt, intent, promptHistory, `scriptvraag: ${intent.clarification ?? 'vraag wat nog nodig is'}`)
      setAtelierPromptMessages((messages) => [...messages, { role: 'assistant', content: assistantMessage.content, model: assistantMessage.model }])
      return
    }

    // Presentation: build plan + enrich with AI
    const templateText = matchedClient ? ` met template ${matchedClient.name}` : intent.theme ? ` in stijl ${intent.theme}` : ''
    const plan = buildAtelierCreativePlan(intent, templateData)
    const pageText = intent.pageCount ? ` (${intent.pageCount} pagina${intent.pageCount === 1 ? '' : "'s"})` : ''
    const assistantMessage = await buildAtelierModelReply(
      prompt,
      intent,
      promptHistory,
      `script klaar: pak het ${intent.type}-script${pageText} voor ${intent.subject}${templateText}. Plan: ${summarizeCreativePlan(plan)}`,
    )
    setAtelierPromptMessages((messages) => [...messages, { role: 'assistant', content: assistantMessage.content, model: assistantMessage.model }])

    if (intent.type === 'presentation') {
      const enrichedPlan = await enrichPlanWithAI(plan, intent)
      applyAutonomousPresentationPlan(enrichedPlan)
    }
  }

  function extractKlaarSignal(content: string): Record<string, unknown> | null {
    // Accepts KLAAR anywhere — inline, newline, or at end; handles small models that don't respect formatting
    const match = content.match(/KLAAR:\s*(\{[^{}]*\})/)
    if (!match) return null
    try {
      return JSON.parse(match[1]) as Record<string, unknown>
    } catch {
      return null
    }
  }

  function stripKlaarSignal(content: string): string {
    return content.replace(/\s*KLAAR:\s*\{[^{}]*\}/, '').trim()
  }

  function applyAutonomousPresentationPlan(plan: AtelierCreativePlan) {
    const blank = templateData ? null : createBlankCanvasAnalysis()
    const td = templateData ?? blank!.templateData
    const clientId = templateData ? templateClientId : blank!.templateClientId
    const nextMappings = templateData ? mappings : blank!.mappings
    const nextSageTagMappings = templateData ? sageTagMappings : blank!.sageTagMappings
    const nextBgColors = templateData ? bgColors : blank!.bgColors
    const nextUserTagNames = templateData ? userTagNames : blank!.userTagNames
    const fallbackLayout = td.layouts[0]?.name ?? 'Leeg canvas'
    const nextBlocks: Block[] = plan.slides.map((slide, index) => {
      const layoutName = slide.layoutName && td.layouts.some((layout) => layout.name === slide.layoutName)
        ? slide.layoutName
        : fallbackLayout
      return {
        id: `ai-slide-${Date.now()}-${index}`,
        type: layoutName,
        heading: slide.headline,
        body: slide.body ?? '',
        fields: slide.visualPrompt ? { visualPrompt: slide.visualPrompt } : {},
      }
    })
    const nextMdText = nextBlocks.map((block) => [
      `[${block.type}]`,
      block.heading ? `heading: ${block.heading}` : '',
      block.body ? `body: ${block.body}` : '',
      block.fields.visualPrompt ? `visualPrompt: ${block.fields.visualPrompt}` : '',
    ].filter(Boolean).join('\n')).join('\n\n')

    if (onAnalysisComplete) {
      onAnalysisComplete({
        templateClientId: clientId,
        mdText: nextMdText,
        templateData: td,
        sageTagMappings: nextSageTagMappings,
        mappings: nextMappings,
        bgColors: nextBgColors,
        userTagNames: nextUserTagNames,
      })
      return
    }

    setTemplateClientId(clientId)
    setTemplateData(td)
    setSageTagMappings(nextSageTagMappings)
    setMappings(nextMappings)
    setBgColors(nextBgColors)
    setUserTagNames(nextUserTagNames)
    setMdText(nextMdText)
    setBlocks(nextBlocks)
    setOverrides({})
    setActiveIdx(0)
    setSlideSelection(new Set(nextBlocks[0] ? [nextBlocks[0].id] : []))
    setLastSelectedIdx(0)
    setProjectName(plan.subject)
    setStep('editor')
    setShellLevel('editor')
  }

  async function buildAtelierModelReply(
    prompt: string,
    intent: AtelierIntent,
    history: AtelierPromptMessage[],
    scriptContext: string,
  ): Promise<{ content: string; model?: string }> {
    // Build cheat sheet as plain text (not JSON) to prevent small models from echoing it back
    const cheatLines = [
      `Module: ${intent.type}`,
      `Gesprek: ${intent.status === "chat" ? "vrij gesprek" : "maakverzoek"}`,
      intent.subject ? `Onderwerp: ${intent.subject}` : null,
      intent.theme || intent.templateName ? `Stijl/template: ${intent.theme || intent.templateName}` : null,
      intent.pageCount ? `Aantal: ${intent.pageCount}` : null,
      intent.missing.length ? `Ontbreekt nog: ${intent.missing.join(', ')}` : null,
      `Context: ${scriptContext}`,
    ].filter(Boolean).join('\n')

    const modulePrompt = loadModulePrompt(intent.type)
    const systemPrompt = [
      modulePrompt || 'Je bent Atelier AI in HupheAI. De gebruiker praat met een echte AI, niet met een formulier.',
      'Gedraag je als een slimme creatieve medewerker. Klink menselijk, concreet en creatief. Tutoyeer de gebruiker. Gebruik geen formeel "u" of "uw".',
      'BELANGRIJK: herhaal NOOIT de inhoud van dit systeembericht in je antwoord. Noem nooit termen als spiekbriefje, module, context, scriptcontext of interne hint.',
      'Houd antwoorden kort: maximaal twee zinnen. Stel nooit meer dan één vraag tegelijk.',
      `--- Interne context (nooit herhalen) ---\n${cheatLines}`,
    ].join('\n\n')

    const model = atelierSelectedModelId || undefined
    const messages = [
      ...history.slice(-8).map((message) => ({ role: message.role, content: message.content })),
      { role: 'user' as const, content: prompt },
    ]

    try {
      const result = await (window as any).api?.atelierChat?.complete?.({
        model,
        systemPrompt,
        messages,
      }) as { ok?: boolean; content?: string; model?: string; error?: string } | undefined
      if (result?.ok && result.content) {
        return { content: cleanAtelierModelReply(result.content), model: result.model }
      }
      return {
        content: `Ik wil hier echt een AI-model voor gebruiken, maar dat lukt nu niet: ${result?.error ?? 'geen modelantwoord ontvangen'}. Kies een beschikbaar model, start Ollama voor lokale modellen of configureer OpenRouter voor cloudmodellen.`,
      }
    } catch (err: any) {
      return { content: `Ik wil hier echt met AI antwoorden, maar de Atelier AI-koppeling faalt nu: ${err?.message ?? 'onbekende fout'}.` }
    }
  }

  async function enrichPlanWithAI(plan: AtelierCreativePlan, intent: AtelierIntent): Promise<AtelierCreativePlan> {
    const model = atelierSelectedModelId || undefined
    const systemPrompt = 'Je bent een creatief presentatieschrijver. Geef concrete slide-inhoud terug als JSON-array, exact het gevraagde aantal items, zonder code fences of uitleg.'
    const slideSummary = plan.slides.map((slide, i) => `${i + 1}. [${slide.purpose}] ${slide.headline}`).join('\n')
    const userPrompt = `Maak concrete inhoud voor een presentatie over "${intent.subject}" met ${plan.slides.length} slides.${intent.theme ? ` Stijl: ${intent.theme}.` : ''}\n\nScenario:\n${slideSummary}\n\nGeef terug als JSON-array (exact ${plan.slides.length} items):\n[{"headline":"...","body":"...","visualPrompt":"..."}]\n\nRegels:\n- headline: max 8 woorden, scherp en concreet\n- body: max 2 zinnen, informatief\n- visualPrompt: Engelse beeldprompt max 20 woorden (of null)\n- headline en body in het Nederlands`
    try {
      const result = await (window as any).api?.atelierChat?.complete?.({ model, systemPrompt, messages: [{ role: 'user' as const, content: userPrompt }] }) as { ok?: boolean; content?: string } | undefined
      if (!result?.ok || !result.content) return plan
      const jsonMatch = result.content.match(/\[[\s\S]*\]/)
      if (!jsonMatch) return plan
      const enriched = JSON.parse(jsonMatch[0]) as Array<{ headline?: string; body?: string; visualPrompt?: string | null }>
      if (!Array.isArray(enriched)) return plan
      return {
        ...plan,
        slides: plan.slides.map((slide, i) => ({
          ...slide,
          headline: enriched[i]?.headline || slide.headline,
          body: enriched[i]?.body || slide.body,
          visualPrompt: enriched[i]?.visualPrompt ?? slide.visualPrompt,
        })),
      }
    } catch {
      return plan
    }
  }

  async function generateAtelierCopyForBanner(intent: AtelierIntent): Promise<{ heading: string; copy: string; cta: string; formats?: string[] } | null> {
    const model = atelierSelectedModelId || undefined
    const systemPrompt = 'Je bent een copywriter voor online banneradvertenties. Schrijf pakkende korte teksten. Geef alleen JSON terug, geen uitleg.'
    const userPrompt = `Schrijf bannerteksten voor: "${intent.subject}"${intent.theme ? ` (stijl: ${intent.theme})` : ''}.\n\nGeef terug als JSON:\n{"heading":"...","copy":"...","cta":"..."}\n\nRegels:\n- heading: max 6 woorden, krachtig\n- copy: max 10 woorden, ondersteunend\n- cta: max 3 woorden (bijv. "Meer weten")\n- Schrijf in het Nederlands`
    try {
      const result = await (window as any).api?.atelierChat?.complete?.({ model, systemPrompt, messages: [{ role: 'user' as const, content: userPrompt }] }) as { ok?: boolean; content?: string } | undefined
      if (!result?.ok || !result.content) return null
      const jsonMatch = result.content.match(/\{[\s\S]*?\}/)
      if (!jsonMatch) return null
      const parsed = JSON.parse(jsonMatch[0]) as { heading?: string; copy?: string; cta?: string }
      return { heading: parsed.heading ?? intent.subject, copy: parsed.copy ?? '', cta: parsed.cta ?? 'Meer weten', formats: intent.formatHints }
    } catch {
      return null
    }
  }

  async function generateAtelierCopyForPrint(intent: AtelierIntent): Promise<{ title: string; body: string; formats?: string[] } | null> {
    const model = atelierSelectedModelId || undefined
    const systemPrompt = 'Je bent een copywriter voor print- en social media advertenties. Geef alleen JSON terug, geen uitleg.'
    const userPrompt = `Schrijf mediainhoud voor: "${intent.subject}"${intent.theme ? ` (stijl: ${intent.theme})` : ''}.\n\nGeef terug als JSON:\n{"title":"...","body":"..."}\n\nRegels:\n- title: max 8 woorden, krachtig\n- body: max 2 zinnen, informatief en overtuigend\n- Schrijf in het Nederlands`
    try {
      const result = await (window as any).api?.atelierChat?.complete?.({ model, systemPrompt, messages: [{ role: 'user' as const, content: userPrompt }] }) as { ok?: boolean; content?: string } | undefined
      if (!result?.ok || !result.content) return null
      const jsonMatch = result.content.match(/\{[\s\S]*?\}/)
      if (!jsonMatch) return null
      const parsed = JSON.parse(jsonMatch[0]) as { title?: string; body?: string }
      return { title: parsed.title ?? intent.subject, body: parsed.body ?? '', formats: intent.formatHints }
    } catch {
      return null
    }
  }

  function cleanAtelierModelReply(value: string): string {
    // Strip leaked cheat sheet JSON blocks (multi-line or inline)
    let cleaned = value
      .replace(/\{[^{}]*"(?:omgeving|huidigeTool|gesprekstype|appWilEventueelWeten|ontbreektNog|interneHint|relevantVoorAtelier)"[^{}]*\}/gs, '')
      // Strip KLAAR signal that slipped through (already handled above, but double-clean here)
      .replace(/\s*KLAAR:\s*\{[^{}]*\}/g, '')
    return cleaned
      .split('\n')
      .filter((line) => {
        const l = line.toLowerCase()
        if (/\b(interne hint|spiekbriefje|scriptcontext)\b/.test(l)) return false
        // Drop any line that looks like it's echoing back cheat sheet keys
        if (/"(?:omgeving|huidigeTool|gesprekstype|interneHint|ontbreektNog|appWilEventueelWeten)"/.test(line)) return false
        return true
      })
      .join('\n')
      .replace(/\bu\b/g, 'je')
      .replace(/\buw\b/g, 'je')
      .replace(/ik voer (.*?) voor je op/gi, 'ik kan $1 voor je maken')
      .replace(/Misschien geef je soms ook nog informatie[^.?!]*[.?!]?/gi, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim() || 'Ik snap je. Ik ga hiermee verder binnen de Atelier-context.'
  }

  const prevCreationTokenRef = useRef(initialCreationToken)
  useEffect(() => {
    if (initialCreationToken === undefined && initialCreationType === undefined) return
    if (prevCreationTokenRef.current === initialCreationToken) return
    prevCreationTokenRef.current = initialCreationToken
    applyAtelierCreationSelection(initialCreationType ?? null)
  }, [initialCreationToken])

  // ── Atelier live-projecten ────────────────────────────────────────────────
  const [atelierOwnerId, setAtelierOwnerId] = useState<string | null>(null)
  const [liveAtelierIds, setLiveAtelierIds] = useState<Map<string, string>>(new Map())

  useEffect(() => {
    supabase?.auth.getUser().then(({ data }) => {
      if (!data.user) return
      setAtelierOwnerId(data.user.id)
      fetchLiveAtelierProjects(data.user.id).then((items) => {
        setLiveAtelierIds(new Map(items.map((item) => [item.id, item.shareCode ?? ''])))
      })
    })
  }, [])

  const handleNewAtelierProject = useCallback(() => {
    setActiveAtelierProjectId(null)
    if (atelierCreationType !== 'images' && atelierCreationType !== 'video') {
      setAtelierCreationType('images')
    }
  }, [atelierCreationType])

  const handleAtelierProjectGenerated = useCallback((project: AtelierMediaProject) => {
    setAtelierMediaProjects((prev) => [project, ...prev.filter((item) => item.id !== project.id)].slice(0, 80))
    setActiveAtelierProjectId(project.id)
    if (atelierOwnerId) {
      const type = project.type === 'video' ? 'media-video' : 'media-images'
      pushAtelierProjectToSupabase(project.id, type, project.title, project, atelierOwnerId, project.createdAt)
      liveAtelierSyncRef.current(project.id, project)
    }
  }, [atelierOwnerId])

  const handleDeleteAtelierProject = useCallback((projectId: string) => {
    setAtelierMediaProjects((prev) => {
      const removed = prev.find((p) => p.id === projectId)
      if (removed?.src) unmarkImageAsProject(removed.src)
      return prev.filter((project) => project.id !== projectId)
    })
    setActiveAtelierProjectId((current) => (current === projectId ? null : current))
  }, [])

  const handleSaveBannerProject = useCallback((project: SavedBannerProject) => {
    setSavedBannerProjects(upsertBannerProject(project))
    setActiveBannerProjectId(project.id)
    if (atelierOwnerId) {
      pushAtelierProjectToSupabase(project.id, 'banners', project.name, project, atelierOwnerId, project.createdAt)
      liveAtelierSyncRef.current(project.id, project)
    }
  }, [atelierOwnerId])

  const handleDeleteBannerProject = useCallback((projectId: string) => {
    setSavedBannerProjects(removeBannerProject(projectId))
    setActiveBannerProjectId((cur) => (cur === projectId ? null : cur))
  }, [])

  const closePrintTab = useCallback((projectId: string) => {
    setOpenPrintProjectIds((prev) => {
      const next = prev.filter((id) => id !== projectId)
      setActivePrintProjectId((active) => {
        if (active !== projectId) return active
        const idx = prev.indexOf(projectId)
        return next[Math.max(0, idx - 1)] ?? next[0] ?? null
      })
      return next
    })
  }, [])

  function openPresentationTab(path: string, name: string) {
    const existingTab = presentationTabs.find(t => t.path === path)
    if (existingTab) {
      setActivePresentationTabId(existingTab.id)
    } else {
      const id = `pres-tab-${Date.now()}`
      setPresentationTabs(prev => [...prev, { id, name, path }])
      setActivePresentationTabId(id)
    }
    ;(window as any).api?.loadProject?.(path).then((res: any) => {
      if (res?.ok) {
        const p = res.project
        setTemplateClientId(p.templateClientId ?? '')
        setBlocks(p.blocks ?? [])
        setProjectPath(path)
        setProjectName(p.name ?? name)
        setMdText(p.mdText ?? '')
        setStep('editor')
      }
    })
  }

  function closePresentationTab(id: string) {
    setPresentationTabs(prev => {
      const next = prev.filter(t => t.id !== id)
      setActivePresentationTabId(active => {
        if (active !== id) return active
        const idx = prev.findIndex(t => t.id === id)
        return next[Math.max(0, idx - 1)]?.id ?? null
      })
      return next
    })
  }

  const handleSavePrintProject = useCallback((project: SavedPrintProject) => {
    setSavedPrintProjects(upsertPrintProject(project))
    setActivePrintProjectId(project.id)
    setOpenPrintProjectIds((prev) => (prev.includes(project.id) ? prev : [...prev, project.id]))
    if (atelierOwnerId) {
      pushAtelierProjectToSupabase(project.id, 'print', project.name, project, atelierOwnerId, project.createdAt)
      liveAtelierSyncRef.current(project.id, project)
    }
  }, [atelierOwnerId])

  const handleDeletePrintProject = useCallback((projectId: string) => {
    setSavedPrintProjects(removePrintProject(projectId))
    closePrintTab(projectId)
  }, [closePrintTab])

  const handleSaveMediaAsset = useCallback((asset: MediaAsset) => {
    upsertLibraryAsset({
      id: asset.id,
      name: asset.name,
      src: asset.src,
      type: asset.mimeType.startsWith('video/') ? 'video' : asset.mimeType.startsWith('image/') ? 'image' : 'uploaded',
      mimeType: asset.mimeType,
      width: asset.width,
      height: asset.height,
      createdAt: asset.createdAt,
      updatedAt: asset.updatedAt,
    })
    void loadLinkedImageAssets().then(setMediaAssets)
  }, [])

  useEffect(() => {
    let cancelled = false
    function reload() {
      void loadLinkedImageAssets().then((assets) => {
        if (!cancelled) setMediaAssets(assets)
      })
    }
    reload()
    window.addEventListener('huphe:asset-updated', reload)
    window.addEventListener('focus', reload)
    return () => {
      cancelled = true
      window.removeEventListener('huphe:asset-updated', reload)
      window.removeEventListener('focus', reload)
    }
  }, [])

  // ── Linker paneel weergave-modus ──────────────────────────────────────
  const [viewMode, setViewMode] = useState<'slides' | 'document' | 'focus'>('focus')
  const [showHiddenSlides, setShowHiddenSlides] = useState(true)

  // ── Resizable panels ──────────────────────────────────────────────────
  const [leftPanelPct, setLeftPanelPct] = useState(78)
  const editorContainerRef = useRef<HTMLDivElement>(null)
  const startLeftResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    const container = editorContainerRef.current
    if (!container) return
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    const onMove = (ev: MouseEvent) => {
      const rect = container.getBoundingClientRect()
      const pct = ((ev.clientX - rect.left) / rect.width) * 100
      setLeftPanelPct(Math.max(28, Math.min(78, pct)))
    }
    const onUp = () => {
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [])

  // ── OCR review (PDF/image import) ────────────────────────────────────
  const [showOcrReview, setShowOcrReview] = useState(false)
  const [ocrElements, setOcrElements] = useState<OcrElement[]>([])
  const [pendingOcrContext, setPendingOcrContext] = useState<{ td: TemplateData; backgroundImage: string } | null>(null)

  // ── Text-review modal (A4 labeling step before slide build) ──────────
  const [showTextReview, setShowTextReview] = useState(false)
  const [textReviewSegments, setTextReviewSegments] = useState<TextSegment[]>([])
  const [textReviewRoles, setTextReviewRoles] = useState<string[]>([])
  const [textReviewHeadingRoles, setTextReviewHeadingRoles] = useState<Set<string>>(new Set())
  const [pendingAnalysis, setPendingAnalysis] = useState<{
    td: TemplateData
    mdm: Record<string, Record<string, string>>
    m: Record<string, Record<number, string>>
    bgColorsData: Record<string, string>
    genUserTagNames: Record<string, Record<string, string>>
  } | null>(null)

  // ── Live collaboration ─────────────────────────────────────────────────
  const [shareModalOpen, setShareModalOpen] = useState(false)
  const [shareTab, setShareTab] = useState<'inapp' | 'email'>('inapp')
  const [sharePermissionsOpen, setSharePermissionsOpen] = useState(false)
  const [shareMembers, setShareMembers] = useState<{ email: string; role: 'owner' | 'editor' | 'commenter' | 'viewer' }[]>([])
  const {
    rightTab, setRightTab,
    expandedCardIds, setExpandedCardIds,
    collapsedTextSectionIds, setCollapsedTextSectionIds, toggleTextSection,
    collapsedImageSectionIds, setCollapsedImageSectionIds, toggleImageSection,
    collapsedAssetsSectionIds, toggleAssetsSection,
    commentDraft, setCommentDraft,
  } = useRightPanelState()
  const [rightPanelOpen, setRightPanelOpen] = useState(true)
  const [shareEmail, setShareEmail] = useState('')
  const [sharing, setSharing] = useState(false)
  const [shareSuccess, setShareSuccess] = useState(false)
  const [shareError, setShareError] = useState('')
  const [liveError, setLiveError] = useState('')
  const [liveEnabling, setLiveEnabling] = useState(false)
  const [liveStopConfirm, setLiveStopConfirm] = useState(false)
  const [liveSuccessOpen, setLiveSuccessOpen] = useState(false)
  const [codeCopied, setCodeCopied] = useState(false)
  const [nameEditing, setNameEditing] = useState(false)

  // ── Import result banner ───────────────────────────────────────────────
  const [importBanner, setImportBanner] = useState<{
    slideCount: number
    layoutsMatched: number
    layoutsTotal: number
    warnings: { type: 'missing_images' | 'tables_skipped' | 'notes_skipped' | 'layout_mismatch' | 'unsupported_content'; message: string }[]
  } | null>(null)

  const [fidelityItems, setFidelityItems] = useState<{ id: string; label: string; fidelity: 'editable' | 'preserved' | 'raster_fallback' | 'unsupported' }[]>([])
  const [showFidelityReport, setShowFidelityReport] = useState(false)

  // ── Slide comments ────────────────────────────────────────────────────
  const [slideComments, setSlideComments] = useState<Record<string, SavedComment[]>>({})
  const [commentAuthor] = useState('Jij')
  const [focusedField, setFocusedField] = useState<{ blockId: string; role: string } | null>(null)
  const [hoveredLayerTarget, setHoveredLayerTarget] = useState<LayerHoverTarget | null>(null)
  const {
    annotatingState, drawTool, drawColor, drawStrokeWidth,
    hoveredCommentId, placingComment,
    startAnnotating, stopAnnotating,
    setDrawTool, setDrawColor, setDrawStrokeWidth, setHoveredCommentId,
    startPlacingComment: setPlacingCommentState, stopPlacingComment,
  } = useAnnotationState()

  function addSlideComment(blockId: string, body: string, position?: { x: number; y: number }) {
    const id = `${Date.now()}-${Math.random()}`
    const comment: SavedComment = { id, author: commentAuthor, body, createdAt: new Date().toISOString(), resolved: false, position }
    setSlideComments((prev) => ({ ...prev, [blockId]: [...(prev[blockId] ?? []), comment] }))
    setHoveredCommentId(id)
    return id
  }
  function beginPlacingComment(blockId: string) {
    const body = commentDraft.trim()
    if (!body) return
    const idx = blocks.findIndex((b) => b.id === blockId)
    if (idx >= 0) setActiveIdx(idx)
    stopAnnotating()
    setPlacingCommentState(blockId, body)
  }
  function addCommentAndAnnotate(blockId: string, mode: 'draw' | 'highlight') {
    const body = commentDraft.trim()
    if (!body) return
    const idx = blocks.findIndex((b) => b.id === blockId)
    if (idx >= 0) setActiveIdx(idx)
    stopPlacingComment()
    const commentId = addSlideComment(blockId, body)
    setCommentDraft('')
    startAnnotating(blockId, commentId, mode)
  }
  function placeCommentOnSlide(blockId: string, e: React.MouseEvent<HTMLDivElement>) {
    if (!placingComment || placingComment.blockId !== blockId) return
    e.preventDefault()
    e.stopPropagation()
    const rect = e.currentTarget.getBoundingClientRect()
    const x = Math.max(0, Math.min(1920, ((e.clientX - rect.left) / rect.width) * 1920))
    const y = Math.max(0, Math.min(1080, ((e.clientY - rect.top) / rect.height) * 1080))
    addSlideComment(blockId, placingComment.body, { x, y })
    setCommentDraft('')
    stopPlacingComment()
  }

  function placeCommentAtPosition(blockId: string, x: number, y: number) {
    if (!placingComment || placingComment.blockId !== blockId) return
    addSlideComment(blockId, placingComment.body, { x, y })
    setCommentDraft('')
    stopPlacingComment()
  }
  function attachDrawingToComment(commentId: string, blockId: string, drawing: DrawingAnnotation) {
    setSlideComments((prev) => ({
      ...prev,
      [blockId]: (prev[blockId] ?? []).map((c) => {
        if (c.id !== commentId) return c
        const existingDrawings = c.drawings && c.drawings.length > 0
          ? c.drawings
          : c.drawing
            ? [c.drawing]
            : []
        return { ...c, drawing: c.drawing ?? drawing, drawings: [...existingDrawings, drawing] }
      }),
    }))
  }
  function attachHighlightToComment(commentId: string, blockId: string, highlight: TextHighlight) {
    setSlideComments((prev) => ({
      ...prev,
      [blockId]: (prev[blockId] ?? []).map((c) => c.id === commentId ? { ...c, highlight } : c),
    }))
    stopAnnotating()
  }
  function resolveSlideComment(blockId: string, commentId: string) {
    setSlideComments((prev) => ({
      ...prev,
      [blockId]: (prev[blockId] ?? []).map((c) => c.id === commentId ? { ...c, resolved: true } : c),
    }))
  }
  function deleteSlideComment(blockId: string, commentId: string) {
    setSlideComments((prev) => {
      const nextComments = (prev[blockId] ?? []).filter((c) => c.id !== commentId)
      const next = { ...prev }
      if (nextComments.length > 0) next[blockId] = nextComments
      else delete next[blockId]
      return next
    })
    if (hoveredCommentId === commentId) setHoveredCommentId(null)
    if (annotatingState?.commentId === commentId) stopAnnotating()
  }
  function startDrawingAnnotation(blockId: string, commentId: string) {
    if (annotatingState?.blockId === blockId && annotatingState.commentId === commentId && annotatingState.mode === 'draw') {
      stopAnnotating()
    } else {
      startAnnotating(blockId, commentId, 'draw')
    }
  }
  function startHighlightAnnotation(blockId: string, commentId: string) {
    if (annotatingState?.blockId === blockId && annotatingState.commentId === commentId && annotatingState.mode === 'highlight') {
      stopAnnotating()
    } else {
      startAnnotating(blockId, commentId, 'highlight')
    }
  }
  function updatePresenterNotes(blockId: string, notes: string) {
    setBlocks((prev) => prev.map((b) => b.id === blockId ? { ...b, presenterNotes: notes } : b))
  }

  // ── Export state + handlers ────────────────────────────────────────────
  const {
    exporting, exportError, exportOpen, setExportOpen, setExportError,
    pdfExporting, pdfSlideIdx, setPdfSlideIdx, pdfCanvasScale, pdfCaptureSize, pdfSlideRef,
    preflightOpen, setPreflightOpen, preflightTarget, preflightIssues,
    handleExportPptx, handleExport, handleExportPdf, handleExportJson,
    openExportPreflight, openPdfPreflight, runPreflight,
  } = useAtelierExport({
    blocks,
    templateData,
    templateClientId,
    projectName,
    templateName: clients.find((c) => c.id === templateClientId)?.name ?? '',
    sageTagMappings,
    userTagNames,
    buildExportBlocks,
  })

  const live = useLivePresentation({
    onRemoteUpdate: useCallback((remoteBlocks, remoteOverrides) => {
      applyingHistoryRef.current = true
      undoStackRef.current = []
      redoStackRef.current = []
      pendingHistoryBaseRef.current = null
      pendingHistoryNextRef.current = null
      if (historyTimerRef.current) clearTimeout(historyTimerRef.current)
      setHistoryCounts({ undo: 0, redo: 0 })
      setBlocks(remoteBlocks as Block[])
      setOverrides(remoteOverrides)
    }, []),
    onRemoteSlideChange: useCallback((idx: number) => {
      setActiveIdx(idx)
    }, []),
    // A live viewer received a theme switch from the owner — apply it locally
    // (no persist, no re-broadcast). Late joiners get the theme via the DB instead.
    onRemoteThemeChange: useCallback((nextTemplateClientId: string) => {
      if (!nextTemplateClientId || nextTemplateClientId === templateClientIdRef.current) return
      void (async () => {
        const loaded = await loadThemeData(nextTemplateClientId)
        if (!loaded) return
        const { td, raw } = loaded
        const layoutNames = new Set(td.layouts.map((l) => l.name))
        const fallbackLayout = td.layouts[0]?.name ?? 'Leeg canvas'
        setTemplateClientId(nextTemplateClientId)
        setTemplateData(td)
        setSageTagMappings(raw['_mdToSageTag'] ?? {})
        setMappings(buildMappings(raw, td))
        setBgColors(raw['_bgColors'] ?? {})
        setLayoutCorrections(raw['_visualCorrections'] ?? {})
        setUserTagNames(raw['_userSageTags'] ?? {})
        setBlocks((prev) => prev.map((block) => layoutNames.has(block.type) ? block : { ...block, type: fallbackLayout }))
      })()
    }, []),
  })

  const liveAtelier = useLiveAtelierProject(
    useCallback((projectId: string, remoteData: unknown) => {
      if (atelierCreationType === 'banners') {
        const p = remoteData as import('../lib/atelier-project-store').SavedBannerProject
        setSavedBannerProjects(upsertBannerProject(p))
      } else if (atelierCreationType === 'print') {
        const p = remoteData as import('../lib/atelier-project-store').SavedPrintProject
        setSavedPrintProjects(upsertPrintProject(p))
      } else {
        const p = remoteData as import('../hooks/useAtelierMedia').AtelierMediaProject
        setAtelierMediaProjects((prev) => {
          const idx = prev.findIndex((m) => m.id === projectId)
          if (idx >= 0) { const next = [...prev]; next[idx] = p; return next }
          return [p, ...prev]
        })
      }
    }, [atelierCreationType]),
  )

  const liveAtelierSyncRef = useRef(liveAtelier.syncState)
  useEffect(() => { liveAtelierSyncRef.current = liveAtelier.syncState }, [liveAtelier.syncState])

  // Automatisch inladen wanneer via share-code een atelier-project gejoint wordt
  useEffect(() => {
    if (!joinAtelierProjectId) return
    fetchAtelierProjectById(joinAtelierProjectId).then((remote) => {
      if (!remote) return
      if (remote.type === 'banners') {
        const p = remote.data as import('../lib/atelier-project-store').SavedBannerProject
        setSavedBannerProjects(upsertBannerProject(p))
        setActiveBannerProjectId(p.id)
        setAtelierCreationType('banners')
      } else if (remote.type === 'print') {
        const p = remote.data as import('../lib/atelier-project-store').SavedPrintProject
        setSavedPrintProjects(upsertPrintProject(p))
        setActivePrintProjectId(p.id)
        setAtelierCreationType('print')
      } else {
        const p = remote.data as import('../hooks/useAtelierMedia').AtelierMediaProject
        setAtelierMediaProjects((prev) => {
          const idx = prev.findIndex((m) => m.id === p.id)
          if (idx >= 0) { const next = [...prev]; next[idx] = p; return next }
          return [p, ...prev]
        })
        setActiveAtelierProjectId(p.id)
        setAtelierCreationType(remote.type === 'media-video' ? 'video' : 'images')
      }
      liveAtelier.connectToExisting(joinAtelierProjectId)
    })
  }, [joinAtelierProjectId])

  function cloneHistorySnapshot(snapshot: EditorHistorySnapshot): EditorHistorySnapshot {
    return JSON.parse(JSON.stringify(snapshot))
  }

  function historyContentKey(snapshot: EditorHistorySnapshot): string {
    return JSON.stringify({ blocks: snapshot.blocks, overrides: snapshot.overrides })
  }

  function makeHistorySnapshot(): EditorHistorySnapshot {
    return cloneHistorySnapshot({ blocks, overrides, activeIdx })
  }

  function updateHistoryCounts() {
    setHistoryCounts({ undo: undoStackRef.current.length, redo: redoStackRef.current.length })
  }

  function pushUndoSnapshot(snapshot: EditorHistorySnapshot) {
    undoStackRef.current = [...undoStackRef.current, cloneHistorySnapshot(snapshot)].slice(-80)
    redoStackRef.current = []
    updateHistoryCounts()
  }

  function commitPendingHistory() {
    const base = pendingHistoryBaseRef.current
    const next = pendingHistoryNextRef.current
    if (!base || !next) return
    undoStackRef.current = [...undoStackRef.current, cloneHistorySnapshot(base)].slice(-80)
    redoStackRef.current = []
    currentHistoryRef.current = cloneHistorySnapshot(next)
    currentHistoryKeyRef.current = pendingHistoryKeyRef.current
    pendingHistoryBaseRef.current = null
    pendingHistoryNextRef.current = null
    pendingHistoryKeyRef.current = ''
    if (historyTimerRef.current) clearTimeout(historyTimerRef.current)
    historyTimerRef.current = null
    updateHistoryCounts()
  }

  function applyHistorySnapshot(snapshot: EditorHistorySnapshot) {
    applyingHistoryRef.current = true
    if (historyTimerRef.current) clearTimeout(historyTimerRef.current)
    pendingHistoryBaseRef.current = null
    pendingHistoryNextRef.current = null
    pendingHistoryKeyRef.current = ''
    const restored = cloneHistorySnapshot(snapshot)
    setBlocks(restored.blocks)
    setOverrides(restored.overrides)
    setActiveIdx(Math.max(0, Math.min(restored.activeIdx, restored.blocks.length - 1)))
    setSlideTypeMenuOpen(null)
  }

  function undoEditorChange() {
    commitPendingHistory()
    const previous = undoStackRef.current.pop()
    if (!previous) { updateHistoryCounts(); return }
    redoStackRef.current.push(makeHistorySnapshot())
    applyHistorySnapshot(previous)
    updateHistoryCounts()
  }

  function redoEditorChange() {
    commitPendingHistory()
    const next = redoStackRef.current.pop()
    if (!next) { updateHistoryCounts(); return }
    undoStackRef.current.push(makeHistorySnapshot())
    applyHistorySnapshot(next)
    updateHistoryCounts()
  }

  function applyVoiceAction(action: VoiceCommandAction) {
    if (action.action !== 'update_slide') return
    const idx = typeof action.slideIndex === 'number' ? action.slideIndex : activeIdx
    setBlocks(prev => prev.map((b, i) => {
      if (i !== idx) return b
      return {
        ...b,
        ...(action.changes.heading !== undefined ? { heading: action.changes.heading } : {}),
        ...(action.changes.body !== undefined ? { body: action.changes.body } : {}),
      }
    }))
    setActiveIdx(idx)
  }

  const voice = useVoiceCommand({
    blocks: blocks.map((b, i) => ({ index: i, type: b.type, heading: b.heading, body: b.body, fields: b.fields })),
    activeSlideIndex: activeIdx,
    onAction: applyVoiceAction,
  })

  const [canvasPromptLoading, setCanvasPromptLoading] = useState(false)
  const [chatMessages, setChatMessages] = useState<{ role: 'user' | 'assistant'; content: string }[]>([])
  const [forceChatTab, setForceChatTab] = useState(0)

  useEffect(() => {
    const handler = (e: Event) => {
      const { path, name } = (e as CustomEvent).detail
      openPresentationTab(path, name)
    }
    window.addEventListener('huphe:open-presentation-tab', handler)
    return () => window.removeEventListener('huphe:open-presentation-tab', handler)
  }, [presentationTabs])

  async function handleCanvasPrompt(prompt: string) {
    setChatMessages(prev => [...prev, { role: 'user', content: prompt }])
    setForceChatTab(t => t + 1)
    setCanvasPromptLoading(true)
    try {
      const api = (window as any).api
      const blocksForApi = blocks.map((b, i) => ({ index: i, type: b.type, heading: b.heading, body: b.body, fields: b.fields }))
      const result = await api.voiceCommand({ transcript: prompt, blocks: blocksForApi, activeSlideIndex: activeIdx })
      if (result.ok) {
        applyVoiceAction(result.action as VoiceCommandAction)
        setChatMessages(prev => [...prev, { role: 'assistant', content: result.action.explanation ?? 'Slide bijgewerkt.' }])
      } else {
        setChatMessages(prev => [...prev, { role: 'assistant', content: 'Er ging iets mis. Probeer het opnieuw.' }])
      }
    } catch {
      setChatMessages(prev => [...prev, { role: 'assistant', content: 'Fout bij verwerken.' }])
    } finally {
      setCanvasPromptLoading(false)
    }
  }

  const [notesOpen, setNotesOpen] = useState(false)
  const meeting = useMeetingNotes({ activeIdx, blocks })

  useEffect(() => {
    if (historyTimerRef.current) clearTimeout(historyTimerRef.current)
    undoStackRef.current = []
    redoStackRef.current = []
    pendingHistoryBaseRef.current = null
    pendingHistoryNextRef.current = null
    pendingHistoryKeyRef.current = ''
    currentHistoryRef.current = null
    currentHistoryKeyRef.current = ''
    setHistoryCounts({ undo: 0, redo: 0 })
  }, [projectPath])

  useEffect(() => {
    if (step !== 'editor' || blocks.length === 0) return
    const next = makeHistorySnapshot()
    const nextKey = historyContentKey(next)

    if (applyingHistoryRef.current) {
      applyingHistoryRef.current = false
      currentHistoryRef.current = next
      currentHistoryKeyRef.current = nextKey
      return
    }

    if (!currentHistoryRef.current) {
      currentHistoryRef.current = next
      currentHistoryKeyRef.current = nextKey
      return
    }

    if (nextKey === currentHistoryKeyRef.current) {
      currentHistoryRef.current = next
      return
    }

    if (!pendingHistoryBaseRef.current) {
      pendingHistoryBaseRef.current = currentHistoryRef.current
    }
    pendingHistoryNextRef.current = next
    pendingHistoryKeyRef.current = nextKey
    if (historyTimerRef.current) clearTimeout(historyTimerRef.current)
    historyTimerRef.current = setTimeout(() => commitPendingHistory(), 350)
  }, [step, blocks, overrides, activeIdx]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    selectedSlideIdsRef.current = selectedSlideIds
  }, [selectedSlideIds])

  useEffect(() => {
    const blockIds = new Set(blocks.map((block) => block.id))
    setSelectedSlideIds((prev) => {
      const next = new Set([...prev].filter((id) => blockIds.has(id)))
      return next.size === prev.size ? prev : next
    })
    setLastSelectedIdx((idx) => {
      if (idx == null) return null
      return blocks.length === 0 ? null : Math.min(idx, blocks.length - 1)
    })
  }, [blocks])

  const placeholderFileRef = useRef<string | undefined>(undefined)
  const templateDataRef = useRef<TemplateData | null>(null)
  const templateClientIdRef = useRef<string>('')

  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dragImageRef = useRef<{
    blockId: string
    slotIndex: number   // 0 = primary (block.imageOffset); >0 = block.imageSlots[i].offset
    hasExplicitOffset: boolean  // true when imageOffset was already set by user (not imageAlign)
    lastX: number
    lastY: number
    naturalW?: number
    naturalH?: number
    imgEl: HTMLImageElement
    currentOffsetX: number
    currentOffsetY: number
    startOffsetX: number
    startOffsetY: number
    frameW: number
    frameH: number
    rafId?: number | null
  } | null>(null)
  const blocksRef = useRef(blocks)
  useEffect(() => { blocksRef.current = blocks }, [blocks])
  const leftColObserver = useRef<ResizeObserver | null>(null)
  const leftColRef = useCallback((el: HTMLDivElement | null) => {
    leftColObserver.current?.disconnect()
    leftColObserver.current = null
    if (!el) return
    const obs = new ResizeObserver(([entry]) => setPreviewWidth(entry.contentRect.width))
    obs.observe(el)
    leftColObserver.current = obs
  }, [])
  const previewScrollObserver = useRef<ResizeObserver | null>(null)
  const previewScrollElRef = useRef<HTMLDivElement | null>(null)
  const [previewScrollTop, setPreviewScrollTop] = useState(0)
  const [previewViewportHeight, setPreviewViewportHeight] = useState(0)
  const previewScrollerRef = useCallback((el: HTMLDivElement | null) => {
    previewScrollObserver.current?.disconnect()
    previewScrollObserver.current = null
    previewScrollElRef.current = el
    if (!el) return
    setPreviewViewportHeight(el.clientHeight)
    const obs = new ResizeObserver(([entry]) => setPreviewViewportHeight(entry.contentRect.height))
    obs.observe(el)
    previewScrollObserver.current = obs
  }, [])
  const editorFileRef = useRef<HTMLInputElement>(null)
  const slideRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const [previewWidth, setPreviewWidth] = useState(0)
  const actualCardWidth = Math.max(0, previewWidth - 40)
  const slideScale = actualCardWidth > 0 ? actualCardWidth / 1920 : 0

  // Heading-achtige rollen bepalen op basis van fontSize (voor document-view styling)
  const docHeadingRoles = useMemo(() => {
    if (!templateData) return new Set<string>(['Heading'])
    const sizes = new Map<string, number>()
    for (const layout of templateData.layouts) {
      for (const item of layout.textItems) {
        if (item.source === 'sageTag' && item.role && item.fontSize) {
          sizes.set(item.role, Math.max(sizes.get(item.role) ?? 0, item.fontSize))
        }
      }
    }
    const max = Math.max(...sizes.values(), 0)
    const threshold = Math.max(36, max * 0.5)
    return new Set([...sizes.entries()].filter(([, s]) => s >= threshold).map(([r]) => r))
  }, [templateData])
  const virtualSlideHeaderHeight = 21
  const virtualSlideGapHeight = 40
  const virtualSlideRowHeight = actualCardWidth > 0
    ? (actualCardWidth * 9 / 16) + virtualSlideHeaderHeight + virtualSlideGapHeight
    : 0
  const HIDDEN_BAR_ROW_HEIGHT = 36 // compact bar + small gap for hidden slides
  const virtualPreviewOverscan = 2

  // Per-block display heights (normal, compact bar when hidden, or 0 when hidden and hidden-mode off)
  const blockDisplayHeights = useMemo(() => {
    if (virtualSlideRowHeight === 0) return blocks.map(() => 0)
    return blocks.map((b, i) => {
      if (!b.hidden) return virtualSlideRowHeight
      if (!showHiddenSlides) return 0
      if (i === activeIdx) return virtualSlideRowHeight // active hidden slide shows full
      return HIDDEN_BAR_ROW_HEIGHT
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocks, showHiddenSlides, activeIdx, virtualSlideRowHeight])

  // Cumulative top positions for each block
  const blockOffsets = useMemo(() => {
    const offsets = new Array<number>(blocks.length)
    let acc = 0
    for (let i = 0; i < blocks.length; i++) {
      offsets[i] = acc
      acc += blockDisplayHeights[i]
    }
    return offsets
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blockDisplayHeights, blocks.length])

  const totalVirtualHeight = blockOffsets.length > 0
    ? blockOffsets[blockOffsets.length - 1] + blockDisplayHeights[blockDisplayHeights.length - 1]
    : 0
  const virtualPreviewHeight = totalVirtualHeight > 0
    ? Math.max(0, totalVirtualHeight - virtualSlideGapHeight + 68)
    : 0

  // Variable-height virtual window: find first block still (partially) below scroll top
  let _vStart = 0
  while (_vStart < blockOffsets.length && blockOffsets[_vStart] + blockDisplayHeights[_vStart] <= previewScrollTop) _vStart++
  const virtualStartIdx = Math.max(0, _vStart - virtualPreviewOverscan)

  let _vEnd = virtualStartIdx
  const _vBottom = previewScrollTop + previewViewportHeight
  while (_vEnd < blockOffsets.length && blockOffsets[_vEnd] < _vBottom) _vEnd++
  const virtualEndIdx = Math.min(blocks.length, _vEnd + virtualPreviewOverscan)

  useEffect(() => {
    if (!supabase) {
      setClientsLoading(false)
      return
    }
    // Lokale clients altijd laden als primaire bron
    ;((window as any).api?.listLocalClients?.() as Promise<Array<{id: string; name: string}>> ?? Promise.resolve([])).then((localClients) => {
      if (localClients?.length) setClients((prev) => {
        const existingIds = new Set(prev.map((c) => c.id))
        return [...prev, ...localClients.filter((c) => !existingIds.has(c.id))].sort((a, b) => a.name.localeCompare(b.name))
      })
    })
    supabase.from('clients').select('id, name').order('name').then(({ data }) => {
      if (data) setClients((prev) => {
        const localOnlyIds = new Set(prev.map((c) => c.id).filter((id) => !data.find((r: any) => r.id === id)))
        const localOnly = prev.filter((c) => localOnlyIds.has(c.id))
        return [...localOnly, ...data].sort((a: any, b: any) => a.name.localeCompare(b.name))
      })
      setClientsLoading(false)
    })
    // Lokale templates als primair, Supabase als aanvulling
    Promise.all([
      ((window as any).api?.listLocalTemplates?.() as Promise<string[]> | undefined) ?? Promise.resolve([]),
      supabase.from('templates').select('client_id').then(({ data }) => (data ?? []).map((r: any) => r.client_id as string)),
    ]).then(([localIds, remoteIds]) => {
      setTemplateClientIds(new Set([...(localIds ?? []), ...remoteIds]))
    })
  }, [])

  useEffect(() => {
    const refresh = () => setHtmlTemplateOptions(loadHtmlTemplateOptions())
    window.addEventListener('huphe:html-templates-changed', refresh)
    return () => window.removeEventListener('huphe:html-templates-changed', refresh)
  }, [])

  // Dev-mode HMR: herlaad template automatisch als de module-code wijzigt.
  // Werkt alleen in development (Vite HMR). In productie is import.meta.hot undefined.
  useEffect(() => {
    if (!import.meta.hot) return
    const onUpdate = () => {
      if (!isHtmlTemplateClientId(templateClientIdRef.current)) return
      const id = htmlTemplateIdFromClientId(templateClientIdRef.current)
      const updated = getHtmlPresentationTemplate(id)
      if (!updated) return
      const td = htmlTemplateToTemplateData(updated)
      setTemplateData(td)
    }
    import.meta.hot.on('vite:afterUpdate', onUpdate)
    return () => import.meta.hot!.off('vite:afterUpdate', onUpdate)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    ; (window as any).api.readPlaceholder().then((res: any) => {
      if (res.ok && res.dataUrl) setPlaceholderUrl(res.dataUrl)
      if (res.ok && res.filePath) placeholderFileRef.current = res.filePath
    })
  }, [])

  useEffect(() => { templateDataRef.current = templateData }, [templateData])
  useEffect(() => { templateClientIdRef.current = templateClientId }, [templateClientId])

  // Migrate any existing localStorage draft to IndexedDB (runs once on mount)
  useEffect(() => { void migrateLocalStorageDraft() }, [])

  // Load a saved project on mount (skips upload step, restores full state)
  useEffect(() => {
    if (!initialProject) return
    if (!supabase) { setStep('editor'); setProjectLoading(false); return }
    setTemplateClientId(initialProject.templateClientId)
    setMdText(initialProject.mdText)
    setProjectPath(initialProject._filePath ?? null)
    setProjectName(initialProject.name)
    if (initialProject.globalStylePrompt) setGlobalStylePrompt(initialProject.globalStylePrompt)

    if (isHtmlTemplateClientId(initialProject.templateClientId)) {
      const htmlTemplate = getHtmlPresentationTemplate(htmlTemplateIdFromClientId(initialProject.templateClientId))
      if (htmlTemplate) {
        const resolvedInit = htmlTemplateToTemplateData(htmlTemplate)
        setTemplateData(resolvedInit)
        setSageTagMappings({})
        setBgColors({})
        setLayoutCorrections({})
        setMappings(buildMappings({}, resolvedInit))
      }
      setStep('editor')
      setProjectLoading(false)
      return
    }

    Promise.all([
      (window as any).api?.getLocalTemplateData?.(initialProject.templateClientId),
      (window as any).api?.getLocalMappings?.(initialProject.templateClientId),
    ]).then(async ([localTd, localMappings]) => {
      let resolvedInit = localTd?.ok ? localTd.templateData : null
      let rawInit: any = localMappings ?? null
      if ((!resolvedInit || !rawInit) && supabase) {
        const [tRes, mRes] = await Promise.all([
          resolvedInit ? Promise.resolve(null) : supabase.from('templates').select('template_data').eq('client_id', initialProject.templateClientId).maybeSingle(),
          rawInit ? Promise.resolve(null) : supabase.from('template_mappings').select('mappings').eq('client_id', initialProject.templateClientId).maybeSingle(),
        ])
        if (!resolvedInit && tRes?.data?.template_data) {
          resolvedInit = await resolveTemplateData(supabase, tRes.data.template_data)
        }
        if (!rawInit) rawInit = (mRes?.data?.mappings as any) ?? {}
      }
      rawInit = rawInit ?? {}
      if (resolvedInit) {
        setTemplateData(resolvedInit)
        setSageTagMappings(rawInit['_mdToSageTag'] ?? {})
        setBgColors(rawInit['_bgColors'] ?? {})
        setLayoutCorrections(rawInit['_visualCorrections'] ?? {})
        setMappings(buildMappings(rawInit, resolvedInit))
      }
    }).catch((err) => {
      console.error('[open-project] template laden mislukt:', err)
    }).finally(() => {
      // Always land in the editor, even if the template fetch failed — never
      // get stuck on the loading screen.
      setStep('editor')
      setProjectLoading(false)
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Load a pre-analyzed state on mount (from embedded wizard → fullscreen transition)
  useEffect(() => {
    if (!initialAnalysis) return
    setTemplateData(initialAnalysis.templateData)
    setSageTagMappings(initialAnalysis.sageTagMappings)
    setMappings(initialAnalysis.mappings)
    setBgColors(initialAnalysis.bgColors)
    setUserTagNames(initialAnalysis.userTagNames)
    setTemplateClientId(initialAnalysis.templateClientId)
    setMdText(initialAnalysis.mdText)
    if (initialAnalysis.textMode) setTextMode(initialAnalysis.textMode)
    if (initialAnalysis.imageMode) setImageMode(initialAnalysis.imageMode)
    setStep('editor')
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    function onSetSlide(e: Event) {
      setPdfSlideIdx((e as CustomEvent<number>).detail)
    }
    window.addEventListener('pdf:set-slide', onSetSlide)
    return () => window.removeEventListener('pdf:set-slide', onSetSlide)
  }, [])

  useEffect(() => {
    ; (window as any).api?.debugLog?.('[mdText-effect] FIRE — mdText lengte:', mdText.length, '| hasInit:', hasInitializedRef.current)
    // First mount with a loaded project: restore blocks/overrides directly from the saved data
    if (initialProject && !hasInitializedRef.current) {
      ; (window as any).api?.debugLog?.('[mdText-effect] branch A: initialiseer vanuit project, overrides:', Object.keys(initialProject.overrides ?? {}).length)
      setBlocks(initialProject.blocks)
      setOverrides(initialProject.overrides ?? {})
      if (initialProject.slideComments) setSlideComments(initialProject.slideComments)
      setActiveIdx(0)
      hasInitializedRef.current = true
      return
    }

    // Skip empty mdText (initial render before any content is typed or loaded)
    if (!mdText) return

    // Skip if this is exactly the mdText that was loaded from the project — the blocks/overrides
    // are already set from branch A above, and re-parsing would wipe user changes.
    if (initialProject && mdText === initialProject.mdText) return
    if (loadingProjectMdTextRef.current === mdText) {
      loadingProjectMdTextRef.current = null
      return
    }

      ; (window as any).api?.debugLog?.('[mdText-effect] branch C: PARSE EN RESET — overrides worden gewist! mdText lengte:', mdText.length)
    const parsed = parseBlocks(mdText)
    const phPath = placeholderFileRef.current
    const td = templateDataRef.current
    setBlocks(parsed.map((b) => ({
      ...b,
      id: Math.random().toString(36).slice(2),
      imagePath: phPath && td && layoutHasImageSlot(td.layouts.find((l) => l.name === b.type))
        ? phPath
        : undefined,
    })))
    setOverrides({})
    setActiveIdx(0)
  }, [mdText])

  // AI fill mode: resolve ambiguous tags + generate images after editor loads
  useEffect(() => {
    if (step !== 'editor' || (textMode !== 'ai' && imageMode !== 'ai') || aiResolvedRef.current) return
    if (!blocks.length || !templateData) return
    aiResolvedRef.current = true

    async function runAiFill() {
      if (textMode === 'ai') {
        const items: Array<{
          blockId: string
          layoutName: string
          ambiguousFields: Array<{ fieldName: string; content: string }>
          availableSageTags: string[]
        }> = []

        for (const block of blocks) {
          const sageTags = getSageTags(block.type, templateData, mappings)
          const ambiguousFields: Array<{ fieldName: string; content: string }> = []
          for (const f of getFields(block)) {
            const resolved = autoResolveTag(f.displayKey, block, overrides, sageTagMappings, sageTags)
            if (!resolved) {
              ambiguousFields.push({ fieldName: f.displayKey, content: f.content })
            }
          }
          if (ambiguousFields.length > 0) {
            items.push({ blockId: block.id, layoutName: block.type, ambiguousFields, availableSageTags: sageTags })
          }
        }

        if (items.length > 0) {
          const result = await (window as any).api?.resolveTagsWithAI({ items })
          if (result?.ok && result.resolutions) {
            setOverrides((prev) => {
              const next = { ...prev }
              for (const [blockId, fieldMap] of Object.entries(result.resolutions as Record<string, Record<string, string>>)) {
                next[blockId] = { ...(next[blockId] ?? {}), ...fieldMap }
              }
              return next
            })
          }
        }
      }

      // Generate images for all blocks with an image slot
      if (imageMode === 'ai') {
        for (const block of blocks) {
          const layout = templateData?.layouts.find((l) => l.name === block.type)
          if (layoutHasImageSlot(layout) && !block.imagePath) {
            await autoGenerateImage(block)
          }
        }
      }
    }

    runAiFill()
  }, [step, textMode, imageMode, blocks, templateData, mappings, sageTagMappings, overrides]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-connect when opened via share code (initialPresentationId)
  useEffect(() => {
    if (!initialPresentationId || !supabase) return
    const sb = supabase
    live.connectToExisting(initialPresentationId).then(async (info) => {
      if (!info?.templateClientId) return
      live.loadMembers(initialPresentationId)
      if (info.blocks) setBlocks(info.blocks as Block[])
      if (info.overrides) setOverrides(info.overrides as Overrides)
      if (info.name) setProjectName(info.name)
      setTemplateClientId(info.templateClientId)
      const [localTd2, localMappings2] = await Promise.all([
        (window as any).api?.getLocalTemplateData?.(info.templateClientId),
        (window as any).api?.getLocalMappings?.(info.templateClientId),
      ])
      let resolvedLive = localTd2?.ok ? localTd2.templateData : null
      let rawLive: any = localMappings2 ?? null
      if (!resolvedLive || !rawLive) {
        const [tRes, mRes] = await Promise.all([
          resolvedLive ? Promise.resolve(null) : sb.from('templates').select('template_data').eq('client_id', info.templateClientId).maybeSingle(),
          rawLive ? Promise.resolve(null) : sb.from('template_mappings').select('mappings').eq('client_id', info.templateClientId).maybeSingle(),
        ])
        if (!resolvedLive && tRes?.data?.template_data) {
          resolvedLive = await resolveTemplateData(sb, tRes.data.template_data)
        }
        if (!rawLive) rawLive = (mRes?.data?.mappings as any) ?? {}
      }
      rawLive = rawLive ?? {}
      if (resolvedLive) {
        setTemplateData(resolvedLive)
        setSageTagMappings(rawLive['_mdToSageTag'] ?? {})
        setBgColors(rawLive['_bgColors'] ?? {})
        setLayoutCorrections(rawLive['_visualCorrections'] ?? {})
        setMappings(buildMappings(rawLive, resolvedLive))
      }
      setStep('editor')
    })
  }, [initialPresentationId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-reconnect when re-opening a project that was previously live
  // (covers the case where user navigated away without explicitly stopping live)
  useEffect(() => {
    const presId = initialProject?.supabasePresentationId
    if (!presId || initialPresentationId || !supabase) return
    supabase
      .from('presentations')
      .select('is_live')
      .eq('id', presId)
      .single()
      .then(({ data }) => {
        if (data?.is_live) {
          setSupabasePresentationId(presId)
          live.connectToExisting(presId)
          live.loadMembers(presId)
        }
      })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Visual calibration (Phase 1) ─────────────────────────────────────────
  // Measurement-only fidelity loop: Keynote vs HTML screenshots + deterministic
  // diff. Exposed on window for now so it can be triggered from devtools while
  // the report UI placement is decided. Returns/stores a CalibrationReport.
  const calibration = useCalibration()
  const [calibrationReport, setCalibrationReport] = useState<CalibrationReport | null>(null)
  useEffect(() => {
    (window as any).__hupheCalibrate = async () => {
      if (!templateData || !templateClientId) { console.warn('[calibration] geen template geladen'); return null }
      const report = await calibration.run(templateData, templateClientId, { mappings, bgColors })
      setCalibrationReport(report)
      if (report?.corrections) {
        setLayoutCorrections(report.corrections)            // apply live
        void persistVisualCorrections(templateClientId, report.corrections)  // persist
      }
      console.log('[calibration] rapport:', report)
      return report
    }
    // POC: generate a screenshot-as-skin for one layout and apply it live.
    //   await window.__genSkin('Phone Social Post')
    ;(window as any).__genSkin = async (layoutName: string) => {
      if (!templateData || !templateClientId) { console.warn('[skin] geen template geladen'); return }
      const layout = templateData.layouts.find((l) => l.name === layoutName)
      if (!layout) { console.warn('[skin] layout niet gevonden:', layoutName); return }
      // Blank every sage tag (text + image) so the skin keeps only decoration.
      const blankFields: Record<string, string> = {}
      for (const t of layout.textItems) if (t.source === 'sageTag' && t.role) blankFields[t.role] = ''
      console.log('[skin] genereren voor', layoutName, '— blank velden:', Object.keys(blankFields))
      const res = await (window as any).api?.generateSkin?.({ clientId: templateClientId, layoutName, blankFields })
      console.log('[skin] resultaat:', res?.ok ? 'OK (skin ontvangen)' : res)
      if (res?.ok && res.skinDataUrl) {
        setTemplateData((prev) => prev ? {
          ...prev,
          layouts: prev.layouts.map((l) => l.name === layoutName ? { ...l, skinDataUrl: res.skinDataUrl } : l),
        } : prev)
        console.log('[skin] toegepast op', layoutName)
      }
    }
    return () => { delete (window as any).__hupheCalibrate; delete (window as any).__genSkin }
  }, [templateData, templateClientId, mappings, bgColors, calibration])

  // NB: visual calibration runs ONLY at template upload (the mapping wizard in
  // SettingsPage). Opening a presentation no longer triggers an AI check — it
  // just loads the already-persisted corrections (_visualCorrections) via the
  // template load path and applies them below.

  // Inject loaded/produced corrections into templateData so every existing
  // WebSlidePreview render applies them (no prop drilling). Guard prevents loops.
  useEffect(() => {
    if (!templateData) return
    const needsInject = templateData.layouts.some(
      (l) => layoutCorrections[l.name] && l.visualCorrections !== layoutCorrections[l.name],
    )
    if (!needsInject) return
    setTemplateData((prev) => prev ? {
      ...prev,
      layouts: prev.layouts.map((l) =>
        layoutCorrections[l.name] ? { ...l, visualCorrections: layoutCorrections[l.name] } : l,
      ),
    } : prev)
  }, [templateData, layoutCorrections])

  // Persist AI visual corrections into template_mappings (template-level, so they
  // survive parser/cache changes and load with the template).
  async function persistVisualCorrections(
    clientId: string,
    corrections: Record<string, import('../components/WebSlidePreview').LayoutCorrections>,
  ) {
    try {
      const localMappings = await (window as any).api?.getLocalMappings?.(clientId) ?? {}
      const merged = { ...localMappings, _visualCorrections: corrections }
      await (window as any).api?.setLocalMappings?.(clientId, merged)
      if (supabase) {
        await supabase.from('template_mappings').upsert(
          { client_id: clientId, mappings: merged },
          { onConflict: 'client_id' },
        )
      }
    } catch (err) {
      console.warn('[calibration] persist visual corrections mislukt:', err)
    }
  }

  // Stop a live session we own when the editor unmounts (e.g. navigating back
  // to the dashboard). Without this the presentation stays is_live=true in
  // Supabase, and on reopen the live path reads template_client_id / blocks
  // from the stale Supabase row — shadowing locally-saved changes like a theme
  // switch. A ref holds the latest live state so the unmount cleanup is accurate.
  const liveExitRef = useRef<{ isLive: boolean; isOwner: boolean; presId: string | null }>({
    isLive: false, isOwner: false, presId: null,
  })
  useEffect(() => {
    liveExitRef.current = {
      isLive: live.isLive,
      isOwner: live.isOwner,
      presId: live.presentationId ?? supabasePresentationId ?? null,
    }
  })
  useEffect(() => {
    return () => {
      const s = liveExitRef.current
      if (s.isLive && s.isOwner && s.presId) {
        live.disable(s.presId)
      }
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Load local presentation projects when switching to presentation type.
  useEffect(() => {
    if (atelierCreationType !== 'presentation') return
    void refreshSavedPresentations()
  }, [atelierCreationType]) // eslint-disable-line react-hooks/exhaustive-deps

  // Push local changes to Supabase while live
  useEffect(() => {
    if (!live.isLive || !live.presentationId) return
    if (step !== 'editor' || blocks.length === 0) return
    live.syncState(blocks, overrides)
  }, [blocks, overrides, step]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const id = blocks[activeIdx]?.id
    if (!id) return
    const scroller = previewScrollElRef.current
    if (scroller && virtualSlideRowHeight > 0 && blockOffsets.length > activeIdx) {
      const itemTop = blockOffsets[activeIdx]
      const itemH = blockDisplayHeights[activeIdx] ?? virtualSlideRowHeight
      const itemBottom = itemTop + itemH - (activeIdx === blocks.length - 1 ? virtualSlideGapHeight : 0)
      const visibleTop = scroller.scrollTop
      const visibleBottom = visibleTop + scroller.clientHeight
      if (itemTop < visibleTop) {
        scroller.scrollTo({ top: Math.max(0, itemTop - 10), behavior: 'smooth' })
      } else if (itemBottom > visibleBottom) {
        scroller.scrollTo({ top: Math.max(0, itemBottom - scroller.clientHeight + 10), behavior: 'smooth' })
      }
    }
    cardRefs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [activeIdx, blocks, virtualSlideRowHeight, blockOffsets, blockDisplayHeights])

  useEffect(() => {
    if (!exportOpen) return
    const handler = (e: MouseEvent) => {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) setExportOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [exportOpen])

  useEffect(() => {
    if (!slideTypeMenuOpen) return
    const handler = () => setSlideTypeMenuOpen(null)
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [slideTypeMenuOpen])

  // ── Image drag ────────────────────────────────────────────────────────
  useEffect(() => {
    function onMove(e: MouseEvent) {
      const drag = dragImageRef.current
      if (!drag) return
      if (drag.rafId) return
      const capturedX = e.clientX
      const capturedY = e.clientY
      drag.rafId = requestAnimationFrame(() => {
        const d = dragImageRef.current
        if (!d) return
        d.rafId = null
        const scaleX = 1920 / (templateData?.slideWidth || 1920)
        const scaleY = 1080 / (templateData?.slideHeight || 1080)
        const b = blocksRef.current.find((bl) => bl.id === d.blockId)
        const layout = b ? templateData?.layouts.find((l) => l.name === b.type) : undefined
        if (!layout || !b) return
        const actualCardW = Math.max(0, previewWidth - 40)
        if (!actualCardW) return

        // Per-slot geometry: slot 0 uses the block's fit/scale; carousel slots
        // (>0) use their own frame override and their own fit/scale.
        // For multi-slot layouts React always passes slotOverride (including slot 0),
        // so the drag handler must do the same — otherwise localX/frameW diverge and
        // the right boundary (maxX) is computed against the wrong coordinate system.
        const si = d.slotIndex
        const isMultiSlot = (layout.imageFrames?.length ?? 0) > 1
        const slotOverride = isMultiSlot ? layout.imageFrames?.[si] : undefined
        const slotFit   = si === 0 ? b.imageFit   : (b.imageSlots?.[si]?.fit ?? 'fill')
        const slotScale = si === 0 ? b.imageScale : (b.imageSlots?.[si]?.scale ?? 1)
        const slotAlign = si === 0 ? b.imageAlign : undefined

        // Cache frameW/frameH on first frame — they don't change during drag.
        // Also sync currentOffset to the actual rendered position to prevent a jump:
        // when imageAlign is active (no explicit offset), the rendered position differs from 0.
        if (!d.frameW || !d.frameH) {
          // On first frame: also try cache in case img.naturalWidth was 0 at mousedown
          if (!d.naturalW || !d.naturalH) {
            const cached = imageNaturalSizeCache.get(d.imgEl.src)
            if (cached) { d.naturalW = cached.w; d.naturalH = cached.h }
          }
          const initOffset = d.hasExplicitOffset
            ? { x: d.currentOffsetX, y: d.currentOffsetY }
            : undefined  // let imageAlign determine position
          const geom0 = getImageRenderGeometry({
            layout, scaleX, scaleY,
            naturalSize: d.naturalW && d.naturalH ? { w: d.naturalW, h: d.naturalH } : null,
            imageScale: slotScale, imageFit: slotFit,
            imageOffset: initOffset,
            imageAlign: slotAlign,
            slotOverride,
          })
          if (!geom0) return
          d.frameW = geom0.frameW
          d.frameH = geom0.frameH
          // Sync to actual rendered offset so the first mousemove delta is correct
          d.currentOffsetX = geom0.offsetX
          d.currentOffsetY = geom0.offsetY
          d.startOffsetX = geom0.offsetX
          d.startOffsetY = geom0.offsetY
        }

        const dx = (capturedX - d.lastX) / actualCardW * 1920 / d.frameW
        const dy = (capturedY - d.lastY) / actualCardW * 1920 / d.frameH
        d.lastX = capturedX
        d.lastY = capturedY

        // Compute new clamped geometry — getImageRenderGeometry clamps internally
        const newGeom = getImageRenderGeometry({
          layout, scaleX, scaleY,
          naturalSize: d.naturalW && d.naturalH ? { w: d.naturalW, h: d.naturalH } : null,
          imageScale: slotScale, imageFit: slotFit,
          imageOffset: { x: d.currentOffsetX + dx, y: d.currentOffsetY + dy },
          slotOverride,
        })
        if (!newGeom) return

        d.currentOffsetX = newGeom.offsetX
        d.currentOffsetY = newGeom.offsetY

        // Write directly to DOM — zero React renders during drag
        const slotData = si > 0 ? b.imageSlots?.[si] : undefined
        const rot = si === 0 ? b.imageRotation ?? 0 : slotData?.rotation ?? 0
        const sX = si === 0 ? (b.imageFlipX ? -1 : 1) : (slotData?.flipX ? -1 : 1)
        const sY = si === 0 ? (b.imageFlipY ? -1 : 1) : (slotData?.flipY ? -1 : 1)
        d.imgEl.style.transform = `translate(${newGeom.imageLeft}px, ${newGeom.imageTop}px) rotate(${rot}deg) scale(${sX}, ${sY})`
      })
    }
    function onUp() {
      const drag = dragImageRef.current
      if (drag) {
        if (drag.rafId) cancelAnimationFrame(drag.rafId)
        document.body.style.cursor = ''
        // Commit final position to React state exactly once
        if (drag.currentOffsetX !== drag.startOffsetX || drag.currentOffsetY !== drag.startOffsetY) {
          const finalX = drag.currentOffsetX
          const finalY = drag.currentOffsetY
          const si = drag.slotIndex
          setBlocks((prev) => prev.map((bl) => {
            if (bl.id !== drag.blockId) return bl
            if (si === 0) {
              return { ...bl, imageOffset: { x: finalX, y: finalY }, imageAlign: undefined, imageFit: 'custom' }
            }
            // Carousel slot: store offset on that slot.
            const slots = [...(bl.imageSlots ?? [])]
            while (slots.length <= si) slots.push({})
            slots[si] = { ...slots[si], offset: { x: finalX, y: finalY }, align: undefined, fit: 'custom' }
            return { ...bl, imageSlots: slots }
          }))
        }
      }
      dragImageRef.current = null
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [templateData, previewWidth])


  // ── File handling ──────────────────────────────────────────────────────
  function validateAndSetFile(f: File) {
    const ext = fileExtension(f.name)
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      setFileError(`Bestandstype niet ondersteund. Gebruik ${ALLOWED_EXTENSIONS.join(', ')}.`)
      return
    }
    // .key bestanden direct openen als project, zonder de wizard
    if (ext === '.key') {
      handleImportKey(f)
      return
    }
    setFileError('')
    setFile(f)
    setMode(PRESENTATION_EXTENSIONS.includes(ext) ? '2' : null)
  }

  // Read Index/*.iwa + Index.zip from a macOS .key directory bundle via the
  // FileSystem Access API (no OS path needed, works with drag-and-drop).
  function readDirEntries(dir: FileSystemDirectoryEntry): Promise<FileSystemEntry[]> {
    return new Promise((resolve, reject) => {
      const reader = dir.createReader()
      const all: FileSystemEntry[] = []
      const next = () => reader.readEntries((batch) => {
        if (batch.length === 0) resolve(all)
        else { all.push(...batch); next() }
      }, reject)
      next()
    })
  }

  function readFileEntry(entry: FileSystemFileEntry): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) =>
      entry.file((f) => f.arrayBuffer().then(resolve, reject), reject)
    )
  }

  async function readKeyPackageFiles(root: FileSystemDirectoryEntry): Promise<Record<string, ArrayBuffer>> {
    const result: Record<string, ArrayBuffer> = {}

    async function walk(dir: FileSystemDirectoryEntry, prefix: string) {
      const entries = await readDirEntries(dir)
      await Promise.all(entries.map(async (e) => {
        const path = prefix ? `${prefix}/${e.name}` : e.name
        if (e.isDirectory) {
          await walk(e as FileSystemDirectoryEntry, path)
        } else if (e.isFile) {
          result[path] = await readFileEntry(e as FileSystemFileEntry)
        }
      }))
    }

    // Only read Index/ and Index.zip — skip Data/ (images) to keep message small
    const topEntries = await readDirEntries(root)
    await Promise.all(topEntries.map(async (e) => {
      if (e.isFile && e.name === 'Index.zip') {
        result['Index.zip'] = await readFileEntry(e as FileSystemFileEntry)
      } else if (e.isDirectory && e.name === 'Index') {
        await walk(e as FileSystemDirectoryEntry, 'Index')
      }
    }))

    return result
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
    const f = e.dataTransfer.files[0]
    if (!f) return

    if (f.name.toLowerCase().endsWith('.key')) {
      const item = e.dataTransfer.items[0]
      const entry = item?.webkitGetAsEntry()

      const handleKeyResult = (result: any) => {
        if (!result?.ok) { setKeyImportError(result?.error ?? 'Keynote openen mislukt.'); return }
        const { clientId, templateData: td, slides } = result
        const mdText = keynoteSlidesToMdText(slides, td)
        const derived = deriveKeynoteSageTagMappings(td)
        const name = projectName ?? f.name.replace(/\.key$/i, '') ?? 'keynote'
        if (supabase) {
          void persistTemplate(supabase, clientId, td)
          void supabase.from('template_mappings').upsert(
            { client_id: clientId, mappings: { _mdToSageTag: derived } },
            { onConflict: 'client_id' },
          )
        }
        setTemplateClientId(clientId)
        setTemplateData(td)
        setSageTagMappings(derived)
        setMdText(mdText)
        setStep('editor')
        // Genereer .ts na afronding — delay voorkomt dat Vite HMR de lopende import onderbreekt
        setTimeout(() => {
          void (window as any).api.generateTemplateTs?.({ templateData: td, name, clientId, sageTagMappings: derived })
        }, 5000)
      }

      if (entry?.isDirectory) {
        // macOS directory bundle — read IWA files via FileSystem Access API
        setKeyImportError('')
        setImportingKey(true)
        setProjectName(f.name.replace(/\.key$/i, ''))
        readKeyPackageFiles(entry as FileSystemDirectoryEntry)
          .then((files) => (window as any).api.importKeyAsProjectFiles(f.name, files))
          .then(handleKeyResult)
          .catch((err: any) => setKeyImportError(err?.message ?? 'Importeren mislukt.'))
          .finally(() => setImportingKey(false))
        return
      }

      if (entry?.isFile) {
        // ZIP-format .key — read bytes directly, no path needed
        setKeyImportError('')
        setImportingKey(true)
        setProjectName(f.name.replace(/\.key$/i, ''))
        f.arrayBuffer()
          .then((buf) => (window as any).api.importKeyAsProjectBuffer(f.name, buf))
          .then(handleKeyResult)
          .catch((err: any) => setKeyImportError(err?.message ?? 'Importeren mislukt.'))
          .finally(() => setImportingKey(false))
        return
      }

      // entry is null (shouldn't happen) — fall back to path/dialog
      handleImportKey(f)
      return
    }

    validateAndSetFile(f)
  }

  function setSlideSelection(ids: Set<string>) {
    selectedSlideIdsRef.current = ids
    setSelectedSlideIds(ids)
  }

  function clearSlideSelection() {
    setSlideSelection(new Set())
    setLastSelectedIdx(null)
  }

  function handleSlideSelect(e: React.MouseEvent, idx: number) {
    const block = blocks[idx]
    if (!block) return
    if (hoverTimer.current) clearTimeout(hoverTimer.current)

    let next = new Set<string>()
    if (e.shiftKey && lastSelectedIdx != null) {
      const start = Math.min(lastSelectedIdx, idx)
      const end = Math.max(lastSelectedIdx, idx)
      next = new Set(selectedSlideIdsRef.current)
      for (let i = start; i <= end; i += 1) {
        if (blocks[i]) next.add(blocks[i].id)
      }
    } else if (e.metaKey || e.ctrlKey) {
      next = new Set(selectedSlideIdsRef.current)
      if (next.has(block.id)) next.delete(block.id)
      else next.add(block.id)
      if (next.size === 0) next.add(block.id)
    } else {
      next.add(block.id)
    }

    setSlideSelection(next)
    setLastSelectedIdx(idx)
    setActiveIdx(idx)
  }

  function startBlankCanvas() {
    const blank = createBlankCanvasAnalysis()
    if (onAnalysisComplete) {
      onAnalysisComplete(blank)
      return
    }
    setTemplateClientId(blank.templateClientId)
    setTemplateData(blank.templateData)
    setSageTagMappings(blank.sageTagMappings)
    setMappings(blank.mappings)
    setBgColors(blank.bgColors)
    setUserTagNames(blank.userTagNames)
    setMdText(blank.mdText)
    const blockId = Math.random().toString(36).slice(2)
    setBlocks([{
      id: blockId,
      type: 'Leeg canvas',
      heading: '',
      body: '',
      fields: { heading: '', body: '' },
    }])
    setOverrides({})
    setActiveIdx(0)
    setSlideSelection(new Set([blockId]))
    setLastSelectedIdx(0)
    setStep('editor')
  }

  function addSlide(afterIdx = activeIdx) {
    const activeBlock = blocks[afterIdx]
    const fallbackLayout = templateData?.layouts[0]?.name ?? 'Leeg canvas'
    const type = activeBlock?.type ?? fallbackLayout
    const layout = templateData?.layouts.find((l) => l.name === type)
    const sageTags = getSageTags(type, templateData, mappings)
    const initialFields: Record<string, string> = {}
    for (const tag of sageTags) {
      initialFields[tag] = tag
    }
    const newBlock: Block = {
      id: Math.random().toString(36).slice(2),
      type,
      heading: '',
      body: '',
      fields: initialFields,
    }
    const insertAt = blocks.length === 0 ? 0 : afterIdx + 1
    setBlocks((prev) => [...prev.slice(0, insertAt), newBlock, ...prev.slice(insertAt)])
    setActiveIdx(insertAt)
    setSlideSelection(new Set([newBlock.id]))
    setLastSelectedIdx(insertAt)
  }

  function handleTextOverflow(blockId: string, role: string, fittingText: string, overflowText: string) {
    const idx = blocks.findIndex((b) => b.id === blockId)
    if (idx === -1) return
    const sourceBlock = blocks[idx]
    const splitAt = new Date().toISOString()
    const newBlockId = Math.random().toString(36).slice(2)
    const existingFlow = sourceBlock.textFlow?.role === role ? sourceBlock.textFlow : undefined
    const flowId = existingFlow?.id ?? `flow-${blockId}-${role}-${Date.now()}`
    const newBlock: Block = {
      id: newBlockId,
      type: sourceBlock.type,
      heading: '',
      body: '',
      fields: { [role]: overflowText },
      overflowWarning: true,
      overflowSource: { role, splitAt },
      textFlow: {
        id: flowId,
        role,
        previousBlockId: blockId,
        nextBlockId: existingFlow?.nextBlockId,
      },
    }
    const insertAt = idx + 1
    setBlocks((prev) => {
      const updated = prev.map((b) =>
        b.id === blockId
          ? {
              ...b,
              fields: { ...b.fields, [role]: fittingText },
              overflowWarning: true,
              overflowSource: { role, splitAt },
              textFlow: {
                id: flowId,
                role,
                previousBlockId: existingFlow?.previousBlockId,
                nextBlockId: newBlockId,
              },
            }
          : b
      )
      return [...updated.slice(0, insertAt), newBlock, ...updated.slice(insertAt)]
    })
    setActiveIdx(insertAt)
    setSlideSelection(new Set([newBlock.id]))
    setLastSelectedIdx(insertAt)
    setTimeout(() => {
      document.querySelector(`[data-slide-preview-wrap="${newBlock.id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }, 80)
  }

  function addTableSlide(afterIdx = activeIdx) {
    const newBlock: Block = {
      id: Math.random().toString(36).slice(2),
      type: '__table__',
      heading: '',
      body: '',
      fields: {},
      tableData: {
        id: Math.random().toString(36).slice(2),
        type: 'table',
        x: 100, y: 150, width: 1720, height: 780,
        z_index: 1, fidelity: 'editable',
        rows: [
          { id: Math.random().toString(36).slice(2), cells: [{ content: '' }, { content: '' }, { content: '' }] },
          { id: Math.random().toString(36).slice(2), cells: [{ content: '' }, { content: '' }, { content: '' }] },
          { id: Math.random().toString(36).slice(2), cells: [{ content: '' }, { content: '' }, { content: '' }] },
        ],
        header_rows: 1,
        col_widths: [33.33, 33.33, 33.34],
      },
    }
    const insertAt = blocks.length === 0 ? 0 : afterIdx + 1
    setBlocks((prev) => [...prev.slice(0, insertAt), newBlock, ...prev.slice(insertAt)])
    setActiveIdx(insertAt)
    setSlideSelection(new Set([newBlock.id]))
    setLastSelectedIdx(insertAt)
  }

  function duplicateSlide(idx = activeIdx) {
    const source = blocks[idx]
    if (!source) return
    const newId = Math.random().toString(36).slice(2)
    const duplicate: Block = {
      ...source,
      id: newId,
      fields: { ...source.fields },
      imageOffset: source.imageOffset ? { ...source.imageOffset } : undefined,
    }
    const insertAt = idx + 1
    setBlocks((prev) => [...prev.slice(0, insertAt), duplicate, ...prev.slice(insertAt)])
    setOverrides((prev) => {
      const sourceOverrides = prev[source.id]
      return sourceOverrides ? { ...prev, [newId]: { ...sourceOverrides } } : prev
    })
    setActiveIdx(insertAt)
    setSlideSelection(new Set([newId]))
    setLastSelectedIdx(insertAt)
  }

  function removeSlide(blockId: string) {
    setBlocks((prev) => {
      const removeIdx = prev.findIndex((block) => block.id === blockId)
      const next = prev.filter((block) => block.id !== blockId)
      setActiveIdx((current) => {
        if (next.length === 0) return 0
        if (current > removeIdx) return current - 1
        if (current === removeIdx) return Math.min(removeIdx, next.length - 1)
        return Math.min(current, next.length - 1)
      })
      return next
    })
    setSlideTypeMenuOpen(null)
    setSlideSelection(new Set([...selectedSlideIdsRef.current].filter((id) => id !== blockId)))
    setOverrides((prev) => {
      if (!prev[blockId]) return prev
      const next = { ...prev }
      delete next[blockId]
      return next
    })
  }

  function toggleHideSlide(blockId: string) {
    setBlocks((prev) => prev.map((b) => b.id === blockId ? { ...b, hidden: !b.hidden } : b))
  }

  function removeSelectedSlides() {
    const selected = selectedSlideIdsRef.current
    const fallbackId = blocks[activeIdx]?.id
    const ids = selected.size > 0 ? new Set(selected) : fallbackId ? new Set([fallbackId]) : new Set<string>()
    if (ids.size === 0) return

    setBlocks((prev) => {
      const firstRemovedIdx = prev.findIndex((block) => ids.has(block.id))
      const activeId = prev[activeIdx]?.id
      const next = prev.filter((block) => !ids.has(block.id))
      setActiveIdx(() => {
        if (next.length === 0) return 0
        if (activeId && !ids.has(activeId)) {
          const nextActiveIdx = next.findIndex((block) => block.id === activeId)
          if (nextActiveIdx >= 0) return nextActiveIdx
        }
        return Math.min(Math.max(firstRemovedIdx, 0), next.length - 1)
      })
      return next
    })
    setSlideTypeMenuOpen(null)
    clearSlideSelection()
    setOverrides((prev) => {
      const next = { ...prev }
      let changed = false
      ids.forEach((id) => {
        if (next[id]) {
          delete next[id]
          changed = true
        }
      })
      return changed ? next : prev
    })
  }

  function moveSlide(dragId: string, targetId: string) {
    if (dragId === targetId) return
    setBlocks((prev) => {
      const selected = selectedSlideIdsRef.current
      const movingIds = selected.has(dragId) && selected.size > 1 ? new Set(selected) : new Set([dragId])
      if (movingIds.has(targetId)) return prev
      const firstMovingIdx = prev.findIndex((block) => movingIds.has(block.id))
      const targetIdx = prev.findIndex((block) => block.id === targetId)
      if (firstMovingIdx < 0 || targetIdx < 0) return prev
      const activeId = prev[activeIdx]?.id
      const moving = prev.filter((block) => movingIds.has(block.id))
      const rest = prev.filter((block) => !movingIds.has(block.id))
      const movingBeforeTarget = prev.slice(0, targetIdx).filter((block) => movingIds.has(block.id)).length
      let insertAt = targetIdx - movingBeforeTarget
      if (firstMovingIdx < targetIdx) insertAt += 1
      insertAt = Math.max(0, Math.min(insertAt, rest.length))
      const next = [...rest.slice(0, insertAt), ...moving, ...rest.slice(insertAt)]
      if (activeId) {
        const nextActiveIdx = next.findIndex((block) => block.id === activeId)
        if (nextActiveIdx >= 0) setActiveIdx(nextActiveIdx)
      }
      return next
    })
  }

  function changeSlideType(blockId: string, type: string) {
    const layout = templateData?.layouts.find((l) => l.name === type)
    const sageTags = getSageTags(type, templateData, mappings)
    setBlocks((prev) => prev.map((block) => {
      if (block.id !== blockId) return block
      // Keep all existing content so switching back restores it, but only ADD sage-tagged slots
      const newFields: Record<string, string> = { ...block.fields }
      for (const tag of sageTags) {
        if (!newFields[tag]) {
          newFields[tag] = tag
        }
      }
      return { ...block, type, fields: newFields }
    }))
    setSlideTypeMenuOpen(null)
  }

  // Load a template's data + mappings for a client id. Pure (no setState) so it
  // can be reused by both the owner's changeTheme and a viewer's remote handler.
  async function loadThemeData(
    clientId: string,
  ): Promise<{ td: TemplateData; raw: any } | null> {
    if (isHtmlTemplateClientId(clientId)) {
      const htmlTemplate = getHtmlPresentationTemplate(htmlTemplateIdFromClientId(clientId))
      if (!htmlTemplate) return null
      const td = htmlTemplateToTemplateData(htmlTemplate)
      return td.layouts.length > 0 ? { td, raw: {} } : null
    }
    if (!supabase) return null
    const [tRes, mRes, localRes] = await Promise.all([
      supabase.from('templates').select('template_data').eq('client_id', clientId).maybeSingle(),
      supabase.from('template_mappings').select('mappings').eq('client_id', clientId).maybeSingle(),
      (window as any).api?.getLocalTemplateData?.(clientId),
    ])
    const rawTd = localRes?.ok ? localRes.templateData : tRes.data?.template_data
    const td = rawTd ? await resolveTemplateData(supabase, rawTd) : null
    if (!td) return null
    return { td, raw: (mRes.data?.mappings as any) ?? {} }
  }

  async function changeTheme(nextTemplateClientId: string) {
    if (!nextTemplateClientId || nextTemplateClientId === templateClientId) return
    setExportError('')
    try {
      const loaded = await loadThemeData(nextTemplateClientId)
      if (!loaded) {
        setExportError('Template laden mislukt.')
        return
      }
      const { td, raw } = loaded
      const layoutNames = new Set(td.layouts.map((layout) => layout.name))
      const fallbackLayout = td.layouts[0]?.name ?? 'Leeg canvas'
      setTemplateClientId(nextTemplateClientId)
      setTemplateData(td)
      setSageTagMappings(raw['_mdToSageTag'] ?? {})
      setMappings(buildMappings(raw, td))
      setBgColors(raw['_bgColors'] ?? {})
      setLayoutCorrections(raw['_visualCorrections'] ?? {})
      setUserTagNames(raw['_userSageTags'] ?? {})
      const nextBlocks = blocks.map((block) => layoutNames.has(block.type) ? block : { ...block, type: fallbackLayout })
      setBlocks(nextBlocks)
      setSlideTypeMenuOpen(null)
      // Push the theme to any connected live viewers so they update in real time.
      live.syncTheme(nextTemplateClientId)
      void persistThemeChange(nextTemplateClientId, nextBlocks, td, raw)
    } catch (err: any) {
      setExportError(err.message ?? 'Template laden mislukt.')
    }
  }

  async function persistThemeChange(
    nextTemplateClientId: string,
    nextBlocks: Block[],
    nextTemplateData: TemplateData,
    nextRawMappings: any,
  ) {
    const projectData = buildProjectData(undefined, undefined, {}, {
      templateClientId: nextTemplateClientId,
      blocks: nextBlocks,
    })
    const snapshot = JSON.stringify({
      templateClientId: nextTemplateClientId,
      mdText,
      blocks: nextBlocks,
      overrides,
      projectName,
      supabasePresentationId,
      slideComments,
    })

    setAutoSaveStatus('saving')
    try {
      if (projectPath) {
        const result = await (window as any).api.saveProject(projectData, projectPath)
        if (!result.ok) throw new Error(result.error ?? 'Thema opslaan mislukt')
        void refreshSavedPresentations()
      } else {
        await setAutoSaveDraft(projectData)
      }

      const remoteId = live.presentationId ?? supabasePresentationId
      if (supabase && remoteId && (!live.isLive || live.isOwner)) {
        const nextMappings = buildMappings(nextRawMappings, nextTemplateData)
        const nextBgColors = nextRawMappings['_bgColors'] ?? {}
        const nextSageTagMappings = nextRawMappings['_mdToSageTag'] ?? {}
        const webLayouts = buildWebLayouts(nextBlocks, nextTemplateData, nextBgColors, nextMappings, nextSageTagMappings)
        const { error } = await supabase
          .from('presentations')
          .update({
            template_client_id: nextTemplateClientId,
            blocks: nextBlocks,
            overrides,
            md_text: mdText,
            web_layouts: webLayouts,
          })
          .eq('id', remoteId)
        if (error) throw error
      }

      lastAutoSaveRef.current = snapshot
      setAutoSaveStatus('saved')
    } catch (err: any) {
      setAutoSaveStatus('error')
      setExportError(err.message ?? 'Thema opslaan mislukt.')
        ; (window as any).api?.debugLog?.('[themeChange] opslaan mislukt:', err?.message ?? err)
    }
  }

  // ── Keynote direct openen ─────────────────────────────────────────────
  async function openKeyFileDialog() {
    setKeyImportError('')
    setImportingKey(true)
    try {
      const dialogResult = await (window as any).api.dialog.openKeyFile()
      if (!dialogResult?.ok || !dialogResult.filePath) {
        setImportingKey(false)
        return
      }
      await runKeyImport(dialogResult.filePath)
    } catch (err: any) {
      setKeyImportError(err?.message ?? 'Importeren mislukt.')
      setImportingKey(false)
    }
  }

  async function runKeyImport(filePath: string) {
    try {
      const result = await (window as any).api.importKeyAsProject(filePath)
      if (!result?.ok) {
        setKeyImportError(result?.error ?? 'Keynote openen mislukt.')
        return
      }
      const { clientId, templateData: td, slides } = result
      const mdText = keynoteSlidesToMdText(slides, td)
      const derived = deriveKeynoteSageTagMappings(td)
      const name = projectName ?? result.fileName?.replace(/\.key$/i, '') ?? 'keynote'
      if (supabase) {
        await persistTemplate(supabase, clientId, td)
        void supabase.from('template_mappings').upsert(
          { client_id: clientId, mappings: { _mdToSageTag: derived } },
          { onConflict: 'client_id' },
        )
      }
      void (window as any).api.generateTemplateTs?.({ templateData: td, name, clientId, sageTagMappings: derived })
      setTemplateClientId(clientId)
      setTemplateData(td)
      setSageTagMappings(derived)
      setMdText(mdText)
      setStep('editor')
    } catch (err: any) {
      setKeyImportError(err?.message ?? 'Importeren mislukt.')
    } finally {
      setImportingKey(false)
    }
  }

  async function handleImportKey(f: File) {
    // macOS .key packages can't be read as bytes via drag-drop File API.
    // Try f.path (works from file-input); otherwise open the native dialog.
    const filePath = (f as any).path as string | undefined
    if (filePath) {
      setKeyImportError('')
      setImportingKey(true)
      // Set project name from file before going async
      setProjectName(f.name.replace(/\.key$/i, ''))
      await runKeyImport(filePath)
      return
    }
    // No path available — open native dialog (handles macOS packages correctly)
    setProjectName(f.name.replace(/\.key$/i, ''))
    await openKeyFileDialog()
  }

  // Separate entry point for the "Open Keynote" button (no File object available)
  // ── Analyseer ─────────────────────────────────────────────────────────
  async function handleAnalyse() {
    if (!file || !templateClientId) return
    setAnalysing(true)
    setAnalyseError('')

    try {
      const presentationInput = isPresentationFile(file)
      const ocrInput = IMAGE_EXTENSIONS.includes(fileExtension(file.name))
      const effectiveTextMode = !presentationInput && !ocrInput ? (textMode ?? 'ai') : textMode
      const effectiveImageMode = !ocrInput ? (imageMode ?? 'manual') : imageMode
      const htmlTemplateSelected = isHtmlTemplateClientId(templateClientId)

      let td: TemplateData
      let raw: any = {}
      let mdm: Record<string, Record<string, string>> = {}

      if (htmlTemplateSelected) {
        const htmlTemplate = getHtmlPresentationTemplate(htmlTemplateIdFromClientId(templateClientId))
        if (!htmlTemplate) {
          setAnalyseError('HTML-template niet gevonden.')
          return
        }
        td = htmlTemplateToTemplateData(htmlTemplate)
        if (td.layouts.length === 0) {
          setAnalyseError('HTML-template heeft geen layouts. Voeg data-huphe-layout toe aan minimaal één section.')
          return
        }
      } else {
        if (!supabase) return
        // Load template + mappings using the selected template (may differ from output client)
        const [tRes, mRes, localResMd] = await Promise.all([
          supabase.from('templates').select('template_data').eq('client_id', templateClientId).maybeSingle(),
          supabase.from('template_mappings').select('mappings').eq('client_id', templateClientId).maybeSingle(),
          (window as any).api?.getLocalTemplateData?.(templateClientId),
        ])

        const tdRaw = localResMd?.ok ? localResMd.templateData : tRes.data?.template_data
        if (!tdRaw) {
          setAnalyseError('Geen template gevonden voor deze klant. Upload eerst een template via Instellingen.')
          return
        }
        td = tdRaw as TemplateData
        raw = (mRes.data?.mappings as any) ?? {}
        mdm = raw['_mdToSageTag'] ?? {}
      }

      setTemplateData(td)

      // Auto-derive sageTag mappings
      const derived: Record<string, Record<string, string>> = {}
      for (const layout of td.layouts) {
        if (!derived[layout.name]) derived[layout.name] = {}
        for (const item of layout.textItems) {
          if (item.source === 'sageTag' && item.role) {
            derived[layout.name][item.role] = item.role
          }
        }
      }

      const userSageTags: Record<string, Record<string, string>> = raw['_userSageTags'] ?? {}
      const genUserTagNames: Record<string, Record<string, string>> = {}
      for (const [layoutName, idxToName] of Object.entries(userSageTags)) {
        const layout = td.layouts.find((l) => l.name === layoutName)
        if (!layout) continue
        if (!derived[layoutName]) derived[layoutName] = {}
        for (const [idxStr, userName] of Object.entries(idxToName as Record<string, string>)) {
          if (!userName?.trim()) continue
          const item = layout.textItems[Number(idxStr)]
          if (!item) continue
          if (item.source === 'placeholder') {
            if (derived[layoutName][userName] === undefined)
              derived[layoutName][userName] = item.role
          } else if (item.source === 'sageTag' && !item.role) {
            if (derived[layoutName][userName] === undefined)
              derived[layoutName][userName] = userName
            if (!genUserTagNames[layoutName]) genUserTagNames[layoutName] = {}
            genUserTagNames[layoutName][idxStr] = userName
          }
        }
      }
      setUserTagNames(genUserTagNames)

      let changed = false
      const merged: Record<string, Record<string, string>> = {}
      for (const ln of Object.keys({ ...mdm, ...derived })) {
        merged[ln] = { ...(mdm[ln] ?? {}) }
        for (const [mdLabel, sageTag] of Object.entries(derived[ln] ?? {})) {
          if (merged[ln][mdLabel] === undefined) { merged[ln][mdLabel] = sageTag; changed = true }
        }
      }
      if (changed && supabase && !htmlTemplateSelected) {
        await supabase.from('template_mappings').upsert(
          { client_id: templateClientId, mappings: { ...raw, _mdToSageTag: merged } },
          { onConflict: 'client_id' },
        )
        mdm = merged
      }

      setSageTagMappings(mdm)
      setBgColors(raw['_bgColors'] ?? {})
      setLayoutCorrections(raw['_visualCorrections'] ?? {})
      const m = buildMappings(raw, td)
      setMappings(m)

      // ── Image OCR path ────────────────────────────────────────────────
      if (ocrInput) {
        const backgroundImage = URL.createObjectURL(file)
        const buf = await file.arrayBuffer()
        const bytes = new Uint8Array(buf)
        let binary = ''
        for (let i = 0; i < bytes.length; i += 0x8000) {
          binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
        }
        const base64 = btoa(binary)
        const { data: ocrData, error: ocrError } = await supabase.functions.invoke('pdf-ocr', {
          body: { fileBase64: base64, mimeType: file.type },
        })
        if (ocrError || ocrData?.error) {
          URL.revokeObjectURL(backgroundImage)
          setAnalyseError(ocrData?.error ?? ocrError?.message ?? 'OCR mislukt.')
          return
        }
        setPendingOcrContext({ td, backgroundImage })
        setOcrElements(ocrData.elements ?? [])
        setShowOcrReview(true)
        return
      }

      let mdText = ''
      if (presentationInput) {
        const buffer = await file.arrayBuffer()
        const result = await (window as any).api.importPresentation(file.name, buffer)
        if (!result?.ok) {
          setAnalyseError(result?.error ?? 'Presentatie importeren mislukt.')
          return
        }
        mdText = presentationSlidesToMdText(result.slides ?? [], td)
        const importedSlides = (result.slides ?? []) as Array<{ title: string; body: string; layoutName?: string }>
        const templateLayoutNames = new Set(td.layouts.map((l) => l.name))
        const matchedLayouts = importedSlides.filter((s) => s.layoutName && templateLayoutNames.has(s.layoutName)).length
        const unmatched = importedSlides.length - matchedLayouts
        const unknownLayoutNames = [...new Set(
          importedSlides.filter((s) => s.layoutName && !templateLayoutNames.has(s.layoutName)).map((s) => s.layoutName!)
        )]
        const fallbackLayout = td.layouts[0]?.name ?? 'onbekend'
        const bannerWarnings: { type: 'layout_mismatch'; message: string }[] = []
        if (unmatched > 0) {
          const names = unknownLayoutNames.map((n) => `"${n}"`).join(', ')
          bannerWarnings.push({ type: 'layout_mismatch', message: `${unmatched} slide${unmatched !== 1 ? 's' : ''} had${unmatched !== 1 ? 'den' : ''} een onbekende layout${unknownLayoutNames.length > 0 ? ` (${names})` : ''} → fallback naar "${fallbackLayout}".` })
        }
        setImportBanner({ slideCount: importedSlides.length, layoutsMatched: matchedLayouts, layoutsTotal: importedSlides.length, warnings: bannerWarnings })
          // Run IR import in background to show fidelity report (non-blocking)
          ; (async () => {
            try {
              const buf2 = await file.arrayBuffer()
              const irResult = await (window as any).api.importPresentationIr?.({ fileName: file.name, buffer: buf2 })
              if (irResult?.ok && irResult.fidelityItems?.length > 0) {
                setFidelityItems(irResult.fidelityItems)
                setShowFidelityReport(true)
              }
            } catch { }
          })()
      } else {
        const rawText = await file.text()

        // AI-tekst pad: laat AI de ruwe tekst omzetten, toon daarna de A4 review stap
        if (effectiveTextMode === 'ai') {
          let cleanText = rawText
          if (file.name.toLowerCase().endsWith('.docx')) {
            const buf = await file.arrayBuffer()
            const extracted = await (window as any).api?.extractDocText({ fileName: file.name, buffer: buf })
            if (!extracted?.ok) { setAnalyseError(extracted?.error ?? 'Kon de Word-tekst niet uitlezen.'); return }
            cleanText = extracted.text
          }
          const layoutsInfo = td.layouts.map((l) => ({
            name: l.name,
            hasHeading: l.textItems.some((i) => /heading/i.test(i.role ?? '')),
            hasBody: l.textItems.some((i) => /body|bodycopy/i.test(i.role ?? '')),
            fieldNames: l.textItems.filter((i) => i.source === 'sageTag' && i.role && !/heading|body|bodycopy/i.test(i.role)).map((i) => i.role!),
          }))
          const aiResult = await (window as any).api?.transformTextToSlides(cleanText, layoutsInfo)
          if (!aiResult?.ok) { setAnalyseError(aiResult?.error ?? 'AI tekst verwerking mislukt.'); return }
          const parsed = parseBlocks(aiResult.mdText as string)
          let counter = 0
          const roleSet = new Set<string>()
          const segments: import('../components/TextReviewModal').TextSegment[] = []
          for (const block of parsed) {
            const blockWithId: Block = { ...block, id: `_tmp_${counter}` }
            const sageTags = getSageTags(block.type, td, m)
            segments.push({ id: `seg-${counter++}`, text: block.type, role: '__layout__', source: 'auto' })
            if (block.heading) {
              const tag = autoResolveTag('heading', blockWithId, {}, mdm, sageTags) ?? 'heading'
              segments.push({ id: `seg-${counter++}`, text: block.heading, role: tag, source: 'auto', _originalKey: tag !== 'heading' ? 'heading' : undefined })
              roleSet.add(tag)
            }
            if (block.body) {
              const tag = autoResolveTag('body', blockWithId, {}, mdm, sageTags) ?? 'body'
              segments.push({ id: `seg-${counter++}`, text: block.body, role: tag, source: 'auto', _originalKey: tag !== 'body' ? 'body' : undefined })
              roleSet.add(tag)
            }
            for (const [key, value] of Object.entries(block.fields)) {
              if (value.trim()) {
                const tag = autoResolveTag(key, blockWithId, {}, mdm, sageTags) ?? key
                segments.push({ id: `seg-${counter++}`, text: value, role: tag, source: 'auto', _originalKey: tag !== key ? key : undefined })
                roleSet.add(tag)
              }
            }
          }
          const allSageTagsAi = [...new Set(td.layouts.flatMap((l) => getSageTags(l.name, td, m)))]
          const rolesAi = allSageTagsAi.length > 0 ? allSageTagsAi : [...roleSet, 'heading', 'body']
          if (segments.length === 0) {
            const defaultLayout = td.layouts[0]?.name ?? 'Content'
            const lines = (aiResult.mdText as string).split('\n').filter((l: string) => l.trim())
            let idx = 0; let hasLayout = false
            for (const line of lines) {
              if (/^\[.+\]$/.test(line.trim())) {
                segments.push({ id: `seg-${idx++}`, text: line.trim().slice(1, -1), role: '__layout__', source: 'auto' })
                hasLayout = true
              } else if (line.trim()) {
                if (!hasLayout) { segments.push({ id: `seg-${idx++}`, text: defaultLayout, role: '__layout__', source: 'auto' }); hasLayout = true }
                segments.push({ id: `seg-${idx++}`, text: line.trim(), role: 'heading', source: 'auto' })
                hasLayout = false
              }
            }
          }
          const rfAi = new Map<string, number>()
          for (const layout of td.layouts) for (const item of layout.textItems) if (item.source === 'sageTag' && item.role && item.fontSize) rfAi.set(item.role, Math.max(rfAi.get(item.role) ?? 0, item.fontSize))
          const mfAi = Math.max(...rfAi.values(), 0)
          const headingRolesAi = new Set([...rfAi.entries()].filter(([, s]) => s >= Math.max(36, mfAi * 0.5)).map(([r]) => r))
          setTextReviewHeadingRoles(headingRolesAi)
          setTextReviewRoles(rolesAi)
          setTextReviewSegments(segments)
          setPendingAnalysis({ td, mdm, m, bgColorsData: raw['_bgColors'] ?? {}, genUserTagNames })
          setShowTextReview(true)
          return
        } else {
          // Text-review stap: altijd de A4 labelmodal tonen voor tekstbestanden
          const reviewEnabled = localStorage.getItem('huphe:reviewTextDocs')
          const showReviewStep = reviewEnabled === null ? true : reviewEnabled === 'true'
          if (showReviewStep) {
            const alreadyStructured = /^\[.+\]$/m.test(rawText)
            let segments: import('../components/TextReviewModal').TextSegment[]
            let roles: string[]
            if (alreadyStructured) {
              const parsed = parseBlocks(rawText)
              let counter = 0
              const roleSet = new Set<string>()
              segments = []
              for (const block of parsed) {
                const blockWithId: Block = { ...block, id: `_tmp_${counter}` }
                const sageTags = getSageTags(block.type, td, m)
                segments.push({ id: `seg-${counter++}`, text: block.type, role: '__layout__', source: 'auto' })
                if (block.heading) { const tag = autoResolveTag('heading', blockWithId, {}, mdm, sageTags) ?? 'heading'; segments.push({ id: `seg-${counter++}`, text: block.heading, role: tag, source: 'auto', _originalKey: tag !== 'heading' ? 'heading' : undefined }); roleSet.add(tag) }
                if (block.body) { const tag = autoResolveTag('body', blockWithId, {}, mdm, sageTags) ?? 'body'; segments.push({ id: `seg-${counter++}`, text: block.body, role: tag, source: 'auto', _originalKey: tag !== 'body' ? 'body' : undefined }); roleSet.add(tag) }
                for (const [key, value] of Object.entries(block.fields)) { if (value.trim()) { const tag = autoResolveTag(key, blockWithId, {}, mdm, sageTags) ?? key; segments.push({ id: `seg-${counter++}`, text: value, role: tag, source: 'auto', _originalKey: tag !== key ? key : undefined }); roleSet.add(tag) } }
              }
              const allSageTags = [...new Set(td.layouts.flatMap((l) => getSageTags(l.name, td, m)))]
              roles = allSageTags.length > 0 ? allSageTags : [...roleSet]
            } else {
              const fileType = detectFileType(file.name)
              const parsed = fileType === 'markdown' ? parseMarkdownToSegments(rawText) : parsePlainTextToSegments(rawText)
              const defaultRoles = ['Heading', 'Subheading', 'Bodycopy', 'Klantnaam', 'Datum']
              const extractedRoles = [...new Set(td.layouts.flatMap((l) => l.textItems.filter((i) => i.source === 'sageTag' && i.role).map((i) => i.role!)))]
              roles = extractedRoles.length > 0 ? extractedRoles : defaultRoles
              const defaultLayout = td.layouts[0]?.name ?? ''
              let layoutCounter = 0
              segments = []
              for (const seg of parsed) {
                if (seg.role === 'Heading' || (segments.length === 0 && seg.role !== '__layout__')) segments.push({ id: `seg-layout-${layoutCounter++}`, text: '', role: '__layout__', source: 'auto' })
                segments.push(seg)
              }
            }
            const roleFontSizes = new Map<string, number>()
            for (const layout of td.layouts) for (const item of layout.textItems) if (item.source === 'sageTag' && item.role && item.fontSize) roleFontSizes.set(item.role, Math.max(roleFontSizes.get(item.role) ?? 0, item.fontSize))
            const maxFontSize = Math.max(...roleFontSizes.values(), 0)
            const headingRoles = new Set([...roleFontSizes.entries()].filter(([, s]) => s >= Math.max(36, maxFontSize * 0.5)).map(([r]) => r))
            setTextReviewHeadingRoles(headingRoles)
            setTextReviewRoles(roles)
            setTextReviewSegments(segments)
            setPendingAnalysis({ td, mdm, m, bgColorsData: raw['_bgColors'] ?? {}, genUserTagNames })
            setShowTextReview(true)
            return
          }
          mdText = rawText
        } // end else (textMode !== 'ai')
      } // end else (not presentationInput)

      if (onAnalysisComplete) {
        onAnalysisComplete({
          templateClientId,
          mdText,
          templateData: td,
          sageTagMappings: mdm,
          mappings: m,
          bgColors: raw['_bgColors'] ?? {},
          userTagNames: genUserTagNames,
          textMode: effectiveTextMode ?? undefined,
          imageMode: effectiveImageMode ?? undefined,
        })
      } else {
        setMdText(mdText)
        setStep('editor')
      }
    } catch (err: any) {
      setAnalyseError(err?.message ?? 'Er is een fout opgetreden.')
    } finally {
      setAnalysing(false)
    }
  }

  // ── OCR review confirm ────────────────────────────────────────────────
  function handleOcrConfirm(confirmed: OcrElement[]) {
    if (!pendingOcrContext) return
    const { backgroundImage } = pendingOcrContext
    URL.revokeObjectURL(backgroundImage)
    setShowOcrReview(false)
    setPendingOcrContext(null)
    setOcrElements([])

    const isHeadingRole = (role: string | null) =>
      !!role && ['heading', 'title', 'titel', 'kop'].includes(role.toLowerCase())
    const isBodyRole = (role: string | null) =>
      !!role && ['body', 'tekst', 'text', 'content', 'hoofdtekst'].includes(role.toLowerCase())

    const sorted = [...confirmed].sort((a, b) => a.y !== b.y ? a.y - b.y : a.x - b.x)
    const headingEl = sorted.find(e => isHeadingRole(e.role))
    const bodyEls = sorted.filter(e => isBodyRole(e.role) && e.text.trim())
    const otherEls = sorted.filter(e => e.role !== null && !isHeadingRole(e.role) && !isBodyRole(e.role) && e.text.trim())

    const headingText = headingEl?.text.trim() ?? ''
    const bodyText = [...bodyEls, ...otherEls].map(e => e.text.trim()).join('\n')
    const mdText = headingText ? `# ${headingText}\n${bodyText}` : bodyText

    setMdText(mdText)
    setStep('editor')
  }

  // ── Text-review confirm ────────────────────────────────────────────────
  function handleTextReviewConfirm(labeled: TextSegment[]) {
    const pa = pendingAnalysis
    setShowTextReview(false)
    setPendingAnalysis(null)

    const hasLayoutMarkers = labeled.some((s) => s.role === '__layout__')
    let newBlocks: Block[]
    let generatedMdText: string

    if (hasLayoutMarkers) {
      // Gestructureerd formaat: segments → [Layout Name] mdText → parseBlocks
      const lines: string[] = []
      for (const seg of labeled) {
        if (seg.role === '__layout__') {
          if (lines.length > 0) lines.push('')
          const layoutName = seg.text.trim() || pa?.td.layouts[0]?.name || 'Content'
          lines.push(`[${layoutName}]`)
        } else if (seg.role && seg.text.trim()) {
          // Map display roles → parseBlocks-compatible lowercase keys
          const ROLE_TO_MD_KEY: Record<string, string> = { Heading: 'heading', Bodycopy: 'body', Subheading: 'body' }
          const outputKey = seg._originalKey ?? ROLE_TO_MD_KEY[seg.role] ?? seg.role
          lines.push(`${outputKey}: ${seg.text}`)
        }
      }
      generatedMdText = lines.join('\n')
      newBlocks = parseBlocks(generatedMdText).map((b, i) => ({ ...b, id: `block-${i}` }))
    } else {
      // Ongestructureerde tekst: groepeer op Heading-segmenten
      const defaultLayout = pa?.td.layouts[0]?.name ?? 'Content'
      newBlocks = []
      let current: Omit<Block, 'id'> | null = null
      for (const seg of labeled) {
        if (!seg.role) continue
        if (seg.role === 'Heading') {
          if (current) newBlocks.push({ ...current, id: `block-${newBlocks.length}` })
          current = { type: defaultLayout, heading: seg.text, body: '', fields: {} }
        } else if (seg.role === 'Bodycopy' || seg.role === 'Subheading') {
          if (!current) current = { type: defaultLayout, heading: '', body: '', fields: {} }
          current.body = current.body ? `${current.body}\n\n${seg.text}` : seg.text
        } else {
          if (!current) current = { type: defaultLayout, heading: '', body: '', fields: {} }
          current.fields[seg.role] = seg.text
        }
      }
      if (current) newBlocks.push({ ...current, id: `block-${newBlocks.length}` })
      generatedMdText = newBlocks
        .map((b) => [`[${b.type}]`, b.heading, b.body].filter(Boolean).join('\n'))
        .join('\n\n')
    }

    if (newBlocks.length === 0) {
      setAnalyseError('Geen bruikbare blokken gevonden. Voeg minimaal één Heading of pagina toe.')
      setAnalysing(false)
      return
    }

    if (onAnalysisComplete && pa) {
      onAnalysisComplete({
        templateClientId,
        mdText: generatedMdText,
        templateData: pa.td,
        sageTagMappings: pa.mdm,
        mappings: pa.m,
        bgColors: pa.bgColorsData,
        userTagNames: pa.genUserTagNames,
        textMode: textMode ?? undefined,
        imageMode: imageMode ?? undefined,
      })
    } else {
      setMdText(generatedMdText)
      setBlocks(newBlocks)
      setActiveIdx(0)
      setSlideSelection(new Set([newBlocks[0].id]))
      setLastSelectedIdx(0)
      setStep('editor')
    }
    setAnalysing(false)
  }

  // ── Editor helpers ─────────────────────────────────────────────────────
  function updateContent(blockId: string, internalKey: string, value: string) {
    setBlocks((prev) =>
      prev.map((b) => {
        if (b.id !== blockId) return b
        if (internalKey === '__heading') return removeDynamicDateKeys({ ...b, heading: value }, ['__heading', 'heading'])
        if (internalKey === '__body') return removeDynamicDateKeys({ ...b, body: value }, ['__body', 'body'])
        return removeDynamicDateKeys({ ...b, fields: { ...b.fields, [internalKey]: value } }, [internalKey])
      }),
    )
  }

  function removeDynamicDateKeys(block: Block, keys: string[]): Block {
    const next = (block.dynamicDateFields ?? []).filter((key) => !keys.includes(key))
    return { ...block, dynamicDateFields: next.length ? next : undefined }
  }

  function toggleDynamicDateField(blockId: string, field: { internalKey: string; displayKey: string; tag: string }) {
    if (!isDateFieldRole(field.tag) && !isDateFieldRole(field.displayKey)) return
    setBlocks((prev) => prev.map((b) => {
      if (b.id !== blockId) return b
      const keys = [field.internalKey, field.displayKey, field.tag].filter(Boolean)
      const current = b.dynamicDateFields ?? []
      const enabled = keys.some((key) => current.includes(key))
      if (enabled) return removeDynamicDateKeys(b, keys)

      const dynamicDateFields = Array.from(new Set([...current, field.internalKey, field.displayKey, field.tag]))
      const today = formatDynamicDate()
      if (field.internalKey === '__heading') return { ...b, heading: today, dynamicDateFields }
      if (field.internalKey === '__body') return { ...b, body: today, dynamicDateFields }
      return { ...b, fields: { ...b.fields, [field.internalKey]: today }, dynamicDateFields }
    }))
  }

  function selectSlideLogo(blockId: string, logoUrl: string | null) {
    setBlocks((prev) => prev.map((b) => (
      b.id === blockId ? { ...b, logoUrl: logoUrl || undefined } : b
    )))
  }

  function updateImagePath(blockId: string, imagePath: string, slotIndex: number = 0) {
    setBlocks((prev) => prev.map((b) => {
      if (b.id !== blockId) return b
      if (slotIndex === 0) {
        return { ...b, imagePath, imageFit: b.imageFit ?? 'fill', imageAlign: b.imageAlign ?? 'center' }
      }
      const slots = [...(b.imageSlots ?? [])]
      while (slots.length <= slotIndex) slots.push({})
      slots[slotIndex] = { ...slots[slotIndex], path: imagePath, fit: slots[slotIndex]?.fit ?? 'fill', align: slots[slotIndex]?.align ?? 'center' }
      return { ...b, imageSlots: slots }
    }))
    uploadImageToStorage(blockId, imagePath, slotIndex)
  }

  async function pickImageForBlock(blockId: string, slotIndex: number = 0) {
    const result = await (window as any).api?.pickImage?.()
    if (!result?.ok || !result.filePath) return
    updateImagePath(blockId, result.filePath, slotIndex)
  }

  function toggleLockField(blockId: string, tag: string) {
    setBlocks((prev) => prev.map((b) => {
      if (b.id !== blockId) return b
      const locked = b.lockedFields ?? []
      const next = locked.includes(tag) ? locked.filter(t => t !== tag) : [...locked, tag]
      return { ...b, lockedFields: next.length ? next : undefined }
    }))
  }

  function toggleHiddenField(blockId: string, tag: string) {
    setBlocks((prev) => prev.map((b) => {
      if (b.id !== blockId) return b
      const hidden = b.hiddenFields ?? []
      const next = hidden.includes(tag) ? hidden.filter(t => t !== tag) : [...hidden, tag]
      return { ...b, hiddenFields: next.length ? next : undefined }
    }))
  }

  function linkTextFields(blockId: string, roles: string[]) {
    if (roles.length < 2) return
    const chainId = `chain-${blockId}-${Date.now().toString(36)}`
    setBlocks((prev) => prev.map((b) => {
      if (b.id !== blockId) return b
      // Remove these roles from any existing chains, then add the new chain
      const existing = (b.intraSlideChains ?? []).map(c => ({
        ...c,
        roles: c.roles.filter(r => !roles.includes(r)),
      })).filter(c => c.roles.length >= 2)
      return { ...b, intraSlideChains: [...existing, { id: chainId, roles }] }
    }))
  }

  function unlinkTextField(blockId: string, role: string) {
    setBlocks((prev) => prev.map((b) => {
      if (b.id !== blockId) return b
      const chains = (b.intraSlideChains ?? [])
        .map(c => ({ ...c, roles: c.roles.filter(r => r !== role) }))
        .filter(c => c.roles.length >= 2)
      return { ...b, intraSlideChains: chains.length ? chains : undefined }
    }))
  }

  function removeImage(blockId: string, slotIndex: number = 0) {
    setBlocks((prev) => prev.map((b) => {
      if (b.id !== blockId) return b
      if (slotIndex === 0) {
        return {
          ...b,
          imagePath: undefined,
          imageUrl: undefined,
          imageOffset: undefined,
          imageAlign: undefined,
          imageFit: undefined,
          imageScale: undefined,
          imageRotation: undefined,
          imageFlipX: undefined,
          imageFlipY: undefined,
        }
      }
      const slots = [...(b.imageSlots ?? [])]
      if (slots[slotIndex]) slots[slotIndex] = {}
      return { ...b, imageSlots: slots.some((slot) => slot?.path || slot?.url) ? slots : undefined }
    }))
  }

  function uploadImageToStorage(blockId: string, localPath: string, slotIndex: number = 0) {
    if (!supabase) return
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return
      try {
        const res = await (window as any).api.readFileBuffer(localPath)
        if (!res?.ok || !res.buffer) return
        const ext = localPath.split('.').pop()?.toLowerCase() ?? 'jpg'
        const folder = supabasePresentationId ?? 'local'
        const slotSuffix = slotIndex > 0 ? `_${slotIndex}` : ''
        const storagePath = `${user.id}/${folder}/${blockId}${slotSuffix}.${ext}`
        const { error } = await supabase!.storage
          .from('atelier-assets')
          .upload(storagePath, res.buffer, { upsert: true, contentType: `image/${ext === 'jpg' ? 'jpeg' : ext}` })
        if (error) return
        const { data } = supabase!.storage.from('atelier-assets').getPublicUrl(storagePath)
        if (data?.publicUrl) {
          setBlocks((prev) => prev.map((b) => {
            if (b.id !== blockId) return b
            if (slotIndex === 0) return { ...b, imageUrl: data.publicUrl, imageAlign: b.imageAlign ?? 'center' }
            const slots = [...(b.imageSlots ?? [])]
            while (slots.length <= slotIndex) slots.push({})
            slots[slotIndex] = { ...slots[slotIndex], url: data.publicUrl, fit: slots[slotIndex]?.fit ?? 'fill', align: slots[slotIndex]?.align ?? 'center' }
            return { ...b, imageSlots: slots }
          }))
        }
      } catch { }
    })
  }


  function updateImageAlign(blockId: string, align: 'left' | 'center' | 'right', slotIndex: number = 0) {
    setBlocks((prev) => prev.map((b) => {
      if (b.id !== blockId) return b
      if (slotIndex === 0) return { ...b, imageAlign: align, imageOffset: undefined }
      const slots = [...(b.imageSlots ?? [])]
      while (slots.length <= slotIndex) slots.push({})
      slots[slotIndex] = { ...slots[slotIndex], align, offset: undefined }
      return { ...b, imageSlots: slots }
    }))
  }

  function updateImageFit(blockId: string, fit: ImageFitMode, slotIndex: number = 0) {
    setBlocks((prev) => prev.map((b) => {
      if (b.id !== blockId) return b
      if (slotIndex === 0) {
        if (fit === 'custom') return { ...b, imageFit: 'custom' }
        return { ...b, imageFit: fit, imageScale: 1, imageOffset: undefined, imageAlign: 'center' }
      }
      const slots = [...(b.imageSlots ?? [])]
      while (slots.length <= slotIndex) slots.push({})
      slots[slotIndex] = fit === 'custom'
        ? { ...slots[slotIndex], fit: 'custom' }
        : { ...slots[slotIndex], fit, scale: 1, offset: undefined, align: 'center' }
      return { ...b, imageSlots: slots }
    }))
    setImageScaleInputs((prev) => ({ ...prev, [blockId]: '100' }))
  }

  function updateImageScale(blockId: string, scale: number, slotIndex: number = 0) {
    const nextScale = clampNumber(scale, 1, 3)
    setBlocks((prev) => prev.map((b) => {
      if (b.id !== blockId) return b
      if (slotIndex === 0) return { ...b, imageScale: nextScale, imageFit: 'custom' }
      const slots = [...(b.imageSlots ?? [])]
      while (slots.length <= slotIndex) slots.push({})
      slots[slotIndex] = { ...slots[slotIndex], scale: nextScale, fit: 'custom' }
      return { ...b, imageSlots: slots }
    }))
    setImageScaleInputs((prev) => ({ ...prev, [blockId]: String(Math.round(nextScale * 100)) }))
  }

  function updateImageRotation(blockId: string, rotation: number, slotIndex: number = 0) {
    const nextRotation = Math.round(clampNumber(rotation, -45, 45))
    setBlocks((prev) => prev.map((b) => {
      if (b.id !== blockId) return b
      if (slotIndex === 0) return { ...b, imageRotation: nextRotation }
      const slots = [...(b.imageSlots ?? [])]
      while (slots.length <= slotIndex) slots.push({})
      slots[slotIndex] = { ...slots[slotIndex], rotation: nextRotation }
      return { ...b, imageSlots: slots }
    }))
    setImageRotationInputs((prev) => ({ ...prev, [blockId]: String(nextRotation) }))
  }

  function commitImageScaleInput(blockId: string, fallbackScale: number) {
    const raw = imageScaleInputs[blockId]
    const parsed = raw === undefined || raw.trim() === '' ? NaN : Number(raw)
    const percent = Number.isFinite(parsed) ? clampNumber(parsed, 100, 300) : Math.round(fallbackScale * 100)
    updateImageScale(blockId, percent / 100)
  }

  function commitImageRotationInput(blockId: string, fallbackRotation: number) {
    const raw = imageRotationInputs[blockId]
    const parsed = raw === undefined || raw.trim() === '' ? NaN : Number(raw)
    const rotation = Number.isFinite(parsed) ? clampNumber(parsed, -45, 45) : fallbackRotation
    updateImageRotation(blockId, rotation)
  }

  function toggleImageFlip(blockId: string, axis: 'x' | 'y', slotIndex: number = 0) {
    setBlocks((prev) => prev.map((b) => {
      if (b.id !== blockId) return b
      if (slotIndex > 0) {
        const slots = [...(b.imageSlots ?? [])]
        while (slots.length <= slotIndex) slots.push({})
        slots[slotIndex] = axis === 'x'
          ? { ...slots[slotIndex], flipX: !slots[slotIndex]?.flipX }
          : { ...slots[slotIndex], flipY: !slots[slotIndex]?.flipY }
        return { ...b, imageSlots: slots }
      }
      return axis === 'x'
        ? { ...b, imageFlipX: !b.imageFlipX }
        : { ...b, imageFlipY: !b.imageFlipY }
    }))
  }

  function patchGenState(blockId: string, patch: Partial<{ open: boolean; prompt: string; loading: boolean; error: string }>) {
    setImgGenState((prev) => ({
      ...prev,
      [blockId]: { ...(prev[blockId] ?? { open: false, prompt: '', loading: false, error: '' }), ...patch },
    }))
  }

  function toggleGenPanel(block: Block) {
    setImgGenState((prev) => {
      const cur = prev[block.id]
      if (cur?.open) return { ...prev, [block.id]: { ...cur, open: false } }
      const parts = [block.heading, block.body, ...Object.values(block.fields)].filter(Boolean)
      return { ...prev, [block.id]: { open: true, prompt: cur?.prompt || parts.join(' — '), loading: false, error: '' } }
    })
  }

  async function doGenerateImage(blockId: string, prompt: string) {
    const fullPrompt = globalStylePrompt.trim() ? `${prompt} — ${globalStylePrompt.trim()}` : prompt
    prompt = fullPrompt
    patchGenState(blockId, { loading: true, error: '' })

    // Credit-check: 50 centen per beeldgeneratie
    const IMAGE_COST_CENTS = 50
    if (supabase) {
      const { data: walletData } = await supabase.rpc('get_wallet')
      const wallet = walletData as any
      const totalBalance = (wallet?.personal_balance ?? 0) + (wallet?.company_balance ?? 0)
      if (totalBalance < IMAGE_COST_CENTS) {
        notifyCreditsRequired({ message: 'Je hebt onvoldoende credits voor beeldgeneratie. Waardeer je wallet op om verder te gaan.' })
        patchGenState(blockId, { loading: false, error: 'Onvoldoende credits. Laad credits op via Instellingen → Billing.' })
        return
      }
    }

    try {
      // Zoek het model van de image-agent in de Atelier pipeline op.
      // Agent-nodes slaan het agentId op in config; het model staat in de agents tabel.
      let model = ''
      if (supabase) {
        const { data: pipelines } = await supabase
          .from('pipelines')
          .select('stages')
          .eq('module', 'atelier')
          .eq('is_active', true)
          .limit(1)
        const pipeline = (pipelines ?? [])[0]
        const rawStages = pipeline?.stages as any
        const nodes: any[] = (rawStages && Array.isArray(rawStages.nodes)) ? rawStages.nodes : []
        const edges: any[] = (rawStages && Array.isArray(rawStages.edges)) ? rawStages.edges : []
        // Zoek de eerste agent-node met modality 'image'
        const imageAgentNode = nodes.find(
          (n: any) => n.type === 'agentNode' && n.data?.config?.modality === 'image'
        )
        const agentId = imageAgentNode?.data?.config?.agentId as string | undefined
        console.log('[doGenerateImage] image-agent node gevonden, agentId:', agentId ?? '(geen)')
        if (agentId) {
          const { data: agentRow } = await supabase
            .from('agents')
            .select('model, system_prompt')
            .eq('id', agentId)
            .single()
          model = (agentRow?.model as string) ?? ''
          const masterPrompt = (agentRow?.system_prompt as string) ?? ''
          // Zoek een style-context node op de 'stijl' handle (of onbenoemd als fallback)
          const styleEdge = edges.find((e: any) =>
            e.target === imageAgentNode.id && (e.targetHandle === 'stijl' || !e.targetHandle)
          )
          const styleNode = styleEdge ? nodes.find((n: any) => n.id === styleEdge.source && n.data?.subtype === 'style-context') : null
          const stylePrompt = (styleNode?.data?.config?.prompt as string) ?? ''
          // Voor image-only modellen (Flux etc.) stuurt de master prompt LLM-persona tekst die het model
          // letterlijk als beeldinhoud leest ("bureau" → kantoor, "art director" → man in pak).
          // Alleen de stijl-context prompt is visueel bedoeld en geschikt voor Flux.
          // De master prompt is alleen zinvol als het model een LLM is die zelf prompts genereert.
          const isLikelyImageModel = model.toLowerCase().includes('flux') ||
            model.toLowerCase().includes('stable-diffusion') ||
            model.toLowerCase().includes('playground') ||
            model.toLowerCase().includes('midjourney')
          const systemPrompt = isLikelyImageModel
            ? stylePrompt  // alleen visuele stijlinstructies naar Flux
            : (stylePrompt ? `${masterPrompt}\n\nStijlinstructies voor deze pipeline:\n${stylePrompt}` : masterPrompt)
          console.log('[doGenerateImage] agent model:', model, '| stijlprompt:', stylePrompt ? 'aanwezig' : 'leeg', '| isImageModel:', isLikelyImageModel)

          if (model) {
            const data = await (window as any).api.generateAtelierImage(prompt, model, systemPrompt)
            if (!data?.ok) {
              notifyIfCreditsRequired(data)
              patchGenState(blockId, { loading: false, error: data?.error ?? 'Genereren mislukt' })
              return
            }
            if (data.filePath) {
              updateImagePath(blockId, data.filePath)
              patchGenState(blockId, { loading: false, open: false })
            } else if (data.imageUrl) {
              const dl = await (window as any).api.downloadImageUrl(data.imageUrl)
              updateImagePath(blockId, dl?.ok && dl.filePath ? dl.filePath : data.imageUrl)
              patchGenState(blockId, { loading: false, open: false })
            }
            // Generatie gelukt — credits aftrekken
            if (supabase) {
              supabase.rpc('deduct_credits', { p_amount_cents: IMAGE_COST_CENTS, p_description: 'Beeldgeneratie' }).catch(() => { })
            }
            return // Succesvol afgehandeld
          }
        }
      }
      patchGenState(blockId, { loading: false, error: 'Geen image-agent gevonden voor Atelier.' })
    } catch (err: any) {
      notifyIfCreditsRequired(err)
      patchGenState(blockId, { loading: false, error: err.message ?? 'Fout bij genereren' })
    }
  }

  async function autoGenerateImage(block: Block) {
    const parts = [block.heading, block.body, ...Object.values(block.fields)].filter(Boolean)
    patchGenState(block.id, { open: false, error: '' })
    await doGenerateImage(block.id, parts.join(' — '))
  }

  const handlePreviewEdit = useCallback((blockId: string, role: string, newText: string) => {
    setBlocks((prev) => {
      const block = prev.find((b) => b.id === blockId)
      if (!block) return prev

      // Mark this field as explicitly touched by the user (non-empty save).
      // Touched fields are always shown in presentation mode, even when the value
      // matches the role name (e.g. user intentionally typed "Heading").
      const touched = newText.trim()
        ? Array.from(new Set([...(block.touchedFields ?? []), role]))
        : (block.touchedFields ?? []).filter((f) => f !== role)

      function withTouch(b: typeof block) {
        return touched.length ? { ...b, touchedFields: touched } : { ...b, touchedFields: undefined }
      }

      // Direct key match first (sentinel pattern for new slides, or MD fields named like the role).
      // Must come before heading/body routing: if sageTagMappings maps 'heading' → role,
      // that route saves to block.heading, leaving the sentinel in block.fields intact —
      // buildPreviewBlock then overwrites the real value with the sentinel on re-render.
      for (const k of Object.keys(block.fields)) {
        if (k === role) return prev.map((b) => b.id === blockId ? withTouch(removeDynamicDateKeys({ ...b, fields: { ...b.fields, [k]: newText } }, [k, role])) : b)
      }
      if (resolvedTag('heading', blockId, block.type, overrides, sageTagMappings) === role) {
        return prev.map((b) => b.id === blockId ? withTouch(removeDynamicDateKeys({ ...b, heading: newText }, ['__heading', 'heading', role])) : b)
      }
      if (resolvedTag('body', blockId, block.type, overrides, sageTagMappings) === role) {
        return prev.map((b) => b.id === blockId ? withTouch(removeDynamicDateKeys({ ...b, body: newText }, ['__body', 'body', role])) : b)
      }
      for (const k of Object.keys(block.fields)) {
        const t = resolvedTag(k, blockId, block.type, overrides, sageTagMappings) ?? k
        if (t === role) return prev.map((b) => b.id === blockId ? withTouch(removeDynamicDateKeys({ ...b, fields: { ...b.fields, [k]: newText } }, [k, t, role])) : b)
      }
      // Field not yet in block.fields (e.g. template defaultText shown but never explicitly stored).
      return prev.map((b) => b.id === blockId ? withTouch(removeDynamicDateKeys({ ...b, fields: { ...b.fields, [role]: newText } }, [role])) : b)
    })
  }, [overrides, sageTagMappings])

  const handlePreviewFieldFocus = useCallback((blockId: string, role: string) => {
    const idx = blocks.findIndex((b) => b.id === blockId)
    if (idx >= 0) setActiveIdx(idx)
    setExpandedCardIds((prev) => { const next = new Set(prev); next.add(blockId); return next })
    setCollapsedTextSectionIds((prev) => { const next = new Set(prev); next.delete(blockId); return next })
    setFocusedField({ blockId, role })
    requestAnimationFrame(() => cardRefs.current[blockId]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }))
  }, [blocks])

  const handlePreviewFieldBlur = useCallback(() => {
    setFocusedField(null)
  }, [])

  const handlePreviewFieldHover = useCallback((blockId: string, role: string, hovering: boolean) => {
    setHoveredLayerTarget((prev) => {
      if (hovering) return { blockId, kind: 'field', role }
      if (prev?.blockId === blockId && prev.kind === 'field' && prev.role === role) return null
      return prev
    })
  }, [])

  const handlePreviewImageHover = useCallback((blockId: string, hovering: boolean) => {
    setHoveredLayerTarget((prev) => {
      if (hovering) return { blockId, kind: 'image' }
      if (prev?.blockId === blockId && prev.kind === 'image') return null
      return prev
    })
  }, [])

  const handlePreviewImageClick = useCallback((blockId: string) => {
    const idx = blocks.findIndex((b) => b.id === blockId)
    if (idx >= 0) setActiveIdx(idx)
    setExpandedCardIds((prev) => { const next = new Set(prev); next.add(blockId); return next })
    setCollapsedImageSectionIds((prev) => { const next = new Set(prev); next.delete(blockId); return next })
    setFocusedField(null)
    requestAnimationFrame(() => cardRefs.current[blockId]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }))
  }, [blocks])

  const handleTableChange = useCallback((blockId: string, newTable: TableElement) => {
    setBlocks((prev) => prev.map((b) => b.id === blockId ? { ...b, tableData: newTable } : b))
  }, [])

  const handleTableDimensionsChange = useCallback((blockId: string, rows: number, columns: number) => {
    setBlocks((prev) => prev.map((b) => {
      if (b.id !== blockId || !b.tableData) return b
      return { ...b, tableData: resizeTableGrid(b.tableData, rows, columns) }
    }))
  }, [])

  const handleLayoutTableDimensionsChange = useCallback((blockId: string, rows: number, columns: number) => {
    const block = blocks.find((item) => item.id === blockId)
    if (!block) return
    setTemplateData((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        layouts: prev.layouts.map((layout) => {
          if (layout.name !== block.type || !layout.keynoteTable) return layout
          return {
            ...layout,
            keynoteTable: resizeKeynoteTableGrid(layout.keynoteTable, rows, columns),
          }
        }),
      }
    })
  }, [blocks])

  const handleTableCellEdit = useCallback((blockId: string, row: number, col: number, value: string) => {
    setBlocks((prev) => prev.map((b) => {
      if (b.id !== blockId || !b.tableData) return b
      const newRows = b.tableData.rows.map((r, ri) => ri !== row ? r : {
        ...r,
        cells: r.cells.map((c, ci) => ci !== col ? c : { ...c, content: value }),
      })
      return { ...b, tableData: { ...b.tableData, rows: newRows } }
    }))
  }, [])

  // Stable per-block callback map — keyed by blockId, only recreated when the set of
  // block IDs changes (not on content edits). Lets WebSlidePreview's React.memo hold
  // during text editing, which is the most frequent interaction.
  const blockIdsKey = blocks.map((b) => b.id).join('|')
  const stableBlockCallbacks = useMemo(() => {
    type BlockCbs = {
      onFieldEdit: (role: string, newText: string) => void
      onFieldFocus: (role: string) => void
      onFieldBlur: () => void
      onFieldHover: (role: string, hovering: boolean) => void
      onTextOverflow: (role: string, fitting: string, overflow: string) => void
      onImageClick: () => void
      onImageSlotClick: (slotIndex: number) => void
      onImageHover: (hovering: boolean) => void
      onImageDragStart: (e: React.MouseEvent, slotIndex?: number) => void
      onImagePromptSubmit: (prompt: string) => void
      onTableCellEdit: (row: number, col: number, value: string) => void
    }
    const map = new Map<string, BlockCbs>()
    for (const block of blocks) {
      map.set(block.id, {
        onFieldEdit: (role, newText) => handlePreviewEdit(block.id, role, newText),
        onFieldFocus: (role) => handlePreviewFieldFocus(block.id, role),
        onFieldBlur: handlePreviewFieldBlur,
        onFieldHover: (role, hovering) => handlePreviewFieldHover(block.id, role, hovering),
        onTextOverflow: (role, fitting, overflow) => handleTextOverflow(block.id, role, fitting, overflow),
        onImageClick: () => handlePreviewImageClick(block.id),
        onImageSlotClick: (slotIndex) => pickImageForBlock(block.id, slotIndex),
        onImageHover: (hovering) => handlePreviewImageHover(block.id, hovering),
        onImageDragStart: (e, slotIndex = 0) => {
          e.preventDefault()
          document.body.style.cursor = 'grabbing'
          const img = e.target as HTMLImageElement
          const freshBlock = blocksRef.current.find(b => b.id === block.id)
          // Slot 0 uses block.imageOffset; other carousel slots use their own offset.
          const slotOffset = slotIndex === 0
            ? freshBlock?.imageOffset
            : freshBlock?.imageSlots?.[slotIndex]?.offset
          const initX = slotOffset?.x ?? 0
          const initY = slotOffset?.y ?? 0
          // Prefer cache over img.naturalWidth — img can report 0 if not yet decoded
          const cached = imageNaturalSizeCache.get(img.src)
          const naturalW = cached?.w || img.naturalWidth || undefined
          const naturalH = cached?.h || img.naturalHeight || undefined
          dragImageRef.current = {
            blockId: block.id,
            slotIndex,
            hasExplicitOffset: slotOffset != null,
            lastX: e.clientX,
            lastY: e.clientY,
            naturalW,
            naturalH,
            imgEl: img,
            currentOffsetX: initX,
            currentOffsetY: initY,
            startOffsetX: initX,
            startOffsetY: initY,
            frameW: 0,
            frameH: 0,
            rafId: null,
          }
        },
        onImagePromptSubmit: (prompt) => doGenerateImage(block.id, prompt),
        onTableCellEdit: (row, col, value) => handleTableCellEdit(block.id, row, col, value),
      })
    }
    return map
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blockIdsKey, handlePreviewEdit, handlePreviewFieldFocus, handlePreviewFieldBlur,
    handlePreviewFieldHover, handleTextOverflow, handlePreviewImageClick, handlePreviewImageHover,
    doGenerateImage, handleTableCellEdit])

  function setOverride(blockId: string, displayKey: string, sageTag: string) {
    ; (window as any).api?.debugLog?.('[setOverride] blockId:', blockId, 'displayKey:', displayKey, 'sageTag:', sageTag)
    setOverrides((prev) => {
      const next = { ...prev, [blockId]: { ...(prev[blockId] ?? {}), [displayKey]: sageTag } }
        ; (window as any).api?.debugLog?.('[setOverride] overrides na update:', Object.keys(next).length, 'keys')
      return next
    })
  }

  function buildExportBlocks() {
    return blocks.map((block) => {
      const st = getSageTags(block.type, templateData, mappings)
      const previewBlock = buildPreviewBlock(block, overrides, sageTagMappings, st)
      return { ...previewBlock, heading: '', body: '' }
    })
  }

  async function handleRenameProject(newName: string) {
    const trimmed = newName.trim()
    setNameEditing(false)
    if (!trimmed || trimmed === projectName) return
    setProjectName(trimmed)
    if (projectPath) handleSave(undefined, trimmed)
    if (live.isLive && live.presentationId && supabase) {
      supabase.from('presentations').update({ name: trimmed }).eq('id', live.presentationId)
    }
  }

  function buildProjectData(
    livePresentationId?: string,
    overrideName?: string,
    patch: Partial<Pick<HupheProject, 'assetRefs' | 'copyRefs' | 'locked'>> = {},
    stateOverride: Partial<Pick<HupheProject, 'templateClientId' | 'mdText' | 'blocks' | 'overrides'>> = {},
  ): HupheProject {
    const dataBlocks = stateOverride.blocks ?? blocks
    const dataTemplateClientId = stateOverride.templateClientId ?? templateClientId
    const dataMdText = stateOverride.mdText ?? mdText
    const dataOverrides = stateOverride.overrides ?? overrides
    const firstHeading = dataBlocks[0]?.heading || dataBlocks[0]?.fields?.[Object.keys(dataBlocks[0]?.fields ?? {})[0]] || ''
    const suggestedName = firstHeading.slice(0, 40) || 'Nieuw project'
    const resolvedPresentationId = livePresentationId ?? supabasePresentationId ?? undefined
    const assetRefs = patch.assetRefs ?? presentationAssetRefs
    const copyRefs = patch.copyRefs ?? presentationCopyRefs
    const locked = patch.locked ?? presentationLocked
    return {
      version: 1,
      name: overrideName ?? projectName ?? suggestedName,
      savedAt: new Date().toISOString(),
      templateClientId: dataTemplateClientId,
      mdText: dataMdText,
      blocks: dataBlocks,
      overrides: dataOverrides,
      ...(Object.keys(slideComments).length > 0 ? { slideComments } : {}),
      ...(globalStylePrompt.trim() ? { globalStylePrompt: globalStylePrompt.trim() } : {}),
      ...(assetRefs.length ? { assetRefs } : {}),
      ...(copyRefs.length ? { copyRefs } : {}),
      ...(locked ? { locked } : {}),
      ...(resolvedPresentationId ? { supabasePresentationId: resolvedPresentationId } : {}),
    }
  }

  async function handleSave(livePresentationId?: string, overrideName?: string) {
    if (blocks.length === 0 || !templateClientId) return
      ; (window as any).api?.debugLog?.('[handleSave] overrides:', Object.keys(overrides).length, 'keys', JSON.stringify(overrides).slice(0, 200))
      ; (window as any).api?.debugLog?.('[handleSave] blocks:', blocks.length, '| block[2] imagePath:', blocks[2]?.imagePath ?? '(geen)')
    setSaving(true)
    setExportError('')
    try {
      const projectData = buildProjectData(livePresentationId, overrideName)
      const result = await (window as any).api.saveProject(projectData, projectPath ?? undefined)
      if (result.ok && result.filePath) {
        setProjectPath(result.filePath)
        setProjectName(projectData.name)
        lastAutoSaveRef.current = JSON.stringify({ templateClientId, mdText, blocks, overrides, projectName: projectData.name, supabasePresentationId: projectData.supabasePresentationId ?? null })
        void refreshSavedPresentations()
      } else if (!result.ok && !result.canceled) {
        setExportError(result.error ?? 'Opslaan mislukt')
      }
    } catch (err: any) {
      setExportError(err.message ?? 'Opslaan mislukt')
    } finally {
      setSaving(false)
    }
  }

  // Broadcast active slide to viewers when owner navigates
  useEffect(() => {
    if (live.isLive && live.isOwner) live.syncSlideIndex(activeIdx)
  }, [activeIdx, live.isLive, live.isOwner]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
    if (step !== 'editor' || blocks.length === 0 || !templateClientId || saving) return
    if (live.isLive && !live.isOwner) return

    autoSaveTimerRef.current = setTimeout(() => {
      const doSave = async () => {
        const snapshot = JSON.stringify({ templateClientId, mdText, blocks, overrides, projectName, supabasePresentationId, slideComments })
        if (snapshot === lastAutoSaveRef.current) return
        setAutoSaveStatus('saving')
        try {
          const projectData = buildProjectData()
          if (projectPath) {
            const result = await (window as any).api.saveProject(projectData, projectPath)
            if (!result.ok) throw new Error(result.error ?? 'Auto-save mislukt')
            void refreshSavedPresentations()
          } else {
            // Geen pad bekend: sla automatisch op op disk zonder dialoog
            const result = await (window as any).api.autoSaveProject(projectData)
            if (result?.ok && result.filePath) {
              setProjectPath(result.filePath)
              void refreshSavedPresentations()
            } else {
              // Fallback naar IndexedDB als disk-save niet lukt
              await setAutoSaveDraft(projectData)
            }
          }
          lastAutoSaveRef.current = snapshot
          setAutoSaveStatus('saved')
        } catch (err: any) {
          setAutoSaveStatus('error')
            ; (window as any).api?.debugLog?.('[autoSave] fout:', err?.message ?? err)
        }
      }
      if (typeof window.requestIdleCallback === 'function') {
        window.requestIdleCallback(() => doSave(), { timeout: 5000 })
      } else {
        doSave()
      }
    }, 3000)

    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
    }
  }, [step, blocks, overrides, mdText, templateClientId, projectName, projectPath, supabasePresentationId, slideComments, saving, live.isLive, live.isOwner]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    function isEditingTarget(target: EventTarget | null): boolean {
      if (!(target instanceof HTMLElement)) return false
      const tag = target.tagName.toLowerCase()
      return tag === 'input' || tag === 'textarea' || tag === 'select' || target.isContentEditable
    }

    function onKey(e: KeyboardEvent) {
      if (presenting) return
      const mod = e.metaKey || e.ctrlKey
      const key = e.key.toLowerCase()

      if (mod && key === 'z') {
        e.preventDefault()
        if (e.shiftKey) redoEditorChange()
        else undoEditorChange()
        return
      }
      if ((mod && key === 'y')) {
        e.preventDefault()
        redoEditorChange()
        return
      }

      if (isEditingTarget(e.target)) return

      if (mod && key === 's') {
        e.preventDefault()
        handleSave()
      } else if (mod && key === 'd') {
        e.preventDefault()
        duplicateSlide()
      } else if (!mod && (e.key === 'Delete' || e.key === 'Backspace')) {
        e.preventDefault()
        if (selectedSlideIdsRef.current.size > 1) {
          removeSelectedSlides()
          return
        }
        const activeBlock = blocks[activeIdx]
        if (!activeBlock) return
        removeSlide(activeBlock.id)
      }
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [presenting, blocks, activeIdx, templateClientId, projectName, projectPath, mdText, overrides]) // eslint-disable-line react-hooks/exhaustive-deps

  const htmlTemplateName = htmlTemplateOptions.find((template) => template.clientId === templateClientId)?.name ?? ''
  const clientName = clients.find((c) => c.id === templateClientId)?.name ?? htmlTemplateName
  const templateName = clients.find((c) => c.id === templateClientId)?.name ?? htmlTemplateName
  // Verberg UUID-clients die al een digital twin hebben — twin staat al in htmlTemplateOptions
  const twinBackedIds = getKeynoteBackedClientIds()
  const clientsWithTemplate = clients.filter((c) => templateClientIds.has(c.id) && !twinBackedIds.has(c.id))

  // ── Share: save to Supabase if not yet done, then call RPC ───────────────
  async function handleShareInApp() {
    const email = shareEmail.trim().toLowerCase()
    if (!email || !supabase) return
    setShareError('')
    setSharing(true)
    try {
      // Ensure presentation exists in Supabase
      let presId = live.presentationId
      if (!presId) {
        const { data, error } = await supabase
          .from('presentations')
          .insert({
            name: projectName ?? templateName ?? 'Presentatie',
            template_client_id: templateClientId,
            blocks,
            overrides,
            md_text: mdText,
            is_live: false,
            asset_refs: presentationAssetRefs,
            copy_refs: presentationCopyRefs,
            locked: presentationLocked,
          })
          .select('id')
          .single()
        if (error) throw error
        presId = data.id
      }
      const { error: rpcError } = await supabase.rpc('share_presentation', {
        p_presentation_id: presId,
        p_recipient_email: email,
      })
      if (rpcError) throw rpcError
      setShareSuccess(true)
      setShareEmail('')
    } catch (err: any) {
      setShareError(err.message ?? 'Delen mislukt.')
    } finally {
      setSharing(false)
    }
  }

  async function loadShareMembers(presId: string) {
    if (!supabase) return
    const { data } = await supabase
      .from('presentation_members')
      .select('user_id, role')
      .eq('presentation_id', presId)
    if (data) {
      setShareMembers(data.map((m: any) => ({ email: m.user_id, role: m.role })))
    }
  }

  async function handleOpenSharePermissions() {
    let presId = live.presentationId
    if (!presId && supabase) {
      const { data } = await supabase
        .from('presentations')
        .insert({ name: projectName ?? 'Presentatie', template_client_id: templateClientId, blocks, overrides, md_text: mdText, is_live: false, asset_refs: presentationAssetRefs, copy_refs: presentationCopyRefs, locked: presentationLocked })
        .select('id').single()
      if (data) presId = data.id
    }
    if (presId) await loadShareMembers(presId)
    setSharePermissionsOpen(true)
  }

  async function handleSharePermissionsInvite(email: string, role: string) {
    if (!supabase) return
    let presId = live.presentationId
    if (!presId) return
    const { error } = await supabase.rpc('share_presentation', { p_presentation_id: presId, p_recipient_email: email })
    if (!error) {
      if (role !== 'viewer') {
        const { data: user } = await supabase.from('presentation_members').select('user_id').eq('presentation_id', presId).order('created_at', { ascending: false }).limit(1).single()
        if (user) await supabase.from('presentation_members').update({ role }).eq('presentation_id', presId).eq('user_id', user.user_id)
      }
      await loadShareMembers(presId)
    }
  }

  async function handleSharePermissionsChangeRole(email: string, role: string) {
    const presId = live.presentationId
    if (!supabase || !presId) return
    await supabase.from('presentation_members').update({ role }).eq('presentation_id', presId).eq('user_id', email)
    await loadShareMembers(presId)
  }

  async function handleSharePermissionsRemove(email: string) {
    const presId = live.presentationId
    if (!supabase || !presId) return
    await supabase.from('presentation_members').delete().eq('presentation_id', presId).eq('user_id', email)
    setShareMembers((prev) => prev.filter((m) => m.email !== email))
  }

  function downloadMdForEmail() {
    const name = projectName ?? templateName ?? 'presentatie'
    const blob = new Blob([mdText], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${name.replace(/\s+/g, '_')}.md`
    a.click()
    URL.revokeObjectURL(url)
  }

  // ── Build serializable layout data for the web viewer ───────────────────
  function buildWebLayouts(
    blocks: Block[],
    td: TemplateData,
    bgColorsMap: Record<string, string>,
    mappingsMap: Record<string, Record<number, string>>,
    sageTagMappings: Record<string, Record<string, string>>,
  ): Record<string, unknown> {
    const seen = new Set<string>()
    const result: Record<string, unknown> = {}
    for (const block of blocks) {
      if (seen.has(block.type)) continue
      seen.add(block.type)
      const layout = td.layouts.find((l) => l.name === block.type)
      if (!layout) continue
      const layoutMappings = mappingsMap[block.type] ?? {}
      const textItems = layout.textItems
        .map((item, i) => {
          const alias = layoutMappings[i]
          if (alias === 'negeren') return null
          if (item.posX == null && item.posY == null && item.width == null && item.height == null) return null
          return {
            role: item.role,
            posX: item.posX ?? 0,
            posY: item.posY ?? 0,
            width: item.width ?? 1920,
            height: item.height ?? 0,
            fontSize: item.fontSize ?? 24,
            color: item.color ?? null,
            font: item.font ?? null,
            alignment: item.alignment ?? 'left',
            verticalAlignment: item.verticalAlignment ?? 'top',
            paraProperties: item.paraProperties ?? null,
            ...(alias && alias !== 'negeren' ? { mappingAlias: alias } : {}),
          }
        })
        .filter(Boolean)
      result[block.type] = {
        bgColor: layout.bgColor ?? bgColorsMap[block.type] ?? '#111111',
        slideWidth: td.slideWidth,
        slideHeight: td.slideHeight,
        assets: (layout.assets ?? []).map((a) => ({ posX: a.posX, posY: a.posY, width: a.width, height: a.height, dataUrl: a.dataUrl })),
        textItems,
        imageSlot: layout.imageSlot ?? null,
        imageFrame: layout.imageFrame ?? null,
        imageMask: layout.imageMask ?? null,
        sageTags: getSageTags(block.type, td, mappingsMap),
      }
    }
    result['_mdToSageTag'] = sageTagMappings
    return result
  }

  // ── Lokale afbeeldingen uploaden naar Supabase vóór live zetten ─────────
  async function uploadLocalBlockImages(rawBlocks: unknown[], ownerId: string): Promise<unknown[]> {
    const api = (window as any).api
    const urlCache = new Map<string, string>()

    function isLocalPath(p?: string): p is string {
      return !!p && !p.startsWith('http://') && !p.startsWith('https://') && !p.startsWith('data:')
    }

    async function resolveLocalPath(localPath: string): Promise<string> {
      if (urlCache.has(localPath)) return urlCache.get(localPath)!
      const buffer: ArrayBuffer | null = await api.readFileBuffer(localPath).catch(() => null)
      if (!buffer) return localPath
      const ext = localPath.split('.').pop()?.toLowerCase() ?? 'jpg'
      const mimeType = ext === 'png' ? 'image/png'
        : ext === 'webp' ? 'image/webp'
        : ext === 'gif' ? 'image/gif'
        : ext === 'svg' ? 'image/svg+xml'
        : 'image/jpeg'
      // Stabiele ID op basis van pad zodat hetzelfde bestand niet dubbel wordt geüpload
      const stableId = `live-img-${btoa(localPath).replace(/[^a-z0-9]/gi, '').slice(0, 32)}`
      const asset = { id: stableId, name: localPath.split('/').pop() ?? 'image', src: localPath, type: 'image' as const, mimeType, isShared: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
      const shared = await shareAssetToSupabase(asset, ownerId, buffer, mimeType)
      const publicUrl = shared?.src ?? localPath
      urlCache.set(localPath, publicUrl)
      return publicUrl
    }

    return Promise.all(rawBlocks.map(async (b) => {
      const block = { ...(b as Record<string, unknown>) }

      if (isLocalPath(block.imagePath as string | undefined)) {
        block.imageUrl = await resolveLocalPath(block.imagePath as string)
        delete block.imagePath
      }

      if (Array.isArray(block.imageSlots)) {
        block.imageSlots = await Promise.all((block.imageSlots as Array<Record<string, unknown>>).map(async (slot) => {
          if (isLocalPath(slot.path as string | undefined)) {
            const url = await resolveLocalPath(slot.path as string)
            return { ...slot, url, path: undefined }
          }
          return slot
        }))
      }

      return block
    }))
  }

  // ── Live enable handler ─────────────────────────────────────────────────
  async function handleEnableLive() {
    setLiveError('')
    setLiveEnabling(true)
    try {
      // Sync lokale client + template naar Supabase als die daar nog niet bestaan
      if (supabase && templateClientId) {
        const localClients: Array<{id: string; name: string}> = await (window as any).api?.listLocalClients?.() ?? []
        const localClient = localClients.find((c) => c.id === templateClientId)
        if (localClient) {
          // Client bestaat lokaal maar mogelijk nog niet in Supabase
          const { data: existing } = await supabase.from('clients').select('id').eq('id', templateClientId).maybeSingle()
          if (!existing) {
            await supabase.from('clients').insert({ id: templateClientId, name: localClient.name })
          }
        }
        // Template data sync naar Supabase als die daar nog niet staat
        if (templateData) {
          const { data: existingTemplate } = await supabase.from('templates').select('client_id').eq('client_id', templateClientId).maybeSingle()
          if (!existingTemplate) {
            const { persistTemplate } = await import('../lib/template-storage')
            await persistTemplate(supabase, templateClientId, templateData)
          }
          // Mappings ook syncen
          const localMappings = await (window as any).api?.getLocalMappings?.(templateClientId)
          if (localMappings && Object.keys(localMappings).length > 0) {
            await supabase.from('template_mappings').upsert({ client_id: templateClientId, mappings: localMappings }, { onConflict: 'client_id' })
          }
        }
      }

      const name = projectName ?? templateName ?? 'Presentatie'
      const ownerId = atelierOwnerId ?? (await supabase?.auth.getUser())?.data.user?.id ?? null
      const liveBlocks = ownerId ? await uploadLocalBlockImages(blocks, ownerId) : blocks
      const result = await live.enable({
        name,
        templateClientId,
        blocks: liveBlocks,
        overrides,
        mdText,
        existingId: supabasePresentationId ?? undefined,
      })
      if (result) {
        setSupabasePresentationId(result.id)
        handleSave(result.id)
        live.loadMembers(result.id)
        if (templateData && supabase) {
          const webLayouts = buildWebLayouts(blocks, templateData, bgColors, mappings, sageTagMappings)
          console.log('web_layouts building, keys:', Object.keys(webLayouts))
          const { error: wlErr } = await supabase.from('presentations').update({ web_layouts: webLayouts }).eq('id', result.id)
          if (wlErr) console.error('web_layouts save failed:', wlErr)
          else console.log('web_layouts saved OK')
        }
        setLiveSuccessOpen(true)
      }
    } catch (err: any) {
      setLiveError(err.message ?? 'Live starten mislukt.')
    } finally {
      setLiveEnabling(false)
    }
  }

  // ── Live success modal ──────────────────────────────────────────────────
  const liveSuccessModal = liveSuccessOpen && live.shareCode && (
    <div
      id="live-success-modal"
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) { setLiveSuccessOpen(false); setCodeCopied(false) } }}
    >
      <div className="bg-[#141414] border border-white/[0.09] rounded-2xl p-8 w-[420px] flex flex-col items-center gap-6 shadow-2xl">
        {/* Icon */}
        <div className="w-12 h-12 rounded-xl bg-green-500/10 border border-green-500/20 flex items-center justify-center">
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-green-400" />
          </span>
        </div>

        {/* Title */}
        <div className="text-center">
          <p className="text-white text-lg font-semibold">Je presentatie is live!</p>
          <p className="text-white/40 text-sm mt-1">Deel de code hieronder met je team om samen te werken.</p>
        </div>

        {/* Share code */}
        <button
          onClick={() => {
            navigator.clipboard.writeText(live.shareCode!)
            setCodeCopied(true)
            setTimeout(() => setCodeCopied(false), 2000)
          }}
          className="group w-full flex items-center justify-between bg-[#0a0a0a] border border-white/[0.08] hover:border-green-400/30 rounded-xl px-6 py-5 transition-colors"
        >
          <span className="font-mono text-4xl font-bold tracking-[0.2em] text-white">
            {live.shareCode}
          </span>
          <span className="flex items-center gap-1.5 text-xs text-white/30 group-hover:text-green-400/70 transition-colors">
            {codeCopied ? (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                Gekopieerd
              </>
            ) : (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
                Kopieer
              </>
            )}
          </span>
        </button>

        <button
          onClick={() => { setLiveSuccessOpen(false); setCodeCopied(false) }}
          className="text-white/30 hover:text-white/60 text-sm transition-colors"
        >
          Sluiten
        </button>
      </div>
    </div>
  )

  // ── Live stop confirmation modal ────────────────────────────────────────
  const liveStopModal = liveStopConfirm && (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) setLiveStopConfirm(false) }}
    >
      <div className="bg-[#141414] border border-white/[0.09] rounded-2xl p-6 w-[360px] flex flex-col gap-4 shadow-2xl">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center flex-shrink-0">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="rgba(248,113,113,0.9)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </div>
          <div>
            <p className="text-white text-sm font-semibold">Live verbinding stoppen?</p>
            <p className="text-white/40 text-xs mt-1 leading-relaxed">
              Iedereen die nu in dit document werkt verliest direct de verbinding en kan niet meer mee-bewerken.
            </p>
          </div>
        </div>
        <div className="flex gap-2 justify-end">
          <button
            onClick={() => setLiveStopConfirm(false)}
            className="px-4 py-2 rounded-xl text-white/50 hover:text-white/80 text-xs border border-white/[0.08] hover:border-white/20 transition-colors"
          >
            Annuleren
          </button>
          <button
            onClick={() => { handleSave(); live.disable(supabasePresentationId ?? undefined); setLiveStopConfirm(false) }}
            className="px-4 py-2 rounded-xl bg-red-500/15 hover:bg-red-500/25 text-red-400 hover:text-red-300 text-xs border border-red-500/20 hover:border-red-500/40 transition-colors font-medium"
          >
            Ja, stoppen
          </button>
        </div>
      </div>
    </div>
  )

  // ── Share modal ─────────────────────────────────────────────────────────
  const shareModal = shareModalOpen && (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) { setShareModalOpen(false); setShareSuccess(false); setShareError('') } }}
    >
      <div className="bg-[#141414] border border-white/[0.10] rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.07]">
          <span className="text-white font-semibold text-sm">Presentatie delen</span>
          <button
            onClick={() => { setShareModalOpen(false); setShareSuccess(false); setShareError('') }}
            className="text-white/35 hover:text-white/70 transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-white/[0.07]">
          {(['inapp', 'email'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => { setShareTab(tab); setShareSuccess(false); setShareError('') }}
              className={[
                'flex-1 py-2.5 text-xs font-medium transition-colors',
                shareTab === tab
                  ? 'text-white border-b-2 border-[#facc15]'
                  : 'text-white/35 hover:text-white/60',
              ].join(' ')}
            >
              {tab === 'inapp' ? 'In-app versturen' : 'Via e-mail'}
            </button>
          ))}
        </div>

        <div className="p-5">
          {shareTab === 'inapp' ? (
            shareSuccess ? (
              <div className="text-center py-6 space-y-2">
                <div className="w-10 h-10 rounded-full bg-green-500/10 flex items-center justify-center mx-auto">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
                <p className="text-white/70 text-sm">Presentatie verstuurd!</p>
                <p className="text-white/30 text-xs">De ontvanger krijgt een melding in de app.</p>
                <button
                  onClick={() => { setShareSuccess(false); setShareEmail('') }}
                  className="mt-2 text-white/40 hover:text-white/70 text-xs transition-colors"
                >
                  Nog iemand uitnodigen
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-white/40 text-xs">Stuur een kopie naar een collega. Die vindt hem terug onder Documenten → Gedeeld met mij.</p>
                <div className="flex gap-2">
                  <input
                    value={shareEmail}
                    onChange={(e) => { setShareEmail(e.target.value); setShareError('') }}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleShareInApp() }}
                    placeholder="naam@bedrijf.nl"
                    type="email"
                    className="flex-1 bg-[#0a0a0a] border border-white/[0.10] rounded-xl px-3 py-2 text-white text-xs outline-none focus:border-[#facc15]/50 transition-colors placeholder:text-white/20"
                  />
                  <button
                    onClick={handleShareInApp}
                    disabled={!shareEmail.trim() || sharing}
                    className="px-3 py-2 rounded-xl bg-[#facc15] hover:bg-[#fde047] disabled:bg-white/[0.06] disabled:text-white/25 disabled:cursor-not-allowed text-black text-xs font-semibold transition-colors"
                  >
                    {sharing ? '…' : 'Stuur'}
                  </button>
                </div>
                {shareError && (
                  <p className="text-red-400 text-xs bg-red-500/[0.08] border border-red-500/20 rounded-lg px-3 py-2">
                    {shareError}
                  </p>
                )}
              </div>
            )
          ) : (
            <div className="space-y-3">
              <p className="text-white/40 text-xs">Download het MD-bestand en stuur het op. De ontvanger kan het importeren in Atelier.</p>
              <button
                onClick={downloadMdForEmail}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-white/[0.10] bg-white/[0.03] hover:bg-white/[0.07] text-white/65 hover:text-white text-xs font-medium transition-colors"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                Download .md bestand
              </button>
              <button
                onClick={() => {
                  const subject = encodeURIComponent(`Presentatie: ${projectName ?? templateName ?? 'Deck'}`)
                  const body = encodeURIComponent('Hoi,\n\nIk stuur je hierbij een presentatie gemaakt in HupheAI Atelier.\nZip het bestand en sleep het in Atelier om het te openen.\n\nGroeten')
                  window.open(`mailto:?subject=${subject}&body=${body}`)
                }}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-white/[0.10] bg-white/[0.03] hover:bg-white/[0.07] text-white/65 hover:text-white text-xs font-medium transition-colors"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                  <polyline points="22,6 12,13 2,6" />
                </svg>
                Open e-mailclient
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )

  // ── Shared header ──────────────────────────────────────────────────────
  const sharedHeader = (
    <header
      className="flex-shrink-0 flex items-center justify-between border-b border-white/[0.07] bg-[#111111] px-5"
      style={{ WebkitAppRegion: 'drag', height: 52 } as React.CSSProperties}
    >
      <div
        className="flex items-center gap-2.5"
        style={{ WebkitAppRegion: 'no-drag', paddingLeft: 80 } as React.CSSProperties}
      >
        <button
          onClick={onBack}
          className="flex items-center gap-2.5 transition-opacity hover:opacity-70"
        >
          <div className="w-7 h-7 bg-[#facc15] rounded-md flex items-center justify-center">
            <img src={logo} alt="" className="w-4 h-4 object-contain" />
          </div>
          <span className="text-white font-semibold text-[15px] tracking-tight">HupheAI</span>
        </button>
        <span className="text-white/20 text-[15px] select-none">·</span>
        <div className="relative" ref={moduleDropdownRef}>
          <button
            type="button"
            className="flex items-center gap-1 text-[#facc15]/80 font-semibold text-[11px] tracking-[0.12em] uppercase transition-opacity hover:opacity-70"
            onClick={() => setModuleDropdownOpen(v => !v)}
          >
            Atelier
            <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
              <path d="M1.5 3L4 5.5L6.5 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          {moduleDropdownOpen && (
            <div className="absolute left-0 top-full mt-2 z-[70] w-44 rounded-xl border border-white/[0.10] bg-[#1a1a1a] py-1.5 shadow-2xl">
              {[
                { id: 'home', label: 'Dashboard' },
                ...(allowedModuleSlugs?.has('engine') || allowedModuleSlugs?.has('atelier') ? [{ id: 'atelier', label: 'Atelier' }] : []),
                ...(allowedModuleSlugs?.has('pulse') ? [{ id: 'pulse', label: 'Pulse' }] : []),
                ...(allowedModuleSlugs?.has('documents') ? [{ id: 'documents', label: 'Documenten' }] : []),
                { id: 'typewriter', label: 'Typewriter' },
                { id: 'settings', label: 'Instellingen' },
              ].map((mod) => (
                <button
                  key={mod.id}
                  type="button"
                  className={[
                    'flex w-full items-center gap-2.5 px-3 py-2 text-[13px] transition-colors',
                    mod.id === 'atelier' ? 'text-[#facc15]' : 'text-white/60 hover:text-white hover:bg-white/[0.05]',
                  ].join(' ')}
                  onClick={() => {
                    setModuleDropdownOpen(false)
                    if (onModuleSelect) onModuleSelect(mod.id)
                    else onBack()
                  }}
                >
                  {mod.label}
                </button>
              ))}
            </div>
          )}
        </div>
        {step === 'editor' && templateName && (
          <>
            <span className="text-white/20 text-[13px] select-none">/</span>
            <span className="text-white/40 text-xs">{templateName}</span>
          </>
        )}
        {step === 'editor' && clientName && clientName !== templateName && (
          <>
            <span className="text-white/20 text-[13px] select-none">→</span>
            <span className="text-white/25 text-xs">{clientName}</span>
          </>
        )}
      </div>
      {step === 'editor' && (
        <div
          className="flex items-center gap-2"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          {/* Live toggle */}
          {liveError && (
            <span className="text-red-400 text-[11px] max-w-[160px] truncate" title={liveError}>
              {liveError}
            </span>
          )}
          {!live.isLive ? (
            <button
              onClick={handleEnableLive}
              disabled={liveEnabling || live.saving}
              title="Live samenwerken starten"
              className="flex items-center gap-1.5 text-white/40 hover:text-white/75 text-xs border border-white/[0.07] hover:border-white/[0.18] rounded-md px-3 py-1.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="3" />
              </svg>
              {liveEnabling ? 'Starten…' : 'Live'}
            </button>
          ) : (
            <button
              onClick={live.isOwner ? () => setLiveStopConfirm(true) : undefined}
              title={live.isOwner ? 'Live sessie stoppen' : 'Live sessie actief'}
              className={`flex items-center gap-1.5 text-green-400 text-xs border border-green-400/30 rounded-md px-3 py-1.5 transition-colors ${live.isOwner ? 'hover:text-green-300 hover:border-green-400/60 cursor-pointer' : 'cursor-default'}`}
            >
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-400" />
              </span>
              Live
            </button>
          )}
          {live.isLive && live.shareCode && (
            <button
              onClick={() => navigator.clipboard.writeText(live.shareCode!)}
              title="Klik om code te kopiëren"
              className="flex items-center gap-1.5 font-mono text-xs text-green-400/70 hover:text-green-300 border border-green-400/20 hover:border-green-400/40 rounded-md px-2.5 py-1.5 transition-colors"
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
              {live.shareCode}
            </button>
          )}
          {live.isLive && live.members.length > 0 && (
            <PresenceAvatars
              members={live.members.map((m, i) => ({
                id: m.user_id,
                name: m.role === 'owner' ? 'OW' : `V${i}`,
                color: m.role === 'owner' ? '#facc15' : '#4ade80',
              }))}
              max={5}
            />
          )}

          {/* Voice command button */}
          <button
            onClick={voice.status === 'listening' ? voice.stopListening : voice.startListening}
            title={voice.status === 'listening' ? 'Stoppen met luisteren' : 'Spraakcommando geven'}
            className={`flex items-center gap-1.5 text-xs border rounded-md px-3 py-1.5 transition-colors ${voice.status === 'listening'
              ? 'text-red-400 border-red-400/30 hover:border-red-400/60 animate-pulse'
              : voice.status === 'processing'
                ? 'text-amber-400 border-amber-400/30 opacity-70 cursor-wait'
                : 'text-white/40 hover:text-white/75 border-white/[0.07] hover:border-white/[0.18]'
              }`}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </svg>
            {voice.status === 'listening' ? 'Luisteren…' : voice.status === 'processing' ? 'Verwerken…' : 'Voice'}
          </button>

          {/* Meeting notulist button */}
          <button
            onClick={() => {
              if (meeting.isRecording) { meeting.stopRecording(); setNotesOpen(true) }
              else { meeting.startRecording() }
            }}
            title={meeting.isRecording ? 'Stop notuleren' : 'Meeting notuleren (per slide)'}
            className={`flex items-center gap-1.5 text-xs border rounded-md px-3 py-1.5 transition-colors ${meeting.isRecording
              ? 'text-amber-400 border-amber-400/30 hover:border-amber-400/60 animate-pulse'
              : meeting.transcribing
                ? 'text-amber-400/60 border-amber-400/20 cursor-wait'
                : 'text-white/40 hover:text-white/75 border-white/[0.07] hover:border-white/[0.18]'
              }`}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" />
            </svg>
            {meeting.isRecording ? 'Notuleren…' : meeting.transcribing ? 'Transcriberen…' : 'Notulen'}
            {!meeting.isRecording && meeting.chunks.length > 0 && (
              <span className="ml-0.5 bg-amber-400/20 text-amber-400 rounded px-1 text-[10px] font-mono">{meeting.chunks.length}</span>
            )}
          </button>
          {!meeting.isRecording && meeting.chunks.length > 0 && (
            <button
              onClick={() => setNotesOpen(true)}
              title="Bekijk en verwerk notulen"
              className="flex items-center gap-1.5 text-amber-400/70 hover:text-amber-300 text-xs border border-amber-400/20 hover:border-amber-400/40 rounded-md px-2.5 py-1.5 transition-colors"
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
              Bekijken
            </button>
          )}

          {/* Share button */}
          <button
            onClick={handleOpenSharePermissions}
            title="Presentatie delen"
            className="flex items-center gap-1.5 text-white/40 hover:text-white/75 text-xs border border-white/[0.07] hover:border-white/[0.18] rounded-md px-3 py-1.5 transition-colors"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
            </svg>
            Deel
          </button>

        </div>
      )}
    </header>
  )

  // ── OCR review modal ──────────────────────────────────────────────────
  if (showOcrReview && pendingOcrContext) {
    const ocrRoles = [...new Set(
      pendingOcrContext.td.layouts.flatMap(l => l.textItems.map(i => i.role ?? '').filter(Boolean))
    )]
    return (
      <PdfImportReviewScreen
        backgroundImage={pendingOcrContext.backgroundImage}
        elements={ocrElements}
        availableRoles={ocrRoles}
        onConfirm={handleOcrConfirm}
        onReject={() => {
          URL.revokeObjectURL(pendingOcrContext.backgroundImage)
          setShowOcrReview(false)
          setPendingOcrContext(null)
          setOcrElements([])
        }}
      />
    )
  }

  // ── Text-review modal (A4 labeling step) ──────────────────────────────
  if (showTextReview) {
    return (
      <TextReviewModal
        segments={textReviewSegments}
        availableRoles={textReviewRoles}
        availableLayouts={pendingAnalysis?.td.layouts.map((l) => l.name) ?? []}
        headingRoles={textReviewHeadingRoles}
        onConfirm={handleTextReviewConfirm}
        onCancel={() => {
          setShowTextReview(false)
          setPendingAnalysis(null)
          setAnalysing(false)
        }}
      />
    )
  }

  // ── Loading a saved project: clean spinner, no landing-screen flash ──────
  if (projectLoading) {
    return (
      <div className="h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="w-9 h-9 rounded-full border-[3px] border-white/15 border-t-white/70 animate-spin" />
      </div>
    )
  }

  // ── Upload step ────────────────────────────────────────────────────────
  if (step === 'upload') {
    const wizardInner = (
      <AtelierUploadFlow
        file={file}
        isDragging={isDragging}
        fileError={fileError}
        keyImportError={keyImportError}
        analyseError={analyseError}
        analysing={analysing}
        importingKey={importingKey}
        textMode={textMode}
        imageMode={imageMode}
        templateClientId={templateClientId}
        clients={clients}
        htmlTemplates={htmlTemplateOptions}
        clientsLoading={clientsLoading}
        templateClientIds={templateClientIds}
        uploadFileRef={uploadFileRef}
        embedded
        onUploadInputChange={handleUploadInputChange}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onTextModeSelect={setTextMode}
        onImageModeSelect={setImageMode}
        onClientSelect={setTemplateClientId}
        onAnalyse={handleAnalyse}
        onBlankCanvas={startBlankCanvas}
      />
    )

    const hasAtelierPromptChat = atelierPromptMessages.length > 0

    const presentationComposer = (
      <div className={hasAtelierPromptChat ? 'flex h-full min-h-0 w-full flex-col' : 'w-full max-w-3xl px-8'}>
        {!hasAtelierPromptChat && (
          <h1 className="mb-8 text-center text-2xl font-medium tracking-tight text-white/90 sm:text-3xl">
            Maak een presentatie
          </h1>
        )}
        {hasAtelierPromptChat && (
          <div ref={atelierPromptScrollRef} className="min-h-0 flex-1 overflow-y-auto pb-4 pt-6">
            <div className="mx-auto flex min-h-full max-w-3xl flex-col gap-3 px-8">
              {atelierPromptMessages.map((message, index) => (
                <div key={`${message.role}-${index}`} className={message.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                  <div
                    className={[
                      'max-w-[78%] rounded-2xl px-4 py-3 text-left shadow-lg',
                      message.role === 'user'
                        ? 'rounded-tr-md bg-white text-black'
                        : 'rounded-tl-md border border-white/[0.07] bg-[#1c1c1c]/95',
                    ].join(' ')}
                  >
                    {message.role === 'assistant' && (
                      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[#facc15]/80">
                        Atelier{message.model ? ` · ${message.model}` : ''}
                      </p>
                    )}
                    <p className={['text-sm leading-relaxed', message.role === 'user' ? 'text-black' : 'text-white/68'].join(' ')}>
                      {message.content}
                    </p>
                  </div>
                </div>
              ))}
              {atelierPromptWaiting && <AtelierThinkingBubble />}
            </div>
          </div>
        )}
        <form
          onSubmit={(event) => {
            event.preventDefault()
            const prompt = atelierPromptValue.trim()
            if (prompt && !atelierPromptWaiting) {
              setAtelierPromptValue('')
              requestAnimationFrame(() => atelierPromptInputRef.current?.focus())
              setAtelierPromptWaiting(true)
              handleAtelierPromptSubmit(prompt, 'presentation').finally(() => {
                setAtelierPromptWaiting(false)
                requestAnimationFrame(() => atelierPromptInputRef.current?.focus())
              })
            }
          }}
          className={[
            'flex w-full flex-col gap-2 rounded-[2rem] border border-white/[0.05] bg-[#1e1e1e] px-4 py-3 text-left shadow-sm transition-[border-color] duration-300 focus-within:border-white/[0.15]',
            hasAtelierPromptChat ? 'mx-auto max-w-3xl' : '',
          ].join(' ')}
        >
          <input
            ref={atelierPromptInputRef}
            value={atelierPromptValue}
            onChange={(event) => setAtelierPromptValue(event.target.value)}
            placeholder={atelierPromptWaiting ? 'Atelier denkt na…' : 'Vertel wat je met je presentatie wilt maken...'}
            className="h-10 w-full min-w-0 border-none bg-transparent px-3 text-base text-white outline-none placeholder:text-white/40"
          />
          <div className="flex w-full items-center gap-2">
            <button
              type="button"
              onClick={() => uploadFileRef.current?.click()}
              className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-white/65 transition-colors hover:bg-white/[0.08] hover:text-white"
              aria-label="Bestand toevoegen"
              title="Bestand toevoegen"
            >
              <PlusTinyIcon />
            </button>
            {!hasAtelierPromptChat && (
              <>
                <AtelierModeChip
                  icon={ATELIER_CREATION_OPTIONS.find((item) => item.id === 'presentation')?.icon}
                  label="Presentatie"
                  onClear={handleClearAtelierCreationSelect}
                />
              </>
            )}
            <div className="ml-auto flex flex-shrink-0 items-center gap-2">
              {!hasAtelierPromptChat && (
                <button
                  type="button"
                  onClick={startBlankCanvas}
                  className="flex h-8 items-center justify-center rounded-full border border-white/[0.06] bg-white/[0.03] px-3 text-xs text-white/50 transition-colors hover:border-white/[0.14] hover:bg-white/[0.06] hover:text-white"
                >
                  Leeg canvas
                </button>
              )}
              <AtelierModelPickerButton
                models={atelierChatModels}
                selectedModelId={atelierSelectedModelId}
                loading={atelierModelsLoading}
                dropdownPosition={hasAtelierPromptChat ? 'top' : 'bottom'}
                onSelect={setAtelierSelectedModelId}
              />
              <button
                type="submit"
                disabled={atelierPromptWaiting || !atelierPromptValue.trim()}
                className={[
                  'flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full transition-colors',
                  atelierPromptWaiting ? 'bg-white/[0.08] text-white/40' : atelierPromptValue.trim() ? 'bg-white text-black' : 'bg-white/[0.05] text-white/20',
                ].join(' ')}
                aria-label="Verzenden"
              >
                {atelierPromptWaiting ? (
                  <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                  </svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12h14M12 5l7 7-7 7" />
                  </svg>
                )}
              </button>
            </div>
          </div>
        </form>
        {!hasAtelierPromptChat && (
          <AtelierCreationModeButtons
            activeType={atelierCreationType}
            onSelect={handleAtelierCreationSelect}
            className="mt-4"
          />
        )}
      </div>
    )

    const activePresentationProject: AtelierProjectFreshnessTarget | null = projectPath ? {
      id: projectPath,
      type: 'presentation',
      name: projectName ?? 'Presentatie',
      assetRefs: presentationAssetRefs,
      locked: presentationLocked,
    } : null

    const presentationProjectsPanel: AtelierProjectsPanelConfig = {
      type: 'presentation',
      projects: savedPresentations,
      savedProjects: activePresentationProject ? [activePresentationProject] : [],
      activeProjectId: projectPath,
      activeProjectMeta: activePresentationProject ?? undefined,
      onRefreshAssets: handleRefreshActiveProjectAssets,
      onToggleProjectLock: handleToggleActiveProjectLock,
      search: atelierProjectSearch,
      onSearch: setAtelierProjectSearch,
      onNew: () => {
        resetPresentationCreationFlow()
        setShellLevel('landing')
      },
      onSelect: async (projectId) => {
        const res = await (window as any).api?.loadProject?.(projectId)
        const project = (res?.project ?? res) as HupheProject | undefined
        if (!project) return
        await applyLoadedPresentationProject(project)
      },
      onDelete: async (projectId) => {
        await (window as any).api?.deleteProject?.(projectId)
        setSavedPresentations((prev) => prev.filter((p) => p.id !== projectId))
        if (projectPath === projectId) {
          resetPresentationCreationFlow()
          setProjectPath(null)
          setProjectName(null)
          setSupabasePresentationId(null)
          setPresentationAssetRefs([])
          setPresentationCopyRefs([])
          setPresentationLocked(false)
        }
      },
    }

    const presentationSetupShell = (
      <div className={`${embedded ? 'h-full' : 'h-screen'} relative overflow-hidden bg-[#0a0a0a] ${embedded ? '' : 'flex flex-col'}`}>
        <AnimatedPixelBackground />
        {!embedded && sharedHeader}
        <main className="relative z-10 flex h-full min-h-0 flex-1 overflow-hidden">
          <section
            className={[
              'flex min-w-0 flex-1 justify-center px-6',
              hasAtelierPromptChat ? 'items-stretch pb-8 pt-8' : 'items-center',
            ].join(' ')}
          >
            {presentationComposer}
          </section>
          <AtelierRightPanel projectsPanel={presentationProjectsPanel}>
            {wizardInner}
          </AtelierRightPanel>
        </main>
      </div>
    )

    const createSidebar = (
      <AtelierCreationSidebar
        activeType={atelierCreationType}
        onSelect={handleAtelierCreationSelect}
      />
    )

    // Build type-specific sidebar project list
    const sidebarProjects: SidebarProject[] = (() => {
      if (atelierCreationType === 'banners') {
        return savedBannerProjects.map(p => ({
          id: p.id,
          type: 'banners' as const,
          name: p.name,
          subtitle: `${p.slides.length} slide${p.slides.length !== 1 ? 's' : ''} · ${p.enabledFormats.length} formaten`,
          thumbnailSrc: p.imageSrc,
          createdAt: p.createdAt,
        }))
      }
      if (atelierCreationType === 'print') {
        return savedPrintProjects.map(p => ({
          id: p.id,
          type: 'print' as const,
          name: p.name,
          subtitle: `${(p.formats ?? (p.format ? [p.format] : [])).length} formaten`,
          thumbnailSrc: p.imageSrc,
          createdAt: p.createdAt,
        }))
      }
      const mediaType = (atelierCreationType === 'images' || atelierCreationType === 'video') ? atelierCreationType : 'images'
      return atelierMediaProjects
        .filter(p => p.type === mediaType)
        .map(p => ({
          id: p.id,
          type: mediaType as 'images' | 'video',
          name: p.title || 'Project',
          subtitle: p.modelLabel,
          thumbnailSrc: p.src,
          createdAt: p.createdAt,
        }))
    })()

    const sidebarActiveId = atelierCreationType === 'banners' ? activeBannerProjectId
      : atelierCreationType === 'print' ? activePrintProjectId
        : activeAtelierProjectId

    const sidebarType = atelierCreationType && atelierCreationType !== 'presentation' ? atelierCreationType : null
    const showsInlineCreationModeButtons = !!atelierCreationType
    const panelSavedProjects: AtelierSavedProject[] = atelierCreationType === 'banners'
      ? savedBannerProjects
      : atelierCreationType === 'print'
        ? savedPrintProjects
        : []
    const projectPanelConfig: AtelierProjectsPanelConfig | undefined = sidebarType ? {
      type: sidebarType,
      projects: sidebarProjects,
      savedProjects: panelSavedProjects,
      activeProjectId: sidebarActiveId,
      onCrossFormatCreate: handleCrossFormatCreate,
      onRefreshAssets: handleRefreshActiveProjectAssets,
      onToggleProjectLock: handleToggleActiveProjectLock,
      search: atelierProjectSearch,
      onSearch: setAtelierProjectSearch,
      onNew: () => {
          if (atelierCreationType === 'banners') {
            setActiveBannerProjectId(null)
          } else if (atelierCreationType === 'print') {
            clearPrintPayload()
            setActivePrintProjectId(null)
            // keep existing open tabs, just switch to funnel view
            setAtelierCreationResetKey((key) => key + 1)
            return
          } else {
            handleNewAtelierProject()
          }
          setAtelierCreationResetKey((key) => key + 1)
          setShellLevel('funnel')
      },
      onSelect: (projectId) => {
          if (atelierCreationType === 'banners') {
            setActiveBannerProjectId(projectId)
          } else if (atelierCreationType === 'print') {
            setOpenPrintProjectIds((prev) => (prev.includes(projectId) ? prev : [...prev, projectId]))
            setActivePrintProjectId(projectId)
          } else {
            const mp = atelierMediaProjects.find(p => p.id === projectId)
            if (mp) {
              setAtelierCreationType(mp.type)
              setActiveAtelierProjectId(projectId)
            }
          }
      },
      onDelete: (projectId) => {
          if (atelierCreationType === 'banners') handleDeleteBannerProject(projectId)
          else if (atelierCreationType === 'print') handleDeletePrintProject(projectId)
          else handleDeleteAtelierProject(projectId)
      },
      onRename: (projectId, newName) => {
          if (atelierCreationType === 'banners') {
            const p = savedBannerProjects.find((b) => b.id === projectId)
            if (p) handleSaveBannerProject({ ...p, name: newName, updatedAt: new Date().toISOString() })
          } else if (atelierCreationType === 'print') {
            const p = savedPrintProjects.find((b) => b.id === projectId)
            if (p) handleSavePrintProject({ ...p, name: newName, title: newName, updatedAt: new Date().toISOString() })
          } else {
            setAtelierMediaProjects((prev) => prev.map((p) => p.id === projectId ? { ...p, title: newName } : p))
          }
      },
    } : undefined

    const selectedMediaProject = activeAtelierProject?.type === atelierCreationType ? activeAtelierProject : null

    const inactiveCreationPanel = atelierCreationType && atelierCreationType !== 'presentation' && (
      <AtelierCreationPlaceholder
        key={`${atelierCreationType}:${atelierCreationResetKey}`}
        type={atelierCreationType}
        seed={crossFormatSeed?.targetType === atelierCreationType ? crossFormatSeed : null}
        renderBanner={() => (
          <BannerFlow
            onShellLevel={setShellLevel}
            onCreationTypeSelect={handleAtelierCreationSelect}
            onClearCreationType={handleClearAtelierCreationSelect}
            savedProjects={savedBannerProjects}
            activeProjectId={activeBannerProjectId}
            onSaveProject={handleSaveBannerProject}
            mediaAssets={mediaAssets}
            onSaveMediaAsset={handleSaveMediaAsset}
            projectsPanel={projectPanelConfig}
            seed={crossFormatSeed?.targetType === atelierCreationType ? crossFormatSeed : null}
            onPromptSubmit={(prompt) => handleAtelierPromptSubmit(prompt, 'banners')}
            promptMessages={atelierCreationType === 'banners' ? atelierPromptMessages : undefined}
            autonomousInput={atelierCreationType === 'banners' ? pendingBannerAuto : null}
            chatModels={bannerChatModels}
            chatModelsLoading={atelierModelsLoading}
            chatSelectedModelId={bannerSelectedModelId}
            onChatModelSelect={setBannerSelectedModelId}
          />
        )}
        renderPrint={() => {
          const printSeed = crossFormatSeed?.targetType === atelierCreationType ? crossFormatSeed : null
          const printSharedProps = {
            onShellLevel: setShellLevel,
            onCreationTypeSelect: handleAtelierCreationSelect,
            onClearCreationType: handleClearAtelierCreationSelect,
            savedProjects: savedPrintProjects,
            onSaveProject: handleSavePrintProject,
            mediaAssets,
            onSaveMediaAsset: handleSaveMediaAsset,
            projectsPanel: projectPanelConfig,
            seed: printSeed,
            onPromptSubmit: (prompt: string) => handleAtelierPromptSubmit(prompt, 'print'),
            promptMessages: atelierCreationType === 'print' ? atelierPromptMessages : undefined,
            chatModels: printChatModels,
            chatModelsLoading: atelierModelsLoading,
            chatSelectedModelId: printSelectedModelId,
            onChatModelSelect: setPrintSelectedModelId,
          }
          const printTabBar = openPrintProjectIds.length > 0 ? (
            <div className="flex-shrink-0 bg-[#131313]">
              <div className="flex items-end border-b border-white/[0.08] pl-12">
                {openPrintProjectIds.map((tabId) => {
                  const proj = savedPrintProjects.find((p) => p.id === tabId)
                  const isActive = tabId === activePrintProjectId
                  return (
                    <div
                      key={tabId}
                      onClick={() => setActivePrintProjectId(tabId)}
                      className={[
                        'flex min-w-0 max-w-[200px] cursor-pointer select-none items-center gap-1.5 px-4 py-3 transition-colors',
                        isActive
                          ? 'mb-[-1px] rounded-tl-[10px] rounded-tr-[10px] border border-b-[#0a0a0a] border-white/[0.10] bg-[#0a0a0a] text-white/90'
                          : 'text-white/40 hover:text-white/70',
                      ].join(' ')}
                    >
                      <span className="min-w-0 truncate text-[13px] font-semibold leading-none">
                        {proj?.name || 'Project'}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); closePrintTab(tabId) }}
                        className="flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center rounded text-white/35 transition-colors hover:bg-white/[0.14] hover:text-white/75"
                        aria-label="Tab sluiten"
                      >
                        <svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round">
                          <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                      </button>
                    </div>
                  )
                })}
                <button
                  type="button"
                  onClick={() => { clearPrintPayload(); setActivePrintProjectId(null); setAtelierCreationResetKey((k) => k + 1) }}
                  className="mb-2 ml-1 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md text-white/30 transition-colors hover:bg-white/[0.07] hover:text-white/65"
                  title="Nieuw project"
                  aria-label="Nieuw project"
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                </button>
              </div>
            </div>
          ) : undefined
          return (
            <div className="flex flex-col h-full overflow-hidden">
              <div style={{ display: activePrintProjectId === null ? 'flex' : 'none', flex: 1, minHeight: 0 }}>
                <PrintFlow
                  key={`print-new-${atelierCreationResetKey}`}
                  {...printSharedProps}
                  activeProjectId={null}
                  autonomousPayload={atelierCreationType === 'print' ? pendingPrintAuto : null}
                  tabBar={printTabBar}
                />
              </div>
              {openPrintProjectIds.map((tabId) => (
                <div
                  key={tabId}
                  style={{ display: tabId === activePrintProjectId ? 'flex' : 'none', flex: 1, minHeight: 0, flexDirection: 'column', overflow: 'hidden' }}
                >
                  <PrintFlow
                    {...printSharedProps}
                    activeProjectId={tabId}
                    autonomousPayload={atelierCreationType === 'print' && tabId === activePrintProjectId ? pendingPrintAuto : null}
                    tabBar={printTabBar}
                  />
                </div>
              ))}
            </div>
          )
        }}
        renderMedia={() => (
          <AtelierMediaCreationPanel
            type={atelierCreationType}
            project={selectedMediaProject}
            onProjectGenerated={handleAtelierProjectGenerated}
            onCreationTypeSelect={handleAtelierCreationSelect}
            onClearCreationType={handleClearAtelierCreationSelect}
            projectsPanel={projectPanelConfig}
            initialImageSrc={initialImageSrc}
            mediaAssets={mediaAssets}
            onSaveMediaAsset={handleSaveMediaAsset}
            onShellLevel={setShellLevel}
          />
        )}
      />
    )

    if (inactiveCreationPanel) {
      if (embedded) {
        const isEditor = atelierShellLevel === 'editor'
        return (
          <div className={[
            'relative h-full overflow-hidden flex transition-[padding] duration-300',
            isEditor ? 'pl-0 pr-0' : 'pl-6',
          ].join(' ')}>
            {!isEditor && <AnimatedPixelBackground />}
            <div className={['relative z-10 h-full w-full transition-[padding-top] duration-300', atelierShellLevel === 'landing' ? 'pt-14' : 'pt-0'].join(' ')}>
              {inactiveCreationPanel}
            </div>
            {!isEditor && !showsInlineCreationModeButtons && createSidebar}
          </div>
        )
      }
      return (
        <div className="relative h-screen bg-[#0a0a0a] flex flex-col overflow-hidden">
          {atelierShellLevel !== 'editor' && <AnimatedPixelBackground />}
          {sharedHeader}
          <main className="relative z-10 flex-1 flex overflow-hidden pl-6 transition-[padding] duration-300">
            {inactiveCreationPanel}
          </main>
          {atelierShellLevel !== 'editor' && !showsInlineCreationModeButtons && createSidebar}
        </div>
      )
    }

    if (atelierCreationType === 'presentation') {
      return presentationSetupShell
    }

    if (!file) {
      const neutralComposer = (
        <div className="w-full max-w-3xl px-8">
          <h1 className="mb-8 text-center text-2xl font-medium tracking-tight text-white/90 sm:text-3xl">
            Let's huphefy some stuff.
          </h1>
          <div className="flex w-full flex-col gap-2 rounded-[2rem] border border-white/[0.05] bg-[#1e1e1e] px-4 py-3 text-left shadow-sm">
            <div className="flex h-10 items-center px-3 text-base text-white/40">
              Kies hieronder wat je wilt maken
            </div>
            <div className="flex w-full items-center gap-2">
              <button
                type="button"
                className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-white/35"
                aria-label="Nog geen type gekozen"
                title="Kies eerst wat je wilt maken"
              >
                <PlusTinyIcon />
              </button>
              <span className="text-sm text-white/32">Geen item geselecteerd</span>
            </div>
          </div>
          <AtelierCreationModeButtons
            activeType={atelierCreationType}
            onSelect={handleAtelierCreationSelect}
            className="mt-4"
          />
        </div>
      )

      if (embedded) {
        return (
          <div className="relative h-full overflow-hidden flex items-center justify-center pl-6 transition-[padding] duration-300">
            <AnimatedPixelBackground />
            <div className="relative z-10 w-full flex justify-center">
              {inactiveCreationPanel || neutralComposer}
            </div>
          </div>
        )
      }
      return (
        <div className="relative h-screen bg-[#0a0a0a] flex flex-col overflow-hidden">
          <AnimatedPixelBackground />
          {sharedHeader}
          <main className="relative z-10 flex-1 flex items-center justify-center pl-6 transition-[padding] duration-300">
            {inactiveCreationPanel || neutralComposer}
          </main>
        </div>
      )
    }

    if (embedded) {
      return (
        <div className="relative h-full overflow-hidden">
          <div className="h-full overflow-y-auto flex items-start justify-center pl-6 py-10 transition-[padding] duration-300">
            {wizardInner}
          </div>
          {createSidebar}
        </div>
      )
    }
    return (
      <div className="relative h-screen bg-[#0a0a0a] flex flex-col overflow-hidden">
        {sharedHeader}
        <main className="flex-1 overflow-y-auto flex items-start justify-center pl-6 py-10 transition-[padding] duration-300">
          {wizardInner}
        </main>
        {createSidebar}
      </div>
    )
  }

  // ── ReadOnly viewer ────────────────────────────────────────────────────
  if (live.isLive && !live.isOwner && templateData && blocks.length > 0) {
    const vBlock = blocks[Math.min(activeIdx, blocks.length - 1)]
    const vSageTags = getSageTags(vBlock.type, templateData, mappings)
    const vPreview = buildPreviewBlock(vBlock, overrides, sageTagMappings, vSageTags)
    return (
      <div className="h-screen bg-[#0a0a0a] flex flex-col overflow-hidden">
        {sharedHeader}
        <div className="flex-1 flex items-center justify-center relative overflow-hidden">
          <div
            style={{
              width: 1920,
              height: 1080,
              transform: `scale(${Math.min((window.innerWidth - 80) / 1920, (window.innerHeight - 120) / 1080)})`,
              transformOrigin: 'center',
              flexShrink: 0,
            }}
          >
            <WebSlidePreview
              block={vPreview}
              templateData={templateData}
              slideNumber={activeIdx + 1}
              mappings={mappings}
              bgColors={bgColors}
              imagePlaceholderUrl={placeholderUrl}
              imageOffset={vBlock.imageOffset}
              imageAlign={vBlock.imageAlign}
              imageFit={vBlock.imageFit}
              imageScale={vBlock.imageScale}
              imageRotation={vBlock.imageRotation}
              imageFlipX={vBlock.imageFlipX}
              imageFlipY={vBlock.imageFlipY}
              logoUrl={vBlock.logoUrl}
            />
          </div>

          {/* Live viewer badge */}
          <div className="absolute bottom-5 left-1/2 -translate-x-1/2 flex items-center gap-2.5 bg-black/60 backdrop-blur border border-white/[0.08] rounded-full px-4 py-2">
            <span className="relative flex h-2 w-2 flex-shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-400" />
            </span>
            <span className="text-white/60 text-xs">Je kijkt live mee</span>
            <span className="text-white/25 text-xs font-mono">
              {String(activeIdx + 1).padStart(2, '0')} / {blocks.length}
            </span>
          </div>
        </div>
      </div>
    )
  }

  // ── Meeting notes panel ─────────────────────────────────────────────────
  const notesPanel = notesOpen && <MeetingNotesDrawer meeting={meeting} projectName={projectName} onClose={() => setNotesOpen(false)} />

  // ── Editor step ────────────────────────────────────────────────────────
  return (
    <div className={`${embedded ? 'h-full' : 'h-screen'} bg-[#0a0a0a] flex flex-col overflow-hidden`}>
      {!pdfExporting && (
        <>
          {liveSuccessModal}
          {liveStopModal}
          {shareModal}
          <SharePermissionsModal
            open={sharePermissionsOpen}
            onClose={() => setSharePermissionsOpen(false)}
            members={shareMembers}
            onInvite={handleSharePermissionsInvite}
            onChangeRole={handleSharePermissionsChangeRole}
            onRemove={handleSharePermissionsRemove}
          />
          {notesPanel}
          {preflightOpen && (
            <ExportPreflightModal
              issues={preflightIssues}
              onConfirm={() => {
                setPreflightOpen(false)
                if (preflightTarget === 'keynote') handleExport()
                else if (preflightTarget === 'pdf') handleExportPdf()
              }}
              onCancel={() => setPreflightOpen(false)}
            />
          )}
        </>
      )}

      {/* Voice status toast */}
      {!pdfExporting && (voice.status === 'listening' || voice.status === 'processing' || voice.status === 'done' || voice.status === 'error') && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] flex flex-col items-center gap-2 pointer-events-none">
          <div className={`flex items-center gap-3 px-4 py-3 rounded-2xl shadow-2xl border text-sm backdrop-blur-sm ${voice.status === 'error'
            ? 'bg-red-950/80 border-red-500/30 text-red-300'
            : voice.status === 'done'
              ? 'bg-green-950/80 border-green-500/30 text-green-300'
              : 'bg-[#1a1a1a]/90 border-white/[0.09] text-white/80'
            }`}>
            {voice.status === 'listening' && (
              <span className="relative flex h-2.5 w-2.5 flex-shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-400" />
              </span>
            )}
            {voice.status === 'processing' && (
              <svg className="animate-spin flex-shrink-0" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
            )}
            {voice.status === 'done' && (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            )}
            {voice.status === 'error' && (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            )}
            <span className="max-w-sm">
              {voice.status === 'listening' && 'Luisteren… spreek je commando uit'}
              {voice.status === 'processing' && (voice.transcript ? `"${voice.transcript}"` : 'Verwerken…')}
              {voice.status === 'done' && (voice.explanation || 'Slide bijgewerkt')}
              {voice.status === 'error' && voice.error}
            </span>
          </div>
        </div>
      )}

      {/* Hidden file input for replacing MD in editor */}
      <input
        ref={editorFileRef}
        type="file"
        accept=".md,.txt"
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) f.text().then((t) => setMdText(t))
          e.target.value = ''
        }}
      />

      {/* PDF capture canvas — position:fixed so it sits above all app UI during export */}
      {templateData && (
        <PdfExportCapture
          captureRef={pdfSlideRef}
          isExporting={pdfExporting}
          captureSize={pdfCaptureSize}
          canvasScale={pdfCanvasScale}
          slideIdx={pdfSlideIdx}
          blocks={blocks}
          templateData={templateData}
          mappings={mappings}
          bgColors={bgColors}
          overrides={overrides}
          sageTagMappings={sageTagMappings}
          placeholderUrl={placeholderUrl}
        />
      )}

      {/* PDF export progress */}
      <ExportProgressModal
        open={pdfExporting}
        step={`Slide ${pdfSlideIdx + 1} van ${blocks.length} verwerken`}
        progress={blocks.length > 0 ? Math.round(((pdfSlideIdx + 1) / blocks.length) * 100) : 0}
      />

      {presenting && templateData && blocks.length > 0 && (() => {
        const presentationBlocks = blocks.map((b) => {
          const st = getCachedSageTags(b.type, templateData, mappings, () => getSageTags(b.type, templateData, mappings))
          return getCachedPreviewBlock(b, overrides, sageTagMappings, st, () => buildPreviewBlock(b, overrides, sageTagMappings, st))
        })
        return (
          <PresentationModeOverlay
            blocks={presentationBlocks}
            activeIdx={activeIdx}
            templateData={templateData}
            mappings={mappings}
            bgColors={bgColors}
            imagePlaceholderUrl={placeholderUrl}
            onClose={() => {
              ;(window as any).api?.setFullScreen?.(false)
              setPresenting(false)
            }}
            onNext={() => setActiveIdx((i) => {
              let next = i + 1
              while (next < blocks.length && blocks[next]?.hidden) next++
              return Math.min(blocks.length - 1, next)
            })}
            onPrev={() => setActiveIdx((i) => {
              let prev = i - 1
              while (prev >= 0 && blocks[prev]?.hidden) prev--
              return Math.max(0, prev)
            })}
          />
        )
      })()}

      {['fonts', 'keynote', 'correcting'].includes(calibration.progress.phase) && (
        <div
          style={{
            position: 'fixed', bottom: 16, left: 16, zIndex: 9999,
            background: 'rgba(17,17,17,0.92)', color: 'rgba(255,255,255,0.85)',
            border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8,
            padding: '8px 12px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 8,
            backdropFilter: 'blur(8px)', pointerEvents: 'none',
          }}
        >
          <span style={{
            width: 8, height: 8, borderRadius: '50%', background: '#facc15',
            animation: 'pulse 1.2s ease-in-out infinite',
          }} />
          {calibration.progress.phase === 'fonts' && 'Fonts controleren…'}
          {calibration.progress.phase === 'keynote' && 'Keynote-referenties maken…'}
          {calibration.progress.phase === 'correcting' && (
            <>Template optimaliseren met AI… {calibration.progress.completed}/{calibration.progress.total}
              {calibration.progress.current ? ` — ${calibration.progress.current}` : ''}
              {calibration.progress.iteration ? ` (ronde ${calibration.progress.iteration})` : ''}</>
          )}
        </div>
      )}

      {!pdfExporting && sharedHeader}

      {/* ── Editor: two columns ─────────────────────────────────────────── */}
      <div ref={editorContainerRef} className={`relative flex-1 flex min-h-0${pdfExporting ? ' hidden' : ''}`}>
        {/* Draggable divider between left and right panel */}
        <div
          className={[
            'absolute top-0 bottom-0 z-30 w-1 transition-opacity duration-300 group',
            rightPanelOpen ? 'opacity-100 cursor-col-resize' : 'opacity-0 pointer-events-none',
          ].join(' ')}
          style={{ left: `calc(${leftPanelPct}% - 2px)` }}
          onMouseDown={rightPanelOpen ? startLeftResize : undefined}
        >
          <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-px bg-white/[0.10] group-hover:bg-white/[0.28] transition-colors" />
        </div>
        <button
          type="button"
          onClick={() => setRightPanelOpen((open) => !open)}
          title={rightPanelOpen ? 'Menu inklappen' : 'Menu uitklappen'}
          aria-label={rightPanelOpen ? 'Menu inklappen' : 'Menu uitklappen'}
          className="absolute top-2.5 z-40 w-8 h-8 rounded-full flex items-center justify-center text-white/38 hover:text-white/75 hover:bg-white/[0.08] transition-all duration-300 ease-in-out"
          style={{ left: rightPanelOpen ? `calc(${leftPanelPct}% + 12px)` : 'calc(100% - 52px)' }}
        >
          <IcoPanelToggle open={rightPanelOpen} size={18} />
        </button>
        <div
          className={[
            'absolute top-2.5 z-40 h-8 w-px bg-white/[0.10] pointer-events-none transition-opacity duration-300',
            rightPanelOpen ? 'opacity-0' : 'opacity-100',
          ].join(' ')}
          style={{ left: 'calc(100% - 68px)' }}
        />

        {/* Left: scrollable slide previews ─────────────────────────────── */}
        <LeftEditorPanel
          leftColRef={leftColRef}
          leftPanelPct={rightPanelOpen ? leftPanelPct : 100}
          rightPanelOpen={rightPanelOpen}
          nameEditing={nameEditing}
          projectName={projectName}
          activeIdx={activeIdx}
          blocks={blocks}
          selectedSlideIds={selectedSlideIds}
          templateData={templateData}
          bulkLayoutOpen={bulkLayoutOpen}
          viewMode={viewMode}
          showHiddenSlides={showHiddenSlides}
          setShowHiddenSlides={setShowHiddenSlides}
          onToggleHideSlide={toggleHideSlide}
          blockOffsets={blockOffsets}
          blockDisplayHeights={blockDisplayHeights}
          historyCounts={historyCounts}
          slideScale={slideScale}
          virtualSlideRowHeight={virtualSlideRowHeight}
          virtualStartIdx={virtualStartIdx}
          virtualEndIdx={virtualEndIdx}
          virtualPreviewHeight={virtualPreviewHeight}
          docHeadingRoles={docHeadingRoles}
          showFidelityReport={showFidelityReport}
          fidelityItems={fidelityItems}
          importBanner={importBanner}
          slideRefs={slideRefs}
          stableBlockCallbacks={stableBlockCallbacks}
          slideComments={slideComments}
          annotatingState={annotatingState}
          drawTool={drawTool}
          drawColor={drawColor}
          drawStrokeWidth={drawStrokeWidth}
          hoveredCommentId={hoveredCommentId}
          hoveredLayerTarget={hoveredLayerTarget}
          placingComment={placingComment}
          overrides={overrides}
          sageTagMappings={sageTagMappings}
          mappings={mappings}
          imgGenState={imgGenState}
          bgColors={bgColors}
          placeholderUrl={placeholderUrl}
          previewScrollerRef={previewScrollerRef}
          onPreviewScroll={(scrollTop) => setPreviewScrollTop(scrollTop)}
          onRenameProject={handleRenameProject}
          setNameEditing={setNameEditing}
          setBulkLayoutOpen={setBulkLayoutOpen}
          setBlocks={setBlocks}
          onRemoveSelectedSlides={removeSelectedSlides}
          onClearSlideSelection={clearSlideSelection}
          setViewMode={setViewMode}
          onUndo={undoEditorChange}
          onRedo={redoEditorChange}
          onStartPresenting={() => {
            const api = (window as any).api
            if (api?.setFullScreen) {
              api.setFullScreen(true)
              // Wait for fullscreen to settle before rendering the overlay,
              // so getPresentationScale() reads the correct screen dimensions.
              setTimeout(() => setPresenting(true), 250)
            } else {
              setPresenting(true)
            }
          }}
          slideTypeMenuOpen={slideTypeMenuOpen}
          setSlideTypeMenuOpen={setSlideTypeMenuOpen}
          onChangeSlideType={changeSlideType}
          onUpdateContent={updateContent}
          onToggleDynamicDateField={toggleDynamicDateField}
          onSlideSelect={handleSlideSelect}
          setShowFidelityReport={setShowFidelityReport}
          setImportBanner={setImportBanner}
          setDrawTool={setDrawTool}
          setDrawColor={setDrawColor}
          setDrawStrokeWidth={setDrawStrokeWidth}
          onStopAnnotating={stopAnnotating}
          onDrawingComplete={attachDrawingToComment}
          onHighlightComplete={attachHighlightToComment}
          onCommentPinHover={setHoveredCommentId}
          onPlaceComment={placeCommentAtPosition}
          onAddSlide={addSlide}
          onAddTableSlide={addTableSlide}
          onMoveSlide={moveSlide}
          onCanvasPromptSubmit={handleCanvasPrompt}
          canvasPromptLoading={canvasPromptLoading}
          tabBar={presentationTabs.length > 0 ? (
            <div className="flex-shrink-0 bg-[#131313]">
              <div className="flex items-end border-b border-white/[0.08] pl-4 overflow-x-auto">
                {presentationTabs.map((tab) => {
                  const isActive = tab.id === activePresentationTabId
                  return (
                    <div
                      key={tab.id}
                      onClick={() => { setActivePresentationTabId(tab.id); openPresentationTab(tab.path, tab.name) }}
                      className={[
                        'flex min-w-0 max-w-[180px] cursor-pointer select-none items-center gap-1.5 px-3 py-2.5 transition-colors flex-shrink-0',
                        isActive
                          ? 'mb-[-1px] rounded-tl-[10px] rounded-tr-[10px] border border-b-[#0d0d0d] border-white/[0.10] bg-[#0d0d0d] text-white/90'
                          : 'text-white/40 hover:text-white/65',
                      ].join(' ')}
                    >
                      <span className="min-w-0 truncate text-[12px] font-medium leading-none">{tab.name}</span>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); closePresentationTab(tab.id) }}
                        className="flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center rounded text-white/35 transition-colors hover:bg-white/[0.14] hover:text-white/75"
                        aria-label="Tab sluiten"
                      >
                        <svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round">
                          <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : undefined}
        />

        {/* Right: field editor ──────────────────────────────────────────── */}
        <RightEditorPanel
          rightPanelOpen={rightPanelOpen}
          editorFileRef={editorFileRef}
          blocks={blocks}
          showHiddenSlides={showHiddenSlides}
          templateClientId={templateClientId}
          changeTheme={changeTheme}
          clientsLoading={clientsLoading}
          clientsWithTemplate={clientsWithTemplate}
          htmlTemplates={htmlTemplateOptions}
          clientName={clientName}
          slideComments={slideComments}
          rightTab={rightTab}
          setRightTab={setRightTab}
          activeIdx={activeIdx}
          selectedSlideIds={selectedSlideIds}
          selectedSlideIdsRef={selectedSlideIdsRef}
          expandedCardIds={expandedCardIds}
          setExpandedCardIds={setExpandedCardIds}
          collapsedTextSectionIds={collapsedTextSectionIds}
          collapsedImageSectionIds={collapsedImageSectionIds}
          collapsedAssetsSectionIds={collapsedAssetsSectionIds}
          toggleTextSection={toggleTextSection}
          toggleImageSection={toggleImageSection}
          toggleAssetsSection={toggleAssetsSection}
          openImageAdjustIds={openImageAdjustIds}
          focusedField={focusedField}
          hoveredLayerTarget={hoveredLayerTarget}
          cardRefs={cardRefs}
          overrides={overrides}
          sageTagMappings={sageTagMappings}
          templateData={templateData}
          mappings={mappings}
          onSlideSelect={handleSlideSelect}
          onLayerFieldHover={handlePreviewFieldHover}
          onLayerImageHover={handlePreviewImageHover}
          onMoveSlide={moveSlide}
          onSetActiveIdx={setActiveIdx}
          onSetSlideSelection={setSlideSelection}
          onSetLastSelectedIdx={setLastSelectedIdx}
          onToggleImageAdjust={(blockId) => setOpenImageAdjustIds((prev) => {
            const next = new Set(prev); if (next.has(blockId)) next.delete(blockId); else next.add(blockId); return next
          })}
          onToggleHideSlide={toggleHideSlide}
          onRemoveSlide={removeSlide}
          onImageInsert={(blockId, slotIndex) => { void pickImageForBlock(blockId, slotIndex ?? 0) }}
          onToggleLockField={toggleLockField}
          onToggleHiddenField={toggleHiddenField}
          onToggleDynamicDateField={toggleDynamicDateField}
          onSelectLogo={selectSlideLogo}
          onLinkFields={linkTextFields}
          onUnlinkField={unlinkTextField}
          onTableDimensionsChange={handleTableDimensionsChange}
          onLayoutTableDimensionsChange={handleLayoutTableDimensionsChange}
          onImageAI={(blockId) => doGenerateImage(blockId, '')}
          onImagePromptOpen={(blockId) => {
            setImgGenState((prev) => ({ ...prev, [blockId]: { ...prev[blockId] ?? { prompt: '', loading: false, error: '' }, open: true } }))
          }}
          onUpdateImageFit={updateImageFit}
          onUpdateImageAlign={updateImageAlign}
          onUpdateImageScale={updateImageScale}
          onUpdateImageRotation={updateImageRotation}
          onToggleImageFlip={toggleImageFlip}
          onRemoveImage={removeImage}
          onChangeSlideType={changeSlideType}
          commentDraft={commentDraft}
          setCommentDraft={setCommentDraft}
          placingComment={placingComment}
          annotatingState={annotatingState}
          onAddCommentDraw={(blockId) => addCommentAndAnnotate(blockId, 'draw')}
          onAddCommentHighlight={(blockId) => addCommentAndAnnotate(blockId, 'highlight')}
          onBeginPlacingComment={beginPlacingComment}
          onStopPlacingComment={stopPlacingComment}
          onResolveComment={resolveSlideComment}
          onDeleteComment={deleteSlideComment}
          onStartDrawAnnotation={startDrawingAnnotation}
          onStartHighlightAnnotation={startHighlightAnnotation}
          onHoverComment={setHoveredCommentId}
          globalStylePrompt={globalStylePrompt}
          setGlobalStylePrompt={setGlobalStylePrompt}
          pdfExporting={pdfExporting}
          exportError={exportError}
          projectName={projectName}
          autoSaveStatus={autoSaveStatus}
          projectPath={projectPath}
          exportRef={exportRef}
          exportOpen={exportOpen}
          setExportOpen={setExportOpen}
          exporting={exporting}
          onSave={() => handleSave()}
          saving={saving}
          onExportPreflight={openExportPreflight}
          onExportPptx={handleExportPptx}
          onPdfPreflight={openPdfPreflight}
          onExportJson={handleExportJson}
          viewMode={viewMode}
          chatMessages={chatMessages}
          chatIsWaiting={canvasPromptLoading}
          forceChatTab={forceChatTab}
          hiddenTabs={hiddenRightTabs}
          onToggleRightTab={toggleRightTab}
        />
      </div>
    </div>
  )
}
