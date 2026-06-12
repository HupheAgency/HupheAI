# Fase 2 — Member Referrals & Kleine Teams

> **Doel:** Actieve gebruikers kunnen collega's uitnodigen via een invite-quota.
> Eerste organisatiestructuur, gedeelde projecten en verfijnder toegangsbeheer.
> Begint zodra Fase 1 stabiel draait en de eerste externe gebruikers actief zijn.

---

## Signup & Invite

- [ ] **Referral-systeem** — actieve gebruikers krijgen een invite-quota (bijv. 5 invites)
- [ ] **Quota beheer in AdminPage** — limieten instellen en inzien per gebruiker
- [ ] **Invite-flow uitbreiden** — invite bevat rol, accounttype en eventuele organisatie
- [ ] **Automatische invite-mail** — volledig getemplated via e-mailprovider

---

## Organisaties & Teams

- [ ] **Accountvormen onderscheiden** — los account vs. bedrijfsaccount
- [ ] **Organisaties-tabel** — `organizations` + `organization_members` (tabellen bestaan al, flow nog niet)
- [ ] **Billing owner vastleggen** — wie is de betalende partij binnen een org?
- [ ] **Gedeelde projecten** — bedrijfsleden zien elkaars projecten en context
- [ ] **Templates per organisatie** — templates uploaden en koppelen aan een org

---

## Admin Dashboard

- [ ] **Support Mode (uitgebreid)** — admin kiest een gebruiker en ziet exact hun data en modules
  - Vereist besluit: worden gebruikers geïnformeerd? (GDPR-vereiste)
- [ ] **Quotumbeheer UI** — AI-tokenlimieten per gebruiker instellen en verbruik inzien
- [ ] **Secrets config** — status van OpenRouter/Groq/Resend keys inzien (nooit de keys zelf)
- [ ] **Kosten & verbruik** — inzicht per model en per gebruiker/klant

---

## Backend & Security

- [ ] **Staging-omgeving** — aparte Supabase-project + Electron-build voor testen
- [ ] **`billing_accounts`-tabel** — koppeling tussen org en betalende eigenaar
- [ ] **Mutaties via SECURITY DEFINER RPC's** — centrale logging van alle schrijfacties
- [ ] **Cookie Policy** — cookiebanner/consent als analytics worden toegevoegd
- [ ] **GDPR-recht op verwijdering** — procedure vastleggen voor account- en datadeletie op verzoek
- [ ] **API-sleutelrotatie** — procedure documenteren voor het roteren van OpenRouter/Groq keys
- [ ] **Rate limiting** — beperkingen op auth-endpoints tegen brute force
- [ ] **Security headers** — CSP, HSTS en X-Frame-Options configureren

---

## UX

- [ ] **Instellingen uitbreiden** — profielnaam bewerken, notificatievoorkeuren
- [ ] **Losse accounts** — zien alleen eigen werk en expliciet gedeelde sessies
- [ ] **Bedrijfsaccounts** — gedeelde projecten en context organisatiebreed

---

*Laatste update: 2026-05-06*
