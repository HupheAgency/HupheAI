# Codex / ChatGPT Agent - Typewriter Sprint

Projectroot:
`/Users/tom.zwarts/HupheAI/HupheShell`

Bron van waarheid:
`docs/Typewriter.md`

Coordinatiebord:
`.agents/sprint_typewriter.md`

## Rol

Codex/ChatGPT pakt de renderer en Typewriter-ervaring in de app op. Jij werkt vooral in:

- `src/renderer/src`
- Typewriter componenten, hooks en client utilities
- gerichte renderer-tests als die bestaan
- documentatie alleen als een implementatiebeslissing anders uitpakt dan `docs/Typewriter.md`

Niet doen:

- Geen Supabase migrations, RLS of Edge Functions.
- Geen databasecontracten wijzigen zonder Claude.
- Geen Supabase/Yjs realtime-provider bouwen zonder Claude-backendcontract.

## Samenwerkingsprotocol

- Lees voor start `docs/Typewriter.md`, `.agents/claude.md`, `.agents/gemini.md` en `.agents/sprint_typewriter.md`.
- Werk alleen aan taken uit dit document.
- Zet bij actieve taken tijdelijk `[~]`, afgeronde taken `[x]`, en noteer kort wat is aangepast.
- Check elke 30 seconden de andere agentdocumenten (`claude.md`, `gemini.md`, `sprint_typewriter.md`) zolang je werkt of wacht. Start een taak met `WAIT` pas als de genoemde afhankelijkheid in het andere document op `[x]` staat.
- Als een bestand door Claude of Gemini wordt genoemd als actief werkgebied, wacht of overleg via je eigen document.
- Laat bestaande user-wijzigingen intact.

## Direct Parallel Te Doen

Deze taken kunnen meteen, zolang ze op de huidige editor-engine blijven en geen databasewijzigingen nodig hebben.

- [x] Audit de huidige Typewriter code: noteer kort welke bestanden de editor, toolbar, documentlijst, live-sync en sanitizing beheren.
- [x] Voeg of herstel basale tekststatistieken: woorden, tekens, geschatte leestijd en optioneel spreektijd.
- [x] Voeg een rustige statusregel toe voor autosave/sync/crash-recovery feedback als er al state beschikbaar is.
- [x] Voeg `Find` en `Find/Replace` toe als compacte UI die niet voelt als een Word-ribbon.
- [x] Voeg focus mode toe: editor full focus, randpanelen tijdelijk weg, Escape of bestaande shortcut om terug te keren.
- [x] Voeg typewriter scrolling toe: actieve regel/alinea blijft rond het midden van de editor tijdens schrijven.
- [x] Voeg focus op huidige alinea toe: omliggende tekst subtiel dimt, optioneel en makkelijk uit te zetten.
- [x] Voeg paste cleanup toe: plakken als platte tekst en plakken met opgeschoonde opmaak, altijd via bestaande sanitizing.
- [x] Voeg basis shortcuts toe of documenteer bestaande shortcuts in een kleine command/help overlay.
- [x] Controleer dat placeholders, lege documenten en lege blocks niet als echte content doorstromen naar export/live flows.

### Auditbevindingen

- Editor, toolbar, tabs en rechterpaneel zitten in `src/renderer/src/pages/TypewriterPage.tsx`.
- Lokale documentopslag zit in `src/renderer/src/lib/typewriter-documents.ts`.
- Supabase sync zit in `src/renderer/src/lib/typewriter-sync.ts`.
- Live broadcast/debounce zit in `src/renderer/src/hooks/useLiveDocument.ts`.
- Huphe-output koppelingen lopen via `linkedSelections`, `copy_blocks` en `src/renderer/src/lib/atelier-linked-sources.ts`.
- Sanitizing loopt via `src/renderer/src/lib/html-sanitize.ts`.
- Huidige engine is gemigreerd naar TipTap/ProseMirror; oude documenten blijven voorlopig HTML-compatible opgeslagen voor live/sync backward compatibility.

## Basic Editor Tools

Gebruik de lijst uit `docs/Typewriter.md` als acceptatiecriterium.

- [x] Schrijven/selecteren: TipTap-editor, select all, undo/redo en cursorbehoud bij toolbar-acties bestaan; drag/drop tekst blijft niet-kritische polish.
- [x] Basis tekstopmaak: vet, cursief, onderstrepen, doorhalen, kleur, highlight, opmaak wissen.
- [~] Alinea/structuur: block style selector heeft Body, Title, Subtitle, H3, Quote en Code via TipTap; echte CTA/Note custom nodes wachten op definitief documentmodel.
- [x] Lijsten: bullets, numbering en inspringing via TipTap.
- [~] Links: toevoegen, verwijderen, autolink en link-on-paste staan in TipTap; bewerken/kopieren/interne anchors blijven polish.
- [x] Document outline op basis van headings, minimaal als navigatie/overzicht.

## Huphe Output Flow

Deze taken mogen parallel met Gemini, maar hou de data contracten flexibel.

- [x] Maak de interne copy blocks zichtbaar genoeg voor toekomstige mapping naar Presentaties, Banners, Media en Print.
- [x] Behoud bestaande Huphe-linking bij UI-wijzigingen.
- [ ] Voeg waar nodig stabiele client-side anchors toe voor HupheLink/comment marks; persistente opslag volgt met Claude-contract.

## WAIT Taken

- [x] WAIT op Gemini: engine-besluit en migratieplan stonden op `[x]`; TipTap/ProseMirror basis is uitgevoerd.
- [x] WAIT op Claude: backend-tabellen/RLS stonden op `[x]`; persistente comments/suggesties UI blijft nog niet gebouwd.
- [ ] WAIT op Claude: koppel offline-first of version snapshots niet aan Supabase voordat het backendcontract klaar is.

## Validatie

Voor je dit document op klaar zet:

- [x] Run een gerichte Typewriter check indien aanwezig. *(Geen aparte Typewriter unit test aanwezig; build + security smoke gedraaid.)*
- [x] Run `npm run build`.
- [x] Run `npm run test:security` als Typewriter HTML/sanitizing of Electron routes geraakt zijn.
- [x] Noteer open risico's in dit document voor Claude's eindcheck.

## Eindstatus

- Status: TipTap/ProseMirror frontend-enginebasis gemigreerd; realtime Yjs-provider en persistente review UI blijven vervolgwerk.
- Laatste update: 2026-06-15
- Belangrijkste aangepaste bestanden:
  - `src/renderer/src/pages/TypewriterPage.tsx`
  - `src/renderer/src/lib/html-sanitize.ts`
  - `package.json`
  - `package-lock.json`
  - `.agents/chatgpt.md`
- Tests/checks:
  - `npm run build` ✅
  - `npm run test:security` ✅
- Open risico's:
  - TipTap staat nu als editor-engine; Yjs dependencies staan klaar, maar er is nog geen realtime provider/Hocuspocus/Supabase transport aangesloten.
  - Echte CTA/Note nodes, interne anchors, link bewerken/kopieren en drag/drop tekst zijn nog open.
  - Documenten worden in deze tussenfase nog als veilige HTML opgeslagen voor backward compatibility; JSON opslag volgt met Claude backendcontract.
  - Sanitizer bewaart nu veilige inline styles en veilige links; dit is getest met security smoke, maar verdient later unit tests rond unsafe href/style cases.
