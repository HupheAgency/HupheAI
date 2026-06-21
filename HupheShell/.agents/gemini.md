# Gemini Agent - Product Studio Provider Fase 1/2

Projectroot:
`/Users/tom.zwarts/HupheAI/HupheShell`

Bron van waarheid:
`docs/comfy/HupheAI-Universal-Product-Studio-Masterdocument-v1_0.md`

Coordinatiebord:
`.agents/sprint_3D-2D-studio.md`

## Rol

Gemini pakt providermetingen, prompttemplates, routekeuzes, benchmarkrapportage en kwaliteitscriteria op.

Primair werkgebied:

- `docs/build/product-studio-provider-spikes.md`
- `docs/build/reconstruction-provider-comparison.md`
- `docs/build/final-render-router-spec.md`
- `docs/build/product-studio-acceptance-checklist.md`
- aanvullende benchmarkrapporten in `docs/build/`

Niet doen:

- Geen renderer-UI refactors.
- Geen Supabase deploys of migrations.
- Geen definitieve providerkeuze zonder meetdata.

## Fase 1 - Actieve Taken

- [x] Echte reference-view spike uitvoeren met eerste testobject: frontfoto naar left/right/rear/top.
- [x] Contact sheet route vergelijken met losse view generations.
- [x] Per reference route vastleggen: input asset, output assets, latency, kosten, failure notes en human accept score.
- [x] Prompttemplate aanbevelen voor reference views met behoud van productidentiteit.
- [x] TRELLIS.2 single-view spike uitvoeren met eerste testobject.
- [x] Primitive proxy route vergelijken als fallback wanneer TRELLIS.2 faalt.
- [x] Per reconstruction route vastleggen: GLB laadbaarheid, silhouet, latency, kosten en failure notes.
- [x] Qwen/Final image route beoordelen met beauty preview + source reference + preservation policy.
- [x] Advies geven voor Fase 1 defaults: reference route, reconstruction route, final render route.
- [x] Acceptatiechecklist invullen met echte testresultaten.

## Fase 2 - Vervolgwerk

- [ ] Multiview reconstruction benchmark uitvoeren wanneer provider beschikbaar is.
- [ ] Multi-pass final render testen met beauty, depth, normals en canonical references.
- [x] Object-mask/protected-region strategy testen voor logo/tekstbehoud.
- [x] Scoringmodel voorstellen voor reference consistency, silhouette match en identity preservation.
- [x] Fidelity Mode criteria uitwerken: wanneer meerdere echte foto's verplicht zijn.
- [x] Providerkosten en latency vergelijken per productcategorie.
- [x] Modelrouter-aanbeveling maken pas na voldoende meetdata.

## Wacht Op

- [ ] Claude: werkende provider routes met logging/kosten/latency.
- [ ] ChatGPT/Codex: UI-smoke flow waarmee testassets door de pipeline kunnen.

## Validatie

- [ ] Elk benchmarkdocument bevat assets, latency, kosten, beperkingen en advies.
- [ ] Providerkeuzes blijven adapter-gebaseerd.
- [ ] Definitieve aanbevelingen noemen expliciet wanneer meetdata ontbreekt.

