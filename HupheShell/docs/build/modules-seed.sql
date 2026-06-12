-- Seed: modules

-- Idempotent insert of the core HupheAI modules
-- is_active = true means it is globally visible/enabled
-- user_module_access table handles individual user permissions

INSERT INTO public.modules (slug, label, description, is_active)
VALUES 
    ('home', 'Home', 'Introscherm', true),
    ('pulse', 'Pulse', 'Autonoom reclamebureau', true),
    ('atelier', 'Atelier', 'Creatie & uitwerking', true),
    ('engine', 'Engine', 'Bouw & livegang', false),
    ('flow', 'Flow', 'Pipeline & automatisatie', false),
    ('ledger', 'Ledger', 'Administratie & geld', false),
    ('twin', 'Twin', 'Jouw AI-duplicaat', false),
    ('documents', 'Documents', 'Jouw opgeslagen documenten', true),
    ('settings', 'Instellingen', 'Templates, account en configuratie', true),
    ('backstage', 'Backstage', 'Interne machinekamer voor geavanceerde workflows', false)
ON CONFLICT (slug) DO UPDATE SET
    label = EXCLUDED.label,
    description = EXCLUDED.description,
    is_active = EXCLUDED.is_active;

-- Log the action
SELECT public.log_action('Seed: modules expanded', 'modules', NULL, '{"count": 10}');

