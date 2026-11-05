# Videotimeline uitleveren aan collega's

Status (november 2026): nog niet uitgeleverd. Eerst zelf testen. Deze notitie staat er zodat de stappen niet vergeten worden.

## Eerst zelf testen

- ⌘Z, ⇧⌘Z, ⌘C/⌘V/⌘X/⌘A in de tijdlijn (het menu stuurt die eerst naar de tijdlijn; niet geautomatiseerd getest).
- Pinch-zoom, slepen, export (MP4 en ProRes), rode foutmarkering.
- Nog niet met echte generaties getest: Kling v4 video-naar-video, Kling v3 Pro motion control, Bria achtergrond verwijderen (ook of de transparantie in preview en export klopt).

## Bouwen

Voor elke versie die je uitdeelt opnieuw bouwen; oude zips bevatten latere wijzigingen niet.

```
npm run dist:mac                      # Apple Silicon (M1 of nieuwer) → dist/HupheAI-<versie>-arm64-mac.zip
npx electron-builder --mac zip --x64  # Intel → dist/HupheAI-<versie>-mac.zip (hernoem naar ...-intel-mac.zip)
```

- `npm run dist:mac` probeert ook een universele build; die faalt op een bibliotheek van de AI-onderdelen (`onnxruntime`, hetzelfde bestand in beide architecturen). De arm64-zip is dan wel klaar. Hij blokkeert niets zolang de Intel-versie apart wordt gebouwd.
- De builds zijn niet ondertekend. Zie hieronder voor de stappen van de collega.

## Wat collega's doen

1. Zip uitpakken, app naar Programma's slepen.
2. De eerste keer rechtsklikken → Open (of Systeeminstellingen → Privacy en beveiliging → Toch openen).
3. In de timeline op **FFmpeg installeren** drukken. Staat Homebrew er nog niet op, dan vraagt de app eerst bevestiging en daarna het Mac-wachtwoord.

## Eerste proef bij een collega

De installatie van Homebrew via de app is nog nooit gedraaid op een Mac zonder Homebrew. Laat eerst één collega zonder Homebrew het proberen voordat je het breed deelt. Mogelijke haken: Xcode-commandoregeltools (tweede wachtwoordvraag, lange wachttijd), firewall die GitHub blokkeert, geen beheerdersrechten.

## Later (niet nodig om te beginnen)

- Apple Developer-account (circa 99 dollar per jaar), ondertekenen en notariseren: `npm run dist:mac:signed`. Dan verdwijnt de rechtsklik-stap.
- Universele LGPL-FFmpeg meeleveren (`brew install nasm`, daarna `ARCH=universal npm run ffmpeg:build`), zodat FFmpeg niet geïnstalleerd hoeft te worden. Zie ook `scripts/build-ffmpeg-lgpl.sh`.
- Patentvraag H.264/AAC: een verantwoordelijke aanwijzen voordat de app breed wordt verspreid.
- Servermatig herstel van generaties die verloren gaan als de app tijdens het genereren wordt gesloten (`proxy-fal-video`).
