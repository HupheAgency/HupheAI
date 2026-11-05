/** Minimal line icons (24×24, stroke only). Every icon button names itself through aria-label; the label shows as a tooltip after a pause. */
const PATHS = {
  videoAdd: 'M3 7a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM15 10l6-3v10l-6-3M9 9v6M6 12h6',
  audioAdd: 'M9 18V6l10-2v12M9 18a3 3 0 1 1-3-3 3 3 0 0 1 3 3zM19 16a3 3 0 1 1-3-3 3 3 0 0 1 3 3z',
  imageAdd: 'M4 5h16v14H4zM4 16l4-4 4 4 3-3 5 5M15 9.5h.01',
  library: 'M4 5h7v14H4zM13 5h7v14h-7z',
  newFile: 'M6 3h8l4 4v14H6zM14 3v4h4M12 11v6M9 14h6',
  save: 'M5 3h11l3 3v15H5zM8 3v5h7V3M8 21v-7h8v7',
  export: 'M12 15V4M8 8l4-4 4 4M5 14v6h14v-6',
  emptyBlock: 'M4 6h16v12H4zM12 9v6M9 12h6',
  trackVideo: 'M3 6h18v5H3zM3 14h18M7 19h10M12 14v5',
  trackAudio: 'M3 8h18v8H3zM6 12h1M9 10v4M12 11v2M15 9v6M18 12h.01',
  scissors: 'M6 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM8.1 7.9 20 20M8.1 16.1 20 4',
  undo: 'M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3',
  redo: 'm15 14 5-5-5-5M20 9H10a6 6 0 0 0 0 12h3',
  ripple: 'M4 12h6M14 12h6M10 8v8M14 8v8M7 8 4 12l3 4M17 8l3 4-3 4',
  zoom: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4M8 11h6M11 8v6',
  play: 'M7 4.5v15l12-7.5z',
  pause: 'M8 5v14M16 5v14',
  skipBack: 'M6 5v14M19 5 9 12l10 7z',
  lock: 'M6 11h12v9H6zM8 11V8a4 4 0 0 1 8 0v3',
  unlock: 'M6 11h12v9H6zM8 11V8a4 4 0 0 1 7.5-2',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  eyeOff: 'M3 3l18 18M10.6 6.1A9.6 9.6 0 0 1 12 6c6 0 10 6 10 6a17 17 0 0 1-3.2 3.7M6.6 7.6A17 17 0 0 0 2 12s4 7 10 7a9.7 9.7 0 0 0 4.4-1M9.9 9.9a3 3 0 0 0 4.2 4.2',
  volume: 'M4 10h4l5-4v12l-5-4H4zM16 9a4 4 0 0 1 0 6',
  volumeOff: 'M4 10h4l5-4v12l-5-4H4zM17 9l4 6M21 9l-4 6',
  headphones: 'M4 15v-3a8 8 0 0 1 16 0v3M4 15h3v5H5a1 1 0 0 1-1-1zM20 15h-3v5h2a1 1 0 0 0 1-1z',
  up: 'm6 14 6-6 6 6',
  down: 'm6 10 6 6 6-6',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6',
  clip: 'M4 5h16v14H4zM4 9h16M9 5v4M15 5v4',
  sparkles: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z',
  wand: 'M5 19 16 8M14 6l4 4M17 3v3M16.5 4.5h3M6 5v2M5 6h2M20 14v2M19 15h2',
  layers: 'M12 3 3 8l9 5 9-5zM3 13l9 5 9-5M3 17.5 12 22l9-4.5',
  close: 'M6 6l12 12M18 6 6 18',
  sliders: 'M4 7h9M17 7h3M4 17h3M11 17h9M15 4v6M9 14v6',
  text: 'M5 6V4h14v2M12 4v16M9 20h6',
  flag: 'M6 21V4M6 5h11l-2 4 2 4H6',
  magnet: 'M5 4v8a7 7 0 0 0 14 0V4h-4v8a3 3 0 0 1-6 0V4zM5 8h4M15 8h4',
  loop: 'M17 2l3 3-3 3M4 11V9a4 4 0 0 1 4-4h12M7 22l-3-3 3-3M20 13v2a4 4 0 0 1-4 4H4',
  fullscreen: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  rangeIn: 'M9 4H5v16h4M9 12h11M16 8l4 4-4 4',
  rangeOut: 'M15 4h4v16h-4M15 12H4M8 8l-4 4 4 4',
  grip: 'M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01',
} as const

export type TimelineIconName = keyof typeof PATHS

export function Icon({ name, size = 16 }: { name: TimelineIconName; size?: number }) {
  const filled = name === 'play'
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d={PATHS[name]} /></svg>
}
