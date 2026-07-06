import { spawn } from 'child_process'
import { copyFile, mkdir, readdir, readFile } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'

export interface BrushProgress {
  step: number
  totalSteps: number
  loss?: number
  elapsedSec: number
}

export interface BrushResult {
  plyPath: string
}

/**
 * Brush CLI dataset layout:
 *   dataset/
 *     images/        ← kopie van frames
 *     sparse/0/      ← cameras.bin, images.bin, points3D.bin uit COLMAP
 *
 * Brush commando (pas aan als jouw versie andere flags heeft):
 *   brush <dataset_dir> --export-path <out.ply> --max-steps <n>
 *
 * Officiële Brush repo: https://github.com/ArthurBrussee/brush
 * Standaard binpad op Mac (na cargo install): ~/.cargo/bin/brush
 */
async function readPosedFrameNames(imagesBinPath: string): Promise<Set<string> | null> {
  try {
    const buf = await readFile(imagesBinPath)
    const names = new Set<string>()
    let offset = 0
    const n = Number(buf.readBigUInt64LE(offset)); offset += 8
    for (let i = 0; i < n; i++) {
      offset += 4 + 32 + 24 + 4  // image_id + qvec + tvec + cam_id
      let end = offset
      while (buf[end] !== 0) end++
      names.add(buf.slice(offset, end).toString('utf8'))
      offset = end + 1
      const npts = Number(buf.readBigUInt64LE(offset)); offset += 8
      offset += npts * 24
    }
    return names
  } catch {
    return null
  }
}

async function prepareDataset(framesDir: string, colmapDir: string, datasetDir: string): Promise<void> {
  const imagesOut = join(datasetDir, 'images')
  const sparseOut = join(datasetDir, 'sparse', '0')
  await mkdir(imagesOut, { recursive: true })
  await mkdir(sparseOut, { recursive: true })

  // Zoek COLMAP sparse output (1 heeft hogere prioriteit dan 0)
  const sparseSource = ['sparse/1', 'sparse/0', 'sparse'].map((s) => join(colmapDir, s)).find((p) => existsSync(join(p, 'images.bin')))
  if (!sparseSource) throw new Error(`Geen COLMAP sparse data gevonden in ${colmapDir}`)

  // Lees welke frame-namen een pose hebben — kopieer alleen die frames
  const posedNames = await readPosedFrameNames(join(sparseSource, 'images.bin'))
  const allFrames = (await readdir(framesDir)).filter((f) => /\.(png|jpg|jpeg)$/i.test(f))
  const frames = posedNames && posedNames.size > 0
    ? allFrames.filter((f) => posedNames.has(f))
    : allFrames
  if (frames.length === 0) throw new Error(`Geen frames met COLMAP pose gevonden in ${framesDir}`)
  await Promise.all(frames.map((f) => copyFile(join(framesDir, f), join(imagesOut, f))))
  console.log(`[brush] Dataset: ${frames.length}/${allFrames.length} frames met pose gekopieerd`)

  for (const f of ['cameras.bin', 'images.bin', 'points3D.bin']) {
    const src = join(sparseSource, f)
    if (existsSync(src)) await copyFile(src, join(sparseOut, f))
  }
}

/**
 * Zoekt de Brush binary in deze volgorde:
 * 1. Meegegeven pad (uit IPC args of env BRUSH_BIN)
 * 2. Gebundeld in de Electron app resources (productie)
 * 3. Bekende lokale installatiepaden (development)
 */
export function findBrushBinary(explicitPath?: string): string | null {
  const isWin = process.platform === 'win32'
  // Brush release binary heet 'brush_app' (underscore); cargo install maakt 'brush'
  const names = isWin ? ['brush_app.exe', 'brush.exe'] : ['brush_app', 'brush']

  const candidates: string[] = [
    explicitPath,
    process.env.BRUSH_BIN,
    // Gebundeld via electron-builder extraResources → Resources/bin/
    ...(process.resourcesPath
      ? names.map((n) => join(process.resourcesPath, 'bin', n))
      : []),
    // Lokale installatie (development)
    ...names.flatMap((n) => [
      `${process.env.HOME}/.cargo/bin/${n}`,
      `/usr/local/bin/${n}`,
      `/opt/homebrew/bin/${n}`,
    ]),
  ].filter(Boolean) as string[]

  return candidates.find((p) => existsSync(p)) ?? null
}

export async function runBrush(options: {
  framesDir: string
  colmapDir: string
  outputDir: string
  brushBinPath: string
  maxSteps?: number
  onProgress?: (p: BrushProgress) => void
  onLog?: (line: string) => void
}): Promise<BrushResult> {
  const { framesDir, colmapDir, outputDir, brushBinPath, maxSteps = 10000, onProgress, onLog } = options

  if (!existsSync(brushBinPath)) {
    throw new Error(
      `Brush binary niet gevonden op: ${brushBinPath}\n` +
      `De app zoekt ook in: ~/.cargo/bin/brush, /usr/local/bin/brush, /opt/homebrew/bin/brush\n` +
      `Installeer Brush via: https://github.com/ArthurBrussee/brush`
    )
  }

  await mkdir(outputDir, { recursive: true })
  const datasetDir = join(outputDir, 'dataset')
  await prepareDataset(framesDir, colmapDir, datasetDir)

  const startTime = Date.now()
  let lastPlyPath: string | null = null

  // Brush CLI (v0.3.0):
  //   brush <dataset_dir> --total-steps N --export-path <dir> --export-name <name>
  // --export-path is een MAP, niet een bestand.
  // --export-name ondersteunt {iter} placeholder; wij gebruiken een vaste naam.
  // Geen --with-viewer → draait headless.
  const exportDir = join(outputDir, 'export')
  const args = [
    datasetDir,
    '--total-steps', String(maxSteps),
    '--export-path', exportDir,
    '--export-name', 'splat.ply',
    '--export-every', String(maxSteps), // alleen exporteren aan het einde
  ]

  return new Promise((resolve, reject) => {
    const proc = spawn(brushBinPath, args, { cwd: outputDir })

    const handleLine = (line: string) => {
      const trimmed = line.trim()
      if (!trimmed) return
      onLog?.(trimmed)

      // Brush logt: "Step 1234/30000", "iter 1234/30000", "[00:01] 1234/30000 loss: 0.02"
      const stepMatch = trimmed.match(/(?:[Ss]tep|iter(?:ation)?)\s+(\d+)\s*\/\s*(\d+)/)
        ?? trimmed.match(/\b(\d+)\s*\/\s*(\d+)\b.*loss/i)
      if (stepMatch) {
        const step = parseInt(stepMatch[1])
        const total = parseInt(stepMatch[2])
        if (step > 0 && total > 0 && step <= total) {
          const lossMatch = trimmed.match(/loss[=:\s]+([0-9.eE+\-]+)/i)
          onProgress?.({
            step,
            totalSteps: total,
            loss: lossMatch ? parseFloat(lossMatch[1]) : undefined,
            elapsedSec: Math.round((Date.now() - startTime) / 1000),
          })
        }
      }

      // Detecteer export-pad in output
      const plyMatch = trimmed.match(/(?:export(?:ed)?|saved|wrote)[^\n]*?([/\\][^\s"']+\.ply)/i)
      if (plyMatch) lastPlyPath = plyMatch[1]
    }

    const splitLines = (buf: string, chunk: string): [string, string[]] => {
      const combined = buf + chunk
      // Brush gebruikt soms \r voor voortgang — behandel als regelscheiding
      const lines = combined.split(/[\r\n]+/)
      return [lines.pop() ?? '', lines]
    }

    let stdoutBuf = ''
    proc.stdout.on('data', (d: Buffer) => {
      const [remaining, lines] = splitLines(stdoutBuf, d.toString())
      stdoutBuf = remaining
      lines.forEach(handleLine)
    })

    let stderrBuf = ''
    proc.stderr.on('data', (d: Buffer) => {
      const [remaining, lines] = splitLines(stderrBuf, d.toString())
      stderrBuf = remaining
      lines.forEach(handleLine)
    })

    proc.on('error', (err) => {
      reject(new Error(`Brush kan niet worden gestart: ${err.message}\nPad: ${brushBinPath}`))
    })

    proc.on('close', (code) => {
      if (stdoutBuf) handleLine(stdoutBuf)
      if (stderrBuf) handleLine(stderrBuf)

      if (code !== 0 && code !== null) {
        reject(new Error(`Brush afgesloten met exitcode ${code}. Bekijk de logs voor details.`))
        return
      }

      // Zoek het gegenereerde PLY in exportDir
      const expectedPly = join(exportDir, 'splat.ply')
      const plyPath = lastPlyPath ?? (existsSync(expectedPly) ? expectedPly : null)
      if (!plyPath) {
        reject(new Error(`Brush klaar (code ${code}) maar geen .ply gevonden in ${exportDir}`))
        return
      }

      resolve({ plyPath })
    })
  })
}
