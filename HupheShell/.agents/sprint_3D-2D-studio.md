# Sprint 3D/2D Product Studio - Fase 1/2 Coordinatiebord

Bron van waarheid:
`docs/comfy/HupheAI-Universal-Product-Studio-Masterdocument-v1_0.md`

Status: Fase 0 voorbereid en opgeschoond. Actieve sprint focust nu op Fase 1 verticale flow en Fase 2 betrouwbaarheid.

## Actieve Agentdocumenten

- ChatGPT/Codex: `.agents/chatgpt.md`
- Claude: `.agents/claude.md`
- Gemini: `.agents/gemini.md`

## Regels Voor Alle Agents

- Lees het masterdocument voordat je start.
- Lees alle drie de agentdocumenten voordat je start.
- Update je eigen document met `[~]` voor actief werk, `[x]` voor afgerond werk en korte notities.
- Start geen `WAIT`-taak voordat de afhankelijkheid in het genoemde agentdocument op `[x]` staat.
- Revert geen user-wijzigingen of werk van andere agents.
- Houd providerlogica modelonafhankelijk via adapters.
- Houd API-sleutels server-side.

## Rolverdeling

| Agent | Fase 1 focus | Fase 2 focus |
|---|---|---|
| ChatGPT/Codex | UI koppelen aan backend, reference review, mesh review, studio/final review | object-mask UI, rollback UI, jobstatus UI, overlays |
| Claude | backend gaten dichten, final render route, observed/front reference, security/foutenpaden | retries, protected regions, rollback helpers, storage cleanup |
| Gemini | echte provider-spikes, prompttemplates, routeadvies | multiview benchmark, multi-pass final render, scoring/fidelity criteria |

## Fase 1 - Verticale Basisflow

- [x] Product Studio flow draait op backend-state in plaats van lokale demo-state.
- [x] Gebruiker kan bronfoto uploaden en normalisatie starten.
- [~] Gebruiker kan generated reference views laden, accepteren, afwijzen of vervangen. (laden/accepteren/afwijzen klaar; vervangen blijft vervolgwerk)
- [x] Canonical reference set kan worden aangemaakt inclusief bron/front reference.
- [~] Reconstructie kan worden gestart en mesh/proxy kan worden beoordeeld. (TRELLIS default, proxy fallback en accept/reject klaar; regenereren blijft vervolgwerk)
- [x] GLB wordt automatisch in de bestaande Three.js studio geladen.
- [x] Studio scene wordt met echte camera/lights/product transform opgeslagen.
- [x] Renderpacket wordt opgeslagen met backend URLs voor beauty, depth en normals.
- [x] Final render route maakt een `FinalRenderVersion` vanuit een `RenderPacket`. (backend: `generate-final-render` IPC via Qwen Image Edit + provider run + eigen storage)
- [x] Final render review toont bronfoto, canonical view, beauty preview, final image, prompt en download.
- [ ] Handmatige end-to-end test met eerste testobject is uitgevoerd.
- [~] Handmatige foutenpad-test is uitgevoerd: provider failure, upload failure, retry en rollback. (UI voor retry/rollback staat; echte handtest volgt)

## Fase 2 - Betrouwbaarheid En Kwaliteit

- [x] Object-mask renderpass toevoegen voor protected regions.
- [~] Multi-pass final render input met canonical reference set, depth, normals en protected regions. (beauty/depth/normals/object-mask gekoppeld; canonical refs provider-side verder valideren)
- [x] Voor/na-overlay voor source/canonical/beauty/final.
- [x] Rollback UI voor reference set, reconstruction en final render versions.
- [x] Jobstatus UI voor queued, processing, failed, retry en completed.
- [x] Providerkosten en latency zichtbaar maken.
- [x] Safe Camera Zone of onzekerheidswaarschuwing bij zwakke reference coverage.
- [ ] Multiview reconstruction benchmark uitvoeren zodra providerroute bewezen is.
- [ ] Fidelity Mode criteria uitwerken.

## Eerste Testobject

Gebruik voor de eerste end-to-end test:

- matte rechthoekige verpakking;
- neutrale achtergrond;
- geen reflecterend materiaal;
- geen kleine tekst;
- geen transparantie;
- eenvoudige kleurverdeling.

## Definition Of Done Voor Fase 1

- [ ] `.agents/chatgpt.md` Fase 1 taken afgerond of expliciet uitgesteld.
- [ ] `.agents/claude.md` Fase 1 taken afgerond of expliciet uitgesteld.
- [x] `.agents/gemini.md` Fase 1 providerresultaten afgerond of expliciet uitgesteld.
- [x] `npx tsc --noEmit` groen.
- [x] `npm run build` groen.
- [ ] Product Studio smoke-test groen.
- [ ] Bestaande Media/Atelier 3D-editor regressietest groen.
- [ ] Open risico's vastgelegd.

## Open Risico's

- [ ] Reference consistency tussen echte foto en gegenereerde views.
- [ ] Contact sheet splitting kan onbetrouwbaar zijn.
- [ ] TRELLIS.2 single-view kan onvoldoende productfidelity geven.
- [ ] Kleine tekst, logo's en reflecties zijn buiten de eerste testcategorie.
- [ ] Providerkosten en latency moeten met echte provider-runs worden gemeten.
- [x] FinalRenderService generation route is toegevoegd via `product-studio:generate-final-render`.

## Niet Actief In Deze Sprint

De oude Typewriter- en Import/Export-punten staan in:

- `.agents/future-to-do/sprint_typewriter.md`
- `.agents/future-to-do/sprint6_import_engine.md`

## Historie - Fase 0 Afgerond

Fase 0 is afgerond als technische voorbereiding. De open punten die nog echte providerdata of productie-integratie nodig hebben, zijn bewust verplaatst naar Fase 1 of Fase 2.

- [x] Masterdocument gelezen en vertaald naar uitvoerbare sprintstructuur.
- [x] Oude Typewriter- en Import/Export-sprints uit de actieve agentdocumenten gehaald en verplaatst naar `future-to-do`.
- [x] Taken verdeeld over ChatGPT/Codex, Claude en Gemini op basis van ieders rol.
- [x] Product Studio UI-shell voorbereid in de app.
- [x] Source upload, projectflow en basisstappen in de Product Studio UI voorbereid.
- [x] Reference review UI voorbereid voor generated views, accept/reject en canonical set flow.
- [x] Three.js studio gekoppeld aan Product Studio flow.
- [x] GLB/GLTF import in de bestaande Scene3D-editor voorbereid.
- [x] Scene3D storage-key ondersteuning toegevoegd zodat Product Studio eigen scenes kan bewaren.
- [x] Beauty/textured/depth/normal renderpass-preview voorbereid.
- [x] RenderPacket basiscontract voorbereid; backend URLs en echte final-render route zijn doorgeschoven naar Fase 1.
- [x] Object-mask uit Fase 0 gehaald en expliciet naar Fase 2 verplaatst.
- [x] Provider-spike meetformat en documentatie voorbereid; echte latency/kosten/kwaliteitmetingen zijn doorgeschoven naar Gemini Fase 1.
- [x] Reference-view contract, contact-sheet splitting plan, reconstruction comparison, renderpacket spec, final-render router spec en acceptance checklist gedocumenteerd in `docs/build`.
- [x] Backend Product Studio IPC-routes geïnventariseerd en gebruikt waar beschikbaar.
- [x] Ontbrekende backend-gaten benoemd: observed/front reference handling, latest-state routes en final render route.
- [x] `npx tsc --noEmit` eerder groen na de Product Studio UI-voorbereiding.
- [x] `npm run build` eerder groen na de Product Studio UI-voorbereiding.
