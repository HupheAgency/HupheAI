# Atelier Final Check

Laatst bijgewerkt: 2026-05-07

Scope: code-check zonder runtime test. Er is niets aangepast aan de app-code. Dit document beschrijft de huidige loginflow, de Atelier-flow en wat er nog mis kan gaan voor een fijne eerste beta.

## Korte Conclusie

Atelier heeft genoeg basis om met een kleine collega-beta te starten, mits de beta gecontroleerd wordt ingericht: gebruikers moeten via invite toegang krijgen, alleen de module Atelier moet aanstaan voor beta-gebruikers, er moet minimaal een goed template klaarstaan en de database/RLS/RPC-kant moet exact matchen met wat de frontend verwacht.

De gewone bewerkflow van Atelier is al behoorlijk compleet: document/presentatie uploaden, template kiezen, tekst reviewen, slides bewerken, opslaan, exporteren en projecten terugvinden. De grootste risico's zitten niet in het tekenen van slides zelf, maar in toegang, templates, opslag en de live/share-koppelingen.

## Huidige Login- En Toegangsflow

1. De app start met Supabase-configuratiecheck.
2. Als Supabase niet is ingesteld, toont de app een configuratiescherm.
3. Daarna wordt de huidige sessie opgehaald.
4. Als maintenance mode actief is, ziet de gebruiker de maintenance pagina.
5. Zonder sessie komt de gebruiker op de loginpagina.
6. De loginpagina heeft alleen e-mail/wachtwoord login en wachtwoord reset. Er staat geen open signup-knop meer.
7. Er is wel een knop om een beta-aanvraag in te dienen.
8. Na login maakt/updatet de app een `user_profiles` rij.
9. De app checkt daarna:
   - of `user_profiles.is_active` actief is;
   - of de actuele voorwaarden zijn geaccepteerd;
   - welke modules de gebruiker in `user_module_access` heeft;
   - of die modules ook globaal actief zijn in `modules`.
10. Inactieve gebruikers zien `NoAccessPage`.
11. Gebruikers zonder akkoord op de voorwaarden zien `TosAcceptancePage`.
12. Daarna opent `AppShell`.

## Huidige AppShell-Flow

De menupil toont altijd `Home` en `Instellingen`. Andere modules verschijnen alleen als de gebruiker toegang heeft via `user_module_access` en de module globaal actief is.

Voor een gewone beta-gebruiker betekent dit: als alleen Atelier is toegekend, ziet die gebruiker Home, Atelier en Instellingen.

Admins worden correct per ingelogde gebruiker gecheckt via `admin_users.user_id`. De eerdere bug waarbij iedereen admin kon worden zodra er een adminrij bestond, lijkt in de huidige code opgelost. Admin zit nu ook embedded in `AppShell`, waardoor de menupil zichtbaar blijft, net zoals bij Instellingen.

## Huidige Atelier-Flow

1. De gebruiker klikt op Atelier in de menupil.
2. De gebruiker sleept of kiest een bestand.
3. Toegestane extensies in de UI zijn nu `.txt`, `.md`, `.docx`, `.key`, `.ppt` en `.pptx`.
4. Bij `.key` wordt een directe Keynote-import geprobeerd.
5. Bij `.ppt` en `.key` als presentatie-input gebruikt de app Keynote/AppleScript om naar PowerPoint te converteren.
6. Bij `.pptx` wordt de inhoud direct uit het pptx-bestand gelezen.
7. Bij tekstbestanden kiest de gebruiker of Atelier zelf invult of met AI invult.
8. Daarna kiest de gebruiker een template.
9. Zonder template kan de analyse niet starten.
10. Tekstbestanden krijgen standaard een review/label-stap.
11. Na analyse opent de editor.
12. In de editor kan de gebruiker slides aanpassen, comments/notities gebruiken, live delen, opslaan, PDF exporteren en Keynote exporteren.
13. Projecten komen terug in Documents via lokale projectbestanden.

## Wat Goed Staat Voor Beta

- Open signup is uit de UI gehaald.
- Admin-toegang wordt per gebruiker gecontroleerd.
- Inactieve accounts worden geblokkeerd.
- Voorwaarden-acceptatie zit in de flow.
- Moduletoegang werkt op basis van gebruiker plus globale module-status.
- Admin kan gebruikers activeren/blokkeren, admin maken/verwijderen en modules per gebruiker beheren.
- API-sleutels staan nu in Admin, niet meer in gewone Instellingen.
- Instellingen blijft beschikbaar voor templates, account en tekst-review voorkeuren.
- Atelier heeft een echte werkflow: upload, template, review, editor, opslaan, export.
- Projecten kunnen lokaal worden opgeslagen en later weer geopend.
- Er is een basis voor live sessies, join codes, delen en notificaties.

## Belangrijkste Risico's Voor De Eerste Beta

### P0 - Voor Beta Eerst Controleren Of Fixen

1. Invite/login moet end-to-end getest worden.
   De app heeft e-mail/wachtwoord login en wachtwoord reset. Supabase invites sturen vaak een magic/confirm link. De app heeft wel deep-link handling voor `hupheai://auth-callback`, maar de exacte invite-flow moet getest worden: uitnodigen, link openen, wachtwoord instellen, terug in de app komen en inloggen.

2. Beta-gebruikers moeten expliciet Atelier-toegang krijgen.
   Een gebruiker met account maar zonder `user_module_access` voor Atelier ziet Atelier niet. Voor elke beta-gebruiker moet in Admin of Supabase de module Atelier toegekend worden, en de module `atelier` moet globaal actief zijn.

3. Er moet minimaal een goed template bestaan.
   Atelier kan niet prettig starten zonder template. De template-select toont dan "Geen templates beschikbaar" en analyse kan niet verder. Voor de eerste beta moet er minimaal een getest Keynote-template klaarstaan met werkende layouts, tekstvelden en mappings.

4. `.docx` staat aan in de UI, maar er is geen echte docx-parser gevonden.
   `.docx` wordt geaccepteerd, maar de code lijkt daarna `file.text()` te gebruiken. Een docx is een zip/binary bestand, dus dit kan onleesbare tekst of rare output geven. Voor beta: of docx verbergen, of echte docx-extractie toevoegen.

5. Frontend en SQL voor live/join/share lijken niet op elkaar afgestemd.
   In `docs/build/atelier-rpcs.sql` heet de parameter voor join `p_share_code`, maar de frontend roept `join_presentation_by_code` aan met `p_code`.
   De SQL retourneert JSON met `presentation_id`, maar de frontend lijkt de volledige RPC-return direct als presentatie-id te gebruiken.
   `sync_presentation_state` verwacht volgens SQL `p_presentation_id`, maar de hook stuurt `p_id`.
   `share_presentation` verwacht volgens SQL `p_user_email`, maar de frontend stuurt `p_recipient_email`.
   Gevolg: live join, live sync en in-app delen kunnen stuklopen zodra deze SQL zo wordt gebruikt.

6. Frontend inserts matchen mogelijk niet met het schema in `docs/build`.
   De frontend insert op `presentations` zet geen `owner_id`, terwijl `docs/build/atelier-schema.sql` `owner_id uuid NOT NULL` definieert.
   De frontend insert op `clients` zet alleen `name`, terwijl het build-schema ook `client_id text NOT NULL` noemt.
   Template-upserts zetten meestal alleen `client_id` en `template_data`, terwijl sommige SQL-bestanden ook `owner_id` en `name` verwachten.
   Dit moet voor beta worden rechtgetrokken: of de database heeft defaults/triggers, of de frontend moet deze velden meesturen.

7. RLS moet echt getest worden met twee gewone accounts.
   Vooral deze vragen moeten bewezen worden:
   - Kan gebruiker A de projecten/presentaties van gebruiker B zien?
   - Kan gebruiker A templates aanpassen die niet van A zijn?
   - Werkt delen alleen via membership/share-code?
   - Kan een niet-admin geen module/admin/API-key dingen wijzigen?

### P1 - Sterk Aanbevolen Voor Een Fijne Beta

1. Auto-save recovery is onduidelijk.
   Nieuwe projecten zonder opgeslagen bestand worden automatisch in `localStorage` gezet, maar er is geen duidelijke herstel-flow gevonden. Een gebruiker kan denken dat werk opgeslagen is, terwijl er geen zichtbaar herstelpunt is na sluiten/crash.

2. Directe `.key` import gedraagt zich anders dan tekst/analyse.
   Tekst- en presentatieanalyse vanuit de embedded Atelier-flow openen daarna de full editor. Directe `.key` import lijkt in de embedded flow zelf te blijven. Voor gebruikers voelt dat mogelijk inconsistent.

3. Template sharing is half aangesloten.
   Settings heeft UI voor deelcodes en claimen, en er is SQL voor `generate_template_share_code` en `join_template_by_code`. Maar de huidige template-upserts zetten niet overal `owner_id` en `name`. Daardoor kan "alleen eigenaar mag delen" onverwacht falen.

4. Share success checkt niet duidelijk genoeg de RPC-uitkomst.
   Bij in-app delen wordt vooral op SQL-error gecheckt. Als de RPC JSON teruggeeft met `ok: false`, kan de UI alsnog succes tonen als dat niet expliciet wordt verwerkt.

5. Projecten en live presentaties zijn twee opslagwerelden.
   Lokale projecten staan op de computer. Live/shared presentaties staan in Supabase. Dat is prima voor beta, maar gebruikers moeten snappen wanneer iets lokaal is en wanneer iets gedeeld/live is.

6. Export-preflight is nog licht.
   De preflight checkt template, lege slides en onbekende layouts. Voor beta zou het fijner zijn als ook ontbrekende belangrijke velden, image slots, niet-gekoppelde tags en export-onmogelijke content duidelijk worden gemeld.

7. API-key toegang is nu vooral UI-gated.
   De API-key UI staat in Admin, maar de IPC-methodes `setKey` en `hasKey` bestaan nog algemeen in preload/main. Voor een kleine vertrouwde beta is dat waarschijnlijk acceptabel, maar het is nog geen harde security-laag.

8. Huphe Code heeft nog een eigen API-config UI.
   Dit is waarschijnlijk geen probleem zolang Huphe Code niet aan beta-gebruikers wordt toegekend. Als die module later zichtbaar wordt voor niet-admins, moet die key-config ook achter adminrechten.

### P2 - Kan Later, Maar Wel Goed Om Te Weten

1. Maintenance mode wordt bij start gecheckt, niet live op alle open sessies.
2. Billing, referral invites, bedrijfsaccounts en publieke signup hoeven niet in de eerste beta.
3. Volledige audit-logging van alle Atelier-acties is nuttig later, maar niet nodig om collega's te laten testen.
4. Een herstel-/versiebeheerlaag voor presentaties wordt belangrijk zodra klanten ermee werken.
5. Een nette onboarding voor "maak je eerste template" helpt zodra minder technische gebruikers instappen.

## Aanbevolen Eerste Beta-Flow

1. Admin zet publieke signup uit in Supabase.
2. Admin nodigt collega's uit via Supabase Auth of keurt beta-aanvragen goed.
3. Admin zorgt dat elke beta-gebruiker actief is in `user_profiles`.
4. Admin geeft elke beta-gebruiker alleen de module Atelier.
5. Admin zet globaal alleen Atelier aan voor de launch/beta-context.
6. Admin zet minimaal een getest Keynote-template klaar.
7. Gebruiker logt in.
8. Gebruiker accepteert voorwaarden.
9. Gebruiker opent Atelier.
10. Gebruiker uploadt `.txt`, `.md`, `.pptx` of een getest `.key` bestand.
11. Gebruiker kiest het template.
12. Gebruiker loopt de review-stap door.
13. Gebruiker bewerkt slides.
14. Gebruiker slaat handmatig op.
15. Gebruiker exporteert naar Keynote/PDF.

Voor de eerste beta zou ik live delen en template delen alleen gebruiken als ze expliciet getest zijn met twee accounts. Anders liever markeren als experimenteel of tijdelijk buiten de testscope houden.

## Minimale Beta-Checklist

- [ ] Supabase signup staat uit.
- [ ] Redirect URL `hupheai://auth-callback` staat in Supabase.
- [ ] Invite-flow is getest vanaf een schone collega-account.
- [ ] Eerste admin-account staat in `admin_users`.
- [ ] Iedere beta-gebruiker heeft `user_profiles.is_active = true`.
- [ ] Iedere beta-gebruiker heeft moduletoegang tot Atelier.
- [ ] Globale module `atelier` staat actief.
- [ ] Andere modules staan uit of worden niet toegekend.
- [ ] Minimaal een template is geupload en getest.
- [ ] `.docx` is gefixt of tijdelijk niet zichtbaar als ondersteund bestand.
- [ ] RLS is getest met twee gewone accounts.
- [ ] Presentatie opslaan en opnieuw openen is getest.
- [ ] Keynote export is getest.
- [ ] PDF export is getest.
- [ ] Live/share RPC's zijn gefixt of buiten beta-scope gezet.
- [ ] Template sharing RPC's zijn gefixt of buiten beta-scope gezet.
- [ ] API-keys zijn door admin gezet voordat gebruikers AI-functies testen.

## Advies Voor De Eerste Beta

Start klein en duidelijk: "Atelier beta = presentaties maken vanuit tekst/pptx/key met een klaargezet template, lokaal opslaan en exporteren." Dat is de kern die nu het meest kansrijk is.

Laat gebruikers in deze eerste ronde nog niet primair testen op bedrijfsaccounts, billing, referral invites of publieke signup. Laat live samenwerking, deelcodes en template sharing alleen mee als de RPC/schema mismatches eerst zijn opgelost en met twee accounts zijn getest.

## Eindoordeel

Atelier is dichtbij genoeg voor een eerste interne beta, maar niet als volledig open of volledig gedeelde klantomgeving. De bewerkervaring is de sterke kant. De beta moet vooral bewijzen dat login, moduletoegang, templates, opslaan en exporteren stabiel voelen. Als die vijf goed werken, heb je een fijne eerste versie om met collega's te testen.
