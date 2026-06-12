# Engine: Agent Workflow — Master Document

## Visie

De Engine is de enige plek in HupheAI waar de gebruiker met modellen communiceert, taken geeft en agents autonoom laat werken. Agents plannen, bouwen en verifiëren onderling hun werk. De gebruiker volgt dit live en ziet de resultaten in een Documenten-tab.

---

## Functionele vereisten

1. **Taak geven** — De gebruiker geeft één taak op als tekst. De Engine verdeelt dit intern over agents.
2. **Autonoom werken** — Agents werken zelfstandig: plannen, uitvoeren, verifiëren. De gebruiker stuurt niet elke stap.
3. **Onderlinge verificatie** — Agents communiceren met elkaar over wat er al is en wat nog moet. Eén agent kan het werk van een andere reviewen of aanvullen.
4. **Zichtbare communicatie** — De gebruiker volgt de berichten tussen agents live in de Engine-UI.
5. **Documenten als output** — Documenten die agents aanmaken of aanpassen zijn zichtbaar in de Documenten-tab. Wijzigingen zijn inzichtelijk als diff.

---

## Architectuur

```
Gebruiker geeft taak
        ↓
Engine Orchestrator  (coördinator-agent, model naar keuze)
        ↓
  ┌─────┴──────┐
Agent A      Agent B     (parallel of sequentieel)
  │              │
  └──────┬───────┘
  Verificatieronde  (agents reviewen elkaars output)
        ↓
  Documenten-tab  (output zichtbaar, bewerkbaar)
        ↓
  Klaar / volgende iteratie
```

De **Engine Orchestrator** is zelf een agent die de taak analyseert, worker-agents aanstuurt, hun output verzamelt en een eindsynthese produceert. Worker-agents kunnen parallel of sequentieel draaien afhankelijk van taakverdeling.

---

## UI-structuur

De Engine heeft drie tabs:

| Tab | Inhoud |
|-----|--------|
| **Agents** | De taak-input, live communicatie tussen agents, voortgang per agent |
| **Chat** | Directe conversatie met één geselecteerd model |
| **Documenten** | Alle documenten die agents hebben aangemaakt of gewijzigd |

### Agents-tab
- Invoerveld voor de taak
- Lijst van actieve agents met hun huidige status
- Live event-feed: elk bericht, elke handoff, elke fout zichtbaar als stroom
- Log-events: `task_assigned`, `handoff`, `thought`, `result`, `tool`, `file_write`, `error`

### Documenten-tab
- Elk document heeft: naam, type, en welke agent het heeft aangemaakt of gewijzigd
- Wijzigingen zichtbaar als diff (voor/na)
- Gebruiker kan een document openen, bewerken of afwijzen
- Agents kunnen bestaande documenten lezen als context voor hun volgende stap

---

## Technische vereisten

### Agent-routing (kritiek)
- Agent IDs (UUID) moeten worden omgezet naar het echte model uit de agentconfig vóór een API-aanroep
- Gebruik `agent.model` voor OpenRouter-aanroepen, niet de UUID
- UUID-agents zoals Claude, Gemini, ChatGPT falen anders stil

### Orchestrator-logica
- Worker-agents draaien nu sequentieel zonder eindsynthese — voeg een finale coördinatorstap toe
- De coördinator-agent vat worker-resultaten samen tot één bruikbaar resultaat
- Resultaat wordt opgeslagen als document in `document_states`

### UI-koppeling
- `EngineCommandCenterPage` geeft `onRunTask` momenteel niet door aan `EngineCommandCenterShell` — hierdoor doet de taakknop niets
- Fix: `api.engine.runTask` koppelen aan de UI-invoer

### Opslag
- Agentconfiguraties en runtime-state opslaan in `app.getPath('userData')`, niet relatief aan `__dirname` of `app.getAppPath()`
- Eerste keer opstarten: standaard agentprofielen kopiëren naar de userData-map
- Config bevat een `schema_version` zodat toekomstige migraties mogelijk zijn

### Permissiemodel
- Agents loggen elke schrijfoperatie als `file_write`-event in de Agents-tab
- De gebruiker ziet wat er is gewijzigd; afwijzen is mogelijk via de Documenten-tab
- Geen stille writes naar het bestandssysteem van de gebruiker

---

## Wat wordt geabsorbeerd

De volgende bestaande implementaties overlappen met de Engine en worden geconsolideerd:

| Module | Status |
|--------|--------|
| **Huphe Code** (`flow-manager.js`) | Wordt een preset-taakconfiguratie in de Engine (`AUDITING → BUILDING → TESTING → REVIEWING`) |
| **Pulse** (`pulse-orchestrator.ts`) | Wordt een preset-taakconfiguratie in de Engine (campagne/creatieve pipeline) |
| **`.agents` file watcher** | Vervalt als primaire interface; bestandssysteem blijft hooguit als export-optie |

Zolang Huphe Code en Pulse eigen orchestrators zijn, bestaat er geen "Engine als centrale plek". Na consolidatie zijn ze preset-configuraties die de Engine uitvoert.

---

## Implementatieprioriteiten

1. **Fix `onRunTask`-koppeling** — `EngineCommandCenterPage` → `EngineCommandCenterShell` → `api.engine.runTask`
2. **Fix agent-routing** — UUID → `agent.model` resolven in `engine-ipc.ts` vóór API-aanroep
3. **Voeg eindsyntheseronde toe** — coördinator-agent vat worker-resultaten samen, output naar `document_states`
4. **Bouw Documenten-tab** — toon agent-output als lijst van documenten met diff-weergave
5. **Bouw Agents-tab event-feed** — live stroom van `task_assigned`, `handoff`, `result`, `file_write`, `error`
6. **Migreer opslag naar `userData`** — inclusief standaard agentprofielen bij eerste opstart
7. **Absorbeer Huphe Code en Pulse** — als preset-taakconfiguraties in de Engine
8. **Verwijder `.agents` file watcher** — of freeze tot export-only
