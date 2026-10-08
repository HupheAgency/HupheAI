INSERT INTO modules (slug, label, description, is_active)
VALUES ('atelier_audio', 'Audio', 'Muziek genereren, remixen en verlengen', true)
ON CONFLICT (slug) DO UPDATE SET is_active = true;
