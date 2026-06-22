# Gemini Agent - Product Studio Provider Vervolg

Projectroot:
`/Users/tom.zwarts/HupheAI/HupheShell`

Bron van waarheid:
`docs/comfy/HupheAI-Universal-Product-Studio-Masterdocument-v1_0.md`

Coordinatiebord:
`.agents/sprint_3D-2D-studio.md`

## Rol

Gemini pakt providermetingen, prompttemplates, routekeuzes, benchmarkrapportage, kwaliteitscriteria en fidelity-richtlijnen op.

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

## Afgerond

- [x] Reference-view spike met eerste testobject.
- [x] Contact sheet route vergeleken met losse view generations.
- [x] Reference route meetpunten vastgelegd.
- [x] Prompttemplate aanbevolen voor reference views.
- [x] TRELLIS.2 single-view spike uitgevoerd.
- [x] Primitive proxy route vergeleken als fallback.
- [x] Reconstruction route meetpunten vastgelegd.
- [x] Qwen/final image route beoordeeld met beauty preview + source reference + preservation policy.
- [x] Advies gegeven voor Fase 1 defaults.
- [x] Acceptatiechecklist ingevuld met testresultaten.
- [x] Object-mask/protected-region strategy getest.
- [x] Scoringmodel voorgesteld.
- [x] Fidelity Mode criteria uitgewerkt.
- [x] Providerkosten en latency vergeleken per productcategorie.
- [x] Modelrouter-aanbeveling uitgesteld tot voldoende meetdata.

## Nu Oppakken

- [x] Grijze-fles kleurverschuiving analyseren: waarom Qwen/balanced van grijs naar wit gaat.
- [x] Prompt- en provideradvies schrijven voor kleurbehoud: strict/balanced/creative, source ref, canonical refs, mask, denoise/guidance.
- [x] Testmatrix voorstellen voor final-render fidelity: grijs, zwart, wit, verzadigde kleur, glans, tekst/logo.
- [x] Multiview reconstruction benchmark opnieuw plannen zodra providerroute bewezen of beschikbaar is.
- [x] Multi-pass final render testen/advies uitbreiden met beauty, depth, normals, object-mask, source image en canonical references.
- [x] Beslisregel schrijven: wanneer Fidelity Mode meerdere echte foto's vereist.

## Wacht Op

- [ ] Claude: final render contract met source/canonical refs of technische beperking.
- [ ] ChatGPT/Codex: UI-smoke/fidelity flow en screenshots voor vergelijking.

## Validatie

- [x] Fase 1 benchmarkdocumenten bevatten assets, latency, kosten, beperkingen en advies.
- [x] Providerkeuzes blijven adapter-gebaseerd.
- [x] Kleur/fidelity advies toegevoegd aan `docs/build/final-render-router-spec.md` of apart benchmarkdocument.
