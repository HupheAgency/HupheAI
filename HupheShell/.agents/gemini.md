# Gemini Agent - Texture Wrapping Research

Projectroot:
`/Users/tom.zwarts/HupheAI/HupheShell`

Actieve sprint:
`.agents/sprint-fix-3d-to-2d.md`

## Rol

Gemini pakt provideronderzoek, pipelinekeuze, prompttemplates, benchmarkcriteria en kwaliteitsmetingen.

Hoofddoel:
De snelste betrouwbare route vinden om source/canonical productlook op een 3D mesh te krijgen.

## Primair Werkgebied

- `docs/build/product-studio-provider-spikes.md`
- `docs/build/reconstruction-provider-comparison.md`
- `docs/build/final-render-router-spec.md`
- `docs/build/product-studio-acceptance-checklist.md`
- nieuwe texture-wrap spike documenten in `docs/build/`

## Niet Doen

- Geen renderer-UI bouwen.
- Geen Supabase migrations.
- Geen definitieve provider kiezen zonder meetbare test.

## Fase 1 - Pipeline Keuze

- [x] Onderzoek en vergelijk minimaal drie routes:
  - ComfyUI/fal texture projection of texture baking;
  - multiview-to-texture/texture atlas provider;
  - textured image-to-3D provider als shortcut;
  - simpele projective texture prototype als fallback.
- [x] Per route vastleggen:
  - input nodig;
  - outputformaat;
  - latency;
  - kosten;
  - failure modes;
  - hoe goed front/side/back print behouden blijft.
- [x] Advies geven voor eerste proof-of-concept route.

## Fase 2 - Input Contract

- [x] Minimum input contract beschrijven:
  - source/ref-look;
  - approved canonical front/left/right/back;
  - basic mesh;
  - camera/view metadata indien nodig;
  - mask/normal/depth indien nuttig.
- [x] Duidelijk maken welke beelden nooit gebruikt mogen worden voor texture:
  - Basic Shape als look-source;
  - grijze Beauty als print-source.

## Fase 3 - Acceptatiecriteria

- [x] Testmatrix maken met:
  - blauwe porseleinen vaas;
  - grijze fles;
  - asymmetrisch product;
  - product met logo/tekst;
  - glossy/reflectief product.
- [x] Scoringcriteria:
  - print beweegt mee met mesh;
  - geen canonical-flat paste;
  - side/back plausibel;
  - texture slipping beperkt;
  - materiaal/glans blijft logisch;
  - Studio screenshot klopt vanuit meerdere hoeken.

## Fase 4 - Rapportage Aan Agents

- [x] Provideradvies delen met Claude voor backendroute.
- [x] UI/preview-eisen delen met ChatGPT/Codex.
- [x] Bekende beperkingen documenteren zodat handmatige tests eerlijk blijven.

## Wacht Op

- [ ] Eerste mesh/basic output uit actuele app voor testobjecten.
- [ ] Approved canonical views per testobject.

## Validatie

- [x] Texture-wrap adviesdocument staat in `docs/build/`.
- [x] Minimaal een concrete providerroute gekozen voor eerste implementatie.
- [x] Acceptatiechecklist bevat duidelijke pass/fail regels.
