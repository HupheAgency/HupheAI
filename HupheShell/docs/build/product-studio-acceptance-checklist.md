# Product Studio Acceptance Checklist

Gebaseerd op hoofdstuk 21 van het masterdocument.

## Eerste Testobject (Gesimuleerd voor Spikes)

- [x] Matte rechthoekige verpakking.
- [x] Neutrale achtergrond.
- [x] Geen reflecterend materiaal.
- [x] Geen kleine tekst.
- [x] Geen transparantie.
- [x] Eenvoudige kleurverdeling.

## Gebruikersflow

- [ ] Gebruiker kan een project starten.
- [ ] Gebruiker kan een productfoto uploaden.
- [ ] Bronfoto blijft zichtbaar als observed bewijs.
- [ ] AI-views zijn herkenbaar als inferred.
- [ ] Gebruiker kan inferred views accepteren of vervangen.
- [ ] Canonical reference set wordt niet automatisch goedgekeurd.
- [ ] Gebruiker kan een mesh of primitive proxy beoordelen.
- [ ] Gebruiker kan product positioneren in de studio.
- [ ] Gebruiker kan camera en licht aanpassen.
- [ ] Gebruiker kan een preview/renderpacket maken.
- [ ] Gebruiker kan een final render maken.
- [ ] Gebruiker kan final render downloaden.

## Technische Acceptatie

- [ ] Externe providerjobs zijn hervatbaar.
- [ ] Providerfouten verliezen geen projectdata.
- [ ] API-sleutels blijven server-side.
- [ ] Projectassets worden als URLs opgeslagen, niet als base64 in productie.
- [ ] Final render is herleidbaar naar canonical set, reconstruction, scene, renderpacket en provider run.
- [ ] Rollback naar vorige reference/mesh/render versie is mogelijk.

## Kwaliteitsmetingen (Via Simulatie in Spikes)

- [x] Reference consistency.
- [x] Silhouette match.
- [x] Logo/text preservation waar relevant.
- [x] Human accept rate.
- [x] Latency per provider.
- [x] Cost estimate per provider.
- [x] Failure rate per provider.

## Niet Blokkeren Voor Concept Mode

- [ ] CAD-nauwkeurigheid.
- [ ] Fidelity Mode.
- [ ] LoRA training.
- [ ] PSD/EXR/lagenexport.
- [ ] Transparante export.
- [ ] Realtime mesh updates.

