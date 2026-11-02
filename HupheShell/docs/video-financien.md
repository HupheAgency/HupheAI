# Video — kosten en financiële afhandeling

Status: plan van 2 november 2026; gebruikerskeuzes vastgelegd, financiële werking nog te bewijzen. Er zijn geen facturen verstuurd, declaraties ingediend of betalingen uitgevoerd.

Dit document werkt de financiële wensen uit. De productvisie staat in [video-pipeline.md](video-pipeline.md); de eerste werkende filmketen en technische audit in [video-mvp.md](video-mvp.md).

## Bevestigde routes

Tom wil vooraf een geschatte generatieprijs zien en achteraf de werkelijke projectkosten kunnen terugvinden.

| Route | Gewenste uitkomst |
| --- | --- |
| Klantfactuur | Vanuit het project met één expliciete actie een factuur via **Moneybird** naar de klant versturen. |
| Werkgeversvergoeding | Bijvoorbeeld fal.ai- en OpenRouter-verbruik bundelen in één overzicht; voorgeschoten kosten laten terugbetalen aan Tom. |
| Klantteam betaalt — later volledig uitwerken | Met de bestaande eigen login lid zijn van het klantteam en dat team selecteren; kosten worden direct op die teamrekening geboekt. |

Eigen account, teamlidmaatschap en teamkeuze bestaan volgens Tom al. We hergebruiken deze basis; er komt geen parallel rekening- of provideraccountsysteem.

## L1 — vroege proef op het persoonlijke account

**Afhankelijkheid: L1 stappen 1–5 kunnen na M2 en Toms model-/budgetkeuze parallel aan M1 worden uitgevoerd.** L1 omvat één kleine, neutrale echte generatie op Toms persoonlijke account. Stap 6, de clip in het montageprototype testen, wacht op het M1a/M1b-prototype; M3 wacht op complete M1 en L1. Zie [video-mvp.md](video-mvp.md). Dit beschrijft het plan; Tom bepaalt welke bouwstap wordt gestart.

M2 bevat vier lokale reparaties uit B02/B04/B11/B15 en een afzonderlijk, groter serveronderdeel B10 voor jobbinding met een compatibele uitrol. De overige persoonlijke billingcontroles, waaronder B08/B09 en reserve/settle/release, horen bij L1. Uitgebreide financiële schermen en teamafrekening volgen later.

- Vóór de vroege call zijn budget en prijsindicatie duidelijk. De server stelt vast dat Tom bevoegd is en zijn persoonlijke rekening werkelijk betaalt; de proef mag geen teamrekening belasten.
- Bewaar vanaf deze call minimaal job-ID, providerrequest-ID, maker, oorspronkelijke persoonlijke betaler, model/invoer, tijdstip, prijsbasis en financiële uitkomst. Dit kan in een klein proefrecord; het volledige projectmodel volgt in M3.
- Controleer in L1 de persoonlijke reservering, afrekening, vrijgave/correctie en foutafhandeling. Reservering en terugboeking blijven aan dezelfde opdracht en betaler gekoppeld, ook bij een latere accountwissel.
- Herstel en opnieuw proberen gebruiken dezelfde opdrachtidentiteit. Het proefverslag toont raming, werkelijke afrekening en eventuele nog open bedragen.

Bij de verdere v1-uitbouw worden deze gegevens aan project/blok en variant gekoppeld. Alle pogingen en correcties blijven meetellen, ook als een variant niet wordt gekozen of uit de montage verdwijnt. Het projectoverzicht groeit mee met de filmketen.

De bredere teamcontroles **B18–B20** staan in [video-mvp.md](video-mvp.md) en horen bij de latere samenwerkings-/teamfase. De persoonlijke betaler vóór L1 servermatig vaststellen blijft wel een voorwaarde voor die eerste call.

Drie bedragen blijven afzonderlijk geregistreerd:

| Bedrag | Betekenis |
| --- | --- |
| Providerverbruik | Beschikbare werkelijke kosten bij fal.ai, OpenRouter of een andere gebruikte provider, inclusief bronverwijzing en valuta. |
| HupheAI-afrekening | Op de rekening gereserveerde, afgerekende en gecorrigeerde bedragen/credits met de gebruikte prijsbasis. |
| Factuurbedrag | Verkoopbedrag volgens de nog te kiezen posten en tarieven; niet automatisch gelijk aan providerkosten of credits. |

## Later: klantfactuur via Moneybird

1. Kies project, kostenbereik en vaste kostenstand. Los open afrekeningen op of baken expliciet af welke posten meetellen.
2. Toon een controleerbaar concept met Moneybird-administratie, afzender, klant/contact, ontvanger, factuurregels en eventuele handmatige posten.
3. Eén expliciete actie **Factuur versturen** maakt/verstuurt de bedoelde factuur. Als alle gegevens al zichtbaar en compleet zijn, is geen extra bevestigingslus nodig.
4. Bewaar factuur-ID, kostenstand, ontvanger en verzendopdracht blijvend. Bij een onduidelijk netwerkantwoord eerst de bestaande opdracht controleren voordat opnieuw wordt verstuurd.
5. Toon de bevestigde dienststatus. Aflevering en betaling krijgen alleen die status als daar bewijs voor is; verder werken verandert een verzonden factuur niet stil.

De officiële API ondersteunt een verkoopfactuur aanmaken en afzonderlijk versturen: [Moneybird sales invoices API](https://developer.moneybird.com/api/sales-invoices/).

Projecttoegang en recht om een factuur te versturen worden afzonderlijk geregeld. Bewust opnieuw versturen, correcties en nieuwe kosten na facturatie krijgen een eigen handeling en historie.

## Later: overzicht voor werkgeversvergoeding

1. Kies één project of een expliciete projectselectie en periode.
2. Bundel uitsluitend Toms aantoonbaar voorgeschoten kosten, bijvoorbeeld uit fal.ai en OpenRouter, met uitsplitsing per project/provider, valuta, totaal en beschikbare bewijsstukken.
3. Toon het overzicht vóór doorsturen. Kosten buiten de selectie, onbekende bedragen en direct door een team betaalde kosten tellen niet ongemerkt als persoonlijk voorschot mee.
4. Dien het overzicht via de afgesproken werkgeversroute in en bewaar de indienidentiteit en kostenstand.
5. Volg de aantoonbare vergoeding. Tom wil direct geld terug; het daadwerkelijke indien- en betaalproces moet daarvoor nog worden gekozen.

Dit interne overzicht is een declaratie-/vergoedingsroute. Het wordt niet vanzelf een Moneybird-verkoopfactuur. Verzenden bewijst geen terugbetaling; statussen zoals ingediend, goedgekeurd en terugbetaald volgen het afgesproken proces en de beschikbare bewijsstukken.

Een automatische uitbetalingskoppeling is nog geen gekozen oplossing. Eventuele werkgeversvergoeding en zakelijke doorfacturatie blijven afzonderlijk herleidbaar, zodat dezelfde kosten niet dubbel worden vergoed.

## Later: volledige workflow voor klantteams

Na de persoonlijke filmketen werken we de bestaande teamroute uit: lidmaatschap, projectuitnodigingen, rollen, financiële rechten en inzicht voor de klant. Hier controleren we B18–B20: bevestigde teamkeuze, werkelijk gebruikte billing-RPCs/schema en afrekening/terugboeking naar de oorspronkelijke teamrekening.

De route blijft: **eigen login → bevoegd teamlid → team kiezen → zichtbaar team als betaler → opdracht op die rekening**. De bij aanvang vastgelegde betaler blijft gelden bij afronding, annulering, terugboeking en herstel, ook als Tom ondertussen een ander account selecteert.

Teamkosten blijven apart van Toms eigen voorschotten. Bij onvoldoende teamtegoed of ingetrokken bevoegdheid stopt de teamopdracht met een duidelijke melding; persoonlijk saldo blijft ongemoeid. Snel wisselen en mislukte voorkeurwijzigingen krijgen hier hun eigen controles.

## Uitvoering en controles

| Stap | Werk | Klaar wanneer |
| --- | --- | --- |
| F01 — vroege persoonlijke L1 | Na M2 en Toms model-/budgetkeuze stappen 1–5 parallel aan M1: één kleine neutrale generatie, persoonlijke betaler bevestigen en reserve/settle/release plus B08/B09 controleren. | Resultaat en kosten zijn herleidbaar; stap 6 gebruikt het M1a/M1b-prototype. Complete M1 en L1 voeden M3. |
| F02 — later | Moneybird-administratie, posten, factuurconcept en verzending aansluiten. | Juiste factuur en ontvanger; één factuur/verzending bij dubbelklik of retry. |
| F03 — later | Werkgeversoverzicht, bewijsstukken en afgesproken indien-/betaalproces aansluiten. | Alleen gekozen eigen voorschotten staan in het overzicht; vergoeding is aantoonbaar. |
| F04 — latere teamfase | B18–B20 en projectrollen controleren; klantteamworkflow aansluiten op bestaande rekeningen. | Bevestigde teamkeuze, bevoegdheid, rekeningwisseling en terugboeking werken op de bedoelde teamrekening. |

Bewijs per controle vastleggen met datum, gebruikte configuratie, verwachte/werkelijke uitkomst en relevante opdracht- of document-ID. De bestaande controle-ID's blijven behouden:

| Controle | Vereist bewijs |
| --- | --- |
| T55 — kosten vanaf L1 | Eerst het persoonlijke proefrecord met raming/afrekening bewijzen; daarna alle projectpogingen, varianten en correcties juist toewijzen en optellen. |
| T56 — factuurconcept | Juiste administratie, ontvanger, posten en berekening; de kostenstand blijft gelijk na verder werken. |
| T57 — factuur versturen | Expliciete actie, blijvende factuur-/verzendidentiteit en bevestigde status; retry veroorzaakt geen dubbele factuur of e-mail. |
| T61 — werkgeversoverzicht | Geselecteerde eigen voorschotten zijn per project/provider herleidbaar, met periode, valuta en beschikbare bewijsstukken. |
| T62 — terugbetaling | Indienen en betalen zijn afzonderlijk aantoonbaar; onbekende status blijft onbekend; herhalen geeft geen dubbele vergoeding. |
| T63 — gekozen rekening | L1: persoonlijke rekening vóór submit servermatig bevestigd. Latere teamfase: teamkeuze, snel wisselen, mislukte keuze, onvoldoende teamtegoed en ingetrokken lidmaatschap testen. |
| T64 — afhandeling kostenpost | L1: oorspronkelijke persoonlijke betaler en afrekening/correcties herleidbaar, retries zonder dubbele kosten. Later: teamterugboeking en koppeling aan factuur/declaratie/vergoeding bewijzen. |

## Nog te bepalen

- Tom kiest model en kostenplafond voor de ene vroege persoonlijke providerproef L1; wachttijd en eventuele overige limieten afspreken. M1 en M2 hebben hun eigen startbesluit en hoeven niet op deze budgetkeuze te wachten.
- Factuurposten: alleen AI-kosten of ook uren, opslag/marge en overige projectkosten; tarieven en omzetting van valuta/credits.
- Moneybird-administratie, afzender, klant/contact en wie mag factureren of financiële gegevens bekijken.
- Exportvorm, ontvanger, bewijsstukken en indien-/betaalproces bij de werkgever; of automatische uitbetaling nodig en beschikbaar is.
- Afhandeling van aanvullende kosten en correcties na een verstuurde factuur of ingediende declaratie.
