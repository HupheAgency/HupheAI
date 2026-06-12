# Claude — Actuele Safety Status HupheAI

Projectroot:
`/Users/tom.zwarts/HupheAI/HupheShell`

Lees eerst:
- `/Users/tom.zwarts/HupheAI/HupheShell/docs/safety.md`
- `/Users/tom.zwarts/HupheAI/HupheShell/docs/Betalingsverkeer.md`

Dit document is bijgewerkt na de laatste Claude-update. De eerdere Claude-opdracht rond privacy, server-side security tests, audit logging en CI/dependency guardrails is volgens `docs/safety.md` afgerond.

## Stand Van Zaken

### Afgerond Door Codex

- Lokale Electron command-injection fixes: risicovolle `exec()` string-interpolatie vervangen door veilige `spawn()`-argumenten.
- Path traversal checks en `clientId`/`formatId` validatie toegevoegd.
- `shell.openExternal` en `will-navigate` afgeschermd.
- Ad/HTML logvenster gehard.
- CSP helper op het hoofdvenster aangesloten.
- High-risk IPC payload-validatie toegevoegd met `zod`.
- Security smoke-test toegevoegd via `npm run test:security`.
- Resterende `npm audit` kwetsbaarheden geclassificeerd en gecontroleerd opgelost.
- IPC payload-validatie uitgebreid naar aanvullende template/import/export/AI/doc/media handlers, settings IPC, Huphe Code IPC en Engine IPC.
- `webSecurity: false` verwijderd uit BrowserWindows.
- Custom `huphe://file/...` protocol toegevoegd voor lokale assets, met extension allowlist.
- Renderer preview-routes gebruiken nu `toHupheFileUrl`.
- Security smoke-test controleert nu ook `webSecurity` en `huphe://` regressies.
- Dependency upgrade-traject afgerond:
  - `electron` 32 -> 39.8.10.
  - `electron-builder` 25 -> 26.15.2.
  - `electron-vite` 2 -> 5.0.0.
  - `vite` 5 -> 7.3.5.
  - `@vitejs/plugin-react` 4 -> 5.1.1.
  - `npm audit --audit-level=low` meldt 0 vulnerabilities.
  - `npm run test:security` en `npm run build` slagen.

### Afgerond Door Claude

- Supabase RLS fixes uitgevoerd.
- Edge Function service-role audit uitgevoerd.
- DOMPurify aangesloten op de belangrijkste HTML-renderpaden.
- File upload validatie met size limits en magic-byte checks aangesloten.
- Electron productie-hardening opgepakt: devtools blokkeren, fuses, sandbox-test.
- Rate limiting voor AI-proxy's opgepakt.
- Audit logging voor admin-acties toegevoegd.
- Eerste `npm audit fix` uitgevoerd; resterende dependency-upgrades zijn daarna door Codex afgerond.
- Privacy/data-retentie opgepakt:
  - `delete_my_data()` GDPR-RPC deployed.
  - Persoonlijke content wordt verwijderd.
  - Audit logs worden geanonimiseerd.
  - Stripe/betalingsrecords blijven bewaard waar wettelijk nodig.
  - Settings bevat een "Account en data verwijderen" actie.
- Server-side security tests/CI opgepakt:
  - `npm run test:security` werkt.
  - `.github/workflows/security.yml` aangemaakt met smoke tests en `npm audit --audit-level=high`.
- Audit logging uitgebreid:
  - trigger op `wallet_transactions`.
  - index op `audit_log.action`.
- Dependency guardrails opgepakt:
  - `.github/dependabot.yml` aangemaakt.
  - breaking upgrades bewust uitgesloten tot apart upgrade-traject.

## Actuele Open Punten

Volgens `docs/safety.md` zijn er op dit moment geen open safety release blockers.

## Actuele Opdracht Voor Claude

Er is op dit moment geen actieve Claude-taak vanuit de safety-lijst.

Claude kan voorlopig alleen helpen met:

- controleren of `docs/safety.md` correct blijft na nieuwe Codex-wijzigingen;
- backend/database follow-up als Codex bij het `huphe://` protocol of IPC-validatie een Supabase-afhankelijkheid ontdekt;
- review van eventuele CI/dependency-config als later nieuwe auditmeldingen ontstaan.

## Niet Oppakken Door Claude

Laat onderstaande punten bij Codex, tenzij de gebruiker expliciet anders vraagt:

- Nieuwe Electron/Vite/electron-builder major upgrades uitvoeren zonder aparte opdracht.
- Renderer/main-process security smoke-test uitbreiden.
- Lokale Electron window/security refactors.

## Rapportage Als Claude Later Toch Iets Doet

Na nieuw werk:

1. Update `docs/safety.md`.
2. Zet bij elk punt of het code, test, documentatie of nog open is.
3. Noem exact welke bestanden zijn aangepast.
4. Noem welke tests of checks zijn gedraaid.
