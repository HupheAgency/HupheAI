import assert from 'node:assert/strict'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'esbuild'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const temporaryDirectory = await mkdtemp(join(tmpdir(), 'huphe-media-response-test-'))
try {
  const bundlePath = join(temporaryDirectory, 'local-media-response.mjs')
  await build({ entryPoints: [join(root, 'src/main/lib/local-media-response.ts')], bundle: true, format: 'esm', platform: 'node', outfile: bundlePath })
  const { serveLocalMedia } = await import(pathToFileURL(bundlePath).href)
  const mediaPath = join(temporaryDirectory, 'clip with spaces.mp4')
  const bytes = Buffer.from('0123456789abcdefghij')
  await writeFile(mediaPath, bytes)
  const call = (range, method = 'GET', extra = {}) => serveLocalMedia(new Request('huphe://file/ignored-by-helper', { method, headers: { ...(range ? { Range: range } : {}), ...extra } }), mediaPath)

  const full = await call()
  assert.equal(full.status, 200)
  assert.equal(full.headers.get('Content-Type'), 'video/mp4')
  assert.equal(full.headers.get('Accept-Ranges'), 'bytes')
  assert.equal(full.headers.get('Content-Length'), '20')
  assert.deepEqual(Buffer.from(await full.arrayBuffer()), bytes)
  for (const [range, expected, contentRange] of [
    ['bytes=2-5', '2345', 'bytes 2-5/20'],
    ['bytes=17-', 'hij', 'bytes 17-19/20'],
    ['bytes=-4', 'ghij', 'bytes 16-19/20'],
    ['bytes=-9999999999999999999999', bytes.toString(), 'bytes 0-19/20'],
    ['bytes=18-9999999999999999999999', 'ij', 'bytes 18-19/20'],
    ['bytes=0-0', '0', 'bytes 0-0/20'],
  ]) {
    const response = await call(range)
    assert.equal(response.status, 206, range)
    assert.equal(response.headers.get('Content-Range'), contentRange, range)
    assert.equal(response.headers.get('Content-Length'), String(expected.length), range)
    assert.equal(await response.text(), expected, range)
  }
  for (const range of ['bytes=20-', 'bytes=8-2', 'bytes=-0', 'bytes=-', 'bytes=abc', 'bytes=1.5-3', 'bytes=999999999999999999999-']) {
    const response = await call(range)
    assert.equal(response.status, 416, range)
    assert.equal(response.headers.get('Content-Range'), 'bytes */20')
    assert.equal(await response.text(), '')
  }
  for (const range of ['items=0-1', 'bytes=0-1,5-7']) {
    const response = await call(range)
    assert.equal(response.status, 200)
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes)
  }
  const head = await call('bytes=2-5', 'HEAD')
  assert.equal(head.status, 200)
  assert.equal(head.headers.get('Content-Length'), '20')
  assert.equal(head.headers.get('Content-Range'), null)
  assert.equal(await head.text(), '')
  const changed = await call('bytes=2-5', 'GET', { 'If-Range': 'Wed, 01 Jan 1997 00:00:00 GMT' })
  assert.equal(changed.status, 200)
  await changed.arrayBuffer()
  const unchanged = await call('bytes=2-5', 'GET', { 'If-Range': head.headers.get('Last-Modified') })
  assert.equal(unchanged.status, 206)
  assert.equal(await unchanged.text(), '2345')
  assert.equal((await call(undefined, 'POST')).status, 405)
  assert.equal((await serveLocalMedia(new Request('huphe://file/missing'), join(temporaryDirectory, 'missing.mp4'))).status, 404)
  assert.equal((await serveLocalMedia(new Request('huphe://file/directory'), temporaryDirectory)).status, 404)
  const emptyPath = join(temporaryDirectory, 'empty.mp4')
  await writeFile(emptyPath, '')
  assert.equal((await serveLocalMedia(new Request('huphe://file/empty'), emptyPath)).status, 200)
  assert.equal((await serveLocalMedia(new Request('huphe://file/empty', { headers: { Range: 'bytes=0-' } }), emptyPath)).status, 416)
  for (const [extension, mime] of [['png', 'image/png'], ['svg', 'image/svg+xml'], ['woff2', 'font/woff2'], ['glb', 'model/gltf-binary'], ['gltf', 'model/gltf+json'], ['splat', 'application/octet-stream'], ['wav', 'audio/wav'], ['m4a', 'audio/mp4'], ['pdf', 'application/pdf']]) {
    const assetPath = join(temporaryDirectory, `asset.${extension}`)
    await writeFile(assetPath, bytes)
    const response = await serveLocalMedia(new Request('huphe://file/asset', { method: 'HEAD' }), assetPath)
    assert.equal(response.headers.get('Content-Type'), mime, extension)
  }
  // The request URL cannot override the separately validated path supplied by the caller.
  const forwarded = await serveLocalMedia(new Request('huphe://file/%2Fnot%2Fthe%2Fselected%2Fpath'), mediaPath)
  assert.deepEqual(Buffer.from(await forwarded.arrayBuffer()), bytes)
  const cancelled = await call()
  await cancelled.body.cancel()
  console.log('Local media responses: GET/HEAD, byte ranges, MIME, errors and cancellation passed.')
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true })
}
