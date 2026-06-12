import { useMemo, useState } from 'react'
import type { TableCell, TableElement, TableRow } from '../lib/ir/types'

interface TableBlockEditorProps {
  table: TableElement
  onChange: (table: TableElement) => void
}

const COLOR_PRESETS: { label: string; value: string | null; swatch: string; border?: string }[] = [
  { label: 'Zwart', value: '#000000', swatch: '#000000', border: 'rgba(255,255,255,0.16)' },
  { label: 'Wit', value: '#FFFFFF', swatch: '#FFFFFF' },
  { label: 'Oranje', value: '#E8624A', swatch: '#E8624A' },
  { label: 'Grijs', value: '#F0F0F0', swatch: '#F0F0F0' },
  { label: 'Transparant', value: null, swatch: 'transparent', border: 'rgba(255,255,255,0.18)' },
]

function makeId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
}

function getColumnCount(rows: TableRow[]): number {
  return Math.max(1, ...rows.map((row) => row.cells.length))
}

function createCell(): TableCell {
  return { id: makeId('cell'), content: '', style: {} }
}

function createRow(columnCount: number): TableRow {
  return {
    id: makeId('row'),
    cells: Array.from({ length: columnCount }, createCell),
  }
}

function normalizeRows(rows: TableRow[]): TableRow[] {
  const safeRows = rows.length > 0 ? rows : [createRow(2)]
  const columnCount = getColumnCount(safeRows)

  return safeRows.map((row) => ({
    ...row,
    id: row.id ?? makeId('row'),
    cells: Array.from({ length: columnCount }, (_, index) => ({
      ...(row.cells[index] ?? createCell()),
      id: row.cells[index]?.id ?? makeId('cell'),
      content: row.cells[index]?.content ?? '',
      style: row.cells[index]?.style ?? {},
    })),
  }))
}

function normalizeWidths(widths: number[], columnCount: number): number[] {
  const fallback = Array.from({ length: columnCount }, () => 100 / columnCount)
  const next = Array.from({ length: columnCount }, (_, index) => {
    const value = widths[index]
    return Number.isFinite(value) && value > 0 ? value : fallback[index]
  })
  const total = next.reduce((sum, width) => sum + width, 0)
  if (total <= 0) return fallback
  return next.map((width) => (width / total) * 100)
}

function getColumnWidths(table: TableElement, columnCount: number): number[] {
  if (Array.isArray(table.col_widths) && table.col_widths.length > 0) {
    return normalizeWidths(table.col_widths, columnCount)
  }

  return normalizeWidths([], columnCount)
}

function withColumnWidths(table: TableElement, widths: number[]): TableElement {
  return {
    ...table,
    col_widths: widths,
  }
}

function resizeColumn(widths: number[], columnIndex: number, rawValue: number): number[] {
  if (widths.length <= 1) return [100]

  const minWidth = 4
  const value = Math.max(minWidth, Math.min(100 - minWidth * (widths.length - 1), rawValue))
  const oldValue = widths[columnIndex] ?? 0
  const remainingOld = Math.max(0.001, 100 - oldValue)
  const remainingNew = 100 - value

  return widths.map((width, index) => {
    if (index === columnIndex) return value
    return Math.max(minWidth, (width / remainingOld) * remainingNew)
  }).map((width, _index, arr) => {
    const total = arr.reduce((sum, item) => sum + item, 0)
    return (width / total) * 100
  })
}

export default function TableBlockEditor({ table, onChange }: TableBlockEditorProps) {
  const rows = useMemo(() => normalizeRows(table.rows ?? []), [table.rows])
  const columnCount = getColumnCount(rows)
  const columnWidths = getColumnWidths(table, columnCount)
  const [selected, setSelected] = useState({ row: 0, column: 0 })

  const safeSelected = {
    row: Math.min(selected.row, rows.length - 1),
    column: Math.min(selected.column, columnCount - 1),
  }
  const selectedCell = rows[safeSelected.row]?.cells[safeSelected.column]

  function emit(nextRows: TableRow[], nextTable: Partial<TableElement> = {}) {
    onChange({
      ...table,
      ...nextTable,
      type: table.type ?? 'table',
      rows: normalizeRows(nextRows),
    })
  }

  function updateCell(rowIndex: number, columnIndex: number, patch: Partial<TableCell>) {
    const nextRows = rows.map((row, r) => ({
      ...row,
      cells: row.cells.map((cell, c) => (
        r === rowIndex && c === columnIndex ? { ...cell, ...patch } : cell
      )),
    }))
    emit(nextRows)
  }

  function setCellFill(fillColor: string | null) {
    if (!selectedCell) return
    updateCell(safeSelected.row, safeSelected.column, {
      style: { ...(selectedCell.style ?? {}), fill_color: fillColor },
    })
  }

  function addRow(position: 'above' | 'below') {
    const insertAt = position === 'above' ? safeSelected.row : safeSelected.row + 1
    const nextRows = [...rows]
    nextRows.splice(insertAt, 0, createRow(columnCount))
    setSelected({ row: insertAt, column: safeSelected.column })
    emit(nextRows)
  }

  function removeRow() {
    if (rows.length <= 1) return
    const nextRows = rows.filter((_, index) => index !== safeSelected.row)
    setSelected({ row: Math.max(0, safeSelected.row - 1), column: safeSelected.column })
    emit(nextRows)
  }

  function addColumn(position: 'left' | 'right') {
    const insertAt = position === 'left' ? safeSelected.column : safeSelected.column + 1
    const newColumnCount = columnCount + 1
    const newWidth = 100 / newColumnCount
    const scaledWidths = columnWidths.map((width) => width * ((100 - newWidth) / 100))
    const nextWidths = [...scaledWidths]
    nextWidths.splice(insertAt, 0, newWidth)

    const nextRows = rows.map((row) => {
      const cells = [...row.cells]
      cells.splice(insertAt, 0, createCell())
      return { ...row, cells }
    })

    setSelected({ row: safeSelected.row, column: insertAt })
    emit(nextRows, withColumnWidths(table, normalizeWidths(nextWidths, newColumnCount)))
  }

  function removeColumn() {
    if (columnCount <= 1) return
    const nextRows = rows.map((row) => ({
      ...row,
      cells: row.cells.filter((_, index) => index !== safeSelected.column),
    }))
    const nextWidths = columnWidths.filter((_, index) => index !== safeSelected.column)
    const normalizedWidths = normalizeWidths(nextWidths, columnCount - 1)
    setSelected({ row: safeSelected.row, column: Math.max(0, safeSelected.column - 1) })
    emit(nextRows, withColumnWidths(table, normalizedWidths))
  }

  function updateColumnWidth(columnIndex: number, value: number) {
    const nextWidths = resizeColumn(columnWidths, columnIndex, value)
    onChange(withColumnWidths({ ...table, rows }, nextWidths))
  }

  return (
    <section className="rounded-2xl border border-white/[0.07] bg-[#141414] p-4 text-white">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-white">Tabel</h3>
          <p className="mt-1 text-xs text-white/50">
            {rows.length} rijen · {columnCount} kolommen
          </p>
        </div>
        <div className="rounded-full bg-[#facc15] px-2.5 py-1 text-[10px] font-semibold text-black">
          Cel {safeSelected.row + 1}.{safeSelected.column + 1}
        </div>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <ControlButton onClick={() => addRow('above')}>Rij boven</ControlButton>
        <ControlButton onClick={() => addRow('below')}>Rij onder</ControlButton>
        <ControlButton onClick={() => addColumn('left')}>Kolom links</ControlButton>
        <ControlButton onClick={() => addColumn('right')}>Kolom rechts</ControlButton>
        <ControlButton onClick={removeRow} disabled={rows.length <= 1} danger>Rij verwijderen</ControlButton>
        <ControlButton onClick={removeColumn} disabled={columnCount <= 1} danger>Kolom verwijderen</ControlButton>
      </div>

      <div className="mt-4 overflow-auto rounded-xl border border-white/[0.07] bg-[#0a0a0a] p-2">
        <div
          className="grid min-w-max gap-px"
          style={{ gridTemplateColumns: columnWidths.map((width) => `minmax(96px, ${width}fr)`).join(' ') }}
        >
          {rows.map((row, rowIndex) => row.cells.map((cell, columnIndex) => {
            const isSelected = safeSelected.row === rowIndex && safeSelected.column === columnIndex
            const isHeader = (table.header_rows ?? 0) > rowIndex || (table.header_cols ?? 0) > columnIndex
            const background = cell.style?.fill_color ?? (isHeader ? '#1f1f1f' : '#141414')

            return (
              <input
                key={cell.id ?? `${rowIndex}-${columnIndex}`}
                value={cell.content}
                onFocus={() => setSelected({ row: rowIndex, column: columnIndex })}
                onChange={(event) => updateCell(rowIndex, columnIndex, { content: event.target.value })}
                className={[
                  'h-9 min-w-24 border px-2 text-xs outline-none transition-colors placeholder:text-white/25',
                  isSelected ? 'border-[#facc15] text-white' : 'border-white/[0.07] text-white/70',
                  isHeader ? 'font-semibold' : 'font-normal',
                ].join(' ')}
                style={{ background, color: background === '#FFFFFF' || background === '#F0F0F0' ? '#111111' : undefined }}
                placeholder="Celtekst"
              />
            )
          }))}
        </div>
      </div>

      <div className="mt-4 grid gap-3">
        <label className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.07] bg-white/[0.03] px-3 py-2.5">
          <span className="text-xs text-white/70">Eerste rij als header</span>
          <input
            type="checkbox"
            checked={(table.header_rows ?? 0) > 0}
            onChange={(event) => onChange({ ...table, rows, header_rows: event.target.checked ? 1 : 0 })}
            className="h-4 w-4 accent-[#facc15]"
          />
        </label>

        <label className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.07] bg-white/[0.03] px-3 py-2.5">
          <span className="text-xs text-white/70">Eerste kolom als header</span>
          <input
            type="checkbox"
            checked={(table.header_cols ?? 0) > 0}
            onChange={(event) => onChange({ ...table, rows, header_cols: event.target.checked ? 1 : 0 })}
            className="h-4 w-4 accent-[#facc15]"
          />
        </label>
      </div>

      <div className="mt-4 rounded-xl border border-white/[0.07] bg-white/[0.03] p-3">
        <p className="text-xs font-medium text-white/70">Cel-achtergrond</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {COLOR_PRESETS.map((preset) => {
            const active = (selectedCell?.style?.fill_color ?? null) === preset.value
            return (
              <button
                key={preset.label}
                type="button"
                onClick={() => setCellFill(preset.value)}
                title={preset.label}
                className={[
                  'h-8 w-8 rounded-xl border transition-transform hover:scale-105',
                  active ? 'border-[#facc15] ring-2 ring-[#facc15]/25' : 'border-white/[0.07]',
                ].join(' ')}
                style={{
                  background: preset.value === null
                    ? 'linear-gradient(135deg, transparent 0 44%, rgba(255,255,255,0.22) 45% 54%, transparent 55% 100%)'
                    : preset.swatch,
                  borderColor: active ? '#facc15' : preset.border,
                }}
              />
            )
          })}
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-white/[0.07] bg-white/[0.03] p-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-white/70">Kolombreedtes</p>
          <span className="text-[10px] text-white/25">Som 100%</span>
        </div>
        <div className="mt-3 space-y-3">
          {columnWidths.map((width, index) => (
            <label key={index} className="grid grid-cols-[52px_1fr_58px] items-center gap-2 text-xs text-white/50">
              <span>Kolom {index + 1}</span>
              <input
                type="range"
                min={4}
                max={96}
                step={1}
                value={Math.round(width)}
                onChange={(event) => updateColumnWidth(index, Number(event.target.value))}
                className="accent-[#facc15]"
              />
              <input
                type="number"
                min={4}
                max={96}
                value={Math.round(width)}
                onChange={(event) => updateColumnWidth(index, Number(event.target.value))}
                className="h-8 rounded-lg border border-white/[0.07] bg-[#0a0a0a] px-2 text-right text-xs tabular-nums text-white/70 outline-none focus:border-[#facc15]/45"
              />
            </label>
          ))}
        </div>
      </div>
    </section>
  )
}

function ControlButton({
  children,
  onClick,
  disabled,
  danger,
}: {
  children: string
  onClick: () => void
  disabled?: boolean
  danger?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[
        'rounded-xl border px-3 py-2 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-30',
        danger
          ? 'border-red-500/20 bg-red-500/[0.05] text-red-300/80 hover:bg-red-500/[0.10]'
          : 'border-white/[0.07] bg-white/[0.03] text-white/60 hover:border-[#facc15]/45 hover:bg-[#facc15] hover:text-black',
      ].join(' ')}
    >
      {children}
    </button>
  )
}
