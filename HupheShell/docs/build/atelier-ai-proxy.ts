import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

/**
 * Supabase Edge Function: atelier-ai-proxy
 *
 * Centrale proxy voor AI-acties. Beheert API-keys aan de server-kant.
 *
 * Accepteert POST met JSON body:
 *   { action: 'transcribe',      audioBase64: string, mimeType: string }
 *   { action: 'summarize',       chunks: Array<{slideIdx, slideHeading, text, timestamp}> }
 *   { action: 'generate-image',  prompt: string, model?: string, systemPrompt?: string }
 *
 * Auth: stuur de Supabase anon key of een geldig user-JWT als `Authorization: Bearer <token>`.
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const GROQ_API_KEY        = Deno.env.get('GROQ_API_KEY')
const OPENROUTER_API_KEY  = Deno.env.get('OPENROUTER_API_KEY')
const SUPABASE_URL        = Deno.env.get('SUPABASE_URL')
const SUPABASE_ANON_KEY   = Deno.env.get('SUPABASE_ANON_KEY')

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  })
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'Missing Authorization header' }, 401)

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  const { action } = body

  // -------------------------------------------------------------------------
  // Transcribe — audio base64 → Groq Whisper
  // -------------------------------------------------------------------------
  if (action === 'transcribe') {
    if (!GROQ_API_KEY) return json({ error: 'GROQ_API_KEY not configured' }, 500)

    const { audioBase64, mimeType } = body as { audioBase64: string; mimeType: string }
    if (!audioBase64) return json({ error: 'audioBase64 is required' }, 400)

    const audioBytes = Uint8Array.from(atob(audioBase64), (c) => c.charCodeAt(0))
    if (audioBytes.length < 1000) return json({ ok: true, text: '' })

    const ext = mimeType?.includes('mp4') ? 'mp4' : mimeType?.includes('ogg') ? 'ogg' : 'webm'
    const formData = new FormData()
    formData.append('file', new Blob([audioBytes], { type: mimeType ?? 'audio/webm' }), `audio.${ext}`)
    formData.append('model', 'whisper-large-v3-turbo')
    formData.append('language', 'nl')
    formData.append('response_format', 'text')

    try {
      const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${GROQ_API_KEY}` },
        body: formData,
      })
      if (!res.ok) {
        const errText = await res.text()
        if (res.status === 400 && errText.includes('Audio file is too short')) return json({ ok: true, text: '' })
        return json({ ok: false, error: `Groq fout ${res.status}: ${errText.slice(0, 200)}` })
      }
      const text = await res.text()
      return json({ ok: true, text: text.trim() })
    } catch (err: unknown) {
      return json({ ok: false, error: `Transcriptie fout: ${(err as Error).message}` })
    }
  }

  // -------------------------------------------------------------------------
  // Summarize — transcript chunks → structured meeting notes (OpenRouter)
  // -------------------------------------------------------------------------
  if (action === 'summarize') {
    if (!OPENROUTER_API_KEY) return json({ error: 'OPENROUTER_API_KEY not configured' }, 500)

    const { chunks } = body as {
      chunks: Array<{ slideIdx: number; slideHeading: string; text: string; timestamp: string }>
    }
    if (!chunks?.length) return json({ ok: false, error: 'Geen chunks om samen te vatten.' })

    const bySlide = new Map<number, { heading: string; lines: string[] }>()
    for (const c of chunks) {
      if (!bySlide.has(c.slideIdx)) bySlide.set(c.slideIdx, { heading: c.slideHeading, lines: [] })
      bySlide.get(c.slideIdx)!.lines.push(c.text)
    }
    const grouped = [...bySlide.entries()]
      .sort(([a], [b]) => a - b)
      .map(([idx, { heading, lines }]) =>
        `### Slide ${idx + 1} — ${heading}\n${lines.map((l) => `- ${l}`).join('\n')}`
      )
      .join('\n\n')

    const system = `Je bent een professionele notulist. Je krijgt ruwe transcriptfragmenten van een vergadering, gegroepeerd per presentatie-slide. Zet deze om naar beknopte, heldere notulen.

Per slide geef je:
- Wat er besproken of toegelicht is
- Beslissingen die genomen zijn
- Wijzigingen die gevraagd zijn
- Actiepunten als die er zijn

Schrijf in de derde persoon, actieve stijl. Wees bondig — max 5 bullets per slide. Laat lege slides weg.

Retourneer UITSLUITEND geldig JSON (geen markdown, geen uitleg):
[
  {
    "slideIdx": <number 0-gebaseerd>,
    "slideHeading": "<heading>",
    "bullets": ["<bullet 1>", "<bullet 2>"]
  }
]`

    try {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${OPENROUTER_API_KEY}`,
          'HTTP-Referer': 'https://hupheai.app',
          'X-Title': 'HupheAI Meeting Notes',
        },
        body: JSON.stringify({
          model: 'anthropic/claude-3-5-haiku',
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: grouped },
          ],
          max_tokens: 1024,
        }),
      })
      const data = await res.json() as Record<string, unknown>
      const raw = (data.choices as Array<{ message: { content: string } }>)?.[0]?.message?.content ?? ''
      const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
      const notes = JSON.parse(cleaned)
      return json({ ok: true, notes })
    } catch (err: unknown) {
      return json({ ok: false, error: `Samenvatten mislukt: ${(err as Error).message}` })
    }
  }

  // -------------------------------------------------------------------------
  // Generate image — prompt → OpenRouter image model
  // -------------------------------------------------------------------------
  if (action === 'generate-image') {
    if (!OPENROUTER_API_KEY) return json({ error: 'OPENROUTER_API_KEY not configured' }, 500)

    const { prompt, model, systemPrompt } = body as {
      prompt: string; model?: string; systemPrompt?: string
    }
    if (!prompt) return json({ error: 'prompt is required' }, 400)

    const messages: Array<{ role: string; content: string }> = []
    if (systemPrompt) messages.push({ role: 'system', content: systemPrompt })
    messages.push({ role: 'user', content: prompt })

    try {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://huphe.ai',
          'X-Title': 'HupheAI Atelier Proxy',
        },
        body: JSON.stringify({
          model: model ?? 'black-forest-labs/flux-schnell',
          messages,
          modalities: ['image'],
        }),
      })
      if (!res.ok) {
        const errText = await res.text()
        throw new Error(`AI Provider error: ${errText}`)
      }
      const data = await res.json() as Record<string, unknown>
      const choices = data.choices as Array<{ message?: { content?: string }; url?: string }>
      const imageUrl = choices?.[0]?.message?.content || choices?.[0]?.url
      if (!imageUrl) throw new Error('No image URL returned from AI provider')

      // Log usage (best-effort, no block on failure)
      if (SUPABASE_URL && SUPABASE_ANON_KEY) {
        const token = authHeader.replace('Bearer ', '')
        const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
        const { data: { user } } = await sb.auth.getUser(token)
        if (user) {
          await sb.from('audit_log').insert({
            actor_id: user.id,
            action: 'ai_image_generated',
            payload: { model: model ?? 'default', prompt_length: (prompt as string).length, provider: 'openrouter' },
          })
        }
      }

      return json({ ok: true, url: imageUrl })
    } catch (err: unknown) {
      return json({ ok: false, error: (err as Error).message })
    }
  }

  return json({ error: `Unknown action: ${action}` }, 400)
})
