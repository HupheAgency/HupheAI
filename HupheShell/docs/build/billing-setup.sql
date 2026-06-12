-- Migration: billing_setup
-- Purpose: Foundation for organization-based billing (Stripe integration ready)

-- 1. Create the billing_accounts table
-- This table links an organization to its billing status and Stripe customer
CREATE TABLE IF NOT EXISTS public.billing_accounts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    stripe_customer_id text,
    billing_email text,
    plan_type text DEFAULT 'free' CHECK (plan_type IN ('free', 'pro', 'enterprise')),
    status text DEFAULT 'active' CHECK (status IN ('active', 'past_due', 'canceled', 'incomplete')),
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    UNIQUE(organization_id)
);

-- 2. Enable RLS
ALTER TABLE public.billing_accounts ENABLE ROW LEVEL SECURITY;

-- 3. Basic RLS Policies (Final review by Claude)
-- Only admins can see/manage all billing accounts
CREATE POLICY "Admins can manage all billing accounts"
    ON public.billing_accounts FOR ALL
    USING (public.is_admin());

-- Organization owners/admins can see their own billing status
CREATE POLICY "Org members can see their billing status"
    ON public.billing_accounts FOR SELECT
    USING (
        organization_id IN (
            SELECT org_id FROM public.organization_members 
            WHERE user_id = auth.uid() 
            AND role IN ('owner', 'admin')
        )
    );

-- 4. Trigger for updated_at
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_billing_updated_at
    BEFORE UPDATE ON public.billing_accounts
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

-- 5. Logging
SELECT public.log_action('Table created: billing_accounts', 'billing_accounts', NULL, NULL);
