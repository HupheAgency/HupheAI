# HupheAI — Master Agent Hub 🤖

Dit document is vervangen door de individuele agent-bestanden in de `.agents/` map. Gebruik de Agent Manager om taken te verdelen en voortgang bij te houden.

## Agents & Domeinen

| Agent | Bestand | Domein |
|---|---|---|
| **Claude** | [claude.md](file:///Users/tom.zwarts/HupheAI/HupheShell/.agents/claude.md) | Integratie, Code, SQL & Security |
| **ChatGPT** | [chatgpt.md](file:///Users/tom.zwarts/HupheAI/HupheShell/.agents/chatgpt.md) | React Componenten, HTML & Copy |
| **Gemini** | [gemini.md](file:///Users/tom.zwarts/HupheAI/HupheShell/.agents/gemini.md) | Research, Strategie & Code Patches |

---

## Gecombineerd Logboek (Historie)

| Datum | AI | Wat |
|---|---|---|
| 2026-05-05 | Claude | Admin check bug gefixed, Signup verborgen in LoginPage |
| 2026-05-05 | Claude | AdminPage gebouwd & Super-admin seed uitgevoerd |
| 2026-05-05 | Gemini | Research voltooid: E-mail, Uptime, Sentry, Backups |
| 2026-05-05 | Claude | RLS gefixed op 6 tabellen + Infinite recursion opgelost via `is_admin()` |
| 2026-05-05 | ChatGPT | Concepten Privacy Policy, TOS, Invite mail en Onboarding copy |
| 2026-05-05 | Gemini | Bouwtaken voltooid: `missing-tables.sql` en `sentry-patch.md` |
| 2026-05-05 | ChatGPT | Bouwtaken voltooid: `NoAccessPage.tsx`, `PrivacyPolicyPage.tsx`, `email-invite.html` |
| 2026-05-06 | Gemini | Sequentiële bouwtaken voltooid: `audit-log-indexes.sql` opgeleverd in `/docs/build/`. |

---

> **Instructie**: Voeg nieuwe taken direct toe aan de respectievelijke bestanden in de `.agents/` map.
