-- ── Typewriter v2: schema uitbreiding en RLS fixes ──────────────────────────
-- Gebaseerd op Gemini's handoff: typewriter-document-model.md,
-- typewriter-review-workflow.md, typewriter-collaboration-versioning.md
-- en Claude's auditbevindingen (2026-06-15).

-- ── 1. typewriter_documents: nieuwe kolommen ────────────────────────────────

-- JSON-model voor TipTap (na engine-migratie gevuld; tot die tijd NULL)
ALTER TABLE public.typewriter_documents
  ADD COLUMN IF NOT EXISTS content_json  jsonb,
  ADD COLUMN IF NOT EXISTS review_status text NOT NULL DEFAULT 'draft'
    CHECK (review_status IN ('draft', 'in_review', 'approved', 'final'));

CREATE INDEX IF NOT EXISTS idx_tw_docs_review_status
  ON public.typewriter_documents(review_status);

-- ── 2. typewriter_doc_members: role-kolom + RLS fix ─────────────────────────

ALTER TABLE public.typewriter_doc_members
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'editor'
    CHECK (role IN ('viewer', 'commenter', 'editor'));

-- Verwijder te brede member-update policy (mist column-level beperking)
DROP POLICY IF EXISTS "typewriter_docs_member_update" ON public.typewriter_documents;

-- Nieuwe policy: leden mogen alleen content en linked_selections updaten
CREATE POLICY "typewriter_docs_member_update" ON public.typewriter_documents
  FOR UPDATE TO authenticated
  USING (
    id IN (
      SELECT doc_id FROM public.typewriter_doc_members
      WHERE user_id = auth.uid()
        AND role IN ('editor')
    )
  )
  WITH CHECK (
    id IN (
      SELECT doc_id FROM public.typewriter_doc_members
      WHERE user_id = auth.uid()
        AND role IN ('editor')
    )
  );

-- INSERT: eigenaar kan leden toevoegen aan eigen documenten
DROP POLICY IF EXISTS "tdm_insert" ON public.typewriter_doc_members;
CREATE POLICY "tdm_insert" ON public.typewriter_doc_members
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.typewriter_documents
      WHERE id = doc_id AND owner_id = auth.uid()
    )
  );

-- DELETE: eigenaar kan leden verwijderen; leden kunnen zichzelf verwijderen
DROP POLICY IF EXISTS "tdm_delete" ON public.typewriter_doc_members;
CREATE POLICY "tdm_delete" ON public.typewriter_doc_members
  FOR DELETE TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.typewriter_documents
      WHERE id = doc_id AND owner_id = auth.uid()
    )
  );

-- ── 3. typewriter_versions: snapshots voor version history ───────────────────

CREATE TABLE IF NOT EXISTS public.typewriter_versions (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_id      text        NOT NULL REFERENCES public.typewriter_documents(id) ON DELETE CASCADE,
  created_by  uuid        NOT NULL REFERENCES auth.users(id),
  label       text,                          -- Optioneel handmatig label bijv. "V1 Final"
  content     text        NOT NULL,          -- HTML snapshot (huidig formaat)
  content_json jsonb,                        -- TipTap JSON snapshot (na engine-migratie)
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tw_versions_doc
  ON public.typewriter_versions(doc_id, created_at DESC);

ALTER TABLE public.typewriter_versions ENABLE ROW LEVEL SECURITY;

-- Eigenaar en leden mogen versies lezen
CREATE POLICY "tw_versions_select" ON public.typewriter_versions
  FOR SELECT TO authenticated
  USING (
    doc_id IN (
      SELECT id FROM public.typewriter_documents WHERE owner_id = auth.uid()
      UNION
      SELECT doc_id FROM public.typewriter_doc_members WHERE user_id = auth.uid()
    )
  );

-- Eigenaar en editors mogen snapshots aanmaken
CREATE POLICY "tw_versions_insert" ON public.typewriter_versions
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND doc_id IN (
      SELECT id FROM public.typewriter_documents WHERE owner_id = auth.uid()
      UNION
      SELECT doc_id FROM public.typewriter_doc_members
        WHERE user_id = auth.uid() AND role = 'editor'
    )
  );

-- Eigenaar mag versies verwijderen (bewaarbeleid: handmatig of via cleanup job)
CREATE POLICY "tw_versions_delete" ON public.typewriter_versions
  FOR DELETE TO authenticated
  USING (
    doc_id IN (
      SELECT id FROM public.typewriter_documents WHERE owner_id = auth.uid()
    )
  );

-- ── 4. typewriter_comments: inline comments met anchor en threads ─────────────

CREATE TABLE IF NOT EXISTS public.typewriter_comments (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_id      text        NOT NULL REFERENCES public.typewriter_documents(id) ON DELETE CASCADE,
  thread_id   uuid        NOT NULL DEFAULT gen_random_uuid(),  -- Groepeert replies
  parent_id   uuid        REFERENCES public.typewriter_comments(id), -- NULL = root comment
  author_id   uuid        NOT NULL REFERENCES auth.users(id),
  body        text        NOT NULL,
  anchor_json jsonb,        -- Positie-anchor in het documentmodel (mark/offset)
  resolved    boolean     NOT NULL DEFAULT false,
  resolved_by uuid        REFERENCES auth.users(id),
  resolved_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tw_comments_doc
  ON public.typewriter_comments(doc_id, thread_id);
CREATE INDEX IF NOT EXISTS idx_tw_comments_thread
  ON public.typewriter_comments(thread_id, created_at);

ALTER TABLE public.typewriter_comments ENABLE ROW LEVEL SECURITY;

-- Eigenaar en leden mogen comments lezen
CREATE POLICY "tw_comments_select" ON public.typewriter_comments
  FOR SELECT TO authenticated
  USING (
    doc_id IN (
      SELECT id FROM public.typewriter_documents WHERE owner_id = auth.uid()
      UNION
      SELECT doc_id FROM public.typewriter_doc_members WHERE user_id = auth.uid()
    )
  );

-- Eigenaar en leden met commenter/editor role mogen comments schrijven
CREATE POLICY "tw_comments_insert" ON public.typewriter_comments
  FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND doc_id IN (
      SELECT id FROM public.typewriter_documents WHERE owner_id = auth.uid()
      UNION
      SELECT doc_id FROM public.typewriter_doc_members
        WHERE user_id = auth.uid() AND role IN ('commenter', 'editor')
    )
  );

-- Auteur mag eigen comment bewerken
CREATE POLICY "tw_comments_update" ON public.typewriter_comments
  FOR UPDATE TO authenticated
  USING (author_id = auth.uid())
  WITH CHECK (author_id = auth.uid());

-- Eigenaar en auteur mogen verwijderen
CREATE POLICY "tw_comments_delete" ON public.typewriter_comments
  FOR DELETE TO authenticated
  USING (
    author_id = auth.uid()
    OR doc_id IN (
      SELECT id FROM public.typewriter_documents WHERE owner_id = auth.uid()
    )
  );

-- ── 5. RPC: create_typewriter_snapshot ──────────────────────────────────────

CREATE OR REPLACE FUNCTION public.create_typewriter_snapshot(
  p_doc_id     text,
  p_content    text,
  p_content_json jsonb DEFAULT NULL,
  p_label      text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_version_id uuid;
BEGIN
  -- Alleen eigenaar of editor mag snapshot aanmaken
  IF NOT EXISTS (
    SELECT 1 FROM public.typewriter_documents WHERE id = p_doc_id AND owner_id = auth.uid()
    UNION
    SELECT 1 FROM public.typewriter_doc_members
      WHERE doc_id = p_doc_id AND user_id = auth.uid() AND role = 'editor'
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  INSERT INTO public.typewriter_versions (doc_id, created_by, label, content, content_json)
  VALUES (p_doc_id, auth.uid(), p_label, p_content, p_content_json)
  RETURNING id INTO v_version_id;

  RETURN v_version_id;
END;
$$;

-- ── 6. RPC: resolve_typewriter_comment ──────────────────────────────────────

CREATE OR REPLACE FUNCTION public.resolve_typewriter_comment(
  p_thread_id  uuid,
  p_resolved   boolean DEFAULT true
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.typewriter_comments
  SET
    resolved    = p_resolved,
    resolved_by = CASE WHEN p_resolved THEN auth.uid() ELSE NULL END,
    resolved_at = CASE WHEN p_resolved THEN now() ELSE NULL END,
    updated_at  = now()
  WHERE thread_id = p_thread_id
    AND doc_id IN (
      SELECT id FROM public.typewriter_documents WHERE owner_id = auth.uid()
      UNION
      SELECT doc_id FROM public.typewriter_doc_members WHERE user_id = auth.uid()
    );
END;
$$;

-- ── 7. RPC: set_typewriter_review_status ────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_typewriter_review_status(
  p_doc_id text,
  p_status text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF p_status NOT IN ('draft', 'in_review', 'approved', 'final') THEN
    RAISE EXCEPTION 'Invalid status';
  END IF;

  -- Alleen eigenaar mag status wijzigen
  UPDATE public.typewriter_documents
  SET review_status = p_status, updated_at = now()
  WHERE id = p_doc_id AND owner_id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not authorized or document not found';
  END IF;
END;
$$;

-- ── 8. Realtime inschakelen voor nieuwe tabellen ────────────────────────────

ALTER PUBLICATION supabase_realtime ADD TABLE public.typewriter_comments;
ALTER PUBLICATION supabase_realtime ADD TABLE public.typewriter_versions;
