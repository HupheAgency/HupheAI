// Product Studio data model — matches masterdocument v1.0 §9 and Supabase schema

// --- Enums / unions ---

export type ProjectMode = 'concept' | 'fidelity'

export type ProjectStatus =
  | 'draft'
  | 'references_pending'
  | 'references_review'
  | 'reconstruction_pending'
  | 'mesh_review'
  | 'studio_ready'
  | 'render_pending'
  | 'completed'
  | 'archived'

export type SourceAssetType =
  | 'original-image'
  | 'normalized-image'
  | 'basic-product'
  | 'object-mask'
  | 'manual-mask'
  | 'thumbnail'

export type ViewAngle = 'hero' | 'front' | 'left' | 'right' | 'rear' | 'top' | 'custom'

export type ProvenanceStatus =
  | 'observed'
  | 'inferred'
  | 'user-approved'
  | 'user-edited'
  | 'reconstructed'

export type ViewStatus = 'draft' | 'active' | 'rejected' | 'superseded'

export type SetCoverage = 'limited-single-view' | 'partial-multiview' | 'full-multiview'

export type ApprovalStatus = 'draft' | 'approved' | 'superseded'

export type ReconstructionRoute = 'single-view' | 'multi-view' | 'primitive-proxy'

export type ReconstructionStatus = 'processing' | 'review' | 'approved' | 'rejected' | 'failed'

export type ProviderType = 'reference-view' | 'reconstruction' | 'final-render' | 'analysis'

export type JobStatus = 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled'

export type PreservationPolicy = 'strict' | 'balanced' | 'creative'

export type RenderResolution = '1k' | '2k' | '4k'

export type FinalRenderStatus = 'processing' | 'review' | 'approved' | 'rejected' | 'failed'

// --- Entities ---

export interface ProductProject {
  id: string
  owner_id: string
  name: string
  mode: ProjectMode
  status: ProjectStatus
  product_name?: string
  product_category?: string
  known_dimension_mm?: number
  brand_name?: string
  notes?: string
  output_aspect_ratio: string
  created_at: string
  updated_at: string
}

export interface SourceAsset {
  id: string
  project_id: string
  type: SourceAssetType
  url: string
  mime_type: string
  width?: number
  height?: number
  checksum?: string
  provenance: 'observed' | 'inferred'
  created_at: string
}

export interface ReferenceView {
  id: string
  project_id: string
  angle: ViewAngle
  asset_url: string
  source_asset_id?: string
  provider_run_id?: string
  provenance: ProvenanceStatus
  status: ViewStatus
  parent_view_id?: string
  prompt?: string
  version: number
  created_at: string
}

export interface CanonicalReferenceSet {
  id: string
  project_id: string
  version: number
  view_ids: string[]
  status: ApprovalStatus
  coverage: SetCoverage
  approved_by?: string
  approved_at?: string
  created_at: string
}

export interface ReconstructionVersion {
  id: string
  project_id: string
  canonical_reference_set_id: string
  provider_run_id?: string
  route: ReconstructionRoute
  mesh_url?: string
  preview_url?: string
  pbr_asset_urls?: Record<string, string>
  status: ReconstructionStatus
  seed?: number
  parent_version_id?: string
  created_at: string
  approved_at?: string
}

export interface StudioSceneVersion {
  id: string
  project_id: string
  reconstruction_version_id: string
  camera: Record<string, unknown>
  lights: Record<string, unknown>[]
  product_transform: Record<string, unknown>
  environment: Record<string, unknown>
  output: Record<string, unknown>
  version: number
  created_at: string
}

export interface RenderPacket {
  id: string
  project_id: string
  canonical_reference_set_id: string
  reconstruction_version_id: string
  studio_scene_version_id: string
  beauty_url: string
  object_mask_url?: string
  depth_url?: string
  normal_url?: string
  auxiliary_asset_urls?: Record<string, string>
  metadata_url?: string
  created_at: string
}

export interface ProviderRun {
  id: string
  project_id: string
  provider_type: ProviderType
  provider_name: string
  model_name: string
  status: JobStatus
  request_hash?: string
  external_request_id?: string
  input_manifest_url?: string
  output_manifest_url?: string
  latency_ms?: number
  cost_estimate?: number
  error_code?: string
  error_message?: string
  retry_count: number
  idempotency_key?: string
  metadata?: Record<string, unknown>
  created_at: string
  completed_at?: string
}

export interface FinalRenderVersion {
  id: string
  project_id: string
  render_packet_id: string
  provider_run_id?: string
  output_url?: string
  preservation_policy: PreservationPolicy
  prompt?: string
  resolution: RenderResolution
  status: FinalRenderStatus
  parent_version_id?: string
  metadata?: Record<string, unknown>
  scene_url?: string | null
  created_at: string
  approved_at?: string
}

// --- Provider adapter interfaces (masterdocument §8) ---

export interface ReferenceViewInput {
  angle: ViewAngle
  assetUrl: string
  provenance: ProvenanceStatus
}

export interface ReferenceViewProviderResult {
  views: Array<{
    angle: ViewAngle
    imageUrl: string
    prompt: string
  }>
  providerRunId: string
}

export interface ReferenceViewProvider {
  generateViews(input: {
    sourceImageUrl: string
    existingViews?: ReferenceViewInput[]
    targetViews: ViewAngle[]
    productNotes?: string
    consistencyMode: 'turnaround' | 'single-view-repair'
  }): Promise<ReferenceViewProviderResult>
}

export interface ReconstructionJobResult {
  meshUrl: string
  previewUrl?: string
  pbrAssetUrls?: Record<string, string>
  providerRunId: string
  seed?: number
}

export interface ReconstructionProvider {
  createReconstruction(input: {
    canonicalReferenceSetId: string
    primaryImageUrl: string
    additionalImageUrls?: string[]
    route: ReconstructionRoute
    quality: 'preview' | 'final'
    seed?: number
  }): Promise<ReconstructionJobResult>
}

export interface FinalRenderProviderResult {
  outputUrl: string
  providerRunId: string
}

export interface FinalRenderProvider {
  render(input: {
    beautyUrl: string
    canonicalReferenceUrls: string[]
    objectMaskUrl?: string
    depthUrl?: string
    normalUrl?: string
    protectedRegionUrls?: string[]
    artDirectionPrompt: string
    preservationPolicy: PreservationPolicy
    aspectRatio: string
    resolution: RenderResolution
  }): Promise<FinalRenderProviderResult>
}
