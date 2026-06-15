# Typewriter Sprint - Coordinatiebord

Dit is het actieve coordinatiebord voor het uitvoeren van:

`docs/Typewriter.md`

## Actieve Agentdocumenten

- Codex/ChatGPT: `.agents/chatgpt.md`
- Claude: `.agents/claude.md`
- Gemini: `.agents/gemini.md`

## Algemene Regels Voor Alle Agents

- Lees `docs/Typewriter.md` voordat je start.
- Lees alle drie de agentdocumenten voordat je start.
- Check elke 30 seconden de andere agentdocumenten zolang je werkt of wacht.
- Update je eigen document met `[~]` voor actief werk, `[x]` voor afgerond werk en korte notities.
- Start geen taak met `WAIT` voordat de afhankelijkheid in het genoemde agentdocument op `[x]` staat.
- Raak geen bestanden aan waarvan een andere agent expliciet heeft gemeld dat die op dat moment actief bewerkt worden.
- Revert geen user-wijzigingen of werk van andere agents.
- Als je een conflict ziet, stop met die taak en noteer de blokkade in je eigen agentdocument.

## Rolverdeling

| Agent | Hoofddomein | Mag direct starten | Wacht op |
|---|---|---|---|
| Codex/ChatGPT | Renderer, Typewriter UI, TipTap enginebasis, tests | Ja | Claude voor persistente comments/versions/realtime transport |
| Gemini | Architectuur, specs, migratieplan, documentmodel, pure handoff helpers | Ja | Codex/Claude audits indien beschikbaar |
| Claude | Supabase, RLS, backendcontracten, integratie, finale QA | Audit ja | Gemini voor definitief schema/model, Codex voor UI-integratiegebieden |

## Parallel Startpakket

Deze taken kunnen tegelijk:

- Codex: huidige Typewriter code auditen, UI/basis-tools verbeteren en TipTap-enginebasis migreren zonder backendwijzigingen.
- Gemini: engine decision, documentmodel, collaboration/versioning en import/export specificaties maken.
- Claude: bestaande backend/Supabase/veiligheidsgrenzen auditen.

## Afhankelijkheden

Engine-migratie:

- [x] Gemini `typewriter-engine-decision.md` is afgerond.
- [x] Claude backend-impactcheck is afgerond.
- [x] Codex heeft huidige UI-baseline stabiel gemaakt.
- [x] Codex heeft de frontend-enginebasis naar TipTap/ProseMirror gemigreerd.

Persistente comments, suggestions en version history:

- Wacht op Gemini documentmodel/review workflow.
- Wacht op Claude migrations/RLS/API.
- Codex mag pas daarna de UI permanent aansluiten.

Offline-first en realtime collaboration:

- Wacht op Gemini collaboration/versioning ontwerp.
- Wacht op Claude backendcontract.

Finale acceptatie:

- Claude voert de laatste check uit als alle agentdocumenten klaar staan.

## Finale Definition Of Done

Claude mag de sprint pas als compleet markeren als:

- `.agents/chatgpt.md` alle relevante taken op `[x]` heeft of expliciet naar later heeft verplaatst.
- `.agents/gemini.md` alle documenten/handoffs heeft opgeleverd.
- `.agents/claude.md` backend/integratie/finale check heeft afgerond.
- `npm run build` is gedraaid.
- `npm run test:security` is gedraaid als HTML, Electron, sync of sanitizing geraakt is.
- Open risico's helder zijn vastgelegd.

## Status

- Sprintstatus: ✅ SPRINT AFGEROND + TipTap frontend-enginebasis uitgevoerd (2026-06-15)
- Laatste update: 2026-06-15

### Definition Of Done — check

- [x] `.agents/chatgpt.md` — alle basis UI-taken afgerond, open items expliciet uitgesteld (engine-afhankelijk)
- [x] `.agents/gemini.md` — alle 7 specs + 2 TS helpers opgeleverd in `docs/build/`
- [x] `.agents/claude.md` — backend/migrations/RLS/RPCs gedeployed, finale check gedaan
- [x] `npm run build` — ✅ geen errors
- [x] `npm run test:security` — ✅ 10/10 checks groen
- [x] Open risico's vastgelegd in `claude.md` eindrapportage

### Wat klaar is

- Supabase: `typewriter_versions`, `typewriter_comments`, `review_status`, `role`, RLS gefixed, 3 RPCs
- UI: focus mode, typewriter scrolling, find/replace, tekststatistieken, statusregel, paste cleanup, shortcuts, document outline
- Engine: Typewriter editor gebruikt nu TipTap/ProseMirror; documenten blijven tijdelijk HTML-compatible opgeslagen
- Architectuur: engine-besluit (TipTap+Yjs), documentmodel, migratiestrategie, review workflow, collaboration spec

### Wat open blijft (volgende sprint)

- Yjs realtime-provider/collaboration transport — blokkeert: echte multiplayer cursors en CRDT sync
- Backend-comments koppelen aan UI
- `copy_blocks` team-sharing policy
- Persistente JSON-opslag en HupheLink/comment custom marks aansluiten op backendcontract
