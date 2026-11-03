import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent, type PointerEvent } from 'react'
import { activeMedia, clipTrackId, renderableProject, sourceSeconds, newTimelineProject, timelineTracks, timelineEnd, timelineProblems, type TimelineAsset, type TimelineClip, type TimelineGeneration, type TimelineProject, type TimelineVariant, type TimelineTrack } from '../../../shared/video-timeline'
import { assetClip, assetTrackKind, editSnapshot, mergeGesture, moveTrack, reorderTrack, newTrack, nearestSnap, pasteClips, placeAsset, planAssetDrop, snapSpan, snapTargets, splitClip, trackIsLocked, TIMELINE_ASSET_MIME, type TimelineDrop, type TimelineEdit } from '../components/video-timeline/timeline-editing'
import { TimelineGenerationControls, type TimelineReferenceTarget } from '../components/video-timeline/TimelineGenerationControls'
import { generationDurations, timelineGenerationCredits, timelineGenerationState, timelineFinalizeCredits } from '../components/video-timeline/timeline-generation'
import { TimelinePreview } from '../components/video-timeline/TimelinePreview'
import { TimelineScrubber } from '../components/video-timeline/TimelineScrubber'
import { TimelineLane, type TimelineDrawRange } from '../components/video-timeline/TimelineLane'
import { TimelineEditControls, TIMELINE_EDIT_TOOLS, type TimelineEditState } from '../components/video-timeline/TimelineEditControls'
import { TimelineBlockDecor } from '../components/video-timeline/TimelineBlockDecor'
import { TimelineEffectsControls } from '../components/video-timeline/TimelineEffectsControls'
import { Icon } from '../components/video-timeline/TimelineIcons'
import { TimelineTooltip } from '../components/video-timeline/TimelineTooltip'
import { TimelineRifeControls } from '../components/video-timeline/TimelineRifeControls'
import { RIFE_MODEL, transitionCaptureIsCurrent, transitionOutputProblem, transitionPlaybackProblems, transitionSourceSignature, transitionVariantIsCurrent, validateTransitionRange } from '../../../shared/video-timeline-transition'
import { loadAtelierMediaProjects, type AtelierVideoCapability } from '../hooks/useAtelierMedia'
import { loadModuleModels } from '../lib/atelier-module-config'
import { supabase } from '../lib/supabase'
import './video-timeline.css'

const api = () => (window as any).api
const uid = () => crypto.randomUUID()
const seconds = (n: number) => Number(n.toFixed(3))
const timeLabel = (n: number) => `${Math.floor(n / 60).toString().padStart(2, '0')}:${(n % 60).toFixed(2).padStart(5, '0')}`

export default function VideoTimelinePage({ active = true }: { active?: boolean }) {
  const root = useRef<HTMLDivElement>(null)
  const [project, setProject] = useState<TimelineProject>(() => newTimelineProject())
  const current = useRef(project)
  const [projects, setProjects] = useState<TimelineProject[]>([])
  const [selected, setSelected] = useState<string>()
  const [selectedTrack, setSelectedTrack] = useState('video-1')
  const [dropPreview, setDropPreview] = useState<TimelineDrop>()
  const [assetDragging, setAssetDragging] = useState(false)
  const draggedAsset = useRef<string | undefined>(undefined)
  const suppressAssetClick = useRef(false)
  const [position, setPosition] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [zoom, setZoom] = useState(40)
  const [ripple, setRipple] = useState(false)
  const [tab, setTab] = useState<'clip' | 'generate' | 'edit' | 'variants'>('clip')
  const [group, setGroup] = useState<string[]>([])
  const [exportSettings, setExportSettings] = useState<{ quality: 'draft' | 'standard' | 'high'; outputHeight?: number }>(() => {
    try { return { quality: 'standard', ...JSON.parse(localStorage.getItem('vt-export') ?? '{}') } } catch { return { quality: 'standard' } }
  })
  const [exportOpen, setExportOpen] = useState(false)
  const [encoder, setEncoder] = useState<string>()
  const [renaming, setRenaming] = useState<string>()
  const [trackDrag, setTrackDrag] = useState<{ id: string; over?: string }>()
  const clipboard = useRef<TimelineClip[]>([])
  const [message, setMessage] = useState('')
  const [saveState, setSaveState] = useState('Nieuw project')
  const [busy, setBusy] = useState('')
  const [generating, setGenerating] = useState<string>()
  const [rifeCapability, setRifeCapability] = useState<AtelierVideoCapability>()
  const [editCapabilities, setEditCapabilities] = useState<AtelierVideoCapability[]>([])
  const [editState, setEditState] = useState<TimelineEditState>({ tool: TIMELINE_EDIT_TOOLS[0].id, prompt: '', extraParams: {} })
  const [capabilities, setCapabilities] = useState<AtelierVideoCapability[]>([])
  const [capLoading, setCapLoading] = useState(true)
  const [capError, setCapError] = useState('')
  const modelRequest = useRef<Promise<void> | null>(null)
  const [library, setLibrary] = useState(false)
  const [toolsAvailable, setToolsAvailable] = useState(true)
  const [, bumpHistory] = useState(0)
  const history = useRef<{ undo: TimelineEdit[]; redo: TimelineEdit[] }>({ undo: [], redo: [] })
  const saveQueue = useRef<Promise<any>>(Promise.resolve())
  const ready = useRef(false)
  const mounted = useRef(true)
  const drag = useRef<{ project: TimelineProject; clip: TimelineClip; x: number; mode: 'move' | 'left' | 'right'; targets: number[]; group: string[] } | undefined>(undefined)
  const clip = project.clips.find(c => c.id === selected)
  const tracks = timelineTracks(project)
  const visibleTracks = [...tracks.filter(t => t.kind === 'video').reverse(), ...tracks.filter(t => t.kind === 'audio')]
  const media = clip ? activeMedia(project, clip) : undefined
  const duration = timelineEnd(project) / project.fps
  const extent = Math.max(project.targetDuration, duration + 2, 10)
  const problems = [...timelineProblems(project), ...transitionPlaybackProblems(project)]
  const selectedIds = selected ? (group.includes(selected) ? group.filter(id => project.clips.some(c => c.id === id)) : [selected]) : []
  const previewProject = useMemo(() => ({ ...renderableProject(project), clips: renderableProject(project).clips.map(c => {
    const variant = c.variants.find(v => v.id === c.activeVariantId)
    return variant?.transition && (!transitionVariantIsCurrent(project, c, variant) || !!transitionOutputProblem(project, c, variant)) ? { ...c, activeVariantId: undefined } : c
  }) }), [project])
  const generation = clip?.generation
  const capability = capabilities.find(c => c.model_id === generation?.modelId)
  const generationState = generation ? timelineGenerationState(generation, capability, project.assets) : undefined
  const estimate = generationState && !generationState.errors.length ? timelineGenerationCredits(capability, generationState.snapshot, generationState.references.some(a => a.kind === 'video')) : null
  const unknownJobs = (project.jobs ?? []).filter(j => j.status === 'unknown')

  useEffect(() => {
    if (active) return
    setPlaying(false)
    root.current?.querySelectorAll('video, audio').forEach(el => (el as HTMLMediaElement).pause())
  }, [active])

  function apply(next: TimelineProject, remember = true) {
    if (remember && (next.clips !== current.current.clips || next.tracks !== current.current.tracks)) {
      history.current.undo.push(editSnapshot(current.current))
      history.current.undo = history.current.undo.slice(-50)
      history.current.redo = []
      bumpHistory(v => v + 1)
    }
    const updated = { ...next, updatedAt: new Date().toISOString() }
    current.current = updated
    setProject(updated)
    setSaveState('Wijzigingen opslaan…')
  }

  async function persist(value = current.current) {
    const snapshot = structuredClone(value)
    const work = saveQueue.current.catch(() => {}).then(async () => {
      const result = await api().timeline.save(snapshot)
      if (!result?.ok) throw new Error(result?.error ?? 'Opslaan mislukt')
      if (current.current.id === snapshot.id) localStorage.setItem('huphe:timeline:last-project', snapshot.id)
      if (mounted.current && current.current.updatedAt === snapshot.updatedAt) setSaveState('Opgeslagen op deze Mac')
      return result
    })
    saveQueue.current = work
    return work
  }

  useEffect(() => {
    mounted.current = true
    let cancelled = false
    Promise.all([api().timeline.list(), api().timeline.tools()]).then(([list, tools]) => {
      if (cancelled) return
      if (!list.ok) setMessage(list.error ?? 'Projecten laden mislukt')
      else if (list.errors?.length) setMessage(list.errors.join(' · '))
      const all = list.projects ?? []
      setProjects(all)
      setToolsAvailable(!!tools.ffmpeg && !!tools.ffprobe)
      setEncoder(tools.encoder)
      const saved = all.find((p: TimelineProject) => p.id === localStorage.getItem('huphe:timeline:last-project'))
      if (saved) openProject(saved)
      ready.current = true
      if (!saved) void persist().catch(e => setMessage(e.message))
    }).catch(e => { if (!cancelled) setMessage(e.message) })
    return () => { cancelled = true; mounted.current = false }
  }, [])

  useEffect(() => {
    if (!ready.current) return
    const timer = setTimeout(() => { void persist(project).catch(e => { setSaveState('Opslaan mislukt'); setMessage(e.message) }) }, 500)
    return () => clearTimeout(timer)
  }, [project])

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (generating || saveState.includes('opslaan') || saveState.includes('mislukt')) { e.preventDefault(); e.returnValue = '' }
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [generating, saveState])

  function openProject(value: TimelineProject) {
    const next = { ...value, jobs: value.jobs?.map(j => j.status === 'running' ? { ...j, status: 'unknown' as const, error: 'De app is gesloten tijdens deze opdracht. Controleer de bestaande generatie voordat je opnieuw start.' } : j) }
    setPlaying(false); setPosition(0); setSelected(undefined); setMessage('')
    setSelectedTrack(timelineTracks(next)[0]?.id ?? ''); setDropPreview(undefined)
    current.current = next; setProject(next)
    history.current = { undo: [], redo: [] }; bumpHistory(v => v + 1)
    localStorage.setItem('huphe:timeline:last-project', next.id)
    setSaveState('Opgeslagen op deze Mac')
  }

  function undo(redo = false) {
    if (busy || generating) return
    setPlaying(false)
    const h = history.current
    const from = redo ? h.redo : h.undo
    const to = redo ? h.undo : h.redo
    const edit = from.pop()
    if (!edit) return
    to.push(editSnapshot(current.current))
    const restored = edit.clips.map(c => {
      const latest = current.current.clips.find(item => item.id === c.id)
      return { ...c, variants: [...c.variants, ...(latest?.variants ?? []).filter(v => !c.variants.some(old => old.id === v.id))] }
    })
    const next = { ...current.current, clips: restored, tracks: edit.tracks }
    const selectedClip = restored.find(c => c.id === selected)
    setSelectedTrack(selectedClip ? clipTrackId(selectedClip) : timelineTracks(next).find(t => t.id === selectedTrack)?.id ?? timelineTracks(next)[0]?.id ?? '')
    setPosition(value => Math.min(value, timelineEnd(next) / next.fps))
    setMessage('')
    apply(next, false)
    bumpHistory(v => v + 1)
  }

  function deleteSelectedClip() {
    const base = current.current
    const ids = selectedIds.filter(id => generating !== id && base.clips.some(c => c.id === id && !trackIsLocked(base, c)))
    if (!active || busy || drag.current || !ids.length) return false
    apply({ ...base, clips: base.clips.filter(c => !ids.includes(c.id)) })
    setSelected(undefined); setGroup([])
    setPlaying(false)
    root.current?.focus({ preventScroll: true })
    return true
  }

  const frameNow = () => Math.round(position * current.current.fps)

  function splitAtPlayhead() {
    const base = current.current, frame = frameNow()
    if (!active || busy || drag.current) return
    const hit = base.clips.filter(c => c.start < frame && frame < c.start + c.duration)
    const target = hit.find(c => c.id === selected) ?? hit.find(c => clipTrackId(c) === selectedTrack) ?? (hit.length === 1 ? hit[0] : undefined)
    if (!target) { setMessage(hit.length ? 'Selecteer het fragment dat je wilt knippen.' : 'Zet de afspeelkop binnen een fragment om te knippen.'); return }
    if (trackIsLocked(base, target)) { setMessage('Dit spoor is vergrendeld.'); return }
    if (generating === target.id) { setMessage('Wacht tot de generatie van dit fragment klaar is.'); return }
    const result = splitClip(base, target.id, frame)
    if (!result) { setMessage('Overgangsblokken kunnen niet worden geknipt.'); return }
    setPlaying(false); apply(result.project)
    setSelected(result.right.id); setGroup([]); setSelectedTrack(clipTrackId(target)); setMessage('')
  }

  function trimToPlayhead(trimEnd: boolean) {
    if (!clip || !active || busy || drag.current || generating === clip.id) return
    if (trackIsLocked(project, clip)) { setMessage('Dit spoor is vergrendeld.'); return }
    const frame = frameNow()
    if (frame <= clip.start || frame >= clip.start + clip.duration) { setMessage('Zet de afspeelkop binnen het geselecteerde fragment.'); return }
    if (trimEnd) { patchClip({ duration: frame - clip.start }); return }
    const delta = frame - clip.start
    const adjust = !clip.transition && media?.asset && media.asset.kind !== 'image' && !media.variant?.transition
    patchClip({ start: frame, duration: clip.duration - delta,
      variants: adjust ? clip.variants.map(v => v.id === clip.activeVariantId ? { ...v, inPoint: Number((v.inPoint + sourceSeconds(clip, delta, project.fps)).toFixed(9)) } : v) : clip.variants, fadeIn: undefined, crossfade: undefined })
  }

  function copySelected(): boolean {
    const items = current.current.clips.filter(c => selectedIds.includes(c.id) && !c.transition && !c.variants.some(v => v.transition))
    if (!items.length) { setMessage('Selecteer eerst een fragment om te kopiëren (overgangsblokken kun je niet kopiëren).'); return false }
    clipboard.current = structuredClone(items)
    setMessage(`${items.length === 1 ? '1 fragment' : `${items.length} fragmenten`} gekopieerd. Zet de afspeelkop neer en plak met ⌘V.`)
    return true
  }

  function placeCopies(items: TimelineClip[], anchor: number, trackId?: string) {
    if (!active || busy || drag.current) return
    const result = pasteClips(current.current, items, anchor, trackId)
    if ('error' in result) { setMessage(result.error); return }
    setPlaying(false); apply(result.project)
    setSelected(result.clips[0].id); setGroup(result.clips.map(c => c.id)); setSelectedTrack(clipTrackId(result.clips[0]))
    setPosition(result.clips[0].start / result.project.fps); setMessage('')
  }

  function pasteClipboard() {
    if (!clipboard.current.length) { setMessage('Er is nog niets gekopieerd.'); return }
    placeCopies(clipboard.current, frameNow(), selectedTrack)
  }

  function duplicateSelected() {
    const items = current.current.clips.filter(c => selectedIds.includes(c.id) && !c.transition && !c.variants.some(v => v.transition))
    if (!items.length) { setMessage('Selecteer eerst een fragment om te dupliceren.'); return }
    placeCopies(items, Math.max(...items.map(c => c.start + c.duration)), items.length === 1 ? clipTrackId(items[0]) : undefined)
  }

  function stepFrames(frames: number) {
    setPlaying(false)
    setPosition(Math.min(duration, Math.max(0, Number(((frameNow() + frames) / project.fps).toFixed(6)))))
  }

  function jumpToEdit(forward: boolean) {
    const frame = frameNow()
    const points = [...new Set([0, ...project.clips.flatMap(c => [c.start, c.start + c.duration])])].sort((a, b) => a - b)
    const next = forward ? points.find(p => p > frame) : [...points].reverse().find(p => p < frame)
    if (next !== undefined) { setPlaying(false); setPosition(next / project.fps) }
  }

  function togglePlay() {
    if (!duration) return
    if (position >= duration) setPosition(0)
    setPlaying(!playing)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!active || event.defaultPrevented || event.nativeEvent.isComposing) return
    const target = event.target
    if (target instanceof HTMLElement && (target.isContentEditable || target.closest('input, textarea, select, [role="textbox"]'))) return
    const key = event.key.toLowerCase()
    const mod = event.metaKey || event.ctrlKey
    let handled = true
    if (mod && !event.altKey) {
      if (key === 'z') undo(event.shiftKey)
      else if (key === 'y') undo(true)
      else if (key === 'c') copySelected()
      else if (key === 'x') { if (copySelected()) deleteSelectedClip() }
      else if (key === 'v') pasteClipboard()
      else if (key === 'd') duplicateSelected()
      else if (key === 'a') { const ids = project.clips.map(c => c.id); if (ids.length) { setGroup(ids); setSelected(ids[0]) } }
      else handled = false
    } else if (event.altKey) handled = false
    else if ((event.key === 'Backspace' || event.key === 'Delete') && !event.repeat && !event.shiftKey) handled = deleteSelectedClip()
    else if (event.key === ' ' && !(target instanceof HTMLElement && target.closest('button'))) { if (!event.repeat) togglePlay() }
    else if (key === 's' && !event.shiftKey) splitAtPlayhead()
    else if (key === 'q') trimToPlayhead(false)
    else if (key === 'w') trimToPlayhead(true)
    else if (key === 'k') setPlaying(false)
    else if (key === 'l') { if (!playing) togglePlay() }
    else if (event.key === 'ArrowLeft') stepFrames(event.shiftKey ? -10 : -1)
    else if (event.key === 'ArrowRight') stepFrames(event.shiftKey ? 10 : 1)
    else if (event.key === 'ArrowUp') jumpToEdit(false)
    else if (event.key === 'ArrowDown') jumpToEdit(true)
    else if (event.key === 'Home') { setPlaying(false); setPosition(0) }
    else if (event.key === 'End') { setPlaying(false); setPosition(duration) }
    else if (event.key === 'Escape') { setSelected(undefined); setGroup([]) }
    else handled = false
    if (handled) { event.preventDefault(); event.stopPropagation() }
  }

  function patchTrack(trackId: string, patch: Partial<TimelineTrack>) {
    if (busy) return
    const base = current.current
    apply({ ...base, tracks: timelineTracks(base).map(t => t.id === trackId ? { ...t, ...patch } : t) })
    if (patch.hidden !== undefined || patch.muted !== undefined || patch.solo !== undefined) setPlaying(false)
  }

  function shiftTrack(trackId: string, up: boolean) {
    if (busy) return
    const tracks = moveTrack(current.current, trackId, up)
    if (tracks) apply({ ...current.current, tracks })
  }

  function dropTrack(targetId: string) {
    const dragId = trackDrag?.id
    setTrackDrag(undefined)
    if (!dragId || busy) return
    const tracks = reorderTrack(current.current, dragId, targetId)
    if (tracks) apply({ ...current.current, tracks })
  }
  const trackDropOk = (id: string) => !!trackDrag && trackDrag.id !== id && tracks.find(t => t.id === trackDrag.id)?.kind === tracks.find(t => t.id === id)?.kind

  async function action(label: string, fn: () => Promise<void>) {
    if (busy) return
    setBusy(label); setMessage('')
    try { await fn() } catch (e: any) { setMessage(e.message ?? String(e)) }
    finally { setBusy('') }
  }

  function preferredTrack(base: TimelineProject, kind: TimelineTrack['kind']): TimelineTrack | undefined {
    const available = timelineTracks(base).filter(t => t.kind === kind)
    return available.find(t => t.id === selectedTrack) ?? available[0]
  }

  function addTrack(kind: TimelineTrack['kind']) {
    const base = current.current
    if (busy || timelineTracks(base).length >= 32) return
    const track = newTrack(base, kind)
    apply({ ...base, tracks: [...timelineTracks(base), track] })
    setSelectedTrack(track.id); setSelected(undefined)
  }

  function trackIsGenerating(base: TimelineProject, trackId: string) {
    return base.clips.some(c => clipTrackId(c) === trackId && (c.id === generating
      || base.jobs?.some(job => job.clipId === c.id && job.status === 'running')))
  }

  function deleteTrack(trackId: string) {
    const base = current.current
    const track = timelineTracks(base).find(t => t.id === trackId)
    if (!active || busy || drag.current || !track || trackIsGenerating(base, trackId)) return
    const remaining = timelineTracks(base).filter(t => t.id !== trackId)
    const next = { ...base, tracks: remaining, clips: base.clips.filter(c => clipTrackId(c) !== trackId) }
    setPlaying(false)
    setPosition(value => Math.min(value, timelineEnd(next) / next.fps))
    if (base.clips.some(c => c.id === selected && clipTrackId(c) === trackId)) setSelected(undefined)
    if (selectedTrack === trackId) setSelectedTrack(remaining.find(t => t.kind === track.kind)?.id ?? remaining[0]?.id ?? '')
    setDropPreview(undefined)
    apply(next)
    setMessage(`${track.name} verwijderd. Met ‘Ongedaan maken’ herstel je het spoor en de blokken.`)
    root.current?.focus({ preventScroll: true })
  }

  function dragAsset(event: DragEvent<HTMLElement>, asset: TimelineAsset) {
    if (busy) { event.preventDefault(); return }
    draggedAsset.current = asset.id
    setAssetDragging(true)
    suppressAssetClick.current = true
    event.dataTransfer.effectAllowed = 'copy'
    event.dataTransfer.setData(TIMELINE_ASSET_MIME, JSON.stringify({ projectId: current.current.id, assetId: asset.id }))
  }

  function endAssetDrag() {
    draggedAsset.current = undefined; setDropPreview(undefined); setAssetDragging(false)
    setTimeout(() => { suppressAssetClick.current = false }, 0)
  }

  function assetFromDrag(event: DragEvent<HTMLElement>) {
    const base = current.current
    let id = draggedAsset.current
    const payload = event.dataTransfer.getData(TIMELINE_ASSET_MIME)
    if (payload) {
      try {
        const value = JSON.parse(payload)
        if (value.projectId !== base.id) return
        id = value.assetId
      } catch { return }
    }
    return base.assets.find(a => a.id === id)
  }

  function assetDrop(event: DragEvent<HTMLElement>, target: TimelineTrack | TimelineTrack['kind'], commit = false) {
    const asset = assetFromDrag(event)
    if (!asset || busy) return
    event.preventDefault(); event.stopPropagation()
    const base = current.current
    const creating = typeof target === 'string'
    const track = creating ? newTrack(base, target) : target
    const frame = creating ? Math.round(position * base.fps)
      : (event.clientX - event.currentTarget.getBoundingClientRect().left) / zoom * base.fps
    const drop = planAssetDrop(base, asset, track, frame, creating ? 0 : 8 / zoom * base.fps)
    if (creating && timelineTracks(base).length >= 32) drop.valid = false
    event.dataTransfer.dropEffect = drop.valid ? 'copy' : 'none'
    if (!commit) {
      setDropPreview({ ...drop, trackId: creating ? `new-${target}` : track.id }); return
    }
    endAssetDrag()
    if (!drop.valid) { setMessage('Plaats dit bestand in vrije ruimte, op een knip of op een passend nieuw spoor.'); return }
    const next = creating ? { ...base, tracks: [...timelineTracks(base), track] } : base
    const result = placeAsset(next, asset, track, drop)
    apply(result.project); setSelected(result.clip.id); setSelectedTrack(track.id)
    setPlaying(false); setPosition(drop.start / base.fps); setTab('clip')
    setMessage(drop.insert ? `Ingevoegd op ${track.name}. De volgende fragmenten op dit spoor zijn meegeschoven.` : '')
  }

  function leaveAssetDrop(event: DragEvent<HTMLElement>) {
    if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) setDropPreview(undefined)
  }

  function moveToTrack(trackId: string) {
    if (!clip) return
    const track = tracks.find(t => t.id === trackId && t.kind === clip.track)
    if (!track) return
    if (project.clips.some(c => c.id !== clip.id && clipTrackId(c) === track.id && c.start < clip.start + clip.duration && c.start + c.duration > clip.start)) {
      setMessage('Op deze plek is het gekozen spoor bezet. Kies een leeg spoor of verplaats het fragment eerst.'); return
    }
    patchClip({ trackId }); setSelectedTrack(trackId); setMessage('')
  }

  function addAssets(assets: TimelineAsset[], targetClipId?: string) {
    const base = current.current
    const next = { ...base, assets: [...base.assets, ...assets.filter(a => !base.assets.some(b => b.id === a.id))], clips: [...base.clips] }
    for (const asset of assets) {
      const variant = { id: uid(), assetId: asset.id, createdAt: new Date().toISOString(), inPoint: 0 }
      const target = next.clips.find(c => c.id === targetClipId)
      if (target) {
        next.clips = next.clips.map(c => c.id === target.id ? { ...c, variants: [...c.variants, variant] } : c)
      } else {
        const existing = preferredTrack(next, assetTrackKind(asset))
        if (!existing && timelineTracks(next).length >= 32) {
          setMessage('Het project heeft al 32 sporen. Maak eerst ruimte voor een passend spoor; het bestand staat in Projectmedia.'); continue
        }
        const track = existing ?? newTrack(next, assetTrackKind(asset))
        if (!existing) next.tracks = [...timelineTracks(next), track]
        const start = Math.max(0, ...next.clips.filter(c => clipTrackId(c) === track.id).map(c => c.start + c.duration))
        const added = assetClip(next, asset, track, start)
        next.clips.push(added); setSelected(added.id); setSelectedTrack(track.id); setPosition(start / base.fps)
      }
    }
    apply(next)
  }

  async function importMedia(kind: TimelineAsset['kind'], sources?: { src: string; name: string }[], asVariant = false) {
    await action('Media toevoegen…', async () => {
      setPlaying(false)
      await persist()
      const result = await api().timeline.importMedia({ projectId: current.current.id, kind, sources })
      if (result.canceled) return
      if (!result.ok) throw new Error(result.error)
      const assets: TimelineAsset[] = result.assets ?? []
      addAssets(assets, asVariant ? selected : undefined)
      setLibrary(false)
    })
  }

  function defaultGeneration(c: TimelineClip): TimelineGeneration {
    return { prompt: '', modelId: '', provider: 'fal', resolution: '720p', aspectRatio: '16:9', requestedDuration: c.duration / project.fps }
  }

  function addEmpty(range?: TimelineDrawRange, trackId?: string) {
    if (busy) return
    const base = current.current
    const existing = timelineTracks(base).find(t => t.id === trackId && t.kind === 'video') ?? preferredTrack(base, 'video')
    if (!existing && timelineTracks(base).length >= 32) { setMessage('Het project heeft al 32 sporen. Verwijder een spoor om een videospoor toe te voegen.'); return }
    const track = existing ?? newTrack(base, 'video')
    const videos = base.clips.filter(c => clipTrackId(c) === track.id)
    const start = range?.start ?? Math.max(0, ...videos.map(c => c.start + c.duration))
    const duration = range?.duration ?? 4 * base.fps
    // A pending import/generation can update the project during a drawing gesture.
    if (range && videos.some(c => start < c.start + c.duration && start + duration > c.start)) {
      setMessage('Dit gedeelte van het videospoor is inmiddels bezet. Teken een blok in de vrije ruimte.'); return
    }
    const added: TimelineClip = { id: uid(), track: 'video', trackId: track.id, label: `Scène ${base.clips.filter(c => c.track === 'video').length + 1}`, start, duration, variants: [] }
    added.generation = defaultGeneration(added)
    apply({ ...base, tracks: existing ? base.tracks : [...timelineTracks(base), track], clips: [...base.clips, added] }); setSelected(added.id); setSelectedTrack(track.id); setPosition(start / base.fps); setPlaying(false); setTab('generate'); setMessage('')
  }

  async function captureTransition(clipId: string) {
    await action('Begin- en eindbeeld maken…', async () => {
      const base = current.current
      const target = base.clips.find(c => c.id === clipId)
      if (!target) return
      const errors = validateTransitionRange(base, target)
      if (errors.length) throw new Error(errors[0])
      const signature = transitionSourceSignature(base, target)
      setPlaying(false)
      await persist(base)
      const result = await api().timeline.captureTransition({ projectId: base.id, clipId })
      if (!result.ok) throw new Error(result.error ?? 'Begin- en eindbeelden maken mislukt.')
      if (current.current.id !== base.id) return
      const latest = current.current.clips.find(c => c.id === clipId)
      if (!latest) return
      // Local capture reads a saved snapshot. Never attach it to changed geometry.
      if (latest.transition?.kind !== 'rife' || transitionSourceSignature(current.current, latest) !== signature) throw new Error('De montage is tijdens het vastleggen gewijzigd. Vernieuw de begin- en eindbeelden.')
      apply({ ...current.current, assets: [...current.current.assets, ...result.assets],
        clips: current.current.clips.map(c => c.id === clipId ? { ...c, transition: result.transition } : c) }, false)
      await persist()
      setMessage('Begin- en eindbeeld staan klaar. Kies ‘Genereer overgang’ om de tussenframes te maken.')
    })
  }

  async function generateTransition() {
    if (!clip?.transition || !rifeCapability || generating || busy || unknownJobs.length) return
    const base = current.current, target = structuredClone(clip)
    const errors = validateTransitionRange(base, target)
    if (errors.length || !transitionCaptureIsCurrent(base, target)) { setMessage(errors[0] ?? 'Vernieuw eerst de begin- en eindbeelden.'); return }
    const capture = structuredClone(target.transition!)
    const start = base.assets.find(a => a.id === capture.startFrameAssetId)!
    const end = base.assets.find(a => a.id === capture.endFrameAssetId)!
    const snapshot: TimelineGeneration = { prompt: '', modelId: RIFE_MODEL, provider: 'fal', resolution: 'original', aspectRatio: 'original',
      requestedDuration: target.duration / base.fps, generateAudio: false, referenceAssetId: start.id, endImageAssetId: end.id,
      extraParams: { num_frames: target.duration - 1, fps: base.fps } }
    const requestId = uid()
    setGenerating(target.id); setMessage(''); setPlaying(false)
    apply({ ...base, jobs: [...base.jobs ?? [], { id: requestId, clipId: target.id, createdAt: new Date().toISOString(), generation: snapshot, kind: 'generate', status: 'running' }] }, false)
    let submitted = false
    try {
      await persist()
      const session = await supabase?.auth.getSession()
      const token = session?.data.session?.access_token
      if (!token) throw new Error('Log eerst in om te genereren.')
      submitted = true
      const result = await api().generateAtelierVideo('', RIFE_MODEL, undefined, token, start.src,
        { resolution: 'original', aspectRatio: 'original', generateAudio: false, extraParams: snapshot.extraParams }, 'fal', undefined, requestId, end.src)
      if (!result.ok) {
        if (result.definitiveFailure || result.cancelled) submitted = false
        throw new Error(result.error ?? 'De overgang is nog niet afgerond; controleer de bestaande opdracht.')
      }
      const imported = await api().timeline.importMedia({ projectId: base.id, kind: 'video', sources: [{ src: result.filePath, name: 'RIFE-overgang.mp4' }] })
      if (!imported.ok || !imported.assets?.[0]) throw new Error(imported.error ?? 'De overgang is gemaakt maar kon nog niet in het project worden opgeslagen.')
      const asset: TimelineAsset = imported.assets[0]
      const variant: TimelineVariant = { id: uid(), assetId: asset.id, createdAt: new Date().toISOString(), inPoint: 0, generation: snapshot, transition: capture, requestId }
      apply({ ...current.current, assets: [...current.current.assets, asset],
        clips: current.current.clips.map(c => c.id === target.id ? { ...c, variants: [...c.variants, variant] } : c),
        jobs: current.current.jobs?.map(j => j.id === requestId ? { ...j, status: 'completed', assetId: asset.id } : j) }, false)
      await persist(); setSelected(target.id); setTab('variants')
      setMessage('De overgang staat als nieuwe variant klaar. Kies ‘Gebruik deze variant’ om hem in je film te zien.')
    } catch (e: any) {
      apply({ ...current.current, jobs: current.current.jobs?.map(j => j.id === requestId ? { ...j, status: submitted ? 'unknown' : 'failed', error: e.message } : j) }, false)
      await persist().catch(() => {})
      setMessage(e.message)
    } finally { setGenerating(undefined) }
  }

  function changedClip(base: TimelineProject, id: string, patch: Partial<TimelineClip>) {
    const old = base.clips.find(c => c.id === id)!
    const replacement = { ...old, ...patch }
    const delta = replacement.start + replacement.duration - old.start - old.duration
    return { ...base, clips: base.clips.map(c => c.id === id ? replacement : ripple && clipTrackId(replacement) === clipTrackId(old) && clipTrackId(c) === clipTrackId(old) && c.start >= old.start + old.duration ? { ...c, start: Math.max(0, c.start + delta) } : c) }
  }

  function patchClip(patch: Partial<TimelineClip>) { if (clip) { setPlaying(false); apply(changedClip(current.current, clip.id, patch)) } }
  function patchGeneration(patch: Partial<TimelineGeneration>) {
    if (!clip) return
    patchClip({ generation: { ...defaultGeneration(clip), ...clip.generation, ...patch } })
  }

  function chooseVariant(id: string) {
    if (!clip) return
    const variant = clip.variants.find(v => v.id === id)!
    if (variant.transition && !transitionVariantIsCurrent(project, clip, variant)) { setMessage('Deze overgang hoort bij eerdere beelden of een eerdere plaatsing. Vernieuw de bronbeelden en genereer een nieuwe variant.'); return }
    const asset = project.assets.find(a => a.id === variant.assetId)!
    const outputProblem = variant.transition ? transitionOutputProblem(project, clip, variant) : undefined
    if (outputProblem) { setMessage(outputProblem); return }
    if (asset.kind !== 'image' && variant.inPoint + sourceSeconds(clip, clip.duration, project.fps) > asset.duration + 0.00001) {
      setMessage(`Deze variant heeft ${seconds(asset.duration - variant.inPoint)} s beschikbaar. Maak het blok eerst korter.`); return
    }
    patchClip({ activeVariantId: id }); setMessage(''); setPosition(clip.start / project.fps)
  }

  function pointerDown(e: PointerEvent<HTMLElement>, c: TimelineClip, mode: 'move' | 'left' | 'right') {
    if (busy || generating === c.id) return
    e.stopPropagation(); e.preventDefault(); setPlaying(false)
    e.currentTarget.closest<HTMLElement>('[data-clip-id]')?.focus({ preventScroll: true })
    setSelectedTrack(clipTrackId(c))
    if (e.shiftKey || e.metaKey || e.ctrlKey) {
      const ids = selectedIds.includes(c.id) ? selectedIds.filter(id => id !== c.id) : [...selectedIds, c.id]
      setGroup(ids); setSelected(ids.includes(c.id) ? c.id : ids[ids.length - 1])
      return
    }
    const inGroup = mode === 'move' && selectedIds.length > 1 && selectedIds.includes(c.id)
    if (!inGroup) setGroup([])
    setSelected(c.id); setPosition(c.start / project.fps)
    if (trackIsLocked(current.current, c)) { setMessage('Dit spoor is vergrendeld. Ontgrendel het om dit fragment te bewerken.'); return }
    const ids = inGroup ? selectedIds.filter(id => !trackIsLocked(current.current, current.current.clips.find(x => x.id === id)!)) : [c.id]
    root.current?.setPointerCapture(e.pointerId)
    drag.current = { project: current.current, clip: c, x: e.clientX, mode, group: ids, targets: snapTargets(current.current, new Set(ids), frameNow()) }
  }
  function pointerMove(e: PointerEvent<HTMLElement>) {
    const d = drag.current
    if (!d) return
    const fps = project.fps
    const threshold = e.altKey ? 0 : 8 / zoom * fps
    const delta = Math.round((e.clientX - d.x) / zoom * fps)
    let patch: Partial<TimelineClip>
    if (d.mode === 'move' && d.group.length > 1) {
      const moved = d.project.clips.filter(c => d.group.includes(c.id))
      const minStart = Math.min(...moved.map(c => c.start)), maxEnd = Math.max(...moved.map(c => c.start + c.duration))
      let shift = Math.max(-minStart, delta)
      if (threshold) shift = Math.max(-minStart, shift + snapSpan(d.targets, minStart + shift, maxEnd + shift, threshold))
      if (moved.some(c => d.project.clips.some(o => !d.group.includes(o.id) && clipTrackId(o) === clipTrackId(c) && o.start < c.start + shift + c.duration && o.start + o.duration > c.start + shift))) return
      apply(mergeGesture(current.current, { ...d.project, clips: d.project.clips.map(c => d.group.includes(c.id) ? { ...c, start: c.start + shift } : c) }), false)
      setPosition((d.clip.start + shift) / fps)
      return
    }
    if (d.mode === 'move') {
      const lane = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('[data-track-id]')
      const targetTrack = timelineTracks(d.project).find(t => t.id === lane?.dataset.trackId && t.kind === d.clip.track && !t.locked)
      let start = Math.max(0, d.clip.start + delta)
      if (threshold) start = Math.max(0, start + snapSpan(d.targets, start, start + d.clip.duration, threshold))
      patch = { start, trackId: targetTrack?.id ?? clipTrackId(d.clip) }
      if (patch.trackId !== clipTrackId(d.clip) && d.project.clips.some(c => clipTrackId(c) === patch.trackId && c.id !== d.clip.id && c.start < patch.start! + d.clip.duration && c.start + c.duration > patch.start!)) return
    }
    else if (d.mode === 'right') {
      const end = d.clip.start + d.clip.duration + delta
      const snapped = threshold ? nearestSnap(d.targets, end, threshold) : undefined
      patch = { duration: Math.max(1, (snapped ?? end) - d.clip.start) }
    }
    else {
      const active = activeMedia(d.project, d.clip)
      const variant = active.variant?.transition || active.asset?.kind === 'image' ? undefined : active.variant
      const snappedStart = threshold ? nearestSnap(d.targets, d.clip.start + delta, threshold) : undefined
      const wanted = snappedStart === undefined ? delta : snappedStart - d.clip.start
      const bounded = Math.min(d.clip.duration - 1, Math.max(-d.clip.start, variant ? -Math.floor(variant.inPoint * fps) : -d.clip.start, wanted))
      patch = { start: d.clip.start + bounded, duration: d.clip.duration - bounded, variants: d.clip.variants.map(v => v.id === variant?.id ? { ...v, inPoint: Math.max(0, v.inPoint + sourceSeconds(d.clip, bounded, fps)) } : v), ...(bounded > 0 ? { fadeIn: undefined, crossfade: undefined } : {}) }
    }
    apply(mergeGesture(current.current, changedClip(d.project, d.clip.id, patch)), false)
    if (patch.start !== undefined) setPosition(patch.start / fps)
    if (patch.trackId) setSelectedTrack(patch.trackId)
  }
  function pointerUp() {
    if (!drag.current) return
    history.current.undo.push(editSnapshot(drag.current.project)); history.current.redo = []
    drag.current = undefined; bumpHistory(v => v + 1)
  }

  const loadModels = useCallback(() => {
    // Activation, settings changes and React StrictMode can request the same list.
    if (modelRequest.current) return modelRequest.current
    setCapLoading(true); setCapError('')
    const request = (async () => {
      try {
        const session = await supabase?.auth.getSession()
        const result = await api().getVideoCapabilities(session?.data.session?.access_token)
        if (!result.ok) throw new Error(result.error || 'Videomodellen laden mislukt.')
        if (!mounted.current) return
        const configured = loadModuleModels('video')
        setRifeCapability((result.models ?? []).find((c: AtelierVideoCapability) => c.model_id === RIFE_MODEL && c.tool === 'rife_transition'))
        setEditCapabilities((result.models ?? []).filter((c: AtelierVideoCapability) => TIMELINE_EDIT_TOOLS.some(t => t.model === c.model_id)))
        const caps: AtelierVideoCapability[] = (result.models ?? []).filter((c: AtelierVideoCapability) => c.model_id !== RIFE_MODEL && c.output_duration_source !== 'source_video' && c.pricing_model !== 'flat_per_video' && c.supported_durations?.length && (!configured.length || configured.some(m => m.model === c.model_id || m.id === c.model_id)))
        setCapabilities(caps)
        if (!caps.length) setCapError('Geen geschikte videomodellen gevonden. Controleer je modellen in Atelier of probeer opnieuw.')
      } catch (e: any) {
        if (mounted.current) setCapError(e.message || 'Videomodellen laden mislukt. Probeer het opnieuw.')
      } finally {
        modelRequest.current = null
        if (mounted.current) setCapLoading(false)
      }
    })()
    modelRequest.current = request
    return request
  }, [])

  useEffect(() => {
    if (!active) return
    void loadModels()
    const refresh = (event: Event) => {
      if ((event as CustomEvent<{ type?: string }>).detail?.type === 'video') void loadModels()
    }
    window.addEventListener('huphe:atelier-module-models-changed', refresh)
    return () => window.removeEventListener('huphe:atelier-module-models-changed', refresh)
  }, [active, loadModels])

  function chooseModel(id: string) {
    if (!clip || clip.track !== 'video' || busy || generating) return
    if (id === RIFE_MODEL) {
      const previousCapture = clip.transition ?? [...clip.variants].reverse().find(v => v.transition)?.transition
      const nextClip: TimelineClip = { ...clip, transition: previousCapture ?? { kind: 'rife' } }
      const next = { ...current.current, clips: current.current.clips.map(c => c.id === clip.id ? nextClip : c) }
      apply(next); setPlaying(false); setMessage('')
      // Selecting a model keeps the block, its source variants and earlier model settings intact.
      // Captures are local; the paid job still requires the explicit Generate button.
      if (!validateTransitionRange(next, nextClip).length && !transitionCaptureIsCurrent(next, nextClip)) void captureTransition(clip.id)
      return
    }
    const c = capabilities.find(c => c.model_id === id)
    if (!c) return
    const durations = generationDurations(c)
    if (!durations.length) return
    const previousDuration = typeof generation?.requestedDuration === 'number' ? generation.requestedDuration : clip.duration / project.fps
    const requestedDuration = generation?.requestedDuration === 'auto' && c.supports_auto_duration ? 'auto' : durations.find(value => value >= previousDuration) ?? durations[durations.length - 1]
    const configured = loadModuleModels('video').find(m => m.model === id || m.id === id)
    patchClip({ transition: undefined, generation: { ...defaultGeneration(clip), ...generation, modelId: id, requestedDuration, generateAudio: generation?.generateAudio ?? false, provider: (configured?.provider ?? c.provider ?? (id.startsWith('fal-ai/') ? 'fal' : 'openrouter')) as 'fal' | 'openrouter', resolution: c.supported_resolutions[0] ?? '720p', aspectRatio: c.supported_aspect_ratios.includes('16:9') ? '16:9' : c.supported_aspect_ratios[0] ?? '16:9' } })
    setMessage('')
  }

  async function generate(finalize?: TimelineVariant) {
    if (!clip || generating || busy || unknownJobs.length) return
    const resolved = generation && capability ? timelineGenerationState(generation, capability, project.assets) : undefined
    if (!finalize && (!resolved || resolved.errors.length || !resolved?.promptReady)) { setMessage(resolved?.errors[0] ?? 'Kies een model en vul een prompt in.'); return }
    if (finalize && (!finalize.draftId || !finalize.draftDuration || !finalize.generation)) return
    const snapshot: TimelineGeneration = structuredClone(finalize
      ? { ...finalize.generation!, requestedDuration: finalize.draftDuration!, resolution: '1080p', draft: false }
      : resolved!.snapshot)
    const id = clip.id, projectId = project.id, requestId = uid()
    setGenerating(id); setMessage(''); setPlaying(false)
    const job = { id: requestId, clipId: id, createdAt: new Date().toISOString(), generation: snapshot, kind: finalize ? 'finalize' as const : 'generate' as const, sourceVariantId: finalize?.id, status: 'running' as const }
    apply({ ...current.current, jobs: [...current.current.jobs ?? [], job] }, false)
    let submitted = false
    try {
      await persist()
      const session = await supabase?.auth.getSession()
      const token = session?.data.session?.access_token
      if (!token) throw new Error('Log eerst in om te genereren.')
      let references: { imageUrls: string[]; videoUrls: string[]; audioUrls: string[]; task?: string } | undefined
      if (!finalize && snapshot.referenceAssetIds?.length) {
        const uploaded = await api().timeline.prepareReferences({ projectId, assetIds: snapshot.referenceAssetIds, modelId: snapshot.modelId, task: snapshot.task, accessToken: token })
        if (!uploaded.ok) throw new Error(uploaded.error ?? 'Referenties voorbereiden mislukt.')
        references = { ...uploaded.references, task: snapshot.task }
      }
      submitted = true
      const result = finalize
        ? await api().renderVideoDraftFinal(snapshot.modelId, finalize.draftId, finalize.draftDuration, snapshot.codec, token, requestId)
        : await api().generateAtelierVideo(snapshot.prompt, snapshot.modelId, undefined, token, resolved!.start?.src, {
          duration: snapshot.requestedDuration, resolution: snapshot.resolution, aspectRatio: snapshot.aspectRatio,
          extraParams: snapshot.extraParams, generateAudio: snapshot.generateAudio, draft: snapshot.draft, seed: snapshot.seed, bitrateMode: snapshot.bitrateMode, codec: snapshot.codec,
        }, snapshot.provider, references, requestId, resolved!.end?.src)
      if (!result.ok) throw new Error(result.error ?? 'Generatie niet afgerond; controleer de bestaande opdracht.')
      const imported = await api().timeline.importMedia({ projectId, kind: 'video', sources: [{ src: result.filePath, name: `${clip.label} · ${snapshot.modelId.split('/').pop()}${finalize ? ' · 1080p' : result.draftId ? ' · draft' : ''}.mp4` }] })
      if (!imported.ok || !imported.assets?.[0]) throw new Error(imported.error ?? 'De video is gemaakt maar kon nog niet in het project worden opgeslagen.')
      const asset: TimelineAsset = imported.assets[0]
      const variant: TimelineVariant = { id: uid(), assetId: asset.id, createdAt: new Date().toISOString(), inPoint: finalize?.inPoint ?? 0, generation: snapshot, requestId,
        draftId: result.draftId ?? undefined, draftDuration: result.draftId && Number.isFinite(result.resolvedDuration) ? result.resolvedDuration : undefined,
        finalizedFromVariantId: finalize?.id }
      apply({ ...current.current, assets: [...current.current.assets, asset], clips: current.current.clips.map(c => c.id === id ? { ...c, variants: [...c.variants, variant] } : c), jobs: current.current.jobs?.map(j => j.id === requestId ? { ...j, status: 'completed', assetId: asset.id } : j) }, false)
      await persist(); setSelected(id); setTab('variants'); setMessage(finalize ? 'De 1080p-versie staat als nieuwe variant klaar. Je draft blijft bewaard.' : 'De nieuwe variant staat klaar. Kies ‘Gebruik’ om hem op de tijdlijn te zetten.')
    } catch (e: any) {
      apply({ ...current.current, jobs: current.current.jobs?.map(j => j.id === requestId ? { ...j, status: submitted ? 'unknown' : 'failed', error: e.message } : j) }, false)
      await persist().catch(() => {})
      setMessage(e.message)
    } finally { setGenerating(undefined) }
  }

  function attachReference(base: TimelineProject, targetId: string, assetIds: string[], extend = false): TimelineProject {
    const target = base.clips.find(c => c.id === targetId)
    if (!target) throw new Error('Het geselecteerde blok bestaat niet meer.')
    const settings = { ...defaultGeneration(target), ...target.generation }
    const added = { ...settings, referenceAssetIds: [...new Set([...(settings.referenceAssetIds ?? []), ...assetIds])], ...(extend ? { task: 'extension' as const } : {}) }
    const model = capabilities.find(c => c.model_id === added.modelId)
    const errors = timelineGenerationState(added, model, base.assets).errors.filter(error => /ontbreekt in dit project/.test(error))
    if (errors.length) throw new Error(errors[0])
    return { ...base, clips: base.clips.map(c => c.id === targetId ? { ...c, generation: added } : c) }
  }

  function useReference(assetId: string, extend = false) {
    if (!clip || !assetId || busy) return
    try { apply(attachReference(current.current, clip.id, [assetId], extend)); setMessage('') }
    catch (e: any) { setMessage(e.message) }
  }

  async function runEdit() {
    if (!clip || generating || busy || unknownJobs.length) return
    const tool = TIMELINE_EDIT_TOOLS.find(t => t.id === editState.tool) ?? TIMELINE_EDIT_TOOLS[0]
    const cap = editCapabilities.find(c => c.model_id === tool.model)
    const source = activeMedia(current.current, clip).asset
    const image = tool.image ? current.current.assets.find(a => a.id === editState.imageAssetId) : undefined
    if (!cap) { setMessage('Dit model is nog niet beschikbaar op de server.'); return }
    if (source?.kind !== 'video') { setMessage('Kies eerst een fragment met een video als actieve variant.'); return }
    if (tool.prompt === 'required' && !editState.prompt.trim()) { setMessage('Vul een prompt in.'); return }
    if (tool.image && !image) { setMessage('Kies eerst een karakterafbeelding.'); return }
    const defaults = Object.fromEntries(Object.entries(cap.extra_fields ?? {}).filter(([, f]: [string, any]) => f?.default !== undefined).map(([k, f]: [string, any]) => [k, f.default]))
    if (tool.id === 'background' && editState.extraParams.output_container_and_codec === undefined) defaults.output_container_and_codec = 'mov_proresks'
    const extraParams = { ...defaults, ...editState.extraParams }
    const id = clip.id, projectId = current.current.id, requestId = uid(), label = clip.label
    const inPoint = clip.variants.find(v => v.id === clip.activeVariantId)?.inPoint ?? 0
    const snapshot: TimelineGeneration = { prompt: editState.prompt.trim(), modelId: tool.model, provider: 'fal', resolution: 'original', aspectRatio: 'original',
      requestedDuration: source.duration ?? clip.duration / current.current.fps, generateAudio: false, referenceAssetIds: image ? [image.id] : undefined, extraParams }
    setGenerating(id); setMessage(''); setPlaying(false)
    apply({ ...current.current, jobs: [...current.current.jobs ?? [], { id: requestId, clipId: id, createdAt: new Date().toISOString(), generation: snapshot, kind: 'generate' as const, status: 'running' as const }] }, false)
    let submitted = false
    try {
      await persist()
      const session = await supabase?.auth.getSession()
      const token = session?.data.session?.access_token
      if (!token) throw new Error('Log eerst in om te bewerken.')
      const uploaded = await api().timeline.prepareReferences({ projectId, assetIds: [source.id, ...(image ? [image.id] : [])], edit: true, accessToken: token })
      if (!uploaded.ok) throw new Error(uploaded.error ?? 'Bronbestanden voorbereiden mislukt.')
      submitted = true
      const result = await api().generateAtelierVideo(snapshot.prompt, tool.model, undefined, token, undefined, {
        resolution: 'original', aspectRatio: 'original', generateAudio: false, extraParams,
        sourceDurationSeconds: source.duration, sourceWidth: source.width, sourceHeight: source.height,
      }, 'fal', uploaded.references, requestId)
      if (!result.ok) {
        if (result.definitiveFailure || result.cancelled) submitted = false
        throw new Error(result.error ?? 'Bewerking niet afgerond; controleer de bestaande opdracht.')
      }
      const imported = await api().timeline.importMedia({ projectId, kind: 'video', sources: [{ src: result.filePath, name: `${label} · ${tool.label}` }] })
      if (!imported.ok || !imported.assets?.[0]) throw new Error(imported.error ?? 'De video is gemaakt maar kon nog niet in het project worden opgeslagen.')
      const asset: TimelineAsset = imported.assets[0]
      const variant: TimelineVariant = { id: uid(), assetId: asset.id, createdAt: new Date().toISOString(), inPoint, generation: snapshot, requestId }
      apply({ ...current.current, assets: [...current.current.assets, asset], clips: current.current.clips.map(c => c.id === id ? { ...c, variants: [...c.variants, variant] } : c), jobs: current.current.jobs?.map(j => j.id === requestId ? { ...j, status: 'completed', assetId: asset.id } : j) }, false)
      await persist(); setSelected(id); setTab('variants'); setMessage('Het resultaat staat als nieuwe variant klaar. Kies ‘Gebruik deze variant’ om hem op de tijdlijn te zetten.')
    } catch (e: any) {
      apply({ ...current.current, jobs: current.current.jobs?.map(j => j.id === requestId ? { ...j, status: submitted ? 'unknown' : 'failed', error: e.message } : j) }, false)
      await persist().catch(() => {})
      setMessage(e.message)
    } finally { setGenerating(undefined) }
  }

  async function importEditImage() {
    await action('Afbeelding toevoegen…', async () => {
      await persist()
      const result = await api().timeline.importMedia({ projectId: current.current.id, kind: 'image' })
      if (result.canceled) return
      if (!result.ok) throw new Error(result.error)
      const assets: TimelineAsset[] = result.assets ?? []
      if (!assets.length) return
      apply({ ...current.current, assets: [...current.current.assets, ...assets] }, false)
      setEditState(s => ({ ...s, imageAssetId: assets[0].id }))
    })
  }

  async function importGenerationReference(kind: TimelineAsset['kind'], target: TimelineReferenceTarget) {
    if (!clip) return
    const targetId = clip.id
    await action('Referentie toevoegen…', async () => {
      setPlaying(false)
      await persist()
      const result = await api().timeline.importMedia({ projectId: current.current.id, kind })
      if (result.canceled) return
      if (!result.ok) throw new Error(result.error)
      const assets: TimelineAsset[] = result.assets ?? []
      if (!assets.length) return
      const base = { ...current.current, assets: [...current.current.assets, ...assets] }
      // Keep imported media available even if a model's reference limit is exceeded.
      apply(base, false)
      if (target === 'reference') apply(attachReference(base, targetId, assets.map(a => a.id)))
      else apply({ ...base, clips: base.clips.map(c => c.id === targetId ? { ...c, generation: { ...defaultGeneration(c), ...c.generation, [target === 'start' ? 'referenceAssetId' : 'endImageAssetId']: assets[0].id } } : c) })
    })
  }

  async function addVariantAudio(variant: TimelineVariant) {
    if (!clip) return
    const target = structuredClone(clip)
    await action('Geluid toevoegen…', async () => {
      setPlaying(false)
      await persist()
      const result = await api().timeline.extractAudio({ projectId: current.current.id, assetId: variant.assetId })
      if (!result.ok || !result.asset) throw new Error(result.error ?? 'Geluid overnemen mislukt.')
      const asset: TimelineAsset = result.asset
      const base = { ...current.current, assets: [...current.current.assets, asset] }
      apply(base, false)
      if (variant.inPoint + sourceSeconds(target, target.duration, project.fps) > asset.duration + 0.00001) throw new Error('Het geluid is korter dan het blok. Pas eerst de uitsnede aan; de audio staat in Projectmedia.')
      const existing = timelineTracks(base).filter(t => t.kind === 'audio').find(t => !base.clips.some(c => clipTrackId(c) === t.id && c.start < target.start + target.duration && c.start + c.duration > target.start))
      if (!existing && timelineTracks(base).length >= 32) throw new Error('Het project heeft al 32 sporen. Maak ruimte op een audiospoor; het geluid staat in Projectmedia.')
      const track = existing ?? newTrack(base, 'audio')
      const audioVariant = { id: uid(), assetId: asset.id, createdAt: new Date().toISOString(), inPoint: variant.inPoint }
      const audioClip: TimelineClip = { id: uid(), track: 'audio', trackId: track.id, label: `${target.label} · geluid`, start: target.start, duration: target.duration, variants: [audioVariant], activeVariantId: audioVariant.id }
      apply({ ...base, tracks: existing ? base.tracks : [...timelineTracks(base), track], clips: [...base.clips, audioClip] })
      setMessage('Het geluid staat met dezelfde uitsnede op het audiospoor.')
    })
  }

  const modelLabel = (id: string) => loadModuleModels('video').find(m => m.model === id || m.id === id)?.label ?? id
  const libraryItems = library ? loadAtelierMediaProjects().flatMap(p => p.type === 'video' || p.type === 'audio' ? (p.assets?.length ? p.assets.map(a => ({ src: a.src, name: p.title, kind: (a.assetKind ?? p.type) as 'video' | 'audio' })) : [{ src: p.src, name: p.title, kind: p.type as 'video' | 'audio' }]) : []).filter(a => /^(huphe:|file:|\/)/.test(a.src)) : []

  return <div ref={root} className={`vt${assetDragging ? ' vt-asset-dragging' : ''}`} data-testid="video-timeline" tabIndex={-1} onKeyDown={handleKeyDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp} onLostPointerCapture={pointerUp}>
    <TimelineTooltip root={root} />
    <header className="vt-header">
      <div className="vt-title"><span>VIDEOMONTAGE</span><input aria-label="Projectnaam" value={project.name} onChange={e => apply({ ...project, name: e.target.value }, false)} /></div>
      <small className="vt-save">{saveState}</small>
      <select aria-label="Project openen" value="" disabled={!!generating || !!busy} onFocus={() => api().timeline.list().then((r: any) => { if (r.ok) setProjects(r.projects) })} onChange={e => { const id = e.target.value; void action('Project openen…', async () => { await persist(); const found = projects.find(p => p.id === id); if (found) openProject(found) }) }}><option value="">Project openen…</option>{projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
      <button className="vt-icon" aria-label="Nieuw project" title="Nieuw project" disabled={!!generating || !!busy} onClick={() => void action('Nieuw project…', async () => { await persist(); openProject(newTimelineProject()); await persist() })}><Icon name="newFile" /></button>
      <button className="vt-icon" aria-label="Opslaan" title="Opslaan (gebeurt ook automatisch)" onClick={() => void action('Opslaan…', async () => { await persist() })} disabled={!!busy}><Icon name="save" /></button>
      <span className="vt-export-wrap"><button className={`vt-icon${exportOpen ? ' on' : ''}`} aria-label="Exportinstellingen" aria-expanded={exportOpen} title="Exportinstellingen" onClick={() => setExportOpen(!exportOpen)}><Icon name="sliders" /></button>
        {exportOpen && <div className="vt-export-menu" role="dialog" aria-label="Exportinstellingen">
          <label>Kwaliteit<select aria-label="Exportkwaliteit" value={exportSettings.quality} onChange={e => { const next = { ...exportSettings, quality: e.target.value as 'draft' | 'standard' | 'high' }; setExportSettings(next); try { localStorage.setItem('vt-export', JSON.stringify(next)) } catch { /* optional */ } }}>
            <option value="draft">Concept (klein bestand)</option><option value="standard">Standaard</option><option value="high">Hoog (groot bestand)</option></select></label>
          <label>Formaat<select aria-label="Exportformaat" value={exportSettings.outputHeight ?? 0} onChange={e => { const next = { ...exportSettings, outputHeight: Number(e.target.value) || undefined }; setExportSettings(next); try { localStorage.setItem('vt-export', JSON.stringify(next)) } catch { /* optional */ } }}>
            <option value={0}>Projectformaat ({project.width}×{project.height})</option><option value={720}>720p</option><option value={1080}>1080p</option><option value={2160}>4K (2160p)</option></select></label>
          <p className="vt-help">MP4 · H.264 · AAC · {project.fps} fps. Een groter formaat dan het project rekent op, het wordt niet scherper.</p>
          {encoder && <p className="vt-help">Encoder: {encoder === 'libx264' ? 'x264 (hoogste kwaliteit)' : encoder === 'h264_videotoolbox' ? 'macOS-videochip (snel, iets minder compact)' : 'basis-MPEG-4 (geen H.264 beschikbaar)'}.</p>}
        </div>}</span>
      <button className="vt-primary vt-icon" aria-label="Film exporteren" title={problems.length ? `Export niet mogelijk: ${problems[0]}` : 'Film exporteren'} disabled={!!busy || !!problems.length || !toolsAvailable} onClick={() => void action('Film exporteren…', async () => { setPlaying(false); await persist(); const r = await api().timeline.export(structuredClone(current.current), exportSettings); if (!r.ok && !r.canceled) throw new Error(r.error); if (r.ok) setMessage(`Film geëxporteerd: ${r.path}`) })}>{busy === 'Film exporteren…' ? '…' : <Icon name="export" />}</button>
    </header>
    {(message || busy || !toolsAvailable) && <div className="vt-message" role="status">{busy || message || 'FFmpeg en FFprobe zijn nodig voor import en export. Installeer de lokale videotools.'}<button aria-label="Melding sluiten" onClick={() => setMessage('')}><Icon name="close" size={12} /></button></div>}
    {unknownJobs.length > 0 && <div className="vt-message vt-warning" role="alert"><span>Een eerdere generatie heeft een onbekende uitkomst (de app werd gesloten of de verbinding viel weg). Controleer in Atelier of de generatie is gelukt voordat je opnieuw genereert; anders betaal je mogelijk twee keer. Je montage en invoer zijn bewaard.</span>
      {unknownJobs.map(job => <button key={job.id} className="vt-job-resolve" title="Ik heb dit gecontroleerd; nieuwe generaties weer toestaan" disabled={!!generating} onClick={() => apply({ ...current.current, jobs: current.current.jobs?.map(j => j.id === job.id ? { ...j, status: 'failed' as const, error: 'Handmatig afgehandeld na onbekende uitkomst.' } : j) }, false)}>{project.clips.find(c => c.id === job.clipId)?.label ?? 'Fragment'} · {new Date(job.createdAt).toLocaleString('nl-NL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} · afgehandeld</button>)}</div>}
    <div className="vt-workspace">
      <aside className="vt-library"><h2>Projectmedia <span>{project.assets.length}</span></h2>
        <div className="vt-imports">{([['video', 'videoAdd', 'Video toevoegen'], ['audio', 'audioAdd', 'Audio toevoegen'], ['image', 'imageAdd', 'Afbeelding toevoegen']] as const).map(([kind, icon, label]) => <button key={kind} className="vt-icon" aria-label={label} title={label} disabled={!!busy} onClick={() => void importMedia(kind)}><Icon name={icon} /></button>)}<button className={`vt-icon${library ? ' on' : ''}`} aria-label="Uit Atelier kiezen" title="Uit Atelier kiezen" disabled={!!busy} onClick={() => setLibrary(!library)}><Icon name="library" /></button></div>
        {library && <div className="vt-library-choices"><h3>Bestaande generaties</h3>{libraryItems.length ? libraryItems.map((a, i) => <button key={i} onClick={() => void importMedia(a.kind, [{ src: a.src, name: a.name }])}>{a.kind === 'audio' ? '♫' : '▶'} {a.name}</button>) : <p>Geen lokale video’s of audio gevonden. Je kunt een bestand vanaf je computer toevoegen.</p>}</div>}
        <div className="vt-assets">{project.assets.map(a => <button className="vt-asset" key={a.id} data-asset-id={a.id} disabled={!!busy} draggable={!busy}
          title="Sleep naar een spoor of klik om achteraan te plaatsen" onDragStart={e => dragAsset(e, a)} onDragEnd={endAssetDrag}
          onClick={() => { if (!suppressAssetClick.current) { setPlaying(false); addAssets([a]) } }}>
          <div className={`vt-asset-art ${a.kind}`}>{a.kind === 'image' ? <img src={a.src} alt="" draggable={false} /> : a.kind === 'audio' ? '♫' : '▶'}{a.kind !== 'image' && <span>{seconds(a.duration)} s</span>}</div>
          <b>{a.name}</b><small>{a.width ? `${a.width} × ${a.height}` : 'Audio'} · sleep of klik</small></button>)}</div>
        {!project.assets.length && <p className="vt-help">Voeg je bestaande fragmenten toe. De volledige bron blijft bewaard wanneer je knipt.</p>}
      </aside>
      <main className="vt-viewer"><div className="vt-viewer-top"><span>{clip?.label ?? 'Je film'}</span><span>{project.width} × {project.height} · {project.fps} fps</span></div>
        <TimelinePreview project={previewProject} position={position} playing={active && playing} generating={!!generating && generating === clip?.id} onPosition={setPosition} onPlaying={setPlaying} onError={setMessage} />
        <div className="vt-transport"><span className="vt-time">{timeLabel(position)}</span><button className="vt-icon" aria-label="Naar begin" title="Naar begin (Home)" onClick={() => { setPlaying(false); setPosition(0) }}><Icon name="skipBack" /></button><button className="vt-play" aria-label={playing ? 'Pauzeren' : 'Afspelen'} title={playing ? 'Pauzeren (spatie)' : 'Afspelen (spatie)'} disabled={!duration} onClick={togglePlay}><Icon name={playing ? 'pause' : 'play'} size={18} /></button><span className="vt-time">{timeLabel(duration)}</span></div>
      </main>
      <aside className="vt-inspector"><div className="vt-tabs">{([['clip', 'clip', 'Fragment'], ['generate', 'sparkles', 'Genereren'], ['edit', 'wand', 'Bewerken'], ['variants', 'layers', 'Varianten']] as const).map(([t, icon, label]) => <button className={tab === t ? 'active' : ''} key={t} aria-label={label} title={label} onClick={() => setTab(t)}><Icon name={icon} size={17} />{t === 'variants' && clip ? <small>{clip.variants.length}</small> : null}</button>)}</div>
        {!clip ? <div className="vt-inspector-body"><h2>Jouw film begint hier</h2><p>Selecteer een fragment of maak een leeg blok voor een nieuwe scène.</p><button className="vt-primary" onClick={() => addEmpty()}>＋ Leeg videoblok</button><label>Richtduur (seconden)<input type="number" min="1" max="3600" value={project.targetDuration} onChange={e => apply({ ...project, targetDuration: Math.max(1, Math.min(3600, Number(e.target.value))) }, false)} /></label><label>Filmformaat<select value={`${project.width}x${project.height}`} onChange={e => { const [width, height] = e.target.value.split('x').map(Number); apply({ ...project, width, height }, false) }}><option value="1920x1080">Liggend · 1920 × 1080</option><option value="1080x1920">Staand · 1080 × 1920</option><option value="1080x1080">Vierkant · 1080 × 1080</option></select></label><p className="vt-help">De richtduur groeit mee met je montage. Video’s worden passend in beeld gezet; eventuele lege randen blijven zichtbaar.</p></div> : <div className="vt-inspector-body">
          {tab === 'clip' && <><h2>{clip.track === 'audio' ? 'Audiofragment' : 'Videofragment'}</h2><label>Naam<input value={clip.label} onChange={e => patchClip({ label: e.target.value })} /></label><div className="vt-field-row"><label>Start op tijdlijn (s)<input aria-label="Start fragment" type="number" min="0" step={1 / project.fps} value={seconds(clip.start / project.fps)} onChange={e => patchClip({ start: Math.max(0, Math.round(Number(e.target.value) * project.fps)) })} /></label><label>Lengte op tijdlijn (s)<input aria-label="Lengte fragment" type="number" min={1 / project.fps} step={1 / project.fps} value={seconds(clip.duration / project.fps)} onChange={e => patchClip({ duration: Math.max(1, Math.round(Number(e.target.value) * project.fps)) })} /></label></div>
          {!clip.transition && !media?.variant?.transition && media?.asset && media.asset.kind !== 'image' && <><label>Begin in bron (s)<input aria-label="Begin in bron" type="number" min="0" step={0.01} value={seconds(media.variant!.inPoint)} onChange={e => patchClip({ variants: clip.variants.map(v => v.id === clip.activeVariantId ? { ...v, inPoint: Math.max(0, Number(e.target.value)) } : v) })} /></label><p className="vt-help">Volledige bron: {seconds(media.asset.duration)} s. Alles buiten de uitsnede blijft bewaard.</p><button onClick={() => patchClip({ duration: Math.max(1, Math.floor(media.asset!.duration * project.fps)), variants: clip.variants.map(v => v.id === clip.activeVariantId ? { ...v, inPoint: 0 } : v) })}>Volledige bron gebruiken</button></>}
          {!media?.variant?.transition && <TimelineEffectsControls project={project} clip={clip} asset={media?.asset} inPoint={media?.variant?.inPoint ?? 0} disabled={!!busy || generating === clip.id} onChange={patchClip} />}
          <label>Spoor<select aria-label="Spoor fragment" value={clipTrackId(clip)} onChange={e => moveToTrack(e.target.value)}>{visibleTracks.filter(t => t.kind === clip.track).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
          {!clip.transition && !media?.variant?.transition && clip.track === 'video' && media?.asset && <div className="vt-layer-controls"><h3>Beeld op de film</h3>
            <p className="vt-help">Een hoger videospoor ligt bovenop de sporen eronder. Gebruik een PNG met transparantie voor een vrijstaand logo.</p>
            {([{ key: 'scale', label: 'Grootte', min: 5, max: 200, fallback: 1 }, { key: 'x', label: 'Horizontale positie', min: 0, max: 100, fallback: 0.5 }, { key: 'y', label: 'Verticale positie', min: 0, max: 100, fallback: 0.5 }] as const).map(field => <label key={field.key}>{field.label} · {Math.round((clip.transform?.[field.key] ?? field.fallback) * 100)}%<input type="range" aria-label={field.label} min={field.min} max={field.max} step="1" value={Math.round((clip.transform?.[field.key] ?? field.fallback) * 100)} onChange={e => patchClip({ transform: { scale: 1, x: 0.5, y: 0.5, ...clip.transform, [field.key]: Number(e.target.value) / 100 } })} /></label>)}
            <label>Dekking · {Math.round((clip.opacity ?? 1) * 100)}%<input type="range" aria-label="Dekking" min="0" max="100" value={Math.round((clip.opacity ?? 1) * 100)} onChange={e => patchClip({ opacity: Number(e.target.value) / 100 })} /></label>
          </div>}
          {clip.track === 'audio' && <label>Volume · {Math.round((clip.gain ?? 1) * 100)}%<input type="range" aria-label="Volume" min="0" max="200" step="1" value={Math.round((clip.gain ?? 1) * 100)} onChange={e => patchClip({ gain: Number(e.target.value) / 100 })} /></label>}
          {!clip.transition && <button disabled={!!busy} onClick={() => void importMedia(media?.asset?.kind ?? clip.track, undefined, true)}>Andere versie importeren</button>}<button className="vt-danger" disabled={!!busy || generating === clip.id} onClick={deleteSelectedClip} title="Blok verwijderen (Backspace)">Blok verwijderen</button></>}
          {tab === 'generate' && (clip.track === 'audio' ? <p>Voeg je bestaande ElevenLabs-audio toe via ‘Audio toevoegen’.</p> : <>
            <label>Model<select aria-label="Videomodel" aria-busy={capLoading} disabled={capLoading || !!busy || !!generating} value={clip.transition ? RIFE_MODEL : generation?.modelId ?? ''} onChange={e => chooseModel(e.target.value)}>
              <option value="">{capLoading ? 'Videomodellen laden…' : 'Kies een model'}</option>
              {capabilities.map(c => <option key={c.model_id} value={c.model_id}>{modelLabel(c.model_id)}</option>)}
              <option value={RIFE_MODEL}>RIFE</option>
            </select></label>
            {clip.transition ? <TimelineRifeControls project={project} clip={clip} capability={rifeCapability} loading={capLoading} busy={!!busy} generating={generating === clip.id} generationBlocked={!!generating || !!unknownJobs.length} onFramesChange={frames => patchClip({ duration: frames })} onCapture={() => void captureTransition(clip.id)} onGenerate={() => void generateTransition()} onReload={() => void loadModels()} /> : <>
            <h2>Genereer dit fragment</h2>
            <p className="vt-help">Gebruik je bestaande videomodellen. Iedere generatie wordt een nieuwe variant.</p>
            {capError && <><p role="alert">{capError}</p><button disabled={capLoading} onClick={() => void loadModels()}>Opnieuw proberen</button></>}
            <TimelineGenerationControls project={project} clip={clip} generation={generation ?? defaultGeneration(clip)} capability={capability} loading={capLoading} disabled={!!busy}
              onPatch={patchGeneration} onImport={(kind, target) => void importGenerationReference(kind, target)} onUseReference={useReference} onTrim={() => setTab('clip')} />
            <div className="vt-price">{estimate != null ? `Geschat: ${estimate.toLocaleString('nl-NL')} credits` : generationState?.errors[0] ?? (capability ? 'Prijsindicatie niet beschikbaar' : 'Kies een model voor een prijsindicatie')}<small>Via de bestaande rekeninginstellingen van je account.</small></div>
            <button className="vt-primary" disabled={!!generating || !!busy || !generationState?.promptReady || estimate == null || !!generationState?.errors.length || !!unknownJobs.length} onClick={() => void generate()}>{generating === clip.id ? 'Bezig met genereren…' : 'Genereer nieuwe variant'}</button>
            </>}
          </>)}
          {tab === 'edit' && (clip.track === 'audio' || clip.transition ? <p>Bewerken werkt op videofragmenten.</p> : <TimelineEditControls project={project} clip={clip} capabilities={editCapabilities} state={editState} loading={capLoading} disabled={!!busy || !!generating}
            onChange={patch => setEditState(s => ({ ...s, ...patch }))} onImportImage={() => void importEditImage()} />)}
          {tab === 'edit' && clip.track !== 'audio' && !clip.transition && <button className="vt-primary" disabled={!!busy || !!generating || !!unknownJobs.length} onClick={() => void runEdit()}>{generating === clip.id ? 'Bezig…' : 'Bewerking starten'}</button>}
          {tab === 'variants' && <><h2>Kies de actieve versie</h2>{clip.variants.length === 0 && <p>Genereer een fragment of importeer een bestaande video als variant.</p>}{clip.variants.map((v, i) => {
            const a = project.assets.find(x => x.id === v.assetId)
            const stale = !!v.transition && !transitionVariantIsCurrent(project, clip, v)
            const outputProblem = v.transition ? transitionOutputProblem(project, clip, v) : undefined
            const finalCost = v.draftDuration ? timelineFinalizeCredits(capabilities.find(c => c.model_id === v.generation?.modelId), v.draftDuration) : null
            return <div className={`vt-variant ${v.id === clip.activeVariantId ? 'active' : ''}`} key={v.id} data-variant-id={v.id}>
              {a?.kind === 'image' && <img src={a.src} alt={a.name} />}
              {a?.kind === 'video' && <video src={a.previewSrc ?? a.src} preload="metadata" controls />}
              <b>Variant {i + 1}{v.draftId ? ' · Draft' : v.finalizedFromVariantId ? ' · 1080p' : ''}</b>
              <small>{seconds(a?.duration ?? 0)} s · {v.generation?.modelId ?? 'Geïmporteerd'}</small>
              {stale && <small className="vt-warning">Deze overgang hoort bij eerdere bronbeelden of een eerdere plaatsing.</small>}
              {outputProblem && <small className="vt-warning">{outputProblem}</small>}
              <button disabled={v.id === clip.activeVariantId || !!busy || stale || !!outputProblem} onClick={() => chooseVariant(v.id)}>{v.id === clip.activeVariantId ? 'Actief op tijdlijn' : 'Gebruik deze variant'}</button>
              {v.draftId && <>{finalCost != null && <small>1080p-render geschat: {finalCost.toLocaleString('nl-NL')} credits</small>}<button disabled={!!generating || !!busy || !v.draftDuration || !v.generation || !!unknownJobs.length} onClick={() => void generate(v)}>Render naar 1080p</button>{!v.draftDuration && <small>De provider heeft geen draftduur teruggegeven; finaliseren is nog niet beschikbaar.</small>}</>}
              {!clip.transition && a?.kind === 'video' && <button disabled={!!busy} onClick={() => void addVariantAudio(v)}>Geluid op audiospoor</button>}
            </div>
          })}</>}

        </div>}
      </aside>
    </div>
    <section className="vt-timeline" style={{ height: Math.min(446, 112 + tracks.length * 67) }}><div className="vt-timeline-toolbar"><button className="vt-icon" aria-label="Leeg blok" title="Leeg blok toevoegen" disabled={!!busy} onClick={() => addEmpty()}><Icon name="emptyBlock" /></button>{(['video', 'audio'] as const).map(kind => <button key={kind} className={`vt-icon${dropPreview?.trackId === `new-${kind}` ? ' vt-track-drop-active' : ''}`}
        aria-label={kind === 'video' ? 'Videospoor toevoegen' : 'Audiospoor toevoegen'} disabled={!!busy || tracks.length >= 32} title={`${kind === 'video' ? 'Videospoor' : 'Audiospoor'} toevoegen — of sleep media hierheen voor een nieuw spoor bij de afspeelkop`}
        onClick={() => addTrack(kind)} onDragOver={e => assetDrop(e, kind)} onDragLeave={leaveAssetDrop} onDrop={e => assetDrop(e, kind, true)} data-new-track={kind}><Icon name={kind === 'video' ? 'trackVideo' : 'trackAudio'} /></button>)}<span className="vt-divider" />
        <button className="vt-icon" aria-label="Knippen" title="Knippen op de afspeelkop (S)" disabled={!!busy || !project.clips.length} onClick={() => splitAtPlayhead()}><Icon name="scissors" /></button>
        <button className="vt-icon" aria-label="Ongedaan maken" title="Ongedaan maken (⌘Z)" disabled={!!busy || !!generating || !history.current.undo.length} onClick={() => undo()}><Icon name="undo" /></button>
        <button className="vt-icon" aria-label="Opnieuw" title="Opnieuw (⇧⌘Z)" disabled={!!busy || !!generating || !history.current.redo.length} onClick={() => undo(true)}><Icon name="redo" /></button>
        <button className={`vt-icon vt-ripple${ripple ? ' on' : ''}`} aria-label="Volgende blokken meeschuiven" aria-pressed={ripple} title={ripple ? 'Volgende blokken schuiven mee: aan' : 'Volgende blokken schuiven mee: uit'} onClick={() => setRipple(!ripple)}><Icon name="ripple" /></button>
        <span className="vt-spacer" /><span className="vt-zoom" title="Zoom"><Icon name="zoom" size={14} /><input aria-label="Tijdlijnzoom" type="range" min="12" max="100" value={zoom} onChange={e => setZoom(Number(e.target.value))} /></span></div>
      <div className="vt-scroll"><div className="vt-tracks" style={{ width: Math.max(650, extent * zoom + 96) }}>
        <TimelineScrubber position={position} duration={duration} extent={extent} zoom={zoom} fps={project.fps} onSeek={next => { setPlaying(false); setPosition(next) }} />
        {visibleTracks.map(track => <div className={`vt-track ${track.kind}${trackDrag?.id === track.id ? ' dragging' : ''}${trackDrag?.over === track.id && trackDropOk(track.id) ? ' drop-target' : ''}`} key={`${project.id}:${track.id}`}>
          <div className={`vt-track-heading ${selectedTrack === track.id ? 'active' : ''}`} draggable={!busy && renaming !== track.id} title={track.kind === 'video' ? 'Sleep om dit videospoor te verplaatsen' : 'Sleep om dit audiospoor te verplaatsen'}
            onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('application/x-vt-track', track.id); window.setTimeout(() => setTrackDrag({ id: track.id }), 0) }} onDragEnd={() => setTrackDrag(undefined)}
            onDragOver={e => { if (!trackDrag) return; if (trackDropOk(track.id)) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (trackDrag.over !== track.id) setTrackDrag({ ...trackDrag, over: track.id }) } }}
            onDrop={e => { if (!trackDrag) return; e.preventDefault(); e.stopPropagation(); dropTrack(track.id) }}>
            <span className="vt-track-grip" aria-hidden="true"><Icon name="grip" size={12} /></span>
            {renaming === track.id ? <input className="vt-track-rename" autoFocus aria-label="Spoornaam" defaultValue={track.name} maxLength={60}
              onBlur={e => { const name = e.target.value.trim(); setRenaming(undefined); if (name && name !== track.name) patchTrack(track.id, { name }) }}
              onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') e.currentTarget.blur(); else if (e.key === 'Escape') { e.currentTarget.value = track.name; e.currentTarget.blur() } }} />
              : <button className="vt-track-label" title={`Selecteer ${track.name}`} onClick={() => { setSelectedTrack(track.id); setSelected(undefined); setGroup([]) }} onDoubleClick={() => setRenaming(track.id)}>{track.kind === 'video' ? '▣' : '♫'} {track.name}</button>}
            <button className="vt-track-delete" data-delete-track={track.id} aria-label={`${track.name} verwijderen`} disabled={!active || !!busy || trackIsGenerating(project, track.id)}
              title={trackIsGenerating(project, track.id) ? 'Wacht tot de generatie op dit spoor klaar is' : `${track.name} en de blokken verwijderen (ongedaan maken mogelijk)`}
              onClick={() => deleteTrack(track.id)}>
              <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M9 6V4h6v2M5 6l1 14h12l1-14M10 10v6M14 10v6" /></svg>
            </button>
            <div className="vt-track-tools">
              {track.kind === 'audio' && <><button className={track.muted ? 'on' : ''} aria-label="Dempen" aria-pressed={!!track.muted} title={track.muted ? 'Spoor weer laten horen' : 'Spoor dempen'} onClick={() => patchTrack(track.id, { muted: !track.muted })}><Icon name={track.muted ? 'volumeOff' : 'volume'} size={12} /></button>
                <button className={track.solo ? 'on' : ''} aria-label="Solo" aria-pressed={!!track.solo} title="Alleen dit spoor horen (solo)" onClick={() => patchTrack(track.id, { solo: !track.solo })}><Icon name="headphones" size={12} /></button></>}
              {track.kind === 'video' && <button className={track.hidden ? 'on' : ''} aria-label="Verbergen" aria-pressed={!!track.hidden} title={track.hidden ? 'Spoor weer tonen' : 'Spoor verbergen in preview en export'} onClick={() => patchTrack(track.id, { hidden: !track.hidden })}><Icon name={track.hidden ? 'eyeOff' : 'eye'} size={12} /></button>}
              <button className={track.locked ? 'on' : ''} aria-label="Vergrendelen" aria-pressed={!!track.locked} title={track.locked ? 'Spoor ontgrendelen' : 'Spoor vergrendelen'} onClick={() => patchTrack(track.id, { locked: !track.locked })}><Icon name={track.locked ? 'lock' : 'unlock'} size={12} /></button>
              <button aria-label="Omhoog" title="Spoor omhoog" onClick={() => shiftTrack(track.id, true)}><Icon name="up" size={12} /></button>
              <button aria-label="Omlaag" title="Spoor omlaag" onClick={() => shiftTrack(track.id, false)}><Icon name="down" size={12} /></button>
            </div>
          </div>
          <TimelineLane track={track.kind} trackId={track.id} clips={project.clips} fps={project.fps} zoom={zoom} disabled={!active || !!busy}
            onDrawStart={() => { setPlaying(false); setSelectedTrack(track.id); root.current?.focus({ preventScroll: true }) }} onCreate={range => addEmpty(range, track.id)} onDeselect={() => { setSelected(undefined); setSelectedTrack(track.id) }}
            onDragOver={e => assetDrop(e, track)} onDragLeave={leaveAssetDrop} onDrop={e => assetDrop(e, track, true)}>
            {project.clips.filter(c => clipTrackId(c) === track.id).map(c => { const a = activeMedia(project, c); return <div role="button" tabIndex={0} aria-label={`${c.label}, ${seconds(c.duration / project.fps)} seconden`} data-clip-id={c.id} data-transition-kind={c.transition?.kind} key={c.id} className={`vt-block ${c.transition ? 'vt-rife-block' : ''} ${selectedIds.includes(c.id) ? 'selected' : ''} ${trackIsLocked(project, c) ? 'locked' : ''} ${!a.asset ? 'empty' : ''}`} style={{ left: c.start / project.fps * zoom, width: Math.max(6, c.duration / project.fps * zoom) }} onClick={e => e.stopPropagation()} onKeyDown={e => { if (e.key === 'Enter') { setPlaying(false); setSelected(c.id); setSelectedTrack(track.id); setPosition(c.start / project.fps) } }} onPointerDown={e => pointerDown(e, c, 'move')}><TimelineBlockDecor project={project} clip={c} asset={a.asset} inPoint={a.variant?.inPoint ?? 0} width={c.duration / project.fps * zoom} /><div className="vt-handle left" aria-label="Begin trimmen" onPointerDown={e => pointerDown(e, c, 'left')} /><b>{generating === c.id ? '◌ ' : ''}{c.label}</b><span>{seconds(c.duration / project.fps)} s{c.variants.length > 1 ? ` · ${c.variants.length} varianten` : ''}</span><div className="vt-handle right" aria-label="Einde trimmen" onPointerDown={e => pointerDown(e, c, 'right')} /></div> })}
            {dropPreview?.trackId === track.id && <div className={`vt-drop-preview ${dropPreview.valid ? '' : 'invalid'}`} style={{ left: dropPreview.start / project.fps * zoom, width: Math.max(6, dropPreview.duration / project.fps * zoom) }}><b>{!dropPreview.valid ? 'Geen vrije ruimte' : dropPreview.insert ? 'Invoegen · volgende schuiven mee' : 'Hier plaatsen'}</b><span>{seconds(dropPreview.start / project.fps)} s · {seconds(dropPreview.duration / project.fps)} s</span></div>}
          </TimelineLane>
        </div>)}
      </div></div>
      <div className="vt-timeline-status">{problems.length && project.clips.length ? <span className="vt-warning">{problems[0]}{problems.length > 1 ? ` (+${problems.length - 1})` : ''}</span> : <span>{project.clips.length} fragmenten · {seconds(duration)} s · bronaudio van video’s uit</span>}<span>S knippen · spatie afspelen · ⌘C/⌘V/⌘D kopiëren, plakken, dupliceren · Shift-klik meerdere · Alt = niet magnetisch · ←/→ frame · ↑/↓ vorige/volgende knip</span></div>
    </section>
  </div>
}
