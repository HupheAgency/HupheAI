import { ipcMain, app } from 'electron'
import { createClient } from '@supabase/supabase-js'
import { createHash } from 'crypto'
import { readFile, writeFile, mkdir } from 'fs/promises'
import { join } from 'path'

const meta = (import.meta as any).env ?? {}
const SUPABASE_URL = (meta.MAIN_VITE_SUPABASE_URL as string) || ''
const SUPABASE_ANON_KEY = (meta.MAIN_VITE_SUPABASE_KEY as string) || ''
const PRODUCT_STUDIO_FINAL_RENDER_MODEL = 'google/gemini-3.1-flash-image-preview'

function getUserClient(jwt: string) {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  })
}

async function saveAssetLocally(userId: string, projectId: string, filename: string, buffer: Buffer): Promise<string> {
  const dir = join(app.getPath('userData'), 'product-studio', userId, projectId)
  const subDir = filename.includes('/') ? join(dir, filename.substring(0, filename.lastIndexOf('/'))) : dir
  await mkdir(subDir, { recursive: true })
  const filePath = join(dir, filename)
  await writeFile(filePath, buffer)
  return `huphe://file/${encodeURIComponent(filePath)}?v=${Date.now()}`
}

async function migrateSupabaseUrlToLocal(sb: any, userId: string, projectId: string, url: string, filename: string): Promise<string> {
  if (!url.includes('supabase.co/storage/') && !url.includes('fal.media/')) return url
  try {
    const res = await fetch(url)
    if (!res.ok) return url
    const buffer = Buffer.from(await res.arrayBuffer())
    return await saveAssetLocally(userId, projectId, filename, buffer)
  } catch { return url }
}

export function registerProductStudioIPC(getJwt: () => string | null): void {
  // --- Project CRUD ---

  ipcMain.handle('product-studio:create-project', async (_e, args: {
    name: string
    outputAspectRatio?: string
    productName?: string
    productCategory?: string
    knownDimensionMm?: number
    brandName?: string
    notes?: string
  }) => {
    const jwt = getJwt()
    if (!jwt) return { ok: false, error: 'Niet ingelogd.' }
    const sb = getUserClient(jwt)

    const { data, error } = await sb
      .from('product_projects')
      .insert({
        name: args.name,
        output_aspect_ratio: args.outputAspectRatio ?? '16:9',
        product_name: args.productName,
        product_category: args.productCategory,
        known_dimension_mm: args.knownDimensionMm,
        brand_name: args.brandName,
        notes: args.notes,
      })
      .select()
      .single()

    if (error) return { ok: false, error: error.message }
    return { ok: true, project: data }
  })

  ipcMain.handle('product-studio:list-projects', async () => {
    const jwt = getJwt()
    if (!jwt) return { ok: false, error: 'Niet ingelogd.' }
    const sb = getUserClient(jwt)

    const { data, error } = await sb
      .from('product_projects')
      .select('*')
      .neq('status', 'archived')
      .order('updated_at', { ascending: false })

    if (error) return { ok: false, error: error.message }
    return { ok: true, projects: data }
  })

  ipcMain.handle('product-studio:get-project', async (_e, projectId: string) => {
    const jwt = getJwt()
    if (!jwt) return { ok: false, error: 'Niet ingelogd.' }
    const sb = getUserClient(jwt)

    const { data, error } = await sb
      .from('product_projects')
      .select('*')
      .eq('id', projectId)
      .single()

    if (error) return { ok: false, error: error.message }
    return { ok: true, project: data }
  })

  ipcMain.handle('product-studio:update-project', async (_e, projectId: string, updates: Record<string, unknown>) => {
    const jwt = getJwt()
    if (!jwt) return { ok: false, error: 'Niet ingelogd.' }
    const sb = getUserClient(jwt)

    const ALLOWED_FIELDS = new Set([
      'name', 'status', 'product_name', 'product_category',
      'known_dimension_mm', 'brand_name', 'notes', 'output_aspect_ratio', 'mode',
    ])
    const safeUpdates: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(updates)) {
      if (ALLOWED_FIELDS.has(k)) safeUpdates[k] = v
    }
    if (Object.keys(safeUpdates).length === 0) return { ok: false, error: 'Geen geldige velden.' }

    const { data, error } = await sb
      .from('product_projects')
      .update(safeUpdates)
      .eq('id', projectId)
      .select()
      .single()

    if (error) return { ok: false, error: error.message }
    return { ok: true, project: data }
  })

  // --- Upload & Source Assets ---

  ipcMain.handle('product-studio:upload-source', async (_e, args: {
    projectId: string
    fileBuffer: ArrayBuffer
    fileName: string
    mimeType: string
  }) => {
    const jwt = getJwt()
    if (!jwt) return { ok: false, error: 'Niet ingelogd.' }
    const sb = getUserClient(jwt)

    const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/webp'])
    if (!ALLOWED_MIME.has(args.mimeType)) return { ok: false, error: 'Alleen PNG, JPEG of WebP toegestaan.' }

    const ALLOWED_EXT = new Set(['png', 'jpg', 'jpeg', 'webp'])
    const rawExt = (args.fileName.split('.').pop() ?? '').toLowerCase()
    const ext = ALLOWED_EXT.has(rawExt) ? rawExt : 'png'

    const { data: { user } } = await sb.auth.getUser()
    if (!user) return { ok: false, error: 'Gebruiker niet gevonden.' }

    const url = await saveAssetLocally(user.id, args.projectId, `original.${ext}`, Buffer.from(args.fileBuffer))

    const { data: asset, error: assetError } = await sb
      .from('source_assets')
      .insert({
        project_id: args.projectId,
        type: 'original-image',
        url,
        mime_type: args.mimeType,
        provenance: 'observed',
      })
      .select()
      .single()

    if (assetError) return { ok: false, error: assetError.message }

    await sb
      .from('product_projects')
      .update({ status: 'references_pending' })
      .eq('id', args.projectId)

    return { ok: true, asset }
  })

  // --- Reference Views ---

  ipcMain.handle('product-studio:list-reference-views', async (_e, projectId: string) => {
    const jwt = getJwt()
    if (!jwt) return { ok: false, error: 'Niet ingelogd.' }
    const sb = getUserClient(jwt)

    const { data, error } = await sb
      .from('reference_views')
      .select('*')
      .eq('project_id', projectId)
      .neq('status', 'superseded')
      .order('created_at')

    if (error) return { ok: false, error: error.message }
    return { ok: true, views: data }
  })

  ipcMain.handle('product-studio:update-view-status', async (_e, viewId: string, status: string, provenance?: string) => {
    const jwt = getJwt()
    if (!jwt) return { ok: false, error: 'Niet ingelogd.' }

    const VALID_STATUSES = new Set(['draft', 'active', 'rejected', 'superseded'])
    const VALID_PROVENANCES = new Set(['observed', 'inferred', 'user-approved', 'user-edited', 'reconstructed'])
    if (!VALID_STATUSES.has(status)) return { ok: false, error: 'Ongeldige status.' }
    if (provenance && !VALID_PROVENANCES.has(provenance)) return { ok: false, error: 'Ongeldige provenance.' }

    const sb = getUserClient(jwt)
    const updates: Record<string, unknown> = { status }
    if (provenance) updates.provenance = provenance

    const { error } = await sb
      .from('reference_views')
      .update(updates)
      .eq('id', viewId)

    if (error) return { ok: false, error: error.message }
    if (status === 'active') {
      const { data: view } = await sb
        .from('reference_views')
        .select('project_id, angle')
        .eq('id', viewId)
        .maybeSingle()
      if (view?.project_id && view?.angle) {
        await sb
          .from('reference_views')
          .update({ status: 'superseded' })
          .eq('project_id', view.project_id)
          .eq('angle', view.angle)
          .in('status', ['draft', 'active'])
          .neq('id', viewId)
      }
    }
    return { ok: true }
  })

  // --- Canonical Reference Sets ---

  ipcMain.handle('product-studio:create-canonical-set', async (_e, args: {
    projectId: string
    viewIds: string[]
    coverage: 'limited-single-view' | 'partial-multiview' | 'full-multiview'
  }) => {
    const VALID_COVERAGE = new Set(['limited-single-view', 'partial-multiview', 'full-multiview'])
    if (!VALID_COVERAGE.has(args.coverage)) return { ok: false, error: 'Ongeldige coverage waarde.' }
    const jwt = getJwt()
    if (!jwt) return { ok: false, error: 'Niet ingelogd.' }
    const sb = getUserClient(jwt)

    const { data: existing } = await sb
      .from('canonical_reference_sets')
      .select('version')
      .eq('project_id', args.projectId)
      .order('version', { ascending: false })
      .limit(1)

    const nextVersion = (existing?.[0]?.version ?? 0) + 1

    if (existing?.[0]) {
      await sb
        .from('canonical_reference_sets')
        .update({ status: 'superseded' })
        .eq('project_id', args.projectId)
        .eq('status', 'approved')
    }

    const { data: { user } } = await sb.auth.getUser()

    const { data, error } = await sb
      .from('canonical_reference_sets')
      .insert({
        project_id: args.projectId,
        version: nextVersion,
        view_ids: args.viewIds,
        status: 'approved',
        coverage: args.coverage,
        approved_by: user?.id,
        approved_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (error) return { ok: false, error: error.message }
    return { ok: true, set: data }
  })

  // --- Reconstruction Versions ---

  ipcMain.handle('product-studio:list-reconstructions', async (_e, projectId: string) => {
    const jwt = getJwt()
    if (!jwt) return { ok: false, error: 'Niet ingelogd.' }
    const sb = getUserClient(jwt)

    const { data, error } = await sb
      .from('reconstruction_versions')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })

    if (error) return { ok: false, error: error.message }
    return { ok: true, reconstructions: data }
  })

  ipcMain.handle('product-studio:update-reconstruction-status', async (_e, id: string, status: string) => {
    const jwt = getJwt()
    if (!jwt) return { ok: false, error: 'Niet ingelogd.' }

    const VALID = new Set(['processing', 'review', 'approved', 'rejected', 'failed'])
    if (!VALID.has(status)) return { ok: false, error: 'Ongeldige status.' }

    const sb = getUserClient(jwt)
    const updates: Record<string, unknown> = { status }
    if (status === 'approved') updates.approved_at = new Date().toISOString()

    const { error } = await sb
      .from('reconstruction_versions')
      .update(updates)
      .eq('id', id)

    if (error) return { ok: false, error: error.message }
    return { ok: true }
  })

  // --- Studio Scene Versions ---

  ipcMain.handle('product-studio:save-scene', async (_e, args: {
    projectId: string
    reconstructionVersionId: string
    camera: Record<string, unknown>
    lights: Record<string, unknown>[]
    productTransform: Record<string, unknown>
    environment: Record<string, unknown>
    output: Record<string, unknown>
  }) => {
    const jwt = getJwt()
    if (!jwt) return { ok: false, error: 'Niet ingelogd.' }
    const sb = getUserClient(jwt)

    const { data: existing } = await sb
      .from('studio_scene_versions')
      .select('version')
      .eq('project_id', args.projectId)
      .order('version', { ascending: false })
      .limit(1)

    const nextVersion = (existing?.[0]?.version ?? 0) + 1

    const { data, error } = await sb
      .from('studio_scene_versions')
      .insert({
        project_id: args.projectId,
        reconstruction_version_id: args.reconstructionVersionId,
        camera: args.camera,
        lights: args.lights,
        product_transform: args.productTransform,
        environment: args.environment,
        output: args.output,
        version: nextVersion,
      })
      .select()
      .single()

    if (error) return { ok: false, error: error.message }
    return { ok: true, scene: data }
  })

  // --- Render Packets ---

  ipcMain.handle('product-studio:create-render-packet', async (_e, args: {
    projectId: string
    canonicalReferenceSetId: string
    reconstructionVersionId: string
    studioSceneVersionId: string
    beautyUrl: string
    objectMaskUrl?: string
    depthUrl?: string
    normalUrl?: string
    calibrationUrl?: string
    lightMapUrl?: string
    perspectiveUrl?: string
    sceneManifest?: Record<string, unknown>
  }) => {
    const jwt = getJwt()
    if (!jwt) return { ok: false, error: 'Niet ingelogd.' }
    const sb = getUserClient(jwt)

    const insert: Record<string, unknown> = {
      project_id: args.projectId,
      canonical_reference_set_id: args.canonicalReferenceSetId,
      reconstruction_version_id: args.reconstructionVersionId,
      studio_scene_version_id: args.studioSceneVersionId,
      beauty_url: args.beautyUrl,
      object_mask_url: args.objectMaskUrl,
      depth_url: args.depthUrl,
      normal_url: args.normalUrl,
    }
    if (args.sceneManifest) insert.scene_manifest = args.sceneManifest
    const auxiliaryAssetUrls: Record<string, unknown> = {}
    if (args.calibrationUrl) auxiliaryAssetUrls.calibration_url = args.calibrationUrl
    if (args.lightMapUrl) auxiliaryAssetUrls.light_map_url = args.lightMapUrl
    if (args.perspectiveUrl) auxiliaryAssetUrls.perspective_url = args.perspectiveUrl
    if (Object.keys(auxiliaryAssetUrls).length > 0) insert.auxiliary_asset_urls = auxiliaryAssetUrls

    const { data, error } = await sb
      .from('render_packets')
      .insert(insert)
      .select()
      .single()

    if (error) return { ok: false, error: error.message }
    return { ok: true, packet: data }
  })

  // --- Final Render Versions ---

  ipcMain.handle('product-studio:list-final-renders', async (_e, projectId: string) => {
    const jwt = getJwt()
    if (!jwt) return { ok: false, error: 'Niet ingelogd.' }
    const sb = getUserClient(jwt)

    const { data, error } = await sb
      .from('final_render_versions')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })

    if (error) return { ok: false, error: error.message }
    return { ok: true, renders: data }
  })

  ipcMain.handle('product-studio:update-final-render-status', async (_e, id: string, status: string) => {
    const jwt = getJwt()
    if (!jwt) return { ok: false, error: 'Niet ingelogd.' }

    const VALID = new Set(['processing', 'review', 'approved', 'rejected', 'failed'])
    if (!VALID.has(status)) return { ok: false, error: 'Ongeldige status.' }

    const sb = getUserClient(jwt)
    const updates: Record<string, unknown> = { status }
    if (status === 'approved') updates.approved_at = new Date().toISOString()

    const { error } = await sb
      .from('final_render_versions')
      .update(updates)
      .eq('id', id)

    if (error) return { ok: false, error: error.message }
    return { ok: true }
  })

  // --- Provider Runs ---

  ipcMain.handle('product-studio:get-provider-run', async (_e, runId: string) => {
    const jwt = getJwt()
    if (!jwt) return { ok: false, error: 'Niet ingelogd.' }
    const sb = getUserClient(jwt)

    const { data, error } = await sb
      .from('provider_runs')
      .select('*')
      .eq('id', runId)
      .single()

    if (error) return { ok: false, error: error.message }
    return { ok: true, run: data }
  })

  // --- Input Normalisatie ---

  ipcMain.handle('product-studio:normalize-input', async (_e, args: {
    projectId: string
    sourceAssetId: string
  }) => {
    const jwt = getJwt()
    if (!jwt) return { ok: false, error: 'Niet ingelogd.' }
    const sb = getUserClient(jwt)

    const { data: { user } } = await sb.auth.getUser()
    if (!user) return { ok: false, error: 'Gebruiker niet gevonden.' }

    const { data: source } = await sb
      .from('source_assets')
      .select('*')
      .eq('id', args.sourceAssetId)
      .single()

    if (!source) return { ok: false, error: 'Bronbestand niet gevonden.' }

    const results: Record<string, unknown> = {}

    // 1. Download origineel en bereken checksum
    const imgRes = await fetch(source.url)
    if (!imgRes.ok) return { ok: false, error: 'Kan bronbestand niet downloaden.' }
    const imgBuffer = Buffer.from(await imgRes.arrayBuffer())
    const checksum = createHash('sha256').update(imgBuffer).digest('hex')

    await sb
      .from('source_assets')
      .update({ checksum })
      .eq('id', args.sourceAssetId)

    results.checksum = checksum

    // 2. Object mask via BiRefNet (fal.ai)
    try {
      const { callFalProxy } = await import('./lib/proxy')
      const base64 = imgBuffer.toString('base64')
      const mimeType = source.mime_type || 'image/png'

      const maskResult = await callFalProxy('fal-ai/birefnet', {
        image_base64: base64,
        image_mime_type: mimeType,
      }, jwt) as any

      const falMaskUrl = maskResult?.image?.url
      if (falMaskUrl) {
        const maskRes = await fetch(falMaskUrl)
        if (!maskRes.ok) throw new Error('Kan mask niet downloaden.')
        const maskBuf = Buffer.from(await maskRes.arrayBuffer())
        const maskUrl = await saveAssetLocally(user.id, args.projectId, 'object_mask.png', maskBuf)
        const { data: maskAsset } = await sb
          .from('source_assets')
          .insert({
            project_id: args.projectId,
            type: 'object-mask',
            url: maskUrl,
            mime_type: 'image/png',
            provenance: 'observed',
          })
          .select()
          .single()

        results.objectMask = maskAsset
      }
    } catch (err: any) {
      results.maskError = err.message
    }

    // 3. Thumbnail genereren (resized naar 256px breed, opslaan in storage)
    try {
      const sharp = (await import('sharp')).default
      const thumbBuffer = await sharp(imgBuffer)
        .resize(256, undefined, { withoutEnlargement: true })
        .png()
        .toBuffer()

      const thumbMeta = await sharp(thumbBuffer).metadata()
      const thumbUrl = await saveAssetLocally(user.id, args.projectId, 'thumbnail.png', thumbBuffer)
      const { data: thumbAsset } = await sb
        .from('source_assets')
        .insert({
          project_id: args.projectId,
          type: 'thumbnail',
          url: thumbUrl,
          mime_type: 'image/png',
          width: thumbMeta.width,
          height: thumbMeta.height,
          provenance: 'observed',
        })
        .select()
        .single()
      results.thumbnail = thumbAsset
    } catch (err: any) {
      results.thumbnailError = err.message
    }

    // 4. Basic Product generatie: neutrale grijze variant zonder print/logo/tekst
    try {
      const { callOpenRouter } = await import('./lib/proxy')
      const mimeType = source.mime_type || 'image/png'
      const sharp = (await import('sharp')).default

      const resizedBuffer = await sharp(imgBuffer)
        .resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true })
        .png({ compressionLevel: 9 })
        .toBuffer()
      const sourceDataUrl = `data:${mimeType};base64,${resizedBuffer.toString('base64')}`

      const basicPrompt = [
        'Generate a new image of this exact product but as a plain, neutral version:',
        '- Keep the exact same shape, proportions, silhouette, and contours.',
        '- Remove ALL prints, logos, text, labels, patterns, and decorative elements.',
        '- Make the entire surface a uniform matte light grey (RGB ~180,180,180).',
        '- Keep clear edges and contours visible.',
        '- Use the same camera angle and framing as the input.',
        '- Place on a clean white background.',
        '- Output only the image, no text.',
      ].join('\n')

      const basicRes = await callOpenRouter({
        model: PRODUCT_STUDIO_FINAL_RENDER_MODEL,
        modalities: ['image', 'text'],
        messages: [{
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: sourceDataUrl } },
            { type: 'text', text: basicPrompt },
          ],
        }],
        stream: false,
      }, jwt)

      if (basicRes.ok) {
        const basicJson = await basicRes.json() as any
        const basicMessage = basicJson?.choices?.[0]?.message
        const basicImages: any[] = basicMessage?.images ?? []

        let basicB64: string | null = null
        let basicUrl: string | null = null
        for (const img of basicImages) {
          if (typeof img === 'string') {
            if (img.startsWith('data:')) basicUrl = img
            else basicB64 = img
            break
          }
          if (img?.b64_json) { basicB64 = img.b64_json; break }
          const u = img?.image_url?.url ?? img?.url
          if (u) { basicUrl = u; break }
        }
        if (!basicUrl && !basicB64 && Array.isArray(basicMessage?.content)) {
          for (const part of basicMessage.content) {
            if (part?.type === 'image_url') { basicUrl = part.image_url?.url; break }
          }
        }

        let basicBuffer: Buffer | null = null
        if (basicB64) {
          basicBuffer = Buffer.from(basicB64.replace(/^data:image\/\w+;base64,/, ''), 'base64')
        } else if (basicUrl?.startsWith('data:')) {
          basicBuffer = Buffer.from(basicUrl.replace(/^data:image\/\w+;base64,/, ''), 'base64')
        } else if (basicUrl) {
          const r = await fetch(basicUrl)
          if (r.ok) basicBuffer = Buffer.from(await r.arrayBuffer())
        }

        if (basicBuffer) {
          const basicUrl = await saveAssetLocally(user.id, args.projectId, 'basic_product.png', basicBuffer)
          const { data: basicAsset } = await sb
            .from('source_assets')
            .insert({
              project_id: args.projectId,
              type: 'basic-product',
              url: basicUrl,
              mime_type: 'image/png',
              provenance: 'inferred',
            })
            .select()
            .single()
          results.basicProduct = basicAsset
        }
      }
    } catch (err: any) {
      results.basicProductError = err.message
    }

    // 5. Update project status
    await sb
      .from('product_projects')
      .update({ status: 'references_pending' })
      .eq('id', args.projectId)

    return { ok: true, ...results }
  })

  // --- GLB Asset Opslag ---

  ipcMain.handle('product-studio:upload-glb', async (_e, args: {
    projectId: string
    reconstructionVersionId: string
    glbBuffer: ArrayBuffer
    fileName: string
  }) => {
    const jwt = getJwt()
    if (!jwt) return { ok: false, error: 'Niet ingelogd.' }
    const sb = getUserClient(jwt)

    const { data: { user } } = await sb.auth.getUser()
    if (!user) return { ok: false, error: 'Gebruiker niet gevonden.' }

    const meshUrl = await saveAssetLocally(user.id, args.projectId, `mesh_${args.reconstructionVersionId}.glb`, Buffer.from(args.glbBuffer))

    const { error } = await sb
      .from('reconstruction_versions')
      .update({ mesh_url: meshUrl })
      .eq('id', args.reconstructionVersionId)

    if (error) return { ok: false, error: error.message }
    return { ok: true, meshUrl }
  })

  // --- PNG Export/Download ---

  ipcMain.handle('product-studio:download-png', async (_e, args: {
    imageUrl: string
    suggestedName?: string
  }) => {
    const jwt = getJwt()
    if (!jwt) return { ok: false, error: 'Niet ingelogd.' }

    try {
      let buffer: Buffer
      if (args.imageUrl.startsWith('huphe://file/')) {
        const filePath = decodeURIComponent(args.imageUrl.replace('huphe://file/', '').split('?')[0])
        buffer = await readFile(filePath)
      } else if (args.imageUrl.startsWith('https://')) {
        const imgRes = await fetch(args.imageUrl)
        if (!imgRes.ok) return { ok: false, error: `Download mislukt: ${imgRes.status}` }
        buffer = Buffer.from(await imgRes.arrayBuffer())
      } else {
        return { ok: false, error: 'Alleen HTTPS of huphe:// URLs toegestaan.' }
      }
      const rawName = args.suggestedName ?? `HupheAI_render_${Date.now()}.png`
      const fileName = rawName.replace(/[^a-zA-Z0-9._-]/g, '_')

      const downloadsDir = app.getPath('downloads')
      const filePath = join(downloadsDir, fileName)
      if (!filePath.startsWith(downloadsDir)) return { ok: false, error: 'Ongeldig bestandspad.' }

      await writeFile(filePath, buffer)

      return { ok: true, filePath }
    } catch (err: any) {
      return { ok: false, error: err.message }
    }
  })

  // --- Render Passes Uploaden (beauty, depth, normal naar storage) ---

  ipcMain.handle('product-studio:upload-render-pass', async (_e, args: {
    projectId: string
    passType: 'beauty' | 'depth' | 'normal' | 'object-mask' | 'calibration' | 'light-map' | 'perspective'
    dataUrl: string
  }) => {
    const jwt = getJwt()
    if (!jwt) return { ok: false, error: 'Niet ingelogd.' }
    const sb = getUserClient(jwt)

    const { data: { user } } = await sb.auth.getUser()
    if (!user) return { ok: false, error: 'Gebruiker niet gevonden.' }

    const MAX_DATA_URL_SIZE = 50 * 1024 * 1024
    if (args.dataUrl.length > MAX_DATA_URL_SIZE) return { ok: false, error: 'Data URL te groot (max 50MB).' }

    const match = args.dataUrl.match(/^data:(image\/\w+);base64,(.+)$/)
    if (!match) return { ok: false, error: 'Ongeldig data URL formaat.' }

    const [, mimeType, base64] = match
    const buffer = Buffer.from(base64, 'base64')
    const ext = mimeType === 'image/jpeg' ? 'jpg' : 'png'
    const url = await saveAssetLocally(user.id, args.projectId, `${args.passType}_${Date.now()}.${ext}`, buffer)
    return { ok: true, url }
  })

  // --- Source Asset als Observed Reference View ---

  ipcMain.handle('product-studio:register-source-as-reference', async (_e, args: {
    projectId: string
    sourceAssetId: string
    angle?: 'hero' | 'front'
  }) => {
    const jwt = getJwt()
    if (!jwt) return { ok: false, error: 'Niet ingelogd.' }
    const sb = getUserClient(jwt)

    const { data: source } = await sb
      .from('source_assets')
      .select('*')
      .eq('id', args.sourceAssetId)
      .single()

    if (!source) return { ok: false, error: 'Bronbestand niet gevonden.' }

    const angle = args.angle ?? 'hero'

    const { data: view, error } = await sb
      .from('reference_views')
      .insert({
        project_id: args.projectId,
        angle,
        asset_url: source.url,
        source_asset_id: args.sourceAssetId,
        provenance: 'observed',
        status: 'active',
        version: 1,
      })
      .select()
      .single()

    if (error) return { ok: false, error: error.message }
    return { ok: true, view }
  })

  // --- Latest State (full project snapshot voor UI) ---

  ipcMain.handle('product-studio:get-latest-state', async (_e, projectId: string) => {
    const jwt = getJwt()
    if (!jwt) return { ok: false, error: 'Niet ingelogd.' }
    const sb = getUserClient(jwt)

    const [
      projectRes,
      sourceRes,
      viewsRes,
      canonicalRes,
      reconRes,
      sceneRes,
      packetRes,
      renderRes,
    ] = await Promise.all([
      sb.from('product_projects').select('*').eq('id', projectId).single(),
      sb.from('source_assets').select('*').eq('project_id', projectId).order('created_at'),
      sb.from('reference_views').select('*').eq('project_id', projectId).neq('status', 'superseded').order('created_at'),
      sb.from('canonical_reference_sets').select('*').eq('project_id', projectId).eq('status', 'approved').order('version', { ascending: false }).limit(1),
      sb.from('reconstruction_versions').select('*').eq('project_id', projectId).order('created_at', { ascending: false }).limit(1),
      sb.from('studio_scene_versions').select('*').eq('project_id', projectId).order('version', { ascending: false }).limit(1),
      sb.from('render_packets').select('*').eq('project_id', projectId).order('created_at', { ascending: false }).limit(1),
      sb.from('final_render_versions').select('*').eq('project_id', projectId).order('created_at', { ascending: false }).limit(1),
    ])

    if (projectRes.error) return { ok: false, error: projectRes.error.message }

    let latestFinalRender = renderRes.data?.[0] ?? null
    if (latestFinalRender?.provider_run_id) {
      const { data: providerRun } = await sb
        .from('provider_runs')
        .select('metadata')
        .eq('id', latestFinalRender.provider_run_id)
        .maybeSingle()
      const metadata = (providerRun?.metadata ?? {}) as Record<string, unknown>
      latestFinalRender = {
        ...latestFinalRender,
        metadata,
        scene_url: metadata.scene_url ?? null,
      }
    }

    // Migreer remote URLs (Supabase/fal) naar lokaal bij laden
    const { data: { user: authUser } } = await sb.auth.getUser()
    const userId = authUser?.id
    const sourceAssets = sourceRes.data ?? []
    const referenceViews = viewsRes.data ?? []
    const latestReconstruction = reconRes.data?.[0] ?? null
    const latestRenderPacket = packetRes.data?.[0] ?? null

    if (userId) {
      for (const sa of sourceAssets) {
        if (sa.url && !sa.url.startsWith('huphe://')) {
          const ext = sa.type === 'original-image' ? (sa.mime_type?.split('/')?.[1] ?? 'png') : 'png'
          const filename = sa.type === 'thumbnail' ? 'thumbnail.png' : sa.type === 'object-mask' ? 'object_mask.png' : sa.type === 'basic-product' ? 'basic_product.png' : `original.${ext}`
          const localUrl = await migrateSupabaseUrlToLocal(sb, userId, projectId, sa.url, filename)
          if (localUrl !== sa.url) {
            sa.url = localUrl
            await sb.from('source_assets').update({ url: localUrl }).eq('id', sa.id)
          }
        }
      }
      for (const rv of referenceViews) {
        if (rv.asset_url && !rv.asset_url.startsWith('huphe://')) {
          const localUrl = await migrateSupabaseUrlToLocal(sb, userId, projectId, rv.asset_url, `views/${rv.angle}_${rv.id}.png`)
          if (localUrl !== rv.asset_url) {
            rv.asset_url = localUrl
            await sb.from('reference_views').update({ asset_url: localUrl }).eq('id', rv.id)
          }
        }
      }
      if (latestReconstruction?.mesh_url && !latestReconstruction.mesh_url.startsWith('huphe://')) {
        const localUrl = await migrateSupabaseUrlToLocal(sb, userId, projectId, latestReconstruction.mesh_url, `mesh_${latestReconstruction.id}.glb`)
        if (localUrl !== latestReconstruction.mesh_url) {
          latestReconstruction.mesh_url = localUrl
          await sb.from('reconstruction_versions').update({ mesh_url: localUrl }).eq('id', latestReconstruction.id)
        }
      }
    }

    return {
      ok: true,
      project: projectRes.data,
      sourceAssets,
      referenceViews,
      latestCanonicalSet: canonicalRes.data?.[0] ?? null,
      latestReconstruction,
      latestScene: sceneRes.data?.[0] ?? null,
      latestRenderPacket,
      latestFinalRender,
    }
  })

  // --- Signed URL Refresh ---

  ipcMain.handle('product-studio:refresh-signed-url', async (_e, args: {
    bucket?: string
    storagePath: string
    expiresIn?: number
  }) => {
    const jwt = getJwt()
    if (!jwt) return { ok: false, error: 'Niet ingelogd.' }
    const sb = getUserClient(jwt)

    const ALLOWED_BUCKETS = new Set(['atelier-assets'])
    const bucket = args.bucket ?? 'atelier-assets'
    if (!ALLOWED_BUCKETS.has(bucket)) return { ok: false, error: 'Ongeldige bucket.' }
    const expiresIn = Math.min(args.expiresIn ?? 86400, 86400)

    const { data, error } = await sb.storage
      .from(bucket)
      .createSignedUrl(args.storagePath, expiresIn)

    if (error || !data?.signedUrl) return { ok: false, error: error?.message ?? 'Signed URL aanmaken mislukt.' }
    return { ok: true, url: data.signedUrl }
  })

  // --- Shared helpers for image loading / model calls ---

  function createImageHelpers(jwt: string) {
    let _sharp: any
    let _callOpenRouter: typeof import('./lib/proxy').callOpenRouter

    async function init() {
      _sharp = (await import('sharp')).default
      const proxy = await import('./lib/proxy')
      _callOpenRouter = proxy.callOpenRouter
    }

    async function loadImageBuffer(url: string | null | undefined, label: string, required = false): Promise<Buffer | null> {
      if (!url) { if (required) throw new Error(`${label} ontbreekt.`); return null }
      if (url.startsWith('data:image/')) {
        const match = url.match(/^data:image\/\w+;base64,(.+)$/)
        if (!match) { if (required) throw new Error(`${label} heeft een ongeldig data URL formaat.`); return null }
        return Buffer.from(match[1], 'base64')
      }
      if (url.startsWith('huphe://file/')) {
        try { return await readFile(decodeURIComponent(url.replace('huphe://file/', '').split('?')[0])) }
        catch { if (required) throw new Error(`${label} kon niet worden gelezen.`); return null }
      }
      if (!url.startsWith('https://')) { if (required) throw new Error(`${label} moet HTTPS zijn.`); return null }
      const response = await fetch(url)
      if (!response.ok) { if (required) throw new Error(`${label} kon niet worden opgehaald.`); return null }
      return Buffer.from(await response.arrayBuffer())
    }

    async function extractImageFromResponse(json: any): Promise<Buffer> {
      const message = json?.choices?.[0]?.message
      const images: any[] = message?.images ?? []
      let imgUrl: string | null = null
      let imgB64: string | null = null
      for (const img of images) {
        if (typeof img === 'string') {
          if (img.startsWith('http') || img.startsWith('data:')) imgUrl = img
          else imgB64 = img
          break
        }
        if (img?.b64_json) { imgB64 = img.b64_json; break }
        const u = img?.image_url?.url ?? img?.url
        if (u) { imgUrl = u; break }
      }
      if (!imgUrl && !imgB64 && Array.isArray(message?.content)) {
        for (const part of message.content) {
          if (part?.type === 'image_url') { imgUrl = part.image_url?.url; break }
          if (part?.type === 'image' && part?.image?.url) { imgUrl = part.image.url; break }
          if (part?.type === 'image' && part?.image?.b64_json) { imgB64 = part.image.b64_json; break }
          if (part?.type === 'image' && typeof part?.url === 'string') { imgUrl = part.url; break }
          if (part?.type === 'image' && typeof part?.b64_json === 'string') { imgB64 = part.b64_json; break }
        }
      }
      if (!imgUrl && !imgB64 && typeof message?.content === 'string') {
        const m = message.content.match(/data:image\/[a-z]+;base64,([A-Za-z0-9+/=]+)/)
        if (m) imgB64 = m[1]
      }
      if (!imgUrl && !imgB64) {
        const debugKeys = JSON.stringify({
          hasMessage: !!message, contentType: typeof message?.content,
          contentIsArray: Array.isArray(message?.content),
          contentPartTypes: Array.isArray(message?.content) ? message.content.map((p: any) => p?.type) : [],
          imagesLength: images.length,
        })
        throw new Error(`Geen afbeelding ontvangen van OpenRouter. Debug: ${debugKeys}`)
      }
      if (imgB64) return Buffer.from(imgB64.replace(/^data:image\/\w+;base64,/, ''), 'base64')
      if (imgUrl!.startsWith('data:')) return Buffer.from(imgUrl!.replace(/^data:image\/\w+;base64,/, ''), 'base64')
      const dl = await fetch(imgUrl!)
      if (!dl.ok) throw new Error(`Kan output niet downloaden: ${imgUrl!.slice(0, 80)}`)
      return Buffer.from(await dl.arrayBuffer())
    }

    async function callModel(messages: any[], modelOverride?: string): Promise<any> {
      const model = modelOverride ?? PRODUCT_STUDIO_FINAL_RENDER_MODEL
      const basePayload: any = { model, messages, stream: false, modalities: ['image', 'text'] }
      let res = await _callOpenRouter(basePayload, jwt)
      let raw = await res.text()
      if (res.status === 404 && raw.includes('output modalities: image, text')) {
        res = await _callOpenRouter({ model, modalities: ['image'], messages, stream: false }, jwt)
        raw = await res.text()
      }
      if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${raw.slice(0, 300)}`)
      try { return JSON.parse(raw) } catch { throw new Error(`Onverwacht OpenRouter antwoord: ${raw.slice(0, 200)}`) }
    }

    async function toDataUrl(buf: Buffer, maxSize = 1536): Promise<string> {
      const png = await _sharp(buf)
        .rotate()
        .resize({ width: maxSize, height: maxSize, fit: 'inside', withoutEnlargement: true })
        .png({ compressionLevel: 9 })
        .toBuffer()
      return `data:image/png;base64,${png.toString('base64')}`
    }

    return { init, loadImageBuffer, extractImageFromResponse, callModel, toDataUrl, get sharp() { return _sharp } }
  }

  // --- STAP 1: Generate Product Layer (retexturing: calibration pose + canonical skin) ---

  ipcMain.handle('product-studio:generate-product-layer', async (_e, args: {
    projectId: string
    renderPacketId: string
  }) => {
    const jwt = getJwt()
    if (!jwt) return { ok: false, error: 'Niet ingelogd.' }
    const sb = getUserClient(jwt)
    const { data: { user } } = await sb.auth.getUser()
    if (!user) return { ok: false, error: 'Gebruiker niet gevonden.' }

    const { data: packet } = await sb.from('render_packets').select('*').eq('id', args.renderPacketId).single()
    if (!packet) return { ok: false, error: 'RenderPacket niet gevonden.' }

    const { data: run, error: runError } = await sb.from('provider_runs').insert({
      project_id: args.projectId,
      provider_type: 'final-render',
      provider_name: 'openrouter',
      model_name: 'google/gemini-3.1-flash-image-preview',
      status: 'processing',
      idempotency_key: `product-layer-${args.renderPacketId}-${Date.now()}`,
    }).select().single()
    if (runError || !run) return { ok: false, error: runError?.message ?? 'Provider run aanmaken mislukt.' }

    const startTime = Date.now()
    try {
      const h = createImageHelpers(jwt)
      await h.init()

      const beautyBuffer = await h.loadImageBuffer(packet.beauty_url, 'Beauty', true)
      if (!beautyBuffer) throw new Error('Beauty render ontbreekt.')
      const auxiliaryAssetUrls = (packet.auxiliary_asset_urls ?? {}) as Record<string, unknown>
      const calibrationUrl = typeof auxiliaryAssetUrls.calibration_url === 'string' ? auxiliaryAssetUrls.calibration_url : null
      const calibrationBuffer = await h.loadImageBuffer(calibrationUrl, 'Calibration')

      const { data: sourceAssets } = await sb.from('source_assets').select('type, url').eq('project_id', args.projectId).in('type', ['original-image', 'object-mask'])
      let sourceUrl: string | null = null
      let maskUrl: string | null = null
      for (const sa of sourceAssets ?? []) {
        if (sa.type === 'original-image') sourceUrl = sa.url
        if (sa.type === 'object-mask') maskUrl = sa.url
      }

      let canonicalReferenceUrls: string[] = []
      if (packet.canonical_reference_set_id) {
        const { data: canonicalSet } = await sb.from('canonical_reference_sets').select('view_ids').eq('id', packet.canonical_reference_set_id).maybeSingle()
        const viewIds = Array.isArray(canonicalSet?.view_ids) ? canonicalSet.view_ids : []
        if (viewIds.length > 0) {
          const { data: canonicalViews } = await sb.from('reference_views').select('id, asset_url').in('id', viewIds).neq('status', 'rejected')
          const canonicalById = new Map((canonicalViews ?? []).map((view) => [view.id, view.asset_url] as const))
          canonicalReferenceUrls = viewIds.map((id) => canonicalById.get(id)).filter((url): url is string => typeof url === 'string' && url.length > 0).slice(0, 4)
        }
      }

      const activeMaskUrl = packet.object_mask_url ?? maskUrl
      const maskBuffer = await h.loadImageBuffer(activeMaskUrl, 'Object mask')

      const primaryCanonicalUrl = canonicalReferenceUrls[0] ?? sourceUrl
      const primaryCanonicalBuffer = await h.loadImageBuffer(primaryCanonicalUrl, 'Canonical')
      if (!primaryCanonicalBuffer) throw new Error('Geen canonical referentie beschikbaar.')

      const canonicalDataUrl = await h.toDataUrl(primaryCanonicalBuffer)
      const calibrationDataUrl = await h.toDataUrl(calibrationBuffer ?? beautyBuffer)
      const beautyDataUrl = await h.toDataUrl(beautyBuffer)

      const productParts: any[] = [
        {
          type: 'text',
          text: [
            'You will receive three labeled images.',
            'Output CALIBRATION with the skin/texture from CANONICAL applied. Keep the exact composition, camera angle, scale, crop, silhouette and product position from CALIBRATION. Use BEAUTY for lighting and 3D shape reference.',
            'Do not change the pose, crop, size or angle.',
          ].join('\n'),
        },
        { type: 'text', text: 'CALIBRATION — Keep this exact composition, camera angle, scale, crop, silhouette and product position:' },
        { type: 'image_url', image_url: { url: calibrationDataUrl } },
        { type: 'text', text: 'BEAUTY — Same product pose with real lighting and 3D shape:' },
        { type: 'image_url', image_url: { url: beautyDataUrl } },
        { type: 'text', text: 'CANONICAL — Use only its skin, texture, material, print and colors:' },
        { type: 'image_url', image_url: { url: canonicalDataUrl } },
      ]

      const productJson = await h.callModel([{ role: 'user', content: productParts }], 'google/gemini-3.1-flash-image-preview')
      let productLayerBuffer = await h.extractImageFromResponse(productJson)

      // Apply object mask als alpha channel
      if (maskBuffer) {
        const productMeta = await h.sharp(productLayerBuffer).metadata()
        const pw = productMeta.width ?? 1536
        const ph = productMeta.height ?? 1536
        const alphaMask = await h.sharp(maskBuffer).resize(pw, ph, { fit: 'fill' }).grayscale().threshold(32).toBuffer()
        productLayerBuffer = await h.sharp(productLayerBuffer).resize(pw, ph, { fit: 'fill' }).removeAlpha().joinChannel(alphaMask).png({ compressionLevel: 9 }).toBuffer()
      }

      const productLayerUrl = await saveAssetLocally(user.id, args.projectId, `product_layer_${run.id}.png`, productLayerBuffer)

      // Sla product_layer_url op in het render packet zodat stap 2 het kan gebruiken
      await sb.from('render_packets').update({ product_layer_url: productLayerUrl }).eq('id', args.renderPacketId)

      await sb.from('provider_runs').update({
        status: 'completed',
        latency_ms: Date.now() - startTime,
        completed_at: new Date().toISOString(),
      }).eq('id', run.id)

      return { ok: true, productLayerUrl, providerRunId: run.id }
    } catch (err: any) {
      await sb.from('provider_runs').update({
        status: 'failed', error_message: err.message,
        latency_ms: Date.now() - startTime, completed_at: new Date().toISOString(),
      }).eq('id', run.id)
      return { ok: false, error: err.message }
    }
  })

  // --- STAP 2: Generate Final Render (background + clean plate, gebruikt bestaande product layer) ---

  ipcMain.handle('product-studio:generate-final-render', async (_e, args: {
    projectId: string
    renderPacketId: string
    prompt: string
    preservationPolicy?: 'strict' | 'balanced' | 'creative'
    resolution?: '0.5K' | '1K' | '2K' | '4K'
  }) => {
    const jwt = getJwt()
    if (!jwt) return { ok: false, error: 'Niet ingelogd.' }
    const sb = getUserClient(jwt)
    const { data: { user } } = await sb.auth.getUser()
    if (!user) return { ok: false, error: 'Gebruiker niet gevonden.' }

    const { data: packet } = await sb.from('render_packets').select('*').eq('id', args.renderPacketId).single()
    if (!packet) return { ok: false, error: 'RenderPacket niet gevonden.' }

    const preservationPolicy = args.preservationPolicy ?? 'balanced'
    const resolution = args.resolution ?? '2K'

    const { data: run, error: runError } = await sb.from('provider_runs').insert({
      project_id: args.projectId,
      provider_type: 'final-render',
      provider_name: 'openrouter',
      model_name: PRODUCT_STUDIO_FINAL_RENDER_MODEL,
      status: 'processing',
      idempotency_key: `final-${args.renderPacketId}-${Date.now()}`,
    }).select().single()
    if (runError || !run) return { ok: false, error: runError?.message ?? 'Provider run aanmaken mislukt.' }

    const startTime = Date.now()
    try {
      const h = createImageHelpers(jwt)
      await h.init()

      // Laad de bestaande product layer (uit stap 1)
      const productLayerUrl = (packet as any).product_layer_url as string | null
      const productLayerBuffer = await h.loadImageBuffer(productLayerUrl, 'Product layer')
      const beautyBuffer = await h.loadImageBuffer(packet.beauty_url, 'Beauty', true)
      if (!beautyBuffer) throw new Error('Beauty render ontbreekt.')

      const inputDataUrl = productLayerBuffer
        ? await h.toDataUrl(productLayerBuffer)
        : await h.toDataUrl(beautyBuffer)

      // Camera-beschrijving uit manifest
      let cameraDescription = ''
      const manifest = packet.scene_manifest as any
      if (manifest?.camera?.position && manifest?.camera?.target) {
        const [cx, cy, cz] = manifest.camera.position as [number, number, number]
        const [tx, ty, tz] = manifest.camera.target as [number, number, number]
        const dx = cx - tx, dy = cy - ty, dz = cz - tz
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)
        const elevationDeg = Math.round(Math.asin(dy / (dist || 1)) * (180 / Math.PI))
        const azimuthDeg = Math.round(Math.atan2(dx, dz) * (180 / Math.PI))
        const verticalDesc = elevationDeg > 25 ? 'from above (bird\'s eye)' : elevationDeg > 10 ? 'slightly from above' : elevationDeg < -10 ? 'from below (low angle)' : 'at eye level'
        const horizontalDesc = Math.abs(azimuthDeg) < 15 ? 'front view' : Math.abs(azimuthDeg) > 165 ? 'rear view' : Math.abs(azimuthDeg) > 75 ? 'side view' : azimuthDeg > 0 ? 'three-quarter view from the right' : 'three-quarter view from the left'
        cameraDescription = `The product is photographed ${verticalDesc}, ${horizontalDesc} (elevation ~${elevationDeg}°, azimuth ~${azimuthDeg}°). The background MUST use exactly this same camera angle and perspective — the vanishing points, horizon line, and floor plane must match.`
      }

      // Laad perspectief-referenties (calibration + depth + perspective grid)
      const auxUrls = ((packet as any).auxiliary_asset_urls ?? {}) as Record<string, unknown>
      const calibrationUrl = typeof auxUrls.calibration_url === 'string' ? auxUrls.calibration_url : null
      const perspectiveUrl = typeof auxUrls.perspective_url === 'string' ? auxUrls.perspective_url : null
      const depthUrl = (packet as any).depth_url as string | null
      const calibrationBuffer = await h.loadImageBuffer(calibrationUrl, 'Calibration')
      const depthBuffer = await h.loadImageBuffer(depthUrl, 'Depth')
      const perspectiveBuffer = await h.loadImageBuffer(perspectiveUrl, 'Perspective')

      // Background genereren
      const backgroundParts: any[] = [
        {
          type: 'text',
          text: [
            `Place the product into a scene. Scene description: ${args.prompt}`,
            '', cameraDescription ? `CAMERA: ${cameraDescription}` : '', '',
            'You will receive labeled reference images to help you match the exact camera perspective.',
            '',
            'CRITICAL RULES:',
            '- Keep the product EXACTLY as it appears in PRODUCT_RENDER — same texture, same colors, same details, same position and size.',
            '- Do NOT alter, simplify, or re-interpret the product in any way.',
            '- Only generate the environment/background around and behind the product.',
            '- Use CALIBRATION_3D to understand the exact 3D perspective, ground plane angle, and where the product sits in space.',
            perspectiveBuffer ? '- Use PERSPECTIVE_GRID to match the floor vanishing point and perspective lines exactly.' : '',
            depthBuffer ? '- Use DEPTH_MAP to understand the spatial depth and distance relationships.' : '',
            '- The background perspective and vanishing points MUST match the product\'s camera angle exactly.',
            '- The surface/floor the product sits on must align with the product\'s ground plane — the product must look like it sits ON the surface, not floating.',
            '- Match the lighting direction of the environment to the product.',
          ].filter(Boolean).join('\n'),
        },
        { type: 'text', text: 'PRODUCT_RENDER — The product to place in the scene:' },
        { type: 'image_url', image_url: { url: inputDataUrl } },
      ]
      if (calibrationBuffer) {
        backgroundParts.push(
          { type: 'text', text: 'CALIBRATION_3D — Grey 3D mesh showing exact camera perspective, ground plane, and product position in 3D space:' },
          { type: 'image_url', image_url: { url: await h.toDataUrl(calibrationBuffer) } },
        )
      }
      if (perspectiveBuffer) {
        backgroundParts.push(
          { type: 'text', text: 'PERSPECTIVE_GRID — Green grid on the floor plane (y=0) showing exact vanishing point and perspective lines:' },
          { type: 'image_url', image_url: { url: await h.toDataUrl(perspectiveBuffer) } },
        )
      }
      if (depthBuffer) {
        backgroundParts.push(
          { type: 'text', text: 'DEPTH_MAP — Depth information showing spatial distance (darker = closer, lighter = farther):' },
          { type: 'image_url', image_url: { url: await h.toDataUrl(depthBuffer) } },
        )
      }

      const backgroundJson = await h.callModel([{ role: 'user', content: backgroundParts }])
      const outBuffer = await h.extractImageFromResponse(backgroundJson)
      const finalUrl = await saveAssetLocally(user.id, args.projectId, `final_${run.id}.png`, outBuffer)

      // Clean plate
      let bgSignedUrl: string | null = null
      try {
        const cleanPlateParts: any[] = [
          {
            type: 'text',
            text: [
              'Remove the single main/central product from FINAL_RENDER.',
              'Fill the area where the product was with a natural, seamless continuation of the background.',
              'The result should look like the product was never there.',
              'Keep everything else in the scene exactly as it is — lighting, surfaces, other objects, shadows.',
              'Output the full image at the same resolution.',
            ].join('\n'),
          },
          { type: 'text', text: 'FINAL_RENDER — The image with the product to remove:' },
          { type: 'image_url', image_url: { url: await h.toDataUrl(outBuffer) } },
        ]
        const cleanPlateJson = await h.callModel([{ role: 'user', content: cleanPlateParts }])
        const cleanPlateBuffer = await h.extractImageFromResponse(cleanPlateJson)
        bgSignedUrl = await saveAssetLocally(user.id, args.projectId, `clean_plate_${run.id}.png`, cleanPlateBuffer)
      } catch (cleanErr: any) {
        console.error('[clean-plate] Failed:', cleanErr?.message ?? cleanErr)
        bgSignedUrl = finalUrl
      }

      const { data: render, error: renderError } = await sb.from('final_render_versions').insert({
        project_id: args.projectId,
        render_packet_id: args.renderPacketId,
        provider_run_id: run.id,
        output_url: finalUrl,
        background_plate_url: bgSignedUrl,
        product_layer_url: productLayerUrl,
        composite_url: finalUrl,
        preservation_policy: preservationPolicy,
        prompt: args.prompt,
        resolution,
        status: 'review',
        layer_metadata: {
          route: 'split-product-background',
          has_background_plate: bgSignedUrl !== finalUrl,
          has_product_layer: !!productLayerUrl,
        },
      }).select().single()
      if (renderError) throw new Error(renderError.message)

      await sb.from('provider_runs').update({
        status: 'completed',
        latency_ms: Date.now() - startTime,
        completed_at: new Date().toISOString(),
      }).eq('id', run.id)

      await sb.from('product_projects').update({ status: 'render_pending' }).eq('id', args.projectId)

      return { ok: true, render, providerRunId: run.id, backgroundPlateUrl: bgSignedUrl, productLayerUrl }
    } catch (err: any) {
      await sb.from('provider_runs').update({
        status: 'failed', error_message: err.message,
        latency_ms: Date.now() - startTime, completed_at: new Date().toISOString(),
      }).eq('id', run.id)
      return { ok: false, error: err.message }
    }
  })

  // --- Generate Angle Variant (zelfde scene, andere camerahoek) ---

  ipcMain.handle('product-studio:generate-angle-variant', async (_e, args: {
    projectId: string
    renderPacketId: string
    originalFinalRenderVersionId: string
    originalPrompt: string
    originalManifest: any
    newManifest: any
    newBeautyDataUrl: string
    newCalibrationDataUrl?: string
    newPerspectiveDataUrl?: string
    newDepthDataUrl?: string
  }) => {
    const jwt = getJwt()
    if (!jwt) return { ok: false, error: 'Niet ingelogd.' }
    const sb = getUserClient(jwt)
    const { data: { user } } = await sb.auth.getUser()
    if (!user) return { ok: false, error: 'Gebruiker niet gevonden.' }

    const { data: originalRender } = await sb.from('final_render_versions').select('*').eq('id', args.originalFinalRenderVersionId).single()
    if (!originalRender) return { ok: false, error: 'Originele render niet gevonden.' }

    const { data: packet } = await sb.from('render_packets').select('*').eq('id', args.renderPacketId).single()

    const { data: run, error: runError } = await sb.from('provider_runs').insert({
      project_id: args.projectId,
      provider_type: 'angle-variant',
      provider_name: 'openrouter',
      model_name: PRODUCT_STUDIO_FINAL_RENDER_MODEL,
      status: 'processing',
      idempotency_key: `angle-${args.originalFinalRenderVersionId}-${Date.now()}`,
    }).select().single()
    if (runError || !run) return { ok: false, error: runError?.message ?? 'Provider run aanmaken mislukt.' }

    const startTime = Date.now()
    try {
      const h = createImageHelpers(jwt)
      await h.init()

      // Laad originele achtergrond (clean plate)
      const bgPlateUrl = (originalRender as any).background_plate_url as string | null
      const bgBuffer = await h.loadImageBuffer(bgPlateUrl, 'Background plate')
      if (!bgBuffer) throw new Error('Clean background plate ontbreekt van de originele render.')

      const bgDataUrl = await h.toDataUrl(bgBuffer)

      function describeCameraAngle(manifest: any): string {
        if (!manifest?.camera?.position || !manifest?.camera?.target) return ''
        const [cx, cy, cz] = manifest.camera.position
        const [tx, ty, tz] = manifest.camera.target
        const dx = cx - tx, dy = cy - ty, dz = cz - tz
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)
        const elevationDeg = Math.round(Math.asin(dy / (dist || 1)) * (180 / Math.PI))
        const azimuthDeg = Math.round(Math.atan2(dx, dz) * (180 / Math.PI))
        const verticalDesc = elevationDeg > 25 ? 'from above (bird\'s eye)' : elevationDeg > 10 ? 'slightly from above' : elevationDeg < -10 ? 'from below (low angle)' : 'at eye level'
        const horizontalDesc = Math.abs(azimuthDeg) < 15 ? 'front view' : Math.abs(azimuthDeg) > 165 ? 'rear view' : Math.abs(azimuthDeg) > 75 ? 'side view' : azimuthDeg > 0 ? 'three-quarter view from the right' : 'three-quarter view from the left'
        const fov = manifest.camera.fov ?? null
        const fovDesc = fov ? ` at FOV ${Math.round(fov)}° (${fov < 30 ? 'telephoto' : fov < 60 ? 'normal lens' : 'wide angle'})` : ''
        return `${verticalDesc}, ${horizontalDesc} (elevation ~${elevationDeg}°, azimuth ~${azimuthDeg}°${fovDesc})`
      }

      const origAngle = describeCameraAngle(args.originalManifest)
      const newAngle = describeCameraAngle(args.newManifest)

      // --- Stap 1: AI genereert de lege achtergrond vanuit de nieuwe hoek ---
      console.log('[angle-variant] Stap 1: Achtergrond genereren vanuit nieuwe hoek')
      const bgContent: any[] = [
        {
          type: 'text',
          text: [
            'ORIGINAL_BACKGROUND is a clean photograph of a room/scene with NO product in it.',
            '',
            `This background was shot ${origAngle}.`,
            `Generate this EXACT SAME room/scene from a different camera angle: ${newAngle}.`,
            '',
            `Scene description: ${args.originalPrompt}`,
            '',
            'RULES:',
            '- Output ONLY the empty room/scene — do NOT add any product or object.',
            '- Keep the same room layout, furniture, walls, floor, lighting, and color palette.',
            '- Adjust the perspective naturally for the new camera angle.',
            '- The floor vanishing point and horizon line must match the new elevation and azimuth.',
            '- Output one image at the same resolution as the input.',
          ].join('\n'),
        },
        { type: 'text', text: 'ORIGINAL_BACKGROUND — The empty room/scene from the original angle:' },
        { type: 'image_url', image_url: { url: bgDataUrl } },
      ]

      const bgResultJson = await h.callModel([{ role: 'user', content: bgContent }])
      const newBgBuffer = await h.extractImageFromResponse(bgResultJson)
      const newBgPlateUrl = await saveAssetLocally(user.id, args.projectId, `clean_plate_angle_${run.id}.png`, newBgBuffer)

      // --- Stap 2: AI genereert product layer (zelfde als Route A) ---
      console.log('[angle-variant] Stap 2: Product layer genereren vanuit nieuwe hoek')

      // Canonical reference ophalen
      let canonicalReferenceUrls: string[] = []
      if (packet?.canonical_reference_set_id) {
        const { data: canonicalSet } = await sb.from('canonical_reference_sets').select('view_ids').eq('id', packet.canonical_reference_set_id).maybeSingle()
        const viewIds = Array.isArray(canonicalSet?.view_ids) ? canonicalSet.view_ids : []
        if (viewIds.length > 0) {
          const { data: canonicalViews } = await sb.from('reference_views').select('id, asset_url').in('id', viewIds).neq('status', 'rejected')
          const canonicalById = new Map((canonicalViews ?? []).map((view) => [view.id, view.asset_url] as const))
          canonicalReferenceUrls = viewIds.map((id) => canonicalById.get(id)).filter((url): url is string => typeof url === 'string' && url.length > 0).slice(0, 4)
        }
      }
      // Fallback: originele bron-afbeelding
      let sourceUrl: string | null = null
      if (canonicalReferenceUrls.length === 0) {
        const { data: sourceAssets } = await sb.from('source_assets').select('type, url').eq('project_id', args.projectId).in('type', ['original-image'])
        sourceUrl = sourceAssets?.find((sa) => sa.type === 'original-image')?.url ?? null
      }
      const primaryCanonicalUrl = canonicalReferenceUrls[0] ?? sourceUrl
      const primaryCanonicalBuffer = await h.loadImageBuffer(primaryCanonicalUrl, 'Canonical')
      if (!primaryCanonicalBuffer) throw new Error('Geen canonical referentie beschikbaar.')

      const canonicalDataUrl = await h.toDataUrl(primaryCanonicalBuffer)
      const beautyDataUrl = await h.toDataUrl(Buffer.from(args.newBeautyDataUrl.replace(/^data:image\/\w+;base64,/, ''), 'base64'))

      let calibrationDataUrl: string
      if (args.newCalibrationDataUrl) {
        calibrationDataUrl = await h.toDataUrl(Buffer.from(args.newCalibrationDataUrl.replace(/^data:image\/\w+;base64,/, ''), 'base64'))
      } else {
        calibrationDataUrl = beautyDataUrl
      }

      const productParts: any[] = [
        {
          type: 'text',
          text: [
            'You will receive three labeled images.',
            'Output CALIBRATION with the skin/texture from CANONICAL applied. Keep the exact composition, camera angle, scale, crop, silhouette and product position from CALIBRATION. Use BEAUTY for lighting and 3D shape reference.',
            'Do not change the pose, crop, size or angle.',
          ].join('\n'),
        },
        { type: 'text', text: 'CALIBRATION — Keep this exact composition, camera angle, scale, crop, silhouette and product position:' },
        { type: 'image_url', image_url: { url: calibrationDataUrl } },
        { type: 'text', text: 'BEAUTY — Same product pose with real lighting and 3D shape:' },
        { type: 'image_url', image_url: { url: beautyDataUrl } },
        { type: 'text', text: 'CANONICAL — Use only its skin, texture, material, print and colors:' },
        { type: 'image_url', image_url: { url: canonicalDataUrl } },
      ]

      const productJson = await h.callModel([{ role: 'user', content: productParts }], 'google/gemini-3.1-flash-image-preview')
      const productLayerBuffer = await h.extractImageFromResponse(productJson)
      const productLayerUrl = await saveAssetLocally(user.id, args.projectId, `product_layer_angle_${run.id}.png`, productLayerBuffer)
      const productLayerDataUrl = await h.toDataUrl(productLayerBuffer)

      // --- Stap 3: AI plaatst product in de achtergrond (zelfde als Route A final render) ---
      console.log('[angle-variant] Stap 3: Product in achtergrond plaatsen')

      let cameraDescription = ''
      if (args.newManifest?.camera?.position && args.newManifest?.camera?.target) {
        const [cx, cy, cz] = args.newManifest.camera.position as [number, number, number]
        const [tx, ty, tz] = args.newManifest.camera.target as [number, number, number]
        const dx = cx - tx, dy = cy - ty, dz = cz - tz
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)
        const elevationDeg = Math.round(Math.asin(dy / (dist || 1)) * (180 / Math.PI))
        const azimuthDeg = Math.round(Math.atan2(dx, dz) * (180 / Math.PI))
        const verticalDesc = elevationDeg > 25 ? 'from above (bird\'s eye)' : elevationDeg > 10 ? 'slightly from above' : elevationDeg < -10 ? 'from below (low angle)' : 'at eye level'
        const horizontalDesc = Math.abs(azimuthDeg) < 15 ? 'front view' : Math.abs(azimuthDeg) > 165 ? 'rear view' : Math.abs(azimuthDeg) > 75 ? 'side view' : azimuthDeg > 0 ? 'three-quarter view from the right' : 'three-quarter view from the left'
        cameraDescription = `The product is photographed ${verticalDesc}, ${horizontalDesc} (elevation ~${elevationDeg}°, azimuth ~${azimuthDeg}°). The background MUST use exactly this same camera angle and perspective — the vanishing points, horizon line, and floor plane must match.`
      }

      // Originele eindbeeld laden als schaalreferentie
      const originalFinalUrl = (originalRender as any).output_url as string | null
      const originalFinalBuffer = await h.loadImageBuffer(originalFinalUrl, 'Original final render')
      let originalFinalDataUrl: string | null = null
      if (originalFinalBuffer) {
        originalFinalDataUrl = await h.toDataUrl(originalFinalBuffer)
      }

      // Perspective referenties voorbereiden
      let perspectiveDataUrl: string | null = null
      let depthDataUrl: string | null = null
      if (args.newPerspectiveDataUrl) {
        perspectiveDataUrl = await h.toDataUrl(Buffer.from(args.newPerspectiveDataUrl.replace(/^data:image\/\w+;base64,/, ''), 'base64'))
      }
      if (args.newDepthDataUrl) {
        depthDataUrl = await h.toDataUrl(Buffer.from(args.newDepthDataUrl.replace(/^data:image\/\w+;base64,/, ''), 'base64'))
      }

      const finalParts: any[] = [
        {
          type: 'text',
          text: [
            'Generate a new camera angle of the same product in the same room.',
            '',
            'You will receive labeled reference images.',
            '', cameraDescription ? `CAMERA: ${cameraDescription}` : '', '',
            'ORIGINAL_SCENE shows the product in the room from the original angle. Use it to understand:',
            '- The REAL SIZE of the product relative to the furniture (counter, shelves, etc.)',
            '- How the product sits on the surface',
            '- The room layout and style',
            '',
            'CRITICAL SIZE RULE:',
            '- The product must be the SAME REAL-WORLD SIZE as in ORIGINAL_SCENE.',
            '- If the product sits on a counter in ORIGINAL_SCENE, it must sit on that same counter from the new angle too.',
            '- CALIBRATION_3D shows the exact camera angle and product placement for the new view.',
            '',
            'OTHER RULES:',
            '- Apply the texture/appearance from PRODUCT_RENDER.',
            '- Use BACKGROUND_SCENE as the environment from the new angle.',
            perspectiveDataUrl ? '- Use PERSPECTIVE_GRID to match the floor vanishing point and perspective lines exactly.' : '',
            depthDataUrl ? '- Use DEPTH_MAP to understand the spatial depth and distance relationships.' : '',
            '- The product must look like it sits ON the surface, not floating.',
            '- Match the lighting direction of the environment to the product.',
            '- Output one final photorealistic image.',
          ].filter(Boolean).join('\n'),
        },
      ]
      if (originalFinalDataUrl) {
        finalParts.push(
          { type: 'text', text: 'ORIGINAL_SCENE — The product in the room from the original angle. Use this to understand the REAL SIZE of the product relative to the furniture:' },
          { type: 'image_url', image_url: { url: originalFinalDataUrl } },
        )
      }
      finalParts.push(
        { type: 'text', text: 'CALIBRATION_3D — Grey 3D mesh showing the exact camera angle and product placement for the new view:' },
        { type: 'image_url', image_url: { url: calibrationDataUrl } },
        { type: 'text', text: 'PRODUCT_RENDER — The product texture/appearance to apply:' },
        { type: 'image_url', image_url: { url: productLayerDataUrl } },
        { type: 'text', text: 'BACKGROUND_SCENE — The empty room/scene from the new angle:' },
        { type: 'image_url', image_url: { url: await h.toDataUrl(newBgBuffer) } },
      )
      if (perspectiveDataUrl) {
        finalParts.push(
          { type: 'text', text: 'PERSPECTIVE_GRID — Green grid on the floor plane (y=0) showing exact vanishing point and perspective lines:' },
          { type: 'image_url', image_url: { url: perspectiveDataUrl } },
        )
      }
      if (depthDataUrl) {
        finalParts.push(
          { type: 'text', text: 'DEPTH_MAP — Depth information showing spatial distance (darker = closer, lighter = farther):' },
          { type: 'image_url', image_url: { url: depthDataUrl } },
        )
      }

      const finalJson = await h.callModel([{ role: 'user', content: finalParts }])
      const finalBuffer = await h.extractImageFromResponse(finalJson)
      const finalUrl = await saveAssetLocally(user.id, args.projectId, `angle_${run.id}.png`, finalBuffer)

      const { data: render, error: renderError } = await sb.from('final_render_versions').insert({
        project_id: args.projectId,
        render_packet_id: args.renderPacketId,
        provider_run_id: run.id,
        output_url: finalUrl,
        background_plate_url: newBgPlateUrl,
        product_layer_url: productLayerUrl,
        composite_url: finalUrl,
        preservation_policy: (originalRender as any).preservation_policy ?? 'balanced',
        prompt: args.originalPrompt,
        resolution: (originalRender as any).resolution ?? '2K',
        status: 'review',
        layer_metadata: {
          route: 'angle-variant',
          original_final_render_id: args.originalFinalRenderVersionId,
          original_angle: origAngle,
          new_angle: newAngle,
          has_background_plate: true,
          has_product_layer: true,
        },
      }).select().single()
      if (renderError) throw new Error(renderError.message)

      await sb.from('provider_runs').update({
        status: 'completed',
        latency_ms: Date.now() - startTime,
        completed_at: new Date().toISOString(),
      }).eq('id', run.id)

      return { ok: true, render, providerRunId: run.id, backgroundPlateUrl: newBgPlateUrl }
    } catch (err: any) {
      await sb.from('provider_runs').update({
        status: 'failed', error_message: err.message,
        latency_ms: Date.now() - startTime, completed_at: new Date().toISOString(),
      }).eq('id', run.id)
      return { ok: false, error: err.message }
    }
  })

  // --- Generate Clean Plate (verwijder product uit composite) ---

  ipcMain.handle('product-studio:generate-clean-plate', async (_e, args: {
    projectId: string
    finalRenderVersionId: string
  }) => {
    const jwt = getJwt()
    if (!jwt) return { ok: false, error: 'Niet ingelogd.' }
    const sb = getUserClient(jwt)
    const { data: { user } } = await sb.auth.getUser()
    if (!user) return { ok: false, error: 'Gebruiker niet gevonden.' }

    const { data: frv } = await sb
      .from('final_render_versions')
      .select('*')
      .eq('id', args.finalRenderVersionId)
      .single()
    if (!frv) return { ok: false, error: 'FinalRenderVersion niet gevonden.' }

    const { data: run, error: runError } = await sb
      .from('provider_runs')
      .insert({
        project_id: args.projectId,
        provider_type: 'final-render',
        provider_name: 'openrouter',
        model_name: PRODUCT_STUDIO_FINAL_RENDER_MODEL,
        status: 'processing',
        idempotency_key: `clean-plate-${args.finalRenderVersionId}-${Date.now()}`,
      })
      .select()
      .single()
    if (runError || !run) return { ok: false, error: runError?.message ?? 'Provider run aanmaken mislukt.' }

    const startTime = Date.now()
    try {
      const sharp = (await import('sharp')).default
      const { callOpenRouter } = await import('./lib/proxy')

      async function loadBuf(url: string | null | undefined): Promise<Buffer | null> {
        if (!url) return null
        if (url.startsWith('huphe://file/')) {
          try { return await readFile(decodeURIComponent(url.replace('huphe://file/', '').split('?')[0])) } catch { return null }
        }
        if (url.startsWith('https://')) {
          const r = await fetch(url); return r.ok ? Buffer.from(await r.arrayBuffer()) : null
        }
        return null
      }

      const compositeBuffer = await loadBuf(frv.output_url ?? frv.composite_url)
      if (!compositeBuffer) throw new Error('Composite afbeelding niet gevonden.')

      // Zoek object mask
      const { data: sourceAssets } = await sb
        .from('source_assets')
        .select('type, url')
        .eq('project_id', args.projectId)
        .eq('type', 'object-mask')
      const maskUrl = sourceAssets?.[0]?.url ?? null
      const maskBuffer = await loadBuf(maskUrl)

      async function toDataUrl(buf: Buffer, maxSize = 1536): Promise<string> {
        const png = await sharp(buf)
          .resize({ width: maxSize, height: maxSize, fit: 'inside', withoutEnlargement: true })
          .png({ compressionLevel: 9 })
          .toBuffer()
        return `data:image/png;base64,${png.toString('base64')}`
      }

      const parts: any[] = [
        {
          type: 'text',
          text: [
            'Remove the main product from this image and fill the area with a natural continuation of the background.',
            'The result should look like the product was never there — seamless inpainting.',
            'Keep the rest of the scene (lighting, surfaces, objects in background) exactly as they are.',
          ].join('\n'),
        },
        { type: 'image_url', image_url: { url: await toDataUrl(compositeBuffer) } },
      ]
      if (maskBuffer) {
        parts.push({
          type: 'text',
          text: 'The white area in this mask shows exactly where the product is. Remove only what is inside the white mask area.',
        })
        parts.push({ type: 'image_url', image_url: { url: await toDataUrl(maskBuffer) } })
      }

      let res = await callOpenRouter({
        model: PRODUCT_STUDIO_FINAL_RENDER_MODEL,
        modalities: ['image', 'text'],
        messages: [{ role: 'user', content: parts }],
        stream: false,
      }, jwt)
      let raw = await res.text()
      if (res.status === 404 && raw.includes('output modalities: image, text')) {
        res = await callOpenRouter({
          model: PRODUCT_STUDIO_FINAL_RENDER_MODEL,
          modalities: ['image'],
          messages: [{ role: 'user', content: parts }],
          stream: false,
        }, jwt)
        raw = await res.text()
      }
      if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${raw.slice(0, 300)}`)

      const json = JSON.parse(raw)
      const msg = json?.choices?.[0]?.message
      let cleanPlateBuffer: Buffer | null = null
      const images: any[] = msg?.images ?? []
      for (const img of images) {
        if (typeof img === 'string') {
          if (img.startsWith('data:')) { const m = img.match(/;base64,(.+)$/); if (m) cleanPlateBuffer = Buffer.from(m[1], 'base64') }
          else cleanPlateBuffer = Buffer.from(img, 'base64')
          break
        }
        if (img?.b64_json) { cleanPlateBuffer = Buffer.from(img.b64_json, 'base64'); break }
        const u = img?.image_url?.url ?? img?.url
        if (u?.startsWith('data:')) { const m = u.match(/;base64,(.+)$/); if (m) cleanPlateBuffer = Buffer.from(m[1], 'base64') }
      }
      if (!cleanPlateBuffer && typeof msg?.content === 'string') {
        const m = msg.content.match(/data:image\/\w+;base64,([A-Za-z0-9+/=]+)/)
        if (m) cleanPlateBuffer = Buffer.from(m[1], 'base64')
      }
      if (!cleanPlateBuffer) throw new Error('Geen clean plate afbeelding ontvangen.')

      const cleanPlateUrl = await saveAssetLocally(user.id, args.projectId, `clean_plate_${args.finalRenderVersionId}.png`, cleanPlateBuffer)

      await sb.from('final_render_versions').update({ background_plate_url: cleanPlateUrl }).eq('id', args.finalRenderVersionId)

      await sb.from('provider_runs').update({
        status: 'completed',
        latency_ms: Date.now() - startTime,
        completed_at: new Date().toISOString(),
      }).eq('id', run.id)

      return { ok: true, cleanPlateUrl, providerRunId: run.id }
    } catch (err: any) {
      await sb.from('provider_runs').update({
        status: 'failed',
        error_message: err.message,
        latency_ms: Date.now() - startTime,
        completed_at: new Date().toISOString(),
      }).eq('id', run.id)
      return { ok: false, error: err.message }
    }
  })

  // --- Reference View Generation (Nano Banana 2 / Gemini) ---

  ipcMain.handle('product-studio:generate-reference-views', async (_e, args: {
    projectId: string
    sourceAssetId: string
    targetViews: Array<'left' | 'right' | 'rear' | 'top'>
    productNotes?: string
  }) => {
    const jwt = getJwt()
    if (!jwt) return { ok: false, error: 'Niet ingelogd.' }
    const sb = getUserClient(jwt)

    const { data: source } = await sb
      .from('source_assets')
      .select('*')
      .eq('id', args.sourceAssetId)
      .single()

    if (!source) return { ok: false, error: 'Bronbestand niet gevonden.' }

    // Provider run aanmaken
    const { data: run, error: runError } = await sb
      .from('provider_runs')
      .insert({
        project_id: args.projectId,
        provider_type: 'reference-view',
        provider_name: 'fal',
        model_name: 'fal-ai/nano-banana-2/edit',
        status: 'processing',
        idempotency_key: `refview-${args.projectId}-${Date.now()}`,
      })
      .select()
      .single()

    if (runError) return { ok: false, error: runError.message }

    const startTime = Date.now()
    const views: Array<{ angle: string; assetUrl: string; viewId: string }> = []

    try {
      const { callFalProxy } = await import('./lib/proxy')

      const sourceUrl = source.url
      if (!sourceUrl) throw new Error('Bronbestand heeft geen URL.')

      const angleDescriptions: Record<string, string> = {
        left: [
          'LEFT side profile view of the exact same product',
          'rotate the product 90 degrees clockwise from the original front view so the product left side is visible',
          'do not mirror the front image and do not reuse the right side',
        ].join('; '),
        right: [
          'RIGHT side profile view of the exact same product',
          'rotate the product 90 degrees counter-clockwise from the original front view so the product right side is visible',
          'do not mirror the front image and do not reuse the left side',
        ].join('; '),
        rear: [
          'BACK/rear view of the exact same product',
          'rotate the product 180 degrees from the original front view',
          'show the true back-facing print/material layout, not the front printed again',
        ].join('; '),
        top: 'TOP-DOWN view from directly above the exact same product; preserve the rim/opening/cap geometry and material',
      }

      for (const angle of args.targetViews) {
        const { data: existingView } = await sb
          .from('reference_views')
          .select('id')
          .eq('project_id', args.projectId)
          .eq('angle', angle)
          .in('status', ['draft', 'active'])
          .limit(1)
          .maybeSingle()
        if (existingView) continue

        const productContext = args.productNotes ? ` The product is: ${args.productNotes}.` : ''
        const prompt = [
          `Generate a ${angleDescriptions[angle]}.`,
          'Keep the same product identity: same colors, materials, textures, print, logos, labels, scale, and proportions.',
          'This is a canonical product reference view, not a beauty shot.',
          'Use orthographic/product-photography framing on a clean white background with the full product visible.',
          'Keep lighting neutral and consistent.',
          'No other objects.',
          productContext.trim(),
        ].filter(Boolean).join(' ')

        const result = await callFalProxy('fal-ai/nano-banana-2/edit', {
          image_urls: [sourceUrl],
          prompt,
          num_images: 1,
          aspect_ratio: '1:1',
          resolution: '1K',
        }, jwt) as any

        const falImageUrl = result?.images?.[0]?.url
        if (!falImageUrl) continue

        // Download van fal en sla lokaal op
        const { data: { user: authUser } } = await sb.auth.getUser()
        if (!authUser) continue
        const imgRes = await fetch(falImageUrl)
        if (!imgRes.ok) continue
        const imgBuf = Buffer.from(await imgRes.arrayBuffer())
        const imageUrl = await saveAssetLocally(authUser.id, args.projectId, `views/${angle}_${Date.now()}.png`, imgBuf)

        // Reference view opslaan
        const { data: view } = await sb
          .from('reference_views')
          .insert({
            project_id: args.projectId,
            angle,
            asset_url: imageUrl,
            source_asset_id: args.sourceAssetId,
            provider_run_id: run.id,
            provenance: 'inferred',
            status: 'draft',
            version: 1,
          })
          .select()
          .single()

        if (view) {
          await sb
            .from('reference_views')
            .update({ status: 'superseded' })
            .eq('project_id', args.projectId)
            .eq('angle', angle)
            .in('status', ['draft', 'active'])
            .neq('id', view.id)
          views.push({ angle, assetUrl: imageUrl, viewId: view.id })
        }
      }

      // Provider run updaten
      await sb
        .from('provider_runs')
        .update({
          status: 'completed',
          latency_ms: Date.now() - startTime,
          completed_at: new Date().toISOString(),
        })
        .eq('id', run.id)

      // Project status updaten
      await sb
        .from('product_projects')
        .update({ status: 'references_review' })
        .eq('id', args.projectId)

      return { ok: true, views, providerRunId: run.id }
    } catch (err: any) {
      await sb
        .from('provider_runs')
        .update({
          status: 'failed',
          error_message: err.message,
          latency_ms: Date.now() - startTime,
          completed_at: new Date().toISOString(),
        })
        .eq('id', run.id)

      return { ok: false, error: err.message }
    }
  })

  // --- 3D Reconstruction via TRELLIS 2 ---

  ipcMain.handle('product-studio:start-reconstruction', async (_e, args: {
    projectId: string
    canonicalReferenceSetId: string
    primaryImageUrl: string
    route?: 'single-view' | 'multi-view' | 'primitive-proxy'
    seed?: number
  }) => {
    const jwt = getJwt()
    if (!jwt) return { ok: false, error: 'Niet ingelogd.' }
    const sb = getUserClient(jwt)

    if (args.primaryImageUrl && !args.primaryImageUrl.startsWith('https://') && !args.primaryImageUrl.startsWith('huphe://file/')) {
      return { ok: false, error: 'Primary image URL moet HTTPS of huphe:// zijn.' }
    }

    const { data: { user } } = await sb.auth.getUser()
    if (!user) return { ok: false, error: 'Gebruiker niet gevonden.' }

    const route = args.route ?? 'single-view'

    // Primitive proxy: geen AI call nodig
    if (route === 'primitive-proxy') {
      const { data: recon, error } = await sb
        .from('reconstruction_versions')
        .insert({
          project_id: args.projectId,
          canonical_reference_set_id: args.canonicalReferenceSetId,
          route: 'primitive-proxy',
          status: 'review',
        })
        .select()
        .single()

      if (error) return { ok: false, error: error.message }

      await sb
        .from('product_projects')
        .update({ status: 'mesh_review' })
        .eq('id', args.projectId)

      return { ok: true, reconstruction: recon }
    }

    const { data: basicProduct } = await sb
      .from('source_assets')
      .select('url')
      .eq('project_id', args.projectId)
      .eq('type', 'basic-product')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!basicProduct?.url) {
      return { ok: false, error: 'Basic shape ontbreekt. TRELLIS reconstructie gebruikt alleen de grijze Basic Product, niet de bronfoto of print-views.' }
    }

    const reconstructionImageUrl = basicProduct.url

    // Provider run aanmaken
    const { data: run, error: runError } = await sb
      .from('provider_runs')
      .insert({
        project_id: args.projectId,
        provider_type: 'reconstruction',
        provider_name: 'fal',
        model_name: 'fal-ai/trellis-2',
        status: 'processing',
        idempotency_key: `recon-${args.projectId}-${Date.now()}`,
      })
      .select()
      .single()

    if (runError) return { ok: false, error: runError.message }

    const startTime = Date.now()

    try {
      const { callFalProxy } = await import('./lib/proxy')

      // Download Basic Product voor base64. Gebruik hier nooit source/canonical print-views.
      const imgRes = await fetch(reconstructionImageUrl)
      if (!imgRes.ok) throw new Error('Kan referentiebeeld niet downloaden.')
      const imgBuffer = Buffer.from(await imgRes.arrayBuffer())
      const base64 = imgBuffer.toString('base64')
      const mimeType = 'image/png'

      const result = await callFalProxy('fal-ai/trellis-2', {
        image_base64: base64,
        image_mime_type: mimeType,
        ...(args.seed != null ? { seed: args.seed } : {}),
      }, jwt) as any

      const glbUrl = result?.model_glb?.url
      if (!glbUrl) throw new Error('Geen GLB ontvangen van TRELLIS 2.')

      // GLB downloaden en opslaan in eigen storage
      const glbRes = await fetch(glbUrl)
      if (!glbRes.ok) throw new Error('Kan GLB niet downloaden.')
      const glbBuffer = Buffer.from(await glbRes.arrayBuffer())

      const meshUrl = await saveAssetLocally(user.id, args.projectId, `mesh_${run.id}.glb`, glbBuffer)

      // Reconstruction version opslaan
      const { data: recon, error: reconError } = await sb
        .from('reconstruction_versions')
        .insert({
          project_id: args.projectId,
          canonical_reference_set_id: args.canonicalReferenceSetId,
          provider_run_id: run.id,
          route,
          mesh_url: meshUrl,
          status: 'review',
          seed: args.seed,
        })
        .select()
        .single()

      if (reconError) throw new Error(reconError.message)

      // Provider run updaten
      await sb
        .from('provider_runs')
        .update({
          status: 'completed',
          latency_ms: Date.now() - startTime,
          completed_at: new Date().toISOString(),
        })
        .eq('id', run.id)

      // Project status updaten
      await sb
        .from('product_projects')
        .update({ status: 'mesh_review' })
        .eq('id', args.projectId)

      return { ok: true, reconstruction: recon, providerRunId: run.id }
    } catch (err: any) {
      await sb
        .from('provider_runs')
        .update({
          status: 'failed',
          error_message: err.message,
          latency_ms: Date.now() - startTime,
          completed_at: new Date().toISOString(),
        })
        .eq('id', run.id)

      return { ok: false, error: err.message }
    }
  })

  // --- Textured Mesh ---

  ipcMain.handle('product-studio:create-textured-mesh', async (_e, args: {
    projectId: string
    reconstructionVersionId: string
    sourceViewIds?: string[]
  }) => {
    const jwt = getJwt()
    if (!jwt) return { ok: false, error: 'Niet ingelogd.' }
    const sb = getUserClient(jwt)

    const { data: { user } } = await sb.auth.getUser()
    if (!user) return { ok: false, error: 'Gebruiker niet gevonden.' }

    const { data: recon } = await sb
      .from('reconstruction_versions')
      .select('*')
      .eq('id', args.reconstructionVersionId)
      .single()

    if (!recon) return { ok: false, error: 'Reconstruction niet gevonden.' }
    if (!recon.mesh_url) return { ok: false, error: 'Geen mesh beschikbaar om te texturen.' }

    const viewIds = args.sourceViewIds ?? []

    await sb
      .from('reconstruction_versions')
      .update({
        texture_status: 'processing',
        texture_error: null,
        texture_source_view_ids: viewIds,
      })
      .eq('id', args.reconstructionVersionId)

    const startTime = Date.now()

    try {
      console.log('[create-textured-mesh] Start voor recon:', args.reconstructionVersionId)
      const { projectTexture } = await import('./lib/texture-projector')

      console.log('[create-textured-mesh] Downloading mesh:', recon.mesh_url?.slice(0, 80))
      const glbRes = await fetch(recon.mesh_url)
      if (!glbRes.ok) throw new Error(`Kan mesh niet downloaden: ${glbRes.status}`)
      const glbBuffer = Buffer.from(await glbRes.arrayBuffer())
      console.log('[create-textured-mesh] Mesh downloaded:', glbBuffer.length, 'bytes')

      let viewImages: Array<{ angle: string; imageBuffer: Buffer }> = []

      if (viewIds.length > 0) {
        const { data: views } = await sb
          .from('reference_views')
          .select('id, angle, asset_url')
          .in('id', viewIds)
          .neq('status', 'rejected')
        for (const v of views ?? []) {
          if (!v.asset_url) continue
          const imgRes = await fetch(v.asset_url)
          if (!imgRes.ok) continue
          viewImages.push({
            angle: v.angle ?? 'front',
            imageBuffer: Buffer.from(await imgRes.arrayBuffer()),
          })
        }
      }

      if (viewImages.length === 0) {
        const { data: allViews } = await sb
          .from('reference_views')
          .select('id, angle, asset_url')
          .eq('project_id', args.projectId)
          .in('status', ['active', 'draft'])
          .order('created_at')
        for (const v of allViews ?? []) {
          if (!v.asset_url) continue
          const imgRes = await fetch(v.asset_url)
          if (!imgRes.ok) continue
          viewImages.push({
            angle: v.angle ?? 'front',
            imageBuffer: Buffer.from(await imgRes.arrayBuffer()),
          })
        }
      }

      if (viewImages.length === 0) {
        const { data: sourceAssets } = await sb
          .from('source_assets')
          .select('url')
          .eq('project_id', args.projectId)
          .eq('type', 'original-image')
          .limit(1)
          .maybeSingle()
        if (sourceAssets?.url) {
          const imgRes = await fetch(sourceAssets.url)
          if (imgRes.ok) {
            viewImages.push({
              angle: 'front',
              imageBuffer: Buffer.from(await imgRes.arrayBuffer()),
            })
          }
        }
      }

      if (viewImages.length === 0) throw new Error('Geen referentiebeelden beschikbaar voor texture wrapping.')

      const result = await projectTexture({
        glbBuffer,
        views: viewImages,
        atlasSize: 1024,
      })

      const textureDir = join(
        app.getPath('userData'),
        'product-studio',
        user.id,
        args.projectId,
        'textures',
      )
      await mkdir(textureDir, { recursive: true })

      const meshPath = join(textureDir, `textured_mesh_${args.reconstructionVersionId}.glb`)
      const atlasPath = join(textureDir, `texture_atlas_${args.reconstructionVersionId}.png`)
      const manifestPath = join(textureDir, `material_manifest_${args.reconstructionVersionId}.json`)
      const runVersion = Date.now()
      const toHupheFileUrl = (filePath: string) => `huphe://file/${encodeURIComponent(filePath)}?v=${runVersion}`
      const texturedMeshUrl = toHupheFileUrl(meshPath)
      const textureAtlasUrl = toHupheFileUrl(atlasPath)
      const materialManifest = {
        ...result.manifest,
        storage: 'local',
        textured_mesh_path: meshPath,
        texture_atlas_path: atlasPath,
        material_manifest_path: manifestPath,
      }

      console.log('[create-textured-mesh] Writing local texture output:', textureDir)
      await Promise.all([
        writeFile(meshPath, result.texturedGlbBuffer),
        writeFile(atlasPath, result.atlasBuffer),
        writeFile(manifestPath, JSON.stringify(materialManifest, null, 2)),
      ])
      console.log('[create-textured-mesh] Local texture output written')

      await sb
        .from('reconstruction_versions')
        .update({
          texture_status: 'completed',
          texture_error: null,
          textured_mesh_url: texturedMeshUrl,
          texture_atlas_url: textureAtlasUrl,
          material_manifest: materialManifest,
        })
        .eq('id', args.reconstructionVersionId)
      console.log('[create-textured-mesh] DB updated. Done in', Date.now() - startTime, 'ms')

      return {
        ok: true,
        reconstructionVersionId: args.reconstructionVersionId,
        texturedMeshUrl,
        textureAtlasUrl,
        manifest: materialManifest,
        latencyMs: Date.now() - startTime,
      }
    } catch (err: any) {
      await sb
        .from('reconstruction_versions')
        .update({
          texture_status: 'failed',
          texture_error: err.message,
        })
        .eq('id', args.reconstructionVersionId)

      return { ok: false, error: err.message }
    }
  })

  ipcMain.handle('product-studio:apply-debug-texture', async (_e, args: {
    projectId: string
    reconstructionVersionId: string
  }) => {
    const jwt = getJwt()
    if (!jwt) return { ok: false, error: 'Niet ingelogd.' }
    const sb = getUserClient(jwt)
    const { data: { user } } = await sb.auth.getUser()
    if (!user) return { ok: false, error: 'Gebruiker niet gevonden.' }

    const { data: recon } = await sb
      .from('reconstruction_versions')
      .select('mesh_url')
      .eq('id', args.reconstructionVersionId)
      .single()
    if (!recon?.mesh_url) return { ok: false, error: 'Geen mesh beschikbaar.' }

    const { applyDebugTexture } = await import('./lib/texture-projector')
    let glbBuffer: Buffer
    if (recon.mesh_url.startsWith('huphe://file/')) {
      glbBuffer = await readFile(decodeURIComponent(recon.mesh_url.replace('huphe://file/', '').split('?')[0]))
    } else {
      const res = await fetch(recon.mesh_url)
      glbBuffer = Buffer.from(await res.arrayBuffer())
    }
    const result = await applyDebugTexture(glbBuffer)

    const textureDir = join(app.getPath('userData'), 'product-studio', user.id, args.projectId, 'textures')
    await mkdir(textureDir, { recursive: true })

    const meshPath = join(textureDir, `textured_mesh_${args.reconstructionVersionId}.glb`)
    const atlasPath = join(textureDir, `texture_atlas_${args.reconstructionVersionId}.png`)
    const runVersion = Date.now()
    const toUrl = (p: string) => `huphe://file/${encodeURIComponent(p)}?v=${runVersion}`

    await Promise.all([
      writeFile(meshPath, result.texturedGlbBuffer),
      writeFile(atlasPath, result.atlasBuffer),
    ])

    await sb.from('reconstruction_versions').update({
      texture_status: 'completed',
      texture_error: null,
      textured_mesh_url: toUrl(meshPath),
      texture_atlas_url: toUrl(atlasPath),
    }).eq('id', args.reconstructionVersionId)

    return { ok: true, texturedMeshUrl: toUrl(meshPath), textureAtlasUrl: toUrl(atlasPath) }
  })

  ipcMain.handle('product-studio:get-texture-status', async (_e, reconstructionVersionId: string) => {
    const jwt = getJwt()
    if (!jwt) return { ok: false, error: 'Niet ingelogd.' }
    const sb = getUserClient(jwt)

    const { data, error } = await sb
      .from('reconstruction_versions')
      .select('id, texture_status, texture_error, textured_mesh_url, texture_atlas_url, material_manifest')
      .eq('id', reconstructionVersionId)
      .single()

    if (error) return { ok: false, error: error.message }
    return { ok: true, texture: data }
  })

  ipcMain.handle('product-studio:retry-texture-wrap', async (_e, reconstructionVersionId: string) => {
    const jwt = getJwt()
    if (!jwt) return { ok: false, error: 'Niet ingelogd.' }
    const sb = getUserClient(jwt)

    const { data: recon } = await sb
      .from('reconstruction_versions')
      .select('texture_status')
      .eq('id', reconstructionVersionId)
      .single()

    if (!recon) return { ok: false, error: 'Reconstruction niet gevonden.' }
    if (recon.texture_status !== 'failed') return { ok: false, error: 'Alleen failed texture wraps kunnen worden herstart.' }

    await sb
      .from('reconstruction_versions')
      .update({
        texture_status: 'pending',
        texture_error: null,
        textured_mesh_url: null,
        texture_atlas_url: null,
        material_manifest: null,
      })
      .eq('id', reconstructionVersionId)

    return { ok: true }
  })

  // --- Retry Provider Run ---

  ipcMain.handle('product-studio:retry-provider-run', async (_e, runId: string) => {
    const jwt = getJwt()
    if (!jwt) return { ok: false, error: 'Niet ingelogd.' }
    const sb = getUserClient(jwt)

    const { data: run } = await sb
      .from('provider_runs')
      .select('*')
      .eq('id', runId)
      .single()

    if (!run) return { ok: false, error: 'Provider run niet gevonden.' }
    if (run.status !== 'failed') return { ok: false, error: 'Alleen failed runs kunnen worden herstart.' }

    const MAX_RETRIES = 3
    if (run.retry_count >= MAX_RETRIES) return { ok: false, error: `Maximum aantal retries bereikt (${MAX_RETRIES}).` }

    // Mark run as processing for the retry
    const { error: updateError } = await sb
      .from('provider_runs')
      .update({
        status: 'processing',
        retry_count: run.retry_count + 1,
        error_code: null,
        error_message: null,
        completed_at: null,
        latency_ms: null,
      })
      .eq('id', runId)

    if (updateError) return { ok: false, error: updateError.message }

    const startTime = Date.now()

    try {
      const { callFalProxy } = await import('./lib/proxy')
      const { data: { user } } = await sb.auth.getUser()
      if (!user) throw new Error('Gebruiker niet gevonden.')

      if (run.provider_type === 'final-render') {
        // Retry: dezelfde scene + polish flow als generate-final-render
        const { data: frv } = await sb
          .from('final_render_versions')
          .select('*, render_packets(*)')
          .eq('provider_run_id', runId)
          .single()

        if (!frv || !frv.render_packets) throw new Error('Kan final render context niet herstellen.')
        const packet = frv.render_packets as any

        const sharp = (await import('sharp')).default
        const { callOpenRouter } = await import('./lib/proxy')

        // Helpers (zelfde als in generate-final-render)
        async function extractImageFromResponse(json: any): Promise<Buffer> {
          const msg = json?.choices?.[0]?.message
          const imgs: any[] = msg?.images ?? []
          let u: string | null = null, b: string | null = null
          for (const img of imgs) {
            if (typeof img === 'string') { if (img.startsWith('http') || img.startsWith('data:')) u = img; else b = img; break }
            if (img?.b64_json) { b = img.b64_json; break }
            const x = img?.image_url?.url ?? img?.url; if (x) { u = x; break }
          }
          if (!u && !b && Array.isArray(msg?.content)) {
            for (const p of msg.content) { if (p?.type === 'image_url') { u = p.image_url?.url; break } }
          }
          if (!u && !b) throw new Error('Geen afbeelding ontvangen van OpenRouter.')
          if (b) return Buffer.from(b.replace(/^data:image\/\w+;base64,/, ''), 'base64')
          if (u!.startsWith('data:')) return Buffer.from(u!.replace(/^data:image\/\w+;base64,/, ''), 'base64')
          const dl = await fetch(u!)
          if (!dl.ok) throw new Error(`Kan output niet downloaden: ${u!.slice(0, 80)}`)
          return Buffer.from(await dl.arrayBuffer())
        }

        async function callModel(messages: any[]): Promise<any> {
          let r = await callOpenRouter({ model: PRODUCT_STUDIO_FINAL_RENDER_MODEL, modalities: ['image', 'text'], messages, stream: false }, jwt)
          let raw = await r.text()
          if (r.status === 404 && raw.includes('output modalities: image, text')) {
            r = await callOpenRouter({ model: PRODUCT_STUDIO_FINAL_RENDER_MODEL, modalities: ['image'], messages, stream: false }, jwt)
            raw = await r.text()
          }
          if (!r.ok) throw new Error(`OpenRouter ${r.status}: ${raw.slice(0, 300)}`)
          try { return JSON.parse(raw) } catch { throw new Error(`Onverwacht antwoord: ${raw.slice(0, 200)}`) }
        }

        async function toDataUrl(buf: Buffer, maxSize = 1536): Promise<string> {
          const png = await sharp(buf).rotate().resize({ width: maxSize, height: maxSize, fit: 'inside', withoutEnlargement: true }).png({ compressionLevel: 9 }).toBuffer()
          return `data:image/png;base64,${png.toString('base64')}`
        }

        async function loadBuf(url: string | null | undefined): Promise<Buffer | null> {
          if (!url) return null
          if (url.startsWith('data:image/')) { const m = url.match(/;base64,(.+)$/); return m ? Buffer.from(m[1], 'base64') : null }
          if (url.startsWith('huphe://file/')) {
            try { return await readFile(decodeURIComponent(url.replace('huphe://file/', '').split('?')[0])) } catch { return null }
          }
          if (!url.startsWith('https://')) return null
          const r = await fetch(url); return r.ok ? Buffer.from(await r.arrayBuffer()) : null
        }

        const beautyBuffer = await loadBuf(packet.beauty_url)
        if (!beautyBuffer) throw new Error('Beauty render ontbreekt.')
        const beautyDataUrl = await toDataUrl(beautyBuffer)

        const { data: sourceAssets } = await sb.from('source_assets').select('type, url').eq('project_id', run.project_id).in('type', ['original-image', 'object-mask', 'basic-product'])
        let sourceUrl: string | null = null, maskUrl: string | null = null
        let basicProductUrl: string | null = null
        for (const sa of sourceAssets ?? []) {
          if (sa.type === 'original-image') sourceUrl = sa.url
          if (sa.type === 'object-mask') maskUrl = sa.url
          if (sa.type === 'basic-product') basicProductUrl = sa.url
        }

        let canonicalReferenceUrls: string[] = []
        if (packet.canonical_reference_set_id) {
          const { data: canonicalSet } = await sb
            .from('canonical_reference_sets')
            .select('view_ids')
            .eq('id', packet.canonical_reference_set_id)
            .maybeSingle()
          const viewIds = Array.isArray(canonicalSet?.view_ids) ? canonicalSet.view_ids : []
          if (viewIds.length > 0) {
            const { data: canonicalViews } = await sb
              .from('reference_views')
              .select('asset_url')
              .in('id', viewIds)
              .neq('status', 'rejected')
            canonicalReferenceUrls = (canonicalViews ?? [])
              .map((view) => view.asset_url)
              .filter((url): url is string => typeof url === 'string' && url.length > 0)
              .slice(0, 4)
          }
        }

        const policy = frv.preservation_policy ?? 'balanced'
        const policyInstructions: Record<string, string> = {
          strict: 'Werk extreem behoudend. Bewaar de basisafbeelding bijna letterlijk en pas alleen de expliciet gevraagde wijziging toe.',
          balanced: 'Maak het beeld fotorealistisch, maar behoud de basisafbeelding exact als compositie en camerastand.',
          creative: 'Voeg sfeer toe waar de prompt daarom vraagt, maar behoud compositie, camerastand, crop, positie en silhouet exact.',
        }

        // Scene pass
        const scenePrompt = [
          'Use this image as the exact basis. This is a 3D studio render of a plain grey product.',
          'Do NOT change the camera angle, perspective, crop, scale, product position, product shape, or silhouette.',
          'Do NOT add any print, pattern, label, logo, or texture to the product. Keep the product plain grey as-is.',
          'Only change the BACKGROUND and LIGHTING to create the requested photographic scene.',
          'Scene geometry rule: build the background in the same 3D camera space as the product. Match horizon line, lens perspective, floor/ground plane direction, depth, scale, and vanishing points to the input image.',
          'Respect the product position in 3D space. If the prompt asks the product to stand on a surface, create that surface at the correct height and perspective. If the prompt asks it to float or hang, preserve that spatial relation and make the environment perspective match it.',
          'Add shadows, contact shadows, ambient occlusion, or cast shadows only when they are physically appropriate for the requested scene and object position.',
          'Do not create a background that ignores the product camera, makes the floor/counter perspective inconsistent, or places scene geometry at an impossible depth relative to the product.',
          'Make the scene photorealistic with natural lighting, shadows, and reflections.',
          policyInstructions[policy] ?? policyInstructions.balanced,
          '', 'Requested scene:', frv.prompt, '', 'Generate only the image, no text.',
        ].join('\n')

        const sceneJson = await callModel([{
          role: 'user', content: [
            { type: 'image_url', image_url: { url: beautyDataUrl } },
            { type: 'text', text: scenePrompt },
          ]
        }])
        const sceneBuffer = await extractImageFromResponse(sceneJson)

        const sceneSignedUrl = await saveAssetLocally(user.id, run.project_id, `scene_${runId}_retry${run.retry_count + 1}.png`, sceneBuffer)

        // Polish pass
        let outBuffer: Buffer
        if (sourceUrl && maskUrl) {
          const sourceBuf = await loadBuf(sourceUrl)
          const maskBuf = await loadBuf(maskUrl)
          const sceneDataUrl = await toDataUrl(sceneBuffer)
          const polishParts: any[] = [
            { type: 'image_url', image_url: { url: sceneDataUrl } },
            { type: 'text', text: '[SCENE] Keep everything OUTSIDE the product area exactly as-is.' },
          ]
          if (maskBuf) {
            polishParts.push({ type: 'image_url', image_url: { url: await toDataUrl(maskBuf) } })
            polishParts.push({ type: 'text', text: '[OBJECT MASK] White = product, Black = background. Only modify product area.' })
          }
          if (sourceBuf) {
            polishParts.push({ type: 'image_url', image_url: { url: await toDataUrl(sourceBuf) } })
            polishParts.push({ type: 'text', text: '[SOURCE PRODUCT] Use exact color, material, finish, texture, print, labels, logos.' })
          }
          for (const [index, canonicalUrl] of canonicalReferenceUrls.entries()) {
            const canonicalBuf = await loadBuf(canonicalUrl)
            if (!canonicalBuf) continue
            polishParts.push({ type: 'image_url', image_url: { url: await toDataUrl(canonicalBuf) } })
            polishParts.push({ type: 'text', text: `[CANONICAL VIEW ${index + 1}] Extra product identity reference for side/back print and material.` })
          }
          polishParts.push({ type: 'text', text: 'POLISH PASS: Replace only the product area with the real product look. Keep shape, position, angle. Background must not change. Generate only the image.' })
          outBuffer = await extractImageFromResponse(await callModel([{ role: 'user', content: polishParts }]))
        } else {
          outBuffer = sceneBuffer
        }

        const finalRetryUrl = await saveAssetLocally(user.id, run.project_id, `final_${runId}_retry${run.retry_count + 1}.png`, outBuffer)
        await sb.from('final_render_versions').update({ output_url: finalRetryUrl, status: 'review' }).eq('id', frv.id)
        await sb.from('provider_runs').update({
          metadata: {
            basic_product_url: basicProductUrl ?? null,
            scene_url: sceneSignedUrl ?? null,
            polish_pass: !!(sourceUrl && maskUrl),
            retry: true,
            polish_inputs: {
              source_url: sourceUrl ?? null,
              object_mask_url: maskUrl ?? null,
              canonical_reference_urls: canonicalReferenceUrls,
            },
            inputs_used: {
              beauty: true,
              basic_product: !!basicProductUrl,
              source: !!sourceUrl,
              object_mask: !!maskUrl,
              canonical_references: canonicalReferenceUrls.length,
            },
          },
        }).eq('id', runId)

      } else if (run.provider_type === 'reconstruction') {
        // Haal reconstruction_version op
        const { data: recon } = await sb
          .from('reconstruction_versions')
          .select('*, canonical_reference_sets(id)')
          .eq('provider_run_id', runId)
          .single()

        if (!recon) throw new Error('Kan reconstruction context niet herstellen.')

        // Haal primary image uit source_assets
        const { data: sourceAsset } = await sb
          .from('source_assets')
          .select('signed_url')
          .eq('project_id', run.project_id)
          .eq('asset_type', 'product-photo')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (!sourceAsset?.signed_url) throw new Error('Bronbestand niet meer beschikbaar.')
        const imgRes = await fetch(sourceAsset.signed_url)
        if (!imgRes.ok) throw new Error('Kan referentiebeeld niet downloaden.')
        const base64 = Buffer.from(await imgRes.arrayBuffer()).toString('base64')

        const result = await callFalProxy('fal-ai/trellis-2', {
          image_base64: base64,
          image_mime_type: 'image/png',
        }, jwt) as any

        const glbUrl = result?.model_glb?.url
        if (!glbUrl) throw new Error('Geen GLB ontvangen van TRELLIS 2.')

        const glbBuffer = Buffer.from(await (await fetch(glbUrl)).arrayBuffer())
        const meshRetryUrl = await saveAssetLocally(user.id, run.project_id, `mesh_${runId}_retry${run.retry_count + 1}.glb`, glbBuffer)
        await sb.from('reconstruction_versions').update({ glb_url: meshRetryUrl, status: 'review' }).eq('id', recon.id)

      } else {
        // reference-view: te veel variabelen (targetViews, prompts per hoek) — laat UI opnieuw dispatchen
        throw new Error('Reference view retry moet via de UI opnieuw worden gestart.')
      }

      await sb.from('provider_runs').update({
        status: 'completed',
        latency_ms: Date.now() - startTime,
        completed_at: new Date().toISOString(),
      }).eq('id', runId)

      return { ok: true, retryCount: run.retry_count + 1 }
    } catch (err: any) {
      await sb.from('provider_runs').update({
        status: 'failed',
        error_message: err.message,
        latency_ms: Date.now() - startTime,
        completed_at: new Date().toISOString(),
      }).eq('id', runId)

      return { ok: false, error: err.message }
    }
  })

  // --- Rollback Canonical Reference Set ---

  ipcMain.handle('product-studio:rollback-canonical-set', async (_e, args: {
    projectId: string
    targetVersion: number
  }) => {
    const jwt = getJwt()
    if (!jwt) return { ok: false, error: 'Niet ingelogd.' }
    const sb = getUserClient(jwt)

    const { data: target } = await sb
      .from('canonical_reference_sets')
      .select('*')
      .eq('project_id', args.projectId)
      .eq('version', args.targetVersion)
      .single()

    if (!target) return { ok: false, error: `Canonical set versie ${args.targetVersion} niet gevonden.` }

    await sb
      .from('canonical_reference_sets')
      .update({ status: 'superseded' })
      .eq('project_id', args.projectId)
      .eq('status', 'approved')

    const { error } = await sb
      .from('canonical_reference_sets')
      .update({ status: 'approved' })
      .eq('id', target.id)

    if (error) return { ok: false, error: error.message }
    return { ok: true, restoredSet: target }
  })

  // --- Rollback Reconstruction Version ---

  ipcMain.handle('product-studio:rollback-reconstruction', async (_e, args: {
    projectId: string
    targetReconstructionId: string
  }) => {
    const jwt = getJwt()
    if (!jwt) return { ok: false, error: 'Niet ingelogd.' }
    const sb = getUserClient(jwt)

    const { data: target } = await sb
      .from('reconstruction_versions')
      .select('*')
      .eq('id', args.targetReconstructionId)
      .eq('project_id', args.projectId)
      .single()

    if (!target) return { ok: false, error: 'Reconstruction versie niet gevonden.' }

    await sb
      .from('reconstruction_versions')
      .update({ status: 'rejected' })
      .eq('project_id', args.projectId)
      .eq('status', 'approved')
      .neq('id', target.id)

    const { error } = await sb
      .from('reconstruction_versions')
      .update({ status: 'approved', approved_at: new Date().toISOString() })
      .eq('id', target.id)

    if (error) return { ok: false, error: error.message }

    await sb
      .from('product_projects')
      .update({ status: 'mesh_review' })
      .eq('id', args.projectId)

    return { ok: true, restoredReconstruction: target }
  })

  // --- Rollback Final Render Version ---

  ipcMain.handle('product-studio:rollback-final-render', async (_e, args: {
    projectId: string
    targetFinalRenderId: string
  }) => {
    const jwt = getJwt()
    if (!jwt) return { ok: false, error: 'Niet ingelogd.' }
    const sb = getUserClient(jwt)

    const { data: target } = await sb
      .from('final_render_versions')
      .select('*')
      .eq('id', args.targetFinalRenderId)
      .eq('project_id', args.projectId)
      .single()

    if (!target) return { ok: false, error: 'Final render versie niet gevonden.' }

    await sb
      .from('final_render_versions')
      .update({ status: 'rejected' })
      .eq('project_id', args.projectId)
      .eq('status', 'approved')
      .neq('id', target.id)

    const { error } = await sb
      .from('final_render_versions')
      .update({ status: 'approved', approved_at: new Date().toISOString() })
      .eq('id', target.id)

    if (error) return { ok: false, error: error.message }

    return { ok: true, restoredRender: target }
  })

  // --- Storage Cleanup (verwijder superseded/failed assets) ---

  ipcMain.handle('product-studio:cleanup-storage', async (_e, projectId: string) => {
    const jwt = getJwt()
    if (!jwt) return { ok: false, error: 'Niet ingelogd.' }
    const sb = getUserClient(jwt)

    const { data: { user } } = await sb.auth.getUser()
    if (!user) return { ok: false, error: 'Gebruiker niet gevonden.' }

    const removed: string[] = []
    const basePath = `${user.id}/${projectId}`

    // Failed reconstruction meshes
    const { data: failedRecons } = await sb
      .from('reconstruction_versions')
      .select('id, mesh_url, provider_run_id')
      .eq('project_id', projectId)
      .in('status', ['failed', 'rejected'])

    for (const recon of failedRecons ?? []) {
      if (recon.mesh_url) {
        const meshPath = `${basePath}/mesh_${recon.provider_run_id ?? recon.id}.glb`
        const { error } = await sb.storage.from('atelier-assets').remove([meshPath])
        if (!error) removed.push(meshPath)
      }
    }

    // Failed final renders
    const { data: failedRenders } = await sb
      .from('final_render_versions')
      .select('id, output_url, provider_run_id')
      .eq('project_id', projectId)
      .in('status', ['failed', 'rejected'])

    for (const render of failedRenders ?? []) {
      if (render.output_url && render.provider_run_id) {
        const finalPath = `${basePath}/final_${render.provider_run_id}.png`
        const { error } = await sb.storage.from('atelier-assets').remove([finalPath])
        if (!error) removed.push(finalPath)
      }
    }

    return { ok: true, removed, count: removed.length }
  })

  // --- Provider Stats (kosten, latency, status per project) ---

  ipcMain.handle('product-studio:get-provider-stats', async (_e, projectId: string) => {
    const jwt = getJwt()
    if (!jwt) return { ok: false, error: 'Niet ingelogd.' }
    const sb = getUserClient(jwt)

    const { data: runs, error } = await sb
      .from('provider_runs')
      .select('id, provider_type, provider_name, model_name, status, latency_ms, cost_estimate, retry_count, created_at, completed_at')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })

    if (error) return { ok: false, error: error.message }

    const summary = {
      totalRuns: runs?.length ?? 0,
      completed: 0,
      failed: 0,
      processing: 0,
      totalLatencyMs: 0,
      totalCost: 0,
      byType: {} as Record<string, { count: number; avgLatencyMs: number; totalCost: number; failRate: number }>,
    }

    for (const run of runs ?? []) {
      if (run.status === 'completed') summary.completed++
      else if (run.status === 'failed') summary.failed++
      else if (run.status === 'processing' || run.status === 'queued') summary.processing++

      if (run.latency_ms) summary.totalLatencyMs += run.latency_ms
      if (run.cost_estimate) summary.totalCost += run.cost_estimate

      const type = run.provider_type
      if (!summary.byType[type]) {
        summary.byType[type] = { count: 0, avgLatencyMs: 0, totalCost: 0, failRate: 0 }
      }
      const t = summary.byType[type]
      t.count++
      if (run.latency_ms) t.avgLatencyMs += run.latency_ms
      if (run.cost_estimate) t.totalCost += run.cost_estimate
      if (run.status === 'failed') t.failRate++
    }

    for (const t of Object.values(summary.byType)) {
      if (t.count > 0) {
        t.avgLatencyMs = Math.round(t.avgLatencyMs / t.count)
        t.failRate = Math.round((t.failRate / t.count) * 100)
      }
    }

    return { ok: true, runs, summary }
  })
}
