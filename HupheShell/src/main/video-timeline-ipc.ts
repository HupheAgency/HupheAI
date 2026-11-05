import { app, dialog, ipcMain } from 'electron'
import { join, extname } from 'node:path'
import { mkdir, access, mkdtemp, writeFile, rm, copyFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { constants } from 'node:fs'
import { spawn } from 'node:child_process'
import { findTimelineTools, pickTimelineEncoder, timelineExtensions } from './lib/video-timeline-media'
import { extractTimelineAudio, importTimelineSources, listTimelineProjects, parseTimelineProject, saveTimelineProject, timelineImportSchema, timelineProjectDirectory, validateOwnedAssets } from './lib/video-timeline-storage'
import { parseTimelineExportOptions, renderTimelineProject } from './lib/video-timeline-export'
import { prepareTimelineReferences } from './lib/video-timeline-references'
import { captureTimelineTransition } from './lib/video-timeline-transition'

let registered = false

type InstallResult = { ok: boolean; reason?: 'declined' | 'failed'; error?: string }
let installing: Promise<InstallResult> | undefined

const brewCandidates = ['/opt/homebrew/bin/brew', '/usr/local/bin/brew']
async function findBrew(): Promise<string | undefined> {
  for (const candidate of brewCandidates) {
    try { await access(candidate, constants.X_OK); return candidate } catch { /* next location */ }
  }
}

function run(command: string, args: string[], env: NodeJS.ProcessEnv, minutes: number): Promise<InstallResult> {
  return new Promise(resolve => {
    const child = spawn(command, args, { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] })
    let tail = ''
    const keep = (chunk: Buffer) => { tail = (tail + chunk.toString()).slice(-1500) }
    child.stdout.on('data', keep); child.stderr.on('data', keep)
    const timer = setTimeout(() => child.kill(), minutes * 60_000)
    child.on('error', error => { clearTimeout(timer); resolve({ ok: false, reason: 'failed', error: error.message }) })
    child.on('close', code => { clearTimeout(timer); resolve(code === 0 ? { ok: true } : { ok: false, reason: 'failed', error: tail.trim().split('\n').slice(-6).join('\n') || `Installatie stopte met code ${code}` }) })
  })
}

/** Homebrew's own installer, with the Mac password asked in a normal macOS dialog (sudo's askpass hook). */
async function installHomebrew(): Promise<InstallResult> {
  const choice = await dialog.showMessageBox({
    type: 'question', buttons: ['Installeren', 'Annuleren'], defaultId: 0, cancelId: 1,
    message: 'Homebrew en FFmpeg installeren?',
    detail: 'Voor de videotimeline is FFmpeg nodig. Dat wordt geïnstalleerd met Homebrew, dat nog niet op deze Mac staat. Je Mac vraagt zo om je wachtwoord. Dit kan 10 tot 20 minuten duren; laat de app open.',
  })
  if (choice.response !== 0) return { ok: false, reason: 'declined' }
  const dir = await mkdtemp(join(tmpdir(), 'huphe-brew-'))
  try {
    const askpass = join(dir, 'askpass.sh')
    await writeFile(askpass, `#!/bin/sh\n/usr/bin/osascript -e 'text returned of (display dialog "HupheAI heeft het wachtwoord van je Mac nodig om Homebrew te installeren." default answer "" with hidden answer with title "HupheAI" with icon caution)'\n`, { mode: 0o700 })
    const response = await fetch('https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh')
    if (!response.ok) return { ok: false, reason: 'failed', error: `Homebrew downloaden mislukte (${response.status}).` }
    const script = join(dir, 'install.sh')
    await writeFile(script, await response.text(), { mode: 0o700 })
    const result = await run('/bin/bash', [script], { NONINTERACTIVE: '1', SUDO_ASKPASS: askpass, HOMEBREW_NO_ANALYTICS: '1' }, 45)
    if (!result.ok) return result
    return await findBrew() ? { ok: true } : { ok: false, reason: 'failed', error: 'Homebrew is geïnstalleerd, maar niet gevonden.' }
  } finally { await rm(dir, { recursive: true, force: true }) }
}

/** Installs FFmpeg through Homebrew, installing Homebrew first (with a confirmation and a password prompt) when it is missing. */
async function installFfmpegWithBrew(): Promise<InstallResult> {
  let brew = await findBrew()
  if (!brew) {
    const installed = await installHomebrew()
    if (!installed.ok) return installed
    brew = await findBrew()
    if (!brew) return { ok: false, reason: 'failed', error: 'Homebrew is niet gevonden na het installeren.' }
  }
  return run(brew, ['install', 'ffmpeg'], { HOMEBREW_NO_ENV_HINTS: '1', HOMEBREW_NO_INSTALL_CLEANUP: '1', HOMEBREW_NO_ANALYTICS: '1' }, 30)
}

const rootDirectory = () => process.env.HUPHE_TIMELINE_ROOT || join(app.getPath('documents'), 'HupheAI', 'Video')
const message = (error: unknown) => error instanceof Error ? error.message : String(error)

export function registerVideoTimelineIPC(): void {
  if (registered) return
  registered = true
  ipcMain.handle('timeline:tools', async () => {
    try {
      const tools = await findTimelineTools()
      const encoder = tools.ffmpeg ? await pickTimelineEncoder(tools.ffmpeg) : undefined
      return { ok: true, encoder, ffmpeg: !!tools.ffmpeg, ffprobe: !!tools.ffprobe, ffmpegPath: tools.ffmpeg, ffprobePath: tools.ffprobe }
    } catch (error) { return { ok: false, error: message(error), ffmpeg: false, ffprobe: false } }
  })
  ipcMain.handle('timeline:install-ffmpeg', async () => {
    installing ??= installFfmpegWithBrew().finally(() => { installing = undefined })
    return installing
  })
  ipcMain.handle('timeline:list', async () => {
    try { return { ok: true, ...await listTimelineProjects(rootDirectory()) } }
    catch (error) { return { ok: false, projects: [], error: message(error) } }
  })
  ipcMain.handle('timeline:save', async (_event, input: unknown) => {
    try { return { ok: true, project: await saveTimelineProject(rootDirectory(), input) } }
    catch (error) { return { ok: false, error: message(error) } }
  })
  ipcMain.handle('timeline:import', async (_event, input: unknown) => {
    try {
      const request = timelineImportSchema.parse(input)
      let sources = request.sources
      if (!sources) {
        const selection = await dialog.showOpenDialog({ title: 'Media aan de tijdlijn toevoegen', properties: ['openFile', 'multiSelections'],
          filters: [{ name: request.kind === 'video' ? 'Video' : request.kind === 'audio' ? 'Audio' : 'Afbeeldingen', extensions: timelineExtensions(request.kind) }] })
        if (selection.canceled || !selection.filePaths.length) return { ok: false, canceled: true, assets: [] }
        sources = selection.filePaths.map(src => ({ src }))
      }
      return { ok: true, assets: await importTimelineSources(rootDirectory(), request.projectId, request.kind, sources) }
    } catch (error) { return { ok: false, assets: [], error: message(error) } }
  })
  ipcMain.handle('timeline:prepare-references', async (_event, input: unknown) => {
    try {
      const references = await prepareTimelineReferences(rootDirectory(), input, async ({ buffer, contentType, fileName, accessToken }) => {
        const { initiateFalUpload, uploadFileToFalCdn } = await import('./lib/proxy')
        const { file_url, upload_url } = await initiateFalUpload({ contentType, fileName }, accessToken)
        await uploadFileToFalCdn(upload_url, buffer, contentType)
        return file_url
      })
      return { ok: true, references }
    } catch (error) { return { ok: false, error: message(error) } }
  })
  ipcMain.handle('timeline:extract-audio', async (_event, input: unknown) => {
    try { return { ok: true, asset: await extractTimelineAudio(rootDirectory(), input) } }
    catch (error) { return { ok: false, error: message(error) } }
  })
  ipcMain.handle('timeline:capture-transition', async (_event, input: unknown) => {
    try { return { ok: true, ...await captureTimelineTransition(rootDirectory(), input) } }
    catch (error) { return { ok: false, assets: [], error: message(error) } }
  })
  ipcMain.handle('timeline:save-asset', async (_event, input: unknown, assetId: unknown) => {
    try {
      const snapshot = parseTimelineProject(input)
      await validateOwnedAssets(rootDirectory(), snapshot)
      const asset = snapshot.assets.find(a => a.id === assetId)
      if (!asset) return { ok: false, error: 'Dit bestand zit niet in het project.' }
      const extension = extname(asset.path) || ''
      const base = asset.name.replace(/\.[^./\\]+$/, '').replace(/[^\p{L}\p{N} _-]/gu, '').trim().slice(0, 100) || 'media'
      const selection = await dialog.showSaveDialog({ title: 'Media opslaan', defaultPath: join(app.getPath('downloads'), `${base}${extension}`),
        filters: extension ? [{ name: 'Mediabestand', extensions: [extension.slice(1)] }] : [] })
      if (selection.canceled || !selection.filePath) return { ok: false, canceled: true }
      await copyFile(asset.path, selection.filePath)
      return { ok: true, path: selection.filePath }
    } catch (error) { return { ok: false, error: message(error) } }
  })
  ipcMain.handle('timeline:export', async (_event, input: unknown, settings?: unknown) => {
    try {
      const snapshot = parseTimelineProject(input)
      await validateOwnedAssets(rootDirectory(), snapshot)
      const directory = await timelineProjectDirectory(rootDirectory(), snapshot.id)
      const exports = join(directory, 'exports')
      await mkdir(exports, { recursive: true })
      const safeName = snapshot.name.replace(/[^\p{L}\p{N} _-]/gu, '').trim().slice(0, 100) || 'film'
      const options = parseTimelineExportOptions(settings)
      const prores = options.format === 'prores'
      const selection = await dialog.showSaveDialog({ title: 'Film exporteren', defaultPath: join(exports, `${safeName}.${prores ? 'mov' : 'mp4'}`),
        filters: prores ? [{ name: 'ProRes-video', extensions: ['mov'] }] : [{ name: 'MP4-video', extensions: ['mp4'] }] })
      if (selection.canceled || !selection.filePath) return { ok: false, canceled: true }
      return { ok: true, ...await renderTimelineProject(snapshot, { root: rootDirectory(), outputPath: selection.filePath, ...options }) }
    } catch (error) { return { ok: false, error: message(error) } }
  })
}
