import pptxgen from 'pptxgenjs'

interface PptxTableCell { content: string; fill_color?: string | null; col_span?: number; row_span?: number }
interface PptxTableRow { cells: PptxTableCell[]; height?: number }
interface PptxTableData { rows: PptxTableRow[]; col_widths?: number[]; header_rows?: number; header_cols?: number; border_color?: string }

export interface PptxSlide {
  title: string
  fields: Record<string, string>
  imagePath?: string
  tableData?: PptxTableData
}

const SLIDE_W = 13.33  // inches (16:9)

const TITLE_Y = 0.5
const TITLE_H = 1.2
const BODY_Y = 1.9
const BODY_H = 4.8
const MARGIN_X = 0.6

export async function exportToPptx(
  slides: PptxSlide[],
  name: string,
  onProgress?: (step: string, pct: number) => void,
): Promise<Buffer> {
  const prs = new pptxgen()
  prs.layout = 'LAYOUT_WIDE'
  prs.title = name

  onProgress?.('Initialiseren', 0)

  for (const slide of slides) {
    const s = prs.addSlide()
    const idx = slides.indexOf(slide)
    const pct = Math.round(10 + ((idx + 1) / slides.length) * 80)
    onProgress?.(`Slide ${idx + 1} van ${slides.length} verwerken`, pct)

    // Dark background matching Huphe visual style
    s.background = { color: '0a0a0a' }

    // Title
    if (slide.title) {
      s.addText(slide.title, {
        x: MARGIN_X, y: TITLE_Y,
        w: SLIDE_W - MARGIN_X * 2, h: TITLE_H,
        fontSize: 32,
        fontFace: 'Helvetica Neue',
        bold: true,
        color: 'FFFDF6',
        autoFit: true,
      })
    }

    // Collect body text from all non-title fields
    const bodyLines: string[] = []
    for (const [, val] of Object.entries(slide.fields)) {
      if (val && val !== slide.title) bodyLines.push(val)
    }

    if (bodyLines.length > 0 && !slide.tableData) {
      s.addText(bodyLines.join('\n'), {
        x: MARGIN_X, y: BODY_Y,
        w: SLIDE_W - MARGIN_X * 2, h: BODY_H,
        fontSize: 18,
        fontFace: 'Helvetica Neue',
        color: 'F4F1E8',
        valign: 'top',
        autoFit: true,
      })
    }

    if (slide.tableData) {
      const { rows, col_widths, header_rows = 0, header_cols = 0, border_color } = slide.tableData
      const tableW = SLIDE_W - MARGIN_X * 2
      const numCols = rows[0]?.cells.length ?? 1
      const colW = col_widths?.map((pct) => tableW * pct / 100) ?? Array(numCols).fill(tableW / numCols)
      const borderHex = border_color?.replace('#', '') ?? 'CCCCCC'
      const pptxRows = rows.map((row, ri) =>
        row.cells.map((cell, ci) => ({
          text: cell.content,
          options: {
            bold: ri < header_rows || ci < header_cols,
            fill: cell.fill_color ? { color: cell.fill_color.replace('#', '') } : undefined,
            color: (ri < header_rows || ci < header_cols) ? 'FFFFFF' : '111111',
            colspan: cell.col_span ?? 1,
            rowspan: cell.row_span ?? 1,
          },
        }))
      )
      s.addTable(pptxRows as any, {
        x: MARGIN_X, y: BODY_Y,
        w: tableW,
        colW,
        border: { type: 'solid', pt: 1, color: borderHex },
        autoPage: false,
      })
    }
  }

  onProgress?.('Zip genereren', 95)
  const result = Buffer.from(await prs.write({ outputType: 'arraybuffer' }) as ArrayBuffer)
  onProgress?.('Klaar', 100)
  return result
}
