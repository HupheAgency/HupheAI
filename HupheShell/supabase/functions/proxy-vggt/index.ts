import { requireUserId, AuthError } from '../_shared/auth.ts'
import { json, handleOptions } from '../_shared/response.ts'

const RUNPOD_API_KEY = Deno.env.get('VGGT_RUNPOD_API_KEY')!
const VGGT_RUNPOD_ENDPOINT_ID = Deno.env.get('VGGT_RUNPOD_ENDPOINT_ID')!
const RUNPOD_BASE = `https://api.runpod.ai/v2/${VGGT_RUNPOD_ENDPOINT_ID}`

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return handleOptions()

  try {
    await requireUserId(req)

    const body = await req.json()
    const action: string = body.action

    // ── Submit een nieuwe VGGT pose-estimatie job ─────────────────────────────
    if (action === 'submit') {
      const { image_b64, orig_w, orig_h, frame_names } = body
      if (!image_b64 || !Array.isArray(image_b64) || image_b64.length === 0) {
        return json({ error: 'image_b64 ontbreekt of is leeg' }, 400)
      }

      const res = await fetch(`${RUNPOD_BASE}/run`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${RUNPOD_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          input: {
            image_b64,
            orig_w: orig_w ?? 1280,
            orig_h: orig_h ?? 720,
            frame_names: frame_names ?? [],
          },
        }),
      })

      if (!res.ok) {
        const text = await res.text()
        console.error('[proxy-vggt/submit] RunPod error:', res.status, text.slice(0, 300))
        return json({ error: `RunPod submit mislukt (${res.status}): ${text.slice(0, 200)}` }, 502)
      }

      const data = await res.json() as any
      return json({ job_id: data.id })
    }

    // ── Peil de status van een bestaande VGGT job ─────────────────────────────
    if (action === 'status') {
      const { job_id } = body
      if (!job_id) return json({ error: 'job_id ontbreekt' }, 400)

      const res = await fetch(`${RUNPOD_BASE}/status/${job_id}`, {
        headers: { 'Authorization': `Bearer ${RUNPOD_API_KEY}` },
      })

      if (!res.ok) {
        const text = await res.text()
        return json({ error: `RunPod status mislukt (${res.status}): ${text.slice(0, 200)}` }, 502)
      }

      const data = await res.json() as any

      return json({
        status: data.status,
        cameras_b64: data.output?.cameras_b64 ?? null,
        images_b64: data.output?.images_b64 ?? null,
        points3d_b64: data.output?.points3d_b64 ?? null,
        registered: data.output?.registered ?? null,
        total: data.output?.total ?? null,
        pct: data.output?.pct ?? null,
        point_count: data.output?.point_count ?? null,
        error: data.output?.error ?? data.error ?? null,
      })
    }

    return json({ error: `Onbekende action: ${action}` }, 400)

  } catch (err: any) {
    if (err instanceof AuthError) return json({ error: err.message }, err.status)
    console.error('[proxy-vggt] Fout:', err.message)
    return json({ error: 'Interne serverfout' }, 500)
  }
})
