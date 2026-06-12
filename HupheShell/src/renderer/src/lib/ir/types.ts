// Huphe Presentation IR v1
// Intermediate Representation between importers (KEY, PPTX, PDF), the editor, and exporters.
// All coordinates are in pixels on a 1920×1080 canvas. Assets are always Supabase Storage URLs.

export const IR_SCHEMA_VERSION = 1

// ─── Fidelity ────────────────────────────────────────────────────────────────

/**
 * How well the element survived conversion.
 * editable      — fully represented; can be edited in Atelier
 * preserved     — visually correct but limited editing (e.g. grouped shapes)
 * raster_fallback — stored as a rendered image; visual only
 * unsupported   — recorded in native_metadata only; not rendered
 */
export type Fidelity = 'editable' | 'preserved' | 'raster_fallback' | 'unsupported'

// ─── Provenance ───────────────────────────────────────────────────────────────

export interface Provenance {
  source_format: 'keynote' | 'pptx' | 'pdf' | 'jpg' | 'huphe' | string
  native_id?: string
  native_metadata?: Record<string, unknown>
}

// ─── Style ────────────────────────────────────────────────────────────────────

export interface TextStyle {
  font_family?: string
  font_size?: number
  font_weight?: 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900
  font_style?: 'normal' | 'italic'
  color?: string
  alignment?: 'left' | 'center' | 'right' | 'justify'
  vertical_alignment?: 'top' | 'middle' | 'bottom'
  letter_spacing?: number
  line_height?: number
  underline?: boolean
  strikethrough?: boolean
  text_shadow?: {
    offset_x: number
    offset_y: number
    blur: number
    color: string
  }
}

export interface ShapeStyle {
  fill_color?: string
  fill_opacity?: number
  stroke_color?: string
  stroke_width?: number
  stroke_opacity?: number
  corner_radius?: number
  shadow?: {
    offset_x: number
    offset_y: number
    blur: number
    spread: number
    color: string
  }
}

// A text run allows multiple styles within a single text box (e.g. bold word in a sentence)
export interface TextRun {
  text: string
  style?: TextStyle
}

// ─── Elements ─────────────────────────────────────────────────────────────────

interface BaseElement {
  id: string
  x: number
  y: number
  width: number
  height: number
  z_index: number
  rotation?: number
  opacity?: number
  fidelity: Fidelity
  provenance?: Provenance
}

export interface TextElement extends BaseElement {
  type: 'text'
  runs: TextRun[]
  sage_tag?: string
  placeholder_role?: 'title' | 'body' | 'subtitle' | 'logo' | 'quote' | 'date' | string
  style?: TextStyle
}

export interface ImageElement extends BaseElement {
  type: 'image'
  url: string
  alt?: string
  object_fit?: 'contain' | 'cover' | 'fill'
  crop?: { x: number; y: number; width: number; height: number }
  sage_tag?: string
}

export interface ShapeElement extends BaseElement {
  type: 'shape'
  shape_type: 'rectangle' | 'ellipse' | 'triangle' | 'line' | 'arrow' | string
  style?: ShapeStyle
}

export interface GroupElement extends BaseElement {
  type: 'group'
  children: HupheElement[]
}

// ─── Table ────────────────────────────────────────────────────────────────────

export interface TableCellStyle {
  fill_color?: string | null
  text_style?: TextStyle
  is_header?: boolean
  border_color?: string
  border_width?: number
  padding?: number
}

export interface TableCell {
  id?: string
  content: string
  col_span?: number
  row_span?: number
  style?: TableCellStyle
}

export interface TableRow {
  id?: string
  cells: TableCell[]
  height?: number
}

export interface TableElement extends BaseElement {
  type: 'table'
  rows: TableRow[]
  col_widths?: number[]   // percentages summing to 100
  header_rows?: number    // first N rows rendered as headers
  header_cols?: number    // first N columns rendered as header columns
  border_color?: string
  border_width?: number
}

export type HupheElement = TextElement | ImageElement | ShapeElement | GroupElement | TableElement

// ─── Slide ────────────────────────────────────────────────────────────────────

export interface HupheSlide {
  id: string
  index: number
  name?: string
  background_color?: string
  background_image?: string
  layout_name?: string
  elements: HupheElement[]
  presenter_notes?: string
  provenance?: Provenance
}

// ─── Presentation ─────────────────────────────────────────────────────────────

export interface HuphePresentation {
  schema_version: typeof IR_SCHEMA_VERSION
  id: string
  name: string
  canvas: { width: 1920; height: 1080 }
  created_at: string
  slides: HupheSlide[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function createPresentation(name: string, id?: string): HuphePresentation {
  return {
    schema_version: IR_SCHEMA_VERSION,
    id: id ?? crypto.randomUUID(),
    name,
    canvas: { width: 1920, height: 1080 },
    created_at: new Date().toISOString(),
    slides: [],
  }
}

export function createSlide(index: number, id?: string): HupheSlide {
  return {
    id: id ?? crypto.randomUUID(),
    index,
    elements: [],
  }
}
