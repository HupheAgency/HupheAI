-- Migration: atelier_rpcs
-- Purpose: Security Definer functions for Atelier frontend operations

-- 1. share_presentation
-- Adds a user to a presentation by email.
CREATE OR REPLACE FUNCTION public.share_presentation(
    p_presentation_id uuid,
    p_user_email text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_user_id uuid;
    v_owner_id uuid;
BEGIN
    -- 1. Check if caller is owner
    SELECT owner_id INTO v_owner_id FROM public.presentations WHERE id = p_presentation_id;
    
    IF v_owner_id IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Presentatie niet gevonden.');
    END IF;
    
    IF v_owner_id <> auth.uid() AND NOT public.is_admin() THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Alleen de eigenaar kan delen.');
    END IF;

    -- 2. Lookup user by email
    SELECT id INTO v_user_id FROM auth.users WHERE email = p_user_email;
    
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Gebruiker met dit e-mailadres niet gevonden.');
    END IF;

    -- 3. Add or update member
    INSERT INTO public.presentation_members (presentation_id, user_id, role)
    VALUES (p_presentation_id, v_user_id, 'viewer')
    ON CONFLICT (presentation_id, user_id) DO UPDATE SET role = EXCLUDED.role;

    RETURN jsonb_build_object('ok', true);
END;
$$;

-- 2. join_presentation_by_code
-- Allows a user to join a live presentation using a 6-char share code.
CREATE OR REPLACE FUNCTION public.join_presentation_by_code(
    p_share_code text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_presentation_id uuid;
BEGIN
    -- 1. Find presentation
    SELECT id INTO v_presentation_id 
    FROM public.presentations 
    WHERE share_code = upper(p_share_code);
    
    IF v_presentation_id IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Ongeldige code.');
    END IF;

    -- 2. Add current user as viewer (if not already member/owner)
    -- If user is owner, they are already allowed.
    INSERT INTO public.presentation_members (presentation_id, user_id, role)
    VALUES (v_presentation_id, auth.uid(), 'viewer')
    ON CONFLICT (presentation_id, user_id) DO NOTHING;

    RETURN jsonb_build_object('ok', true, 'presentation_id', v_presentation_id);
END;
$$;

-- 3. sync_presentation_state
-- Updates the blocks and overrides of a presentation.
CREATE OR REPLACE FUNCTION public.sync_presentation_state(
    p_presentation_id uuid,
    p_blocks jsonb,
    p_overrides jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_has_access boolean;
BEGIN
    -- 1. Check if caller is owner or editor
    SELECT EXISTS (
        SELECT 1 FROM public.presentations WHERE id = p_presentation_id AND owner_id = auth.uid()
        UNION
        SELECT 1 FROM public.presentation_members 
        WHERE presentation_id = p_presentation_id 
        AND user_id = auth.uid() 
        AND role IN ('owner', 'editor')
    ) INTO v_has_access;

    IF NOT v_has_access AND NOT public.is_admin() THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Geen schrijfrechten voor deze presentatie.');
    END IF;

    -- 2. Update state
    UPDATE public.presentations
    SET 
        blocks = p_blocks,
        overrides = p_overrides,
        updated_at = now()
    WHERE id = p_presentation_id;

    RETURN jsonb_build_object('ok', true);
END;
$$;

-- ---------------------------------------------------------------------------
-- LOGGING
-- ---------------------------------------------------------------------------
SELECT public.log_action('Atelier RPCs defined', 'presentations', NULL, '{"count": 3}');
