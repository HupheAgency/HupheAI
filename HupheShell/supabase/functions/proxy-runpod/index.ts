import { requireUserId, AuthError } from '../_shared/auth.ts'
import { json, handleOptions } from '../_shared/response.ts'

const RUNPOD_API_KEY = Deno.env.get('RUNPOD_API_KEY')!
const RUNPOD_ENDPOINT_ID = Deno.env.get('RUNPOD_ENDPOINT_ID')!
const RUNPOD_BASE = `https://api.runpod.ai/v2/${RUNPOD_ENDPOINT_ID}`

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return handleOptions()

  try {
    await requireUserId(req)

    const body = await req.json()
    const action: string = body.action

    // ── Submit een nieuwe trainingsjob ────────────────────────────────────────
    if (action === 'submit') {
      const { dataset_url, max_steps = 5000, upload_url } = body
      if (!dataset_url) return json({ error: 'dataset_url ontbreekt' }, 400)

      const res = await fetch(`${RUNPOD_BASE}/run`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${RUNPOD_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ input: { dataset_url, max_steps, upload_url: upload_url ?? '' } }),
      })

      if (!res.ok) {
        const text = await res.text()
        console.error('[proxy-runpod/submit] RunPod error:', res.status, text.slice(0, 300))
        return json({ error: `RunPod submit mislukt (${res.status}): ${text.slice(0, 200)}` }, 502)
      }

      const data = await res.json() as any
      return json({ job_id: data.id })
    }

    // ── Peil de status van een bestaande job ──────────────────────────────────
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

      // Geef alleen wat de client nodig heeft terug
      return json({
        status: data.status,
        ply_b64: data.output?.ply_b64 ?? null,
        ply_uploaded: data.output?.ply_uploaded ?? false,
        ply_size_mb: data.output?.ply_size_mb ?? null,
        error: data.output?.error ?? data.error ?? null,
      })
    }

    return json({ error: `Onbekende action: ${action}` }, 400)

  } catch (err: any) {
    if (err instanceof AuthError) return json({ error: err.message }, err.status)
    console.error('[proxy-runpod] Fout:', err.message)
    return json({ error: 'Interne serverfout' }, 500)
  }
})
