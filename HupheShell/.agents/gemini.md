# Gemini Agent - 3D/2D Product Studio Onderzoek En Specificaties

Projectroot:
`/Users/tom.zwarts/HupheAI/HupheShell`

Bron van waarheid:
`docs/comfy/HupheAI-Universal-Product-Studio-Masterdocument-v1_0.md`

Coordinatiebord:
`.agents/sprint_3D-2D-studio.md`

## Rol

Gemini pakt onderzoek, technische keuzes, providervergelijkingen, datacontracten en handoff-specificaties op.

Primair werkgebied:

- `docs/build/`
- technische beslisdocumenten
- providervergelijkingen
- pure TypeScript interfaces of voorbeeldhelpers als handoff

Niet doen:

- Geen renderer-UI refactors.
- Geen Supabase deploys of migrations uitvoeren.
- Geen providerkeuze als definitief markeren zonder meetbare spike-resultaten.

## Samenwerkingsprotocol

- Lees voor start het masterdocument, `.agents/sprint_3D-2D-studio.md`, `.agents/chatgpt.md` en `.agents/claude.md`.
- Werk alleen aan taken uit dit document of het sprintbord.
- Zet actieve taken op `[~]`, afgeronde taken op `[x]` en noteer kort wat is opgeleverd.
- Maak handoffs concreet genoeg dat ChatGPT/Codex en Claude ze zonder opnieuw uitzoeken kunnen uitvoeren.

## Taken

### Fase 0 - Onderzoek En Spikes

- [ ] `product-studio-provider-spikes.md` maken: Gemini-turnaround, contact sheet split, TRELLIS.2 single-view, multiview-route, GLB-load, renderpasses en final image provider.
- [ ] `reference-view-generation-contract.md` maken met input, output, provenance, statuses en failure cases.
- [ ] `contact-sheet-splitting-plan.md` maken met detectie, cropregels, confidence en fallback naar losse generations.
- [ ] `reconstruction-provider-comparison.md` maken: TRELLIS.2 single-view versus multiview-route versus primitive proxy.
- [ ] `threejs-studio-renderpacket-spec.md` maken: beauty, mask, depth, normals, camera, lighting en scene metadata.
- [ ] `final-render-router-spec.md` maken: providerinput, preservation policies, protected regions en outputmetadata.
- [ ] `product-studio-acceptance-checklist.md` maken voor het geslaagde prototype uit hoofdstuk 21.

### Datamodel En Contracten

- [ ] Interfaces uitschrijven voor ProductProject, ProductSourceAsset, ReferenceView, CanonicalReferenceSet, ReconstructionVersion, StudioSceneVersion, RenderPacketVersion en FinalRenderVersion.
- [ ] Statusmodel uitwerken voor observed, inferred, user-approved, user-edited, rejected en failed.
- [ ] Immutable versioningregels vastleggen.
- [ ] Rollback- en failure-routes specificeren.

### Eerste Testcategorie

- [ ] Testobjectcriteria vertalen naar praktische testdata: matte rechthoekige verpakking, neutrale achtergrond, geen kleine tekst, geen transparantie.
- [ ] Meetcriteria definiëren: consistentie, silhouet, logo/text behoud, kosten, latency en menselijk acceptatiepercentage.

## Wacht Op

- [ ] WAIT op Claude: bestaande backend- en storage-audit.
- [ ] WAIT op ChatGPT/Codex: UI-behoeftes die extra contractvelden vereisen.

## Handoff Verwachting

- [ ] Elk document bevat een duidelijke aanbeveling, risico's, acceptatiecriteria en beslismoment.
- [ ] Providerkeuzes blijven adapter-gebaseerd en modelonafhankelijk.
- [ ] Open experimenten krijgen meetbare uitkomsten, geen losse brainstormnotities.
