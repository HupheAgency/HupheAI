# Claude Agent - Basic Product + Polish Backend

Projectroot:
`/Users/tom.zwarts/HupheAI/HupheShell`

Actieve fix-sprint:
`.agents/sprint-fix-3d-to-2d.md`

## Rol

Claude pakt backend, Supabase, storage, IPC/API-contracten, provideradapters, jobs, versioning, security en provider run metadata.

Primair werkgebied:

- `src/main/product-studio-ipc.ts`
- `src/preload/index.ts`
- Supabase migrations/RLS/storage indien schema-aanpassing nodig is
- Supabase Edge Functions/provider proxies indien nodig

Niet doen:

- Geen renderer-UI refactors die bij ChatGPT/Codex liggen.
- Geen API-sleutels naar renderer lekken.
- Geen nieuwe providerkeuze-spike tenzij de bestaande OpenRouter/Gemini route faalt.

## Nu Oppakken

- [x] `product-studio:normalize-input` uitbreiden met Basic Product generatie. → Stap 4 in normalize-input genereert grijze variant via Gemini Flash Image.
- [x] Basic Product opslaan als `source_assets.type = 'basic-product'`. → DB constraints uitgebreid, provenance='inferred'.
- [x] Basic Product signed URL meenemen in `get-latest-state`. → Komt automatisch mee via sourceAssets array (type='basic-product').
- [x] Reference generation en reconstruction input gescheiden. → Renderer stuurt Bron/ref-look voor views en Basic Product voor reconstruction/mesh.
- [x] Linker/rechter reference-view prompts aangescherpt. → Links/rechts hebben nu expliciete rotatierichting en anti-mirror instructies.
- [x] Backend canonical-view uniqueness guard. → Generate/approve supersedet andere draft/active views met dezelfde hoek.
- [x] Backend guard op TRELLIS input. → Reconstructie zoekt zelf `source_assets.type = 'basic-product'` en weigert als die ontbreekt.
- [x] Scene-pass prompt gebruikt perspective lock. → Achtergrond volgt 3D camera/ruimte; staan/zweven/hangen blijft afhankelijk van de user prompt.
- [x] Originele source image blijven gebruiken als productidentiteit/material reference.
- [x] `product-studio:generate-final-render` splitsen in scene pass + polish pass. → Scene pass maakt omgeving rond grijs product, polish pass vervangt productgebied met echte materialen via source/mask.
- [x] Scene pass: Beauty/grijze vorm gebruiken voor omgeving, zonder productprint te verzinnen.
- [x] Scene pass output opslaan als intermediate asset of metadata. → `scene_{runId}.png` in storage + `scene_url` in provider_runs.metadata.
- [x] Polish pass: scene image + object mask + source/canonical refs gebruiken; alleen gemaskeerd productgebied aanpassen.
- [x] Provider run metadata uitbreiden met `basic_product_url`, `scene_url`, `polish_inputs`. → `metadata` JSONB kolom toegevoegd aan `provider_runs`.
- [x] Retry-route dezelfde scene + polish stappen laten gebruiken. → `retry-provider-run` final-render branch herschreven met scene + polish flow.
- [x] Repo-migration controleren/toevoegen. → `20260622000000_basic_product_and_metadata.sql` toegevoegd.
- [x] Begrijpelijke errors toevoegen: basic ontbreekt, mask ontbreekt, scene faalt, polish faalt.
- [x] Build-validatie na retry/migration afronding. → `npm run build` groen.

## Wacht Op ChatGPT/Codex

- [x] UI toont Basic Product zodra `get-latest-state` dit teruggeeft.
- [x] UI toont Scene intermediate zodra backend dit exposeert.
- [x] UI-copy legt twee-laags flow uit aan gebruiker.

## Acceptatie Voor Claude

- [ ] Complex source product kan een grijze basic variant opleveren.
- [ ] Basic Product wordt persistent opgeslagen en teruggegeven aan renderer.
- [ ] Final render route maakt aantoonbaar eerst Scene en daarna Polish.
- [ ] Buiten objectmask blijft Scene in Polish pass behouden.
- [x] Retry gebruikt dezelfde providerroute en metadata.
