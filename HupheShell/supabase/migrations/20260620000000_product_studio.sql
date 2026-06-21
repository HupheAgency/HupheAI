-- Product Studio: datamodel conform masterdocument v1.0 (secties 9.1–9.9)

-- 1. product_projects
CREATE TABLE product_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users,
  name text NOT NULL,
  mode text NOT NULL DEFAULT 'concept' CHECK (mode IN ('concept', 'fidelity')),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft',
    'references_pending',
    'references_review',
    'reconstruction_pending',
    'mesh_review',
    'studio_ready',
    'render_pending',
    'completed',
    'archived'
  )),
  product_name text,
  product_category text,
  known_dimension_mm real,
  brand_name text,
  notes text,
  output_aspect_ratio text DEFAULT '16:9',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. source_assets (origineel, genormaliseerd, maskers, thumbnails)
CREATE TABLE source_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES product_projects ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN (
    'original-image',
    'normalized-image',
    'object-mask',
    'manual-mask',
    'thumbnail'
  )),
  url text NOT NULL,
  mime_type text NOT NULL DEFAULT 'image/png',
  width integer,
  height integer,
  checksum text,
  provenance text NOT NULL DEFAULT 'observed' CHECK (provenance IN ('observed')),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 3. reference_views
CREATE TABLE reference_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES product_projects ON DELETE CASCADE,
  angle text NOT NULL CHECK (angle IN ('hero', 'front', 'left', 'right', 'rear', 'top', 'custom')),
  asset_url text NOT NULL,
  source_asset_id uuid REFERENCES source_assets,
  provider_run_id uuid,
  provenance text NOT NULL CHECK (provenance IN (
    'observed', 'inferred', 'user-approved', 'user-edited', 'reconstructed'
  )),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'rejected', 'superseded')),
  parent_view_id uuid REFERENCES reference_views,
  prompt text,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 4. canonical_reference_sets
CREATE TABLE canonical_reference_sets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES product_projects ON DELETE CASCADE,
  version integer NOT NULL DEFAULT 1,
  view_ids uuid[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'superseded')),
  coverage text NOT NULL DEFAULT 'limited-single-view' CHECK (coverage IN (
    'limited-single-view', 'partial-multiview', 'full-multiview'
  )),
  approved_by uuid REFERENCES auth.users,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 5. reconstruction_versions
CREATE TABLE reconstruction_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES product_projects ON DELETE CASCADE,
  canonical_reference_set_id uuid NOT NULL REFERENCES canonical_reference_sets,
  provider_run_id uuid,
  route text NOT NULL CHECK (route IN ('single-view', 'multi-view', 'primitive-proxy')),
  mesh_url text,
  preview_url text,
  pbr_asset_urls jsonb,
  status text NOT NULL DEFAULT 'processing' CHECK (status IN (
    'processing', 'review', 'approved', 'rejected', 'failed'
  )),
  seed integer,
  parent_version_id uuid REFERENCES reconstruction_versions,
  created_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz
);

-- 6. studio_scene_versions
CREATE TABLE studio_scene_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES product_projects ON DELETE CASCADE,
  reconstruction_version_id uuid NOT NULL REFERENCES reconstruction_versions,
  camera jsonb NOT NULL DEFAULT '{}',
  lights jsonb NOT NULL DEFAULT '[]',
  product_transform jsonb NOT NULL DEFAULT '{}',
  environment jsonb NOT NULL DEFAULT '{}',
  output jsonb NOT NULL DEFAULT '{}',
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 7. render_packets
CREATE TABLE render_packets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES product_projects ON DELETE CASCADE,
  canonical_reference_set_id uuid NOT NULL REFERENCES canonical_reference_sets,
  reconstruction_version_id uuid NOT NULL REFERENCES reconstruction_versions,
  studio_scene_version_id uuid NOT NULL REFERENCES studio_scene_versions,
  beauty_url text NOT NULL,
  object_mask_url text,
  depth_url text,
  normal_url text,
  auxiliary_asset_urls jsonb,
  metadata_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 8. provider_runs (observability + job tracking)
CREATE TABLE provider_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES product_projects ON DELETE CASCADE,
  provider_type text NOT NULL CHECK (provider_type IN (
    'reference-view', 'reconstruction', 'final-render', 'analysis'
  )),
  provider_name text NOT NULL,
  model_name text NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN (
    'queued', 'processing', 'completed', 'failed', 'cancelled'
  )),
  request_hash text,
  external_request_id text,
  input_manifest_url text,
  output_manifest_url text,
  latency_ms integer,
  cost_estimate real,
  error_code text,
  error_message text,
  retry_count integer NOT NULL DEFAULT 0,
  idempotency_key text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

-- 9. final_render_versions
CREATE TABLE final_render_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES product_projects ON DELETE CASCADE,
  render_packet_id uuid NOT NULL REFERENCES render_packets,
  provider_run_id uuid REFERENCES provider_runs,
  output_url text,
  preservation_policy text NOT NULL DEFAULT 'balanced' CHECK (preservation_policy IN (
    'strict', 'balanced', 'creative'
  )),
  prompt text,
  resolution text NOT NULL DEFAULT '2k' CHECK (resolution IN ('1k', '2k', '4k')),
  status text NOT NULL DEFAULT 'processing' CHECK (status IN (
    'processing', 'review', 'approved', 'rejected', 'failed'
  )),
  parent_version_id uuid REFERENCES final_render_versions,
  created_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz
);

-- FK naar provider_runs vanuit reference_views en reconstruction_versions
ALTER TABLE reference_views
  ADD CONSTRAINT fk_reference_views_provider_run
  FOREIGN KEY (provider_run_id) REFERENCES provider_runs(id);

ALTER TABLE reconstruction_versions
  ADD CONSTRAINT fk_reconstruction_versions_provider_run
  FOREIGN KEY (provider_run_id) REFERENCES provider_runs(id);

-- Indexes
CREATE INDEX idx_product_projects_owner ON product_projects(owner_id);
CREATE INDEX idx_source_assets_project ON source_assets(project_id);
CREATE INDEX idx_reference_views_project ON reference_views(project_id);
CREATE INDEX idx_canonical_reference_sets_project ON canonical_reference_sets(project_id);
CREATE INDEX idx_reconstruction_versions_project ON reconstruction_versions(project_id);
CREATE INDEX idx_studio_scene_versions_project ON studio_scene_versions(project_id);
CREATE INDEX idx_render_packets_project ON render_packets(project_id);
CREATE INDEX idx_provider_runs_project ON provider_runs(project_id);
CREATE INDEX idx_final_render_versions_project ON final_render_versions(project_id);
CREATE INDEX idx_provider_runs_status ON provider_runs(status) WHERE status IN ('queued', 'processing');

-- RLS
ALTER TABLE product_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE source_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE reference_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE canonical_reference_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE reconstruction_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE studio_scene_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE render_packets ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE final_render_versions ENABLE ROW LEVEL SECURITY;

-- Policies: eigenaar mag alles in eigen project
CREATE POLICY "Eigen projecten" ON product_projects
  FOR ALL USING (auth.uid() = owner_id);

CREATE POLICY "Eigen source_assets" ON source_assets
  FOR ALL USING (project_id IN (SELECT id FROM product_projects WHERE owner_id = auth.uid()));

CREATE POLICY "Eigen reference_views" ON reference_views
  FOR ALL USING (project_id IN (SELECT id FROM product_projects WHERE owner_id = auth.uid()));

CREATE POLICY "Eigen canonical_reference_sets" ON canonical_reference_sets
  FOR ALL USING (project_id IN (SELECT id FROM product_projects WHERE owner_id = auth.uid()));

CREATE POLICY "Eigen reconstruction_versions" ON reconstruction_versions
  FOR ALL USING (project_id IN (SELECT id FROM product_projects WHERE owner_id = auth.uid()));

CREATE POLICY "Eigen studio_scene_versions" ON studio_scene_versions
  FOR ALL USING (project_id IN (SELECT id FROM product_projects WHERE owner_id = auth.uid()));

CREATE POLICY "Eigen render_packets" ON render_packets
  FOR ALL USING (project_id IN (SELECT id FROM product_projects WHERE owner_id = auth.uid()));

CREATE POLICY "Eigen provider_runs" ON provider_runs
  FOR ALL USING (project_id IN (SELECT id FROM product_projects WHERE owner_id = auth.uid()));

CREATE POLICY "Eigen final_render_versions" ON final_render_versions
  FOR ALL USING (project_id IN (SELECT id FROM product_projects WHERE owner_id = auth.uid()));

-- updated_at trigger voor product_projects
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_product_projects_updated_at
  BEFORE UPDATE ON product_projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
