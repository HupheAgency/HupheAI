/** RIFE polling/cancellation tests with a mocked proxy and immediate timers. */
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const dir = await mkdtemp(join(tmpdir(), 'huphe-rife-client-'))
const originalTimeout = globalThis.setTimeout
const originalFetch = globalThis.fetch
try {
  const file = join(dir, 'client.mjs')
  await build({ entryPoints: [resolve('src/main/lib/fal-video-job.ts')], bundle: true, platform: 'node', format: 'esm', outfile: file, logLevel: 'silent', plugins: [{
    name: 'mock-video-proxy', setup(builder) {
      builder.onResolve({ filter: /^\.\/proxy$/ }, () => ({ path: 'proxy', namespace: 'mock' }))
      builder.onLoad({ filter: /.*/, namespace: 'mock' }, () => ({ contents: `
        export const submitFalVideoJob = (...args) => globalThis.__rifeClientProxy.submit(...args)
        export const submitFalDraftComplete = (...args) => globalThis.__rifeClientProxy.finalize(...args)
        export const pollFalVideoJobStatus = (...args) => globalThis.__rifeClientProxy.poll(...args)
        export const downloadFalVideoContent = (...args) => globalThis.__rifeClientProxy.download(...args)
        export const cancelFalVideoJob = (...args) => globalThis.__rifeClientProxy.cancel(...args)
      ` }))
    },
  }] })
  const m = await import(pathToFileURL(file).href)
  const proxyFile = join(dir, 'proxy.mjs')
  await build({ entryPoints: [resolve('src/main/lib/proxy.ts')], bundle: true, platform: 'node', format: 'esm', outfile: proxyFile, logLevel: 'silent', plugins: [{
    name: 'mock-electron', setup(builder) {
      builder.onResolve({ filter: /^electron$/ }, () => ({ path: 'electron', namespace: 'mock' }))
      builder.onLoad({ filter: /.*/, namespace: 'mock' }, () => ({ contents: 'export const app = {getPath: () => "/unused-test-path"}; export const safeStorage = {};' }))
    },
  }] })
  const proxy = await import(pathToFileURL(proxyFile).href)
  globalThis.setTimeout = fn => { queueMicrotask(fn); return 0 }
  const submission = { job_id: 'rife-job', reservation_id: 'reservation-1', cancel_url: 'https://provider.test/cancel', polling_url: 'https://provider.test/status', content_url: 'https://provider.test/content', max_reservation: 19500, resolved_duration: 1 }
  let statuses, cancelResult, cancelError, calls, progress, jobState
  function reset(nextStatuses = [{ status: 'completed' }]) {
    statuses = [...nextStatuses]; cancelResult = { cancelled: false, reason: 'cancellation_requested' }; cancelError = undefined; calls = []; progress = []; jobState = { cancelled: false }
    globalThis.__rifeClientProxy = {
      async submit(...args) { calls.push({ type: 'submit', args }); return submission },
      async finalize() { return submission },
      async poll(...args) { calls.push({ type: 'poll', args }); assert.ok(statuses.length, 'unexpected additional poll'); return statuses.shift() },
      async download(...args) { calls.push({ type: 'download', args }); return new Response('video') },
      async cancel(...args) { calls.push({ type: 'cancel', args }); if (cancelError) throw cancelError; return cancelResult },
    }
  }
  const run = (model = 'fal-ai/rife') => m.runFalVideoJob({ model, jwt: 'local-test-token', jobState, extraParams: { num_frames: 24, fps: 25 }, onProgress: p => progress.push(p) })
  reset([{ status: 'processing' }, { status: 'completed' }]); jobState.cancelled = true
  let result = await run()
  assert.equal(await result.response.text(), 'video')
  assert.equal(result.resolvedDuration, 1)
  assert.equal(jobState.cancelled, false)
  assert.equal(calls.filter(c => c.type === 'cancel').length, 1, 'an unconfirmed cancellation must not be repeated every poll')
  assert.equal(calls.filter(c => c.type === 'poll').length, 2)
  assert.ok(progress.some(p => p.step.includes('wachten op bevestiging')))

  reset(); jobState.cancelled = true; cancelResult = { cancelled: true }
  await assert.rejects(run(), m.VideoJobCancelledError)
  assert.equal(calls.filter(c => c.type === 'poll' || c.type === 'download').length, 0)

  reset([{ status: 'cancelled', error: 'Provider confirmed cancellation' }]); jobState.cancelled = true
  await assert.rejects(run(), m.VideoJobCancelledError)
  assert.equal(calls.filter(c => c.type === 'poll').length, 1)
  assert.equal(calls.filter(c => c.type === 'download').length, 0)

  reset([{ status: 'failed', error: 'RIFE-opdracht geannuleerd of mislukt.' }]); jobState.cancelled = true
  await assert.rejects(run(), error => error.message.includes('geannuleerd of mislukt') && error.definitiveFailure === true && error.code === 'provider_failed')
  assert.equal(calls.filter(c => c.type === 'poll').length, 1)

  const billingLabel = 'RIFE is klaar; de gemeten rekentijd ontbreekt nog. Er is nog niets afgerekend.'
  reset([{ status: 'processing', code: 'billing_pending', error: billingLabel }, { status: 'completed' }])
  await run()
  assert.ok(progress.some(p => p.step === billingLabel))
  assert.equal(calls.filter(c => c.type === 'download').length, 1)

  reset(); jobState.cancelled = true; cancelError = new Error('Temporary connection failure')
  result = await run()
  assert.equal(await result.response.text(), 'video')
  assert.ok(progress.some(p => p.step.includes('Annulering niet bevestigd')))

  // Existing models retain their existing terminal cancellation behavior.
  reset(); jobState.cancelled = true
  await assert.rejects(run('bytedance/seedance-2.5'), m.VideoJobCancelledError)
  assert.equal(calls.filter(c => c.type === 'cancel').length, 1)
  assert.equal(calls.filter(c => c.type === 'poll' || c.type === 'download').length, 0)
  reset([{ status: 'processing', code: 'billing_pending', error: billingLabel }, { status: 'completed' }])
  await run('bytedance/seedance-2.5')
  assert.ok(progress.some(p => p.step.startsWith('Video wordt gegenereerd')))
  assert.ok(!progress.some(p => p.step === billingLabel))

  const rejected = { insufficient_balance: 402, invalid_params: 400, wallet_blocked: 403, model_not_found: 403, rate_limited: 429, not_authenticated: 401, rife_not_configured: 503 }
  for (const [code, status] of Object.entries(rejected)) {
    reset(); globalThis.__rifeClientProxy.submit = proxy.submitFalVideoJob
    globalThis.fetch = async () => new Response(JSON.stringify({ error: 'Aanvraag afgewezen', code }), { status })
    await assert.rejects(run(), error => error.code === code && error.definitiveFailure === true)
    assert.equal(calls.filter(c => c.type === 'poll' || c.type === 'download').length, 0)
  }
  // A proven rejection can be retried; the next call follows the normal flow.
  reset(); globalThis.__rifeClientProxy.submit = proxy.submitFalVideoJob
  globalThis.fetch = async () => new Response(JSON.stringify({ error: 'Onvoldoende saldo', code: 'insufficient_balance' }), { status: 402 })
  await assert.rejects(run(), error => error.definitiveFailure === true)
  globalThis.fetch = async () => new Response(JSON.stringify(submission))
  result = await run()
  assert.equal(await result.response.text(), 'video')

  for (const code of ['submission_unknown', 'job_binding_failed', 'reservation_release_pending', 'billing_error', 'upstream_error']) {
    reset(); globalThis.__rifeClientProxy.submit = proxy.submitFalVideoJob
    globalThis.fetch = async () => new Response(JSON.stringify({ error: 'Uitkomst nog onbekend', code, definitiveFailure: true }), { status: 502 })
    await assert.rejects(run(), error => error.code === code && error.definitiveFailure === false)
  }
  reset(); globalThis.__rifeClientProxy.submit = proxy.submitFalVideoJob
  globalThis.fetch = async () => { throw new Error('Network timeout after sending request') }
  await assert.rejects(run(), error => error.definitiveFailure !== true)
  // Re-authentication/balance errors after submission cannot prove job failure.
  reset(); globalThis.__rifeClientProxy.poll = proxy.pollFalVideoJobStatus
  globalThis.fetch = async () => new Response(JSON.stringify({ error: 'Wallet geblokkeerd', code: 'wallet_blocked' }), { status: 403 })
  await assert.rejects(run(), error => error.code === 'wallet_blocked' && error.definitiveFailure === false)
  assert.equal(calls.filter(c => c.type === 'download').length, 0)
  console.log('PASS RIFE client: cancellation confirmation, billing status, explicit rejection/retry, ambiguous submission/status errors and legacy behavior. No waiting or network.')
} finally {
  globalThis.setTimeout = originalTimeout
  globalThis.fetch = originalFetch
  delete globalThis.__rifeClientProxy
  await rm(dir, { recursive: true, force: true })
}
