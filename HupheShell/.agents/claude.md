# Claude Agent - 3D/2D Product Studio Backend En Integratie

Projectroot:
`/Users/tom.zwarts/HupheAI/HupheShell`

Bron van waarheid:
`docs/comfy/HupheAI-Universal-Product-Studio-Masterdocument-v1_0.md`

Coordinatiebord:
`.agents/sprint_3D-2D-studio.md`

## Rol

Claude pakt backend, Supabase, storage, IPC/API-contracten, provideradapters, jobs, versioning, security en finale integratiechecks op.

Primair werkgebied:

- Supabase schema, migrations en RLS
- main-process IPC/API routes
- provideradaptercontracten
- assetopslag, jobqueue, logs en versiebeheer
- finale security- en integratiecheck

Niet doen:

- Geen renderer-UI refactor uitvoeren die al bij ChatGPT/Codex ligt.
- Geen provideronderzoek overnemen dat bij Gemini ligt, behalve integratie-impact.
- Geen API-sleutels naar renderer lekken.

## Samenwerkingsprotocol

- Lees voor start het masterdocument, `.agents/sprint_3D-2D-studio.md`, `.agents/chatgpt.md` en `.agents/gemini.md`.
- Werk alleen aan taken uit dit document of het sprintbord.
- Zet actieve taken op `[~]`, afgeronde taken op `[x]` en noteer kort wat is aangepast.
- Check de andere agentdocumenten tijdens lang werk.
- Jij doet de finale integratie- en securitycheck als de sprint klaar staat.

## Taken

### Fase 0 - Backend Spikes

- [ ] Bestaande opslag-, project- en AI-jobstructuur auditen op hergebruik voor Product Studio.
- [ ] Conceptueel datamodel uit het masterdocument vertalen naar concrete tabellen of local-first opslagkeuze.
- [ ] Assetopslag ontwerpen voor origineel, maskers, normalized image, thumbnails, GLB, renderpasses en finals.
- [ ] Jobmodel ontwerpen voor reference generation, reconstruction, render packet en final render.
- [ ] Providerlog en kostenregistratie ontwerpen.
- [ ] Bevestigen hoe hervatbare externe taken werken na app restart of providerfout.

### Fase 1 - Verticale Basisflow

- [ ] Product project create/read/update contract bouwen.
- [ ] Uploadroute maken met validatie, metadata, checksum en thumbnail.
- [ ] Input normalisatie contract maken: EXIF, kleurprofiel, objectmasker en bounding box.
- [ ] ReferenceViewService adaptercontract implementeren.
- [ ] CanonicalReferenceService met approval-statussen en immutable setversies implementeren.
- [ ] ReconstructionService adaptercontract implementeren voor single-view TRELLIS.2 route.
- [ ] GLB/GLTF assetresultaten opslaan met provider, modelversie, seed, instellingen en logs.
- [ ] StudioSceneService opslag voor camera, licht, scene en actieve reconstructieversie maken.
- [ ] RenderPacketService contract maken voor beauty, mask, depth, normals en metadata.
- [ ] FinalRenderService contract maken met preservation policy en outputopslag.
- [ ] PNG export/download route veilig aansluiten.

### Security En Compliance

- [ ] API-sleutels server-side houden.
- [ ] RLS of lokale permissiegrenzen controleren voor alle Product Studio assets.
- [ ] Providerfouten projectdata niet laten verliezen.
- [ ] Alle final renders herleidbaar maken naar reference set, reconstruction, studio scene en render packet.
- [ ] Geen base64 in productieopslag behalve tijdelijk tussenformaat.

## Wacht Op

- [ ] WAIT op Gemini: definitieve providerkeuze voor spikes en eerste MVP-route.
- [ ] WAIT op ChatGPT/Codex: UI-contractbehoeftes voor review, studio en final render.

## Validatie

- [ ] `npm run build`.
- [ ] Securitycheck waar relevant.
- [ ] Foutenpad testen: provider failure, upload failure, job retry en rollback.
