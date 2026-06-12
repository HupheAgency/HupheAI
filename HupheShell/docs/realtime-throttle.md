# Realtime & IPC Throttling Strategy

## 1. Probleem

Momenteel triggeren frequente UI-events zoals `onMouseMove` tijdens een sleepoperatie direct een status-synchronisatie via Supabase Realtime en Electron IPC. Dit overspoelt het netwerk en het hoofdproces met een zeer hoog volume aan berichten (60+ per seconde), wat leidt tot een trage en niet-responsieve gebruikerservaring voor zowel de actieve gebruiker als voor medewerkers.

## 2. Voorgestelde Oplossing: Ontkoppel Interactie van Synchronisatie

Het kernprincipe is het scheiden van de hoogfrequente lokale UI-updates en de minder frequente synchronisatie-updates op afstand.

- **Lokale State:** Dit is de staat die direct wordt gemanipuleerd door de interacties van de gebruiker (bijv. de positie van een element dat wordt versleept). Deze updates moeten snel en lokaal voor het component zijn en mogen geen synchronisatie op afstand activeren. De `image-drag-dom.ts` helper is hier een primair voorbeeld van, waarbij de DOM direct wordt bijgewerkt.

- **Sync State:** Dit is de "gecommitte" staat die wordt uitgezonden naar andere clients of wordt opgeslagen in de backend. Deze staat wordt alleen bijgewerkt aan het einde van een interactie of met een vertraagd (throttled) interval voor continue acties.

## 3. Event-gebaseerde Synchronisatie Triggers

We zullen een duidelijk beleid hanteren voor welke gebruikersacties een synchronisatie op afstand activeren:

### Acties die een **onmiddellijke** sync zullen triggeren:

Dit zijn discrete, significante wijzigingen in de presentatiestatus.

- **`onMouseUp`** (na het slepen van een element): Legt de definitieve positie vast.
- **`onBlur`** (na het bewerken van een tekstveld): Legt de definitieve tekstinhoud vast.
- **Slide Selectie Wijziging:** Wanneer de gebruiker op een andere slide in de slide-strip klikt.
- **Layout Wijziging:** Wanneer een nieuwe layout op een slide wordt toegepast.
- **Block/Slide Operaties:** Toevoegen, verwijderen of dupliceren van een slide.
- **Commentaar Operaties:** Toevoegen, oplossen of verwijderen van een opmerking.

### Acties die **geen** directe sync zullen triggeren:

Dit zijn hoogfrequente events die alleen de lokale UI zouden moeten beïnvloeden.

- **`onMouseMove`** (tijdens slepen of pannen): De positie wordt lokaal bijgewerkt.
- **`onHover`** (over een willekeurig element): Hover-statussen zijn puur visueel en lokaal.
- **`onKeyDown` / `onKeyUp`** (tijdens het typen): Tekst wordt bijgewerkt in de lokale input-staat. De synchronisatie vindt pas plaats bij `onBlur`.

## 4. Throttling voor Continue Live Weergaven

Voor functies die een "live" weergave van de acties van een andere gebruiker vereisen (zoals het zien van hun cursor), zullen we niet elk event versturen. In plaats daarvan gebruiken we een throttling-mechanisme.

### Throttle Implementatie (Zonder nieuwe dependencies)

Een eenvoudige throttle kan worden geïmplementeerd met `setTimeout` en een timestamp-check. Dit zorgt ervoor dat de broadcast-functie maximaal eens per `X` milliseconden wordt aangeroepen (bijv. `1000 / 15` voor 15fps).

```typescript
// Voorbeeld van een throttle-implementatie
function createThrottledBroadcaster(broadcastFn: (...args: any[]) => void, delay: number) {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let lastArgs: any[] | null = null;

  const throttledFn = () => {
    if (lastArgs) {
      broadcastFn(...lastArgs);
      lastArgs = null;
      timeoutId = setTimeout(throttledFn, delay);
    } else {
      timeoutId = null;
    }
  };

  return (...args: any[]) => {
    lastArgs = args;
    if (!timeoutId) {
      timeoutId = setTimeout(throttledFn, delay);
    }
  };
}
```

Deze throttled functie zou worden gebruikt voor het uitzenden van zaken als cursor- of scrollposities, met een vertraging van ongeveer `66ms` (~15fps).

## 5. Voorgestelde API voor Integratie

Om dit te integreren, kunnen we een nieuwe hook of een wrapper rond de bestaande synchronisatielogica introduceren.

### `useSyncManager` Hook Interface

Deze hook zou de staat beheren en beslissen wanneer deze moet worden uitgezonden.

```typescript
interface SyncPayload {
  // De data die gesynchroniseerd moet worden, bijv. de presentatiestatus
  presentationState: Presentation;
  // Optioneel: specifiek event-type voor meer granulaire updates
  eventType?: 'drag' | 'text' | 'layout';
}

interface SyncManager {
  /**
   * Zendt onmiddellijk een significante statuswijziging uit.
   * Gebruik voor onMouseUp, onBlur, etc.
   */
  commit: (payload: SyncPayload) => void;

  /**
   * Zendt de status uit met een vertraagde snelheid (bijv. 15fps).
   * Gebruik voor continue updates zoals cursorpositie.
   */
  liveUpdate: (payload: { cursorPosition: { x: number; y: number } }) => void;
}

function useSyncManager(channel: RealtimeChannel): SyncManager {
  // ... implementatie met createThrottledBroadcaster en useCallback ...
}
```

### Integratievoorbeeld

```tsx
// In SlideEditorPage.tsx
const syncManager = useSyncManager(supabaseChannel);

const handleImageDragEnd = (blockId, newOffset) => {
  // Update lokale React state
  const newBlocks = updateBlocks(...);
  setBlocks(newBlocks);

  // Commit de wijziging naar medewerkers
  syncManager.commit({ presentationState: { blocks: newBlocks, ... } });
};
```

Dit ontwerp zorgt voor een duidelijke scheiding van verantwoordelijkheden, verbetert de prestaties aanzienlijk en vermindert het netwerkverkeer, terwijl het toch een responsieve "live" samenwerkingservaring mogelijk maakt waar nodig.