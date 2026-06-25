# Multi-Angle Feature Review

## Flow Analyse
De flow die Claude heeft geïmplementeerd werkt in de basis als volgt:
1. De AI ontvangt de `clean background plate` uit de originele final render.
2. De AI krijgt instructies om deze achtergrond te genereren vanuit de *nieuwe camerahoek* (berekend via azimuth/elevation verschillen).
3. Na het genereren van de geroteerde achtergrond, pakt de backend het `newProductLayerDataUrl` (de 3D mesh render) en doet een **hard composite** (plakken) over deze nieuwe achtergrond.
4. Tot slot draait er een lichte Image-to-Image pass (strength 0.1) om de belichting iets natuurlijker te laten overvloeien.

## Waarom gaat Route B fout? (De "Lelijke Vaas")
In Route A zit je nog in de "generatie" fase waarbij de tekst-prompt wordt gebruikt om een volledig nieuwe, samengevoegde afbeelding te genereren. 
In Route B gebruik je de "Nieuwe hoek" knop. Omdat de backend in Route B het actuele 3D viewport-screenshot direct hard over de AI-achtergrond plakt, krijg je de **ruwe 3D mesh** (de "lelijke vaas") te zien in plaats van een fotorealistische vaas. De lichte AI-polish (strength 0.1) is niet sterk genoeg om een ruwe 3D mesh te transformeren naar een fotorealistisch product.

## Waarom verschijnt de vaas opnieuw na verwijderen?
Je gaf aan: *"Als ik de texture product verwijder en ik klik op nieuwe hoek dan opeens zit de texture product er weer in"*.

Dit is een complex React-lifecycle probleem:
Wanneer je klikt op "Nieuwe hoek", doet de UI het volgende:
```typescript
setViewMode('material') // Omschakelen naar materiaal weergave
```
Als je het product hebt verwijderd uit de 3D viewport, wordt deze lokaal uit de staat verwijderd. Echter, door de opeenvolging van state-updates in `ProductStudioShell` (zoals het aanpassen van de `viewMode` en het setten van de `busy` state), triggert React een re-render. Als gedurende deze re-render de `useEffect` (lijn 688) die verantwoordelijk is voor `addModelFromUrl` opnieuw vuurt (bijvoorbeeld omdat een reference update plaatsvond in het `project` object in de achtergrond), injecteert deze het 3D-model direct weer in de viewport **vlak voordat** het screenshot wordt gemaakt. Hierdoor neemt de code een screenshot mét de 3D-mesh, en wordt die alsnog lelijk over je achtergrond geplakt.

## Gaten en Aanbevelingen
1. **Verkeerd gebruik van "Hard Composite":** Mijn eerdere advies over hard compositing was bedoeld voor het plakken van een **reeds fotorealistische, vrijstaande render** over een achtergrond, níet voor het plakken van een ruwe 3D texture mesh over een achtergrond. Om dit te fixen, zou de AI (OpenRouter) zélf de fotorealistische variant moeten genereren vanuit de nieuwe hoek (zoals in de normale prompt-flow), óf je moet zorgen dat de input voor de hard composite een fotorealistische afbeelding is.
2. **Lifecycle Fix:** De `addModelFromUrl` trigger in `ProductStudioShell` moet robuuster worden, zodat verwijderde objecten daadwerkelijk verwijderd blijven en niet terugschieten bij een re-render of `hydrateLatestState` call. 
3. **Fallback gedrag:** Als de user het object écht heeft verwijderd, stuurt de frontend momenteel een compleet lege (transparante) screenshot naar de backend, wat leidt tot onvoorspelbaar compositing gedrag in Sharp.

**Conclusie:** Het multi-angle systeem werkt voor het roteren van de *achtergrond*, maar faalt op het product omdat het de ruwe viewport-rendering mixt met de fotorealistische AI-achtergrond.
