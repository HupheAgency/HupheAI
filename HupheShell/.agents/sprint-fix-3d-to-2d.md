# Sprint 3D Naar 2D - Textured Mesh Route

Bron van waarheid:
`docs/comfy/HupheAI-Universal-Product-Studio-Masterdocument-v1_0.md`

Actieve richting:
Route 2. Niet langer proberen om een beeldmodel telkens de canonical print op een grijze Beauty te laten raden. Eerst het 3D object zelf voorzien van productlook/texture, zodat de Studio screenshot al de echte vorm, hoek, print, glans en belichting bevat.

## Doel

Bewijs eerst dat we een geupload product kunnen reconstrueren naar een bruikbaar 3D object met gewrapte productlook.

Daarna wordt de 2D render simpeler:

1. Upload product.
2. Maak Basic Shape voor reconstructie.
3. Maak/controleer canonical views uit de echte bron/ref-look.
4. Bouw mesh.
5. Projecteer/wrap productlook op mesh.
6. Toon textured mesh in Studio.
7. `Update Preview` maakt een Beauty die al productprint, materiaal en camera bevat.
8. AI hoeft daarna vooral omgeving/background/commercial polish te maken, niet opnieuw de producthoek te verzinnen.

## Waarom Deze Route

De huidige layered image-edit route kan soms werken, maar blijft probabilistisch:

- product layer valt soms terug naar canonical/frontaal;
- background en product komen soms net niet uit dezelfde camera;
- composite moet te veel corrigeren;
- prompts worden fragiel omdat één model tegelijk hoek, print, licht, achtergrond en blend moet volgen.

Met een textured mesh wordt de 3D Studio weer de bron van waarheid:

- camera komt uit de viewport;
- productpositie komt uit de viewport;
- print en materiaal zitten op het mesh;
- final image model krijgt een veel duidelijkere opdracht.

## Scope Van Deze Sprint

Belangrijkste succescriterium:

- [ ] Een textured 3D object renderen in de Studio waarbij de vaas/fles zichtbaar de bronprint/look draagt en meedraait met de camera.

Niet eerst perfect maken:

- perfecte multi-view texture atlas;
- alle objectcategorieen;
- automatische unwrap op productieniveau;
- perfecte final background/composite.

Eerst moet bewezen zijn dat wrapping/projectie werkt.

## Fase 0 - Oude Route Bevriezen

- [ ] Bestaande Basic Shape, canonical views, TRELLIS mesh en renderpacket flow intact laten.
- [ ] Layered image-edit route behouden als fallback, maar niet verder tunen als hoofdoplossing.
- [x] UI duidelijk maken wanneer er een textured mesh beschikbaar is versus alleen een grijze mesh.

## Fase 1 - Texture Contract

### Claude - Backend / IPC / Storage

- [x] Datamodel bepalen voor textured mesh assets:
  - `textured_mesh_url`
  - `texture_atlas_url`
  - `material_manifest`
  - `texture_source_view_ids`
  - `texture_status`
- [x] Opslaglocatie bepalen voor texture atlas en textured GLB/GLTF.
- [x] IPC-contract maken voor:
  - `product-studio:create-textured-mesh`
  - `product-studio:get-texture-status`
  - `product-studio:retry-texture-wrap`
- [x] Resultaat koppelen aan project state zodat renderer het textured mesh kan laden.

### ChatGPT / Codex - Renderer / UX

- [x] Mesh/Studio state uitbreiden met textured mesh status.
- [x] UI-stap toevoegen: `Texture product` na Mesh.
- [x] Preview tonen:
  - grijze mesh;
  - textured mesh;
  - gebruikte canonical/source refs.
- [x] Duidelijke CTA: eerst texture bewijzen, daarna pas final render.

### Gemini - Provider / Pipeline Research

- [x] Beste route kiezen voor eerste texture proof:
  - ComfyUI/fal texture projection;
  - multiview-to-texture;
  - image-to-3D provider met texture output;
  - local/three.js projective texture prototype.
- [x] Minimum input contract beschrijven:
  - source/ref-look;
  - approved canonical views;
  - mesh/basic shape;
  - camera/view metadata.
- [x] Risico's en fallback per provider noteren.

## Fase 2 - Eerste Wrapping Proof

### Claude - Backend / Pipeline

- [x] Eerste texture-wrap route implementeren achter feature flag.
- [x] Input altijd uit echte bron/canonical views halen, niet uit Basic Shape.
- [x] Output opslaan als textured asset.
  - Voor de proof local-first: textured GLB, atlas PNG en manifest JSON worden lokaal onder Electron `userData` opgeslagen en via `huphe://file/...` geladen.
  - Supabase bewaart voorlopig alleen de status en lokale viewer-URL's, zodat de desktop-app direct kan testen zonder storage MIME/timeout-gedoe.
- [x] Foutenpad: als texture wrap faalt, grijze mesh behouden en duidelijke error teruggeven.

### ChatGPT / Codex - Renderer / Studio

- [x] Textured mesh kunnen laden in `Scene3DViewport`.
- [x] Toggle of status tonen: `Grey shape` / `Textured product`.
- [x] `Update Preview` gebruikt textured mesh zodra beschikbaar.
- [x] Beauty thumbnail gebruikt de actieve Studio mesh; zodra `textured_mesh_url` beschikbaar is wordt dit `Textured Beauty`.

### Gemini - Validatie

- [x] Testmatrix maken met minimaal:
  - grijze fles;
  - blauwe porseleinen vaas;
  - product met logo/tekst;
  - glossy product;
  - asymmetrisch product.
- [x] Acceptatiecriteria voor wrapping:
  - print beweegt mee met mesh;
  - front/side/back logisch;
  - geen canonical-flat paste;
  - geen texture slipping bij camera-rotatie.

## Fase 3 - Background Na Textured Beauty

Pas starten als Fase 2 zichtbaar werkt.

### Claude - Backend

- [ ] Background call baseren op textured Beauty + scene manifest.
- [ ] Background moet leeg zijn maar camera, horizon, grondvlak en belichting matchen.
- [ ] Composite mag background iets aanpassen aan product, maar product niet hertekenen.

### ChatGPT / Codex - UI

- [ ] Final UI labelen als:
  - Textured Beauty
  - Background
  - Composite
- [ ] Vergelijker houden voor debug.
- [ ] Waarschuwen als final render wordt gestart zonder textured Beauty.

## Fase 4 - Acceptatie

- [ ] Vaas met print draait in 3D en behoudt print/look.
- [ ] Screenshot/Beauty vanuit top angle toont dezelfde top angle met print.
- [ ] Screenshot/Beauty vanuit side angle toont side angle met passende texture.
- [ ] Background generatie verandert product niet.
- [ ] Composite behoudt product uit textured Beauty.
- [ ] Oude prompt-only product-layer route is alleen fallback.

## Belangrijke Regels

- Basic Shape is voor geometrie en reconstructie, niet voor productlook.
- Canonical/source refs zijn voor texture/look, niet voor positionering.
- Studio camera is leidend voor compositie.
- Textured mesh is de nieuwe kern. Pas daarna komt 2D AI polish.
- Texture proof-assets blijven lokaal totdat de wrapping zichtbaar betrouwbaar is; pas daarna beslissen we of/hoe ze naar Supabase moeten voor delen/sync.
