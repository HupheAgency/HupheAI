# Atelier Schema Audit 🛡️

Audit uitgevoerd door: Gemini Agent
Datum: 2026-05-06
Status: **⚠ Kritieke onderdelen ontbreken in de repository**

Dit document evalueert de database-architectuur voor de Atelier beta-launch.

---

## 1. Tabellen Audit

### `presentations`
- **Status**: ⚠ Gevonden in code, SQL ontbreekt in repo.
- **Bevindingen**: Wordt intensief gebruikt voor live synchronisatie. De code verwacht kolommen: `id`, `name`, `template_client_id`, `blocks` (jsonb), `overrides` (jsonb), `md_text`, `is_live`, `share_code`, `owner_id`.
- **Aanbeveling**: 
  - [ ] Maak een formele migratie aan voor deze tabel.
  - [ ] Voeg een `organization_id` kolom toe voor organization-scope (nu lijkt het alleen user-based).
  - [ ] Index toevoegen op `share_code` (voor join-flow).
  - [ ] RLS: Bevestig dat alleen `owner` of `members` kunnen updaten.

### `presentation_members`
- **Status**: ⚠ SQL ontbreekt.
- **Bevindingen**: Gebruikt voor toegangsbeheer tot presentaties.
- **Aanbeveling**:
  - [ ] Definieer rollen (`owner`, `editor`, `viewer`) via een check constraint.
  - [ ] Index op `presentation_id` en `user_id`.

### `templates` & `template_mappings`
- **Status**: ⚠ SQL ontbreekt.
- **Bevindingen**: `templates` slaat de `.key` structuur op, `template_mappings` de user-defined tags.
- **Aanbeveling**:
  - [ ] RLS: Templates zijn nu globaal of per client. Maak onderscheid tussen 'systeem templates' en 'klant templates'.
  - [ ] Voeg `is_public` of `organization_id` toe.

### `clients`
- **Status**: ⚠ SQL ontbreekt.
- **Aanbeveling**:
  - [ ] Deze tabel lijkt nu alleen een `name` te hebben. Koppelen aan `organizations` is essentieel voor schaalbaarheid.

---

## 2. RPC Audit

De volgende functies worden aangeroepen vanuit de frontend, maar de definities zijn niet gevonden in `/docs/build/` of elders:

| Functie | Status | Veiligheidsrisico |
|---|---|---|
| `share_presentation` | ✗ Missing | Gemiddeld: Hoe worden rechten toegekend? |
| `join_presentation_by_code` | ✗ Missing | Hoog: Kan iemand een willekeurige code raden en toegang krijgen? |
| `sync_presentation_state` | ✗ Missing | Gemiddeld: Wordt gecontroleerd of de zender wel de owner/editor is? |

---

## 3. Aanbevelingen (P0)

1.  **Herstel SQL Definities**: Leg de huidige staat van de database vast in `docs/build/atelier-core.sql`.
2.  **Organization Isolation**: Alle Atelier-tabellen moeten een `organization_id` krijgen om data-lekken tussen klanten te voorkomen.
3.  **Security DEFINER**: Zorg dat `sync_presentation_state` en `join_presentation_by_code` via SECURITY DEFINER draaien met strikte validatie in de functie-body (check of de user lid is van de org).
4.  **Indexes**: Voeg B-tree indexes toe op alle Foreign Keys om performance-issues bij groei te voorkomen.
