# Claude Agent - Product Studio Backend Fase 1/2

Projectroot:
`/Users/tom.zwarts/HupheAI/HupheShell`

Bron van waarheid:
`docs/comfy/HupheAI-Universal-Product-Studio-Masterdocument-v1_0.md`

Coordinatiebord:
`.agents/sprint_3D-2D-studio.md`

## Rol

Claude pakt backend, Supabase, storage, IPC/API-contracten, provideradapters, jobs, versioning, security en finale integratiechecks op.

Primair werkgebied:

- `src/main/product-studio-ipc.ts`
- `src/preload/index.ts`
- Supabase migrations/RLS/storage
- provider/job/final-render integratie

Niet doen:

- Geen renderer-UI refactors die bij ChatGPT/Codex liggen.
- Geen providerkeuze definitief maken zonder Gemini-meetdata.
- Geen API-sleutels naar renderer lekken.

## Fase 1 - Actieve Taken

- [x] Front/source asset als observed reference view ondersteunen. `register-source-as-reference` IPC handler: registreert source asset als `hero` of `front` view met provenance `observed`, status `active`.
- [x] Echte `generate-final-render` IPC/preload route. Stuurt beauty pass naar Qwen Image Edit met preservation policy prefix, slaat output op in eigen storage, maakt `FinalRenderVersion` aan met status `review`.
- [x] Final render route gekoppeld aan provider run tracking, preservation policy (strict/balanced/creative), resolution, prompt, output URL en status `review`.
- [x] Studio scene contract accepteert echte `Scene3DState` mapping: camera (Record), lights (Record[]), productTransform (Record), environment (Record) en output (Record) als JSONB. Bestaand contract is al generiek genoeg.
- [x] Latest-state read route: `get-latest-state` IPC handler retourneert project, source assets, reference views, latest canonical set, latest reconstruction, latest scene, latest renderpacket en latest final render in één call.
- [ ] Reference view generation en TRELLIS.2 reconstruction handmatig met eerste testobject testen.
- [x] Signed URL refresh: `refresh-signed-url` IPC handler met configureerbare bucket, storagePath en expiresIn.
- [ ] Foutenpad testen: provider failure, upload failure, job retry en rollback.
- [x] Finale securitycheck op Product Studio IPC payloads en storage paths. 7 fixes: upload-source mime/ext allowlist, dataUrl grootte-limiet (50MB), bucket allowlist op refresh-signed-url, HTTPS check op beauty_url en primaryImageUrl, coverage validatie op canonical set, expiresIn cap op 86400.

## Fase 2 - Vervolgwerk

- [x] Object-mask renderpass als first-class RenderPacket asset: `generate-final-render` stuurt nu object-mask mee als mask_image_base64 naar Qwen Image Edit en voegt protected-region context toe aan de prompt (strict/balanced).
- [x] Protected regions doorgeven aan FinalRenderProvider: mask wordt gedownload uit RenderPacket.object_mask_url en meegestuurd als mask parameter.
- [x] Retry/resume flow: `retry-provider-run` IPC handler. Alleen failed runs, max 3 retries, reset naar queued met retry_count+1.
- [x] Rollback helpers: `rollback-canonical-set` (op versienummer), `rollback-reconstruction` (op id, zet vorige approved op rejected), `rollback-final-render` (op id). Alle drie met project ownership check.
- [x] Providerkosten en latency: `get-provider-stats` IPC handler. Retourneert alle runs + summary met totals, per-type gemiddelde latency, totale kosten en fail rate.
- [ ] Background job polling of push updates ontwerpen voor lange reconstruction/final render jobs.
- [x] Storage cleanup: `cleanup-storage` IPC handler. Verwijdert GLB en PNG assets van failed/rejected reconstructions en final renders uit `atelier-assets`.

## Wacht Op

- [x] ChatGPT/Codex: final render review, mesh review, rollback/retry/jobstatus, object-mask UI, voor/na-overlay en Safe Camera Zone zijn gekoppeld.
- [x] Gemini: echte provider-spike resultaten en definitieve prompt/routedefaults.

## Validatie

- [x] `npm run build` — groen (2026-06-21).
- [x] Securitycheck: 7 fixes doorgevoerd — mime/ext allowlist, dataUrl grootte-limiet, bucket allowlist, HTTPS checks, coverage validatie, expiresIn cap.
- [ ] Handmatige end-to-end test met eerste testobject.
- [ ] Handmatige foutenpad-test: provider failure, upload failure, retry en rollback.
