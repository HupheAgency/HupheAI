-- Migration: audit_log_rpc

-- 1. Create the RPC function to log actions
-- This function runs with the privileges of the creator (SECURITY DEFINER),
-- allowing it to insert into the audit_log table even if the user has no direct write access.
CREATE OR REPLACE FUNCTION public.log_action(
    p_action text,
    p_target_table text DEFAULT NULL,
    p_target_id uuid DEFAULT NULL,
    p_payload jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    -- Validate action is not empty
    IF p_action IS NULL OR trim(p_action) = '' THEN
        RAISE EXCEPTION 'Action cannot be empty';
    END IF;

    -- Insert the log entry
    -- actor_id is automatically set to the ID of the user calling the function (auth.uid())
    INSERT INTO public.audit_log (
        actor_id,
        action,
        target_table,
        target_id,
        payload,
        created_at
    )
    VALUES (
        auth.uid(),
        p_action,
        p_target_table,
        p_target_id,
        p_payload,
        now()
    );
END;
$$;

-- 2. Update RLS policies for audit_log
-- First, ensure RLS is enabled (it should be already, but being safe)
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist to avoid conflicts
DROP POLICY IF EXISTS "Only admins can read audit logs" ON public.audit_log;
DROP POLICY IF EXISTS "No direct writes allowed" ON public.audit_log;

-- Admins can read all audit logs
CREATE POLICY "Admins can read all audit logs"
    ON public.audit_log FOR SELECT
    USING (public.is_admin());

-- No direct writes allowed for anyone (inserts only via RPC)
-- (By not creating an INSERT policy, direct inserts are forbidden by default in RLS)
