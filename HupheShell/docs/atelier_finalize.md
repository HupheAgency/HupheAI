# Atelier Finalize — Aanbevelingen voor Beta-Launch (Versie 2) 🎨

Op basis van jouw feedback hebben we de koers voor Atelier aangescherpt. De focus ligt op een **Local-First** ervaring met krachtige, intelligente automatisering.

---

## 1. Hybride Opslag: Lokaal Tenzij... (Privacy & Snelheid)
**Visie:** Afbeeldingen blijven altijd op de Mac van de gebruiker staan. Dit is sneller, veiliger en werkt offline.

**Aanbeveling:**
- **De "Share-Sync"**: Implementeer een check in de export/share flow. Alleen wanneer een project gedeelt wordt (live of via link), worden de lokale assets (`/Users/...`) tijdelijk geüpload naar Supabase Storage.
- **Local Paths**: Het projectbestand (`.huphe`) slaat uitsluitend lokale absolute paden op voor maximale performance tijdens het bewerken.

---

## 2. Intelligente Layout-matching & "Magic Flow" (Pagina-splitsing)
**Visie:** De content moet zich aanpassen aan het template, niet andersom.

**Aanbeveling:**
- **Auto-Pagination (Split)**: Implementeer een detectie-algoritme dat meet wanneer tekst buiten de sageTag-box van een template valt.
- **De actie**: Atelier splitst de tekst automatisch op het punt van "overflow" en maakt direct een vervolg-slide aan met exact dezelfde layout. Dit voorkomt dat tekst onleesbaar klein wordt of verdwijnt.
- **Data-behoud**: Als je van template wisselt en velden "verliest" (bijv. een template zonder body-tekst), verplaats de overtollige data dan automatisch naar de **Sprekernotities** van die slide, zodat er nooit informatie verloren gaat.

---

## 3. AI Style DNA (Visuele Consistentie)
**Visie:** Een presentatie moet voelen als één geheel, ongeacht hoeveel AI-beelden je genereert.

**Aanbeveling:**
- **Global Style Prompt**: Voeg een instelling toe op projectniveau: "Visuele Stijl".
- **Prompt Engineering**: Bij elke individuele aanvraag voor een AI-beeld (per slide) wordt deze Global Style automatisch als suffix toegevoegd.
  - *Voorbeeld*: "Modern kantoorinterieur" + suffix "Film noir, dramatische schaduwen" = consistente visuele stijl door je hele deck.

---

## 4. UI Focus: De "Inspector" Workflow
**Visie:** Minder rommel, meer focus op de slide.

**Aanbeveling:**
- **Contextuele Velden**: Toon in het rechterpaneel alleen de velden die daadwerkelijk in de geselecteerde layout zitten. Als een layout geen 'Subtitel' heeft, moet dat veld ook niet zichtbaar zijn in de editor.
- **Overflow Indicator**: Toon een klein geel waarschuwingsicoontje bij slides waar de tekst automatisch is gesplitst, zodat de gebruiker de overgang kan controleren.

---

## Technische Checklist voor de Agents
- [ ] **Claude**: Implementeer `measureTextHeight` in `WebSlidePreview.tsx` om overflow te detecteren.
- [ ] **Claude**: Bouw de `splitBlockContent` functie die een Block opsplitst in twee nieuwe Blocks.
- [ ] **Gemini**: Voeg `globalStylePrompt` toe aan het `HupheProject` schema in de database en projectbestanden.
- [x] **ChatGPT**: Ontwerp een subtiele "Overflow Warning" badge voor in de slide-strip.

---

**Eindoordeel:** Met de combinatie van **Local-First** en **Auto-Pagination** wordt Atelier een unieke tool die het "gepriegel" met PowerPoint-tekstvakken volledig wegneemt. 🚀

---

**Eindoordeel:** 
Atelier is technisch indrukwekkend. De overstap van een "lokale tool" naar een "cloud-portable platform" (via Storage en betere mapping) is de belangrijkste stap om het echt "flex" en verkoopbaar te maken. 🚀
