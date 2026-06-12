/**
 * Huphe Presentation IR (Intermediate Representation) v1
 * 
 * Dit schema fungeert als de 'Single Source of Truth' (SSOT) voor alle 
 * geïmporteerde en geëxporteerde presentaties in het HupheAI ecosysteem.
 */

export type HupheFidelity = 'editable' | 'preserved' | 'raster_fallback' | 'unsupported';

export interface HupheProvenance {
  source_format: string; // e.g., 'keynote', 'pptx', 'pdf', 'jpg'
  native_id?: string;
  native_metadata?: Record<string, unknown>;
}

export interface HupheElementBase {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  z_index: number;
  fidelity: HupheFidelity;
  provenance: HupheProvenance;
}

export interface HupheTextStyle {
  font_family: string;
  font_size: number;
  font_weight: string | number;
  font_style: 'normal' | 'italic' | 'oblique';
  color: string;
  alignment: 'left' | 'center' | 'right' | 'justify';
  letter_spacing?: number;
  line_height?: number;
  text_shadow?: string;
}

export interface HupheTextElement extends HupheElementBase {
  type: 'text';
  content: string;
  tag?: string; // e.g., '{{sageTag_Title}}'
  style: HupheTextStyle;
}

export interface HupheImageElement extends HupheElementBase {
  type: 'image';
  url: string; // Base64 of externe (Supabase) URL
  opacity?: number;
}

export interface HupheShapeElement extends HupheElementBase {
  type: 'shape';
  shape_type: 'rectangle' | 'circle' | 'line' | 'polygon' | string;
  fill_color?: string;
  stroke_color?: string;
  stroke_width?: number;
  opacity?: number;
}

export type HupheElement = HupheTextElement | HupheImageElement | HupheShapeElement;

export interface HupheDimensions {
  width: number;
  height: number;
}

export interface HupheSlide {
  slide_id: string;
  background_color?: string;
  background_image?: string;
  elements: HupheElement[];
}

export interface HuphePresentation {
  schema_version: number;
  presentation_id: string;
  dimensions: HupheDimensions;
  slides: HupheSlide[];
}
