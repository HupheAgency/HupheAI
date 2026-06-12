import { SupabaseClient } from '@supabase/supabase-js';

/**
 * Update de bestaande helper zodat geuploade en gegenereerde beelden 
 * worden opgeslagen in Supabase Storage bij share en export.
 */

export async function cleanupAndUploadAsset(
    supabase: SupabaseClient,
    presentationId: string,
    assetName: string,
    assetData: File | Blob | ArrayBuffer,
    contentType: string
): Promise<string> {
    // Generate unique file path
    const filePath = `presentations/${presentationId}/assets/${Date.now()}_${assetName}`;
    
    // Upload file to Supabase Storage
    const { data, error } = await supabase.storage
        .from('presentation_assets')
        .upload(filePath, assetData, {
            contentType: contentType,
            upsert: true
        });

    if (error) {
        throw new Error(`Upload failed: ${error.message}`);
    }

    // Retrieve the public URL for the frontend to use
    const { data: publicUrlData } = supabase.storage
        .from('presentation_assets')
        .getPublicUrl(filePath);

    return publicUrlData.publicUrl;
}