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
- Geen volledige TipTap/Yjs-migratie starten voordat Gemini het engine-besluit heeft afgerond en Claude de backend-impact heeft gecheckt.

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
- Huidige engine is nog `contentEditable` + `document.execCommand`; geen TipTap/Yjs migratie gestart.

## Basic Editor Tools

Gebruik de lijst uit `docs/Typewriter.md` als acceptatiecriterium. Pak alleen wat veilig kan binnen de huidige engine.

- [~] Schrijven/selecteren: select all, undo/redo en cursorbehoud bij toolbar-acties bestaan; drag/drop tekst is nog niet apart gebouwd.
- [x] Basis tekstopmaak: vet, cursief, onderstrepen, doorhalen, kleur, highlight, opmaak wissen.
- [~] Alinea/structuur: block style selector heeft Body, Title, Subtitle, H3, Quote en Code; echte CTA/Note nodes wachten op engine/model.
- [x] Lijsten: bullets, numbering en inspringing via huidige engine.
- [~] Links: toevoegen en verwijderen toegevoegd; bewerken/kopieren/auto-linkherkenning/interne anchors blijven open.
- [ ] Document outline op basis van headings, minimaal als navigatie/overzicht.

## Huphe Output Flow

Deze taken mogen parallel met Gemini, maar hou de data contracten flexibel.

- [ ] Maak de interne copy blocks zichtbaar genoeg voor toekomstige mapping naar Presentaties, Banners, Media en Print.
- [x] Behoud bestaande Huphe-linking bij UI-wijzigingen.
- [ ] Voeg waar nodig stabiele client-side anchors toe, maar wacht met persistente opslag tot Claude/Gemini klaar zijn.

## WAIT Taken

- [ ] WAIT op Gemini: start geen TipTap/ProseMirror/Yjs engine-migratie voordat `gemini.md` het engine-besluit en migratieplan op `[x]` heeft staan.
- [ ] WAIT op Claude: bouw geen persistente comments/suggesties/version history voordat Claude de backend-tabellen/RLS op `[x]` heeft staan.
- [ ] WAIT op Claude: koppel offline-first of version snapshots niet aan Supabase voordat het backendcontract klaar is.

## Validatie

Voor je dit document op klaar zet:

- [ ] Run een gerichte Typewriter check indien aanwezig.
- [x] Run `npm run build`.
- [x] Run `npm run test:security` als Typewriter HTML/sanitizing of Electron routes geraakt zijn.
- [x] Noteer open risico's in dit document voor Claude's eindcheck.

## Eindstatus

- Status: gedeeltelijk afgerond; resterende items wachten op engine/model of extra UI-ronde.
- Laatste update: 2026-06-15
- Belangrijkste aangepaste bestanden:
  - `src/renderer/src/pages/TypewriterPage.tsx`
  - `src/renderer/src/lib/html-sanitize.ts`
  - `.agents/chatgpt.md`
- Tests/checks:
  - `npm run build` ✅
  - `npm run test:security` ✅
- Open risico's:
  - `contentEditable`/`execCommand` blijft de limiet; geen TipTap/Yjs migratie gedaan.
  - Document outline, auto-linkherkenning, echte CTA/Note nodes en drag/drop tekst zijn nog open.
  - Sanitizer bewaart nu veilige inline styles en veilige links; dit is getest met security smoke, maar verdient later unit tests rond unsafe href/style cases.
