# ChatGPT Smart App - Auto Mode en Dummy-Proof Atelier

## Doel

HupheAI moet slimmer worden zonder dat de gebruiker slimmer hoeft te worden.

De gebruiker moet niet hoeven weten welk model goed is voor tekst, welk model beeld kan bewerken, welk model video kan maken, of wanneer een mask-edit beter is dan een gewone image-edit. De app moet dat kunnen afleiden uit context, intentie en het soort asset waar de gebruiker mee werkt.

Deze notitie beschrijft:

- een `Auto` toggle voor model- en workflowkeuze;
- hoe de app automatisch de juiste AI-route kiest;
- hoe handmatige controle blijft bestaan;
- hoe de app op de achtergrond designkennis kan opbouwen;
- waar Atelier slimmer en meer dummy-proof kan worden.

Dit document is alleen analyse en richting. Er wordt hiermee nog niets gebouwd.

## Kernidee

Elke maakmodus krijgt twee standen:

```text
Auto: aan
De app kiest zelf model, promptstrategie en workflow.

Auto: uit
De gebruiker kiest zelf model, instellingen en specifieke route.
```

Auto is de standaard voor normale gebruikers. Handmatig is voor power users, admins, debugging en experimenten.

## Waarom Dit Nodig Is

De app heeft inmiddels meerdere slimme onderdelen:

- modulegebonden modellen in admin;
- persoonlijke OpenRouter-modellen in instellingen;
- aparte flows voor presentaties, banners, print/media, afbeeldingen en video;
- image generation, image editing, mask editing en image-to-video;
- promptbars met context;
- asset library en projectgeschiedenis;
- templates, mappings en preflight/validatie;
- lokaal visionmodel voor analyse;
- AI-gestuurde banner en print generatie.

Maar voor de gebruiker voelt dat pas echt slim als ze niet hoeven kiezen uit al die technische opties.

Het gewenste gevoel:

> Ik zeg wat ik wil. Huphe snapt welke klus het is, kiest de juiste route, laat mij alleen belangrijke keuzes maken, en levert snel iets goeds op.

## Auto Mode

### Plaats in de UI

Auto hoort zichtbaar maar rustig in de promptbar of naast de modelknop:

```text
[ Auto aan ] [ modelicoon ] [ verzenden ]
```

Als Auto aan staat:

- modelpicker wordt secundair;
- de app toont eventueel klein welke route gekozen wordt;
- gebruiker hoeft niet eerst een model te kiezen.

Als Auto uit staat:

- modelpicker wordt actief;
- gebruiker kiest module/model zelf;
- geavanceerde instellingen kunnen zichtbaar worden.

### Gedrag

Auto bepaalt minimaal:

- taaktype: genereren, bewerken, mask-edit, upscale, outpaint, image-to-video, tekst, layout, export, analyse;
- modaliteit: tekst, beeld, video, HTML/design, presentatie;
- invoercontext: leeg canvas, bestaande afbeelding, masker, video-startbeeld, template, brand asset;
- beste modelroute;
- prompttemplate;
- fallback als het gekozen model faalt;
- kosten/kwaliteit/snelheid-profiel.

### Voorbeelden

#### Nieuwe afbeelding

Gebruiker typt:

```text
Maak een hero image van een elektrische fiets in Amsterdam, premium en zonnig.
```

Auto kiest:

- taak: image generation;
- route: image model;
- prompttemplate: `generate`;
- model: beste admin-goedgekeurde beeldgenerator;
- output: afbeelding;
- vervolgacties: download, fullscreen, bewerken, maak video.

#### Bestaande afbeelding bewerken

Gebruiker heeft een afbeelding geselecteerd en typt:

```text
Maak het logo op de borst een H.
```

Auto kiest:

- taak: image edit;
- route: image-to-image of vision+image model;
- prompttemplate: `edit`;
- referentieafbeelding meesturen;
- model dat goed is in behoud van compositie en lokale edits.

#### Masker actief

Gebruiker tekent een masker en typt:

```text
Verwijder dit object.
```

Auto kiest:

- taak: masked image edit;
- route: inpainting;
- prompttemplate: `mask-edit`;
- model dat masking/inpainting ondersteunt;
- strikte instructie: alleen gemarkeerd gebied aanpassen.

#### Afbeelding naar video

Gebruiker klikt `Maak video` op een afbeelding en typt:

```text
Laat de camera langzaam naar voren bewegen terwijl het glas breekt.
```

Auto kiest:

- taak: image-to-video;
- startbeeld: huidige afbeelding;
- model: beste video/image-to-video model;
- prompttemplate: motion/camera prompt;
- output: video.

#### Print of banner

Gebruiker typt:

```text
Maak een LinkedIn campagne voor deze fiets.
```

Auto kiest:

- taak: campaign/design generation;
- route: HTML/CSS design agent;
- formaat: LinkedIn default suggesties;
- model: sterke multimodale tekst/design model;
- extra: brand/context analyse als er assets gekoppeld zijn.

## Modelrouter

Auto heeft een centrale modelrouter nodig.

### Input

De router krijgt:

- `module`: presentation, banners, print, images, video;
- `intent`: generate, edit, mask-edit, upscale, image-to-video, layout, copy, review;
- `assets`: selected image, selected video, mask, brand assets, template;
- `userPreference`: quality, fast, cheap, local;
- `adminPolicy`: welke modellen mogen per module;
- `availability`: API keys, OpenRouter status, Ollama status;
- `budget`: credits of bedrijfsbudget;
- `history`: wat werkte eerder goed in deze workspace.

### Output

De router geeft terug:

- model-id;
- provider;
- prompttemplate;
- fallbackmodel;
- verwachte kosten;
- verwachte duur;
- reden in mensentaal.

Voorbeeld:

```json
{
  "route": "image.mask_edit",
  "model": "black-forest-labs/flux-1.1-pro",
  "fallback": "nanobanana/nano-banana-pro",
  "reason": "Er is een masker actief en een bestaande afbeelding geselecteerd.",
  "qualityMode": "best"
}
```

### Admin

Admin moet kunnen instellen:

- welke modellen beschikbaar zijn per module;
- welk model de standaard is voor Auto per taaktype;
- fallbackvolgorde;
- maximumkosten per generatie;
- of gebruikers eigen OpenRouter-modellen mogen toevoegen;
- of Auto persoonlijke modellen mag gebruiken;
- of lokale modellen voor analyse gebruikt mogen worden.

### Gebruiker

Gebruiker moet kunnen instellen:

- Auto aan/uit;
- voorkeur: beste kwaliteit, snel, goedkoop, lokaal indien mogelijk;
- eigen favoriete modellen;
- waarschuwing bij dure modellen;
- nooit automatisch video genereren zonder bevestiging, als kosten hoog zijn.

## Auto Moet Uitlegbaar Zijn

Auto mag niet voelen als magie die soms willekeurig faalt. De app moet subtiel kunnen tonen:

```text
Auto koos Image Edit omdat je een bestaande afbeelding bewerkt.
Model: Nano Banana Pro
Waarom: beste voor lokale beeldbewerking volgens adminconfig.
```

Dit kan klein in de modeldropdown of via hover op de Auto toggle.

## Achtergrondleren Van Design Online

De wens:

> De app leert op de achtergrond van design dingen online en wordt daar beter van.

Belangrijk: dit moet zorgvuldig ontworpen worden. Niet stilletjes auteursrechtelijk of privacygevoelig materiaal scrapen en er modeltraining op doen.

### Veilige Interpretatie

Maak een `Design Intelligence Layer`, geen onzichtbare modeltraining.

Die laag kan:

- trends verzamelen uit toegestane bronnen;
- designpatronen samenvatten;
- kleurpaletten, layoutprincipes en typografische keuzes indexeren;
- voorbeelden citeren of linken waar toegestaan;
- inzichten opslaan als compacte regels, niet als kopieën van complete designs;
- gebruikers- en bedrijfsdata gescheiden houden;
- opt-in zijn voor online research.

### Bronnen

Mogelijke bronnen:

- eigen goedgekeurde projecten;
- eigen brand libraries;
- publieke designartikelen;
- officiële brand guidelines waar een klant toestemming voor geeft;
- sites met expliciet toegestane inspiratie of metadata;
- eigen templatebibliotheek;
- performance-data uit campagnes, als beschikbaar en toegestaan.

### Wat De App Leert

Niet:

- "kopieer deze Dribbble-shot";
- "train op alle designs van het internet";
- "gebruik klantassets van bedrijf A voor bedrijf B".

Wel:

- "voor premium mobility werken vaak rustige achtergronden, product close-ups, lage hoeveelheid tekst";
- "CTA onderin rechts presteert op 1:1 social vaak beter dan linksboven";
- "bij donkere tech-visuals moet contrast van bodycopy boven WCAG minimum blijven";
- "LinkedIn carousels hebben baat bij grote hoofdstuktitels en weinig bodycopy".

### Architectuur

De Design Intelligence Layer kan bestaan uit:

- `Trend Harvester`: haalt toegestane bronnen op;
- `Design Summarizer`: maakt compacte observaties;
- `Pattern Store`: bewaart patronen, tags en voorbeelden;
- `Brand Brain`: combineert trends met klantstijl;
- `Design Critic`: beoordeelt output op contrast, hierarchy, spacing, brandfit;
- `Auto Router Feedback`: leert welke modelroute goed werkte voor welke klus.

### Privacy En Controle

Moet standaard helder zijn:

- online leren staat uit of beperkt aan bij gevoelige workspaces;
- admin kan het per bedrijf uitzetten;
- gebruiker ziet welke bronnen gebruikt worden;
- geen privéprojecten gebruiken voor algemene training zonder expliciete toestemming;
- verwijderbare cache;
- auditlog voor externe research.

## Slimmer Maken Van De Huidige App

Onderstaande bevindingen zijn gebaseerd op de huidige appstructuur: Atelier, media-editor, promptbars, moduleconfig, admin, settings, templates, asset library en flows voor presentation/banner/print/images/video.

## Bevindingen Per Workflow

### 1. Promptbar Als Centrale Besturing

De promptbar is nu de juiste plek voor natuurlijke taal, maar hij kan slimmer worden met intent-detectie.

Aanbevelingen:

- detecteer automatisch of de prompt gaat over genereren, bewerken, vervangen, verwijderen, uitbreiden, video maken of exporteren;
- toon korte "Auto actie" feedback voor verzenden;
- maak follow-up suggesties direct onder de promptbar;
- laat promptbar niet alleen tekst ontvangen, maar ook contextchips: afbeelding, masker, formaat, brand, template.

Voorbeeld:

```text
Prompt: "Maak hiervan een korte video met langzame camera push-in"
Auto actie: Image-to-video
Startbeeld: huidige afbeelding
Model: beste video model
```

### 2. Minder Moduswissels

Gebruikers moeten niet hoeven begrijpen dat ze in afbeeldingen, video, print of banner zitten. De app kan vaker zelf springen.

Aanbevelingen:

- als gebruiker op afbeelding typt "maak video", schakel naar video;
- als gebruiker in video een afbeelding uploadt, behandel die als startframe;
- als gebruiker "maak banner" typt vanuit een afbeelding, start bannerflow met afbeelding gekoppeld;
- als gebruiker "maak presentatie hiervan" typt, start presentatieflow met asset als bron.

### 3. Resultaatgericht In Plaats Van Toolgericht

De toolbar is nuttig, maar voor niet-designers zijn "masker", "upscale", "variation" nog technische begrippen.

Aanbevelingen:

- voeg quick actions toe naast het beeld:
  - Verwijder object;
  - Vervang achtergrond;
  - Maak scherper;
  - Maak video;
  - Maak advertentie;
  - Maak variaties;
- laat Auto de technische tool kiezen;
- hou de toolbar voor handmatige controle.

### 4. Betere Eerste Output

Dummy-proof betekent dat de eerste output al vaak goed moet zijn.

Aanbevelingen:

- vraag alleen ontbrekende informatie als het echt nodig is;
- gebruik standaard kwaliteitsprofielen per module;
- voeg brand/context automatisch toe als beschikbaar;
- gebruik template/context automatisch bij presentatie en banner;
- geef AI een design brief voordat het ontwerp maakt;
- gebruik een design critic na generatie voor automatische kleine correcties.

### 5. Eén-Klik Verbeteren

Na een generatie moeten de beste vervolgstappen zichtbaar zijn.

Aanbevelingen per image:

- Maak beter;
- Maak 4 variaties;
- Bewerk geselecteerd gebied;
- Maak video;
- Gebruik in banner;
- Gebruik in presentatie.

Aanbevelingen per banner/print:

- Maak premiumer;
- Meer contrast;
- Kortere tekst;
- Maak mobiel beter leesbaar;
- Genereer formaten;
- Exporteer.

### 6. Slimme Modelkeuze Per Taak

De huidige module-modelconfig is een goed begin, maar Auto moet fijner routeren dan alleen module.

Nodige taaktypes:

- text.copy;
- text.strategy;
- design.html;
- design.review;
- image.generate;
- image.edit;
- image.mask_edit;
- image.upscale;
- image.outpaint;
- video.text_to_video;
- video.image_to_video;
- video.extend;
- presentation.plan;
- presentation.rewrite;
- presentation.visuals;

Elk taaktype krijgt:

- preferred model;
- fallback;
- kostenprofiel;
- kwaliteitsprofiel;
- prompttemplate.

### 7. Automatische Preflight Voor Alles

De app kan voor export of save automatisch checken:

- tekst te klein;
- contrast te laag;
- beeldresolutie te laag;
- logo te dicht op rand;
- CTA ontbreekt;
- formaat klopt niet;
- afbeelding past niet bij brand;
- video heeft geen duidelijke beweging;
- presentatie heeft lege slides.

Dit moet niet als foutlijst voelen, maar als:

```text
3 dingen automatisch verbeterd
1 ding wil je misschien checken
```

### 8. Slimme Defaults

Veel keuzes kunnen verdwijnen als defaults goed zijn.

Aanbevelingen:

- default Auto aan;
- default beste model per taak;
- default veilige aspect ratios;
- default prompttemplates per context;
- default brandstijl als project/bedrijf bekend is;
- default exportformaat per module;
- default "ask before expensive generation".

### 9. Contextgeheugen

De app moet onthouden:

- welke stijl gebruiker vaak kiest;
- welke modellen goed werkten;
- welke formats vaak worden geëxporteerd;
- welke klant/brand actief is;
- welke correcties vaak terugkomen;
- welke generatie door gebruiker werd opgeslagen of verwijderd.

Belangrijk: dit moet transparant en uitschakelbaar zijn.

### 10. Feedback Signalen

De app kan leren van gedrag zonder extra vragen:

- opgeslagen = goed signaal;
- verwijderd = slecht signaal;
- opnieuw gegenereerd met bijna dezelfde prompt = vorige output was niet goed genoeg;
- handmatige correctie op tekst/contrast = leerpunt;
- export na generatie = sterk positief signaal;
- fullscreen bekijken maar niet opslaan = neutraal;
- image-to-video vanuit beeld = intent match.

Deze signalen kunnen helpen bij Auto routing en suggesties.

## Dummy-Proof UX Voorstellen

### Smart Start

Eerste scherm moet vragen:

```text
Wat wil je maken?
```

Niet:

```text
Kies module, model, provider, template, formaat.
```

Daarna toont de app maximaal drie keuzes:

- Afbeelding;
- Video;
- Campagne/advertentie;
- Presentatie.

Of nog beter: laat de prompt bepalen en toon de gekozen route ter bevestiging.

### Smart Chips

Onder de promptbar:

- Afbeeldingen;
- Video;
- Banner;
- Presentatie;
- Brand;
- Formaat;
- Auto.

Auto kan chips automatisch zetten.

### Smart Suggestions

Na elke output:

```text
Maak 4 variaties
Maak premiumer
Gebruik als startbeeld voor video
Maak LinkedIn banner
Download
```

### Smart Undo En Safety

Voor destructieve acties:

- permanente delete bevestigen;
- oude versies herstellen;
- duidelijke "dit is permanent" tekst;
- auto-save voor projecten;
- generated assets pas echt verwijderen na bevestiging.

### Smart Review

Laat de app bij goede momenten meedenken:

```text
Deze afbeelding is sterk, maar de prompt vroeg om "premium". Ik kan hem rustiger en luxer maken.
```

Niet te veel tekst, wel concrete actieknoppen.

## Prioriteiten

### Fase 1 - Auto Toggle MVP

- Auto toggle in promptbar;
- centrale modelrouter;
- taakdetectie voor image generate/edit/mask/video;
- admin default modellen per taaktype;
- fallbackmodel;
- uitleg waarom Auto iets kiest.

### Fase 2 - Smart Actions

- quick actions bij image/video/design;
- image-to-video als standaard vervolgactie;
- variaties;
- automatisch gekozen prompttemplate;
- kosten/kwaliteit/snelheid voorkeur.

### Fase 3 - Design Critic

- automatische check na generatie;
- contrast/spacing/CTA/brandfit;
- "verbeter automatisch" knop;
- veilige preflight voor export.

### Fase 4 - Design Intelligence Layer

- opt-in online research;
- patroonopslag;
- brand-aware trends;
- workspace learning;
- audit en privacy controls.

### Fase 5 - Persoonlijke En Bedrijfsintelligentie

- gebruikersvoorkeuren;
- bedrijfsspecifiek geheugen;
- modelprestatie per taak;
- automatische workflowaanbevelingen;
- cross-module intelligence.

## Belangrijke Productregels

1. Auto mag nooit controle wegnemen; Auto mag keuzes verbergen totdat ze nodig zijn.
2. Geavanceerde instellingen blijven beschikbaar, maar niet op de hoofdrroute.
3. De app moet uitleggen waarom een model of route gekozen is.
4. Dure acties vragen bevestiging of tonen credits vooraf.
5. Online leren moet opt-in, transparant en privacyveilig zijn.
6. Design learning moet patronen leren, geen werk kopiëren.
7. Elke AI-output krijgt direct zinvolle vervolgstappen.
8. De beste workflow is meestal: prompt -> goede output -> 1 klik verbeteren -> export.

## Open Vragen

- Moet Auto per gebruiker of per workspace standaard aan staan?
- Wie bepaalt "beste model": admin, Huphe defaults, of live prestatiemeting?
- Mag Auto persoonlijke OpenRouter-modellen gebruiken of alleen admin-goedgekeurde modellen?
- Hoe streng moet de app zijn bij dure video-acties?
- Welke online designbronnen zijn toegestaan?
- Hoe bewaren we designpatronen zonder auteursrechtelijk materiaal te kopiëren?
- Hoe maken we zichtbaar dat de app leert, zonder gebruikers bang te maken?

## Korte Conclusie

HupheAI wordt pas echt slim als de gebruiker niet meer hoeft te denken in modellen, providers en tools.

De app moet denken in klussen:

- maak afbeelding;
- bewerk dit;
- verander alleen dit gebied;
- maak video van dit beeld;
- maak campagne;
- maak presentatie;
- verbeter ontwerp;
- exporteer veilig.

De `Auto` toggle is de brug tussen krachtige AI-infrastructuur en een dummy-proof ervaring. De Design Intelligence Layer maakt de app op termijn steeds beter, maar moet zorgvuldig, transparant en opt-in worden ontworpen.

