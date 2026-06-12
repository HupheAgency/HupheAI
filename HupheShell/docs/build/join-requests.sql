-- Migration: join_requests

-- 1. Create the join_requests table
CREATE TABLE IF NOT EXISTS public.join_requests (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email text NOT NULL,
    name text,
    message text,
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied')),
    requested_at timestamptz NOT NULL DEFAULT now(),
    reviewed_at timestamptz,
    reviewed_by uuid REFERENCES auth.users(id)
);

-- 2. Enable RLS
ALTER TABLE public.join_requests ENABLE ROW LEVEL SECURITY;

-- 3. Create Policies

-- Allow anonymous visitors to submit a join request (pre-login)
CREATE POLICY "anon_insert_join_requests" 
    ON public.join_requests FOR INSERT 
    TO anon 
    WITH CHECK (true);

-- Only admins can view join requests
CREATE POLICY "admins_select_join_requests" 
    ON public.join_requests FOR SELECT 
    USING (public.is_admin());

-- Only admins can update join requests (approve/deny)
CREATE POLICY "admins_update_join_requests" 
    ON public.join_requests FOR UPDATE 
    USING (public.is_admin());

-- Nobody can delete join requests (they are kept for history)
-- (Handled by absence of DELETE policy)
