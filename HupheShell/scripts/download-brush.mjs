#!/usr/bin/env node
/**
 * Download + uitpakken van Brush binary uit GitHub releases.
 * Repo: https://github.com/ArthurBrussee/brush
 *
 * Release v0.3.0 assets:
 *   brush-app-aarch64-apple-darwin.tar.xz   (macOS Apple Silicon)
 *   brush-app-x86_64-unknown-linux-gnu.tar.xz (Linux)
 *   brush-app-x86_64-pc-windows-msvc.zip    (Windows)
 *
 * Output: build/bin/brush  (of brush.exe op Windows)
 */

import { createWriteStream, existsSync, chmodSync, mkdirSync, readdirSync, statSync, renameSync } from 'fs'
import { join, dirname } from 'path'
import { pipeline } from 'stream/promises'
import { fileURLToPath } from 'url'
import { exec } from 'child_process'
import { promisify } from 'util'
import { tmpdir } from 'os'

const execAsync = promisify(exec)
const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const BIN_DIR = join(ROOT, 'build', 'bin')
const REPO = 'ArthurBrussee/brush'
const FORCE = process.argv.includes('--force')

// Exacte asset-namen zoals ze op GitHub staan
const PLATFORM_ASSET = {
  'darwin-arm64': 'brush-app-aarch64-apple-darwin.tar.xz',
  'linux-x64':    'brush-app-x86_64-unknown-linux-gnu.tar.xz',
  'win32-x64':    'brush-app-x86_64-pc-windows-msvc.zip',
}

const platformKey = `${process.platform}-${process.arch}`
const assetName = PLATFORM_ASSET[platformKey]
const binName = process.platform === 'win32' ? 'brush.exe' : 'brush'
const binPath = join(BIN_DIR, binName)

if (!assetName) {
  console.warn(`[download-brush] Platform ${platformKey} niet ondersteund (alleen arm64 Mac, Linux x64, Windows x64).`)
  process.exit(0)
}

if (!FORCE && existsSync(binPath)) {
  console.log(`[download-brush] ✓ Binary al aanwezig: ${binPath}`)
  process.exit(0)
}

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'HupheAI-build-script',
      ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
    },
  })
  if (!res.ok) throw new Error(`GitHub API ${res.status}: ${url}`)
  return res.json()
}

async function downloadFile(url, destPath) {
  const res = await fetch(url, { headers: { 'User-Agent': 'HupheAI-build-script' }, redirect: 'follow' })
  if (!res.ok) throw new Error(`Download ${res.status}: ${url}`)
  await pipeline(res.body, createWriteStream(destPath))
}

// Zoek recursief de eerste uitvoerbare binary in een map
function findBinary(dir, name) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      const found = findBinary(full, name)
      if (found) return found
    } else if (entry === name || entry.replace(/\.exe$/, '') === name.replace(/\.exe$/, '')) {
      return full
    }
  }
  return null
}

async function main() {
  console.log(`[download-brush] Platform: ${platformKey} → ${assetName}`)

  const release = await fetchJson(`https://api.github.com/repos/${REPO}/releases/latest`)
  console.log(`[download-brush] Nieuwste release: ${release.tag_name}`)

  const asset = release.assets?.find((a) => a.name === assetName)
  if (!asset) {
    const names = (release.assets ?? []).map((a) => a.name).join('\n  ') || '(geen)'
    console.warn(`[download-brush] Asset niet gevonden. Beschikbaar:\n  ${names}`)
    process.exit(0)
  }

  const tmpDir = join(tmpdir(), `brush-download-${Date.now()}`)
  mkdirSync(tmpDir, { recursive: true })
  mkdirSync(BIN_DIR, { recursive: true })

  const archivePath = join(tmpDir, assetName)
  console.log(`[download-brush] Downloaden ${asset.size} bytes...`)
  await downloadFile(asset.browser_download_url, archivePath)

  // Uitpakken
  const extractDir = join(tmpDir, 'extracted')
  mkdirSync(extractDir, { recursive: true })

  if (assetName.endsWith('.tar.xz')) {
    await execAsync(`tar -xf "${archivePath}" -C "${extractDir}"`)
  } else if (assetName.endsWith('.zip')) {
    await execAsync(`unzip -q "${archivePath}" -d "${extractDir}"`)
  }

  // Zoek de binary in de uitgepakte map (Brush release gebruikt brush_app met underscore)
  const binaryName = process.platform === 'win32' ? 'brush_app.exe' : 'brush_app'
  const foundAt = findBinary(extractDir, binaryName)
  if (!foundAt) {
    // Toon wat er is zodat de gebruiker het handmatig kan doen
    const { stdout } = await execAsync(`find "${extractDir}" -type f`)
    console.warn(`[download-brush] Binary "${binaryName}" niet gevonden. Bestanden:\n${stdout}`)
    process.exit(0)
  }

  renameSync(foundAt, binPath)
  if (process.platform !== 'win32') chmodSync(binPath, 0o755)

  // Opruimen
  await execAsync(`rm -rf "${tmpDir}"`)

  console.log(`[download-brush] ✓ Brush geïnstalleerd: ${binPath}`)
}

main().catch((err) => {
  console.error('[download-brush] Fout:', err.message)
  process.exit(1)
})
