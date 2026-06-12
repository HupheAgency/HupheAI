-- Migration: Seed standaard Engine-agents met vaste UUIDs en voeg index toe

-- 1. Zorg ervoor dat er een index is op het 'model' veld in de 'agents' tabel
-- Dit versnelt de lookups (bijv. in engine-ipc.ts) om agentId te vinden o.b.v. payload.agentModel
CREATE INDEX IF NOT EXISTS idx_agents_model ON public.agents (model);

-- 2. Seed standaard Engine-agents met vaste UUIDs
INSERT INTO public.agents (id, name, model, description, system_prompt)
VALUES
  ('00000000-0000-0000-0000-000000000001', 'ChatGPT (GPT-4o)',      'openai/gpt-4o',                   'OpenAI Flagship',      ''),
  ('00000000-0000-0000-0000-000000000002', 'Gemini 1.5 Pro',        'google/gemini-1.5-pro',            'Google Flagship',      ''),
  ('00000000-0000-0000-0000-000000000003', 'Claude 3.5 Sonnet',     'anthropic/claude-3.5-sonnet',      'Anthropic Flagship',   '')
ON CONFLICT (id) DO UPDATE
  SET 
    name = EXCLUDED.name, 
    model = EXCLUDED.model,
    description = EXCLUDED.description;
