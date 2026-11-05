import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { extname } from 'node:path'
import { Readable } from 'node:stream'

// Keep the existing huphe:// image, font and 3D consumers working too.
const MIME_TYPES: Record<string, string> = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml',
  '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.json': 'application/json',
  '.ply': 'application/octet-stream', '.splat': 'application/octet-stream', '.spz': 'application/octet-stream',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime', '.m4v': 'video/mp4',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf',
  '.pdf': 'application/pdf',
}

/** The caller must validate/authorize filePath before invoking this helper. */
export async function serveLocalMedia(request: Request, filePath: string): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response(null, { status: 405, headers: { Allow: 'GET, HEAD' } })
  }

  try {
    const info = await stat(filePath)
    if (!info.isFile()) return new Response(null, { status: 404 })
    const size = info.size
    const headers = new Headers({
      'Accept-Ranges': 'bytes',
      'Content-Type': MIME_TYPES[extname(filePath).toLowerCase()] ?? 'application/octet-stream',
      'Content-Length': String(size),
      'Last-Modified': info.mtime.toUTCString(),
      'Cache-Control': 'no-cache',
      // Lets the renderer read thumbnails from a <video crossOrigin="anonymous"> without tainting the canvas.
      'Access-Control-Allow-Origin': '*',
    })

    // Range applies only to GET. We intentionally don't implement multipart ranges.
    const range = request.method === 'GET' ? request.headers.get('range')?.trim() : null
    const ifRange = request.headers.get('if-range')
    const rangeAllowed = !ifRange || ifRange === headers.get('Last-Modified')
    let start = 0
    let end = size - 1
    let partial = false
    if (range && rangeAllowed && /^bytes=/i.test(range) && !range.includes(',')) {
      const match = /^bytes=(\d*)-(\d*)$/i.exec(range)
      const invalidRange = () => {
        headers.set('Content-Range', `bytes */${size}`)
        headers.set('Content-Length', '0')
        return new Response(null, { status: 416, headers })
      }
      if (!match || (!match[1] && !match[2]) || size === 0) return invalidRange()

      // BigInt avoids silently rounding a large offset from an untrusted header.
      const total = BigInt(size)
      if (!match[1]) {
        const suffix = BigInt(match[2])
        if (suffix === 0n) return invalidRange()
        start = Number(suffix >= total ? 0n : total - suffix)
      } else {
        const first = BigInt(match[1])
        const last = match[2] ? BigInt(match[2]) : total - 1n
        if (first >= total || last < first) return invalidRange()
        start = Number(first)
        end = Number(last >= total ? total - 1n : last)
      }
      partial = true
      headers.set('Content-Range', `bytes ${start}-${end}/${size}`)
      headers.set('Content-Length', String(end - start + 1))
    }

    // Unsupported units and multipart requests fall back to a complete response.
    if (request.method === 'HEAD' || size === 0) return new Response(null, { status: 200, headers })
    const stream = createReadStream(filePath, { start, end, signal: request.signal })
    const body = Readable.toWeb(stream) as ReadableStream<Uint8Array>
    return new Response(body, { status: partial ? 206 : 200, headers })
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    return new Response(null, { status: code === 'ENOENT' || code === 'ENOTDIR' ? 404 : code === 'EACCES' || code === 'EPERM' ? 403 : 500 })
  }
}
