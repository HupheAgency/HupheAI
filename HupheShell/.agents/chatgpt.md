# ChatGPT / Codex Agent - Textured Mesh UX

Projectroot:
`/Users/tom.zwarts/HupheAI/HupheShell`

Actieve sprint:
`.agents/sprint-fix-3d-to-2d.md`

## Rol

ChatGPT/Codex pakt de renderer, Product Studio UX, Scene3D viewport, state mapping, previews en debugschermen.

Hoofddoel:
Zorgen dat de gebruiker kan zien, testen en vertrouwen dat het product echt als textured 3D object in de Studio staat.

## Primair Werkgebied

- `src/renderer/src/components/ProductStudioShell.tsx`
- `src/renderer/src/components/Scene3DEditor.tsx`
- `src/renderer/src/components/Scene3DViewport.tsx`
- `src/renderer/src/lib/product-studio-types.ts`
- `src/preload/index.ts` alleen wanneer nieuwe IPC zichtbaar moet worden
- `.agents/` documentatie

## Niet Doen

- Geen providerkeys in renderer.
- Geen Supabase migrations.
- Geen texture provider zelf in renderer bouwen.
- Geen oude prompt-only product-layer route verder tunen als hoofdoplossing.

## Fase 1 - Texture UX Contract

- [x] Product Studio state uitbreiden met texturevelden zodra Claude contract klaarzet:
  - `textured_mesh_url`
  - `texture_atlas_url`
  - `material_manifest`
  - `texture_status`
- [x] UI-stap toevoegen na Mesh: `Texture product`.
- [x] Statussen tonen:
  - `Nog geen texture`
  - `Texture wordt gemaakt`
  - `Textured mesh klaar`
  - `Texture mislukt`
- [x] Knoppen toevoegen:
  - `Texture product`
  - `Opnieuw texturen`
  - `Laad preview`

## Fase 2 - Textured Mesh In Studio

- [x] `Scene3DViewport` textured mesh laten laden wanneer beschikbaar.
- [x] Duidelijke toggle/status tonen: `Grey shape` versus `Textured product`.
- [x] `Update Preview` moet textured mesh gebruiken zodra die beschikbaar is.
- [x] Beauty thumbnail gebruikt de actieve Studio mesh; zodra `textured_mesh_url` beschikbaar is wordt dit `Textured Beauty`.
- [x] Lokale texture-assets kunnen laden via `huphe://file/...`:
  - textured GLB;
  - texture atlas PNG;
  - manifest JSON.
- [x] Debug UI tonen met welke asset actief is:
  - grijze mesh URL;
  - textured mesh URL;
  - texture atlas URL;
  - laatste renderpacket.

## Fase 3 - Final UI Na Textured Beauty

- [x] Final render blokkeren of waarschuwen als er geen textured Beauty is.
- [x] Final preview labels aanpassen:
  - `Textured Beauty`
  - `Background`
  - `Composite`
- [x] Lightbox/thumbnail viewer blijven gebruiken voor alle lagen.
- [ ] Vergelijker toevoegen voor `Textured Beauty` versus `Composite`.

## Validatie

- [ ] Handmatige test: blauwe porseleinen vaas toont print in Studio.
- [ ] Handmatige test: camera draaien laat print meedraaien.
- [ ] Handmatige test: `Update Preview` maakt een Beauty met print in exact dezelfde hoek.
- [ ] Handmatige test: fallback naar grijze mesh blijft werken als texture wrap faalt.
- [x] `npm run build`

## Wacht Op Claude

- [x] IPC-contract voor texture generation.
- [x] Statevelden voor textured assets.
- [x] Eerste textured mesh output route.

## Wacht Op Gemini

- [x] Provider/pipeline advies voor eerste wrapping proof.
- [x] Acceptatiecriteria voor texture slipping en view fidelity.
