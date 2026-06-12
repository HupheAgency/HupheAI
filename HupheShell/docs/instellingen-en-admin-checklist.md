# Instellingen & Admin — Launch Roadmap

> **Doel:** Veilige, schaalbare en gebruiksvriendelijke omgeving neerzetten vóórdat de backend-architectuur definitief wordt vastgelegd.
>
> **Voortgang:** 23 van ~45 items afgevinkt. Zie sectie-headers voor per-sectie status.

---

## ⚠️ Eerst Beslissen — Blokkerende Open Vragen

Deze vragen blokkeren verdere implementatie. Besluit ze vóór je begint met bouwen.

- [ ] **Templates**: Kunnen klanten zelf templates beheren, of alleen jij als super-admin?
- [ ] **Auth-methode**: Wordt de invite-flow Magic Link, wachtwoord, of allebei?
- [ ] **Billing moment**: Wordt betaling afgedwongen al in de invite-beta, of pas bij open signup?
- [ ] **Support Mode & privacy**: Worden gebruikers geïnformeerd dat admins read-only kunnen meekijken? (GDPR-vereiste)

---

## Huidige Situatie

De app gebruikt Supabase Auth en bouwt langzaam op naar een volwaardig platform. Momenteel zijn rollen en rechten deels hardcoded:

| Onderdeel | Status |
|---|---|
| Authenticatie | Supabase Auth, creëert rijen in `user_profiles` |
| Toegang | `AppShell` toont Backstage alleen als user in `admin_users` staat |
| Modules | Hardcoded in frontend met lokale `active` vlag |
| Instellingen | Accountnaam, templates en lokale API-sleutels |

---

## Productrichting

### Launchfases

| Fase | Omschrijving | Status |
|---|---|---|
| **Fase 1 — Private invite beta** | Signup dicht; alleen admin-uitnodigingen. Doelgroep: collega's & interne testers. Enige module: **Atelier**. | Actief |
| **Fase 2 — Member referrals** | Actieve leden krijgen invite-quota (bijv. 5). Admin beheert quota's per gebruiker. | Gepland |
| **Fase 3 — Open signup** | Openbaar aanmelden met keuze Los of Bedrijfsaccount. Vereist billing, support en abuse-preventie. | Gepland |

### Accountvormen

**Los account**
- Één gebruiker, eigen workspace, ziet alleen eigen werk.
- Kan later worden omgezet naar bedrijfsaccount.

**Bedrijfsaccount**
- Eén billing owner; meerdere leden binnen dezelfde organisatie.
- Gedeelde projecten, templates en context zijn organisatiebreed beschikbaar.
- Rollen: `owner`, `admin`, `member`, `client_admin`.

---

## Checklist

### 0. Fundament vóór Launch `[ 5 / 8 ]`

Infrastructuur en wettelijke verplichtingen die klaar moeten zijn vóór de eerste externe gebruiker.

- [ ] **Omgevingen**: Aparte staging- en productieomgeving inrichten (nu alles op één omgeving = risico).
- [ ] **Domeinen & SSL**: Custom domein geconfigureerd, HTTPS afgedwongen.
- [x] **Database backups**: Onderzoek gedaan naar retentie en PITR.
- [x] **E-mailprovider**: Resend geconfigureerd voor invite-mails en auth.
- [x] **Privacy Policy**: Concept geschreven en als pagina-component beschikbaar.
- [x] **Terms of Service**: Concept geschreven en juridische basis gelegd.
- [ ] **Cookie Policy**: Cookiebanner/consent indien analytics of tracking wordt gebruikt.
- [x] **Eerste admin seeden**: Admin-tabel aangemaakt en eerste super-admin geseet.

---

### 1. Login- en Toegangsflow `[ 4 / 9 ]`

- [ ] **Signup beleid**
    - [x] Fase 1: Publieke signup uitgeschakeld; alleen admin-uitnodigingen.
    - [ ] Fase 2: Referral-systeem met invite-quota's.
    - [ ] Fase 3: Open signup implementeren.
- [ ] **Invite-flow**
    - [ ] Admin voegt e-mailadres toe aan allowlist.
    - [ ] Invite bevat: rol, accounttype, organisatie en quota.
    - [ ] Invite-mail wordt automatisch verstuurd via e-mailprovider.
- [x] **Profiel bij eerste login**: Profiel-data en onboarding-copy geïntegreerd.
- [x] **TOS-acceptatie vastleggen**: `tos_acceptances` + `CURRENT_TOS_VERSION` + eerste-login checkbox geïntegreerd.
- [x] **"Geen toegang"-state**: Scherm gebouwd voor uitgeschakelde of niet-geactiveerde accounts.
- [ ] **Wachtwoordherstel / sessie**: Definitieve keuze implementeren (Magic Link of wachtwoord).

---

### 2. Admin Dashboard `[ 4 / 12 ]`

> Aanbevolen als aparte admin-only tab. Backstage = machinekamer; Admin = bedrijfsbeheer.

- [x] **Gebruikers & Toegang**
    - [x] Overzicht actieve gebruikers in AdminPage.
    - [x] Gebruikers (de)activeren via Admin UI.
    - [ ] Support Mode: read-only meekijken met een gebruiker (zie Open Vraag over privacy/GDPR).
- [ ] **Module & Quota Beheer**
    - [ ] Modules per gebruiker of klant configureren (launch: alleen Atelier).
    - [ ] Limieten instellen voor AI-tokens/generaties per gebruiker.
    - [ ] Inzicht in kosten en verbruik per model en klant.
- [ ] **Organisaties & Klanten**
    - [ ] Onderscheid losse accounts vs. bedrijfsaccounts.
    - [ ] Billing owner vastleggen per organisatie.
    - [ ] Templates uploaden en koppelen aan specifieke organisaties.
- [ ] **Systeembeheer**
    - [x] Maintenance Mode: globale toggle in AdminPage + pre-login onderhoudsscherm.
    - [x] Auditlog: laatste activiteiten worden getoond in AdminPage.
    - [ ] Secrets config: status van OpenRouter/Groq keys inzien (nooit de keys zelf tonen).

---

### 3. Normale Accountomgeving (UX) `[ 2 / 6 ]`

- [ ] **Gepersonaliseerde Home**
    - [ ] Alleen geautoriseerde modules tonen (launch-filter: alleen Atelier).
- [x] **Lege state vermijden**: WelcomePanel en project-placeholder geïntegreerd.
- [ ] **Projecten & Documenten**
    - [ ] Bedrijfsleden zien gedeelde bedrijfsprojecten en context.
    - [ ] Losse accounts zien alleen eigen werk en expliciet gedeelde sessies.
- [ ] **Clean Interface**
    - [x] Geen Backstage of Admin tabs zichtbaar voor klanten.
    - [ ] Geen toegang tot data van andere organisaties (via RLS, zie sectie 4).
- [ ] **Instellingen**: Profiel bewerken, uitloggen, notificatievoorkeuren.

---

### 4. Backend & Data Model (Supabase) `[ 6 / 10 ]`

- [x] **Nieuwe tabellen aanmaken**
    - [x] `modules`, `user_module_access`, `invite_quotas`.
    - [x] `organizations` & `organization_members`.
    - [x] `maintenance_config`, `tos_acceptances`, `audit_log`.
    - [ ] `billing_accounts` — Koppeling tussen org en betalende eigenaar.
    - [x] `usage_quotas` — Limieten voor AI-verbruik.
- [ ] **Migratie hardcoded modules**: Bestaande frontend-modules overzetten naar de nieuwe `modules`-tabel.
- [x] **Security & RLS**
    - [x] RLS actief op alle tabellen; data-isolatie via `is_admin()`.
    - [x] Alleen admins mogen user-, invite- en moduledata beheren.
    - [ ] Mutaties via `SECURITY DEFINER` RPC's voor centrale logging.
    - [ ] RLS-policies testen met een niet-admin testaccount vóór launch.

---

### 5. Security & Monitoring `[ 2 / 6 ]`

- [ ] **Rate limiting**: Beperkingen instellen op auth-endpoints (login, invite) tegen brute force.
- [ ] **Security headers**: CSP, HSTS en X-Frame-Options configureren.
- [x] **Error tracking**: Sentry geïntegreerd in Main & Renderer.
- [x] **Uptime monitoring**: Onderzoek gedaan; Betterstack aanbevolen.
- [ ] **GDPR-recht op verwijdering**: Procedure vastleggen voor account- en datadeletie op verzoek.
- [ ] **API-sleutelrotatie**: Procedure gedocumenteerd voor het roteren van OpenRouter/Groq keys.

---

### 6. Billing `[ 0 / 4 ]`

> Besluit eerst wanneer billing afgedwongen wordt (zie Open Vragen).

- [ ] **Betaalprovider**: Stripe (of alternatief) integreren.
- [ ] **Billing-model vastleggen**: Per seat, per gebruik, of flat fee?
- [ ] **Billing owner flow**: Bij bedrijfsaccount vastleggen wie de betalende partij is.
- [ ] **Failed payment handling**: Wat gebeurt er met toegang als betaling mislukt?

---

## Strategisch Advies

### A. Gebruiksvriendelijkheid voor de Klant
- **"It Just Works"**: Verberg de complexiteit van API-sleutels. Gebruik centrale keys van HupheAI om de drempel laag te houden.
- **Onboarding**: Zorg voor een "vliegende start". Een leeg scherm is dodelijk — zorg dat er direct een demo-project of template klaarstaat.

### B. Administratieve Schaalbaarheid
- **Organization-First**: Behandel elke gebruiker als onderdeel van een organisatie (ook als het een eenmanszaak is). Houdt queries en rechtenstructuur consistent.
- **Client Admin**: Geef grote klanten een `client_admin` rol zodat zij zelf teamleden kunnen toevoegen — scheelt support-tijd.

---

*Laatste update: 2026-05-06*
