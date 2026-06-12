# Fase 3 — Open Signup & Publiek Platform

> **Doel:** Openbaar aanmelden mogelijk maken met keuze tussen los account en bedrijfsaccount.
> Vereist billing, abuse-preventie en volledige GDPR-compliance.
> Begint pas nadat Fase 2 stabiel draait en de referral-beta bewezen heeft gewerkt.

---

## Open Signup

- [ ] **Publieke signup activeren** — aanmelden zonder invite, met e-mailverificatie
- [ ] **Accountkeuze bij signup** — los account of bedrijfsaccount
- [ ] **Abuse-preventie** — captcha, IP-limiting of andere drempel bij registratie
- [ ] **Onboarding flow** — direct een demo-project of template klaarstaat na registratie

---

## Billing

> Besluit eerst: per seat, per gebruik, of flat fee?

- [ ] **Betaalprovider integreren** — Stripe (of alternatief)
- [ ] **Billing-model vastleggen** — per seat, per gebruik, of flat fee
- [ ] **Billing owner flow** — bij bedrijfsaccount vastleggen wie de betalende partij is
- [ ] **Failed payment handling** — wat gebeurt er met toegang als betaling mislukt?
- [ ] **Billing dashboard** — gebruiker kan facturen inzien en betaalmethode beheren

---

## Compliance & Legal

- [ ] **Cookie Policy live** — cookiebanner met consent-management
- [ ] **GDPR-recht op verwijdering** — geautomatiseerde account + data-deletie op verzoek
- [ ] **Privacybeleid & ToS updaten** — versie geschikt voor publiek publiek
- [ ] **Verwerkersovereenkomsten** — DPA met Supabase, Resend, OpenRouter en andere verwerkers

---

## Security & Schaalbaarheid

- [ ] **Security headers** — CSP, HSTS en X-Frame-Options op productiedomein
- [ ] **Rate limiting (verzwaard)** — aangescherpt voor publieke endpoints
- [ ] **Pen-test of security audit** — externe review vóór publieke lancering
- [ ] **Uptime monitoring live** — Betterstack of vergelijkbaar actief en gealarmeerd
- [ ] **Automatische sleutelrotatie** — procedure voor OpenRouter/Groq/Resend keys

---

## Admin & Support

- [ ] **Client Admin rol** — grote klanten kunnen zelf teamleden toevoegen
- [ ] **Support-escalatiepad** — hoe meld je een gebruiker een probleem, hoe handelt de admin het af?
- [ ] **Abuse-rapportage** — beheerder kan accounts rapporteren, blokkeren of verwijderen

---

*Laatste update: 2026-05-06*
