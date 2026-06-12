export interface SavedBannerProject {
    id: string;
    type: 'banners';
    name: string; // gebruikersvriendelijke naam, bv. "Zomercampagne"
    imageSrc: string; // base64 data URL
    slides: Array<{
        id: string;
        texts: { role: 'heading' | 'copy'; value: string }[];
    }>;
    enabledFormats: string[];
    createdAt: string; // ISO 8601
    updatedAt: string;
}

export interface SavedPrintProject {
    id: string;
    type: 'print';
    name: string;
    title: string;
    body: string;
    imageSrc?: string;
    format: 'A4' | 'A5' | 'A3' | 'SRA3' | 'DL';
    createdAt: string;
    updatedAt: string;
}

export type AtelierSavedProject = SavedBannerProject | SavedPrintProject;

const BANNER_KEY = 'huphe:banner-projects:v1';
const PRINT_KEY = 'huphe:print-projects:v1';
const MAX_PROJECTS = 50;

/** Generieke helper om projecten in te laden en te sorteren (nieuwste eerst) */
function getProjects<T extends { updatedAt: string }>(key: string): T[] {
    if (typeof window === 'undefined' || !window.localStorage) return [];
    try {
        const data = window.localStorage.getItem(key);
        if (!data) return [];
        const parsed = JSON.parse(data) as T[];
        return Array.isArray(parsed)
            ? parsed.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
            : [];
    } catch (e) {
        console.error(`Error loading projects from ${key}`, e);
        return [];
    }
}

/** Generieke helper om een project te upserten en de limiet te handhaven */
function saveProject<T extends { id: string; updatedAt: string }>(key: string, project: T): void {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
        const projects = getProjects<T>(key);
        const existingIdx = projects.findIndex((p) => p.id === project.id);

        if (existingIdx >= 0) {
            projects[existingIdx] = project;
        } else {
            projects.push(project);
        }

        // Sorteer opnieuw na toevoegen (nieuwste bovenaan)
        projects.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

        // Behoud maximaal 50 projecten (gooi de oudste, achteraan de lijst, weg)
        if (projects.length > MAX_PROJECTS) {
            projects.length = MAX_PROJECTS;
        }

        window.localStorage.setItem(key, JSON.stringify(projects));
    } catch (e) {
        console.error(`Error saving project to ${key}`, e);
    }
}

/** Generieke helper om een project te verwijderen op basis van ID */
function deleteProject<T extends { id: string; updatedAt: string }>(key: string, id: string): void {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
        const projects = getProjects<T>(key);
        const filtered = projects.filter((p) => p.id !== id);
        window.localStorage.setItem(key, JSON.stringify(filtered));
    } catch (e) {
        console.error(`Error deleting project from ${key}`, e);
    }
}

// === Specifieke Exports ===

export const loadBannerProjects = (): SavedBannerProject[] => getProjects<SavedBannerProject>(BANNER_KEY);
export const loadPrintProjects = (): SavedPrintProject[] => getProjects<SavedPrintProject>(PRINT_KEY);

export const saveBannerProject = (project: SavedBannerProject): void => saveProject<SavedBannerProject>(BANNER_KEY, project);
export const savePrintProject = (project: SavedPrintProject): void => saveProject<SavedPrintProject>(PRINT_KEY, project);

export const deleteBannerProject = (id: string): void => deleteProject<SavedBannerProject>(BANNER_KEY, id);
export const deletePrintProject = (id: string): void => deleteProject<SavedPrintProject>(PRINT_KEY, id);