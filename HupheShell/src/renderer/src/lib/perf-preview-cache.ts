const sageTagsCache = new WeakMap<object, Map<string, string[]>>()
const MAX_SAGE_TAGS_CACHE_SIZE = 200

function hashValue(val: unknown): string {
  return val ? JSON.stringify(val) : 'null'
}

export function getCachedSageTags(
  layoutName: string,
  templateData: object | null,
  mappings: Record<string, Record<number, string>> | undefined,
  computeFn: () => string[],
): string[] {
  if (!templateData) return computeFn()

  if (!sageTagsCache.has(templateData)) {
    sageTagsCache.set(templateData, new Map<string, string[]>())
  }
  const templateCache = sageTagsCache.get(templateData)!

  const cacheKey = `${layoutName}::${hashValue(mappings)}`
  if (templateCache.has(cacheKey)) return templateCache.get(cacheKey)!

  const result = computeFn()
  if (templateCache.size >= MAX_SAGE_TAGS_CACHE_SIZE) templateCache.clear()
  templateCache.set(cacheKey, result)
  return result
}

const previewBlockCache = new WeakMap<object, Map<string, object>>()

export function getCachedPreviewBlock<T extends object>(
  block: T,
  overrides: Record<string, Record<string, string>>,
  mdToSageTag: Record<string, Record<string, string>>,
  sageTags: string[],
  computeFn: () => T,
): T {
  if (!previewBlockCache.has(block)) {
    previewBlockCache.set(block, new Map<string, object>())
  }
  const blockCache = previewBlockCache.get(block)!

  const cacheKey = `${hashValue(overrides)}::${hashValue(mdToSageTag)}::${hashValue(sageTags)}`
  if (blockCache.has(cacheKey)) return blockCache.get(cacheKey) as T

  const result = computeFn()
  if (blockCache.size >= 50) blockCache.clear()
  blockCache.set(cacheKey, result)
  return result
}
