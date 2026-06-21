import { ipcMain, app } from 'electron'
import { createClient } from '@supabase/supabase-js'
import { createHash } from 'crypto'
import { writeFile, mkdir } from 'fs/promises'
import { join } from 'path'

const meta = (import.meta as any).env ?? {}
const SUPABASE_URL = (meta.MAIN_VITE_SUPABASE_URL as string) || ''
const SUPABASE_ANON_KEY = (meta.MAIN_VITE_SUPABASE_KEY as string) || ''

function getUserClient(jwt: string) {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  })
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

    const storagePath = `${user.id}/${args.projectId}/original.${ext}`

    const { error: uploadError } = await sb.storage
      .from('atelier-assets')
      .upload(storagePath, new Uint8Array(args.fileBuffer), {
        contentType: args.mimeType,
        upsert: true,
      })

    if (uploadError) return { ok: false, error: uploadError.message }

    const { data: urlData } = await sb.storage
      .from('atelier-assets')
      .createSignedUrl(storagePath, 86400)

    const url = urlData?.signedUrl
    if (!url) return { ok: false, error: 'Signed URL aanmaken mislukt.' }

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
  }) => {
    const jwt = getJwt()
    if (!jwt) return { ok: false, error: 'Niet ingelogd.' }
    const sb = getUserClient(jwt)

    const { data, error } = await sb
      .from('render_packets')
      .insert({
        project_id: args.projectId,
        canonical_reference_set_id: args.canonicalReferenceSetId,
        reconstruction_version_id: args.reconstructionVersionId,
        studio_scene_version_id: args.studioSceneVersionId,
        beauty_url: args.beautyUrl,
        object_mask_url: args.objectMaskUrl,
        depth_url: args.depthUrl,
        normal_url: args.normalUrl,
      })
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

      const maskUrl = maskResult?.image?.url
      if (maskUrl) {
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
      const thumbPath = `${user.id}/${args.projectId}/thumbnail.png`

      await sb.storage
        .from('atelier-assets')
        .upload(thumbPath, thumbBuffer, { contentType: 'image/png', upsert: true })

      const { data: thumbUrlData } = await sb.storage
        .from('atelier-assets')
        .createSignedUrl(thumbPath, 86400)

      if (thumbUrlData?.signedUrl) {
        const { data: thumbAsset } = await sb
          .from('source_assets')
          .insert({
            project_id: args.projectId,
            type: 'thumbnail',
            url: thumbUrlData.signedUrl,
            mime_type: 'image/png',
            width: thumbMeta.width,
            height: thumbMeta.height,
            provenance: 'observed',
          })
          .select()
          .single()

        results.thumbnail = thumbAsset
      }
    } catch (err: any) {
      results.thumbnailError = err.message
    }

    // 4. Update project status
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

    const storagePath = `${user.id}/${args.projectId}/mesh_${args.reconstructionVersionId}.glb`

    const { error: uploadError } = await sb.storage
      .from('atelier-assets')
      .upload(storagePath, new Uint8Array(args.glbBuffer), {
        contentType: 'model/gltf-binary',
        upsert: true,
      })

    if (uploadError) return { ok: false, error: uploadError.message }

    const { data: urlData } = await sb.storage
      .from('atelier-assets')
      .createSignedUrl(storagePath, 86400)

    const meshUrl = urlData?.signedUrl
    if (!meshUrl) return { ok: false, error: 'Signed URL aanmaken mislukt.' }

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
      if (!args.imageUrl.startsWith('https://')) return { ok: false, error: 'Alleen HTTPS URLs toegestaan.' }
      const imgRes = await fetch(args.imageUrl)
      if (!imgRes.ok) return { ok: false, error: `Download mislukt: ${imgRes.status}` }

      const buffer = Buffer.from(await imgRes.arrayBuffer())
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
    passType: 'beauty' | 'depth' | 'normal' | 'object-mask'
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
    const storagePath = `${user.id}/${args.projectId}/${args.passType}_${Date.now()}.${ext}`

    const { error: uploadError } = await sb.storage
      .from('atelier-assets')
      .upload(storagePath, buffer, { contentType: mimeType, upsert: true })

    if (uploadError) return { ok: false, error: uploadError.message }

    const { data: urlData } = await sb.storage
      .from('atelier-assets')
      .createSignedUrl(storagePath, 86400)

    if (!urlData?.signedUrl) return { ok: false, error: 'Signed URL aanmaken mislukt.' }
    return { ok: true, url: urlData.signedUrl }
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

    return {
      ok: true,
      project: projectRes.data,
      sourceAssets: sourceRes.data ?? [],
      referenceViews: viewsRes.data ?? [],
      latestCanonicalSet: canonicalRes.data?.[0] ?? null,
      latestReconstruction: reconRes.data?.[0] ?? null,
      latestScene: sceneRes.data?.[0] ?? null,
      latestRenderPacket: packetRes.data?.[0] ?? null,
      latestFinalRender: renderRes.data?.[0] ?? null,
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

  // --- Generate Final Render (RenderPacket → FinalRenderVersion via Qwen Image Edit) ---

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

    const { data: packet } = await sb
      .from('render_packets')
      .select('*')
      .eq('id', args.renderPacketId)
      .single()

    if (!packet) return { ok: false, error: 'RenderPacket niet gevonden.' }

    const preservationPolicy = args.preservationPolicy ?? 'balanced'
    const resolution = args.resolution ?? '2K'

    // Provider run aanmaken
    const { data: run, error: runError } = await sb
      .from('provider_runs')
      .insert({
        project_id: args.projectId,
        provider_type: 'final-render',
        provider_name: 'fal',
        model_name: 'fal-ai/qwen-image-edit',
        status: 'processing',
        idempotency_key: `final-${args.renderPacketId}-${Date.now()}`,
      })
      .select()
      .single()

    if (runError) return { ok: false, error: runError.message }

    const startTime = Date.now()

    try {
      const { callFalProxy } = await import('./lib/proxy')

      // Download beauty pass
      if (!packet.beauty_url.startsWith('https://')) throw new Error('Beauty URL moet HTTPS zijn.')
      const imgRes = await fetch(packet.beauty_url)
      if (!imgRes.ok) throw new Error('Kan beauty pass niet downloaden.')
      const imgBuffer = Buffer.from(await imgRes.arrayBuffer())
      const base64 = imgBuffer.toString('base64')

      // Object mask als protected region context
      let maskContext = ''
      if (packet.object_mask_url) {
        maskContext = ' The product area is defined by an object mask — preserve everything inside the masked region and only modify the background outside it.'
      }

      // Preservation policy → prompt prefix
      const policyPrefixes: Record<string, string> = {
        strict: 'Preserve the product exactly as shown. Do not change the product shape, colors, logos, or labels. Only change the background and lighting.',
        balanced: 'Keep the product identity and key features intact. Enhance the scene with realistic lighting, shadows, and environment.',
        creative: 'Use the product as inspiration. Create an artistic, photorealistic scene with creative lighting and environment.',
      }

      const fullPrompt = `${policyPrefixes[preservationPolicy]}${maskContext} ${args.prompt}`

      // Build fal.ai request — include mask image if available
      const falParams: Record<string, unknown> = {
        image_base64: base64,
        image_mime_type: 'image/png',
        prompt: fullPrompt,
        num_inference_steps: 28,
        guidance_scale: 3.5,
      }

      if (packet.object_mask_url && packet.object_mask_url.startsWith('https://')) {
        try {
          const maskRes = await fetch(packet.object_mask_url)
          if (maskRes.ok) {
            const maskBuffer = Buffer.from(await maskRes.arrayBuffer())
            falParams.mask_image_base64 = maskBuffer.toString('base64')
            falParams.mask_image_mime_type = 'image/png'
          }
        } catch { /* mask is optional, proceed without */ }
      }

      const result = await callFalProxy('fal-ai/qwen-image-edit', falParams, jwt) as any

      const outputImageUrl = result?.images?.[0]?.url ?? result?.image?.url
      if (!outputImageUrl) throw new Error('Geen output ontvangen van Qwen Image Edit.')

      // Output opslaan in eigen storage
      const outRes = await fetch(outputImageUrl)
      if (!outRes.ok) throw new Error('Kan output niet downloaden.')
      const outBuffer = Buffer.from(await outRes.arrayBuffer())

      const storagePath = `${user.id}/${args.projectId}/final_${run.id}.png`
      await sb.storage
        .from('atelier-assets')
        .upload(storagePath, outBuffer, { contentType: 'image/png', upsert: true })

      const { data: urlData } = await sb.storage
        .from('atelier-assets')
        .createSignedUrl(storagePath, 86400)

      const finalUrl = urlData?.signedUrl ?? outputImageUrl

      // FinalRenderVersion opslaan
      const { data: render, error: renderError } = await sb
        .from('final_render_versions')
        .insert({
          project_id: args.projectId,
          render_packet_id: args.renderPacketId,
          provider_run_id: run.id,
          output_url: finalUrl,
          preservation_policy: preservationPolicy,
          prompt: args.prompt,
          resolution,
          status: 'review',
        })
        .select()
        .single()

      if (renderError) throw new Error(renderError.message)

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
        .update({ status: 'render_pending' })
        .eq('id', args.projectId)

      return { ok: true, render, providerRunId: run.id }
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
        left: 'left side profile view (90 degrees from front)',
        right: 'right side profile view (90 degrees from front)',
        rear: 'back/rear view (180 degrees from front)',
        top: 'top-down view from directly above',
      }

      for (const angle of args.targetViews) {
        const productContext = args.productNotes ? ` The product is: ${args.productNotes}.` : ''
        const prompt = `Generate a ${angleDescriptions[angle]} of this exact product. Keep the same product identity: same colors, materials, textures, logos, labels, and proportions. Use a clean white background. Same lighting conditions. No other objects.${productContext}`

        const result = await callFalProxy('fal-ai/nano-banana-2/edit', {
          image_urls: [sourceUrl],
          prompt,
          num_images: 1,
          aspect_ratio: '1:1',
          resolution: '1K',
        }, jwt) as any

        const imageUrl = result?.images?.[0]?.url
        if (!imageUrl) continue

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

        if (view) views.push({ angle, assetUrl: imageUrl, viewId: view.id })
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

    if (args.primaryImageUrl && !args.primaryImageUrl.startsWith('https://')) {
      return { ok: false, error: 'Primary image URL moet HTTPS zijn.' }
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

      // Download primary image voor base64
      const imgRes = await fetch(args.primaryImageUrl)
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

      const storagePath = `${user.id}/${args.projectId}/mesh_${run.id}.glb`
      await sb.storage
        .from('atelier-assets')
        .upload(storagePath, glbBuffer, { contentType: 'model/gltf-binary', upsert: true })

      const { data: meshUrlData } = await sb.storage
        .from('atelier-assets')
        .createSignedUrl(storagePath, 86400)

      const meshUrl = meshUrlData?.signedUrl ?? glbUrl

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

    const { error } = await sb
      .from('provider_runs')
      .update({
        status: 'queued',
        retry_count: run.retry_count + 1,
        error_code: null,
        error_message: null,
        completed_at: null,
        latency_ms: null,
      })
      .eq('id', runId)

    if (error) return { ok: false, error: error.message }
    return { ok: true, retryCount: run.retry_count + 1 }
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
