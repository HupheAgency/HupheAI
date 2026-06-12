import JSZip from 'jszip'

export interface ExtractedMedia {
  slideIndex: number
  type: 'image' | 'chart' | 'table'
  data: string | object
}

export async function extractMediaFromPptx(pptxBuffer: ArrayBuffer): Promise<ExtractedMedia[]> {
  const zip = new JSZip()
  await zip.loadAsync(pptxBuffer)

  const extracted: ExtractedMedia[] = []

  // Build a map from media filename to slide index via slide relationship files
  const slideMediaMap: Record<string, number> = {}
  const relFiles = Object.keys(zip.files).filter(
    (name) => name.startsWith('ppt/slides/_rels/') && name.endsWith('.xml.rels'),
  )
  for (const relPath of relFiles) {
    const slideMatch = relPath.match(/slide(\d+)\.xml\.rels$/)
    if (!slideMatch) continue
    const slideIndex = parseInt(slideMatch[1], 10)
    const xml = await zip.file(relPath)?.async('text')
    if (!xml) continue
    const mediaRefs = [...xml.matchAll(/Target="\.\.\/media\/([^"]+)"/g)]
    for (const match of mediaRefs) {
      slideMediaMap[match[1]] = slideIndex
    }
  }

  // Images
  const mediaFiles = Object.keys(zip.files).filter((name) => name.startsWith('ppt/media/'))
  for (const mediaPath of mediaFiles) {
    const ext = mediaPath.split('.').pop()?.toLowerCase()
    if (ext !== 'jpeg' && ext !== 'jpg' && ext !== 'png') continue

    const file = zip.file(mediaPath)
    if (!file) continue

    const base64 = await file.async('base64')
    const mime = ext === 'png' ? 'image/png' : 'image/jpeg'
    const fileName = mediaPath.split('/').pop() ?? ''

    extracted.push({
      slideIndex: slideMediaMap[fileName] ?? 1,
      type: 'image',
      data: `data:${mime};base64,${base64}`,
    })
  }

  // Tables (parsed from slide XML)
  const slideFiles = Object.keys(zip.files).filter((name) =>
    name.match(/ppt\/slides\/slide\d+\.xml$/),
  )
  for (const slidePath of slideFiles) {
    const slideMatch = slidePath.match(/slide(\d+)\.xml$/)
    const slideIndex = slideMatch ? parseInt(slideMatch[1], 10) : 1
    const xml = await zip.file(slidePath)?.async('text')
    if (!xml || !xml.includes('<a:tbl>')) continue

    // Extract rows and cells from table XML
    const rows: string[][] = []
    const rowMatches = [...xml.matchAll(/<a:tr\b[^>]*>([\s\S]*?)<\/a:tr>/g)]
    for (const row of rowMatches) {
      const cells: string[] = []
      const cellMatches = [...row[1].matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)]
      for (const cell of cellMatches) {
        cells.push(cell[1].trim())
      }
      if (cells.length > 0) rows.push(cells)
    }

    if (rows.length > 0) {
      extracted.push({ slideIndex, type: 'table', data: { rows } })
    }
  }

  return extracted
}
