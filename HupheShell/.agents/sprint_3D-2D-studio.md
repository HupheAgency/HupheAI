# Sprint 3D/2D Product Studio - Coordinatiebord

Bron van waarheid:
`docs/comfy/HupheAI-Universal-Product-Studio-Masterdocument-v1_0.md`

Status: klaar om te starten.

## Doel Van Deze Sprint

Een eerste bouwbare verticale Product Studio flow voorbereiden en starten volgens het officiële masterdocument:

1. productproject aanmaken;
2. een productfoto uploaden;
3. aanvullende referentieviews genereren of voorbereiden;
4. views beoordelen en accepteren;
5. single-view reconstructie voorbereiden;
6. GLB/proxy tonen in Three.js;
7. eenvoudige studio bedienen;
8. preview/final render voorbereiden;
9. resultaat reviewen en als PNG kunnen downloaden zodra backendroute beschikbaar is.

## Actieve Agentdocumenten

- ChatGPT/Codex: `.agents/chatgpt.md`
- Claude: `.agents/claude.md`
- Gemini: `.agents/gemini.md`

## Niet Actief In Deze Sprint

De oude Typewriter- en Import/Export-punten zijn verplaatst naar:

- `.agents/future-to-do/sprint_typewriter.md`
- `.agents/future-to-do/sprint6_import_engine.md`

Ze blokkeren deze sprint niet.

## Algemene Regels Voor Alle Agents

- Lees het masterdocument voordat je start.
- Lees alle drie de agentdocumenten voordat je start.
- Update je eigen document met `[~]` voor actief werk, `[x]` voor afgerond werk en korte notities.
- Start geen `WAIT`-taak voordat de afhankelijkheid in het genoemde agentdocument op `[x]` staat.
- Raak geen bestanden aan waarvan een andere agent expliciet meldt dat die actief bewerkt worden.
- Revert geen user-wijzigingen of werk van andere agents.
- Houd providerlogica modelonafhankelijk via adapters.
- Houd API-sleutels server-side.

## Rolverdeling

| Agent | Hoofddomein | Mag direct starten | Wacht op |
|---|---|---|---|
| ChatGPT/Codex | Renderer, UX, Three.js, reviewschermen, prompt/actieflows | Ja | Claude voor backendcontracten en veilige routes |
| Claude | Supabase/backend, storage, IPC/API, jobs, providers, security | Ja | Gemini voor provider/spike-aanbevelingen |
| Gemini | Onderzoek, specs, providervergelijking, datacontracten | Ja | Claude/ChatGPT audits indien nodig |

## Fase 0 - Technische Spikes

- [ ] Gemini-turnaround uit een foto testen of specificeren.
- [ ] Contact sheet betrouwbaar splitsen of fallback bepalen.
- [ ] TRELLIS.2 single-view via fal of provideradapter valideren.
- [ ] Multiview-route vergelijken met TRELLIS.2 single-view.
- [ ] GLB in Three.js laden.
- [ ] Beauty, mask, depth en normals exportflow voorbereiden.
- [ ] Beauty plus references naar final image provider sturen of contract hiervoor maken.
- [ ] Per spike voorbeeldassets, latency, kosten en beperkingen vastleggen.

## Fase 1 - Verticale Basisflow

- [ ] Project aanmaken.
- [ ] Een foto uploaden.
- [ ] Input normaliseren.
- [ ] Drie aanvullende views genereren.
- [ ] Views accepteren.
- [ ] Single-view TRELLIS.2-reconstructie starten of adapteren.
- [ ] GLB tonen.
- [ ] Mesh accepteren.
- [ ] Primitive proxy fallback aanbieden.
- [ ] Eenvoudige Three.js-studio bouwen.
- [ ] Beauty preview exporteren.
- [ ] Finale PNG genereren.
- [ ] Final render reviewen en downloaden.

## Bewust Niet Bouwen In Deze Sprint

- [ ] Automatische modelrouter.
- [ ] Complexe validatiescore.
- [ ] Realtime mesh updates.
- [ ] Lokale view repair.
- [ ] Fidelity Mode.
- [ ] Transparante export.
- [ ] PSD/lagenexport.
- [ ] LoRA-training.

## Acceptatiecriteria

- [ ] Een testgebruiker kan zonder technische begeleiding een productfoto uploaden.
- [ ] De UI maakt duidelijk welke views echt zijn en welke AI-gegenereerd zijn.
- [ ] De gebruiker kan gegenereerde views accepteren of vervangen.
- [ ] De gebruiker kan een mesh of proxy zichtbaar beoordelen.
- [ ] Het product is zichtbaar te positioneren in een studio.
- [ ] Camera en licht zijn minimaal aanpasbaar.
- [ ] Een preview/final renderflow is aanwezig of end-to-end gesimuleerd met duidelijke adaptergrenzen.
- [ ] Providerfouten verliezen geen projectdata.
- [ ] Elke final render is herleidbaar naar referenties, reconstructie, studio scene en render packet.

## Eerste Testobject

Gebruik voor de eerste end-to-end test:

- matte rechthoekige verpakking;
- neutrale achtergrond;
- geen reflecterend materiaal;
- geen kleine tekst;
- geen transparantie;
- eenvoudige kleurverdeling.

## Definition Of Done

- [ ] `.agents/chatgpt.md` relevante taken afgerond of expliciet uitgesteld.
- [ ] `.agents/gemini.md` relevante specs en handoffs opgeleverd.
- [ ] `.agents/claude.md` backend/integratie/securitytaken afgerond of expliciet uitgesteld.
- [ ] `npm run build` gedraaid.
- [ ] Securitycheck gedraaid waar Electron, storage, IPC of providergrenzen geraakt zijn.
- [ ] Open risico's vastgelegd in dit sprintbord.

## Open Risico's

- [ ] Reference consistency tussen echte foto en gegenereerde views.
- [ ] Contact sheet splitting kan onbetrouwbaar zijn.
- [ ] TRELLIS.2 single-view kan onvoldoende productfidelity geven.
- [ ] Kleine tekst, logo's en reflecties zijn nog buiten de eerste testcategorie.
- [ ] Providerkosten en latency moeten per spike gemeten worden.
