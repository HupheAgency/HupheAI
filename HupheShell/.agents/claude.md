# Claude Agent - Typewriter Sprint Backend, Integratie En Eindcheck

Projectroot:
`/Users/tom.zwarts/HupheAI/HupheShell`

Bron van waarheid:
`docs/Typewriter.md`

Coordinatiebord:
`.agents/sprint_typewriter.md`

## Rol

Claude pakt Typewriter backend, Supabase, integratiecontracten en de finale kwaliteitscontrole op.

Primair werkgebied:

- Supabase schema/migrations/RLS
- Edge Functions of backend API's als Typewriter ze nodig heeft
- integratie van persistente comments, versions, review state, anchors en sharing
- finale check zodra Codex/ChatGPT, Gemini en Claude klaar zijn

Niet doen zonder expliciete reden:

- Niet dezelfde renderer-UI refactor uitvoeren als Codex.
- Niet het engine-keuzeonderzoek overnemen van Gemini.
- Niet user-wijzigingen terugdraaien.

## Samenwerkingsprotocol

- Lees voor start `docs/Typewriter.md`, `.agents/chatgpt.md`, `.agents/gemini.md` en `.agents/sprint_typewriter.md`.
- Werk alleen aan taken uit dit document.
- Zet bij actieve taken tijdelijk `[~]`, afgeronde taken `[x]`, en noteer kort wat is aangepast.
- Check elke 30 seconden de andere agentdocumenten (`chatgpt.md`, `gemini.md`, `sprint_typewriter.md`) zolang je werkt of wacht. Start een taak met `WAIT` pas als de genoemde afhankelijkheid in het andere document op `[x]` staat.
- Als Codex een rendererbestand actief aanpast, wacht met integratie in datzelfde bestand.
- Jij doet de laatste complete check nadat alle agentdocumenten klaar staan.

## Direct Parallel Te Doen

- [x] Audit bestaande Typewriter Supabase-tabellen, RLS policies, live-share/presence en document storage.
- [x] Noteer welke bestaande tabellen hergebruikt kunnen worden en welke nieuwe tabellen nodig zijn.
- [x] Controleer of huidige Typewriter HTML/content opslag overal door dezelfde sanitizing-grens gaat.
- [x] Controleer of live documents en shared documents geen lokale of onveilige asset/data-paden lekken.

## Auditbevindingen (2026-06-15)

### Bestaande tabellen

| Tabel | Status | Opmerkingen |
|---|---|---|
| `typewriter_documents` | ✅ Herbruikbaar | Mist: `review_status`, toekomstig `model` (JSON) kolom |
| `typewriter_doc_members` | ⚠️ Gedeeltelijk | Mist: `role` kolom, INSERT/DELETE RLS policies |
| `copy_blocks` | ✅ Herbruikbaar | Goed schema, mist team-sharing policy |
| `document_states` | ❌ Niet relevant | Hoort bij Engine/AI, niet bij Typewriter |
| `slide_comments` | ❌ Niet herbruikbaar | Presentatie-specifiek, verkeerde structuur |

### Ontbrekende tabellen (aangemaakt in migration)

- `typewriter_versions` — snapshots voor version history ✅ aangemaakt
- `typewriter_comments` — inline comments met anchor-posities, replies, resolve-status ✅ aangemaakt

### RLS bevindingen (gefixed in migration)

- ✅ Member-update beperkt tot editors, kan owner_id/is_live/share_code niet meer wijzigen
- ✅ INSERT/DELETE policies op `typewriter_doc_members` toegevoegd
- ✅ `role` kolom (viewer/commenter/editor) op `typewriter_doc_members`

### Sanitizing grens — SCHOON ✅

Alle contentpaden via DOMPurify. Find/Replace gebruikt `createTextNode`/`textContent` — geen HTML-injectie. Status-berichten zijn hardcoded strings.

## WAIT Op Gemini — AFGEROND

- [x] Maak migration voor `typewriter_versions` (snapshots, bewaarbeleid).
- [x] Maak migration voor `typewriter_comments` (anchors, replies, resolve, suggest mode).
- [x] Voeg `review_status` kolom toe aan `typewriter_documents`.
- [x] Voeg `role` kolom toe aan `typewriter_doc_members`.
- [x] Fix `typewriter_doc_members` INSERT/DELETE RLS + column-level beperking op member UPDATE.
- [x] Voeg RPC's toe voor: comment resolven, review status wijzigen, snapshot opslaan.
- [ ] Voeg team/workspace sharing policy toe aan `copy_blocks`. *(uitgesteld — niet kritisch voor Fase 1/2)*
- [ ] Leg vast hoe offline/local buffers veilig terug synchroniseren. *(wacht op TipTap/Yjs migratie door Codex)*

## WAIT Op Codex — AFGEROND

- [x] Controleer dat comments, review state en versions geen XSS-pad openen. ✅ Schoon.
- [x] Controleer dat foutmeldingen voor sync/offline/save helder terugkomen. ✅ `status` + `syncIndicator` state aanwezig.
- [ ] Sluit persistente backend-comments/versions aan op UI. *(wacht op TipTap-migratie — UI nog op contentEditable)*

## Finale Check Door Claude — AFGEROND

- [x] Vergelijk implementatie met `docs/Typewriter.md` roadmap — zie eindrapportage.
- [x] Check agentdocumenten op open WAIT-taken — alleen uitgestelde items over, geen blockers.
- [x] Run `npm run build` — ✅ 664 modules, geen errors.
- [x] Run `npm run test:security` — ✅ alle 10 checks groen.
- [x] Geen aparte Typewriter unit tests aanwezig — security smoke dekt sanitizing.

## Eindrapportage

### Gedaan deze sprint

**Gemini (architectuur):**
- 7 specificatiedocumenten in `docs/build/`: engine-besluit (TipTap+Yjs), documentmodel, migratiestrategie, collaboration/versioning, review workflow, import/export, acceptatiechecklist
- 2 TypeScript handoff-helpers: `typewriter-html-to-model.ts`, `typewriter-model-to-huphe-outline.ts`

**Codex (UI/renderer):**
- Tekststatistieken (woorden, tekens, leestijd)
- Statusregel autosave/sync/live
- Find & Find/Replace (veilig via TextNode/textContent)
- Focus mode
- Typewriter scrolling
- Alinea-dimming
- Paste cleanup
- Shortcuts overlay
- Lege document/placeholder checks
- Basis tekstopmaak, lijsten, links — build en security smoke groen

**Claude (backend):**
- Migration `20260615000000_typewriter_v2.sql` gedeployed naar Supabase
- `typewriter_versions` tabel + RLS
- `typewriter_comments` tabel + RLS (threads, replies, resolve, anchor_json)
- `review_status` kolom op `typewriter_documents`
- `role` kolom op `typewriter_doc_members`
- RLS-gat gefixed: member-update te breed, INSERT/DELETE policies ontbraken
- RPCs: `create_typewriter_snapshot`, `resolve_typewriter_comment`, `set_typewriter_review_status`
- XSS-audit nieuwe Codex-features: schoon

### Open voor volgende sprint (bewust uitgesteld)

- TipTap/Yjs engine-migratie — blokkeert: echte collaboration, comments UI, offline-first sync, document outline, stable anchors
- Backend-comments/versions koppelen aan UI — wacht op engine
- `copy_blocks` team-sharing policy — niet kritisch voor Fase 1/2
- Link bewerken/auto-herkenning/interne anchors — wacht op engine

### Risico's

- `contentEditable`/`execCommand` is de huidige limiet; alle complexere features (comments, track changes, multiplayer) kunnen pas na TipTap-migratie
- Yjs Supabase provider bestaat nog niet als productierijpe package — bij migratie evalueren of Hocuspocus nodig is

## Eindstatus

- Status: ✅ KLAAR voor deze sprint (Fase 1 backend gereed, Fase 2 UI deels gereed)
- Laatste update: 2026-06-15
- Belangrijkste aangepaste bestanden:
  - `supabase/migrations/20260615000000_typewriter_v2.sql`
  - `.agents/claude.md`
- Tests/checks: `npm run build` ✅ · `npm run test:security` ✅ (10/10)
