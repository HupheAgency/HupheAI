/* eslint-disable @typescript-eslint/no-explicit-any */

// These types are based on the context provided in .agents/gemini.md
// and are here to make the file self-contained and type-safe.
// The integrator (Claude) will likely replace these with actual imports.

/**
 * Represents a single block of content on a slide.
 * The object reference of this block is used as a cache key.
 */
interface Block {
    id: string;
    type: string;
    heading: string;
    body: string;
    fields: Record<string, string>;
    imagePath?: string;
    imageUrl?: string;
    imageFit?: 'fill' | 'fit' | 'custom';
    imageRotation?: number;
    imageFlipX?: boolean;
    imageFlipY?: boolean;
    imageOffset?: { x: number; y: number };
    imageAlign?: 'left' | 'center' | 'right';
    imageScale?: number;
    tableData?: unknown;
}

/**
 * Represents the template data for a presentation.
 * The object reference is used as a cache key.
 */
type TemplateData = object;

// --- Cache for getSageTags ---

const sageTagsCache = new WeakMap<TemplateData, Map<string, string[]>>();
const MAX_SAGE_TAGS_CACHE_SIZE = 200;

function getObjectHash(obj: any): string {
    // A simple but effective hash for cache keys.
    // For performance-critical scenarios, a faster hashing algorithm could be used.
    return obj ? JSON.stringify(obj) : 'null';
}

/**
 * A cached wrapper for a function that computes sage tags.
 * It uses a WeakMap for the templateData object and a Map for layoutName + mappings.
 * @param layoutName The name of the layout.
 * @param templateData The template data object. Its reference is used as a cache key.
 * @param mappings The mappings object.
 * @param computeFn The function to call to compute the value if not found in cache.
 * @returns The computed or cached array of sage tags.
 */
export function getCachedSageTags(
    layoutName: string,
    templateData: TemplateData | null,
    mappings: Record<string, Record<number, string>> | undefined,
    computeFn: () => string[],
): string[] {
    if (!templateData) {
        return computeFn();
    }

    if (!sageTagsCache.has(templateData)) {
        sageTagsCache.set(templateData, new Map<string, string[]>());
    }
    const templateCache = sageTagsCache.get(templateData)!;

    const cacheKey = `${layoutName}::${getObjectHash(mappings)}`;

    if (templateCache.has(cacheKey)) {
        return templateCache.get(cacheKey)!;
    }

    const result = computeFn();

    if (templateCache.size >= MAX_SAGE_TAGS_CACHE_SIZE) {
        // Simple eviction strategy: clear the map for this templateData.
        templateCache.clear();
    }

    templateCache.set(cacheKey, result);
    return result;
}

// --- Cache for buildPreviewBlock ---

const previewBlockCache = new WeakMap<Block, Map<string, Block>>();

/**
 * A cached wrapper for a function that builds a preview block.
 * It uses a WeakMap for the block object reference to automatically handle cache invalidation.
 * @param block The block object. Its reference is used as a cache key.
 * @param overrides A map of overrides.
 * @param mdToSageTag A map of markdown to sage tags.
 * @param sageTags An array of sage tags.
 * @param computeFn The function to call to compute the value if not found in cache.
 * @returns The computed or cached Block.
 */
export function getCachedPreviewBlock(
    block: Block,
    overrides: Record<string, Record<string, string>>,
    mdToSageTag: Record<string, Record<string, string>>,
    sageTags: string[],
    computeFn: () => Block,
): Block {
    if (!previewBlockCache.has(block)) {
        previewBlockCache.set(block, new Map<string, Block>());
    }
    const blockCache = previewBlockCache.get(block)!;

    const cacheKey = `${getObjectHash(overrides)}::${getObjectHash(mdToSageTag)}::${getObjectHash(sageTags)}`;

    if (blockCache.has(cacheKey)) {
        return blockCache.get(cacheKey)!;
    }

    const result = computeFn();

    // The cache for a single block reference is unlikely to grow large, but we clear it to be safe.
    if (blockCache.size >= 50) {
        blockCache.clear();
    }

    blockCache.set(cacheKey, result);
    return result;
}