-- Migration: atelier_schema
-- Purpose: Formal definitions for core Atelier tables with RLS and Indexes

-- 1. Presentations Table
CREATE TABLE IF NOT EXISTS public.presentations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id uuid NOT NULL REFERENCES auth.users(id),
    name text NOT NULL,
    template_client_id text, -- ID of the template/client used
    blocks jsonb DEFAULT '[]'::jsonb,
    overrides jsonb DEFAULT '{}'::jsonb,
    md_text text,
    is_live boolean DEFAULT false,
    share_code text UNIQUE,
    asset_paths text[] DEFAULT '{}',
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- 2. Presentation Members (for collaboration)
CREATE TABLE IF NOT EXISTS public.presentation_members (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    presentation_id uuid NOT NULL REFERENCES public.presentations(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role text NOT NULL CHECK (role IN ('owner', 'editor', 'viewer')),
    joined_at timestamptz DEFAULT now(),
    UNIQUE(presentation_id, user_id)
);

-- 3. Templates (Master layouts)
CREATE TABLE IF NOT EXISTS public.templates (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id text UNIQUE NOT NULL, -- Human-friendly unique ID used in storage paths
    owner_id uuid REFERENCES auth.users(id),
    name text NOT NULL,
    template_data jsonb DEFAULT '{}'::jsonb,
    created_at timestamptz DEFAULT now()
);

-- 4. Template Mappings (User-defined tags/names for placeholders)
CREATE TABLE IF NOT EXISTS public.template_mappings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id text UNIQUE NOT NULL REFERENCES public.templates(client_id) ON DELETE CASCADE,
    mappings jsonb DEFAULT '{}'::jsonb,
    updated_at timestamptz DEFAULT now()
);

-- 5. Clients (Client-specific branding/grouping)
CREATE TABLE IF NOT EXISTS public.clients (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id text UNIQUE NOT NULL,
    name text NOT NULL,
    owner_id uuid REFERENCES auth.users(id),
    created_at timestamptz DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- INDEXES
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_presentations_owner_id ON public.presentations(owner_id);
CREATE INDEX IF NOT EXISTS idx_presentations_share_code ON public.presentations(share_code);
CREATE INDEX IF NOT EXISTS idx_presentations_is_live ON public.presentations(is_live);
CREATE INDEX IF NOT EXISTS idx_presentation_members_presentation_id ON public.presentation_members(presentation_id);
CREATE INDEX IF NOT EXISTS idx_presentation_members_user_id ON public.presentation_members(user_id);
CREATE INDEX IF NOT EXISTS idx_templates_owner_id ON public.templates(owner_id);
CREATE INDEX IF NOT EXISTS idx_templates_client_id ON public.templates(client_id);
CREATE INDEX IF NOT EXISTS idx_clients_owner_id ON public.clients(owner_id);

-- ---------------------------------------------------------------------------
-- RLS POLICIES
-- ---------------------------------------------------------------------------

ALTER TABLE public.presentations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.presentation_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.template_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

-- Presentations: Owner + Members + Admin
CREATE POLICY "Presentations: owners can manage" ON public.presentations
    FOR ALL USING (owner_id = auth.uid() OR public.is_admin());

CREATE POLICY "Presentations: members can view" ON public.presentations
    FOR SELECT USING (
        id IN (SELECT presentation_id FROM public.presentation_members WHERE user_id = auth.uid())
    );

-- Presentation Members: Users see their rows, owner sees all
CREATE POLICY "Members: view own or owned presentation rows" ON public.presentation_members
    FOR SELECT USING (
        user_id = auth.uid() 
        OR presentation_id IN (SELECT id FROM public.presentations WHERE owner_id = auth.uid())
        OR public.is_admin()
    );

-- Templates: Shared read, Owner write
CREATE POLICY "Templates: authenticated can view" ON public.templates
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "Templates: owners can manage" ON public.templates
    FOR ALL USING (owner_id = auth.uid() OR public.is_admin());

-- Template Mappings: Read by all, Write by template owner
CREATE POLICY "Mappings: authenticated can view" ON public.template_mappings
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "Mappings: template owners can manage" ON public.template_mappings
    FOR ALL USING (
        client_id IN (SELECT client_id FROM public.templates WHERE owner_id = auth.uid())
        OR public.is_admin()
    );

-- Clients: Owner + Admin
CREATE POLICY "Clients: owners can manage" ON public.clients
    FOR ALL USING (owner_id = auth.uid() OR public.is_admin());

-- ---------------------------------------------------------------------------
-- TRIGGERS (updated_at)
-- ---------------------------------------------------------------------------

-- The handle_updated_at function is expected to exist (from billing_setup.sql)
-- If not, it can be added here as well.
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_presentations_updated_at
    BEFORE UPDATE ON public.presentations
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER tr_template_mappings_updated_at
    BEFORE UPDATE ON public.template_mappings
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ---------------------------------------------------------------------------
-- LOGGING
-- ---------------------------------------------------------------------------
SELECT public.log_action('Atelier core tables defined', 'presentations', NULL, '{"tables": 5}');
