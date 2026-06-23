-- Scene manifest op render_packets: camera, product transform, ground plane, bbox
ALTER TABLE render_packets
  ADD COLUMN IF NOT EXISTS scene_manifest jsonb;

-- Layered assets op final_render_versions
ALTER TABLE final_render_versions
  ADD COLUMN IF NOT EXISTS background_plate_url text,
  ADD COLUMN IF NOT EXISTS product_layer_url text,
  ADD COLUMN IF NOT EXISTS shadow_layer_url text,
  ADD COLUMN IF NOT EXISTS composite_url text,
  ADD COLUMN IF NOT EXISTS layer_metadata jsonb NOT NULL DEFAULT '{}'::jsonb;
