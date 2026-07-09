import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { requireUserId, AuthError } from '../_shared/auth.ts'
import { json, handleOptions } from '../_shared/response.ts'

const RUNPOD_API_KEY = Deno.env.get('RUNPOD_API_KEY')!
const RUNPOD_ENDPOINT_ID = Deno.env.get('RUNPOD_ENDPOINT_ID')!
const RUNPOD_BASE = `https://api.runpod.ai/v2/${RUNPOD_ENDPOINT_ID}`
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const BUCKET = 'atelier-assets'

async function createPlyUploadUrl(projectId: string): Promise<{ uploadUrl: string; storagePath: string }> {
  const storagePath = `splat-temp/${projectId}/${Date.now()}/point_cloud.ply`
  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  const { data, error } = await adminClient.storage.from(BUCKET).createSignedUploadUrl(storagePath)
  if (error || !data?.signedUrl) throw new Error(`PLY upload URL aanmaken mislukt: ${error?.message ?? 'geen URL'}`)
  return { uploadUrl: data.signedUrl, storagePath }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return handleOptions()

  try {
    await requireUserId(req)

    const body = await req.json()
    const action: string = body.action

    // ── Submit een nieuwe trainingsjob ────────────────────────────────────────
    if (action === 'submit') {
      const { dataset_url, max_steps = 5000, project_id } = body
      if (!dataset_url) return json({ error: 'dataset_url ontbreekt' }, 400)
      if (!project_id) return json({ error: 'project_id ontbreekt' }, 400)

      const { uploadUrl, storagePath } = await createPlyUploadUrl(project_id)

      const res = await fetch(`${RUNPOD_BASE}/run`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${RUNPOD_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ input: { dataset_url, max_steps, upload_url: uploadUrl } }),
      })

      if (!res.ok) {
        const text = await res.text()
        console.error('[proxy-runpod/submit] RunPod error:', res.status, text.slice(0, 300))
        return json({ error: `RunPod submit mislukt (${res.status}): ${text.slice(0, 200)}` }, 502)
      }

      const data = await res.json() as any
      return json({ job_id: data.id, ply_storage_path: storagePath })
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
    return json({ error: err.message ?? 'Interne serverfout' }, 500)
  }
})
