-- Migration: typewriter_documents + assets
-- Voeg toe aan Supabase via de SQL editor

-- ── 1. typewriter_documents ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.typewriter_documents (
  id                text        PRIMARY KEY,
  owner_id          uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title             text        NOT NULL DEFAULT '',
  content           text        NOT NULL DEFAULT '',
  linked_selections jsonb       NOT NULL DEFAULT '[]',
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  deleted_at        timestamptz,
  is_live           boolean     NOT NULL DEFAULT false,
  share_code        text        UNIQUE
);

CREATE INDEX IF NOT EXISTS idx_typewriter_documents_owner   ON public.typewriter_documents(owner_id);
CREATE INDEX IF NOT EXISTS idx_typewriter_documents_updated ON public.typewriter_documents(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_typewriter_documents_live    ON public.typewriter_documents(is_live) WHERE is_live = true;

ALTER TABLE public.typewriter_documents ENABLE ROW LEVEL SECURITY;

-- Eigenaar mag alles
CREATE POLICY "typewriter_docs_owner_all" ON public.typewriter_documents
  FOR ALL TO authenticated
  USING  (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

-- Leden (via member-tabel) mogen live documenten lezen
CREATE POLICY "typewriter_docs_member_select" ON public.typewriter_documents
  FOR SELECT TO authenticated
  USING (
    is_live = true
    AND EXISTS (
      SELECT 1 FROM public.team_members
      WHERE team_members.owner_id = typewriter_documents.owner_id
        AND team_members.member_id = auth.uid()
    )
  );

-- Leden mogen content updaten (niet is_live / share_code)
CREATE POLICY "typewriter_docs_member_update" ON public.typewriter_documents
  FOR UPDATE TO authenticated
  USING (
    is_live = true
    AND EXISTS (
      SELECT 1 FROM public.team_members
      WHERE team_members.owner_id = typewriter_documents.owner_id
        AND team_members.member_id = auth.uid()
    )
  );

-- Realtime inschakelen
ALTER PUBLICATION supabase_realtime ADD TABLE public.typewriter_documents;

-- ── RPC: set_typewriter_doc_live ─────────────────────────────────────────────
-- Genereert een unieke 6-char code en zet het document live.
-- Alleen de eigenaar mag dit aanroepen (SECURITY DEFINER, check op owner_id).
CREATE OR REPLACE FUNCTION public.set_typewriter_doc_live(p_doc_id text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_code text;
  v_attempts int := 0;
BEGIN
  -- Controleer eigenaarschap
  IF NOT EXISTS (
    SELECT 1 FROM public.typewriter_documents
    WHERE id = p_doc_id AND owner_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- Genereer unieke code (max 10 pogingen)
  LOOP
    v_code := upper(substring(md5(random()::text) FROM 1 FOR 6));
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.typewriter_documents WHERE share_code = v_code
    );
    v_attempts := v_attempts + 1;
    IF v_attempts >= 10 THEN RAISE EXCEPTION 'Could not generate unique code'; END IF;
  END LOOP;

  UPDATE public.typewriter_documents
  SET is_live = true, share_code = v_code, updated_at = now()
  WHERE id = p_doc_id AND owner_id = auth.uid();

  RETURN v_code;
END;
$$;

-- ── Migratie voor bestaande installaties ────────────────────────────────────
-- Voer dit uit als de tabel al bestaat zonder is_live / share_code:
-- ALTER TABLE public.typewriter_documents
--   ADD COLUMN IF NOT EXISTS is_live   boolean NOT NULL DEFAULT false,
--   ADD COLUMN IF NOT EXISTS share_code text    UNIQUE;

-- ── 2. assets ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.assets (
  id            text        PRIMARY KEY,
  owner_id      uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name          text        NOT NULL DEFAULT '',
  src           text        NOT NULL DEFAULT '',
  thumbnail_src text,
  type          text        NOT NULL DEFAULT 'image',
  tags          text[],
  prompt        text,
  model_id      text,
  width         int,
  height        int,
  mime_type     text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz
);

CREATE INDEX IF NOT EXISTS idx_assets_owner ON public.assets(owner_id);
CREATE INDEX IF NOT EXISTS idx_assets_updated ON public.assets(updated_at DESC);

ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "assets_owner_all" ON public.assets
  FOR ALL TO authenticated
  USING  (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

-- Realtime inschakelen
ALTER PUBLICATION supabase_realtime ADD TABLE public.assets;
