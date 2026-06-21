# Contact Sheet Splitting Plan

Doel: een 2x2 generated contact sheet betrouwbaar omzetten naar losse canonical review cards.

## Verwachte Layout

Standaardvolgorde:

1. front of hero;
2. left;
3. right;
4. rear.

Wanneer de bronfoto al front is, mag crop 1 worden genegeerd of alleen ter vergelijking worden getoond.

## Frontend Basis

`ProductStudioShell` bevat nu een eenvoudige 2x2 split:

- canvas crop per kwadrant;
- output als data URL;
- mapping naar front/left/right/rear cards;
- gebruiker kan inferred crops accepteren.

## Nodige Verbeteringen

- Confidence score per crop.
- Detectie van lege marges.
- Detectie van tekstlabels in de sheet.
- Mogelijkheid om cropvolgorde te corrigeren.
- Mogelijkheid om losse crop te vervangen.
- Fallback naar single-view generation.

## Confidence Heuristieken

Een crop krijgt lage confidence als:

- meer dan 35 procent vrijwel zwart/wit/transparent is;
- het object de crop-rand raakt;
- aspect ratio van object extreem afwijkt van bron;
- histogram/kleurverdeling sterk afwijkt van bron;
- OCR of labeltekst in de rand wordt gevonden.

## Fallbackregels

- 4 goede crops: contact sheet accepteren als route.
- 2-3 goede crops: toon bruikbare crops, genereer ontbrekende views los.
- Minder dan 2 goede crops: verwerp sheet en gebruik single-view generations.

## Acceptatiecriteria

- Gebruiker ziet alle vier losse crops.
- Gebruiker ziet per crop status en waarschuwingen.
- Geen crop wordt automatisch goedgekeurd.
- Bij onzekerheid is er altijd een herstelactie.

