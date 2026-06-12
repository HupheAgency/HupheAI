# Atelier checklist — presentatietool

Doel: iemand kan een bestaande presentatie, notities of document inladen, een eigen Keynote-template kiezen, de inhoud omzetten naar een nette presentatie, die fijn bewerken, opslaan, delen en exporteren.

---

## Gedaan

### Templatebeheer
- [x] `.key` templates uploaden via Instellingen
- [x] Templates vervangen en verwijderen
- [x] Nieuwe templatenaam/klantnaam aanmaken bij upload
- [x] Template-data opslaan in Supabase `templates`
- [x] Mapping opslaan in `template_mappings`
- [x] Mapping-wizard voor tekstvelden zonder sageTag
- [x] Mapping-wizard opnieuw kunnen openen voor bestaande templates
- [x] Upgrade van ownedDrawable tekstvelden naar placeholders/sageTags
- [x] Placeholder-afbeelding beheren voor image-slots
- [x] Template upload-validatie: TemplateValidationPanel geïntegreerd in Instellingen

### Import en conversie
- [x] `.key`, `.ppt` en `.pptx` worden als presentatie-input herkend
- [x] `.pptx` wordt uitgelezen via de PowerPoint XML
- [x] `.key` en `.ppt` kunnen via Keynote/AppleScript naar `.pptx` worden geconverteerd voor tekstextractie
- [x] Keynote `.key` kan ook direct als self-contained project/template worden geopend
- [x] Slide-tekst wordt omgezet naar het interne `[LayoutName]` markdown-achtige formaat
- [x] `.docx` tijdelijk verwijderd uit de upload-UI (geen echte parser aanwezig)
- [x] ImportResultBanner geïntegreerd: toont aantal slides, gevonden tekst, onbekende layoutnamen en fallback-naam

### Editor UX
- [x] Live slide-preview via `WebSlidePreview`
- [x] In-place tekst bewerken in de preview
- [x] Rechterpaneel voor slidevelden
- [x] Slides toevoegen, dupliceren en verwijderen
- [x] Slides verslepen en herordenen
- [x] Multi-select voor slides
- [x] Bulk layout-dropdown in multi-select toolbar
- [x] Undo/redo met `Cmd/Ctrl+Z` en `Cmd/Ctrl+Y`
- [x] Keyboard shortcuts voor opslaan, dupliceren en verwijderen
- [x] Auto-save naar bestaand projectbestand of lokale draft
- [x] Virtual scrolling voor de slidekolom
- [x] Layout/type per slide wisselen
- [x] Template/thema wisselen met fallback naar een bestaande layout
- [x] Beelden uploaden/kiezen per slide
- [x] Beelden uitlijnen, verschuiven, zoomen, roteren en spiegelen
- [x] AI-beeldgeneratie op basis van slidetekst of prompt
- [x] Basis-empty state wanneer er nog geen slides zijn
- [x] PresenterNotesField geïntegreerd in het rechterpaneel

### Presenteren en exporteren
- [x] Fullscreen/presentatiemodus
- [x] Subtiele fade in presentatiemodus
- [x] Keynote-export via `deck:generate-structured`
- [x] PPTX-export via `deck:export-pptx`
- [x] PDF-export via screenshot-capture
- [x] JSON-export van export blocks
- [x] MD-bestand downloaden om via email te delen
- [x] ExportPreflightModal geïntegreerd: onderschept Keynote- en PDF-export
- [x] Keynote en PDF-export gebruiken de projectnaam als bestandsnaam

### Projecten en opslag
- [x] Lokale projecten opslaan/laden/verwijderen
- [x] Lokale auto-save draft wanneer er nog geen projectpad is
- [x] Live presentaties worden in Supabase `presentations` opgeslagen
- [x] Projectenlijst toont lokale projecten en live/shared presentaties
- [x] Zoekbalk toegevoegd boven projectenlijst
- [x] Project-thumbnails/previews in de projectenlijst
- [x] Lokaal is de juiste default voor een desktopprogramma — bewuste keuze

### Live, delen en review
- [x] Live starten met share code
- [x] Join live via code in `AppShell`
- [x] Supabase Realtime synchroniseert deck-state
- [x] Actieve slide wordt naar kijkers gebroadcast
- [x] Read-only live viewer
- [x] Presentatie delen met email via `share_presentation` RPC
- [x] `handleOpenShared` roept `onJoinSession` aan (niet meer als gewone editor)
- [x] PresenceAvatars geïntegreerd in de live-header
- [x] SlideCommentThread geïntegreerd in het rechterpaneel
- [x] "Oplossen"-knop per comment in SlideCommentThread

### AI en voice
- [x] Ruwe notities structureren via Supabase function `atelier-structure-notes`
- [x] Ambigue velden automatisch koppelen aan sageTags via AI
- [x] Voice command via browser SpeechRecognition + OpenRouter
- [x] Voice command kan heading/body van slides aanpassen
- [x] Meeting notes via microfoonopname, Groq transcriptie en OpenRouter samenvatting
- [x] Meeting notes zijn per slide gegroepeerd
- [x] ".txt download" knop in het notulen-paneel

---

## Te doen

### Import
- [x] Afbeeldingen uit bestaande presentaties meenemen
- [x] Tabellen uit Keynote/presentaties parsen en renderen
- [ ] Grafieken uit bestaande presentaties betrouwbaar meenemen

### Editor
- [x] Text overflow/fitting waarschuwingen: zichtbaar wanneer tekst buiten een templatevlak valt
- [x] Rich text lite: vet, cursief en bullets binnen tekstvelden
- [x] Tabellen bewerken: cellen, rijen en kolommen
- [x] Tabelinstellingen in het rechterpaneel voor slides met een tabel

### Exporteren
- [x] PPTX-export toevoegen (voor klanten zonder Keynote)
- [x] Export progress voor grote decks: retry, cancel en status

### Projecten en opslag
- [ ] Portable assets: geuploade/gegenereerde beelden opslaan bij project of in Supabase Storage zodat ze niet breken bij delen of op een andere machine
- [x] Project-thumbnails in de projectenlijst
- [x] Asset library voor eerder gebruikte/geüploade/gegenereerde beelden
- [x] Asset library synchronisatie met Supabase voor gedeelde assets

### Live en delen
- [x] Rechtenmodel per gedeelde presentatie: owner, editor, commenter, viewer

### Database
- [x] Supabase schema, RLS en RPC controleren en afstemmen op frontend: `presentations`, `presentation_members`, `share_presentation`, `join_presentation_by_code`, `sync_presentation_state`, `templates`, `template_mappings`, `clients`

---

## Toekomst

### Editor
- [ ] Copy/paste tussen slides en vanuit externe bronnen
- [ ] Presenter view met notes en timer
- [ ] Project history/timecapsule
- [ ] Verwijderde projecten herstellen

### Ingebouwde templates
- [ ] Vijf standaard Huphe presentatietemplates bundelen met de app
- [x] Template selector uitbreiden met `Huphe templates` naast `Mijn templates`
- [x] Ingebouwde templates HTML-first maken met eigen layouts, velden en thumbnails
- [x] Projecten ondersteunen met Keynote-templates en HTML-template client IDs
- [x] HTML-template renderer aansluiten op de editor en bestaande slide blocks
- [x] Rechterpaneel velden laten tonen op basis van HTML-template layouts
- [ ] Promptbar alleen gebruiken voor inhoudsgesprek, niet voor templatekeuze
- [x] PDF-export beschikbaar maken voor HTML-templates
- [x] Keynote-export voor HTML-templates via shapes/PNG-route

### Live en samenwerking
- [ ] Cursor-posities delen in live sessies
- [ ] Niet-live reviewlink (zonder live sessie meekijken)
- [ ] Analytics op live/review sessies

### AI
- [ ] AI-beeldstijl deck-breed consistent (global style prompt per project)
- [x] Asset library voor eerder gebruikte/gegenereerde beelden
- [ ] Voice command uitbreiden: vrije velden, layout en beelden aanpassen
- [x] Productie-AI via centrale backend keys, usage limits en logging — proxy-openrouter en proxy-fal-ai met JWT-auth, company/persoonlijke billing

### Platform
- [ ] Brand kit per klant/organisatie
- [ ] Rechten per organisatie: alleen eigen of organisatie-templates zien
- [x] Billing en limieten per gebruiker/organisatie — wallet-systeem met company billing, Stripe webhook, RLS en atomaire RPCs
