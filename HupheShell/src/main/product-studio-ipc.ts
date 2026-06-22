import { ipcMain, app } from 'electron'
import { createClient } from '@supabase/supabase-js'
import { createHash } from 'crypto'
import { writeFile, mkdir } from 'fs/promises'
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
          const basicPath = `${user.id}/${args.projectId}/basic_product.png`
          await sb.storage
            .from('atelier-assets')
            .upload(basicPath, basicBuffer, { contentType: 'image/png', upsert: true })

          const { data: basicUrlData } = await sb.storage
            .from('atelier-assets')
            .createSignedUrl(basicPath, 86400)

          if (basicUrlData?.signedUrl) {
            const { data: basicAsset } = await sb
              .from('source_assets')
              .insert({
                project_id: args.projectId,
                type: 'basic-product',
                url: basicUrlData.signedUrl,
                mime_type: 'image/png',
                provenance: 'inferred',
              })
              .select()
              .single()

            results.basicProduct = basicAsset
          }
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

    return {
      ok: true,
      project: projectRes.data,
      sourceAssets: sourceRes.data ?? [],
      referenceViews: viewsRes.data ?? [],
      latestCanonicalSet: canonicalRes.data?.[0] ?? null,
      latestReconstruction: reconRes.data?.[0] ?? null,
      latestScene: sceneRes.data?.[0] ?? null,
      latestRenderPacket: packetRes.data?.[0] ?? null,
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

  // --- Generate Final Render (RenderPacket → FinalRenderVersion via OpenRouter image edit) ---

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
        provider_name: 'openrouter',
        model_name: PRODUCT_STUDIO_FINAL_RENDER_MODEL,
        status: 'processing',
        idempotency_key: `final-${args.renderPacketId}-${Date.now()}`,
      })
      .select()
      .single()

    if (runError) return { ok: false, error: runError.message }

    const startTime = Date.now()

    try {
      const sharp = (await import('sharp')).default
      const { callOpenRouter } = await import('./lib/proxy')

      async function loadImageBuffer(url: string | null | undefined, label: string, required = false): Promise<Buffer | null> {
        if (!url) {
          if (required) throw new Error(`${label} ontbreekt.`)
          return null
        }
        if (url.startsWith('data:image/')) {
          const match = url.match(/^data:image\/\w+;base64,(.+)$/)
          if (!match) {
            if (required) throw new Error(`${label} heeft een ongeldig data URL formaat.`)
            return null
          }
          return Buffer.from(match[1], 'base64')
        }
        if (!url.startsWith('https://')) {
          if (required) throw new Error(`${label} moet HTTPS zijn.`)
          return null
        }
        const response = await fetch(url)
        if (!response.ok) {
          if (required) throw new Error(`${label} kon niet worden opgehaald.`)
          return null
        }
        return Buffer.from(await response.arrayBuffer())
      }

      // Helper: extract image buffer from OpenRouter response
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
          }
        }
        if (!imgUrl && !imgB64) throw new Error('Geen afbeelding ontvangen van OpenRouter.')
        if (imgB64) return Buffer.from(imgB64.replace(/^data:image\/\w+;base64,/, ''), 'base64')
        if (imgUrl!.startsWith('data:')) return Buffer.from(imgUrl!.replace(/^data:image\/\w+;base64,/, ''), 'base64')
        const dl = await fetch(imgUrl!)
        if (!dl.ok) throw new Error(`Kan output niet downloaden: ${imgUrl!.slice(0, 80)}`)
        return Buffer.from(await dl.arrayBuffer())
      }

      // Helper: callModel met fallback modalities
      async function callModel(messages: any[]): Promise<any> {
        let res = await callOpenRouter({
          model: PRODUCT_STUDIO_FINAL_RENDER_MODEL,
          modalities: ['image', 'text'],
          messages,
          stream: false,
        }, jwt)
        let raw = await res.text()
        if (res.status === 404 && raw.includes('output modalities: image, text')) {
          res = await callOpenRouter({
            model: PRODUCT_STUDIO_FINAL_RENDER_MODEL,
            modalities: ['image'],
            messages,
            stream: false,
          }, jwt)
          raw = await res.text()
        }
        if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${raw.slice(0, 300)}`)
        try { return JSON.parse(raw) } catch {
          throw new Error(`Onverwacht OpenRouter antwoord: ${raw.slice(0, 200)}`)
        }
      }

      // Helper: buffer → resized data URL
      async function toDataUrl(buf: Buffer, maxSize = 1536): Promise<string> {
        const png = await sharp(buf)
          .rotate()
          .resize({ width: maxSize, height: maxSize, fit: 'inside', withoutEnlargement: true })
          .png({ compressionLevel: 9 })
          .toBuffer()
        return `data:image/png;base64,${png.toString('base64')}`
      }

      const beautyBuffer = await loadImageBuffer(packet.beauty_url, 'Beauty', true)
      if (!beautyBuffer) throw new Error('Beauty render ontbreekt.')
      const beautyDataUrl = await toDataUrl(beautyBuffer)

      // Haal source en object-mask op
      const { data: sourceAssets } = await sb
        .from('source_assets')
        .select('type, url')
        .eq('project_id', args.projectId)
        .in('type', ['original-image', 'object-mask', 'basic-product'])

      let sourceUrl: string | null = null
      let maskUrl: string | null = null
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

      const policyInstructions: Record<string, string> = {
        strict: 'Werk extreem behoudend. Bewaar de basisafbeelding bijna letterlijk en pas alleen de expliciet gevraagde wijziging toe.',
        balanced: 'Maak het beeld fotorealistisch, maar behoud de basisafbeelding exact als compositie en camerastand.',
        creative: 'Voeg sfeer toe waar de prompt daarom vraagt, maar behoud compositie, camerastand, crop, positie en silhouet exact.',
      }

      // ========== SCENE PASS ==========
      // Maakt omgeving/fotografie rond het grijze product.
      // Product mag grijs blijven — geen print/materiaal polish.

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
        policyInstructions[preservationPolicy] ?? policyInstructions.balanced,
        '',
        'Requested scene:',
        args.prompt,
        '',
        'Generate only the image, no text.',
      ].join('\n')

      const sceneJson = await callModel([{
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: beautyDataUrl } },
          { type: 'text', text: scenePrompt },
        ],
      }])
      const sceneBuffer = await extractImageFromResponse(sceneJson)

      // Scene opslaan als intermediate
      const scenePath = `${user.id}/${args.projectId}/scene_${run.id}.png`
      await sb.storage
        .from('atelier-assets')
        .upload(scenePath, sceneBuffer, { contentType: 'image/png', upsert: true })
      const { data: sceneUrlData } = await sb.storage
        .from('atelier-assets')
        .createSignedUrl(scenePath, 86400)
      const sceneSignedUrl = sceneUrlData?.signedUrl

      // ========== POLISH PASS ==========
      // Source/ref image + object mask → alleen productgebied aanpassen met echte materialen.

      let outBuffer: Buffer
      const hasSourceAndMask = sourceUrl && maskUrl

      if (hasSourceAndMask) {
        const sourceBuffer = await loadImageBuffer(sourceUrl, 'Source product')
        const maskBuffer = await loadImageBuffer(maskUrl, 'Object mask')
        const sceneDataUrl = await toDataUrl(sceneBuffer)

        const polishParts: any[] = [
          { type: 'image_url', image_url: { url: sceneDataUrl } },
          { type: 'text', text: '[SCENE] This is the scene with the grey product in the correct position, angle, and environment. Keep everything OUTSIDE the product area exactly as-is.' },
        ]

        if (maskBuffer) {
          const maskDataUrl = await toDataUrl(maskBuffer)
          polishParts.push({ type: 'image_url', image_url: { url: maskDataUrl } })
          polishParts.push({ type: 'text', text: '[OBJECT MASK] White = product area, Black = background. Only modify the white (product) area. The background must remain pixel-perfect.' })
        }

        if (sourceBuffer) {
          const sourceDataUrl = await toDataUrl(sourceBuffer)
          polishParts.push({ type: 'image_url', image_url: { url: sourceDataUrl } })
          polishParts.push({ type: 'text', text: '[SOURCE PRODUCT] This is the real product. Use its exact color, material, finish, texture, print, labels, and logos. Apply these to the product area in the scene.' })
        }

        for (const [index, canonicalUrl] of canonicalReferenceUrls.entries()) {
          const canonicalBuffer = await loadImageBuffer(canonicalUrl, `Canonical reference ${index + 1}`)
          if (!canonicalBuffer) continue
          polishParts.push({ type: 'image_url', image_url: { url: await toDataUrl(canonicalBuffer) } })
          polishParts.push({ type: 'text', text: `[CANONICAL VIEW ${index + 1}] Extra product identity reference. Use it to infer side/back print and material when the scene camera shows a different angle.` })
        }

        polishParts.push({ type: 'text', text: [
          'POLISH PASS: Replace only the product area (white in the mask) with the real product look from the source image.',
          'Keep the exact same shape, position, angle, scale, and silhouette from the scene.',
          'Keep all lighting, shadows, and reflections from the scene consistent.',
          'The background outside the mask must not change at all.',
          'Generate only the image, no text.',
        ].join('\n') })

        const polishJson = await callModel([{
          role: 'user',
          content: polishParts,
        }])
        outBuffer = await extractImageFromResponse(polishJson)
      } else {
        // Geen source/mask beschikbaar → scene pass is het eindresultaat
        outBuffer = sceneBuffer
      }

      const storagePath = `${user.id}/${args.projectId}/final_${run.id}.png`
      await sb.storage
        .from('atelier-assets')
        .upload(storagePath, outBuffer, { contentType: 'image/png', upsert: true })

      const { data: urlData } = await sb.storage
        .from('atelier-assets')
        .createSignedUrl(storagePath, 86400)

      const finalUrl = urlData?.signedUrl ?? packet.beauty_url

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

      // Provider run updaten met metadata over welke inputs/passes zijn gebruikt
      await sb
        .from('provider_runs')
        .update({
          status: 'completed',
          latency_ms: Date.now() - startTime,
          completed_at: new Date().toISOString(),
          metadata: {
            basic_product_url: basicProductUrl ?? null,
            scene_url: sceneSignedUrl ?? null,
            polish_pass: !!hasSourceAndMask,
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
        })
        .eq('id', run.id)

      // Project status updaten
      await sb
        .from('product_projects')
        .update({ status: 'render_pending' })
        .eq('id', args.projectId)

      return { ok: true, render, providerRunId: run.id, sceneUrl: sceneSignedUrl }
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

        const sceneJson = await callModel([{ role: 'user', content: [
          { type: 'image_url', image_url: { url: beautyDataUrl } },
          { type: 'text', text: scenePrompt },
        ]}])
        const sceneBuffer = await extractImageFromResponse(sceneJson)

        const scenePath = `${user.id}/${run.project_id}/scene_${runId}_retry${run.retry_count + 1}.png`
        await sb.storage.from('atelier-assets').upload(scenePath, sceneBuffer, { contentType: 'image/png', upsert: true })
        const { data: sceneUrlData } = await sb.storage.from('atelier-assets').createSignedUrl(scenePath, 86400)
        const sceneSignedUrl = sceneUrlData?.signedUrl

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

        const storagePath = `${user.id}/${run.project_id}/final_${runId}_retry${run.retry_count + 1}.png`
        await sb.storage.from('atelier-assets').upload(storagePath, outBuffer, { contentType: 'image/png', upsert: true })
        const { data: urlData } = await sb.storage.from('atelier-assets').createSignedUrl(storagePath, 86400)
        await sb.from('final_render_versions').update({ output_url: urlData?.signedUrl ?? packet.beauty_url, status: 'review' }).eq('id', frv.id)
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
        const storagePath = `${user.id}/${run.project_id}/mesh_${runId}_retry${run.retry_count + 1}.glb`
        await sb.storage.from('atelier-assets').upload(storagePath, glbBuffer, { contentType: 'model/gltf-binary', upsert: true })
        const { data: meshUrlData } = await sb.storage.from('atelier-assets').createSignedUrl(storagePath, 86400)

        await sb.from('reconstruction_versions').update({ glb_url: meshUrlData?.signedUrl ?? glbUrl, status: 'review' }).eq('id', recon.id)

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
