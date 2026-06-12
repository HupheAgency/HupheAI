# Huphe Huisstijl

> Referentiedocument voor consistente UI. Gebruik dit als je een nieuwe pagina, module of component bouwt.

---

## Kleuren

| Rol | Waarde |
|-----|--------|
| Accent (geel) | `#facc15` |
| Accent hover | `#fde047` |
| Achtergrond (diepste) | `#0a0a0a` |
| Paneel achtergrond | `#111111` |
| Kaart / input | `#141414` |
| Elevated surface | `#1a1a1a` |
| Border (subtiel) | `border-white/[0.07]` |
| Border (zichtbaar) | `border-white/[0.12]` |
| Border (actief/focus) | `border-[#facc15]/40` |

**Tekst opaciteiten** (altijd `text-white/XX`):

| Rol | Klasse |
|-----|--------|
| Primair | `text-white/90` |
| Secundair | `text-white/60` |
| Tertiair / hint | `text-white/40` |
| Placeholder / label | `text-white/35` |
| Uitgeschakeld | `text-white/22` |
| Accent | `text-[#facc15]` |

---

## Typografie

```
Sectielabels (uppercase):
  text-[11px] font-semibold uppercase tracking-[0.16em] text-white/40

Sectielabels (accent):
  text-[11px] font-semibold uppercase tracking-[0.16em] text-[#facc15]

Invoerlabels:
  text-[11px] font-medium uppercase tracking-wide text-white/35

Koptekst (paneel/kaart):
  text-lg font-semibold tracking-tight text-white/90

Paginatitel:
  text-2xl font-medium tracking-tight text-white/90

Bodytekst:
  text-sm text-white/70  (of /60 voor secundair)

Kleinste labels / meta:
  text-[10px] font-semibold uppercase tracking-widest text-white/30
```

---

## Knoppen

### Primair (CTA)
```tsx
className="h-9 rounded-xl bg-[#facc15] px-4 text-sm font-semibold text-black transition-colors hover:bg-[#fde047] disabled:opacity-40 disabled:cursor-not-allowed"
```

### Primair groot
```tsx
className="h-10 rounded-xl bg-[#facc15] px-5 text-sm font-semibold text-black transition-colors hover:bg-[#fde047]"
```

### Secundair (outline)
```tsx
className="h-9 rounded-lg border border-white/[0.08] bg-transparent px-3 text-xs text-white/60 transition-colors hover:border-white/20 hover:text-white"
```

### Ghost (tekst)
```tsx
className="text-sm text-white/50 transition-colors hover:text-white"
```

### Destructief
```tsx
className="rounded-lg border border-white/[0.07] px-2.5 py-1.5 text-[11px] text-white/38 transition-colors hover:border-red-500/25 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-30"
```

### Icoonsknop (vierkant)
```tsx
className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/[0.07] bg-transparent text-white/50 transition-colors hover:border-white/[0.14] hover:text-white"
```

### Nieuw-document / FAB
```tsx
className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-[#facc15] text-xl text-black transition-colors hover:bg-[#fde047]"
```

---

## Invoervelden

### Tekstinvoer
```tsx
className="h-10 w-full rounded-xl border border-white/[0.07] bg-[#141414] px-3 text-sm text-white/90 outline-none transition-colors placeholder:text-white/25 focus:border-[#facc15]/40"
```

### Selectbox
```tsx
className="h-9 w-full rounded-xl border border-white/[0.07] bg-black/20 px-2.5 text-sm text-white/80 outline-none transition-colors hover:border-white/[0.14] focus:border-[#facc15]/40"
```

### Invoerlabel (wrapper)
```tsx
<label className="block">
  <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-white/35">Veldnaam</span>
  <input ... />
</label>
```

---

## Kaarten & panelen

### Kaart (standaard)
```tsx
className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-4"
```

### Kaart (donker, elevated)
```tsx
className="rounded-xl border border-white/[0.07] bg-[#151515] p-4"
```

### Kaart (accent / actief)
```tsx
className="rounded-xl border border-[#facc15]/40 bg-[#facc15]/10 p-4"
```

### Kaart (gestippeld, dropzone / leeg)
```tsx
className="rounded-xl border border-dashed border-white/[0.10] px-4 py-5"
```

### Zijpaneel (rechts)
```tsx
className="h-full overflow-y-auto border-l border-white/[0.07] bg-[#111111] px-6 pb-7 pt-4 shadow-2xl"
```

### Modal overlay
```tsx
className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/70 backdrop-blur-sm px-6"
```

### Modal inhoud
```tsx
className="w-full max-w-md overflow-hidden rounded-2xl border border-white/[0.07] bg-[#141414] shadow-2xl"
```

---

## Tabs

### Tab-balk (2 of meer tabs)
```tsx
<div className="grid grid-cols-2 rounded-xl border border-white/[0.07] bg-white/[0.03] p-1">
  <button className={[
    'h-9 rounded-lg text-xs font-semibold transition-colors',
    actief ? 'bg-white/[0.10] text-white/90' : 'text-white/38 hover:text-white/70',
  ].join(' ')}>
    Tabblad
  </button>
</div>
```

---

## Inline toolbar (rij knoppen)

Gebruikt in de Typewriter en vergelijkbare editors. Knoppen in een rij met `divide-x`:

```tsx
<div className="overflow-hidden rounded-xl border border-white/[0.07] bg-black/20">
  <div className="grid grid-cols-4 divide-x divide-white/[0.07]">
    <button
      type="button"
      className="flex h-9 items-center justify-center text-white/60 transition-colors hover:bg-white/[0.06] hover:text-white"
    >
      {/* icoon of label */}
    </button>
    {/* ... */}
  </div>
</div>
```

Voor een tweede rij (bijv. lijsten onder uitlijnen):
```tsx
<div className="grid grid-cols-2 divide-x divide-white/[0.07] border-t border-white/[0.07]">
```

---

## Chips & badges

### Modus-chip (met sluitknop)
```tsx
<span className="flex min-w-0 items-center gap-2 rounded-full border border-white/[0.07] bg-white/[0.04] px-3 py-1.5 text-sm text-white/75">
  <span className="text-[#facc15]">{icon}</span>
  <span className="truncate">{label}</span>
  <button className="-mr-1 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-white/35 hover:bg-white/[0.08] hover:text-white/80">✕</button>
</span>
```

### Statusbadge (klein)
```tsx
className="rounded-full bg-white/[0.05] px-3 py-1 text-[11px] text-white/35"
```

---

## Iconen

- Gebruik altijd `<svg>` inline — geen externe icon libraries.
- Standaard maat voor knoppen: `width="14" height="14"` of `width="16" height="16"`.
- Stroke-breedte: `strokeWidth="2"` (standaard), `strokeWidth="1.5"` (fijner), `strokeWidth="2.5"` (zwaarder / nadruk).
- Altijd `strokeLinecap="round" strokeLinejoin="round"` voor organisch gevoel.
- Kleur via `stroke="currentColor"` of `fill="currentColor"` — nooit hardcoded.

```tsx
<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
  {/* paths */}
</svg>
```

---

## Animaties & overgangen

| Doel | Klasse |
|------|--------|
| Kleurovergang | `transition-colors` |
| Zichtbaarheid | `transition-opacity duration-200` |
| Layout / padding | `transition-[padding] duration-300` |
| Laadspinner | `animate-spin` |
| Live indicator | `animate-ping` (op een gestapelde `<span>`) |
| Hover tonen | `opacity-0 group-hover:opacity-100 transition-opacity` |

---

## Sectiestructuur in panelen

Standaard opbouw van een sectie in een zijpaneel:

```tsx
<section>
  <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/40">
    Sectienaam
  </p>
  {/* inhoud */}
</section>
```

Ruimte tussen secties: `space-y-6` op de container.

---

## Pagina-layout (embedded module)

```tsx
<main className="h-full overflow-hidden bg-[#0a0a0a] text-white">
  <div className="grid h-full grid-cols-[minmax(0,1fr)_520px]">
    {/* hoofd canvas / editor */}
    <section className="flex min-w-0 flex-col">
      <header className="flex h-16 flex-shrink-0 items-center border-b border-white/[0.07] px-7">
        {/* titel, status */}
      </header>
      <div className="flex-1 overflow-y-auto px-7 py-7">
        {/* inhoud */}
      </div>
    </section>

    {/* rechter paneel */}
    <aside className="h-full overflow-y-auto border-l border-white/[0.07] bg-[#111111] px-6 pb-7 pt-4 shadow-2xl">
      {/* tabs + secties */}
    </aside>
  </div>
</main>
```

Breedte rechter paneel: `520px` (breed, voor tools) of `440px` (compact). Standaard breedte in Typewriter is 345px, minimum 230px, maximum 460px, ingesteld via `rightPanelWidth` state.

---

## Contextmenu

```tsx
<div
  className="fixed z-[300] w-52 overflow-hidden rounded-xl border border-white/[0.10] bg-[#1b1b1b] p-1 shadow-2xl"
  style={{ left: x, top: y }}
>
  <button className="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-white/78 transition-colors hover:bg-white/[0.07] hover:text-white">
    Optie
    <span className="text-[#facc15]">→</span>
  </button>
</div>
```

---

## Foutmeldingen & toasts

### Fout onderaan
```tsx
className="absolute bottom-8 left-1/2 -translate-x-1/2 rounded-xl bg-red-900/80 px-4 py-2.5 text-xs text-red-200"
```

### Laad-overlay (over content)
```tsx
<div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
  <div className="text-sm text-white/70">Genereren…</div>
</div>
```

---

## Toon & schrijfstijl (UI-teksten)

- **Nederlands**, altijd. Geen Engelse labels in de UI.
- **Werkwoorden**: imperatiefvorm in knoppen: "Opslaan", "Genereer", "Exporteer" — niet "Sla op", "Genereren", "Exporteren".
- **Statusmeldingen**: kort en bevestigend: "Opgeslagen", "Gegenereerd", "Gearchiveerd".
- **Lege states**: vriendelijk en verklarend: "Nog geen projecten. Maak er een aan via de knop rechts."
- **Foutmeldingen**: concreet, zonder technische termen tenzij nodig.
- Geen hoofdletters midden in een zin tenzij het een eigennaam is.
