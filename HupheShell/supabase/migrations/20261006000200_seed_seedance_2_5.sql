-- Seedance 2.5 kost $0.231/s op 720p; de video-edge-function vraagt standaard 5s/720p aan,
-- dus basiskost = 5 * 0.231 * 100.000 millicredits/$ = 115.500, afgerond naar 116.000.
INSERT INTO ai_models (provider, model_id, video_cost_estimate, markup_pct, active)
VALUES ('openrouter', 'bytedance/seedance-2.5', 116000, 25, true)
ON CONFLICT (provider, model_id)
DO UPDATE SET video_cost_estimate = EXCLUDED.video_cost_estimate, active = true;
