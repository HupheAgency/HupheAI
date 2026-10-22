-- Lip Sync: VEED Lipsync v2 (fal.ai) naast Sync Lipsync v2. Leeft in de Audio-tab (output is video).
-- Baseline-schatting: 10s * $0.07/s * 100.000 millicredits/USD.
INSERT INTO ai_models (provider, model_id, audio_cost_estimate, markup_pct, active)
VALUES ('fal', 'veed/lipsync/v2', 70000, 25, true)
ON CONFLICT (provider, model_id)
DO UPDATE SET audio_cost_estimate = EXCLUDED.audio_cost_estimate, active = true;
