/** Mocked RIFE requests and measured billing: no keys, network or paid jobs. */
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const dir = await mkdtemp(join(tmpdir(), 'huphe-rife-contract-'))
const originalFetch = globalThis.fetch
try {
  const file = join(dir, 'rife.mjs')
  await build({ stdin: { contents: `export * from './supabase/functions/_shared/rife-transition-contract'; export * from './supabase/functions/_shared/rife-transition-handler'`, resolveDir: resolve('.') }, bundle: true, platform: 'node', format: 'esm', outfile: file, logLevel: 'silent' })
  const m = await import(pathToFileURL(file).href)
  const input = { model: m.RIFE_MODEL, prompt: '', image_url: 'data:image/png;base64,YQ==', end_image_url: 'https://example.test/end.png', extra_params: { num_frames: 24, fps: 25 } }
  const plan = m.buildRifeTransitionRequest(input)
  assert.equal(plan.duration, 1)
  assert.equal(plan.outputFrames, 25)
  assert.deepEqual(plan.body, { start_image_url: input.image_url, end_image_url: input.end_image_url, output_type: 'video', num_frames: 24, fps: 25, include_start: true, include_end: false, sync_mode: false })
  assert.equal(m.buildRifeTransitionRequest({ ...input, extra_params: { num_frames: 64, fps: 25 } }).duration, 2.6)
  for (const num_frames of [0, 65, 1.5, NaN, '24']) assert.throws(() => m.buildRifeTransitionRequest({ ...input, extra_params: { num_frames, fps: 25 } }), /tussenframes/)
  for (const fps of [0, 61, 24.5, '25']) assert.throws(() => m.buildRifeTransitionRequest({ ...input, extra_params: { num_frames: 24, fps } }), /per seconde/)
  for (const change of [{ end_image_url: '' }, { image_url: 'file:///private/image.png' }, { extra_params: { num_frames: 24, fps: 25, include_end: true } }, { duration: 1 }, { prompt: 'Invent a new scene' }, { video_urls: ['https://example.test/movie.mp4'] }]) assert.throws(() => m.buildRifeTransitionRequest({ ...input, ...change }))
  assert.equal(m.rifeReservationAmount(25), 19500)
  assert.equal(m.rifeMeasuredCharge(1.25, .0013, 25, 19500).chargedAmount, 204)
  assert.deepEqual(m.rifeMeasuredCharge(240, .0013, 25, 19500), { measuredAmount: 39000, chargedAmount: 19500, platformOverrun: 19500 })
  for (const value of [undefined, NaN, -1, Infinity, '2.0', 1e300]) assert.throws(() => m.rifeMeasuredCharge(value, .0013, 25, 19500))
  assert.throws(() => m.rifeQueueUrls('../untrusted'))
  assert.throws(() => m.rifeQueueUrls(undefined))
  assert.throws(() => m.rifeQueueUrls(123456))
  assert.equal(m.RIFE_CAPABILITY.transition_method, 'rife')
  assert.deepEqual(m.RIFE_CAPABILITY.supported_durations, [])

  const jobId = 'a1234567-1234-1234-1234-123456789abc'
  const urls = m.rifeQueueUrls(jobId)
  let row, calls, requests, updateCount, failUpdateAt, failRelease, failSettle
  function reset() { row = undefined; calls = []; requests = []; updateCount = 0; failUpdateAt = undefined; failRelease = false; failSettle = false }
  reset()
  const client = {
    from(table) {
      assert.equal(table, 'credit_reservations')
      return { update(change) { return { eq(field, value) {
        assert.equal(field, 'id'); assert.equal(value, row.id)
        return { select(columns) { assert.equal(columns, 'id'); return { async single() {
          updateCount++
          if (updateCount === failUpdateAt) return { error: { message: 'Database unavailable' } }
          Object.assign(row, change); return { data: { id: row.id }, error: null }
        } } } }
      } } } }
    },
    async rpc(name, args) {
      calls.push({ name, args })
      if (name === 'reserve_credits_for_user') { row = { id: 'reservation-1', user_id: args.p_user_id, status: 'pending', amount: args.p_amount }; return { data: [{ reservation_id: row.id }], error: null } }
      if (name === 'release_rife_reservation' || name === 'release_reservation_for_user') {
        if (failRelease) return { error: { message: 'Database unavailable' } }
        row.status = 'released'; return { error: null }
      }
      if (name === 'settle_rife_reservation') {
        if (failSettle) return { error: { message: 'Database unavailable' } }
        const billing = m.rifeMeasuredCharge(args.p_inference_seconds, row.provider_job.compute_second_rate_usd, row.provider_job.markup_pct, row.amount)
        row.status = 'settled'; row.provider_job.billing = billing
        return { data: billing, error: null }
      }
      throw new Error(`Unexpected RPC: ${name}`)
    },
  }
  const response = value => new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } })
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options })
    assert.equal(url, 'https://queue.fal.run/fal-ai/rife')
    return response({ request_id: jobId, status: 'IN_QUEUE', status_url: 'https://untrusted.test/fake' })
  }
  const submitted = await m.submitRifeTransition(client, 'owner-1', { markup_pct: 25 }, input, 'test-provider-key')
  assert.equal(submitted.status, 200)
  const submission = await submitted.json()
  assert.equal(submission.polling_url, urls.polling_url)
  assert.equal(submission.max_reservation, 19500)
  assert.equal(row.provider_job.compute_second_rate_usd, .0013)
  assert.equal(row.provider_job.markup_pct, 25)
  assert.equal(row.provider_job.job_id, jobId)
  assert.deepEqual(JSON.parse(requests[0].options.body), plan.body)
  const submittedRow = structuredClone(row)
  const afterSubmitRpcCount = calls.length
  let pollPayload = { status: 'COMPLETED', metrics: { inference_time: 1.25 } }
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options })
    if (url === urls.polling_url) return response(pollPayload)
    if (url === urls.content_url) return response({ video: { url: 'https://files.fal.media/rife.mp4' } })
    if (url === 'https://files.fal.media/rife.mp4') return new Response(new Uint8Array([1, 2, 3]), { headers: { 'Content-Type': 'video/mp4' } })
    if (url === urls.cancel_url) return new Response('', { status: 202 })
    throw new Error(`Unexpected URL: ${url}`)
  }
  // Stored paths and rate are authoritative even if response URLs were malicious.
  let status = await (await m.handleRifeJob(client, row, 'status', 'test-provider-key')).json()
  assert.equal(status.status, 'completed')
  assert.equal(status.billing.chargedAmount, 204)
  assert.equal(calls.at(-1).name, 'settle_rife_reservation')
  assert.deepEqual(calls.at(-1).args, { p_reservation_id: 'reservation-1', p_inference_seconds: 1.25 })
  const countAfterSettle = calls.length
  assert.equal((await (await m.handleRifeJob(client, row, 'status', 'test-provider-key')).json()).status, 'completed')
  assert.equal(calls.length, countAfterSettle, 'a repeated completed poll must not settle twice')
  const content = await m.handleRifeJob(client, row, 'content', 'test-provider-key')
  assert.equal(content.status, 200)
  assert.deepEqual([...new Uint8Array(await content.arrayBuffer())], [1, 2, 3])

  row = structuredClone(submittedRow); pollPayload = { status: 'COMPLETED', metrics: {} }
  status = await (await m.handleRifeJob(client, row, 'status', 'test-provider-key')).json()
  assert.equal(status.code, 'billing_pending')
  assert.equal(status.status, 'processing')
  assert.equal(row.status, 'pending')
  assert.equal(calls.length, countAfterSettle, 'missing runtime must never settle the reserved amount')
  pollPayload = { status: 'COMPLETED', metrics: { inference_time: 1.25 } }; failSettle = true
  status = await (await m.handleRifeJob(client, row, 'status', 'test-provider-key')).json()
  assert.equal(status.code, 'billing_pending')
  assert.equal(row.status, 'pending', 'a failed settlement must not mark a job complete')
  failSettle = false
  const cancel = await (await m.handleRifeJob(client, row, 'cancel', 'test-provider-key')).json()
  assert.equal(cancel.cancelled, false)
  assert.equal(cancel.reason, 'cancellation_requested')
  assert.equal(row.status, 'pending', 'accepted cancellation is not proven cancellation')
  pollPayload = { status: 'COMPLETED', error: 'Cancelled', error_type: 'cancelled', metrics: { inference_time: 0 } }
  status = await (await m.handleRifeJob(client, row, 'status', 'test-provider-key')).json()
  assert.equal(status.status, 'failed')
  assert.equal(row.status, 'released')
  assert.equal(calls.at(-1).name, 'release_rife_reservation')
  assert.equal((await m.handleRifeJob(client, row, 'content', 'test-provider-key')).status, 404)

  reset()
  const invalid = await m.submitRifeTransition(client, 'owner-1', { markup_pct: 25 }, { ...input, extra_params: { num_frames: 100, fps: 25 } }, 'test-provider-key')
  assert.equal(invalid.status, 400)
  assert.equal(calls.length, 0, 'invalid input must be rejected before reserving money')

  reset(); failUpdateAt = 1
  globalThis.fetch = async () => { throw new Error('Provider must not be called without a stored price snapshot') }
  let failedSubmission = await (await m.submitRifeTransition(client, 'owner-1', { markup_pct: 25 }, input, 'test-provider-key')).json()
  assert.equal(failedSubmission.code, 'rife_not_configured')
  assert.equal(failedSubmission.reservation_id, 'reservation-1')
  assert.equal(row.status, 'released')
  reset(); failUpdateAt = 1; failRelease = true
  failedSubmission = await (await m.submitRifeTransition(client, 'owner-1', { markup_pct: 25 }, input, 'test-provider-key')).json()
  assert.equal(failedSubmission.code, 'reservation_release_pending')
  assert.equal(row.status, 'pending')
  reset(); failUpdateAt = 2
  globalThis.fetch = async () => response({ request_id: jobId, status: 'IN_QUEUE' })
  failedSubmission = await (await m.submitRifeTransition(client, 'owner-1', { markup_pct: 25 }, input, 'test-provider-key')).json()
  assert.equal(failedSubmission.code, 'job_binding_failed')
  assert.equal(failedSubmission.job_id, jobId)
  assert.equal(row.status, 'pending', 'accepted provider jobs must not be refunded when persistence fails')
  assert.equal(calls.filter(c => c.name.includes('release')).length, 0)
  reset()
  globalThis.fetch = async () => { throw new Error('Connection failed after sending') }
  failedSubmission = await (await m.submitRifeTransition(client, 'owner-1', { markup_pct: 25 }, input, 'test-provider-key')).json()
  assert.equal(failedSubmission.code, 'submission_unknown')
  assert.equal(failedSubmission.reservation_id, 'reservation-1')
  assert.equal(row.status, 'pending')
  reset()
  globalThis.fetch = async () => new Response('not json', { status: 200 })
  failedSubmission = await (await m.submitRifeTransition(client, 'owner-1', { markup_pct: 25 }, input, 'test-provider-key')).json()
  assert.equal(failedSubmission.code, 'submission_unknown')
  assert.equal(row.status, 'pending')
  const sql = await readFile('supabase/migrations/20261103000100_rife_transition_tool.sql', 'utf8')
  assert.equal((sql.match(/FOR UPDATE/g) ?? []).length, 2)
  assert.ok(sql.includes('ON CONFLICT (provider, model_id) DO NOTHING'))
  assert.ok(sql.includes('FROM PUBLIC, anon, authenticated'))
  assert.equal((sql.match(/search_path = pg_catalog, public, pg_temp/g) ?? []).length, 2)
  assert.ok(sql.includes("IF v_row.status = 'settled' THEN"))
  console.log('PASS RIFE: frame boundaries and limits, derived output duration, immutable job binding, measured runtime/refund/cap, missing metric, provider cancellation, repeat polling and download. No paid calls.')
} finally {
  globalThis.fetch = originalFetch
  await rm(dir, { recursive: true, force: true })
}
