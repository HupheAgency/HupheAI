# ChatGPT / Codex Agent - 3D/2D Product Studio Sprint

Projectroot:
`/Users/tom.zwarts/HupheAI/HupheShell`

Bron van waarheid:
`docs/comfy/HupheAI-Universal-Product-Studio-Masterdocument-v1_0.md`

Coordinatiebord:
`.agents/sprint_3D-2D-studio.md`

## Rol

ChatGPT/Codex pakt vooral frontend, renderer, UX, Three.js-integratie en lokale clientlogica op.

Primair werkgebied:

- `src/renderer/src`
- Product Studio pagina's, componenten, hooks en UI-states
- Three.js scene, controls, review UI en prompt/actieflows
- gerichte renderer-tests als die aanwezig zijn

Niet doen:

- Geen Supabase migrations of RLS aanpassen.
- Geen providerkeys of server-side AI-aanroepen in renderer plaatsen.
- Geen model/providerkeuze hardcoderen buiten het afgesproken adaptercontract.

## Samenwerkingsprotocol

- Lees voor start het masterdocument, `.agents/sprint_3D-2D-studio.md`, `.agents/claude.md` en `.agents/gemini.md`.
- Werk alleen aan taken uit dit document of het sprintbord.
- Zet actieve taken op `[~]`, afgeronde taken op `[x]` en noteer kort wat is aangepast.
- Check de andere agentdocumenten tijdens lang werk.
- Laat user-wijzigingen en werk van andere agents intact.

## Taken

### Fase 0 - Technische Spikes

- [ ] Minimale Product Studio shell maken of aanwijzen waar deze in de app komt.
- [ ] Uploadflow UI voor een enkele productfoto ontwerpen.
- [ ] Review UI ontwerpen voor observed, inferred, user-approved en user-edited referentieviews.
- [ ] Contact sheet split-resultaten visueel kunnen controleren.
- [ ] GLB/GLTF in een Three.js canvas laden met orbit, pan en zoom.
- [ ] Primitive proxy fallback UI ontwerpen: box, cylinder, sphere en plane.
- [ ] Renderpass-preview UI voorbereiden voor beauty, mask, depth en normals.

### Fase 1 - Verticale Basisflow

- [ ] Project aanmaken UI.
- [ ] Een foto uploaden en bronstatus tonen.
- [ ] Drie aanvullende views tonen en laten accepteren of vervangen.
- [ ] Mesh review scherm bouwen met front, left, right, rear en turntable/preview.
- [ ] Mesh accepteren, opnieuw genereren, vorige versie herstellen en primitive proxy kiezen.
- [ ] Eenvoudige Three.js-studio bouwen met product transform, camera, licht en achtergrond.
- [ ] Preview/final promptbar koppelen aan de studioflow.
- [ ] Final Render Review UI bouwen met bronfoto, canonical view, beauty preview en finale render.
- [ ] PNG downloadactie aansluiten zodra Claude de backendroute levert.

### UX-Regels Uit Het Masterdocument

- [ ] De originele foto altijd als bewijs zichtbaar of bereikbaar houden.
- [ ] AI-gegenereerde views nooit stilzwijgend gelijkstellen aan echte views.
- [ ] Elke acceptatiestap expliciet maken.
- [ ] Failure UX maken waarmee de gebruiker kan herstellen zonder opnieuw te beginnen.
- [ ] Eerste testcategorie ondersteunen: matte rechthoekige verpakking, neutrale achtergrond, eenvoudige kleuren.

## Wacht Op

- [ ] WAIT op Gemini: definitieve technische spike-aanbevelingen en provider-adaptercontracten.
- [ ] WAIT op Claude: project-, asset-, job- en versioning-backendcontracten.
- [ ] WAIT op Claude: veilige upload/download/storage routes.

## Validatie

- [ ] `npm run build`.
- [ ] Visuele smoke-test van upload, review, studio en final review.
- [ ] Controleren dat API-sleutels en providerlogica niet in renderer terechtkomen.
