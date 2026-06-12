import { useEffect, useState } from 'react'
import type { PrintFunnelPayload } from '../components/PrintFunnelStep'
import type { SavedPrintProject } from '../lib/atelier-project-store'
import { resolveAssetSrc } from '../lib/asset-library'
import { loadCopyBlocks } from '../lib/copy-library'
import { loadLinkedTextSourcesAsync, resolveTypewriterLinkedText } from '../lib/atelier-linked-sources'
import type { MediaAsset } from '../lib/media-asset-store'
import type { CrossFormatSeed } from '../lib/atelier-cross-format'

const PRINT_PAYLOAD_KEY = 'huphe_print_payload'

export interface GeneratedMedia {
  formatId: string
  html: string
}

export function useAtelierPrint({
  savedProjects,
  activeProjectId,
  onSaveProject,
  onSaveMediaAsset,
  onShellLevel,
  seed,
  getSeedAsset,
  getSeedCopy,
  getSeedCopyIds,
}: {
  savedProjects: SavedPrintProject[]
  activeProjectId: string | null
  onSaveProject: (project: SavedPrintProject) => void
  onSaveMediaAsset?: (asset: MediaAsset) => void
  onShellLevel?: (level: 'landing' | 'funnel' | 'editor') => void
  seed?: CrossFormatSeed | null
  getSeedAsset: (seed?: CrossFormatSeed | null) => { assetId?: string; src?: string }
  getSeedCopy: (seed?: CrossFormatSeed | null) => { heading: string; body: string; button: string }
  getSeedCopyIds: (seed?: CrossFormatSeed | null) => { titleCopyBlockId?: string; bodyCopyBlockId?: string }
}) {
  const [step, setStep] = useState<'input' | 'result'>(() => activeProjectId ? 'result' : 'input')
  const [payload, setPayload] = useState<PrintFunnelPayload | null>(() => {
    const saved = loadPrintPayload()
    if (saved) return saved
    const seedAsset = getSeedAsset(seed)
    const seedCopy = getSeedCopy(seed)
    const seedCopyIds = getSeedCopyIds(seed)
    if (!seedAsset.src && !seedCopy.heading && !seedCopy.body) return null
    return {
      title: seedCopy.heading,
      body: seedCopy.body,
      titleCopyBlockId: seedCopyIds.titleCopyBlockId,
      bodyCopyBlockId: seedCopyIds.bodyCopyBlockId,
      imageSrc: seedAsset.src,
      assetId: seedAsset.assetId,
      formats: [],
    }
  })
  const [generatedMedia, setGeneratedMedia] = useState<GeneratedMedia[]>([])
  const [generating, setGenerating] = useState(() => !!activeProjectId)
  const [error, setError] = useState('')
  const [saveConfirm, setSaveConfirm] = useState(false)

  useEffect(() => {
    if (step === 'result') onShellLevel?.('editor')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step])

  useEffect(() => {
    if (!activeProjectId) return
    const saved = savedProjects.find((item) => item.id === activeProjectId)
    if (!saved) return
    let cancelled = false
    const loadedPayload: PrintFunnelPayload = {
      title: saved.title,
      body: saved.body,
      imageSrc: resolveAssetSrc(saved.assetId, saved.imageSrc),
      assetId: saved.assetId,
      titleCopyBlockId: saved.titleCopyBlockId,
      bodyCopyBlockId: saved.bodyCopyBlockId,
      titleCopyOverride: saved.titleCopyOverride,
      bodyCopyOverride: saved.bodyCopyOverride,
      lockedCopy: saved.lockedCopy,
      format: saved.format,
      formats: saved.formats ?? (saved.format ? [saved.format] : []),
    }
    setPayload(loadedPayload)
    setGeneratedMedia([])
    setStep('result')
    onShellLevel?.('editor')
    void resolveLinkedCopyForProject(loadedPayload, `print:${saved.id}`).then((resolvedPayload) => {
      if (cancelled) return
      setPayload(resolvedPayload)
      if (saved.htmlByFormat && Object.keys(saved.htmlByFormat).length > 0) {
        const restored: GeneratedMedia[] = Object.entries(saved.htmlByFormat).map(([formatId, html]) => ({ formatId, html }))
        setGeneratedMedia(restored)
        setGenerating(false)
        onShellLevel?.('editor')
      } else {
        void generatePrint(resolvedPayload, { persist: false })
      }
    })
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProjectId])

  async function resolveLinkedCopyForProject(nextPayload: PrintFunnelPayload, targetProjectId?: string): Promise<PrintFunnelPayload> {
    if (!targetProjectId || (!nextPayload.titleCopyBlockId && !nextPayload.bodyCopyBlockId)) return nextPayload
    const blocks = await loadLinkedTextSourcesAsync({ targetId: targetProjectId })
    const titleBlock = nextPayload.titleCopyBlockId
      ? blocks.find((block) => block.id === nextPayload.titleCopyBlockId)
      : undefined
    const bodyBlock = nextPayload.bodyCopyBlockId
      ? blocks.find((block) => block.id === nextPayload.bodyCopyBlockId)
      : undefined
    const typewriterTitle = await resolveTypewriterLinkedText(nextPayload.titleCopyBlockId, {
      targetId: targetProjectId,
      roles: ['print-title'],
    })
    const typewriterBody = await resolveTypewriterLinkedText(nextPayload.bodyCopyBlockId, {
      targetId: targetProjectId,
      roles: ['print-body'],
    })
    const isTypewriterTitle = nextPayload.titleCopyBlockId?.startsWith('typewriter:')
    const isTypewriterBody = nextPayload.bodyCopyBlockId?.startsWith('typewriter:')
    return {
      ...nextPayload,
      title: nextPayload.titleCopyBlockId ? typewriterTitle || (isTypewriterTitle ? '' : titleBlock?.content) || '' : nextPayload.title,
      body: nextPayload.bodyCopyBlockId ? typewriterBody || (isTypewriterBody ? '' : bodyBlock?.content) || '' : nextPayload.body,
    }
  }

  async function generatePrint(nextPayload: PrintFunnelPayload, options: { persist?: boolean } = {}) {
    const persist = options.persist ?? true
    setPayload(nextPayload)
    if (persist) savePrintPayload(nextPayload)
    setGenerating(true)
    setError('')
    try {
      const res = await (window as any).api.print.generate(nextPayload) as { ok: boolean; prints?: GeneratedMedia[]; print?: GeneratedMedia; error?: string }
      const prints = (res as any).prints ?? (res.print ? [res.print] : [])
      if (!res.ok || prints.length === 0) {
        setError(res.error ?? 'Genereren mislukt.')
        setGenerating(false)
        return
      }
      setGeneratedMedia(prints)
      setStep('result')
      onShellLevel?.('editor')
    } catch (err: any) {
      setError(err.message ?? 'Genereren mislukt.')
    } finally {
      setGenerating(false)
    }
  }

  async function handleComplete(nextPayload: PrintFunnelPayload) {
    const now = new Date().toISOString()
    let payloadToGenerate = nextPayload
    if (payloadToGenerate.imageSrc && !payloadToGenerate.assetId && onSaveMediaAsset) {
      const newAssetId = `asset_${Date.now()}`
      onSaveMediaAsset({ id: newAssetId, name: 'Media afbeelding', src: payloadToGenerate.imageSrc, mimeType: 'image/jpeg', createdAt: now, updatedAt: now })
      payloadToGenerate = { ...payloadToGenerate, assetId: newAssetId }
    }
    await generatePrint(payloadToGenerate)
  }

  function handleSave(html: string, formatId: string) {
    if (!payload) return
    const id = activeProjectId ?? `print_${Date.now()}`
    const existingProject = savedProjects.find((item) => item.id === id)
    const assetRefs = payload.assetId
      ? [{ assetId: payload.assetId, role: 'background' as const, slotId: 'print-image', sourceUpdatedAt: existingProject?.assetRefs?.[0]?.sourceUpdatedAt ?? new Date().toISOString() }]
      : existingProject?.assetRefs
    const copyBlocks = loadCopyBlocks()
    const copyRefs: SavedPrintProject['copyRefs'] = [
      ...(payload.titleCopyBlockId ? [{
        copyBlockId: payload.titleCopyBlockId,
        role: 'title' as const,
        slotId: 'print-title',
        sourceUpdatedAt: copyBlocks.find((block) => block.id === payload.titleCopyBlockId)?.updatedAt,
        locked: payload.lockedCopy,
      }] : []),
      ...(payload.bodyCopyBlockId ? [{
        copyBlockId: payload.bodyCopyBlockId,
        role: 'body' as const,
        slotId: 'print-body',
        sourceUpdatedAt: copyBlocks.find((block) => block.id === payload.bodyCopyBlockId)?.updatedAt,
        locked: payload.lockedCopy,
      }] : []),
    ]
    const existingHtmlByFormat = existingProject?.htmlByFormat ?? {}
    onSaveProject({
      id,
      type: 'print',
      name: payload.title || `Media ${new Date().toLocaleDateString('nl')}`,
      title: payload.title,
      body: payload.body,
      imageSrc: payload.imageSrc,
      assetId: payload.assetId,
      titleCopyBlockId: payload.titleCopyBlockId,
      bodyCopyBlockId: payload.bodyCopyBlockId,
      titleCopyOverride: payload.titleCopyOverride,
      bodyCopyOverride: payload.bodyCopyOverride,
      lockedCopy: payload.lockedCopy,
      format: payload.format ?? payload.formats[0],
      formats: payload.formats,
      htmlByFormat: { ...existingHtmlByFormat, [formatId]: html },
      assetRefs,
      copyRefs,
      locked: existingProject?.locked,
      createdAt: existingProject?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    setSaveConfirm(true)
    setTimeout(() => setSaveConfirm(false), 2000)
  }

  function backToInput() {
    setStep('input')
    onShellLevel?.('funnel')
  }

  function importHtml(html: string, width: number, height: number) {
    setGeneratedMedia([{ formatId: `converted-${width}x${height}`, html }])
    setStep('result')
    onShellLevel?.('editor')
  }

  return {
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
  }
}

export function loadPrintPayload(): PrintFunnelPayload | null {
  try {
    const payload = JSON.parse(localStorage.getItem(PRINT_PAYLOAD_KEY) ?? 'null') as (Partial<PrintFunnelPayload> | null)
    if (!payload) return null
    return {
      title: payload.title ?? '',
      body: payload.body ?? '',
      imageSrc: payload.imageSrc,
      assetId: payload.assetId,
      titleCopyBlockId: payload.titleCopyBlockId,
      bodyCopyBlockId: payload.bodyCopyBlockId,
      titleCopyOverride: payload.titleCopyOverride,
      bodyCopyOverride: payload.bodyCopyOverride,
      lockedCopy: payload.lockedCopy,
      format: payload.format,
      formats: payload.formats?.length ? payload.formats : (payload.format ? [payload.format] : []),
    }
  } catch {
    return null
  }
}

export function savePrintPayload(payload: PrintFunnelPayload) {
  localStorage.setItem(PRINT_PAYLOAD_KEY, JSON.stringify(payload))
}

export function clearPrintPayload() {
  localStorage.removeItem(PRINT_PAYLOAD_KEY)
}
