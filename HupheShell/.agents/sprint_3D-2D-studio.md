# Sprint 3D/2D Product Studio - Fase 1/2 Coordinatiebord

Bron van waarheid:
`docs/comfy/HupheAI-Universal-Product-Studio-Masterdocument-v1_0.md`

Status: Fase 1 smoke-test **groen** (end-to-end compleet). Fase 2 betrouwbaarheid grotendeels afgerond. Fidelity/hardening frontend is bijgewerkt; volgende focus: source/canonical references in final render, regressietest en foutenpad-test.

## Verslag 2026-06-22 — Smoke-test compleet, credit system en gizmo fixes

### Wat is gebouwd/gewijzigd

- **Gizmo hiding in render passes**: `hideGizmos()` herschreven als whitelist — alleen `__sceneObjects` groep en lichten blijven zichtbaar. Editor-only componenten (LightHelper, CameraHelper, light targets) gemarkeerd met `__editorOnly` userData. TransformControls, Grid, GizmoHelper etc. worden nu betrouwbaar verborgen in beauty/depth/normal passes.
- **Credit reservation lifecycle**: `reserve_credits_for_user` RPC gefixed (verwees naar niet-bestaande `companies` tabel). Alle wallet RPCs gecorrigeerd van `balance` naar `personal_balance` (de werkelijke kolomnaam op remote DB). Edge function `proxy-fal-ai` v20 deployed met zelfde fix.
- **Credit release bij gefaalde renders**: Outer catch in edge function geeft nu reservering terug bij elke fout. 497.248 millicredits vrijgegeven uit 104 vastgelopen reserveringen. Auto-cleanup van verlopen reserveringen in `reserve_credits_for_user`.
- **TopUp modal in Product Studio**: Alle fal.ai error handlers checken `notifyIfCreditsRequired()` → opent TopUpModal met Stripe checkout bij onvoldoende credits (402).
- **Download feedback**: "Downloaden..." → "Opgeslagen in Downloads" (3s timeout).
- **Mesh review visuele feedback**: Goedkeur/Afwijs knoppen vervangen door groen vinkje / rood kruisje na klikken.

### Smoke-test status (grijze fles) — COMPLEET

- [x] Upload bronfoto via "3D" knop
- [x] Normalisatie
- [x] Reference views genereren (4/4 goedgekeurd)
- [x] Canonical set aangemaakt
- [x] TRELLIS reconstructie → GLB geladen in studio
- [x] Mesh goedgekeurd
- [x] Render packet (Maak preview) — clean, zonder gizmos
- [x] Final render met prompt — succesvol (Qwen Image Edit)
- [x] Download resultaat

### Bekende beperkingen

- Complexe objecten (glanzend porselein, fijne patronen, transparante PNG achtergrond) falen of geven slechte resultaten. Eerste testcategorie (mat, eenvoudig, neutraal) werkt wel.
- TRELLIS mesh heeft geen textuur → Qwen raadt productkleur. Originele productfoto (`referenceImageSrc`) wordt nog niet als referentie meegestuurd naar de AI. Gepland als vervolgwerk.
- Camera-hoek in final render is gekoppeld aan render packet thumbnail, niet aan live viewport. UI blokkeert final render nu zodra camera/object/licht/environment na de snapshot wijzigt.

## Volgende Sprintstap - Fidelity En Hardening

Doel: van "werkt end-to-end" naar "voorspelbaar productresultaat".

- productkleur en materiaal beter behouden;
- originele source/canonical references meenemen in final render contract;
- renderpacket veroudering explicieter maken na camera/object wijzigingen;
- reference/mesh regeneratie afronden;
- handmatige foutenpad-test uitvoeren;
- bestaande Media/Atelier 3D regressietest uitvoeren.

---

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

## Rolverdeling Vanaf Dit Punt

| Agent | Nu oppakken | Niet vergeten |
|---|---|---|
| ChatGPT/Codex | regressietest bestaande 3D editor, foutenpad-test begeleiden, UI koppelen zodra Claude final-render refs uitbreidt | geen providerlogica in renderer |
| Claude | final render contract uitbreiden met source/canonical refs, kleurbehoud prompt, background job polling besluit, retry-dispatch controleren | API-sleutels en storage server-side houden |
| Gemini | grijze-fles kleurverschuiving analyseren, fidelity prompt/settings advies, testmatrix kleur/materiaal/tekst | providerkeuzes adapter-gebaseerd houden |

## Fase 1 - Verticale Basisflow

- [x] Product Studio flow draait op backend-state in plaats van lokale demo-state.
- [x] Gebruiker kan bronfoto uploaden en normalisatie starten.
- [x] Gebruiker kan generated reference views laden, accepteren, afwijzen of vervangen.
- [x] Canonical reference set kan worden aangemaakt inclusief bron/front reference.
- [x] Reconstructie kan worden gestart, geregenereerd per route en mesh/proxy kan worden beoordeeld.
- [x] GLB wordt automatisch in de bestaande Three.js studio geladen.
- [x] Studio scene wordt met echte camera/lights/product transform opgeslagen.
- [x] Renderpacket wordt opgeslagen met backend URLs voor beauty, depth en normals.
- [x] Final render route maakt een `FinalRenderVersion` vanuit een `RenderPacket`. (backend: `generate-final-render` IPC via Qwen Image Edit + provider run + eigen storage)
- [x] Final render review toont bronfoto, canonical view, beauty preview, final image, prompt en download.
- [x] Handmatige end-to-end test met eerste testobject is uitgevoerd. (upload → views → mesh → render packet → final render → download: compleet 2026-06-22)
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

## Fase 2.5 - Fidelity En Hardening

- [x] Source image en canonical references meesturen naar FinalRenderProvider. (Llama 4 Scout beschrijft source product → kleur/materiaal in prompt, beide render paden)
- [x] Backend prompt-prefix aanscherpen voor kleurbehoud, vooral grijs/zwart/wit en matte materialen. (productContext per policy + compositionNote)
- [x] UI hint toevoegen voor kleurbehoud bij Strict/Balanced/Creative.
- [x] Renderpacket stale-state verder verbeteren na camera/object/licht/environment wijzigingen.
- [x] Reference vervangen/regenereren per view.
- [x] Mesh regenereren per route en oude mesh herstellen.
- [ ] Handmatige foutenpad-test: provider failure, upload failure, retry en rollback.
- [ ] Bestaande Media/Atelier 3D-editor regressietest na capture/gizmo wijzigingen.
- [x] Kleur/fidelity testmatrix uitvoeren of documenteren.

## Eerste Testobject

Gebruik voor de eerste end-to-end test:

- matte rechthoekige verpakking;
- neutrale achtergrond;
- geen reflecterend materiaal;
- geen kleine tekst;
- geen transparantie;
- eenvoudige kleurverdeling.

## Definition Of Done Voor Fase 1

- [x] `.agents/chatgpt.md` Fase 1 taken afgerond of expliciet uitgesteld.
- [x] `.agents/claude.md` Fase 1 taken afgerond of expliciet uitgesteld.
- [x] `.agents/gemini.md` Fase 1 providerresultaten afgerond of expliciet uitgesteld.
- [x] `npx tsc --noEmit` groen.
- [x] `npm run build` groen.
- [x] Product Studio smoke-test groen. (2026-06-22)
- [ ] Bestaande Media/Atelier 3D-editor regressietest groen.
- [x] Open risico's vastgelegd.

## Open Risico's

- [ ] Reference consistency tussen echte foto en gegenereerde views.
- [ ] Contact sheet splitting kan onbetrouwbaar zijn.
- [ ] TRELLIS.2 single-view kan onvoldoende productfidelity geven.
- [ ] Kleine tekst, logo's en reflecties zijn buiten de eerste testcategorie.
- [ ] Providerkosten en latency moeten met echte provider-runs worden gemeten.
- [x] FinalRenderService generation route is toegevoegd via `product-studio:generate-final-render`.
- [ ] Productkleur kan verschuiven in final render wanneer source/canonical refs niet expliciet worden meegestuurd.
- [x] Renderpacket stale-state blokkeert final render als gebruiker na preview camera/object/licht/environment wijzigt.

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
