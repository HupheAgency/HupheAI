-- Migration: atelier_rls_v2
-- Purpose: Refine RLS policies for Atelier to allow non-admin users to manage their own data
-- and ensure secure collaboration via members and comments.

-- 0. Ensure slide_comments table exists (if missing from previous migrations)
CREATE TABLE IF NOT EXISTS public.slide_comments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    presentation_id uuid NOT NULL REFERENCES public.presentations(id) ON DELETE CASCADE,
    slide_id text NOT NULL, -- Reference to the slide index or stable ID in blocks
    author_id uuid NOT NULL REFERENCES auth.users(id),
    body text NOT NULL,
    resolved boolean DEFAULT false,
    created_at timestamptz DEFAULT now()
);

ALTER TABLE public.slide_comments ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_slide_comments_presentation_id ON public.slide_comments(presentation_id);

-- ---------------------------------------------------------------------------
-- 1. CLIENTS
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Clients: owners can manage" ON public.clients;

-- New Policies
CREATE POLICY "Clients: authenticated can view" ON public.clients
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "Clients: admins can manage" ON public.clients
    FOR ALL TO authenticated USING (public.is_admin());


-- ---------------------------------------------------------------------------
-- 2. TEMPLATES & MAPPINGS
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Templates: authenticated can view" ON public.templates;
DROP POLICY IF EXISTS "Templates: owners can manage" ON public.templates;
DROP POLICY IF EXISTS "Mappings: authenticated can view" ON public.template_mappings;
DROP POLICY IF EXISTS "Mappings: template owners can manage" ON public.template_mappings;

-- New Policies for Templates
CREATE POLICY "Templates: authenticated can view" ON public.templates
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "Templates: admins can manage" ON public.templates
    FOR ALL TO authenticated USING (public.is_admin());

-- New Policies for Mappings
CREATE POLICY "Mappings: authenticated can view" ON public.template_mappings
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "Mappings: admins can manage" ON public.template_mappings
    FOR ALL TO authenticated USING (public.is_admin());


-- ---------------------------------------------------------------------------
-- 3. PRESENTATIONS
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Presentations: owners can manage" ON public.presentations;
DROP POLICY IF EXISTS "Presentations: members can view" ON public.presentations;

-- New Policies
CREATE POLICY "Presentations: owners and members can view" ON public.presentations
    FOR SELECT TO authenticated USING (
        owner_id = auth.uid() 
        OR EXISTS (SELECT 1 FROM public.presentation_members WHERE presentation_id = id AND user_id = auth.uid())
        OR public.is_admin()
    );

CREATE POLICY "Presentations: users can insert" ON public.presentations
    FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Presentations: owners can update" ON public.presentations
    FOR UPDATE TO authenticated USING (owner_id = auth.uid() OR public.is_admin());

CREATE POLICY "Presentations: owners can delete" ON public.presentations
    FOR DELETE TO authenticated USING (owner_id = auth.uid() OR public.is_admin());


-- ---------------------------------------------------------------------------
-- 4. PRESENTATION MEMBERS
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Members: view own or owned presentation rows" ON public.presentation_members;

-- New Policies
CREATE POLICY "Members: view self or owned presentation members" ON public.presentation_members
    FOR SELECT TO authenticated USING (
        user_id = auth.uid()
        OR EXISTS (SELECT 1 FROM public.presentations WHERE id = presentation_id AND owner_id = auth.uid())
        OR public.is_admin()
    );

CREATE POLICY "Members: owners can insert members" ON public.presentation_members
    FOR INSERT TO authenticated WITH CHECK (
        EXISTS (SELECT 1 FROM public.presentations WHERE id = presentation_id AND owner_id = auth.uid())
        OR public.is_admin()
    );

CREATE POLICY "Members: self or owners can delete members" ON public.presentation_members
    FOR DELETE TO authenticated USING (
        user_id = auth.uid()
        OR EXISTS (SELECT 1 FROM public.presentations WHERE id = presentation_id AND owner_id = auth.uid())
        OR public.is_admin()
    );


-- ---------------------------------------------------------------------------
-- 5. SLIDE COMMENTS
-- ---------------------------------------------------------------------------

-- New Policies
CREATE POLICY "Comments: presentation members can view" ON public.slide_comments
    FOR SELECT TO authenticated USING (
        EXISTS (
            SELECT 1 FROM public.presentations WHERE id = presentation_id AND owner_id = auth.uid()
            UNION
            SELECT 1 FROM public.presentation_members WHERE presentation_id = presentation_id AND user_id = auth.uid()
        )
        OR public.is_admin()
    );

CREATE POLICY "Comments: presentation members can insert" ON public.slide_comments
    FOR INSERT TO authenticated WITH CHECK (
        (
            EXISTS (SELECT 1 FROM public.presentations WHERE id = presentation_id AND owner_id = auth.uid())
            OR EXISTS (SELECT 1 FROM public.presentation_members WHERE presentation_id = presentation_id AND user_id = auth.uid())
        )
        AND author_id = auth.uid()
    );

CREATE POLICY "Comments: authors can update" ON public.slide_comments
    FOR UPDATE TO authenticated USING (author_id = auth.uid() OR public.is_admin());

CREATE POLICY "Comments: authors or presentation owners can delete" ON public.slide_comments
    FOR DELETE TO authenticated USING (
        author_id = auth.uid()
        OR EXISTS (SELECT 1 FROM public.presentations WHERE id = presentation_id AND owner_id = auth.uid())
        OR public.is_admin()
    );

-- ---------------------------------------------------------------------------
-- 6. ASSET CLEANUP HELPER
-- ---------------------------------------------------------------------------

-- This RPC allows the cleanup Edge Function to quickly get all active URLs
CREATE OR REPLACE FUNCTION public.get_active_asset_urls()
RETURNS text[] 
LANGUAGE sql 
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT array_agg(DISTINCT (slide->>'imageUrl'))
  FROM public.presentations, 
  jsonb_array_elements(blocks) AS slide
  WHERE blocks IS NOT NULL AND slide->>'imageUrl' IS NOT NULL;
$$;

-- ---------------------------------------------------------------------------
-- LOGGING
-- ---------------------------------------------------------------------------
SELECT public.log_action('RLS v2 policies and cleanup helpers applied to Atelier', 'presentations', NULL, '{"version": 2.1}');
