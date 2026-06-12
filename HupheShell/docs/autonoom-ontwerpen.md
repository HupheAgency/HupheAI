# Autonoom Ontwerpen met AI

**Doel:** De AI in de Huphe Atelier upgraden van een "instructie-volger" naar een zelfstandig functionerende Art Director die visuele context begrijpt, ontwerpregels toepast en proactief publicatieklare resultaten levert.

**Scope:** `PrintFlow.tsx`, de `atelierChat.complete` IPC handler, en de Settings-laag voor modelconfiguratie. Dezelfde principes gelden later voor de Banner en Presentatie editor.

---

## Het kernprobleem

De huidige implementatie is een **code-executor**: de AI doet letterlijk wat de gebruiker typt. Hij ziet geen afbeelding, heeft geen designvisie, en verbetert niets wat je niet expliciet vraagt.

De oorzaak zit op drie niveaus:

1. **Geen visuele context** — hij ziet een `<img>` tag, niet de compositie van de foto. Hij weet niet waar negatieve ruimte zit, waar het onderwerp staat, wat de lichtval is.
2. **Geen designidentiteit** — "je bent een expert ontwerper" geeft geen richting. De AI valt terug op standaardgedrag: tekst gecentreerd in het midden, conservatieve font-sizes, generieke opmaak.
3. **Geen redeneerruimte** — hij genereert direct HTML zonder een compositieplan op te stellen. Modellen die eerst redeneren leveren exponentieel betere resultaten.

---

## Strategie 1 — Opinionated Design System ✅ te implementeren

In plaats van de AI volledige CSS-vrijheid te geven, geef je hem een koffer met gereedschap: CSS custom properties als design tokens die al zijn geijkt op professionele verhoudingen. Daarnaast meegeven welke HTML-structuren hij moet gebruiken zodat hij geen rommelige eigen structuren verzint.

Concreet in de system prompt:
- CSS-variabelen voor typografie: `--t-display` (120pt+), `--t-headline` (60–80pt), `--t-subhead` (28–36pt), `--t-body` (14–18pt), `--t-caption` (10–12pt)
- Ruimte-tokens op 8px-grid: `--space-xs` t/m `--space-2xl`
- Vaste HTML-blokken meegeven: `<div class="hero-block">`, `<div class="body-block">`, `<div class="logo-block">` — het model kiest uit deze structuren, verzint er geen eigen bij
- Expliciet verbod op default-centrering. Asymmetrische, editorial layouts als norm
- Compositieregels: golden ratio, leesvolgorde (headline → subkop → body → CTA → legal)

**Effect**: Elke output ziet er direct uit als een doordacht magazine of premium billboard, zonder dat de gebruiker er om vraagt.

---

## Strategie 2 — Chain of Thought: eerst nadenken, dan ontwerpen ✅ te implementeren

Door de AI eerst een designplan te laten formuleren corrigeert hij zichzelf voor hij codeert. Het `design_rationale` veld wordt toegevoegd aan het verwachte JSON-antwoord:

```json
{
  "design_rationale": "Headline links-boven in de negatieve ruimte, wit op donker. Logo rechtsonder voor visueel anker. Body klein en licht, geen overlay nodig want de foto is links al donker genoeg.",
  "html": "...",
  "message": "..."
}
```

De rationale wordt niet op het canvas getoond maar verschijnt als italic toelichting in de Chat tab, zodat de gebruiker ziet hoe de AI denkt en makkelijker kan bijsturen.

**Effect**: Betere compositie-beslissingen en transparantie over waarom iets er zo uitziet.

---

## Strategie 3 — Design Brief als Persistent Context ✅ te implementeren

Bij het openen van de editor doet de AI automatisch één analyse-call op basis van de beschikbare content (title, body, imageSrc). De uitkomst is een beknopte design brief:

- Merk en toon (premium / speels / editorial / corporate)
- Dominante kleuren uit de afbeelding
- Aanbevolen typografische richting
- Compositie-intentie

Die brief wordt opgeslagen in state en bij elke vervolgprompt als vaste context meegestuurd. Zo weet de AI bij aanpassing 5 nog: "dark editorial, premium fietsmerk, bold sans-serif" — zonder dat de gebruiker het opnieuw hoeft te zeggen.

**Effect**: Conversationeel ontwerpen. De AI bouwt voort op een gedeelde visie.

---

## Strategie 4 — Per-module Standaardmodel (configureerbaar) ✅ te implementeren

Elke Atelier-module heeft een andere optimale AI voor de taak. De beste model voor print/HTML-generatie (GPT-4o) is niet per se de beste voor presentatiestructuur (Sonnet). 

Implementatie:
- Per module een default model-ID opgeslagen in Settings (niet hardcoded in de component)
- `localStorage` als fallback als Settings nog geen waarde heeft
- De gebruiker kan altijd via de model picker een ander model kiezen — de keuze wordt onthouden
- In de Settings-pagina een sectie "Standaardmodellen" met één dropdown per module

Modules en hun aanbevolen default:
| Module | Aanbevolen default | Reden |
|---|---|---|
| Print editor | `openai/gpt-4o` | Sterk in HTML/CSS + vision |
| Banner editor | `openai/gpt-4o` | Zelfde redenen |
| Presentaties | `anthropic/claude-sonnet-4-5` | Beter in structuur en langere output |
| Engine chat | Vrij te kiezen | Afhankelijk van taak |

---

## Strategie 5 — Visueel Bewustzijn via Vision Model (volgende fase)

De meest fundamentele verbetering maar vereist API-uitbreiding. Op dit moment "ziet" de AI de afbeelding niet.

Technische vereisten:
- `window.api.atelierChat.complete` IPC handler uitbreiden zodat hij `image_url` of base64 accepteert in het berichten-format
- Bij elke prompt: `imageSrc` van de payload omzetten naar base64 en meesturen als vision-attachment
- Alleen inschakelen als het geselecteerde model vision ondersteunt (GPT-4o, Claude Sonnet, Gemini Pro Vision)

**Effect**: De AI plaatst tekst in de negatieve ruimte van de foto. Hij ziet: "fiets rechts, donkere lege ruimte linksboven — headline hoort daar."

---

## Strategie 6 — Creative Director Loop (toekomst)

Twee AI-lagen die samenwerken:

1. **Designer AI** genereert de HTML
2. **Creative Director AI** bekijkt het resultaat en geeft kritiek: "tekstcontrast onvoldoende, logo te dicht op de rand, leesvolgorde klopt niet"
3. Designer AI verwerkt de feedback
4. Pas na N iteraties ziet de gebruiker het resultaat

Implementatie-overweging: 2× tokens, 2–3× latency. Optioneel via "Autonome modus" toggle in de toolbar.

---

## Status en volgorde van implementatie

| # | Strategie | Complexiteit | Impact | Status |
|---|---|---|---|---|
| 1 | Design tokens + opinionated system prompt | Laag | Hoog | 🔲 |
| 2 | Chain of Thought (design_rationale) | Laag | Hoog | 🔲 |
| 3 | Design brief bij openen editor | Middel | Hoog | 🔲 |
| 4 | Per-module standaardmodel in Settings | Laag | Middel | 🔲 |
| 5 | Vision model voor afbeeldingsanalyse | Middel | Zeer hoog | 🔲 |
| 6 | Creative Director feedback loop | Hoog | Zeer hoog | 🔲 |

Stap 1 t/m 4 zijn geen architectuurwijzigingen — pure prompt- en configuratiewerk. Stap 5 vereist IPC-uitbreiding. Stap 6 is optioneel.

**Reeds geïmplementeerd (buiten dit plan):**
- Chat-historie meesturen naar de AI ✅
- Undo-buffer (20 stappen) ✅
- Broncode-editor geblokkeerd tijdens AI-wait ✅
