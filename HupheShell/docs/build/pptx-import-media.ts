import JSZip from 'jszip';

/**
 * Helper die afbeeldingen, grafieken (als PNG-render) en tabellen 
 * (als structured data) uit een PPTX-bestand extraheert.
 */

export interface ExtractedMedia {
    slideIndex: number;
    type: 'image' | 'chart' | 'table';
    data: string | object;
}

export async function extractMediaFromPPTX(pptxBuffer: ArrayBuffer): Promise<ExtractedMedia[]> {
    const zip = await JSZip.loadAsync(pptxBuffer);
    const extracted: ExtractedMedia[] = [];

    // Extract images from ppt/media/
    const mediaFiles = Object.keys(zip.files).filter(name => name.startsWith('ppt/media/'));
    
    for (const [index, filename] of mediaFiles.entries()) {
        const fileData = await zip.file(filename)?.async('base64');
        if (fileData) {
            // Simplified slide mapping - in real implementation this parses slideX.xml.rels
            extracted.push({
                slideIndex: index + 1,
                type: 'image',
                data: `data:image/png;base64,${fileData}`
            });
        }
    }

    // Extraction for charts and tables would involve parsing the slide XMLs (e.g. ppt/slides/slide1.xml)
    // and identifying <c:chart> and <a:tbl> nodes.

    return extracted;
}