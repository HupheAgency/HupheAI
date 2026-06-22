# Sprint Fix 3D To 2D - Basic Product + Polish Layer

Bron van waarheid:
`docs/comfy/HupheAI-Universal-Product-Studio-Masterdocument-v1_0.md`

Gerelateerd sprintbord:
`.agents/sprint_3D-2D-studio.md`

## Doel

Maak de 3D-to-2D flow betrouwbaar voor complexe producten met prints, patronen, labels en glans.

De gebruiker uploadt een echte productfoto. De app maakt daar eerst een eenvoudige grijze productvariant van voor vorm, diepte, camera en positionering. Pas helemaal aan het einde wordt de originele productlook als polish/skin over het gemaskeerde object gelegd.

## Probleem

Bij simpele grijze objecten werkt de bestaande flow redelijk, omdat het product al weinig visuele complexiteit heeft. Bij complexe producten, zoals een Chinese porseleinen vaas met blauwe print, moet het beeldmodel tegelijk:

- compositie en camerahoek behouden;
- omgeving maken;
- productvorm behouden;
- print/materiaal/porselein correct toepassen;
- mask/depth/beauty niet semantisch door elkaar halen.

Dat levert mengvormen op: vorm verandert, print vloeit in gras, camera wordt opnieuw gekozen of het product wordt een ander object.

## Nieuwe Oplossing

We voegen twee extra lagen toe rond de bestaande pipeline.

### 1. Basic Product bij Upload

Na upload wordt naast de originele source image een neutrale productvariant gemaakt:

- exact dezelfde hoofdvorm en verhoudingen;
- geen print, logo, tekst of druk patroon;
- mat/lichtgrijs materiaal;
- duidelijke contouren;
- geschikt voor 3D reconstructie, Beauty, depth, normal en object-mask.

Deze basic product image wordt gebruikt voor reconstructie, 3D positionering en Beauty/depth/mask. De originele source image blijft leidend voor reference generation, productidentiteit, materiaal en print.

### 2. Scene Pass blijft op Grijze Beauty

De bestaande RenderPacket/Beauty flow blijft leidend:

- Beauty bepaalt camera, crop, schaal, positie en silhouet.
- Scene pass maakt omgeving/fotografie rond het grijze product.
- De prompt moet expliciet zeggen dat AI het grijze product exact moet gebruiken en nog geen print/material polish mag verzinnen.

### 3. Polish / Skin Pass aan het Eind

Na de scene pass volgt een laatste edit:

Input:

- scene image met grijs object;
- object mask;
- originele source/ref image;
- canonical views als extra productidentiteit wanneer beschikbaar.

Regel:

> Behoud de foto buiten het objectmask exact. Verander alleen het gemaskeerde object. Laat het product eruitzien als de referentiefoto, maar behoud vorm, positie, camera, schaal, crop en licht uit de scene.

Voorbeeld:

Een grijze vaas in gras wordt in de polish pass een witte Chinese porseleinen vaas met blauwe print, in exact dezelfde hoek en positie.

## Pipeline

1. User uploadt productfoto.
2. Backend maakt/checksum/mask/thumbnail zoals nu.
3. Backend maakt `basic-product` source asset.
4. UI toont Source en Basic naast elkaar.
5. Reference generation gebruikt Bron/ref-look voor print en achterkant; reconstruction gebruikt Basic als vorminput.
6. 3D Studio gebruikt grijs model/Beauty voor positionering.
7. Scene pass maakt fotorealistische setting met grijs object.
8. Polish pass gebruikt source/canonical refs + mask om alleen het object te skinnen.
9. UI toont Bron, Basic, Beauty, Scene en Final.

## Agentverdeling

### Claude - Backend / IPC / Storage

- [x] `product-studio:normalize-input` uitbreiden met Basic Product generatie.
- [x] Basic Product opslaan als `source_assets.type = 'basic-product'`.
- [x] Basic Product signed URL meenemen in `get-latest-state`.
- [x] Reference generation gebruikt de originele Bron/ref-look; reconstruction gebruikt Basic Product als primaire vorminput.
- [x] Final-render backend splitsen in scene pass + polish pass.
- [x] Scene pass output opslaan als aparte intermediate asset of metadata.
- [x] Polish pass object-mask + source/canonical refs gebruiken en alleen productgebied aanpassen.
- [x] Provider run metadata uitbreiden met `basic_product_url`, `scene_url`, `polish_inputs`.
- [x] Retry-route dezelfde scene + polish stappen laten gebruiken.
- [x] Begrijpelijke errors: basic ontbreekt, mask ontbreekt, polish faalt, scene faalt.
- [x] Repo-migration controleren/toevoegen voor `source_assets.type = 'basic-product'`, `source_assets.provenance = 'inferred'` en `provider_runs.metadata`.

### ChatGPT / Codex - Renderer / UX

- [x] UI state uitbreiden met Basic Product asset uit `source_assets`.
- [x] Input/review UI tonen: Bron versus Basic Product.
- [x] Duidelijke status toevoegen: `Basic shape ready`.
- [x] Final review uitbreiden met `Scene` tussen Beauty en Final als backend dit exposeert.
- [x] Scene preview uit provider metadata zichtbaar maken in de Final UI.
- [x] Canonical views terugzetten naar Bron/ref-look in plaats van Basic shape.
- [x] Canonical view acties compact maken met icon-only knoppen: goedkeuren, afwijzen, opnieuw genereren.
- [x] Linker/rechter canonical-view prompts aangescherpt zodat links en rechts niet als dezelfde generieke zijkant worden gegenereerd.
- [x] Eén canonical-view slot per hoek afdwingen: dubbelklikken of opnieuw genereren mag niet leiden tot 5/4 views.
- [x] TRELLIS/reconstructie hard geblokkeerd op Basic Product: geen fallback meer naar bronfoto of print-views.
- [x] Scene pass aangescherpt met perspective lock: achtergrond moet dezelfde 3D camera, horizon, vloer/grondvlakrichting, diepte en schaal volgen zonder te forceren dat het object altijd op een oppervlak staat.
- [x] Final prompt copy aanpassen: scene pass gebruikt grijze vorm, polish pass gebruikt ref-look.
- [x] Blokkade/waarschuwing tonen als Basic Product ontbreekt bij complexe producten.
- [x] Agentdocs updaten na implementatie.
- [x] Build draaien en handmatige teststappen vastleggen.

## Acceptatiecriteria

- [ ] Complexe vaasfoto krijgt een basic grijze variant zonder print.
- [ ] Basic variant behoudt hoofdvorm en verhoudingen van source.
- [ ] Canonical views behouden print/materiaal vanuit de bronfoto, niet de grijze Basic shape.
- [ ] Links en rechts zijn visueel verschillende productzijden wanneer het product asymmetrische print/details heeft.
- [ ] Canonical teller blijft maximaal 4/4; vervangen supersedet de oude hoek.
- [ ] 3D/Beauty flow gebruikt basic vorm voor positionering.
- [ ] TRELLIS krijgt alleen de grijze Basic shape als input.
- [ ] Scene pass behoudt Beauty camera/crop/schaal en verzint geen print.
- [ ] Scene pass maakt achtergrondperspectief consistent met de 3D positie van het object, ook bij staand, hangend of zwevend product.
- [ ] Polish pass verandert alleen gemaskeerd productgebied.
- [ ] Buiten het objectmask blijft de scene exact gelijk.
- [ ] Product in Final lijkt op originele source/ref image qua materiaal, kleur, print en glans.
- [x] Retry gebruikt dezelfde twee-laags route.

## Eerste Test

Gebruik de Chinese porseleinen vaas:

1. Upload source image.
2. Controleer Basic Product: grijze vaas, geen blauwe print.
3. Genereer views vanuit Bron/ref-look; controleer dat print/materiaal zichtbaar blijven op de AI-aanzichten.
4. Genereer reconstructie/mesh vanuit Basic.
5. Zet camera close-up/top-view in 3D Studio.
6. Update preview.
7. Prompt: `Zet de vaas in een park in het gras met dauwdruppels.`
8. Controleer Scene: grijze vaas in gras, juiste camera.
9. Controleer Final: porseleinen vaas met blauwe print, zelfde camera/positie.

## Besluit

Geen nieuwe ControlNet/depth-route als eerste stap. Eerst de bestaande werkende image-edit infrastructuur benutten, maar de taak opdelen:

- Bron/ref-look = views, identiteit, print, materiaal en polish-referentie.
- Basic Product = vorm, mesh en positionering.
- Scene pass = wereld/fotografie.
- Polish pass = productlook/material/print.
