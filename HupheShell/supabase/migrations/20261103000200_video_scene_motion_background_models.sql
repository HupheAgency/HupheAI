-- Omgeving aanpassen (Kling 4.0 Edit), motion control (Kling v3 Pro) en
-- achtergrond verwijderen (Bria VRMBG 3.0). Reserveringen zijn per-seconde-schattingen
-- in proxy-fal-video; video_cost_estimate is alleen de activatiemarker.
INSERT INTO ai_models (provider, model_id, video_cost_estimate, markup_pct, active)
VALUES
  ('fal', 'kling/v4/video-to-video/edit', 141000, 25, true),
  ('fal', 'fal-ai/kling-video/v3/pro/motion-control', 84000, 25, true),
  ('fal', 'bria/video/background-removal/v3', 25000, 25, true)
ON CONFLICT (provider, model_id)
DO UPDATE SET video_cost_estimate = EXCLUDED.video_cost_estimate, active = true;
