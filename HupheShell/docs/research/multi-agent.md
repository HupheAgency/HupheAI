# Engine Multi-Agent — Status & Roadmap

## Wat werkt vandaag

### C — Chat: volledig functioneel
- Berichten sturen naar één model (Ollama lokaal of OpenRouter cloud)
- Gesprekken opslaan in Supabase (`engine_conversations`, `engine_messages`)
- Gesprekken hernoemen, verwijderen, auto-titels genereren
- Bestandsbijlagen meesturen (tekst + afbeelding)
- Realtime updates via Supabase subscriptions

### Infrastructuur aanwezig maar ongebruikt
- Supabase tabellen: `engine_conversations`, `engine_messages`, `agent_conversations`, `document_states`
- `agent_conversations` krijgt per AI-respons één entry (`event_type: 'result'`), maar `to_agent_id` wordt nooit ingevuld
- File watcher op `.agents/` map — detecteert wijzigingen in `.md` bestanden en verstuurt een debounced `engine:file-changed` event naar de renderer (met pad, content en MD5-checksum in de payload), maar triggert geen agent-loop
- In `EngineCommandCenterPage` worden `agentEvents` en `documents` geladen en via Supabase Realtime actueel gehouden — maar `EngineCommandCenterShell` rendert ze bewust niet (`// Agent events and document state are omitted from the main UI in this minimalist version`)
- `distill-memory` IPC handler bestaat maar is een lege stub (retourneert altijd `{ ok: true, distilled: 0 }`)

---

## Wat UI-only is (niet functioneel)

- **C/A/D knoppen** (rechtsonder): puur visueel, geen onClick-handlers, geen view-switching
- **A — Agents tab**: geen agent-naar-agent communicatie; altijd één model dat antwoordt op de gebruiker
- **D — Documents tab**: infrastructuur aanwezig, maar agents schrijven nergens iets naartoe
- **Search chat**: alleen een `console.log`, verder niet geïmplementeerd

---

## Technische kanttekeningen

- **`stream: false`**: alle model-calls naar Ollama en OpenRouter wachten op een volledig antwoord. Geen live token-streaming, geen tussenresultaten zichtbaar in de UI.
- **`agent_id` als null**: voor standaard cloud-modellen (`openai/gpt-4o`, `anthropic/claude-3.5-sonnet` etc.) is het agent-ID geen UUID. De code test dit met `UUID_RE` en slaat dan `null` op in `agent_id` in zowel `engine_messages` als `agent_conversations`. Voor echte agent-tracking is een stabiele identifier nodig.
- **Orchestrator niet verbonden**: de bestaande Claude/Antigravity orchestrator (`api.orchestrator.run`) bestaat nog steeds in de app, maar de Engine gebruikt hem niet. Engine werkt uitsluitend via `api.engine.sendMessage`.
- **UI-spec bestaat al**: `docs/build/engine-ui-state-notes.md` beschrijft al een 1/2/3 paneelsysteem (1 = alleen chat, 2 = split, 3 = full command center). Die spec is nog niet geïmplementeerd in de shell.

---

## Wat ontbreekt voor echte multi-agent werking

### 1. C/A/D view-switching
De knoppen werkend maken op basis van de bestaande spec in `engine-ui-state-notes.md`:
- **C**: huidige chatweergave (gebruiker ↔ één model)
- **A**: live feed van agent-events uit `agent_conversations`
- **D**: live overzicht van `document_states`

### 2. Orchestratielaag in `engine-ipc.ts`
Een nieuwe handler `engine:run-task` die:
- Een taak ontvangt van de gebruiker
- Die opsplitst via een coördinator-model
- Subtaken naar de juiste modellen routeert
- `to_agent_id` invult bij elke overdracht
- Events logt met betekenisvolle types: `task_assigned`, `handoff`, `result`, `error`
- Tussenresultaten streamt naar de A-tab

### 3. Agent-rollen
- **Coördinator**: ontvangt taak, maakt plan, verdeelt werk
- **Onderzoeker**: leest documenten, zoekt informatie
- **Uitvoerder**: schrijft of codeert de output
- **Reviewer**: controleert het resultaat van andere agents

### 4. Document-interactie door agents
Agents kunnen `document_states` aanmaken en bewerken. De D-tab toont dit live terwijl het gebeurt.

### 5. Streaming
`stream: true` implementeren zodat de UI tussenresultaten ziet tijdens modelwerk, niet pas achteraf.

### 6. Stabiele agent-identifiers
Een `agent_key` of vaste UUID per standaard model zodat agent-tracking ook werkt voor cloud-modellen.

---

## Aanbevolen volgorde van aanpak

1. **C/A/D view-switching** — implementeer de spec uit `engine-ui-state-notes.md`
2. **A-tab vullen** — toon de bestaande `agent_conversations` events live
3. **D-tab vullen** — toon de bestaande `document_states` live
4. **Stabiele agent-IDs** — fix de null-opslag voor cloud-modellen
5. **Orchestratielaag bouwen** — `engine:run-task` met coördinator-model
6. **Multi-agent routing** — meerdere modellen parallel of sequentieel laten werken
7. **Streaming** — live token-output tijdens modelwerk
8. **Document-schrijven door agents** — agents produceren echte output

---

*Bijgewerkt: 2026-05-17*
