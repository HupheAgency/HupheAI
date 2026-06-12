# Claude — Actuele Safety Handoff HupheAI

Projectroot:
`/Users/tom.zwarts/HupheAI/HupheShell`

Lees eerst:
- `/Users/tom.zwarts/HupheAI/HupheShell/docs/safety.md`
- `/Users/tom.zwarts/HupheAI/HupheShell/docs/Betalingsverkeer.md`

Dit document is opgeschoond na de laatste Codex- en Claude-rondes. Oude taken rond Stripe, Fal.ai, OpenRouter, RLS, DOMPurify, Electron fuses en de eerste betalingsflow zijn niet meer de actieve opdracht, tenzij `docs/safety.md` ze opnieuw als open markeert.

## Stand Van Zaken

### Afgerond Door Codex

- Lokale Electron command-injection fixes: risicovolle `exec()` string-interpolatie vervangen door veilige `spawn()`-argumenten.
- Path traversal checks en `clientId`/`formatId` validatie toegevoegd.
- `shell.openExternal` en `will-navigate` afgeschermd.
- Ad/HTML logvenster gehard.
- CSP helper op het hoofdvenster aangesloten.
- High-risk IPC payload-validatie toegevoegd met `zod`.
- Security smoke-test toegevoegd via `npm run test:security`.
- Resterende `npm audit` kwetsbaarheden geclassificeerd als breaking upgrade-traject.

### Afgerond Door Claude

- Supabase RLS fixes uitgevoerd.
- Edge Function service-role audit uitgevoerd.
- DOMPurify aangesloten op de belangrijkste HTML-renderpaden.
- File upload validatie met size limits en magic-byte checks aangesloten.
- Electron productie-hardening opgepakt: devtools blokkeren, fuses, sandbox-test.
- Rate limiting voor AI-proxy's opgepakt.
- Eerste audit logging voor admin-acties toegevoegd.
- `npm audit fix` uitgevoerd tot de resterende breaking upgrades.

## Actuele Opdracht Voor Claude

Pak alleen onderstaande backend/database/externe-provider taken op. Laat lokale Electron/Codex-bestanden met rust, behalve wanneer dat expliciet nodig is voor documentatie.

### 1. Privacy En Data-Retentie

Maak dit concreet en implementeer waar backend/database nodig is:

- Retentiebeleid voor prompts, gegenereerde content, assets, exports, wallets, transactions, audit logs en lokale/projectdata.
- Beschrijf welke data naar externe providers gaat: OpenRouter, Fal.ai, Supabase, Stripe en eventuele andere providers.
- Leg vast hoelang data bewaard wordt en wie toegang heeft.
- Ontwerp of implementeer een "Verwijder mijn data" flow voor GDPR:
  - user data
  - workspace/project data
  - assets/storage objects
  - prompts/generaties
  - audit/event logs waar wettelijk mogelijk
  - Stripe/betalingsdata waar wettelijk niet volledig verwijderd mag worden
- Werk `docs/safety.md` bij met wat daadwerkelijk is geïmplementeerd en wat alleen beleid/documentatie is.

### 2. Server-Side Security Tests

Voeg tests toe of documenteer exact hoe ze gedraaid moeten worden:

- RLS tests: User A mag geen data van User B lezen of wijzigen.
- Wallet/RPC tests: gebruikers kunnen saldo niet rechtstreeks verhogen of muteren.
- Edge Function auth tests: zonder JWT geen toegang, behalve gesigneerde webhooks.
- Stripe webhook tests: signature verplicht en event-idempotentie werkt.
- Rate limit tests: OpenRouter/Fal.ai proxies blokkeren boven de limiet.
- Storage tests: private buckets blijven private; signed URLs verlopen.

Zet in `docs/safety.md` welke tests bestaan, hoe je ze draait, en welke nog ontbreken.

### 3. Server-Side Audit Logging Gap Check

Controleer of audit logging nu voldoende breed is. Voeg toe waar backend/database nodig is:

- Login/security events.
- Rolwijzigingen en admin-acties.
- Credit-mutaties en wallet-acties.
- Stripe webhook events.
- Geblokkeerde rate-limit acties.
- Geweigerde Edge Function requests.

Audit logs mogen nooit secrets, tokens, signed URLs of volledige gevoelige promptinhoud bevatten.

### 4. CI En Dependency Guardrails

Alleen oppakken als je toegang hebt tot CI/repo-config:

- Voeg een dependency/security check toe voor high/critical vulnerabilities.
- Documenteer of configureer Dependabot/Renovate.
- Forceer geen breaking `npm audit fix --force` zonder expliciete toestemming.
- De resterende audit issues vereisen een apart upgrade-traject:
  - Electron 32 -> 42
  - Vite/electron-vite/esbuild
  - electron-builder/tar

## Niet Oppakken Door Claude

Deze blijven bij Codex of zijn expliciet lokale Electron-refactors:

- `webSecurity: false` vervangen door een custom `huphe://` protocol.
- Overige niet-kritieke IPC handlers per schema valideren.
- Electron/Vite/electron-builder breaking upgrades uitvoeren.
- Renderer/main-process smoke-test uitbreiden.
- Lokale Electron window/security refactors.

## Rapportage

Na je werk:

1. Update `docs/safety.md`.
2. Zet bij elk punt of het code, test, documentatie of nog open is.
3. Noem exact welke bestanden je hebt aangepast.
4. Noem welke tests of checks je hebt gedraaid.
