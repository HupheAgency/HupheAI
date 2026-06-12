/**
 * Master icon library — alle SVG iconen van de app op één plek.
 *
 * Gebruik:
 *   import { IcoTrash, IcoEye } from './Icons'
 *   <IcoTrash size={12} />
 *
 * Alle iconen gebruiken `currentColor` als stroke/fill zodat kleur altijd
 * via de parent of een Tailwind `text-*` class gestuurd kan worden.
 * Standaard: strokeLinecap="round", strokeLinejoin="round".
 */

// ── Navigatie / richting ──────────────────────────────────────────────────────

export function IcoChevronDown({ size = 11 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  )
}

export function IcoChevronUp({ size = 11 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 15 12 9 18 15" />
    </svg>
  )
}

export function IcoChevronLeft({ size = 11 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  )
}

export function IcoChevronRight({ size = 11 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  )
}

/** Kleine chevron voor het in/uitklappen van secties (9×9 raster). */
export function IcoCollapse({ open, size = 9 }: { open: boolean; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 9 9" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
      <path d={open ? 'M1.5 6L4.5 3L7.5 6' : 'M1.5 3L4.5 6L7.5 3'} />
    </svg>
  )
}

/** Pijl voor het uitklappen/inklappen van een rechter zijpaneel. */
export function IcoPanelToggle({ open, size = 15 }: { open: boolean; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      {open ? <path d="m9 18 6-6-6-6" /> : <path d="m15 18-6-6 6-6" />}
    </svg>
  )
}

// ── Algemene acties ───────────────────────────────────────────────────────────

export function IcoPlus({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

export function IcoClose({ size = 10 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M1 1l8 8M9 1L1 9" />
    </svg>
  )
}

export function IcoCloseLarge({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}

export function IcoSearch({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  )
}

export function IcoTrash({ size = 11 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1.5 2.5h7M4 2.5V1.5h2V2.5M3 2.5l.5 6h3l.5-6" />
    </svg>
  )
}

export function IcoPencil({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
    </svg>
  )
}

export function IcoCheck({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 6l3 3 5-5" />
    </svg>
  )
}

export function IcoMenu({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  )
}

export function IcoUpload({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="16 16 12 12 8 16" />
      <line x1="12" y1="12" x2="12" y2="21" />
      <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" />
    </svg>
  )
}

// ── Laag / editor acties ──────────────────────────────────────────────────────

/** Oog — element zichtbaar. */
export function IcoEye({ size = 11 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round">
      <path d="M1 5.5C1 5.5 3 2 5.5 2S10 5.5 10 5.5 8 9 5.5 9 1 5.5 1 5.5Z" />
      <circle cx="5.5" cy="5.5" r="1.3" />
    </svg>
  )
}

/** Doorgestreept oog — element verborgen. */
export function IcoEyeOff({ size = 11 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round">
      <path d="M1 1l9 9M4.3 2.2A5 5 0 0 1 5.5 2c2.5 0 4.5 2.5 4.5 3.5a4.7 4.7 0 0 1-1.1 1.8M2 3.8C1.4 4.4 1 5 1 5.5c0 1 2 3.5 4.5 3.5a4.8 4.8 0 0 0 2-.5" />
    </svg>
  )
}

/** Slotje dicht — element vergrendeld. */
export function IcoLock({ size = 10 }: { size?: number }) {
  return (
    <svg width={size} height={size + 1} viewBox="0 0 10 11" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round">
      <path d="M3 4.5V3a2 2 0 0 1 4 0v1.5" />
      <rect x="1" y="4.5" width="8" height="6" rx="1" fill="currentColor" stroke="none" />
      <circle cx="5" cy="7.5" r="1" fill="black" fillOpacity="0.35" stroke="none" />
    </svg>
  )
}

/** Slotje open — element ontgrendeld. */
export function IcoLockOpen({ size = 10 }: { size?: number }) {
  return (
    <svg width={size} height={size + 1} viewBox="0 0 10 11" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round">
      <rect x="1" y="4.5" width="8" height="6" rx="1" />
      <path d="M3 4.5V3a2 2 0 0 1 4 0" />
    </svg>
  )
}

/** Twee overlappende vlakken — element dupliceren. */
export function IcoDuplicate({ size = 11 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3.5" y="3.5" width="6" height="6" rx="1" />
      <path d="M2 7.5H1.5A1 1 0 0 1 .5 6.5v-5A1 1 0 0 1 1.5.5h5A1 1 0 0 1 7.5 1.5V2" />
    </svg>
  )
}

/** Kettingschakel — lagen zijn gekoppeld. */
export function IcoLink({ size = 11 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
      <path d="M4 6.5a2.5 2.5 0 0 0 3.5 0l1.5-1.5A2.5 2.5 0 0 0 5.5 1.5L4.75 2.25" />
      <path d="M7 4.5a2.5 2.5 0 0 0-3.5 0L2 6A2.5 2.5 0 0 0 5.5 9.5L6.25 8.75" />
    </svg>
  )
}

/** Zes punten — sleepgreep voor herordenen. */
export function IcoGrip({ size = 8 }: { size?: number }) {
  return (
    <svg width={size} height={Math.round(size * 1.5)} viewBox="0 0 8 12" fill="none">
      <circle cx="2.5" cy="2.5" r="1" fill="currentColor" />
      <circle cx="5.5" cy="2.5" r="1" fill="currentColor" />
      <circle cx="2.5" cy="6" r="1" fill="currentColor" />
      <circle cx="5.5" cy="6" r="1" fill="currentColor" />
      <circle cx="2.5" cy="9.5" r="1" fill="currentColor" />
      <circle cx="5.5" cy="9.5" r="1" fill="currentColor" />
    </svg>
  )
}

// ── Laagtype-iconen (voor het lagen-menu) ─────────────────────────────────────

export function IcoLayerImage({ size = 11 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round">
      <rect x="0.5" y="1.5" width="10" height="8" rx="1" />
      <path d="M0.5 7L3 5L5.5 7L7.5 5.5L10.5 7" />
      <circle cx="3.5" cy="3.5" r="0.8" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function IcoLayerHeading({ size = 11 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
      <path d="M1.5 2.5v6M1.5 5.5h8M9.5 2.5v6" />
    </svg>
  )
}

export function IcoLayerText({ size = 11 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round">
      <path d="M1.5 3h8M1.5 5.5h8M1.5 8h5" />
    </svg>
  )
}

export function IcoLayerBox({ size = 11 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.1">
      <rect x="1" y="1" width="9" height="9" rx="1.5" />
    </svg>
  )
}

// ── Bestand / media ───────────────────────────────────────────────────────────

export function IcoFile({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
    </svg>
  )
}

export function IcoFolder({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  )
}

export function IcoVideo({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="14" height="14" rx="2" />
      <path d="M17 9l4-2v10l-4-2" />
    </svg>
  )
}

export function IcoImage({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="M21 15l-5-5L5 21" />
    </svg>
  )
}

// ── Zijpaneel / editor UI ─────────────────────────────────────────────────────

export function IcoCode({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3.5 3.5L1 6L3.5 8.5" />
      <path d="M8.5 3.5L11 6L8.5 8.5" />
      <path d="M7 2L5 10" />
    </svg>
  )
}

export function IcoLayers({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="5" rx="1" />
      <rect x="2" y="10" width="20" height="5" rx="1" />
      <rect x="2" y="17" width="20" height="5" rx="1" />
    </svg>
  )
}

export function IcoComment({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  )
}

export function IcoSparkle({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2l1.5 4.5L18 8l-4.5 1.5L12 14l-1.5-4.5L6 8l4.5-1.5z" />
      <path d="M19 15l.8 2.4L22 18l-2.2.6L19 21l-.8-2.4L16 18l2.2-.6z" />
    </svg>
  )
}

export function IcoSpinner({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  )
}

export function IcoSettings({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  )
}

// ── Module-navigatie iconen (sidebar pill) ────────────────────────────────────

export function IcoHome({ size = 19 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  )
}

export function IcoPulse({ size = 19 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  )
}

export function IcoAtelier({ size = 19 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 9h18" />
      <path d="M9 21V9" />
    </svg>
  )
}

export function IcoEngine({ size = 19 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="16 18 22 12 16 6" />
      <polyline points="8 6 2 12 8 18" />
    </svg>
  )
}

export function IcoFlow({ size = 19 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="18" cy="18" r="3" />
      <circle cx="6" cy="6" r="3" />
      <path d="M13 6h3a2 2 0 0 1 2 2v7" />
      <line x1="6" y1="9" x2="6" y2="21" />
    </svg>
  )
}

export function IcoTypewriter({ size = 19 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
    </svg>
  )
}

export function IcoLedger({ size = 19 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  )
}

export function IcoTwin({ size = 19 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  )
}

export function IcoBackstage({ size = 19 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2L2 7l10 5 10-5-10-5z" />
      <path d="M2 17l10 5 10-5" />
      <path d="M2 12l10 5 10-5" />
    </svg>
  )
}
