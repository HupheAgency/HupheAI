# Future To Do - Typewriter

Bronnen:
- `.agents/sprint_typewriter.md`
- `.agents/chatgpt.md`
- `.agents/claude.md`
- `.agents/gemini.md`
- `docs/Typewriter.md`

Status: oude sprint afgerond op 2026-06-15, maar onderstaande punten zijn bewust doorgeschoven.

## Wat al klaar is

- Typewriter UI-baseline met focus mode, typewriter scrolling, find/replace, tekststatistieken, statusregel, paste cleanup, shortcuts en document outline.
- TipTap/ProseMirror staat als frontend-enginebasis.
- Documenten blijven tijdelijk HTML-compatible opgeslagen.
- Supabase-tabellen en backendbasis voor `typewriter_versions`, `typewriter_comments`, `review_status`, `role`, RLS-fixes en RPCs zijn opgezet.
- Architectuurdocumenten en handoff-helpers staan in `docs/build/`.
- `npm run build` en `npm run test:security` waren groen tijdens de sprint.

## Open Voor Later

- [ ] Yjs realtime-provider of collaboration transport kiezen en aansluiten.
- [ ] Multiplayer cursors en CRDT-sync werkend maken.
- [ ] Persistente backend-comments koppelen aan de Typewriter UI.
- [ ] Version history en snapshots zichtbaar en bruikbaar maken in de UI.
- [ ] Persistente JSON-opslag aansluiten op het backendcontract.
- [ ] Migratiepad van veilige HTML naar TipTap JSON testen en uitvoeren.
- [ ] Stabiele client-side anchors toevoegen voor HupheLink- en comment-marks.
- [ ] HupheLink/comment custom marks aansluiten op persistence.
- [ ] Offline-first/local buffers veilig terug synchroniseren.
- [ ] Beslissen of Hocuspocus nodig is of dat Supabase/Yjs transport voldoende is.
- [ ] `copy_blocks` team/workspace sharing policy toevoegen.
- [ ] Link bewerken, link kopieren, autolink-polish en interne anchors afronden.
- [ ] CTA/Note custom nodes bouwen zodra het definitieve documentmodel actief is.
- [ ] Drag/drop tekst als polish toevoegen.
- [ ] Extra unit tests toevoegen rond unsafe `href` en inline style sanitizing.

## Agentverdeling Voor Een Latere Typewriter Sprint

### ChatGPT/Codex

- [ ] TipTap JSON-opslag in de renderer aansluiten.
- [ ] Comments, suggestions, anchors en version UI bouwen.
- [ ] Link-, CTA-, Note- en drag/drop-polish uitvoeren.
- [ ] Gerichte renderer/security tests toevoegen.

### Claude

- [ ] Backendcontract voor JSON-documenten, comments, snapshots en offline sync finaliseren.
- [ ] RLS en RPCs uitbreiden waar nodig.
- [ ] `copy_blocks` team/workspace sharing policy implementeren.
- [ ] Finale integratie- en securitycheck doen.

### Gemini

- [ ] Realtime/Yjs-providerkeuze valideren.
- [ ] Offline-first conflicten, rollback en versioning nog scherper specificeren.
- [ ] Migratiechecklist voor oude HTML naar TipTap JSON actualiseren.

## Niet Actief In De Nieuwe 3D/2D-Studio Sprint

Deze punten blijven bewaard, maar blokkeren de nieuwe Product Studio sprint niet.
