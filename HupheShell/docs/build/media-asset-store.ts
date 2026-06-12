export interface MediaAsset {
    id: string; // uuid (crypto.randomUUID())
    name: string; // bestandsnaam of door gebruiker gegeven naam
    src: string; // base64 data URL (bijv. "data:image/jpeg;base64,...")
    mimeType: string; // 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'
    width?: number; // pixels
    height?: number; // pixels
    createdAt: string; // ISO 8601
    updatedAt: string;
}

const STORAGE_KEY = 'huphe:media-assets:v1';
const MAX_ASSETS = 200;

export function loadAssets(): MediaAsset[] {
    if (typeof window === 'undefined' || !window.localStorage) return [];
    try {
        const data = window.localStorage.getItem(STORAGE_KEY);
        if (!data) return [];

        const parsed = JSON.parse(data) as MediaAsset[];
        if (!Array.isArray(parsed)) return [];

        // Sorteer nieuwste updatedAt eerst
        return parsed.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    } catch (e) {
        console.error('Error loading media assets from localStorage:', e);
        return [];
    }
}

export function getAsset(id: string): MediaAsset | undefined {
    const assets = loadAssets();
    return assets.find(asset => asset.id === id);
}

export function upsertAsset(asset: MediaAsset): MediaAsset[] {
    if (typeof window === 'undefined' || !window.localStorage) return [];
    try {
        let assets = loadAssets();
        const existingIdx = assets.findIndex(a => a.id === asset.id);

        if (existingIdx >= 0) {
            assets[existingIdx] = asset;
        } else {
            assets.push(asset);
        }

        // Sorteer en limiteer tot MAX_ASSETS (oudste worden aan het eind van de array afgeknipt)
        assets.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
        const limitedAssets = assets.slice(0, MAX_ASSETS);

        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(limitedAssets));
        return limitedAssets;
    } catch (e) {
        console.error('Error saving media asset to localStorage:', e);
        return loadAssets(); // Geef huidige (onveranderde) lijst terug bij fout
    }
}

export function removeAsset(id: string): MediaAsset[] {
    const assets = loadAssets();
    const filtered = assets.filter(asset => asset.id !== id);
    if (typeof window !== 'undefined' && window.localStorage) {
        try {
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
        } catch (e) {
            console.error('Error removing media asset from localStorage:', e);
        }
    }
    return filtered;
}