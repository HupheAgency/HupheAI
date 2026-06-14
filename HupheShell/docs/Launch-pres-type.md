# Beta Launch Checklist: Presentatie & Typewriter

Na een grondige inspectie van de codebase (waaronder `safety.md`, `atelier_checklist.md`, en `Betalingsverkeer.md`) heb ik de huidige staat van de Presentatie (Atelier) en Typewriter modules geëvalueerd voor een Beta-lancering.

---

## 1. Typewriter Module

> [!CAUTION]
> ✅ **OPGELOST — XSS / Remote Code Execution**
> ~~In `TypewriterPage.tsx` werd live meegesynchroniseerde content van andere gebruikers direct in de DOM gezet via `editorRef.current.innerHTML = update.content`.~~
> `sanitizeHtml()` (DOMPurify) wordt nu consequent toegepast op alle inkomende HTML in `TypewriterPage.tsx`.

---

## 2. Presentatie Module (Atelier)

> [!WARNING]
> ✅ **OPGELOST — Beelden breken bij delen (Portable Assets)**
> ~~Momenteel worden afbeeldingen lokaal op de computer van de maker opgeslagen. Als je een presentatie deelt via de 'Live' knop, krijgt de collega lege blokken te zien.~~
> Bij het live zetten worden alle lokale afbeeldingspaden (`imagePath`, `imageSlots[].path`) automatisch geüpload naar Supabase Storage en vervangen door publieke URLs. Lokale `.huphe` bestanden blijven ongewijzigd.

> [!IMPORTANT]
> ✅ **OPGELOST — Export Path Traversal Vulnerability**
> ~~In `src/main/index.ts` werd de `formatId` ongefilterd in het schrijfpad geplakt.~~
> `StorageIdSchema`, `sanitizeStorageId()` en `basename()` zijn geïmplementeerd op alle export-paden. Expliciete path traversal blokkade aanwezig op regel 212-213 in `index.ts`.

---

## 3. Betalingssysteem & Gebruikerservaring

> [!NOTE]
> ⚠️ **NOG OPEN — Onzichtbare foutmeldingen bij "Credits op"**
> De `TopUpModal` bestaat en is handmatig bereikbaar via het gebruikersmenu, maar wordt **niet automatisch geopend** bij een 402/403-fout van de API. Gebruikers zien geen melding als hun saldo op is.

> [!NOTE]
> ✅ **OPGELOST — Account Switcher (Bedrijf vs Persoonlijk)**
> ~~De knop om te wisselen tussen accounts was nog niet gebouwd.~~
> Account switcher is volledig gebouwd in `AppShell.tsx` via `account-switcher.ts`. Opgeslagen accounts worden weergegeven in het gebruikersmenu met werkende wissel-functie.

> [!IMPORTANT]
> ⚠️ **NOG OPEN — Stripe Webhook configuratie**
> De Edge Function voor Stripe is af, maar het Stripe Dashboard zélf moet nog geconfigureerd worden zodat betalingen daadwerkelijk de Supabase webhook aanroepen. Dit is een externe actie buiten de codebase.

---

### ⚠️ Let op: Vóór de definitieve Productie-release (Na de Beta)

> [!WARNING]
> ✅ **OPGELOST — Architectuur-refactor `webSecurity`**
> ~~`webSecurity: false` moest worden omgezet naar `true` met een custom protocol.~~
> Alle BrowserWindow-instanties draaien al op `webSecurity: true`. Geen refactor meer nodig.

---

## Status Overzicht (bijgewerkt juni 2026)

| Punt | Status |
|---|---|
| XSS / RCE in Typewriter (DOMPurify) | ✅ Opgelost |
| Portable assets bij live zetten | ✅ Opgelost |
| Path Traversal bij export | ✅ Opgelost |
| `webSecurity` refactor | ✅ Opgelost (stond al op `true`) |
| Account Switcher | ✅ Opgelost |
| Credits-modal automatisch bij 402/403 | ⚠️ Nog open |
| Stripe Webhook configuratie (extern) | ⚠️ Nog open — actie in Stripe Dashboard |

**Conclusie:** Van de originele blockers is alles opgelost. De twee openstaande punten blokkeren geen veiligheid maar wel een naadloze betaalervaring. De app is technisch klaar voor een gesloten Beta.
