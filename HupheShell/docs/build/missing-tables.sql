-- Migration: missing_tables

-- 1. Organizations
CREATE TABLE IF NOT EXISTS public.organizations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    owner_id uuid NOT NULL REFERENCES auth.users(id),
    created_at timestamptz DEFAULT now()
);

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can read their own organizations" 
    ON public.organizations FOR SELECT 
    USING (
        id IN (SELECT org_id FROM public.organization_members WHERE user_id = auth.uid()) 
        OR owner_id = auth.uid()
        OR public.is_admin()
    );

CREATE POLICY "Admins can manage all organizations" 
    ON public.organizations FOR ALL 
    USING (public.is_admin());

-- 2. Organization Members
CREATE TABLE IF NOT EXISTS public.organization_members (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role text NOT NULL CHECK (role IN ('owner', 'admin', 'member', 'client_admin')),
    created_at timestamptz DEFAULT now(),
    UNIQUE(org_id, user_id)
);

ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can read their colleagues" 
    ON public.organization_members FOR SELECT 
    USING (
        org_id IN (SELECT org_id FROM public.organization_members WHERE user_id = auth.uid())
        OR public.is_admin()
    );

CREATE POLICY "Admins can manage all members" 
    ON public.organization_members FOR ALL 
    USING (public.is_admin());

-- 3. Modules (Catalog)
CREATE TABLE IF NOT EXISTS public.modules (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    slug text UNIQUE NOT NULL,
    label text NOT NULL,
    description text,
    is_active bool DEFAULT false,
    created_at timestamptz DEFAULT now()
);

ALTER TABLE public.modules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Everyone can read active modules" 
    ON public.modules FOR SELECT 
    TO authenticated 
    USING (true);

CREATE POLICY "Only admins can manage modules" 
    ON public.modules FOR ALL 
    USING (public.is_admin());

-- 4. User Module Access
CREATE TABLE IF NOT EXISTS public.user_module_access (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    module_id uuid NOT NULL REFERENCES public.modules(id) ON DELETE CASCADE,
    granted_by uuid REFERENCES auth.users(id),
    created_at timestamptz DEFAULT now(),
    UNIQUE(user_id, module_id)
);

ALTER TABLE public.user_module_access ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can see their own module access" 
    ON public.user_module_access FOR SELECT 
    USING (user_id = auth.uid() OR public.is_admin());

CREATE POLICY "Only admins can manage module access" 
    ON public.user_module_access FOR ALL 
    USING (public.is_admin());

-- 5. Invite Quotas
CREATE TABLE IF NOT EXISTS public.invite_quotas (
    user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    quota int DEFAULT 0,
    used int DEFAULT 0
);

ALTER TABLE public.invite_quotas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can see their own quota" 
    ON public.invite_quotas FOR SELECT 
    USING (user_id = auth.uid() OR public.is_admin());

CREATE POLICY "Only admins can manage quotas" 
    ON public.invite_quotas FOR ALL 
    USING (public.is_admin());

-- 6. Usage Quotas (AI tokens/generations)
CREATE TABLE IF NOT EXISTS public.usage_quotas (
    user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    monthly_limit int DEFAULT 100,
    used_this_month int DEFAULT 0,
    reset_at timestamptz DEFAULT now() + interval '1 month'
);

ALTER TABLE public.usage_quotas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can see their own usage" 
    ON public.usage_quotas FOR SELECT 
    USING (user_id = auth.uid() OR public.is_admin());

CREATE POLICY "Only admins can manage usage quotas" 
    ON public.usage_quotas FOR ALL 
    USING (public.is_admin());

-- 7. Maintenance Config
CREATE TABLE IF NOT EXISTS public.maintenance_config (
    id text PRIMARY KEY DEFAULT 'global',
    is_active bool DEFAULT false,
    message text,
    updated_at timestamptz DEFAULT now(),
    updated_by uuid REFERENCES auth.users(id)
);

ALTER TABLE public.maintenance_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Everyone can read maintenance status" 
    ON public.maintenance_config FOR SELECT 
    TO authenticated 
    USING (true);

CREATE POLICY "Only admins can update maintenance status" 
    ON public.maintenance_config FOR ALL 
    USING (public.is_admin());

-- 8. TOS Acceptances
CREATE TABLE IF NOT EXISTS public.tos_acceptances (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    tos_version text NOT NULL,
    accepted_at timestamptz DEFAULT now()
);

ALTER TABLE public.tos_acceptances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can see their own acceptances" 
    ON public.tos_acceptances FOR SELECT 
    USING (user_id = auth.uid() OR public.is_admin());

CREATE POLICY "Users can insert their own acceptance" 
    ON public.tos_acceptances FOR INSERT 
    WITH CHECK (user_id = auth.uid());

-- 9. Audit Log
CREATE TABLE IF NOT EXISTS public.audit_log (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id uuid NOT NULL REFERENCES auth.users(id),
    action text NOT NULL,
    target_table text,
    target_id uuid,
    payload jsonb,
    created_at timestamptz DEFAULT now()
);

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Only admins can read audit logs" 
    ON public.audit_log FOR SELECT 
    USING (public.is_admin());

-- Note: Audit logs are inserted via SECURITY DEFINER functions, no direct write policy needed for users.
