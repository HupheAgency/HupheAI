# Video-pipeline — productvisie

Bijgewerkt: 2 november 2026. Dit is het productdoel. Het [MVP-bouwplan](video-mvp.md) beschrijft de voorgestelde bouwvolgorde; [financiën](video-financien.md) beschrijft de zakelijke afhandeling. Er is inmiddels een eerste lokale tijdlijn gebouwd op Toms opdracht; zie het [meetverslag](video-timeline-test-results.md). De visie blijft het einddoel; open fases zijn daarmee niet automatisch afgerond. Tom bepaalt de vervolgstappen.

## Eerste oplevering in één zin

**Eerste oplevering: de videowerkomgeving opzetten met projecten, één video- en één audiospoor, blokken, import, varianten, trim, preview, opslag en export, plus de technische aansluiting voor generatie vanuit een blok.**

Tom wil eerst de omgeving opzetten en nog niets namaken. De geplande route begint met lokale testmedia. Na de reparaties uit M2 en Toms model-/budgetkeuze kunnen de eerste vijf stappen van L1 één echte, korte generatie met een neutraal beeld onderzoeken, parallel aan de montageproef. Alleen het testen van die clip in het prototype wacht op M1. Beide uitkomsten voeden het projectmodel; de simulator groeit mee met de regressietests vanaf M2. De eerdere animatiecommercial blijft voor later. De auditpunten B01–B20 blijven onderdeel van het bouwplan.

Het afzonderlijke [beeld-video-workflow.MD](beeld-video-workflow.MD) behandelt de gedeelde beeld/video-pilot voor Roorda, met samenwerking, centrale opslag en overdracht tussen collega's als vroege doelen. Dit solo tijdlijn-MVP heeft een andere scope en volgorde. We hergebruiken relevante bevindingen; de Roorda-pilot vormt geen voorafgaande oplevervoorwaarde voor deze technische basis.

## De gewenste werkwijze

1. **Project openen.** Begin leeg of geef een doelduur op. Dertig seconden is een richtlijn; de film mag langer of korter worden.
2. **Beeld ontwikkelen.** Maak een basisbeeld en verfijn het via chat. Bewaar gesprek en beeldreeks bij het blok en laat de geselecteerde versie naar 4K/meer diepte uitwerken, zoals in de eerdere Nano Banana Pro-route.
3. **Blok vullen.** Selecteer een tijdvak, bijvoorbeeld vier seconden. Het blok krijgt beeld, prompt, model en instellingen. Selectie toont een grote preview en de bijbehorende rechterzijbalk.
4. **Genereren en kiezen.** Maak eerst een test in lage resolutie met zichtbare kosten, bekijk die en stuur bij. Het variantenicoon toont alle pogingen. Tom kiest welke versie op de tijdlijn speelt; een nieuwe generatie vervangt die keuze niet automatisch.
5. **Monteren.** Importeer ook eigen video's, trim visueel en verplaats blokken. Uitsnedes veranderen de volledige bron niet. Bloklengte en seconden in de zijbalk blijven gelijk.
6. **Afwerken.** Maak de gekozen clip op 1080, voeg vervolgclips, overgangen, stemmen en muziek toe, en beoordeel iedere stap. Concept en eindversie blijven afzonderlijk beschikbaar.
7. **Opleveren.** Speel de volledige film af, exporteer dezelfde montage en open het project later met bronnen, instellingen en varianten weer compleet.

De eerdere keten was ChatGPT → Nano Banana Pro → Seedance → soms tussenframes → ElevenLabs → Premiere. Die overdrachten willen we uiteindelijk in één project bijeenbrengen. Seedance 2.5, Kling 4 en Veo zijn genoemde voorkeuren; de eerste modelroute wordt gekozen op technische mogelijkheden en beschikbaarheid.

## Afspraken die het ontwerp dragen

| Onderwerp | Afspraak |
| --- | --- |
| Tijd | Bronduur, bron-in/uitpunten, afspeelsnelheid, blokpositie/-duur, aangevraagde generatieduur en exportbereik zijn afzonderlijke gegevens. |
| Trim | Een bron van 6 s kan met uitsnede 2–5 s als 3 s op de tijdlijn staan. Terug uittrekken toont weer de bewaarde bronbeelden. |
| Lengte wijzigen | Slepen en zijbalk werken beide kanten op. Meer beeld nodig: per keer kiezen tussen verlengen, opnieuw genereren of vertragen. Slepen start geen betaalde opdracht. |
| Montagegedrag | Wisselen tussen volgende blokken laten meeschuiven en vaste posities. Doelduur blijft een richtlijn. |
| Varianten | Alle pogingen blijven bij het blok; actieve keuze en goedkeuring zijn apart van de laatst gemaakte variant. |
| Opdrachten | Elke generatie bewaart een vaste kopie van invoer, bronversies, model, instellingen en betaler. Latere wijzigingen veranderen een lopende job niet. |
| Vervolg | Beweging loopt door vanaf het einde van de werkelijk gekozen uitsnede van de vorige clip. Een nieuw shot met hetzelfde personage blijft een zelfstandig shot. |
| Afhankelijkheden | Een gewijzigde bron markeert vervolg, overgang of lipsync voor nieuwe beoordeling. Oude resultaten blijven beschikbaar; niets wordt automatisch opnieuw betaald. |
| Opslag | Import, trim, blok verwijderen en variant kiezen bewaren de oorspronkelijke media. Project heropenen herstelt ook de actieve selectie. |
| Kosten | Vooraf een schatting; alle werkelijke pogingen en correcties vanaf de eerste job registreren. Zakelijke afhandeling staat in het financiële document. |

## Personageconsistentie

Een animatiepersonage krijgt een **herbruikbaar personage-asset**. De structuur voor referenties en versies wordt voorbereid bij de opzet; een eigen personage invullen en creatief beoordelen volgt wanneer Tom een film wil maken.

**Bij video's met een personage is consistentie een acceptatiecriterium.** Iedere bijbehorende generatie en variant bewaart de gebruikte personageversie. Alleen neutraal testmateriaal en video's zonder personage kunnen die verwijzing leeg laten.

Een versie bevat goedgekeurde referentiebeelden, een korte vaste stijlomschrijving en herkenningspunten: gezicht/silhouet, lichaamsverhoudingen, kleuren, kleding en materialen. Gebruik bestaande beelden; maak alleen extra aanzichten als het gekozen shot die nodig heeft. Een project kan een standaardpersonage hebben; blokken en jobs die het gebruiken verwijzen naar een concrete versie.

Per shot blijven houding, actie, camera en omgeving apart instelbaar. Nieuwe referenties maken een nieuwe personageversie; ze veranderen oudere clips niet. De modelroute bepaalt hoe referenties worden meegegeven. Een LoRA is een mogelijke latere techniek, geen vereiste voor de opzet.

Bij een latere creatieve proef beoordelen we de kenmerken aan begin, midden en einde van de clip, tussen twee varianten en tussen concept en eindversie. Daarna volgt een proef met twee aansluitende clips.

RIFE kan tussenframes maken. Identiteit, stijl en de beweging van beide bronclips beoordelen we vóór zo'n overgang; interpolatie bewijst geen personageconsistentie. Bron: [RIFE-auteursimplementatie](https://github.com/hzwer/ECCV2022-RIFE).

## Uitbreiden na de technische basis

| Oplevering | Inhoud | Voorwaarde |
| --- | --- | --- |
| Beeldontwikkeling | Basisbeeld via chat maken/verfijnen; 4K-/dieptebewerking; beeldvarianten aan blok koppelen. | V1 kan een bestaande goedgekeurde afbeelding betrouwbaar gebruiken. |
| Film met stem | ElevenLabs-stem én muziek, extra audiosporen, per fragment voice-over of lipsync. Tekst/stemwijziging markeert afhankelijke mondbeweging. | Opslag, montage en echte modelkoppeling werken; personagekwaliteit beoordelen bij de latere creatieve proef. |
| Uitgebreide montage | Meerdere videosporen, naadloos vervolg, verlengen/vertragen, ripple/vaste posities, overgangsblok boven andere clips. | Preview/export verwerken dezelfde timing; overgang voegt geen onbedoelde filmduur toe. |
| Gerichte AI-bewerking | Aanwijzen, selectie corrigeren, gekozen tijdsbereik en stijlreferenties; nieuwe variant naast de bron. | Eerst een geslaagde modelproef per bewerking, daarna bijbehorende bediening bouwen. |
| Formaten en samenwerking | Horizontaal, verticaal, vierkant en eigen maten; projectuitnodigingen voor collega's, gedeelde media en rollen. | Zelfstandig gebruik werkt; formaatversies en gelijktijdige wijzigingen behouden bestaand werk. |
| Zakelijke afhandeling | Uitwerken volgens [video-financien.md](video-financien.md). | Filmketen werkt; registratie en correcte jobbetaler gelden vanaf de eerste echte generatie. |
| Eigen montage-assets — als laatste | Logo's/afbeeldingen als gewone lagen met positie, schaal, zichtduur en transparantie. | Lage prioriteit zoals afgesproken; lokale video-import zit al in v1. |

Stem en muziek krijgen eigen bewerkingen en varianten. Lipsync gebruikt een specifieke video- en stemversie; de stem mag niet dubbel afspelen. Het concrete gedrag van fades, mute/solo, gekoppelde audio, titels en ondertitels bepalen we bij die uitbreiding.

## AI-bewerkingen: eerst een modelproef

Voor iedere rij: gebruik een korte representatieve bron, noteer model/versie, prompt, referenties, kosten en resultaat, en beoordeel de volledige clip. Alleen een geslaagde route gaat naar UI-bouw. De eerste modelproef vraagt nog geen algemene masker- of trackingeditor.

| Bewerking | Wat de proef moet laten zien |
| --- | --- |
| Element toevoegen | Passende plaatsing, schaal en licht; stabiel bij beweging en bedekking. |
| Element verwijderen | Element blijft weg; achtergrond loopt door zonder terugkerende resten. |
| Persoon vervangen | Gewenste identiteit, handeling en positie blijven door de hele clip herkenbaar. |
| Greenscreen in filmwereld | Acteur past bij gekozen scènereferenties; randen, perspectief, licht en schaduw kloppen. |
| Huilen → lachen | Expressie verandert; identiteit en overige handeling blijven passend. Stem/lipsync afzonderlijk beoordelen. |
| Groen shirt → roze | Alleen bedoeld kledingstuk verandert, ook bij draaien en gedeeltelijke bedekking. |

Per bewerking kiest Tom **heel strikt** of **redelijk strikt** behoud. Leg vooraf vast wat mag veranderen en wat behouden moet blijven. Deze keuze staat los van test-/eindkwaliteit. Bewaar stand en behoudsafspraken per opdracht/variant; een andere stand vraagt een expliciete keuze. Beide standen krijgen eigen proefresultaten.

Een bewerkte uitsnede 2–5 s kan een nieuw bestand van 0–3 s worden: bewaar die bronrelatie en gebruik de juiste nieuwe tijdcodes. Verder uittrekken mag niet ongemerkt onbewerkte bronframes tonen. Het monsterstad-/rennende-manvoorbeeld blijft een uitlegvoorbeeld, geen gekozen proef.

## Wat nu nodig is

Het [MVP-bouwplan](video-mvp.md) splitst M1 in export/binaries/packaging (M1a) en preview/synchronisatie (M1b). Voor M1b geldt een voorgestelde timebox van twee werkdagen, gevolgd door meetresultaten en Toms keuze over het vervolg. M2 bevat vier lokale reparaties en apart serverwerk voor B10 met een compatibele uitrol. L1 stappen 1–5 kunnen daarna parallel aan M1; stap 6 wacht op het M1a/M1b-prototype. M3 volgt pas na complete M1 en L1. Tom kiest het model en kostenplafond vóór de persoonlijke proef; eigen bronmateriaal en een commercial zijn nu niet nodig.
