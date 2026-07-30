import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { assertGlbGeometryPreserved } from '../src/main/lib/geometry-integrity'
import { projectTexture } from '../src/main/lib/texture-projector'

async function main(): Promise<void> {
  const [basePath, outputDir, ...viewArgs] = process.argv.slice(2)
  if (!basePath || !outputDir || viewArgs.length === 0) {
    throw new Error('Gebruik: texture-projector-smoke <base.glb> <output-dir> source=/origineel.png front=/pad.png left=/pad.png ...')
  }

  const parsedImages = await Promise.all(viewArgs.map(async (argument) => {
    const separator = argument.indexOf('=')
    if (separator < 1) throw new Error(`Ongeldige view: ${argument}`)
    return {
      angle: argument.slice(0, separator),
      imageBuffer: await readFile(argument.slice(separator + 1)),
    }
  }))
  const sourceImageBuffer = parsedImages.find(image => image.angle === 'source')?.imageBuffer
  const views = parsedImages.filter(image => image.angle !== 'source')
  if (views.length === 0 && sourceImageBuffer) {
    views.push({ angle: 'front', imageBuffer: sourceImageBuffer })
  }
  const glbBuffer = await readFile(basePath)
  const result = await projectTexture({
    glbBuffer,
    views,
    sourceImageBuffer,
    atlasSize: Number(process.env.ATLAS_SIZE ?? 1024),
  })
  const integrity = assertGlbGeometryPreserved(glbBuffer, result.texturedGlbBuffer)

  await mkdir(outputDir, { recursive: true })
  const writes = [
    writeFile(join(outputDir, 'textured.glb'), result.texturedGlbBuffer),
    writeFile(join(outputDir, 'atlas.png'), result.atlasBuffer),
    writeFile(join(outputDir, 'manifest.json'), JSON.stringify({ ...result.manifest, integrity }, null, 2)),
  ]
  if (result.confidenceMaskBuffer) {
    writes.push(writeFile(join(outputDir, 'confidence.png'), result.confidenceMaskBuffer))
  }
  if (result.sourceProjectionBuffer) {
    writes.push(writeFile(join(outputDir, 'source-projection.png'), result.sourceProjectionBuffer))
  }
  if (result.reconstructionBuffer) {
    writes.push(writeFile(join(outputDir, 'reconstruction.png'), result.reconstructionBuffer))
  }
  await Promise.all(writes)
  console.log(JSON.stringify({ ...result.manifest, integrity }, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
