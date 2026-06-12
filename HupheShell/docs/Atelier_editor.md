# Atelier Media Editor - Epische Upgrade Plan

## 1. Huidige Status
Op dit moment bevat `PrintFlow.tsx` een begin van een visuele editor. Wat er al werkt:
- Je kunt **Edit Mode** aanzetten, waarna de HTML in een iframe wordt geladen met een geïnjecteerd `HUPHE_REPORTER_SCRIPT`.
- Dit script stuurt de bounding boxes (`left`, `top`, `width`, `height`) terug naar de parent.
- Je kunt elementen **verplaatsen (drag-and-drop)**. De nieuwe positie wordt via een Regex (`updateElementPositionById`) teruggeschreven in de HTML-broncode.

**Waarom het nog niet als een echte editor voelt:**
- **Geen tekst aanpassen:** Er is geen UI om de inhoud van de geselecteerde tekst aan te passen, behalve door direct in de ruwe HTML-broncode te duiken.
- **Geen opmaak:** Lettergrootte (font-size), kleur (color), uitlijning (text-align) en andere stijlen kunnen niet visueel worden aangepast.
**Waarom het drag-and-drop momenteel stuk is:**
- Bij diepgaande analyse blijkt dat de functie `injectEditIds` die elementen selecteerbaar maakt, **alleen elementen pakt die al `style="position: absolute"` (of `fixed`) in de ruwe HTML hebben staan**.
- Omdat de AI ontwerpen vaak opbouwt met flexbox, grid of zonder expliciete inline positionering, vindt het script **nul** elementen. Er verschijnen daardoor geen selectiekaders over de tekst, waardoor er simpelweg niets te slepen is.
- Daarnaast, als een element wel geselecteerd zou kunnen worden, worden de geïnjecteerde ID's nu niet goed bewaard na het slepen.
- **De fix:** We moeten de regex aanpassen zodat *elk* relevant element (`h1`, `p`, `div`, `img`, etc.) selecteerbaar wordt, onafhankelijk van hoe de AI de styling heeft opgezet. Vervolgens converteren we het element pas naar `position: absolute` op het moment dat de gebruiker begint met slepen.

## 2. Het plan: Hoe maken we dit episch en gestroomlijnd?

Om een premium editor-ervaring te bieden, waarbij de gebruiker moeiteloos teksten en styling kan aanpassen, moeten we de volgende aanpassingen doen:

### A. Uitbreiden van het Iframe Reporter Script
Het `HUPHE_REPORTER_SCRIPT` moet slimmer worden. Naast posities moet het ook de visuele eigenschappen uitlezen via `window.getComputedStyle()`.
- **Nieuwe data:** We extraheren `fontSize`, `color`, `fontWeight`, `textAlign`, `lineHeight` en de exacte tekstinhoud (`innerHTML` of `textContent`).
- Zo weten we in de React-parent exact hoe een element eruitziet voordat de gebruiker begint met bewerken.

### B. Het Properties Panel (Contextuele Sidebar)
Wanneer `editMode` actief is en de gebruiker klikt op een tekst- of beeldelement, verandert het rechterpaneel (of de overlay) in een **Properties Panel**.
- **Tekst-editor:** Een textarea die direct de inhoud van het geselecteerde element aanpast.
- **Typografie:** Sliders of inputvelden voor lettergrootte (px/pt), line-height, en knoppen voor text-align (links, midden, rechts).
- **Kleur:** Een gestroomlijnde color picker voor tekst- en achtergrondkleur.
- **Positionering:** Naast slepen, ook x/y en w/h coördinaten numeriek kunnen fine-tunen.

### C. Robuuste HTML Manipulatie met DOMParser
In plaats van complexe regex te gebruiken voor het updaten van stijlen en teksten, introduceren we een betrouwbare update-functie.
```typescript
function updateElementPropertiesById(html: string, id: string, updates: { text?: string, styles?: Record<string, string> }): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const el = doc.querySelector(`[data-huphe-id="${id}"]`);
  if (!el) return html;
  
  // Update tekst
  if (updates.text !== undefined) el.textContent = updates.text;
  
  // Update styles
  if (updates.styles) {
    Object.entries(updates.styles).forEach(([key, val]) => {
      el.style[key] = val;
    });
  }
  
  return doc.documentElement.outerHTML;
}
```
*Dit zorgt ervoor dat we veilig en exact de juiste elementen aanpassen zonder de structuur kapot te maken.*

### D. Boterzachte Live Feedback
Om het "episch" te maken, moet elke wijziging in het Properties Panel (zoals het typen van tekst of verschuiven van een slider) **onmiddellijk** zichtbaar zijn in het canvas.
- We sturen via `postMessage` commando's *naar* de iframe om stijlen live te overschrijven zonder de hele iframe te herladen.
- Pas wanneer de gebruiker stopt met typen of slepen (onblur of debounce), passen we de échte onderliggende HTML-string aan via de DOMParser-functie.

### E. Z-index & Element Volgorde (Nice to have)
Voeg knoppen toe in het properties panel voor "Naar de voorgrond" of "Naar de achtergrond", zodat gebruikers overlappende elementen makkelijk kunnen fixen.

## 3. Conclusie en Volgende Stappen
De fundering ligt er (het Huphe-ID systeem en iframe-communicatie). Om dit te transformeren naar een volwaardige WYSIWYG editor hoeven we enkel de communicatie-loop te verrijken met stijlen en tekst, en een intuïtief bewerkingspaneel te bouwen in de rechterkolom. 

Als dit plan akkoord is, kan ik direct beginnen met de implementatie in `PrintFlow.tsx`.
