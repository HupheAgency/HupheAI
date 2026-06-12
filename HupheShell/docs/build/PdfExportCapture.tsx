import type React from 'react'
import { WebSlidePreview } from './WebSlidePreview'
import type { TemplateData } from './WebSlidePreview'
import type { Block, Overrides } from '../lib/editor-types'
import { buildPreviewBlock, getSageTags } from '../lib/atelier-import-utils'

interface PdfExportCaptureProps {
  captureRef: React.RefObject<HTMLDivElement>
  isExporting: boolean
  captureSize: { w: number; h: number }
  canvasScale: number
  slideIdx: number
  blocks: Block[]
  templateData: TemplateData
  mappings: Record<string, Record<number, string>>
  bgColors: Record<string, string>
  overrides: Overrides
  sageTagMappings: Record<string, Record<string, string>>
  placeholderUrl?: string
}

export default function PdfExportCapture({
  captureRef,
  isExporting,
  captureSize,
  canvasScale,
  slideIdx,
  blocks,
  templateData,
  mappings,
  bgColors,
  overrides,
  sageTagMappings,
  placeholderUrl,
}: PdfExportCaptureProps) {
  const block = blocks.length > 0 ? blocks[Math.min(slideIdx, blocks.length - 1)] : null
  const sageTags = block ? getSageTags(block.type, templateData, mappings) : []
  const previewBlock = block ? buildPreviewBlock(block, overrides, sageTagMappings, sageTags) : null

  return (
    <div
      ref={captureRef}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: isExporting ? captureSize.w : 0,
        height: isExporting ? captureSize.h : 0,
        overflow: 'hidden',
        zIndex: isExporting ? 100000 : -1,
        visibility: isExporting ? 'visible' : 'hidden',
        pointerEvents: 'none',
      }}
    >
      {block && previewBlock && (
        <div style={{ width: 1920, height: 1080, zoom: canvasScale }}>
          <WebSlidePreview
            block={previewBlock}
            templateData={templateData}
            mappings={mappings}
            bgColors={bgColors}
            imagePlaceholderUrl={placeholderUrl}
            imageOffset={block.imageOffset}
            imageAlign={block.imageAlign}
            imageFit={block.imageFit}
            imageScale={block.imageScale}
            imageRotation={block.imageRotation}
            imageFlipX={block.imageFlipX}
            imageFlipY={block.imageFlipY}
          />
        </div>
      )}
    </div>
  )
}
