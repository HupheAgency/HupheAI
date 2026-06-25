# Architectuur: Professionele Fotograaf Workflow & Photo Library

Dit document schetst de benodigde stappen en architectuur om HupheAI om te bouwen naar een vloeiende, professionele fotoshoot-ervaring waarbij de gebruiker (fotograaf) snel rondom een product kan bewegen, tientallen foto's kan "snappen", waarna het systeem in de achtergrond een consistente, doorlopende 3D-wereld opbouwt.

---

## 1. De Snapshot Queue (Asynchrone Wachtrij)
**Huidige situatie:** Zodra je een foto neemt, bevriest de interface (met de melding *"Bezig..."*) totdat de AI de foto volledig gerenderd en ge-upload heeft. Dit verbreekt de workflow van een fotograaf.
**De oplossing:**
- **Instant Captures:** Zodra je klikt, maakt de frontend in ~10 milliseconden een screenshot van de viewport (de *beauty*, *calibration* en *mask* passes) en stopt deze onzichtbaar in een wachtrij.
- **Non-blocking UI:** De interface blijft volledig bruikbaar. Je kunt direct de camera doordraaien en de volgende foto klikken.
- **Background Worker:** In de Electron/Node backend draait een queue-manager die de snapshots één voor één (of parallel, afhankelijk van API-limieten) verwerkt. In de UI zie je discreet een teller, bijvoorbeeld: *"📸 3 foto's in de wachtrij... rendering"*.

## 2. Consistente 360° Omgeving (Geheugen & Hallucinatie Preventie)
**Het probleem:** Op dit moment roept de "Nieuwe hoek" functie de AI aan om een ruimte te genereren enkel op basis van de tekst-prompt. Hierdoor is de ruimte elke keer compleet anders (gehallucineerd).
**De oplossing:**
- **Context Stacking:** AI-modellen (zoals Gemini 1.5 Pro) hebben gigantisch veel werkgeheugen. We gaan de AI letterlijk trainen met de foto's die hij zélf zojuist heeft gemaakt.
- **De Prompt Strategie:** Als het systeem foto 5 gaat renderen, haalt het eerst de lege achtergronden van foto 1, 2, 3 en 4 op. De prompt wordt dan:
  *"Hier zijn 4 eerdere beelden van deze ruimte (geseind vanuit hoeken Noord, West, etc.). Genereer nu exact deze ruimte maar dan vanuit camera-hoek Zuid. Zorg dat meubels, lichtinval, muren en perspectief 100% aansluiten bij wat je in de voorgaande beelden hebt opgebouwd."*
- **Resultaat:** De AI leert de ruimte kennen. Na 20 foto's zit de halve kamer al als visuele referentie in de prompt, waardoor het model nauwelijks nog ruimte heeft om te hallucineren.

## 3. Bestandsbeheer & Projectfolder
**Huidige situatie:** Assets worden lokaal ergens in de appData-map opgeslagen of verborgen in Supabase cloud buckets. 
**De oplossing:**
- **Inzichtelijke Mappenstructuur:** Elke HupheAI fotoshoot krijgt een dedicated "Project Folder" op de Mac van de gebruiker. Bijvoorbeeld:
  `/Users/[Naam]/HupheProjects/MijnVaas_Sessie_1/`
  - `renders/` (De uiteindelijke composities)
  - `backgrounds/` (De schone, lege kamers per hoek)
  - `products/` (De vrijstaande product-layers)
- Dit stelt jou als fotograaf in staat om de bestanden ook gewoon via Finder of Bridge in te zien, er een te bewerken in Photoshop, of ze direct door te sturen naar klanten.

## 4. De Library UI (Fotostudio Tabblad)
Er moet een nieuw tabblad in de React-frontend komen dat fungeert als "Contactsheet".
- **Grid / Masonry View:** Een visueel overzicht van alle gemaakte foto's in dit project.
- **Live Status:** Plaatjes in de wachtrij worden getoond met een laad-icoon. Zodra de achtergrond klaar is, verschijnt die alvast. Zodra het product erop zit, update de thumbnail naar de finale foto.
- **Selecteren & Retaken:** De mogelijkheid om een mindere foto aan te klikken en te zeggen *"Doe deze overnieuw, maar behoud deze specifieke hoek van de achtergrond"*.

## 5. Technische Implementatie Stappen
Om dit te bouwen, moet de codebase op de volgende punten op de schop:
1. **Frontend (`ProductStudioShell.tsx`):** Ontkoppelen van de `await api.generateAngleVariant` bij de knopklik. In plaats daarvan de data opslaan in een Zustand-store wachtrij.
2. **Database (`Supabase`):** Toevoegen van een `environment_id` aan de render_packets, zodat de backend snel kan opvragen wélke achtergronden bij de huidige kamer horen.
3. **Backend (`product-studio-ipc.ts`):** 
   - Een asynchrone `JobManager` schrijven.
   - De API-prompts ombouwen zodat ze dynamisch een array met *alle* voorgaande achtergrond-beelden inladen als "history context" voor de AI.
4. **Lokale opslag (`file-system`):** De `saveAssetLocally` functie ombouwen zodat deze netjes wegschrijft naar logische projectmappen op de harde schijf, in plaats van caching-folders.

---
**Conclusie:** Dit is een forse, maar zeer logische architectuurverschuiving. Het transformeert de app van een "wacht op AI generator" naar een echte "Realtime Fotostudio Tool".
