-- Migration: audit_log_indexes

-- 1. Index for actor_id to speed up filtering by user
-- Combined with created_at DESC because audit logs are almost always viewed chronologically.
CREATE INDEX IF NOT EXISTS idx_audit_log_actor_id_created_at 
ON public.audit_log (actor_id, created_at DESC);

-- 2. Index for target_table to speed up filtering by specific entity type
-- Combined with created_at DESC for fast chronological viewing of table-specific changes.
CREATE INDEX IF NOT EXISTS idx_audit_log_target_table_created_at 
ON public.audit_log (target_table, created_at DESC);

-- 3. Dedicated index on created_at for the general "Recent Activity" view
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at_desc 
ON public.audit_log (created_at DESC);

-- 4. Index on target_id for searching changes to a specific record
-- Useful when an admin wants to see the history of a single presentation or user.
CREATE INDEX IF NOT EXISTS idx_audit_log_target_id 
ON public.audit_log (target_id);

-- Summary: 
-- These indexes ensure that whether searching by user, table, or just browsing the latest logs, 
-- the Supabase dashboard and the AdminPage will remain fast as the log grows.
