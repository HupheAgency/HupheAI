# Claude Agent - Textured Mesh Backend

Projectroot:
`/Users/tom.zwarts/HupheAI/HupheShell`

Actieve sprint:
`.agents/sprint-fix-3d-to-2d.md`

## Rol

Claude pakt backend, IPC, Supabase/storage, provideradapters, jobs, versioning en het texture-wrap contract.

Hoofddoel:
Een echte textured mesh asset maken en opslaan, zodat de renderer een 3D product met productlook kan laden.

## Primair Werkgebied

- `src/main/product-studio-ipc.ts`
- `src/preload/index.ts`
- Supabase migrations/RLS/storage waar nodig
- Provider adapters / Edge Functions waar nodig
- `docs/build/` technische notities wanneer contracten veranderen

## Niet Doen

- Geen renderer-UI refactors.
- Geen API keys lekken naar renderer.
- Geen oude prompt-only product-layer route verder tunen als hoofdroute.

## Fase 1 - Texture Contract En Opslag

- [x] Datamodel: 6 kolommen op `reconstruction_versions` — `textured_mesh_url`, `texture_atlas_url`, `material_manifest`, `texture_source_view_ids`, `texture_status`, `texture_error`.
- [x] Hoort bij `reconstruction_versions` (verrijking van bestaande mesh).
- [x] Opslagpaden: local-first proof onder Electron `userData/product-studio/{userId}/{projectId}/textures/`.
- [x] Viewer-URLs: `huphe://file/...` voor textured GLB, atlas PNG en manifest JSON.
- [x] IPC handlers: `create-textured-mesh`, `get-texture-status`, `retry-texture-wrap`.
- [x] Preload bridge: `createTexturedMesh`, `getTextureStatus`, `retryTextureWrap`.
- [x] `get-latest-state` geeft texture-kolommen automatisch mee via `select('*')`.
- [x] Migration `20260624000000_textured_mesh.sql`.
- [x] Build groen.

## Fase 2 - Eerste Texture Wrap Proof

- [x] UV-projectie route gebouwd in `src/main/lib/texture-projector.ts` — geen AI-call, puur programmatisch.
- [x] Inputs gescheiden: GLB mesh (geometrie) + reference_views/source (texture/look). Nooit basic product voor texture.
- [x] Output: textured GLB + texture atlas PNG + material manifest JSON lokaal opgeslagen.
- [x] `create-textured-mesh` handler doet volledige flow: download mesh → download views → projectTexture → schrijf lokaal → update DB.
- [x] Provider metadata: `material_manifest` JSONB met atlas_size, views_used, triangles_textured/total.
- [x] Foutenpad: bij mislukking → texture_status='failed', texture_error gevuld, grijze mesh blijft bruikbaar.
- [x] Fallback cascade: explicit viewIds → alle active/draft views → source original-image.

## Fase 3 - Textured RenderPacket

- [ ] RenderPacket route toestaan dat renderer textured mesh gebruikt.
- [ ] Metadata opslaan waarmee zichtbaar is of Beauty uit grijze mesh of textured mesh komt.
- [ ] Final render route waarschuwen/fallbacken als er geen textured Beauty is.

## Fase 4 - Background/Composite Na Textured Beauty

Pas starten als wrapping zichtbaar werkt.

- [ ] Background generation baseren op textured Beauty + scene manifest.
- [ ] Composite moet product uit textured Beauty behouden.
- [ ] Oude layered product-polish route alleen als fallback laten bestaan.

## Validatie

- [ ] Textured mesh bestaat fysiek lokaal en opent via `huphe://file`.
- [ ] Renderer kan textured mesh URL laden.
- [ ] Vaasprint zit op mesh, niet alleen in een 2D thumbnail.
- [ ] Build groen.
- [ ] Handmatige end-to-end test met blauwe porseleinen vaas.

## Wacht Op Gemini

- [ ] Provider/pipeline keuze voor eerste texture wrapping proof.
- [ ] Minimale input/output contracten voor gekozen route.

## Wacht Op ChatGPT/Codex

- [x] UI voor texture status en preview.
- [x] Studio laadt textured mesh zodra backend URL beschikbaar is.
