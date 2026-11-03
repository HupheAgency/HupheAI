import type { VideoExtraField } from '../../../shared/video-model-capabilities'

/** The same model-specific controls are used by Single and Timeline. */
export function VideoModelFields({ fields, values, onChange }: {
  fields?: Record<string, VideoExtraField> | null
  values: Record<string, unknown>
  onChange: (key: string, value: unknown) => void
}) {
  const card = 'space-y-2 rounded-xl border border-white/10 bg-black/20 p-3 text-xs text-white/70'
  const control = 'w-full rounded-lg border border-white/15 bg-black/30 p-2 text-white/85'
  return <div className="space-y-3">{Object.entries(fields ?? {}).map(([key, field]) => {
    const value = values[key] ?? field.default
    if (key === 'multi_prompt') {
      const shots = Array.isArray(value) ? value as { prompt: string; duration: string }[] : []
      const patch = (i: number, item: Partial<(typeof shots)[number]>) => onChange(key, shots.map((s, n) => n === i ? { ...s, ...item } : s))
      return <section className={card} key={key}><b>{field.label}</b><p>{field.description}</p>
        {shots.map((shot, i) => <div className="space-y-2 border-t border-white/10 pt-2" key={i}>
          <label>Shot {i + 1}<textarea className={control} aria-label={`Shot ${i + 1} prompt`} value={shot.prompt} maxLength={2500} onChange={e => patch(i, { prompt: e.target.value })} /></label>
          <label>Duur (seconden)<input className={control} aria-label={`Shot ${i + 1} duur`} type="number" min={1} max={15} step={1} value={shot.duration} onChange={e => patch(i, { duration: e.target.value })} /></label>
          <button type="button" onClick={() => onChange(key, shots.filter((_, n) => n !== i))}>Shot verwijderen</button>
        </div>)}
        <button type="button" disabled={shots.length >= 15} onClick={() => onChange(key, [...shots, { prompt: '', duration: '3' }])}>＋ Shot</button>
        {!!shots.length && <p>Totaal: {shots.reduce((n, s) => n + (Number(s.duration) || 0), 0)} s. Gebruik de shotprompts en laat de algemene prompt leeg.</p>}
      </section>
    }
    if (key === 'elements') {
      const items = Array.isArray(value) ? value as Record<string, any>[] : []
      const patch = (i: number, p: Record<string, unknown>) => onChange(key, items.map((e, n) => i === n ? { ...e, ...p } : e))
      return <section className={card} key={key}><b>{field.label}</b><p>{field.description}</p>
        {items.map((item, i) => <div className="space-y-2 border-t border-white/10 pt-2" key={i}>
          <b>@Element{i + 1}</b>
          <label>Referentietype<select className={control} value={item.video_url !== undefined ? 'video' : 'image'} onChange={e => onChange(key, items.map((old, n) => n === i ? e.target.value === 'video' ? { video_url: '', voice_id: old.voice_id } : { frontal_image_url: '', reference_image_urls: [], voice_id: old.voice_id } : old))}><option value="image">Afbeeldingen</option><option value="video">Video</option></select></label>
          {item.video_url !== undefined ? <label>Video-URL<input className={control} aria-label={`Element ${i + 1} video`} type="url" value={item.video_url} placeholder="https://…" onChange={e => patch(i, { video_url: e.target.value })} /></label> : <>
            <label>Hoofdbeeld-URL<input className={control} aria-label={`Element ${i + 1} hoofdbeeld`} type="url" value={item.frontal_image_url ?? ''} placeholder="https://…" onChange={e => patch(i, { frontal_image_url: e.target.value })} /></label>
            <label>Extra aanzichten (1–3 URL’s, één per regel)<textarea className={control} aria-label={`Element ${i + 1} aanzichten`} value={(item.reference_image_urls ?? []).join('\n')} onChange={e => patch(i, { reference_image_urls: e.target.value.split('\n') })} /></label>
          </>}
          <label>Stem-ID (optioneel)<input className={control} aria-label={`Element ${i + 1} stem`} value={item.voice_id ?? ''} onChange={e => patch(i, { voice_id: e.target.value || undefined })} /></label>
          <button type="button" onClick={() => onChange(key, items.filter((_, n) => n !== i))}>Element verwijderen</button>
        </div>)}
        <button type="button" onClick={() => onChange(key, [...items, { frontal_image_url: '', reference_image_urls: [] }])}>＋ Personage of object</button>
      </section>
    }
    return <label className={`${card} block`} key={key}><span className="block">{field.label}</span>
      {field.type === 'boolean' ? <input aria-label={field.label} type="checkbox" role="switch" checked={!!value} onChange={e => onChange(key, e.target.checked)} />
        : field.type === 'select' ? <select className={control} aria-label={field.label} value={String(value ?? field.options?.[0] ?? '')} onChange={e => onChange(key, e.target.value)}>{field.options?.map(o => <option key={o} value={o}>{o === 'standard' ? 'Standaard' : o === 'fast' ? 'Fast' : o === 'customize' ? 'Eigen shots' : o === 'intelligent' ? 'Automatisch' : o}</option>)}</select>
        : field.type === 'number' ? <input className={control} aria-label={field.label} type="number" min={field.min} max={field.max} step={field.step ?? 1} value={value == null ? '' : Number(value)} onChange={e => onChange(key, e.target.value === '' ? undefined : Number(e.target.value))} />
        : <textarea className={control} aria-label={field.label} maxLength={field.maxLength} value={String(value ?? '')} onChange={e => onChange(key, e.target.value)} />}
      {field.description && <span className="block text-white/45">{field.description}</span>}
    </label>
  })}</div>
}
