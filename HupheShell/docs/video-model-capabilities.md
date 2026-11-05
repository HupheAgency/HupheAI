# Videomodellen — mogelijkheden en bediening

> **5 november 2026:** Kling 3 Pro is vervangen door **Kling 4** (`fal-ai/kling-video/v4`: tekst `kling/v4/text-to-video`, beeld `fal-ai/kling-video/v4/image-to-video`) en Wan 2.5 Preview door **Wan 2.7** (`fal-ai/wan/v2.7/text-to-video` en `/image-to-video`). Gecontroleerd tegen fal's schema's; Kling 4 heeft geen audio, seed of elementen, wel 3–30 s, 720p/1080p en shots (max. 512 tekens per shot). Wan 2.7: 2–15 s, 720p/1080p, eindbeeld, eigen audio. Nog niet gebouwd: Wan 2.7 reference-to-video, video continuation en video edit (limieten en endpointnaam nog niet bevestigd), Kling 4 reference-to-video (API 'coming soon'). De tekst hieronder over Kling 3 en Wan 2.5 is verouderd. Vereist een deploy van `proxy-fal-video` en migratie `20261105000100_kling4_wan27_models.sql`.


Gecontroleerd op 3 november 2026. Scope: de generatie-ingangen van Seedance 2.5, Veo 3.1, Kling 3 Pro en Wan 2.5 Preview via fal, in **Single én Timeline**. Kling 3 blijft op verzoek van Tom actief tot Kling 4 bij fal beschikbaar is. Beeld maken blijft in de beeldmodule.

De instellingen hieronder zijn aangesloten op de aanvraagroute en lokaal getest. Een lokale simulatie bewijst de bediening en meegestuurde instellingen; de kwaliteit, wachttijd en acceptatie door de echte provider moeten tijdens gebruik blijken. Deze uitbreiding start geen betaalde proeven.

## Waar staat wat?

Kies in Timeline een blok, open **Genereren** en kies het model. Het model en de gekozen referenties bepalen welke instellingen beschikbaar zijn. Single gebruikt dezelfde modelinstellingen. De generatieduur bepaalt hoeveel materiaal je aanvraagt; de uitsnede en blokduur blijven bij **Fragment**. Instellingen worden met de job en variant opgeslagen.

## Seedance 2.5

| Functie | Bediening / beperking |
| --- | --- |
| Tekst naar video | Prompt, 4–30 hele seconden of Auto. |
| Beeld naar video | Startbeeld en eventueel eindbeeld; prompt mag bij deze route leeg blijven. |
| Referenties | Maximaal 30 beelden, 10 video's en 10 audiobestanden. Video/audio hebben eigen grenzen voor bronduur en bestandsgrootte. |
| Referentiemodus | Auto, Referentie, Bewerken of Verlengen. Bewerken en Verlengen hebben een video nodig. |
| Bewerken | De provider bepaalt duur en beeldverhouding; het tijdlijnblok houdt zijn eigen lengte. |
| Verlengen | De gevraagde lengte blijft instelbaar; beeldverhouding volgt de bron. |
| Draft | 480p, ook met referentiemedia. Finaliseren gebruikt de bestaande 1080p-route. In Timeline blijft de draft als aparte variant bestaan. |
| Beeld en geluid | 480p/720p/1080p, ondersteunde verhoudingen, gegenereerde audio aan/uit. |
| Geavanceerd | Seed bij referentiegeneratie; standaard/hoge bitrate; auto/H264/H265. |

Referentiedrafts gebruiken de US-route; bestaande drafts zonder referenties behouden hun eerdere route. US-drafts zijn volgens fal zeven dagen beschikbaar om te finaliseren; andere drafts veertien dagen. Een bron die je via ‘vorige scène’ kiest is nog steeds de volledige clip, niet automatisch het laatste frame van de montage-uitsnede.

Bronnen: [tekst](https://fal.ai/models/bytedance/seedance-2.5/us/text-to-video/api), [start-/eindbeeld](https://fal.ai/models/bytedance/seedance-2.5/us/image-to-video/api), [referenties en modi](https://fal.ai/models/bytedance/seedance-2.5/us/reference-to-video/api), [draft finaliseren](https://fal.ai/models/bytedance/seedance-2.5/draft/complete/api).

## Veo 3.1

| Functie | Bediening / beperking |
| --- | --- |
| Standaard / Fast | Keuze binnen hetzelfde model, voor alle vijf ingangen hieronder. |
| Tekst naar video | 4, 6 of 8 seconden; liggend of staand. |
| Startbeeld | Afzonderlijke image-to-video-route; ook automatische beeldverhouding. |
| Start- én eindbeeld | Afzonderlijke first-last-frame-route. |
| Referentiebeelden | Maximaal drie beelden; output 8 seconden. Seed en negatieve prompt zijn in deze route niet beschikbaar. |
| Verlengen | Eén Veo-bronvideo van maximaal 8 seconden; aanvraag van 7 seconden op 720p. |
| Resolutie | 720p, 1080p of 4K. 1080p/4K gebruiken een aanvraag van 8 seconden. Verlengen heeft zijn eigen vaste instellingen. |
| Geavanceerd | Audio aan/uit, seed en negatieve prompt waar ondersteund, prompt automatisch corrigeren en moderatiegevoeligheid. |

De API krijgt duurwaarden als `4s`, `6s`, `8s` en bij verlengen `7s`. De app kiest de juiste ingang voor twee frames in plaats van een eindbeeld aan de gewone image-to-video-aanvraag toe te voegen.

**Beschikbaarheid:** fal vermeldt voor deze routes een deprecationdatum van **17 november 2026**. Dit staat ook bij het model in de app. Een toekomstige vervanger is nog geen onderdeel van deze wijziging.

Bronnen: [tekst en parameters](https://fal.ai/models/fal-ai/veo3.1/api), [startbeeld](https://fal.ai/models/fal-ai/veo3.1/image-to-video/api), [twee frames](https://fal.ai/models/fal-ai/veo3.1/first-last-frame-to-video/api), [referenties](https://fal.ai/models/fal-ai/veo3.1/reference-to-video/api), [verlengen](https://fal.ai/models/fal-ai/veo3.1/extend-video/api), [Fast](https://fal.ai/models/fal-ai/veo3.1/fast/api), [Fast-referenties](https://fal.ai/models/fal-ai/veo3.1/fast/reference-to-video/api), [Fast-verlengen](https://fal.ai/models/fal-ai/veo3.1/fast/extend-video/api), [Google over resolutie en duur](https://ai.google.dev/gemini-api/docs/veo).

## Kling 3 Pro

| Functie | Bediening / beperking |
| --- | --- |
| Tekst of startbeeld | 3–15 hele seconden. Bij een startbeeld kan ook een eindbeeld worden gekozen. |
| Audio | Gegenereerd geluid aan/uit. |
| Negatieve prompt | Ongewenste kenmerken beschrijven. |
| Prompt volgen | `cfg_scale` tussen 0 en 1. |
| Shots | Eén algemene prompt, óf afzonderlijke shotprompts met duur. De som van de shotduren moet overeenkomen met de generatieduur. |
| Shotindeling | Eigen shots of automatische indeling. |
| Personages/objecten | Bij beeld naar video: hoofdbeeld met 1–3 extra aanzichten, of een video. Maximaal één video-element per aanvraag. Verwijs naar `@Element1` enzovoort. |
| Stem koppelen | Optioneel bestaand Kling-stem-ID bij een element; vereist gegenereerde audio. |
| Veiligheidscontrole | Aan/uit volgens de accountrechten bij fal. |

Personage-/objectreferenties worden momenteel als bereikbare media-URL's ingevuld. Dit is de modeloptie; een eigen personagebibliotheek met referentiesheets en versies blijft een afzonderlijke productstap. 1080p is bij Kling een outputaanduiding; er wordt geen niet-bestaande resolutieparameter meegestuurd.

Bronnen: [tekst naar video](https://fal.ai/models/fal-ai/kling-video/v3/pro/text-to-video/api), [beeld, shots en elementen](https://fal.ai/models/fal-ai/kling-video/v3/pro/image-to-video/api), [Kling 4 bij fal](https://fal.ai/kling-4).

## Wan 2.5 Preview

| Functie | Bediening / beperking |
| --- | --- |
| Tekst of startbeeld | 5 of 10 seconden, 480p/720p/1080p. Bij een startbeeld volgt de verhouding de afbeelding. |
| Eigen audio | Eén WAV- of MP3-bestand, 3–30 seconden en maximaal 15 MB. Kan samen met een startbeeld. |
| Prompt | Maximaal 1500 tekens. |
| Negatieve prompt | Maximaal 500 tekens. |
| Geavanceerd | Seed, promptuitbreiding en veiligheidscontrole. |

Wan maakt native audio. De API heeft geen schakelaar voor `generate_audio`; daarom wordt die ook niet getoond. Eindbeeld, draft en video verlengen behoren niet tot deze Wan-ingangen.

Bronnen: [tekst naar video](https://fal.ai/models/fal-ai/wan-25-preview/text-to-video/api), [beeld naar video](https://fal.ai/models/fal-ai/wan-25-preview/image-to-video/api), [uitleg van fal](https://blog.fal.ai/wan-2-5-preview-is-now-available-on-fal/).

## Controles en grenzen

- `npm run test:video-models`: routekeuze, exacte aanvraagvelden, ongeldige combinaties, modusspecifieke grenzen en bewaarde snapshots, zonder netwerk.
- `npm run test:timeline-ui`: echte Electron-bediening met lokale antwoorden; Single en Timeline, nieuwe modelopties en eerdere montagehandelingen.
- `npm run test:timeline`: beheerde bronnen, import, opslag, referenties en montagebewerkingen.
- De server valideert generatieparameters vóór reservering. De bestaande afrekening, jobherstel en financiële auditpunten blijven hun eigen open werk; dit is geen afronding van B10/L1.
- De serverfunctie `proxy-fal-video` levert de mogelijkheden. Beide editors hebben de nieuwe appcode én deze bijgewerkte functie nodig. Er is geen databasemigratie nodig voor de vier bestaande modelregistraties.

## Uitrolstatus

Op 3 november 2026 heeft Tom expliciet toestemming gegeven voor de productie-update. `proxy-fal-video` is bijgewerkt van versie 9 naar **versie 10** en staat op **ACTIVE**, met JWT-controle ingeschakeld. De vier teruggelezen runtime-bronbestanden komen exact overeen met de geteste lokale versie; andere functies zijn ongewijzigd. De functie antwoordt op een OPTIONS-controle met HTTP 200. Er zijn geen migraties of betaalde generaties uitgevoerd. De herstelkopie van versie 9 blijft lokaal in `.local/video-proxy-before/`. Herlaad de app om de bijgewerkte modelmogelijkheden op te halen.
