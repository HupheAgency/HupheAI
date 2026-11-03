import { app, dialog, ipcMain } from 'electron'
import { join } from 'node:path'
import { mkdir } from 'node:fs/promises'
import { findTimelineTools, pickTimelineEncoder, timelineExtensions } from './lib/video-timeline-media'
import { extractTimelineAudio, importTimelineSources, listTimelineProjects, parseTimelineProject, saveTimelineProject, timelineImportSchema, timelineProjectDirectory, validateOwnedAssets } from './lib/video-timeline-storage'
import { parseTimelineExportOptions, renderTimelineProject } from './lib/video-timeline-export'
import { prepareTimelineReferences } from './lib/video-timeline-references'
import { captureTimelineTransition } from './lib/video-timeline-transition'

let registered = false
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
  ipcMain.handle('timeline:export', async (_event, input: unknown, settings?: unknown) => {
    try {
      const snapshot = parseTimelineProject(input)
      await validateOwnedAssets(rootDirectory(), snapshot)
      const directory = await timelineProjectDirectory(rootDirectory(), snapshot.id)
      const exports = join(directory, 'exports')
      await mkdir(exports, { recursive: true })
      const safeName = snapshot.name.replace(/[^\p{L}\p{N} _-]/gu, '').trim().slice(0, 100) || 'film'
      const selection = await dialog.showSaveDialog({ title: 'Film exporteren', defaultPath: join(exports, `${safeName}.mp4`), filters: [{ name: 'MP4-video', extensions: ['mp4'] }] })
      if (selection.canceled || !selection.filePath) return { ok: false, canceled: true }
      return { ok: true, ...await renderTimelineProject(snapshot, { root: rootDirectory(), outputPath: selection.filePath, ...parseTimelineExportOptions(settings) }) }
    } catch (error) { return { ok: false, error: message(error) } }
  })
}
