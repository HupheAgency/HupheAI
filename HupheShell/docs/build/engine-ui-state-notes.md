# Engine Command Center: UI Integration Notes

## 1. Panel Layout & Toggles (1/2/3 system)
De UI-shell bevat drie hoofdpanelen (Chat, Conversation/Events, Document Preview). 
- **1 Actief (Enkel):** Chat staat centraal (midden van scherm), maximale focus.
- **2 Actief (Split):** Chat links (40%), Document Preview of Events rechts (60%).
- **3 Actief (Full Command Center):** Chat (25%), Events (25%), Document Preview (50%).
De toggles in de topbar moeten de CSS grid/flex widths vloeiend animeren op basis van de actieve boolean state.

## 2. Props die Claude moet vullen via IPC/Supabase
Voor de React-shell moet Claude zorgen dat de volgende datastromen werken:
- `useEngineEvents(conversationId)`: Hook naar Supabase Realtime voor de live log.
- `useActiveDocument()`: IPC listener die luistert naar de file watcher en de huidige markdown content + cursor/line-highlight status pusht.
- `useAgentList()`: Haalt de beschikbare agent-dropdown op uit de database.

## 3. Ontbrekende States (Loading, Empty, Error)
- **Empty State:** Als er geen gesprek is, toon een groot, vriendelijk Huphe-logo met voorgestelde "Quick Actions" (bijv. "Review mijn laatste commit", "Bouw een PPTX importer").
- **Loading State:** Gebruik skeleton loaders voor de Event log. De Chat View heeft een subtiele "Agent is typing..." of "Agent is executing tools..." spinner nodig (zoals de Flow-stijl puntjes).
- **Error State:** Rode error-boundaries rondom het Document Preview paneel als het bestand niet gelezen kan worden (bijv. EACCES error).

## 4. Flow-stijl (Minimalistisch)
Blijf weg van drukke borders en zware tabellen.
- Gebruik zachte grayscales (Huphe thema) voor de event-log.
- Enkel subtiele kleuraccenten per agent (bijv. Claude is paars, Gemini blauw, ChatGPT groen) als kleine dots naast hun naam in het conversation panel.
- Houd padding ruim (minimaal 16px/24px) in de chatbubbels.

## 5. Scope-beperking voor v1
Wat we nu nog **niet** moeten bouwen om vaart te houden:
- Drag-and-drop functionaliteit in het Document panel.
- Volledige syntax-highlighting code-editor in de UI (voor nu puur een read-only markdown/code render; bewerken doet de gebruiker in zijn eigen IDE of via de agent).
- Uitgebreide geheugen-editor (laat de Documentarian agent voorlopig het geheugen autonoom updaten zonder complexe CRUD schermen in de UI).
