# Typewriter Collaboration & Versioning

## 1. Doel
Het mogelijk maken van vloeiende, conflictvrije realtime samenwerking (Google Docs stijl) en het opzetten van een betrouwbaar mechanisme voor versiegeschiedenis en offline opslag.

## 2. Realtime Collaboration (Yjs + Supabase)

Omdat de oude methode ("verstuur hele HTML string over Supabase kanalen") resulteert in het overschrijven van elkaars werk, stappen we over op **CRDT's** (Conflict-free Replicated Data Types) via **Yjs**.

- **Transportlaag:** We maken gebruik van Supabase Realtime als de provider voor Yjs (bijv. via een custom of community Yjs-Supabase provider) of we hosten een lichte Hocuspocus WebSockets server ernaast. Voor de veiligheid en eenvoud is een Supabase adapter de voorkeur.
- **Awareness:** Gebruikers zien elkaars live cursor-posities, selecties en namen in beeld.
- **Conflictresolutie:** Gelijktijdig typen wordt mathematisch opgelost door Yjs; er gaat nooit tekst verloren en de document-state klopt altijd, ongeacht de volgorde waarin netwerk-pakketjes aankomen.

## 3. Offline-First Buffer & Crash Recovery

**Probleem:** Supabase WebSocket verbindingen kunnen wegvallen of de browser kan crashen.
**Oplossing:** Yjs synchroniseert lokaal via IndexedDB (`y-indexeddb`).
1. Terwijl de gebruiker typt, wordt elke wijziging (Y-update) asynchroon in de lokale IndexedDB opgeslagen.
2. Zodra internet herstelt, stuurt de Yjs provider alle ontbrekende updates als "diffs" naar Supabase.
3. Dit fungeert tevens als ingebouwde crash-recovery: bij het refreshen van de pagina laadt de editor eerst de lokale staat in, waardoor ongesyncte wijzigingen behouden blijven.

## 4. Snapshots & Version History

Yjs slaat in feite een lineaire log op van alle toetsaanslagen. Voor leesbare versiegeschiedenis hebben we **Snapshots** nodig.

- **Trigger:** Elke 15 minuten dat er getypt wordt, óf handmatig (bijv. "Versie V1 Final") slaat de backend een harde snapshot van de actuele TipTap JSON (en HTML) op in een aparte `typewriter_versions` tabel.
- **Tijdmachine UI:** Gebruikers kunnen een lijst van deze snapshots zien en "Revert to this version" aanklikken, wat een nieuwe harde Yjs overwrite update creëert (om de huidige live state veilig terug te draaien).
