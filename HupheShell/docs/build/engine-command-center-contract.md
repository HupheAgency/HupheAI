# Engine Command Center: Event & Subscription Contract

## 1. Event Lifecycle (User Task)
Wanneer een gebruiker een nieuwe taak start in de Engine, volgt het systeem een vaste lifecycle die via Supabase Realtime naar de UI wordt gepushed:
1. **User Prompt:** Gebruiker verstuurt een bericht. Er wordt een nieuwe row aangemaakt in `engine_conversations`.
2. **Conversation Row:** De backend (Edge Function / IPC) pakt dit op en creëert een `message` record.
3. **Model Call:** De gekozen agent (of ruwe OpenRouter model) wordt aangeroepen. Er ontstaat een `event` van het type `handoff` of `thought`.
4. **Agent-to-Agent Events:** Als de agent tools gebruikt of delegeert, ontstaan er tussentijdse events (tool use).
5. **Document State Updates:** Als de agent een `.md` bestand aanpast via de bridge, wordt dit gelogd en verwerkt de bridge dit naar een document preview status.
6. **Memory Distillation:** Zodra de taak klaar is, evalueert de Documentarian agent de output en schrijft de samenvatting naar het `long_term_memory` van de gebruiker/project.

## 2. Event Types & Payload Shapes
Alle interne en externe acties worden opgeslagen in een `engine_events` tabel.
- `thought`: Bedenkingen of plannen van de agent. `{"text": "Ik ga nu het bestand uitlezen..."}`
- `handoff`: Delegeren naar een andere agent. `{"from": "Strategist", "to": "Builder", "reason": "Code wijziging nodig"}`
- `decision`: Een belangrijke architecurale of logische beslissing. `{"decision": "Gebruik Supabase Storage in plaats van base64", "confidence": 0.95}`
- `tool`: Een aanroep van een tool. `{"tool_name": "read_file", "args": {"path": "src/index.ts"}}`
- `result`: Resultaat van een tool of subtaak. `{"tool_name": "read_file", "status": "success", "length": 2543}`
- `file_read` / `file_write`: Specifieke file mutaties. `{"path": ".agents/claude.md", "bytes": 1024, "checksum": "abc123z"}`
- `memory_update`: Updaten van project context. `{"key": "tech_stack", "value": "React, Tailwind, Supabase"}`

## 3. Realtime Subscription Contract (Renderer)
De UI (React) abonneert zich op Supabase Realtime om de Command Center UI live te houden.
- **Tabellen:** `engine_events` en `engine_conversations`.
- **Filters:** `user_id = eq.uid()` en `conversation_id = eq.[huidige_id]`.
- **Sort/Order:** Sorteer op `created_at ASC` zodat de timeline chronologisch opbouwt.
- **Reconnect Behavior:** Bij verlies van verbinding roept de client een REST-fetch aan voor de missende events (aan de hand van de laatste `event_id`) en hervat daarna de subscription.

## 4. Foutafhandeling
- **OpenRouter Error (API down / Rate limit):** Emit een `event` van het type `error` met payload `{"provider": "openrouter", "code": 429, "message": "Rate limit exceeded"}`. UI toont een retry-knop.
- **Missing API Key:** Snel falen vóór de API call. Toon een specifieke in-app modal "Vul je OpenRouter API key in".
- **Supabase Disconnect:** Toon een oranje "Reconnecting..." indicator bovenaan de Chat View.
- **File Watcher Permission Error:** Als de bridge geen lees/schrijfrechten heeft, emit event: `{"type": "error", "message": "EACCES: Permission denied on .agents/claude.md"}`.
- **Agent Loop Timeout:** Als een agent meer dan 15 iteraties draait, breek de run geforceerd af en emit `error` met "Loop timeout protection activated".
