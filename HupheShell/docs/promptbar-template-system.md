# Ingebouwde Presentatietemplates — Onderzoek en bouwplan

Doel: Atelier krijgt naast eigen geuploade Keynote-templates ook vijf standaard Huphe templates die direct in de app zitten. Deze standaard templates zijn eerst HTML-first en worden later eventueel ook als Keynote-template nagebouwd.

## Korte conclusie

Templates moeten niet via de promptbar worden gekozen. De promptbar is er om de inhoud van je presentatie te bespreken, aan te scherpen en te laten genereren. Templates zijn gewoon beschikbaar in de templatekeuze, naast je eigen uploads.

Het gewenste model:

- **Mijn templates**: bestaande `.key` uploads zoals Roorda, met sageTags, mappings en Keynote-export.
- **Huphe templates**: vijf ingebouwde HTML-presentatietemplates die lokaal met de app meekomen.
- **Promptbar**: gesprek over onderwerp, structuur, copy, toon, slides en beeldideeën.
- **Template selector**: plek waar je kiest welke visuele basis je gebruikt.

Dit is simpeler, logischer en veiliger dan templates via prompt-intentie laten zoeken.

## Wat er nu al in Huphe zit

### Bestaande Keynote-flow

- `.key` templates uploaden via Instellingen.
- Template-data wordt opgeslagen in Supabase `templates`.
- Mappings worden opgeslagen in `template_mappings`.
- `TemplateValidationPanel` controleert layouts, tekstvelden en image-slots.
- `WebSlidePreview` rendert slides in de editor.
- Keynote-export gebruikt `deck:generate-structured` en vult de gekozen `.key`.

Deze flow moet blijven werken en mag niet breken.

### Bestaande prompt-flow

- `atelier-intent.ts` herkent presentatie, onderwerp, stijl en aantallen.
- `atelier-creative-plan.ts` bouwt een slideplan.
- `SlideEditorPage.tsx` zet dat om naar blocks en opent de editor.

Deze flow moet inhoud blijven maken, maar geen templatebeheer worden.

## Gewenste UX

### Start van een presentatie

De gebruiker kiest:

1. een eigen Keynote-template, bijvoorbeeld Roorda;
2. of een ingebouwde Huphe-template.

Daarna gebruikt de gebruiker de promptbar voor:

- “Ik wil een pitchdeck over dit concept.”
- “Maak het scherper en minder corporate.”
- “Voeg een slide toe over risico’s.”
- “Maak de titel sterker.”
- “Gebruik meer visuele slides.”

De template staat vast als visuele basis, tenzij de gebruiker expliciet via de UI een ander template kiest.

### Template selector

De selector krijgt twee duidelijke groepen:

- **Huphe templates**
- **Mijn templates**

Elke templatekaart toont:

- naam;
- thumbnail;
- korte beschrijving;
- aantal layouts;
- type badge: `HTML` of `Keynote`;
- exportstatus: `PDF/HTML`, `Keynote klaar`, of `Keynote later`.

## De vijf standaard templates

MVP: vijf HTML-first templates met eigen sfeer en voldoende layoutvariatie.

### 1. Studio Minimal

Rustig, premium, veel witruimte, sterke typografie.

Layouts:

- cover;
- section;
- title + body;
- image + caption;
- quote;
- closing.

Geschikt voor: strategie, interne updates, conceptpresentaties.

### 2. Editorial Pitch

Magazine-achtig, grote koppen, beeldgedreven, uitgesproken composities.

Layouts:

- cinematic cover;
- big statement;
- split image/text;
- problem/solution;
- data highlight;
- closing CTA.

Geschikt voor: pitches, creatieve voorstellen, campagnes.

### 3. Sharp Sales

Zakelijk, compact, duidelijk, gericht op besluitvorming.

Layouts:

- cover;
- agenda;
- KPI/data;
- comparison;
- timeline;
- next steps.

Geschikt voor: sales updates, kwartaaldecks, managementpresentaties.

### 4. Dark Signal

Donker, high-contrast, tech/AI uitstraling zonder generiek dashboardgevoel.

Layouts:

- hero;
- insight;
- architecture/process;
- metric;
- visual;
- closing.

Geschikt voor: AI, software, productvisie, innovatie.

### 5. Warm Narrative

Menselijk, zacht, verhaalgedreven, geschikt voor training en storytelling.

Layouts:

- cover;
- story beat;
- lesson;
- quote;
- image moment;
- recap.

Geschikt voor: training, workshops, onboarding, narratieve decks.

## Technisch model

### HTML-template schema

De ingebouwde templates krijgen een eigen lokaal schema. Ze hoeven niet direct in Supabase te staan.

```ts
export interface BuiltInPresentationTemplate {
  id: string
  name: string
  description: string
  category: string
  thumbnail: string
  engine: 'html'
  keynoteExport: 'unavailable' | 'planned' | 'available'
  slideWidth: number
  slideHeight: number
  layouts: BuiltInPresentationLayout[]
}

export interface BuiltInPresentationLayout {
  id: string
  name: string
  intent: 'cover' | 'section' | 'story' | 'visual' | 'quote' | 'data' | 'closing'
  fields: Array<{
    key: string
    role: 'heading' | 'body' | 'caption' | 'quote' | 'metric' | 'image'
    required?: boolean
    maxChars?: number
  }>
}
```

De daadwerkelijke render kan in fase 1 via React-components. Belangrijk is vooral dat layouts en velden expliciet zijn.

### Relatie met bestaande `TemplateData`

Er zijn twee opties:

1. HTML-templates converteren naar een `TemplateData`-achtige vorm zodat `SlideEditorPage` ze bijna hetzelfde behandelt.
2. Een aparte `templateKind: 'keynote' | 'html'` toevoegen en render/export daarop laten schakelen.

Aanbevolen: optie 2. Dat voorkomt dat we HTML-templates kunstmatig door het Keynote/sageTag-model persen.

### Projectdata uitbreiden

Bestaande projecten blijven werken met:

- `templateClientId`
- `templateData`

Nieuwe HTML-template projecten krijgen daarnaast of in plaats daarvan:

- `templateKind: 'html'`
- `builtInTemplateId`

Voor backward compatibility:

- als `templateKind` ontbreekt: behandel als bestaande Keynote-template;
- als `builtInTemplateId` ontbreekt: bestaande flow gebruiken.

## Exportgedrag

### Keynote-template

Blijft zoals nu:

- Keynote-export beschikbaar;
- PDF-export beschikbaar;
- HTML-preview beschikbaar.

### Built-in HTML-template

MVP:

- HTML-preview/editor beschikbaar;
- PDF-export beschikbaar;
- Keynote-export toont `later` of disabled status.

Later:

- per ingebouwde HTML-template een Keynote-equivalent maken;
- mapping tussen HTML-layout intent en Keynote-layout;
- daarna Keynote-export vrijgeven.

## Implementatieroute zonder bestaande flow te breken

### Fase 1 — Data en selector

- Maak `src/renderer/src/lib/builtin-presentation-templates.ts`.
- Definieer vijf templates met metadata en layouts.
- Breid template selector uit met groep `Huphe templates`.
- Laat bestaande `clientsWithTemplate` ongemoeid.
- Voeg `templateKind` en `builtInTemplateId` toe waar nodig, optioneel.

### Fase 2 — HTML render in editor

- Voeg renderer toe voor built-in layouts.
- Laat blocks dezelfde basis houden: `type`, `heading`, `body`, `fields`, `imagePath`.
- Bij HTML-template: `type` verwijst naar layout-id/name van ingebouwde template.
- Rechterpaneel blijft velden tonen op basis van layout fields.

### Fase 3 — Promptbar inhoud

- Promptbar gebruikt gekozen template alleen als context voor content:
  - beschikbare layouts;
  - slide intents;
  - maxChars;
  - beeldslots.
- Promptbar kiest niet zelf het template.
- Als er geen template gekozen is, mag de app een default Huphe-template gebruiken of eerst templatekeuze tonen.

### Fase 4 — Export en polish

- PDF-export voor HTML-templates.
- Template thumbnails.
- Nieuwe project-thumbnails.
- Later Keynote-versies per ingebouwde template.

## Belangrijkste ontwerpprincipes

- De gebruiker kiest templates visueel, niet via prompt.
- Promptbar praat over inhoud, niet over templatebeheer.
- Eigen Keynote-templates blijven first-class.
- Ingebouwde Huphe-templates zijn HTML-first en lokaal beschikbaar.
- Keynote-export voor HTML-templates komt pas als er echte Keynote-equivalenten zijn.
- Bestaande projecten en Roorda-achtige templates mogen niet worden geraakt.

## Aanbevolen MVP

- 5 ingebouwde template definities.
- Template selector met `Huphe templates` en `Mijn templates`.
- Een HTML renderer voor minimaal 5 layouttypes.
- Promptbar gebruikt het gekozen template als contentcontext.
- PDF-export beschikbaar voor HTML-templates.
- Keynote-export voor HTML-templates duidelijk gemarkeerd als later.
