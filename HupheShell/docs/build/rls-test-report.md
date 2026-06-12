# RLS Verificatie Testprocedure 🛡️

Voer deze queries uit in de Supabase SQL Editor om te bevestigen dat de Row Level Security (RLS) waterdicht is.

## Voorbereiding
Kopieer deze queries één voor één. We gebruiken `SET LOCAL` om rollen en gebruikers te simuleren zonder echte accounts nodig te hebben.

---

## Test 1: Anonieme bezoeker (Pre-login)
**Doel**: Controleren of een niet-ingelogde gebruiker nergens bij kan, behalve join_requests.

```sql
BEGIN;
  -- Simuleer anonieme bezoeker
  SET LOCAL role anon;
  SET LOCAL "request.jwt.claims" = '{}';

  -- 1. Kan geen profielen zien
  SELECT count(*) FROM public.user_profiles; -- Verwacht: 0

  -- 2. Kan geen presentaties zien
  SELECT count(*) FROM public.presentations; -- Verwacht: 0

  -- 3. MAG WEL een join_request indienen
  INSERT INTO public.join_requests (email, name) VALUES ('test@anon.nl', 'Anon Test'); -- Verwacht: Succes

  -- 4. Kan GEEN join_requests inzien
  SELECT count(*) FROM public.join_requests; -- Verwacht: 0
ROLLBACK;
```

---

## Test 2: Gewone Gebruiker (Niet-admin)
**Doel**: Controleren of een gebruiker alleen zijn eigen data ziet en geen admin-tabellen.

```sql
BEGIN;
  -- Simuleer een gewone gebruiker (NIET de admin)
  SET LOCAL role authenticated;
  SET LOCAL "request.jwt.claims" = '{"sub": "00000000-0000-0000-0000-000000000001"}';

  -- 1. Kan eigen (lege) profiel zien, maar niet die van anderen
  SELECT count(*) FROM public.user_profiles; -- Verwacht: 0 (tenzij deze UUID bestaat)

  -- 2. Kan GEEN admin_users tabel inzien
  SELECT count(*) FROM public.admin_users; -- Verwacht: 0

  -- 3. Kan GEEN audit_logs inzien
  SELECT count(*) FROM public.audit_log; -- Verwacht: 0

  -- 4. Kan GEEN maintenance_config aanpassen
  UPDATE public.maintenance_config SET is_active = true WHERE id = 'global'; -- Verwacht: 0 rows updated
ROLLBACK;
```

---

## Test 3: Admin Gebruiker
**Doel**: Bevestigen dat de admin (bc94748e) overal bij kan.

```sql
BEGIN;
  -- Simuleer de admin (Tom)
  SET LOCAL role authenticated;
  SET LOCAL "request.jwt.claims" = '{"sub": "bc94748e-c58c-4c50-8ee0-893d459ea44e"}';

  -- 1. Kan alle profielen zien
  SELECT count(*) FROM public.user_profiles; -- Verwacht: > 0

  -- 2. Kan alle join_requests zien
  SELECT count(*) FROM public.join_requests; -- Verwacht: > 0

  -- 3. Kan alle audit_logs zien
  SELECT count(*) FROM public.audit_log; -- Verwacht: > 0
ROLLBACK;
```

---

## Conclusie
Als alle bovenstaande resultaten overeenkomen met de verwachtingen, is de database veilig voor de beta-launch.
