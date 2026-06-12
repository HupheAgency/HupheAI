# Beeld genereren in Engine en Atelier

Dit document beschrijft wat is aangepast nadat Nano Banana Pro in Engine tekst bleef teruggeven in plaats van een afbeelding. Het doel is dat we bij toekomstige problemen sneller zien waar de keten breekt.

## Korte samenvatting

Atelier en Engine hadden niet dezelfde afhandeling voor image-modellen.

Atelier behandelde image-generatie al als een aparte OpenRouter image-flow:
- expliciete prompt: genereer een afbeelding, geen tekstuele reactie;
- OpenRouter `chat/completions` met `modalities`;
- response uitlezen uit `message.images[]`;
- base64-resultaten opslaan als lokaal bestand.

Engine gebruikte image-modellen nog te vaak als gewone chatmodellen. Daardoor gaf Nano Banana Pro een tekstueel chatantwoord terug over de prompt, in plaats van een image-output.

## Belangrijkste oorzaak

De model-detectie in Engine was te smal.

Sommige OpenRouter-modellen uit Settings worden opgeslagen zonder `modality`. Daardoor kon `Nano Banana Pro` alsnog als tekstmodel worden behandeld. De zichtbare labelnaam werd ook niet meegestuurd naar de main process, dus Engine kon niet herkennen dat `Nano Banana Pro` een beeldmodel moest zijn.

Daarnaast werd OpenRouter image-output eerst te letterlijk als chattekst behandeld of als enorme data-url in de chat gehouden. Dat is kwetsbaar.

## Aangepaste bestanden

### `src/main/engine-ipc.ts`

Hier zit de Engine backend-flow.

Belangrijke functies:
- `isImageGenerationModel(model, modality, label)`
- `callOpenRouterImageChat(...)`
- `imageObjectToToken(...)`
- `extractImageTokensFromContent(...)`

Wat hier is aangepast:
- Detectie gebruikt nu ook `agentLabel`, zodat `Nano Banana Pro` zelf de image-route kan triggeren.
- Detectie kent meer image-keywords, zoals `banana`, `nano-banana`, `imagen`, `flux`, `seedream`, `image-preview`.
- Image-modellen gebruiken een aparte prompt: genereer een afbeelding en geef geen tekstueel antwoord.
- Voor image-modellen gaat gewone chat-history niet mee.
- OpenRouter wordt aangeroepen via `chat/completions` met `modalities`.
- Base64-afbeeldingen worden lokaal opgeslagen in `/tmp` en als `[IMAGE:file://...]` teruggegeven.
- Er zijn debuglogs toegevoegd met prefix `[engine:image]`.

### `src/renderer/src/pages/EngineCommandCenterPage.tsx`

Hier wordt het gekozen model naar de main process gestuurd.

Wat hier is aangepast:
- `agentLabel` wordt meegestuurd naar `engine:send-message`.
- De pagina luistert nu ook naar `engine:message-added`, zodat assistant-berichten direct in de chat verschijnen en niet alleen afhankelijk zijn van Supabase Realtime.

### `src/preload/index.ts`

De preload-typing/payload is uitgebreid.

Wat hier is aangepast:
- `agentLabel?: string` toegevoegd aan `engine.sendMessage(...)`.

### `src/renderer/src/components/EngineCommandCenterShell.tsx`

Hier zit de chatweergave.

Belangrijk:
- `parseMessageContent(...)` zoekt naar `[IMAGE:...]`.
- `ChatBubble` rendert zo'n marker als `<img>`.

De chat verwacht dus dat de backend een afbeelding verpakt als:

```text
[IMAGE:file:///pad/naar/image.png]
```

of:

```text
[IMAGE:https://...]
```

## Atelier ter vergelijking

Atelier gebruikt:

```text
src/main/index.ts
ipcMain.handle('image:generate-ai', ...)
```

Die route was de referentie voor de Engine-fix. Als Engine ooit weer stuk loopt, vergelijk dan eerst met deze Atelier-route.

## Diagnose bij toekomstige bugs

Als je tekst terugkrijgt zoals:

```text
Hallo. Je hebt een paar keer dezelfde frase herhaald...
```

dan gebruikt Engine waarschijnlijk nog de gewone tekstchat-route. Check dan:
- Komt `agentLabel` mee in `engine:send-message`?
- Herkent `isImageGenerationModel(...)` het model?
- Staat het model misschien opgeslagen zonder `modality`?
- Bevat model-id of label een herkenbaar image-keyword?

Als er geen beeld zichtbaar is maar de backend wel image-output krijgt:
- Check of `imageObjectToToken(...)` een geldige `[IMAGE:...]` teruggeeft.
- Check of base64 niet dubbel als `data:image/png;base64,data:image/png;base64,...` wordt verpakt.
- Check of de lokale `file://` bestaat in `/tmp`.
- Check of `EngineCommandCenterPage` het `engine:message-added` event ontvangt.

Als loading klaar is en het beeld verdwijnt:
- Dan komt streaming wel binnen, maar het definitieve assistant-bericht niet.
- Check `engine:message-added` en Supabase `engine_messages`.

## Logs

Bij Engine image-generatie zijn deze logs nuttig:

```text
[engine:image] HTTP status: ...
[engine:image] fallback image-only status: ...
[engine:image] images: ... | tokens: ... | text: ...
```

Als `images: 0` en `text: yes`, dan vraagt OpenRouter waarschijnlijk nog tekst terug of het model is niet correct als image-model aangeroepen.

## Let op

Wijzigingen in `src/main/engine-ipc.ts` en `src/preload/index.ts` vereisen een volledige herstart van de Electron app. Een renderer refresh is dan niet genoeg.
