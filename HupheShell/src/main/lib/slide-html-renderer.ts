import type { HupheSlide, HupheElement, HupheTextElement, HupheImageElement } from './pptx-importer'

function cssStyle(el: HupheElement): string {
  return `position:absolute;left:${el.x}px;top:${el.y}px;width:${el.width}px;height:${el.height}px;z-index:${el.z_index};overflow:hidden;`
}

function renderText(el: HupheTextElement): string {
  const s = el.style
  const css = [
    cssStyle(el),
    s.font_family ? `font-family:${s.font_family},Helvetica,sans-serif;` : 'font-family:Helvetica,sans-serif;',
    s.font_size ? `font-size:${s.font_size}px;` : '',
    s.font_weight ? `font-weight:${s.font_weight};` : '',
    s.font_style ? `font-style:${s.font_style};` : '',
    s.color ? `color:${s.color};` : 'color:#ffffff;',
    s.alignment ? `text-align:${s.alignment};` : '',
    s.letter_spacing ? `letter-spacing:${s.letter_spacing}px;` : '',
    s.line_height ? `line-height:${s.line_height};` : '',
    'box-sizing:border-box;',
  ].join('')

  const escaped = el.content
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>')

  return `<div style="${css}">${escaped}</div>`
}

function renderImage(el: HupheImageElement): string {
  const css = cssStyle(el)
  return `<img src="${el.url}" style="${css}object-fit:cover;" alt="" />`
}

function renderTable(el: HupheElement): string {
  const t = el as any
  const rows: any[] = t.rows ?? []
  const numCols = rows.reduce((max: number, r: any) => Math.max(max, (r.cells ?? []).length), 1)
  const colWidths: number[] = t.col_widths ?? Array.from({ length: numCols }, () => 100 / numCols)
  const borderW = t.border_width ?? 1
  const borderColor = t.border_color ?? 'rgba(0,0,0,0.15)'

  const cols = colWidths.map((w: number) => `<col style="width:${w}%">`).join('')
  const rowsHtml = rows.map((row: any, ri: number) => {
    const rowH = row.height ? ` style="height:${row.height}px"` : ''
    const cells = (row.cells ?? []).map((cell: any, ci: number) => {
      const isHeaderRow = ri < (t.header_rows ?? 0)
      const isHeaderCol = ci < (t.header_cols ?? 0)
      const s = cell.style ?? {}
      const ts = s.text_style ?? {}
      const bg = (s.fill_color ?? null) !== null ? s.fill_color! : (isHeaderRow || isHeaderCol ? '#1a1a1a' : (ri % 2 === 0 ? '#ffffff' : '#f5f5f5'))
      const color = ts.color ?? ((isHeaderRow || isHeaderCol) ? '#ffffff' : '#111111')
      const fs = (ts.font_size ?? 16) + 'px'
      const fw = ts.font_weight ?? ((isHeaderRow || isHeaderCol) ? 600 : 400)
      const ta = ts.alignment ?? 'left'
      const border = `${borderW}px solid ${borderColor}`
      const cellCss = `background:${bg};color:${color};font-size:${fs};font-weight:${fw};text-align:${ta};padding:6px 10px;border:${border};vertical-align:middle;word-break:break-word;`
      const colSpanAttr = (cell.col_span ?? 1) > 1 ? ` colspan="${cell.col_span}"` : ''
      const rowSpanAttr = (cell.row_span ?? 1) > 1 ? ` rowspan="${cell.row_span}"` : ''
      const content = String(cell.content ?? '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')
      return `<td${colSpanAttr}${rowSpanAttr} style="${cellCss}">${content}</td>`
    }).join('')
    return `<tr${rowH}>${cells}</tr>`
  }).join('')

  const pos = cssStyle(el)
  return `<div style="${pos}"><table style="width:100%;height:100%;border-collapse:collapse;table-layout:fixed;"><colgroup>${cols}</colgroup><tbody>${rowsHtml}</tbody></table></div>`
}

function renderSlide(slide: HupheSlide, index: number): string {
  const bg = slide.background_color ?? '#0a0a0a'
  const elements = [...slide.elements]
    .sort((a, b) => a.z_index - b.z_index)
    .map(el => {
      if (el.type === 'text') return renderText(el as HupheTextElement)
      if (el.type === 'image') return renderImage(el as HupheImageElement)
      if ((el.type as string) === 'table') return renderTable(el)
      return ''
    })
    .join('\n')

  return `<div class="slide" id="slide-${index}" style="position:relative;width:1920px;height:1080px;overflow:hidden;background:${bg};flex-shrink:0;">\n${elements}\n</div>`
}

export function renderSlidesToHtml(slides: HupheSlide[]): string {
  const slideHtml = slides.map((s, i) => renderSlide(s, i)).join('\n')
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { background: #000; }
.slide { page-break-after: always; }
</style>
</head>
<body>
${slideHtml}
</body>
</html>`
}
