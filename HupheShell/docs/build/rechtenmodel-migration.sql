-- migration for rechtenmodel
BEGIN;

-- Create role enum type if it doesn't exist
DO $$ BEGIN
    CREATE TYPE presentation_role AS ENUM ('owner', 'editor', 'commenter', 'viewer');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Alter presentation_members table
ALTER TABLE presentation_members
ADD COLUMN IF NOT EXISTS role presentation_role NOT NULL DEFAULT 'viewer';

-- RLS Policies for presentations
-- Drop existing policies if necessary before creating (omitted for brevity)

-- 1. Owners can manage (delete, share, edit)
CREATE POLICY "Owners can manage presentations" ON presentations
FOR ALL
USING (
    EXISTS (
        SELECT 1 FROM presentation_members
        WHERE presentation_members.presentation_id = presentations.id
        AND presentation_members.user_id = auth.uid()
        AND presentation_members.role = 'owner'
    )
);

-- 2. Editors can update (but not delete or alter sharing)
CREATE POLICY "Editors can update presentations" ON presentations
FOR UPDATE
USING (
    EXISTS (
        SELECT 1 FROM presentation_members
        WHERE presentation_members.presentation_id = presentations.id
        AND presentation_members.user_id = auth.uid()
        AND presentation_members.role IN ('owner', 'editor')
    )
);

-- 3. Viewers and Commenters can read
CREATE POLICY "Viewers and Commenters can read presentations" ON presentations
FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM presentation_members
        WHERE presentation_members.presentation_id = presentations.id
        AND presentation_members.user_id = auth.uid()
        AND presentation_members.role IN ('owner', 'editor', 'commenter', 'viewer')
    )
);

-- RLS Policies for presentation_members (managing shares)
CREATE POLICY "Owners can manage presentation_members" ON presentation_members
FOR ALL
USING (
    EXISTS (
        SELECT 1 FROM presentation_members AS pm
        WHERE pm.presentation_id = presentation_members.presentation_id
        AND pm.user_id = auth.uid()
        AND pm.role = 'owner'
    )
);

-- RLS Policies for slide_comments
CREATE POLICY "Commenters can manage comments" ON slide_comments
FOR ALL
USING (
    EXISTS (
        SELECT 1 FROM presentation_members
        WHERE presentation_members.presentation_id = slide_comments.presentation_id
        AND presentation_members.user_id = auth.uid()
        AND presentation_members.role IN ('owner', 'editor', 'commenter')
    )
);

COMMIT;