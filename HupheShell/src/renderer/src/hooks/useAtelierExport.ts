import { useState, useRef, useCallback } from 'react'
import type React from 'react'
import type { Block } from '../lib/editor-types'
import { isHtmlTemplateClientId, htmlTemplateIdFromClientId, getHtmlPresentationTemplate } from '../lib/html-presentation-templates'

interface PreflightIssue {
  severity: 'error' | 'warning'
  slideIndex?: number
  message: string
}

export interface UseAtelierExportOptions {
  blocks: Block[]
  templateData: { layouts: Array<{ name: string }> } | null
  templateClientId: string
  projectName: string | null
  templateName: string | null
  sageTagMappings: Record<string, Record<string, string>>
  userTagNames: Record<string, Record<string, string>>
  buildExportBlocks: () => Block[]
}

export interface UseAtelierExportReturn {
  exporting: boolean
  exportError: string
  exportOpen: boolean
  pdfExporting: boolean
  pdfSlideIdx: number
  pdfCanvasScale: number
  pdfCaptureSize: { w: number; h: number }
  pdfSlideRef: React.RefObject<HTMLDivElement | null>
  preflightOpen: boolean
  preflightTarget: 'keynote' | 'pdf' | null
  preflightIssues: PreflightIssue[]

  setExportOpen: React.Dispatch<React.SetStateAction<boolean>>
  setExportError: (err: string) => void
  setPreflightOpen: (open: boolean) => void
  setPdfSlideIdx: React.Dispatch<React.SetStateAction<number>>

  handleExportPptx: () => Promise<void>
  handleExport: () => Promise<void>
  handleExportPdf: () => Promise<void>
  handleExportJson: () => void
  openExportPreflight: () => void
  openPdfPreflight: () => void
  runPreflight: () => PreflightIssue[]
}

export function useAtelierExport(options: UseAtelierExportOptions): UseAtelierExportReturn {
  const {
    blocks, templateData, templateClientId, projectName, templateName,
    sageTagMappings, userTagNames, buildExportBlocks,
  } = options

  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState('')
  const [exportOpen, setExportOpen] = useState(false)
  const [pdfExporting, setPdfExporting] = useState(false)
  const [pdfSlideIdx, setPdfSlideIdx] = useState(0)
  const [pdfCanvasScale, setPdfCanvasScale] = useState(1)
  const [pdfCaptureSize, setPdfCaptureSize] = useState({ w: 0, h: 0 })
  const pdfSlideRef = useRef<HTMLDivElement>(null)
  const [preflightOpen, setPreflightOpen] = useState(false)
  const [preflightTarget, setPreflightTarget] = useState<'keynote' | 'pdf' | null>(null)
  const [preflightIssues, setPreflightIssues] = useState<PreflightIssue[]>([])

  const runPreflight = useCallback(() => {
    const issues: PreflightIssue[] = []
    if (!templateClientId || !templateData) {
      issues.push({ severity: 'error', message: 'Geen template geselecteerd.' })
    } else {
      const layoutNames = new Set(templateData.layouts.map((l) => l.name))
      blocks.forEach((block, i) => {
        if (!block.heading && !block.body && Object.values(block.fields ?? {}).every((v) => !v)) {
          issues.push({ severity: 'warning', slideIndex: i, message: `Slide ${i + 1} lijkt leeg te zijn.` })
        }
        if (!layoutNames.has(block.type)) {
          issues.push({ severity: 'error', slideIndex: i, message: `Layout '${block.type}' op slide ${i + 1} is niet gevonden in het template.` })
        }
      })
    }
    return issues
  }, [blocks, templateClientId, templateData])

  const openExportPreflight = useCallback(() => {
    setPreflightIssues(runPreflight())
    setPreflightTarget('keynote')
    setPreflightOpen(true)
    setExportOpen(false)
  }, [runPreflight])

  const openPdfPreflight = useCallback(() => {
    setPreflightIssues(runPreflight())
    setPreflightTarget('pdf')
    setPreflightOpen(true)
    setExportOpen(false)
  }, [runPreflight])

  const handleExportPptx = useCallback(async () => {
    setExportOpen(false)
    setExporting(true)
    setExportError('')
    try {
      const slides = buildExportBlocks().map((block) => ({
        title: block.fields[Object.keys(block.fields)[0]] ?? '',
        fields: block.fields,
      }))
      const result = await (window as any).api.exportPptx({ slides, name: projectName ?? templateName ?? undefined })
      if (!result.ok && !result.canceled) setExportError(result.error ?? 'PPTX exporteren mislukt.')
    } catch (err: any) {
      setExportError(err.message ?? 'PPTX exporteren mislukt.')
    } finally {
      setExporting(false)
    }
  }, [buildExportBlocks, projectName, templateName])

  const handleExport = useCallback(async () => {
    if (!templateClientId || !templateData) return
    setExportOpen(false)
    setExporting(true)
    setExportError('')
    try {
      if (isHtmlTemplateClientId(templateClientId)) {
        const htmlTemplate = getHtmlPresentationTemplate(htmlTemplateIdFromClientId(templateClientId))
        if (htmlTemplate?.keynoteClientId) {
          // Digital twin met Keynote backing → gewone export via de donor .key
          const result = await (window as any).api.generateDeckStructured({
            clientId: htmlTemplate.keynoteClientId,
            blocks: buildExportBlocks(),
            name: projectName ?? templateName ?? undefined,
            sageTagMappings,
            userTagNames,
            mappings: {},
            itemNames: {},
            imageGeometry: {},
          })
          if (!result.ok) setExportError(result.error ?? 'Exporteren mislukt.')
        } else {
          // Pure HTML-template (colour-galore etc.) → bouw .key via shapes→PNG route
          const { renderAllLayoutsToPngs } = await import('../lib/render-shapes-to-png')
          const shapePngs = await renderAllLayoutsToPngs(templateData as any)
          const result = await (window as any).api.buildKeyFromHtml({
            templateData,
            shapePngs,
            name: projectName ?? templateName ?? 'presentatie',
          })
          if (!result.ok) {
            setExportError(result.error ?? 'Exporteren mislukt.')
          } else {
            // Sla het .key bestand op via save dialog
            const saveResult = await (window as any).api.saveKeyBuffer(result.buffer, result.fileName)
            if (saveResult && !saveResult.ok) setExportError(saveResult.error ?? 'Opslaan mislukt.')
          }
        }
        return
      }
      // UUID-backed template → gewone export
      const result = await (window as any).api.generateDeckStructured({
        clientId: templateClientId,
        blocks: buildExportBlocks(),
        name: projectName ?? templateName ?? undefined,
        sageTagMappings,
        userTagNames,
        mappings: {},
        itemNames: {},
        imageGeometry: {},
      })
      if (!result.ok) setExportError(result.error ?? 'Exporteren mislukt.')
    } finally {
      setExporting(false)
    }
  }, [templateClientId, templateData, buildExportBlocks, projectName, templateName, sageTagMappings, userTagNames])

  const handleExportPdf = useCallback(async () => {
    if (!pdfSlideRef.current || blocks.length === 0 || !templateData) return
    setExportOpen(false)
    const winW = window.innerWidth
    const winH = window.innerHeight
    let w = winW
    let h = winW * 9 / 16
    if (h > winH) { h = winH; w = winH * 16 / 9 }
    setPdfCaptureSize({ w, h })
    setPdfCanvasScale((w * 1.005) / 1920)
    setPdfExporting(true)
    setPdfSlideIdx(0)
    setExportError('')
    await new Promise((r) => setTimeout(r, 150))
    try {
      const result = await (window as any).api.exportPdfScreenshots({
        count: blocks.length,
        rect: { x: 0, y: 0, width: Math.round(w), height: Math.round(h) },
        name: projectName ?? templateName ?? undefined,
      })
      if (!result.ok && !result.canceled) setExportError(result.error ?? 'PDF exporteren mislukt.')
    } catch (err: any) {
      setExportError(err.message ?? 'PDF exporteren mislukt.')
    } finally {
      setPdfExporting(false)
    }
  }, [blocks.length, templateData, projectName, templateName])

  const handleExportJson = useCallback(() => {
    setExportOpen(false)
    const blob = new Blob([JSON.stringify(buildExportBlocks(), null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `huphe_slides_${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }, [buildExportBlocks])

  const stableSetExportError = useCallback((err: string) => setExportError(err), [])
  const stableSetPreflightOpen = useCallback((open: boolean) => setPreflightOpen(open), [])

  return {
    exporting,
    exportError,
    exportOpen,
    pdfExporting,
    pdfSlideIdx,
    pdfCanvasScale,
    pdfCaptureSize,
    pdfSlideRef,
    preflightOpen,
    preflightTarget,
    preflightIssues,

    setExportOpen,
    setExportError: stableSetExportError,
    setPreflightOpen: stableSetPreflightOpen,
    setPdfSlideIdx,

    handleExportPptx,
    handleExport,
    handleExportPdf,
    handleExportJson,
    openExportPreflight,
    openPdfPreflight,
    runPreflight,
  }
}
