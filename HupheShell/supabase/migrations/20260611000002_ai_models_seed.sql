-- Cost definitions are in millicredits (1 EUR = 100,000 millicredits)
-- Using actual approximate market rates + standard markup of 25%

INSERT INTO ai_models (provider, model_id, input_cost_per_1k, output_cost_per_1k, image_cost, markup_pct) VALUES
-- OpenRouter text models
('openrouter', 'openai/gpt-4o', 460, 1380, NULL, 25),
('openrouter', 'google/gemini-1.5-pro', 320, 960, NULL, 25),
('openrouter', 'anthropic/claude-3.5-sonnet', 276, 1380, NULL, 25),
('openrouter', 'anthropic/claude-3-5-haiku', 92, 460, NULL, 25),
('openrouter', 'meta-llama/llama-3.1-8b-instruct', 5, 5, NULL, 25),

-- Fal.ai image models
('fal', 'fal-ai/flux-pro/v1/fill', NULL, NULL, 4600, 25),     -- approx $0.05 per generation
('fal', 'fal-ai/flux/dev', NULL, NULL, 2760, 25),             -- approx $0.03 per generation
('fal', 'fal-ai/flux-lora/inpainting', NULL, NULL, 2760, 25), -- outpainting for env reconstruction
('fal', 'fal-ai/flux-lora/image-to-image', NULL, NULL, 2760, 25) -- img2img for top-down view
ON CONFLICT (provider, model_id) DO UPDATE SET
  input_cost_per_1k = EXCLUDED.input_cost_per_1k,
  output_cost_per_1k = EXCLUDED.output_cost_per_1k,
  image_cost = EXCLUDED.image_cost,
  markup_pct = EXCLUDED.markup_pct;
