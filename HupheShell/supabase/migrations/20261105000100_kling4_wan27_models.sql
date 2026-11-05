-- Kling 4 en Wan 2.7 vervangen Kling 3 Pro en Wan 2.5 Preview voor het genereren van video.
-- video_cost_estimate = tarief per seconde x 5 s x 100000 (alleen een terugvalschatting; de
-- echte reservering komt uit pricing_skus in proxy-fal-video). Hoogste resolutie als schatting.
INSERT INTO ai_models (provider, model_id, video_cost_estimate, markup_pct, active)
VALUES
  ('fal', 'fal-ai/kling-video/v4', 117500, 25, true),
  ('fal', 'fal-ai/wan/v2.7', 75000, 25, true)
ON CONFLICT (provider, model_id)
DO UPDATE SET video_cost_estimate = EXCLUDED.video_cost_estimate, active = true;

UPDATE ai_models SET active = false
WHERE provider = 'fal' AND model_id IN ('fal-ai/kling-video/v3/pro', 'fal-ai/wan-25-preview');
