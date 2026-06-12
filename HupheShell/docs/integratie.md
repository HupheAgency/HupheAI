# HupheAI Integraties: Connected Apps (Google Drive & Eigen Servers)

Dit document beschrijft de architectuur, veiligheidsvoorwaarden en het implementatieplan om externe diensten (zoals Google Drive of een eigen server/WebDAV) veilig te koppelen aan de HupheAI Electron applicatie.

Het doel is om naadloos cloud-documenten (Google Docs) of bestanden van een eigen server te kunnen importeren, om te zetten naar Huphe/Atelier presentaties, en ze daar ook weer op te kunnen slaan.

---

## 1. Architectuur & Veiligheidsprincipes

Aangezien we een veilige desktop-applicatie bouwen (zie `safety.md`), mogen we geen compromissen sluiten bij het koppelen van externe opslag.

1. **Geen geheimen in de browser:** OAuth *Access Tokens*, *Refresh Tokens* of *App Passwords* mogen **nooit** in de React frontend (zoals `localStorage`) bewaard worden. XSS (zoals we in Typewriter aankaartten) zou anders leiden tot volledige toegang tot de Google Drive van de gebruiker.
2. **SafeStorage is koning:** Alle tokens worden via IPC naar het `main` proces gestuurd en lokaal opgeslagen in de macOS Keychain via Electron's `safeStorage.encryptString()`.
3. **Deep Linking voor OAuth:** We gebruiken het bestaande `hupheai://` protocol (wat al via `app.setAsDefaultProtocolClient` is ingesteld) om na goedkeuring in de browser (bijv. via Google) netjes terug te keren naar onze app.
4. **Data fetching via Main:** Het downloaden van een Google Doc of een bestand van een eigen server gebeurt door het `main` proces (Node.js). Dit voorkomt CORS-issues in de frontend en zorgt dat tokens nooit de beveiligde main-omgeving hoeven te verlaten.
5. **PKCE volledig in Main:** De `code_verifier` en `code_challenge` worden gegenereerd én bewaard in het `main` proces. De `code_verifier` wordt **nooit** teruggestuurd naar de renderer, ook niet via IPC. Zo kan een XSS-aanval in de renderer de PKCE-uitwisseling niet misbruiken.

---

## 2. Google Drive Integratie

### A. OAuth 2.0 Autoriseringsflow
Omdat we een Desktop app zijn, gebruiken we de OAuth 2.0 flow voor "Native Apps" (met PKCE beveiliging).

1. **Google Cloud Console:** We maken een OAuth client ID aan. De redirect URI stellen we in op `hupheai://oauth2redirect`.
2. **Koppelen:** De gebruiker klikt in de Instellingen op "Koppel Google Drive". Het `main` proces genereert de `code_verifier` en `code_challenge` (PKCE), slaat de `code_verifier` tijdelijk op in memory, en opent via `shell.openExternal` de browser naar het Google Login scherm.
3. **Callback:** Na inloggen stuurt Google de browser terug naar `hupheai://oauth2redirect?code=XYZ`.
4. **Token Exchange:** De deep link wordt opgevangen in `App.tsx` en de `code` (zonder `code_verifier`) wordt via IPC naar `main` gestuurd. Het `main` proces combineert de `code` met de opgeslagen `code_verifier` en wisselt dit in voor een Access Token en Refresh Token. Deze worden versleuteld opgeslagen via `safeStorage`.
5. **Token Vernieuwing:** Access tokens verlopen na 1 uur. Het `main` proces vernieuwt automatisch het token via de `refresh_token` vóór elke API-aanroep als de access token verlopen is. Zo hoeft de gebruiker nooit opnieuw in te loggen.
6. **Loskoppelen:** Bij het loskoppelen van Google Drive roept het `main` proces de Google revocation endpoint aan (`https://oauth2.googleapis.com/revoke`) voordat de lokale tokens worden verwijderd. Alleen lokaal verwijderen is niet voldoende.

### B. Documenten Importeren en Converteren
Google Docs zijn geen "echte" bestanden (zoals `.docx`), maar leven in de cloud. We moeten ze op een specifieke manier ophalen.

1. **Verkennen:** Via de Drive API haalt de app een lijst op van bestanden met het type `application/vnd.google-apps.document`.
2. **Exporteren:** Wanneer een gebruiker een doc aanklikt, roept het main proces de Google Drive Export API aan om het document als **HTML** (`text/html`) te downloaden.
   > *Waarom HTML?* HTML behoudt koppen (`<h1>`, `<h2>`), vette tekst en lijsten. Als we Plain Text exporteren, verliezen we de structuur die we nodig hebben om te bepalen waar een nieuwe slide begint.
3. **Sanitizen vóór parsen:** De gedownloade HTML wordt **eerst** door DOMPurify gehaald voordat er iets mee gedaan wordt. Google Drive HTML is doorgaans schoon, maar dit borgt de veiligheid ook als later andere bronnen worden toegevoegd.
4. **Parsen naar Huphe:** In `atelier-import-utils.ts` schrijven we een nieuwe functie: `parseGoogleDocHtmlToHuphe()`. Deze functie:
   - Splitst de gesaniteerde HTML op bij elke Header (`<h1>` of `<h2>`), wat een nieuwe slide wordt.
   - Zet de paragrafen om naar bullets of body-text.
   - Zet het resultaat om in de interne `[LayoutName]` syntax die de presentatie-editor direct begrijpt.

---

## 3. Eigen Server Integratie (WebDAV / Custom API)

Als gebruikers hun bestanden (of gegenereerde presentaties) op hun eigen netwerkschijf of server willen opslaan.

### A. Setup & Authenticatie
1. **Configuratie:** In de Instellingen vult de gebruiker in: `Server URL` (bijv. `https://files.roorda.nl`), `Gebruikersnaam` en een `App-wachtwoord` of `Personal Access Token`.
2. **Opslag:** De URL en Gebruikersnaam mogen in de database of normale config. Het **Wachtwoord** wordt net als de API-keys versleuteld via `safeStorage` in het main proces.

### B. Bestandsbeheer via WebDAV
WebDAV is de standaard voor bestandsbeheer op afstand (gebruikt door Nextcloud, ownCloud, Synology, etc.).
1. We gebruiken een WebDAV package in het main proces.
2. We bouwen IPC handlers zodat de frontend via veilige commando's mappen kan uitlezen en bestanden (`.key`, `.md`) kan downloaden of uploaden.
3. **Veiligheid:** De app weigert altijd verbindingen via `http://`, tenzij het adres `localhost` of `127.0.0.1` is. Een geldige TLS-verbinding is geen optie maar een harde eis.

---

## 4. Te Doen Lijst (Stappenplan voor implementatie)

### Fase 1: Backend Fundering (Main Proces)
- [ ] Maak `src/main/integrations/token-store.ts` om OAuth tokens en eigen-server-wachtwoorden op te slaan/lezen via `safeStorage`.
- [ ] Implementeer de Google Drive OAuth PKCE flow volledig in `main`: URL generator (inclusief `code_verifier`/`code_challenge`), tijdelijke opslag van `code_verifier` in memory, en de code-to-token wissel.
- [ ] Breid de `handleDeepLink` functie in `App.tsx` uit zodat het schema `hupheai://oauth2redirect` alleen de `code` doorstuurt naar `main` (nooit de `code_verifier`).

### Fase 2: Drive API, Token Vernieuwing en Conversie
- [ ] Maak `src/main/integrations/google-drive.ts` met functies om de bestandenlijst (folder structuur) op te halen.
- [ ] Implementeer automatische token-vernieuwing via de `refresh_token` vóór elke API-aanroep als de access token verlopen is.
- [ ] Implementeer de Drive Export call die het Google Doc als HTML downloadt.
- [ ] **Sanitize eerst:** Haal de gedownloade HTML door DOMPurify vóór verdere verwerking.
- [ ] Bouw in `atelier-import-utils.ts` de parser die de gesaniteerde HTML opsplitst naar Huphe Slides (kijkt naar H1/H2 voor slide-breaks).

### Fase 3: Frontend Interface
- [ ] Pas `SettingsPlaceholders.tsx` (Connected Apps) aan. Bouw het formulier voor de "Eigen Server" en een "Koppel Google Account" knop (inclusief "Loskoppelen" knop die token revocation triggert).
- [ ] Voeg in het dashboard en/of in de Atelier editor een "Importeer uit Cloud" menu toe (naast de huidige bestandsknoppen).
- [ ] Voeg een file-picker UI toe in de app die de Google Drive mappen/bestanden toont.

### Fase 4: Validatie & Beveiliging (Voor Launch)
- [ ] **End-to-end test PKCE flow:** Verifieer dat de `code_verifier` op geen enkel moment de renderer bereikt (via DevTools Network tab en IPC logging).
- [ ] **Token Revocation test:** Verifieer dat na loskoppelen de tokens ook bij Google ongeldig zijn (niet alleen lokaal verwijderd).
- [ ] **HTTP-blokkade test:** Verifieer dat een WebDAV-verbinding naar een `http://` adres (niet-localhost) geweigerd wordt.

Zodra je wilt beginnen met de ontwikkeling, kunnen we starten met **Fase 1**: het opzetten van de veilige Token Store en de Google Inlog-stroom!
