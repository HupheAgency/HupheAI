-- Generate Video: nieuwe fal-modellen, vervangen de inferieure OpenRouter-varianten
UPDATE ai_models SET active = false WHERE provider = 'openrouter' AND model_id IN ('google/veo-3.1', 'alibaba/wan-3.0');

INSERT INTO ai_models (provider, model_id, video_cost_estimate, markup_pct, active)
VALUES
  ('fal', 'fal-ai/veo3.1', 160000, 25, true),
  ('fal', 'fal-ai/kling-video/v3/pro', 56000, 25, true),
  ('fal', 'fal-ai/wan-25-preview', 75000, 25, true),
  ('fal', 'fal-ai/void-video-inpainting', 5000, 25, true),
  ('fal', 'fal-ai/kling-video/o1/video-to-video/edit', 84000, 25, true),
  ('fal', 'fal-ai/luma-dream-machine/ray-2/modify', 175000, 25, true),
  ('fal', 'fal-ai/topaz/upscale/video', 10000, 25, true),
  ('fal', 'topaz/interpolate/video', 30000, 25, true)
ON CONFLICT (provider, model_id)
DO UPDATE SET video_cost_estimate = EXCLUDED.video_cost_estimate, active = true;

-- Lip Sync: nieuw audio-model (output is video, maar leeft in de Audio-tab)
INSERT INTO ai_models (provider, model_id, audio_cost_estimate, markup_pct, active)
VALUES ('fal', 'fal-ai/sync-lipsync/v2', 150000, 25, true)
ON CONFLICT (provider, model_id)
DO UPDATE SET audio_cost_estimate = EXCLUDED.audio_cost_estimate, active = true;
