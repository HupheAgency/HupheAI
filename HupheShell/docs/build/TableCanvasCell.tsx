import { useEffect, useRef } from 'react'
import type { CSSProperties } from 'react'
import type { TableCellStyle, TextStyle } from './ir-table-types'

interface TableCanvasCellProps {
  content: string
  cellStyle?: TableCellStyle
  isHeader?: boolean
  isEditing: boolean
  onEdit: (text: string) => void
  onFocus?: () => void
  onBlur?: () => void
  scaleFactor?: number
}

function verticalAlign(value?: TextStyle['vertical_alignment']): CSSProperties['verticalAlign'] {
  if (value === 'middle') return 'middle'
  if (value === 'bottom') return 'bottom'
  return 'top'
}

export default function TableCanvasCell({
  content,
  cellStyle,
  isHeader = false,
  isEditing,
  onEdit,
  onFocus,
  onBlur,
  scaleFactor = 1,
}: TableCanvasCellProps) {
  const cellRef = useRef<HTMLTableCellElement>(null)
  const textStyle = cellStyle?.text_style ?? {}
  const fontSize = (textStyle.font_size ?? 28) * scaleFactor
  const padding = (cellStyle?.padding ?? 14) * scaleFactor
  const borderWidth = Math.max(1, (cellStyle?.border_width ?? 1) * scaleFactor)
  const background = cellStyle?.fill_color ?? (isHeader ? '#141414' : 'transparent')
  const textColor = textStyle.color ?? (isHeader ? '#ffffff' : '#111111')

  useEffect(() => {
    if (!isEditing) return
    const cell = cellRef.current
    if (!cell) return
    cell.focus()

    const selection = window.getSelection()
    const range = document.createRange()
    range.selectNodeContents(cell)
    range.collapse(false)
    selection?.removeAllRanges()
    selection?.addRange(range)
  }, [isEditing])

  useEffect(() => {
    const cell = cellRef.current
    if (!cell || document.activeElement === cell) return
    cell.textContent = content
  }, [content])

  function handleInput() {
    onEdit(cellRef.current?.textContent ?? '')
  }

  const style: CSSProperties = {
    background,
    borderColor: cellStyle?.border_color ?? 'rgba(0,0,0,0.18)',
    borderStyle: 'solid',
    borderWidth,
    color: textColor,
    cursor: isEditing ? 'text' : 'pointer',
    fontFamily: textStyle.font_family ?? 'Arial, Helvetica, sans-serif',
    fontSize,
    fontStyle: textStyle.font_style ?? 'normal',
    fontWeight: textStyle.font_weight ?? (isHeader ? 700 : 400),
    letterSpacing: textStyle.letter_spacing ? textStyle.letter_spacing * scaleFactor : undefined,
    lineHeight: textStyle.line_height ?? 1.18,
    minWidth: 0,
    outline: isEditing ? `${Math.max(2, 2 * scaleFactor)}px solid #facc15` : 'none',
    outlineOffset: -Math.max(2, 2 * scaleFactor),
    overflowWrap: 'break-word',
    padding,
    textAlign: textStyle.alignment ?? 'left',
    verticalAlign: verticalAlign(textStyle.vertical_alignment),
    whiteSpace: 'pre-wrap',
  }

  return (
    <td
      ref={cellRef}
      style={style}
      contentEditable={isEditing}
      suppressContentEditableWarning
      tabIndex={0}
      onClick={() => {
        if (!isEditing) onFocus?.()
      }}
      onFocus={onFocus}
      onBlur={onBlur}
      onInput={handleInput}
    >
      {content}
    </td>
  )
}
