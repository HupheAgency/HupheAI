import { supabase } from './supabase'

const ASSET_BUCKET = 'atelier-assets'
const SIGNED_URL_TTL = 3600

export async function saveAssetToStorage(
  ownerId: string,
  fileName: string,
  fileBody: File | Blob | ArrayBuffer,
  contentType: string,
): Promise<{ path: string; signedUrl: string }> {
  if (!supabase) throw new Error('Supabase niet geconfigureerd.')
  const path = `${ownerId}/${fileName}`

  const { error } = await supabase.storage
    .from(ASSET_BUCKET)
    .upload(path, fileBody, { contentType, upsert: true })

  if (error) throw new Error(`Upload mislukt: ${error.message}`)

  const { data, error: urlError } = await supabase.storage
    .from(ASSET_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL)

  if (urlError || !data) throw new Error(`Signed URL aanmaken mislukt: ${urlError?.message}`)

  return { path, signedUrl: data.signedUrl }
}

export async function getSignedAssetUrl(path: string, expiresIn = SIGNED_URL_TTL): Promise<string | null> {
  if (!supabase) return null
  const { data, error } = await supabase.storage.from(ASSET_BUCKET).createSignedUrl(path, expiresIn)
  if (error || !data) return null
  return data.signedUrl
}

export async function deleteAssetFromStorage(path: string): Promise<void> {
  if (!supabase) return
  await supabase.storage.from(ASSET_BUCKET).remove([path])
}

export async function cleanupOrphanedAssets(
  ownerId: string,
  activeStoragePaths: string[],
): Promise<void> {
  if (!supabase) return
  const pathPrefix = `${ownerId}/`
  const { data: list, error } = await supabase.storage.from(ASSET_BUCKET).list(pathPrefix)

  if (error || !list) return

  const activeSet = new Set(activeStoragePaths)
  const toDelete = list
    .filter((file) => !activeSet.has(`${pathPrefix}${file.name}`))
    .map((file) => `${pathPrefix}${file.name}`)

  if (toDelete.length > 0) {
    await supabase.storage.from(ASSET_BUCKET).remove(toDelete)
  }
}
