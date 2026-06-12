# Engine: OpenRouter & Model Routing

## 1. OpenRouter Configuratie
Het Command Center fungeert als een router voor verschillende agents. OpenRouter stelt ons in staat om naadloos te schakelen tussen Anthropic, OpenAI en Google modellen.

## 2. Bestaande Agents & User Selector
De `agents` tabel in Supabase bevat voorgedefinieerde AI-assistenten.
In de UI bieden we een dropdown die onderscheid maakt tussen:
- **Agents (Pre-configured):** Voorgeprogrammeerde rollen met specifieke instructies en context.
- **Raw Models (Direct):** Directe toegang tot modellen (bijv. GPT-4o, Claude 3.5 Sonnet) voor pure vragen zonder agent-jasje.

## 3. Aanbevolen Defaults
We leveren de volgende standaard-agents mee in de tabel:
- **Strategist:** Bepaalt architectuur en routeert complexe vragen naar andere agents. (Model: Claude 3.5 Sonnet / Opus).
- **Builder:** Schrijft en past daadwerkelijk code aan via de bridge. (Model: Claude 3.5 Sonnet).
- **Reviewer:** Focust op security, edge-cases en RLS checks. (Model: GPT-4o of o1).
- **Documentarian:** Formatteert output, update de knowledge base en schrijft comments. (Model: Gemini 1.5 Pro).
- **Direct Model:** Fallback voor de ruwe LLM.

## 4. Metadata Schema per Agent
Elke agent in de database vereist de volgende velden:
- `label`: Zichtbare naam (bijv. "The Builder").
- `model`: De OpenRouter model-string (bijv. `anthropic/claude-3.5-sonnet`).
- `system_prompt`: De kerntaak en persona.
- `role`: Enum voor categorisatie (bijv. `architect`, `coder`, `qa`).
- `visibility`: `public` (iedereen ziet hem) of `private` (custom agent van de gebruiker).
- `can_write_files`: Boolean. Mag deze agent de `write_file` tool gebruiken?
- `can_update_memory`: Boolean. Mag deze agent het project-geheugen (Supabase) muteren?

## 5. Agent-communicatie (Logging)
Chain-of-thought (CoT) en uitgebreide ruwe prompts moeten verborgen blijven in de hoofd-UI om ruis te voorkomen.
In plaats daarvan loggen we gestructureerde summaries:
- **Fout:** *Ruwe JSON data van de Strategist die de Builder aanroept.*
- **Goed:** UI toont: `"Strategist delegateert taak naar Builder: 'Implementeer authentication in src/auth.ts'."`
- Alle interne agent-communicatie moet een speciaal event (`handoff`) sturen, zodat de React UI deze netjes kan opvouwen (collapsible) als een "internal thought process".
