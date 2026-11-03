import { json, CORS_HEADERS } from './response.ts'
import { buildRifeTransitionRequest, RIFE_MODEL, RIFE_COMPUTE_SECOND_USD, RIFE_RESERVED_COMPUTE_SECONDS, rifeReservationAmount, rifeMeasuredCharge, rifeQueueUrls } from './rife-transition-contract.ts'

// The caller has authenticated the user and checked the active model/wallet.
// RIFE jobs use stored URLs/prices, never values supplied to status/content/cancel.
export async function submitRifeTransition(client: any, userId: string, model: { markup_pct: number }, body: Record<string, unknown>, key: string): Promise<Response> {
  let plan: ReturnType<typeof buildRifeTransitionRequest>, amount: number
  try { plan = buildRifeTransitionRequest(body); amount = rifeReservationAmount(model.markup_pct) }
  catch (error) { return json({ error: (error as Error).message, code: 'invalid_params' }, 400) }
  const { data: rows, error } = await client.rpc('reserve_credits_for_user', { p_user_id: userId, p_amount: amount, p_expires_minutes: 60 })
  if (error?.message?.includes('insufficient_balance')) return json({ error: 'Onvoldoende credits voor de tijdelijke RIFE-reservering.', code: 'insufficient_balance' }, 402)
  if (error || !rows?.[0]?.reservation_id) return json({ error: 'De RIFE-reservering kon niet worden gemaakt.', code: 'billing_error' }, 500)
  const reservationId = rows[0].reservation_id
  const snapshot = { model_id: RIFE_MODEL, compute_second_rate_usd: RIFE_COMPUTE_SECOND_USD, markup_pct: model.markup_pct,
    compute_reservation_seconds: RIFE_RESERVED_COMPUTE_SECONDS, output_frames: plan.outputFrames, fps: plan.body.fps, state: 'submitting' }
  const { error: snapshotError } = await client.from('credit_reservations').update({ provider_job: snapshot }).eq('id', reservationId).select('id').single()
  if (snapshotError) {
    const { error: releaseError } = await client.rpc('release_reservation_for_user', { p_reservation_id: reservationId })
    return json({ error: releaseError
      ? 'RIFE is niet gestart. Het vrijgeven van de reservering moet nog worden afgerond.'
      : 'RIFE is nog niet volledig ingericht op de server. De reservering is vrijgegeven.',
      code: releaseError ? 'reservation_release_pending' : 'rife_not_configured', reservation_id: reservationId }, 503)
  }
  let response: Response
  try {
    response = await fetch(`https://queue.fal.run/${RIFE_MODEL}`, { method: 'POST', headers: { Authorization: `Key ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify(plan.body) })
  } catch {
    // A network failure may occur after fal has accepted the request. Retain the
    // reservation for review rather than treating that uncertainty as a free run.
    return json({ error: 'De ontvangst van de RIFE-opdracht is niet bevestigd. Controleer de opdracht voordat je opnieuw genereert.', code: 'submission_unknown', reservation_id: reservationId }, 502)
  }
  if (!response.ok) {
    const { error: releaseError } = await client.rpc('release_rife_reservation', { p_reservation_id: reservationId })
    return json({ error: `RIFE-aanvraag geweigerd (${response.status}).${releaseError ? ' Het vrijgeven van de reservering moet nog worden afgerond.' : ''}`,
      code: releaseError ? 'reservation_release_pending' : 'upstream_error', reservation_id: reservationId }, 502)
  }
  let data: any
  try { data = await response.json() }
  catch { return json({ error: 'RIFE gaf geen leesbare bevestiging terug. Controleer de opdracht voordat je opnieuw genereert.', code: 'submission_unknown', reservation_id: reservationId }, 502) }
  let urls: ReturnType<typeof rifeQueueUrls>
  try { urls = rifeQueueUrls(data.request_id) }
  catch { return json({ error: 'RIFE gaf geen geldig opdrachtnummer terug.', code: 'submission_unknown', reservation_id: reservationId }, 502) }
  const { error: bindError } = await client.from('credit_reservations').update({ provider_job: { ...snapshot, job_id: data.request_id, ...urls, state: 'submitted' } }).eq('id', reservationId).select('id').single()
  if (bindError) return json({ error: 'RIFE is gestart, maar de server kon de opdracht niet vastleggen. Genereer niet opnieuw totdat deze opdracht is gecontroleerd.', code: 'job_binding_failed', reservation_id: reservationId, job_id: data.request_id }, 503)
  return json({ job_id: data.request_id, ...urls, status: data.status, reservation_id: reservationId, max_reservation: amount,
    resolved_duration: plan.duration, pricing_unit: 'compute_second', compute_second_rate_usd: RIFE_COMPUTE_SECOND_USD })
}

export async function handleRifeJob(client: any, reservation: any, action: 'status' | 'cancel' | 'content', key: string): Promise<Response> {
  const stored = reservation.provider_job
  let urls: ReturnType<typeof rifeQueueUrls>
  try { urls = rifeQueueUrls(stored.job_id) }
  catch { return json({ error: 'De RIFE-opdracht is nog niet aan de reservering gekoppeld.', code: 'job_binding_missing' }, 409) }
  const headers = { Authorization: `Key ${key}` }
  if (action === 'status') {
    if (reservation.status === 'settled') return json({ status: 'completed', billing: stored.billing ?? null })
    if (reservation.status !== 'pending') return json({ status: 'failed', error: 'De reservering voor deze RIFE-opdracht is vrijgegeven.' })
    const response = await fetch(urls.polling_url, { headers })
    if (!response.ok) return json({ status: 'processing', error: `RIFE-status tijdelijk niet beschikbaar (${response.status}); de reservering blijft behouden.`, code: 'status_unavailable' })
    const data = await response.json()
    if (data.status === 'IN_QUEUE') return json({ status: 'pending' })
    if (data.status === 'IN_PROGRESS') return json({ status: 'processing' })
    if (data.status !== 'COMPLETED') return json({ status: 'processing', error: 'RIFE gaf nog geen definitieve status terug.' })
    if (data.error || data.error_type) {
      const { error } = await client.rpc('release_rife_reservation', { p_reservation_id: reservation.id })
      if (error) return json({ status: 'processing', error: 'De mislukte RIFE-opdracht wordt nog financieel afgerond.', code: 'billing_pending' })
      return json({ status: 'failed', error: data.error ?? 'RIFE-opdracht geannuleerd of mislukt.' })
    }
    // Confirm that the completed request contains an actual video before charging.
    const resultResponse = await fetch(urls.content_url, { headers })
    if (!resultResponse.ok) return json({ status: 'processing', error: 'Het RIFE-resultaat is nog niet beschikbaar.', code: 'result_pending' })
    const result = await resultResponse.json()
    if (typeof result.video?.url !== 'string' || !result.video.url.startsWith('https://')) return json({ status: 'processing', error: 'Het RIFE-resultaat bevat nog geen downloadbare video.', code: 'result_pending' })
    try { rifeMeasuredCharge(data.metrics?.inference_time, stored.compute_second_rate_usd, stored.markup_pct, reservation.amount) }
    catch { return json({ status: 'processing', error: 'RIFE is klaar; de gemeten rekentijd ontbreekt nog. Er is nog niets afgerekend.', code: 'billing_pending' }) }
    const { data: billing, error } = await client.rpc('settle_rife_reservation', { p_reservation_id: reservation.id, p_inference_seconds: data.metrics.inference_time })
    if (error) return json({ status: 'processing', error: 'RIFE is klaar; de afrekening wordt opnieuw geprobeerd.', code: 'billing_pending' })
    return json({ status: 'completed', billing })
  }
  if (action === 'cancel') {
    if (reservation.status !== 'pending') return json({ ok: true, cancelled: false, reason: 'already_settled' })
    const response = await fetch(urls.cancel_url, { method: 'PUT', headers })
    if (response.status === 400) return json({ ok: true, cancelled: false, reason: 'already_completed' })
    // An accepted cancel is only a request. Poll until fal confirms completion/
    // cancellation; the locked release above then refunds the reservation once.
    return json({ ok: response.ok, cancelled: false, reason: response.ok ? 'cancellation_requested' : 'cancellation_unconfirmed' })
  }
  if (reservation.status !== 'settled') return json({ error: 'RIFE-video nog niet beschikbaar.' }, 404)
  const resultResponse = await fetch(urls.content_url, { headers })
  if (!resultResponse.ok) return json({ error: `RIFE-resultaat ophalen mislukt (${resultResponse.status}).` }, 502)
  const result = await resultResponse.json()
  if (typeof result.video?.url !== 'string' || !result.video.url.startsWith('https://')) return json({ error: 'RIFE-video ontbreekt in het resultaat.' }, 502)
  const video = await fetch(result.video.url)
  if (!video.ok || !video.body) return json({ error: `RIFE-video downloaden mislukt (${video.status}).` }, 502)
  return new Response(video.body, { status: 200, headers: { 'Content-Type': video.headers.get('content-type') ?? 'video/mp4', ...CORS_HEADERS } })
}
