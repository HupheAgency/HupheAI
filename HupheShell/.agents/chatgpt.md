# ChatGPT / Codex Agent - Product Studio Fase 1/2

Projectroot:
`/Users/tom.zwarts/HupheAI/HupheShell`

Bron van waarheid:
`docs/comfy/HupheAI-Universal-Product-Studio-Masterdocument-v1_0.md`

Coordinatiebord:
`.agents/sprint_3D-2D-studio.md`

## Rol

ChatGPT/Codex pakt de renderer, UX, bestaande Scene3D-integratie en frontend-koppeling met Claude's Product Studio IPC/preload API op.

Primair werkgebied:

- `src/renderer/src/components/ProductStudioShell.tsx`
- `src/renderer/src/components/Scene3DEditor.tsx`
- `src/renderer/src/components/Scene3DViewport.tsx`
- `src/renderer/src/hooks/useScene3D.ts`
- gerichte renderer smoke-tests als die aanwezig zijn

Niet doen:

- Geen Supabase migrations/RLS.
- Geen providerkeys of server-side modelcalls in de renderer.
- Geen provider/modelnamen hardcoderen buiten bestaande adapter/API-keuzes.

## Fase 1 - Actieve Taken

- [x] ProductStudioShell volledig op backend-state laten draaien: project, source asset, reference views, canonical set, reconstruction, studio scene en renderpacket. (`getLatestState` hydratatie + handmatige Sync gekoppeld)
- [x] LocalStorage alleen nog gebruiken als tijdelijke UI-cache; backend blijft bron van waarheid voor projectdata.
- [~] Reference review afmaken: generated views tonen, accepteren, afwijzen, vervangen en canonical set aanmaken. (accepteren/afwijzen en canonical set flow gekoppeld; vervangen blijft vervolgwerk)
- [~] Mesh review scherm bouwen: reconstruction starten/laden, GLB tonen, proxy fallback tonen, accepteren/afwijzen/regenereren. (TRELLIS default, proxy fallback en accept/reject klaar; regenereren blijft vervolgwerk)
- [x] Reconstructie-resultaat automatisch als GLB-object in de bestaande Scene3D studio plaatsen.
- [x] Studio scene persistence verbeteren: echte camera, lights, product transform, environment en output opslaan in `saveScene`, niet lege placeholders.
- [x] Renderpacket review tonen met backend URLs voor beauty, depth en normals.
- [x] Final render review afmaken met bronfoto, canonical view, beauty preview, final image, prompt, preservation policy en download.
- [x] Foutenpad-UX zichtbaar maken voor upload failure, provider failure, retry en rollback.
- [ ] Visuele smoke-test van Product Studio flow.
- [ ] Visuele smoke-test van bestaande Media/Atelier 3D-editor om regressie te voorkomen.

## Fase 2 - Vervolgwerk

- [x] Object-mask renderpass UI tonen zodra de renderpass beschikbaar is.
- [x] Object-mask uploaden via `productStudio.uploadRenderPass({ passType: 'object-mask' })`.
- [x] `createRenderPacket` vullen met `objectMaskUrl`.
- [x] Voor/na-overlay bouwen voor source/canonical/beauty/final.
- [x] Rollback UI voor reference set, reconstruction en final render versions.
- [x] Betere jobstatus UI: queued, processing, failed, retry, completed.
- [x] Safe Camera Zone of onzekerheidswaarschuwing tonen bij zwakke reference coverage.

## Wacht Op

- [x] Claude: echte `generate-final-render` / `create-final-render` route die een `FinalRenderVersion` maakt vanuit een `RenderPacket`.
- [x] Claude: observed/front reference view of canonical-set route die source asset correct kan meenemen.
- [x] Gemini: echte provider-spike resultaten voor prompt- en routedefaults.

## Validatie

- [x] `npx tsc --noEmit`
- [x] `npm run build`
- [ ] Handmatige Product Studio smoke-test met eerste testobject.
- [ ] Handmatige foutenpad-test: provider failure, upload failure, retry en rollback.
