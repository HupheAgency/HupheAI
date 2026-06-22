# ChatGPT / Codex Agent - Basic Product + Polish UX

Projectroot:
`/Users/tom.zwarts/HupheAI/HupheShell`

Actieve fix-sprint:
`.agents/sprint-fix-3d-to-2d.md`

## Rol

ChatGPT/Codex pakt renderer, Product Studio UX, state mapping, review-schermen en frontend-koppeling met Claude's IPC/API op.

Primair werkgebied:

- `src/renderer/src/components/ProductStudioShell.tsx`
- `src/renderer/src/lib/product-studio-types.ts`
- `src/preload/index.ts` alleen als een nieuwe IPC-call aan de renderer zichtbaar moet worden
- agentdocs en testnotities

Niet doen:

- Geen Supabase migrations/RLS.
- Geen providerkeys of server-side modelcalls in de renderer.
- Geen final providerroute in de renderer bouwen.

## Nu Oppakken

- [x] UI state uitbreiden met Basic Product asset uit `source_assets`.
- [x] Input/review UI tonen: Bron versus Basic Product.
- [x] Status toevoegen: `Basic shape ready`.
- [x] Final review voorbereiden op `Scene` tussen Beauty en Final zodra backend dit exposeert.
- [x] Scene preview uit `provider_runs.metadata.scene_url` tonen in Final.
- [x] Final prompt copy aanpassen: scene pass gebruikt grijze vorm, polish pass gebruikt ref-look.
- [x] Canonical view generation gebruikt weer de originele Bron/ref-look, niet Basic shape.
- [x] Canonical view acties vervangen door kleine icon-only knoppen.
- [x] UI dedupet canonical views per hoek en telt unieke bruikbare hoeken, nooit 5/4.
- [x] TRELLIS-knoppen blokkeren tot Basic shape klaar is; geen source fallback meer voor mesh.
- [x] Waarschuwing tonen als Basic Product ontbreekt: flow werkt dan minder betrouwbaar bij complexe prints.
- [x] Build draaien en handmatige teststappen vastleggen.

## Wacht Op Claude

- [x] `source_assets.type = 'basic-product'` wordt aangemaakt door `normalize-input`.
- [x] `get-latest-state` retourneert Basic Product asset.
- [x] Backend exposeert Scene intermediate of final render metadata zodra scene + polish route klaar is.
- [x] Claude/backend: retry-route gelijk getrokken met scene + polish route.
- [x] Claude/backend: repo-migration toegevoegd voor `basic-product`, `inferred` en `provider_runs.metadata`.

## Acceptatie Voor ChatGPT/Codex

- [x] De gebruiker ziet duidelijk: Bron, Basic Product, Beauty, Scene/Final.
- [x] De UI maakt duidelijk dat Basic Product voor mesh/vorm/positie is en Source voor views/materiaal/print.
- [x] Final render copy zegt niet meer dat depth/normal als gewone multi-image input worden gebruikt.
- [x] Oude `Multi-image route wacht op backend` tekst is vervangen door de nieuwe twee-laags uitleg.

## Validatie

- [x] `npm run build`
- [x] `npm run build` opnieuw groen na retry/migration afronding.

## Testnotities

- Upload complexe productfoto.
- Controleer dat `Product basis` Bron en Basic toont.
- Zolang Claude Basic Product nog niet genereert, toont UI `Wacht op backend` en valt de flow terug op de bronfoto als shape input.
- Zodra `source_assets.type = 'basic-product'` bestaat, gebruikt reconstructie die basic shape als input.
- Canonical views moeten altijd vanuit de originele Bron/ref-look komen, zodat de achterkant/print/materialen geleerd worden.
- Icon acties: refresh = opnieuw genereren/vervangen, x = afwijzen, vinkje = goedkeuren.
- Eén hoek is één slot. Gebruik refresh op de kaart om die hoek te vervangen.
