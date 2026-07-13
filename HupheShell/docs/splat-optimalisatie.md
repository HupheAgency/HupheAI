# Architectuur & Optimalisatie: Marble 3D Splats in Electron

Dit document beschrijft de architectonische blauwdruk voor het vloeiend inladen en renderen van gigantische Gaussian Splat-omgevingen (zoals Marble-scans met miljoenen splats) binnen de HupheAI Electron-applicatie. 

De kernfilosofie is verschoven van *"Hoe laden we 2 miljoen splats zo snel mogelijk?"* naar **"Hoe zorgen we dat we nooit meer dan 750.000 splats tegelijk hoeven te renderen?"**

---

## 1. Data Pipeline: Streaming LOD met SplatTransform
Grote omgevingen mogen niet meer in één klap als onverwerkt `.ply` of `.splat` bestand in het geheugen worden geladen.

**Actiepunten:**
- Gebruik als basis gecomprimeerde `.spz` bestanden (Niantic's standaard, aanzienlijk efficiënter en lichter).
- Bouw een backend-stap (of CLI integratie in het main process) met de `@playcanvas/splat-transform` package.
- Genereer hiermee meerdere Level of Detail (LOD) lagen vanuit de bron-SPZ (bijv. 50%, 25%, 10%).
- Bundel deze in een Streamed Octree Gaussian (`.sog`) formaat gekoppeld aan een `lod-meta.json`. 

*Resultaat:* De viewer laadt eerst een grove, razendsnelle versie van de wereld in en verfijnt vervolgens alleen de "chunks" (ruimtelijke blokjes) waar de camera direct op focust.

## 2. Renderer: SuperSplat & Splat Budgets
De huidige `<Splat />` component van `@react-three/drei` is ongeschikt voor miljoenen splats door de afhankelijkheid van CPU-gebaseerde sortering en het gebrek aan streaming.

**Actiepunten:**
- Migreer naar een dedicated renderer. De open-source **PlayCanvas SuperSplat Viewer** is hiervoor sterk aanbevolen.
- Forceer de viewer in **WebGPU** modus (dit versnelt het sorteren tot wel 100x ten opzichte van JavaScript Web Workers en wordt native ondersteund door Electron/Chromium).
- **Stel een Splat Budget in:** Beperk het maximaal aantal gelijktijdig actieve Gaussians in beeld (bijvoorbeeld `budget=0.75` voor ~750.000 splats). Dit fungeert als een veiligheidsklep voor de hardware.

## 3. Electron Architectuur: Isolerend Renderen (WebContentsView)
Zware 3D-rendering draaien binnen de zelfde interface-thread (React) leidt tot "bevroren" knoppen, invoervertraging en een haperende applicatie.

**Actiepunten:**
- Isoleer de 3D-viewer. Verwijder de SplatCanvas uit de React-frontend componentenboom.
- Open vanuit het Electron Main Process een aparte `WebContentsView` (de prestatiegerichte vervanger van BrowserView) puur gericht op een HTML-bestand met de PlayCanvas viewer.
- Positioneer deze View visueel achter of naast de transparante React-interface.
- **Communicatie:** Gebruik uitsluitend lichte IPC-berichten (Inter-Process Communication) voor instructies (zoals `set-camera` coördinaten of het laden van een nieuwe URL). Verplaats nooit ruwe buffers, matrices of zware objecten over de IPC-brug.

## 4. Fill Rate & Adaptive Resolutie (DPR)
Gaussian splats zijn berucht om hun veeleisende "fill rate" (het eindeloos over elkaar heen tekenen van half-transparante verfklodders).

**Actiepunten:**
- Beperk de Device Pixel Ratio (DPR) kunstmatig in de renderer. Bijvoorbeeld: `const renderDpr = Math.min(window.devicePixelRatio, 1.25);`. Op 4K/Retina schermen voorkomt dit een onzichtbare verviervoudiging van de belasting.
- **Adaptive Resolution:** Bouw logica in waarbij de renderresolutie tijdelijk verlaagt (bijv. DPR `0.8`) zodra de gebruiker de camera roteert (orbit), en direct weer haarscherp stelt zodra de beweging stopt.
- Schakel anti-aliasing en zware post-processing uit, dit is visueel vaak onnodig op splats en kost veel prestaties.

## 5. Electron GPU Sanity Checks
Een kleine misconfiguratie in Electron kan hardwareversnelling stilletjes uitschakelen, wat dodelijk is voor WebGPU.

**Actiepunten:**
- Zoek de codebase streng na op `app.disableHardwareAcceleration()` en verwijder dit.
- Roep in het main process bij het opstarten `app.getGPUFeatureStatus()` aan om te verifiëren dat WebGPU en WebGL hardwarematig zijn ingeschakeld, en pas eventueel launch arguments aan (`--enable-features=WebGPU`) indien Chromium in de sandbox wordt tegengehouden.
