import { app } from 'electron'
import { mkdir } from 'fs/promises'
import { join } from 'path'
import sharp from 'sharp'

let pipelineInstance: any = null
let RawImageClass: any = null
let loading = false
const MODEL_ID = 'onnx-community/depth-anything-v2-small'

async function getDepthPipeline() {
  if (pipelineInstance) return pipelineInstance
  if (loading) {
    while (loading) await new Promise((r) => setTimeout(r, 200))
    return pipelineInstance
  }
  loading = true
  try {
    const mod = await import('@huggingface/transformers')
    RawImageClass = mod.RawImage
    const cacheDir = join(app.getPath('userData'), 'models')
    await mkdir(cacheDir, { recursive: true })
    mod.env.cacheDir = cacheDir
    mod.env.allowLocalModels = true
    console.log('[depth] Loading Depth Anything V2 Small...')
    pipelineInstance = await mod.pipeline('depth-estimation', MODEL_ID, {
      device: 'cpu',
    })
    console.log('[depth] Model loaded.')
    return pipelineInstance
  } finally {
    loading = false
  }
}

export async function extractDepthMap(imageBuffer: Buffer): Promise<Buffer> {
  const estimator = await getDepthPipeline()

  const resized = await sharp(imageBuffer)
    .resize(518, 518, { fit: 'inside', withoutEnlargement: false })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  const { data, info } = resized
  const rawImage = new RawImageClass(new Uint8ClampedArray(data), info.width, info.height, info.channels)

  const result = await estimator(rawImage)
  const depthImage = result.depth

  const meta = await sharp(imageBuffer).metadata()
  const outW = meta.width ?? 1920
  const outH = meta.height ?? 1080

  if (depthImage && typeof depthImage.toSharp === 'function') {
    return await depthImage.toSharp()
      .resize(outW, outH, { fit: 'fill' })
      .png()
      .toBuffer()
  }

  if (result.predicted_depth) {
    const { data: depthData, dims } = result.predicted_depth
    const [h, w] = dims.length === 3 ? [dims[1], dims[2]] : [dims[0], dims[1]]
    const pixels = new Uint8Array(w * h)
    let min = Infinity, max = -Infinity
    for (let i = 0; i < depthData.length; i++) {
      if (depthData[i] < min) min = depthData[i]
      if (depthData[i] > max) max = depthData[i]
    }
    const range = max - min || 1
    for (let i = 0; i < depthData.length; i++) {
      pixels[i] = Math.round(((depthData[i] - min) / range) * 255)
    }
    return await sharp(Buffer.from(pixels), { raw: { width: w, height: h, channels: 1 } })
      .resize(outW, outH, { fit: 'fill' })
      .png()
      .toBuffer()
  }

  if (depthImage && depthImage.data && depthImage.width && depthImage.height) {
    const w = depthImage.width
    const h = depthImage.height
    const rawData = depthImage.data
    const channels = depthImage.channels ?? 1
    const pixels = new Uint8Array(w * h)
    if (channels === 1) {
      for (let i = 0; i < w * h; i++) pixels[i] = rawData[i]
    } else {
      for (let i = 0; i < w * h; i++) pixels[i] = rawData[i * channels]
    }
    return await sharp(Buffer.from(pixels), { raw: { width: w, height: h, channels: 1 } })
      .resize(outW, outH, { fit: 'fill' })
      .png()
      .toBuffer()
  }

  throw new Error('Unexpected depth estimation output format')
}
