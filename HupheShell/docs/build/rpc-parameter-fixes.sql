-- Fix parameter names in existing RPCs

-- 1. share_presentation
-- Herdefinitie met hernoemde parameter p_recipient_email
CREATE OR REPLACE FUNCTION public.share_presentation(
    p_presentation_id uuid,
    p_recipient_email text,
    p_role text DEFAULT 'viewer'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id uuid;
BEGIN
    -- Check permissions: caller must be owner
    IF NOT EXISTS (
        SELECT 1 FROM presentation_members
        WHERE presentation_id = p_presentation_id
        AND user_id = auth.uid()
        AND role = 'owner'
    ) THEN
        RAISE EXCEPTION 'Only owners can share this presentation';
    END IF;

    -- Find user by email
    SELECT id INTO v_user_id FROM auth.users WHERE email = p_recipient_email;

    IF v_user_id IS NOT NULL THEN
        -- Insert or update
        INSERT INTO presentation_members (presentation_id, user_id, role)
        VALUES (p_presentation_id, v_user_id, p_role::presentation_role)
        ON CONFLICT (presentation_id, user_id)
        DO UPDATE SET role = EXCLUDED.role;
    END IF;
END;
$$;

-- 2. join_presentation_by_code
-- Herdefinitie met hernoemde parameter p_code
CREATE OR REPLACE FUNCTION public.join_presentation_by_code(
    p_code text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_presentation_id uuid;
BEGIN
    SELECT id INTO v_presentation_id FROM presentations WHERE share_code = p_code;

    IF v_presentation_id IS NULL THEN
        RAISE EXCEPTION 'Invalid share code';
    END IF;

    INSERT INTO presentation_members (presentation_id, user_id, role)
    VALUES (v_presentation_id, auth.uid(), 'viewer')
    ON CONFLICT (presentation_id, user_id) DO NOTHING;

    RETURN v_presentation_id;
END;
$$;

-- 3. sync_presentation_state
-- Herdefinitie met hernoemde parameter p_id
CREATE OR REPLACE FUNCTION public.sync_presentation_state(
    p_id uuid,
    p_state jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Check permissions: caller must be owner or editor
    IF NOT EXISTS (
        SELECT 1 FROM presentation_members
        WHERE presentation_id = p_id
        AND user_id = auth.uid()
        AND role IN ('owner', 'editor')
    ) THEN
        RAISE EXCEPTION 'Only owners and editors can sync state';
    END IF;

    UPDATE presentations
    SET state = p_state, updated_at = now()
    WHERE id = p_id;
END;
$$;