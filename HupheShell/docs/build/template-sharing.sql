-- template-sharing.sql
-- Migratie voor het delen van templates via een share code

ALTER TABLE templates ADD COLUMN IF NOT EXISTS share_code text UNIQUE;

CREATE OR REPLACE FUNCTION generate_template_share_code(p_client_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_code text;
BEGIN
  -- Genereer een random 6-karakter string
  v_code := upper(substring(md5(random()::text) from 1 for 6));
  
  UPDATE templates 
  SET share_code = v_code 
  WHERE client_id = p_client_id;
  
  RETURN jsonb_build_object('ok', true, 'code', v_code);
END;
$$;

CREATE OR REPLACE FUNCTION join_template_by_code(p_share_code text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_source_client_id uuid;
  v_source_client_name text;
  v_source_template_data jsonb;
  v_new_client_id uuid;
BEGIN
  -- Zoek het gedeelde template op
  SELECT t.client_id, t.template_data, c.name
  INTO v_source_client_id, v_source_template_data, v_source_client_name
  FROM templates t
  JOIN clients c ON c.id = t.client_id
  WHERE t.share_code = p_share_code;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Code ongeldig of template niet gevonden.');
  END IF;

  -- Maak een nieuwe client aan voor de ontvangende gebruiker
  INSERT INTO clients (name) 
  VALUES (v_source_client_name || ' (Gedeeld)') 
  RETURNING id INTO v_new_client_id;
  
  -- Kopieer het template naar de nieuwe client
  INSERT INTO templates (client_id, template_data) 
  VALUES (v_new_client_id, v_source_template_data);

  RETURN jsonb_build_object('ok', true);
END;
$$;
