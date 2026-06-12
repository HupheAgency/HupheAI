# Beta Launch Checklist: Presentatie & Typewriter

Na een grondige inspectie van de codebase (waaronder `safety.md`, `atelier_checklist.md`, en `Betalingsverkeer.md`) heb ik de huidige staat van de Presentatie (Atelier) en Typewriter modules geëvalueerd voor een Beta-lancering.

Hieronder staat een overzicht van de **kritieke blockers** die opgelost moeten worden voordat echte gebruikers de modules veilig en werkend kunnen testen.

---

## 1. Typewriter Module

> [!CAUTION]
> **Extreem veiligheidsrisico (XSS / Remote Code Execution)**
> In `TypewriterPage.tsx` wordt live meegesynchroniseerde content van andere gebruikers direct in de DOM gezet via `editorRef.current.innerHTML = update.content`. Omdat de applicatie draait met `webSecurity: false` (zoals gedocumenteerd in `safety.md`), kan een kwaadwillende gebruiker een onzichtbaar script typen dat bij alle andere kijkers willekeurige lokale bestanden steelt of wist. 
> **Oplossing:** Implementeer `DOMPurify` voordat inkomende HTML in de editor wordt geplaatst.

---

## 2. Presentatie Module (Atelier)

> [!WARNING]
> **Beelden breken bij delen (Portable Assets)**
> Volgens de `atelier_checklist.md` staat het item *"Portable assets: geuploade/gegenereerde beelden opslaan in Supabase Storage zodat ze niet breken bij delen"* nog open. Momenteel worden afbeeldingen lokaal op de computer van de maker opgeslagen. Als je een presentatie deelt met een collega via de 'Live' knop, krijgt de collega lege blokken te zien omdat de afbeeldingen ontbreken.
> **Oplossing:** Upload alle lokale assets naar Supabase Storage en gebruik de publieke URL's in het presentatie-object.

> [!IMPORTANT]
> **Export Path Traversal Vulnerability**
> In `src/main/index.ts` (bijv. bij `banner:export`) wordt de `formatId` ongefilterd in het schrijfpad geplakt. Een gemanipuleerde export kan hierdoor ongewenste bestanden overschrijven op de hardeschijf van de gebruiker (Path Traversal). Dit moet gevalideerd worden vóór de launch.

---

## 3. Betalingssysteem & Gebruikerservaring

> [!NOTE]
> **Onzichtbare foutmeldingen bij "Credits op"**
> Het backend-betalingssysteem (Edge Functions) werkt perfect en geeft netjes een `402 Payment Required` of `403 Forbidden` foutcode terug als een gebruiker geen saldo heeft. De Electron-frontend toont hier momenteel echter nog geen visuele melding (modal) voor. Gebruikers zullen op "Genereer Beeld" klikken en denken dat de app stuk is, terwijl ze eigenlijk moeten opwaarderen.

> [!NOTE]
> **Account Switcher (Bedrijf vs Persoonlijk)**
> De knop rechtsboven om snel te wisselen tussen het `tom.zwarts@roorda.nl` (Bedrijfsaccount) en `tfzwarts@gmail.com` (Persoonlijk account) is nog **niet** gebouwd (het implementatieplan hiervoor staat wel klaar). Testen van het nieuwe facturatiesysteem zal lastig zijn zonder deze UI-functie.

> [!IMPORTANT]
> **Stripe Webhook configuratie**
> De Edge Function voor Stripe is af, maar het Stripe Dashboard zélf moet nog geconfigureerd worden zodat betalingen daadwerkelijk de Supabase webhook aanroepen.

---

### Conclusie

De modules zijn functioneel heel ver, maar absoluut **nog niet klaar** voor een externe Beta-lancering. De veiligheidslekken (XSS in Typewriter) en de gebroken afbeeldingen bij het delen van presentaties zullen onmiddellijk voor grote problemen zorgen. 

Zodra je groen licht geeft, kan ik beginnen met het oplossen van deze punten (bijv. starten met `DOMPurify` en de Account Switcher)!

---

### ⚠️ Let op: Vóór de definitieve Productie-release (Na de Beta)

> [!WARNING]
> **Architectuur-refactor: `webSecurity: false`**
> Voor deze (gesloten) Beta-lancering dekken we het grootste gevaar van `webSecurity: false` af door `DOMPurify` te installeren (punt 1). Hierdoor kunnen aanvallers geen scripts meer injecteren.
> **Echter:** Vóór de échte, publieke productie-lancering moet dit structureel opgelost worden (zoals al op de radar staat in `safety.md`). Dit betekent `webSecurity: true` aanzetten en een custom `huphe://` protocol bouwen in het Main-proces dat als veilige 'sandbox' dient voor het inladen van lokale presentatie-afbeeldingen. Omdat dit een grote refactor is (1-2 dagen), is dit geen harde blocker voor de Beta, maar wel een absolute vereiste voor productie.
