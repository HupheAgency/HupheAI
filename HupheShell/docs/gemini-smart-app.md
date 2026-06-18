# Gemini Smart App - Visie & Dummy-Proof Concept

## 1. Introductie: De "Auto" Modus
Het doel is om de cognitieve belasting van de gebruiker naar nul te brengen. Gebruikers willen geen "Prompt Engineers" zijn; ze willen een super goed resultaat, snel. 

### De Auto-Toggle
In de interface komt een prominente **Auto** toggle (standaard AAN). 
* **Als Auto AAN staat:** 
  De app leest de intentie van de gebruiker en routeert de taak automatisch naar het allerbeste AI-model voor die specifieke klus.
  * *Voorbeeld:* "Maak de achtergrond wazig" -> De app kiest een inpainting of mask-edit model.
  * *Voorbeeld:* "Laat de auto rijden" -> De app kiest het beste Image-to-Video model (bijv. Luma of Runway).
  * *Voorbeeld:* "Schrijf een pakkende titel" -> De app schakelt over naar een krachtig LLM (zoals Gemini of Claude).
* **Als Auto UIT staat (Power User Mode):**
  De gebruiker kan handmatig het model selecteren, parameters (temperature, steps) tweaken en geavanceerde workflows bouwen. Dit is cruciaal voor power-users, debugging en specifieke use-cases.

## 2. Achtergrond Leren: Design Intelligence
De app moet functioneren als een ervaren Art Director die continu bijleert.
* **Online Design Scraping & Leren:** Op de achtergrond kan de AI (veilig en geanonimiseerd) kijken naar actuele design trends op platforms zoals Behance, Dribbble of hoog-converterende ads. 
* **Toepassing:** Het leert over macro-typografie, kleurcontrasten (WCAG-compliancy), witruimtes, en de regel van derden. 
* **Resultaat:** Als de gebruiker vraagt om een "LinkedIn banner", past de app automatisch de nieuwste "best practices" voor B2B conversie toe zonder dat de gebruiker dit hoeft te specificeren.

---

## 3. Bevindingen & Ideeën: De App "Dummy-Proof" Maken

Op basis van de huidige architectuur (Atelier, Typewriter, SlideEditor, etc.) zijn hier mijn bevindingen over hoe we HupheAI met een paar klikken superieur en "dummy-proof" kunnen maken:

### A. Intentie Gestuurde Promptbar (Geen Modules Meer Kiezen)
Gebruikers moeten niet nadenken of ze in "SlideEditor", "Typewriter" of "Atelier" moeten zijn. 
* **Oplossing:** Eén centrale omni-promptbar op het dashboard of zwevend in de app. 
* **Hoe het werkt:** Je uploadt een foto en typt "Maak hier een Instagram story van met een zonnige vibe". De app herkent de intentie (beeld -> format wijziging -> tekst toevoeging) en creëert direct de output, waarbij onder water de juiste tools worden gekoppeld.

### B. "Next-Best-Action" Suggesties (One-Click Magic)
Na elke generatie is de gebruiker vaak zoekende naar de volgende stap. Verberg de gereedschappen en bied intenties aan.
* Na het genereren van een afbeelding verschijnen 3 magische knoppen:
  * ✨ *Maak er een video van (2 sec)*
  * ✨ *Verwijder de achtergrond*
  * ✨ *Zet om in een advertentie*
* Dit maakt complexe workflows letterlijk een één-klik actie.

### C. Context Awareness & Brand Memory
De app moet "weten" voor wie het ontwerpt. 
* **Oplossing:** Zodra een gebruiker in een project werkt (via HupheCode of ProjectsPage), injecteert de app stilletjes de brand guidelines (kleuren, fonts, tone-of-voice) in elke prompt. 
* **Gevolg:** De gebruiker typt "Maak een banner", en de banner is direct in de juiste huisstijl, zonder dat ze de prompt hoeven te vervuilen met hex-codes.

### D. De "Critic in the Loop" (Kwaliteitscontrole)
Een veelvoorkomend probleem met AI-generatie is dat de eerste output "net niet" is (bijv. tekst is onleesbaar, contrast is te laag).
* **Oplossing:** Voordat de afbeelding of slide aan de gebruiker wordt getoond, kijkt een klein vision-model razendsnel of het resultaat goed is.
* Is de tekst op een donkere slide zwart? De "Critic Agent" zegt intern "Nee, pas aan naar wit", corrigeert het ontwerp, en toont dán pas het perfecte resultaat aan de gebruiker. Dit elimineert de "trial and error" fase voor de gebruiker.

### E. Zelf-Opschonende UI
Als de Auto-modus AAN staat, kan 80% van de zijbalken, knoppen en lagen-panels (zoals in AtelierPage) worden verborgen. Toon de gebruiker uitsluitend het canvas en de chat/prompt interface. Zodra ze de Auto-modus uitzetten, klappen de professionele panelen weer open.

---
**Conclusie:** HupheAI wordt de ultieme tool niet door meer knoppen toe te voegen, maar door extreem sterke voorspellende AI onder water te gebruiken. De gebruiker praat met het systeem alsof het een Senior Designer is, en het systeem orkestreert zelf de complexe mix van modellen, tools en design rules.
