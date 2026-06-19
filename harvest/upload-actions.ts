'use server';

import { revalidatePath } from 'next/cache';
import { maybeNotifyDealComplete } from '@/lib/notify/deal-complete';
import { sendTelegramAsync } from '@/lib/notify/telegram';
import { createServiceClient } from '@/lib/supabase/server';
import type { Database } from '@/lib/supabase/types';

type ChecklistItem = Database['public']['Tables']['checklist_items']['Row'];

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'pdf']);
const ALLOWED_MIME_PREFIXES = ['image/', 'application/pdf'];

export async function uploadChecklistFile(
  participantId: string,
  checklistItemId: string,
  formData: FormData,
): Promise<{ success?: boolean; error?: string }> {
  try {
    const file = formData.get('file') as File;

    console.log(`[upload] Step 1: received file — name=${file?.name}, type=${file?.type}, size=${file?.size}`);

    if (!file || file.size === 0) {
      return { error: 'No file selected.' };
    }

    if (file.size > MAX_FILE_SIZE) {
      return { error: `File too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Maximum is 10MB.` };
    }

    // Server-side type check
    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
    const extAllowed = ext && ALLOWED_EXTENSIONS.has(ext);
    const mimeAllowed = ALLOWED_MIME_PREFIXES.some((p) => file.type.startsWith(p));
    if (!extAllowed && !mimeAllowed) {
      console.log(`[upload] Rejected: ext=${ext}, type=${file.type}`);
      return { error: 'Unsupported file type. Please upload a JPG, PNG, WEBP, or PDF.' };
    }

    console.log('[upload] Step 2: creating service client');
    const supabase = await createServiceClient();

    console.log(`[upload] Step 3: looking up participant ${participantId}`);
    const { data: participantData, error: pError } = await supabase
      .from('participants')
      .select('id, deal_id, role, people(name), deals(workspace_id, group_link_slug, name)')
      .eq('id', participantId)
      .single();

    if (pError) {
      console.error('[upload] Step 3 FAILED — participant lookup:', pError);
      return { error: 'Could not verify your identity. Please refresh and try again.' };
    }

    const participant = participantData as {
      id: string;
      deal_id: string;
      role: string;
      people: { name: string } | null;
      deals: { workspace_id: string; group_link_slug: string; name: string | null };
    } | null;

    if (!participant) {
      console.error('[upload] Step 3 FAILED — participant is null');
      return { error: 'Participant not found.' };
    }

    console.log(`[upload] Step 4: looking up checklist item ${checklistItemId}`);
    const { data: itemData, error: itemError } = await supabase
      .from('checklist_items')
      .select('*')
      .eq('id', checklistItemId)
      .eq('participant_id', participantId)
      .single();

    if (itemError) {
      console.error('[upload] Step 4 FAILED — checklist lookup:', itemError);
      return { error: 'Checklist item not found. Please refresh and try again.' };
    }

    const item = itemData as ChecklistItem | null;

    if (!item) {
      console.error('[upload] Step 4 FAILED — item is null');
      return { error: 'Checklist item not found.' };
    }

    // Build storage path
    const fileExt = file.name.split('.').pop()?.toLowerCase() ?? 'bin';
    const storagePath = `${participant.deals.workspace_id}/${participant.deal_id}/${participantId}/${item.item_type}_${Date.now()}.${fileExt}`;
    console.log(`[upload] Step 5: uploading to path=${storagePath}, size=${file.size}`);

    // Convert File to ArrayBuffer for reliable upload
    const arrayBuffer = await file.arrayBuffer();
    console.log(`[upload] Step 5b: arrayBuffer ready, byteLength=${arrayBuffer.byteLength}`);

    // Upload to Supabase Storage
    const { error: uploadError } = await supabase.storage.from('staging').upload(storagePath, arrayBuffer, {
      contentType: file.type || 'application/octet-stream',
      upsert: false,
    });

    if (uploadError) {
      console.error('[upload] Step 5 FAILED — storage upload:', uploadError);
      if (uploadError.message.includes('Bucket not found')) {
        return { error: 'Storage not configured. Please contact the administrator.' };
      }
      if (uploadError.message.includes('already exists')) {
        // Retry with upsert
        console.log('[upload] Step 5 retry with upsert=true');
        const { error: retryError } = await supabase.storage.from('staging').upload(storagePath, arrayBuffer, {
          contentType: file.type || 'application/octet-stream',
          upsert: true,
        });
        if (retryError) {
          console.error('[upload] Step 5 retry FAILED:', retryError);
          return { error: `Upload failed: ${retryError.message}` };
        }
      } else {
        return { error: `Upload failed: ${uploadError.message}` };
      }
    }

    console.log('[upload] Step 6: updating checklist item status');

    const { error: updateError } = await supabase
      .from('checklist_items')
      .update({
        status: 'uploaded',
        staging_file_url: storagePath,
      } as never)
      .eq('id', checklistItemId);

    if (updateError) {
      console.error('[upload] Step 6 FAILED — checklist update:', updateError);
      return { error: 'File uploaded but status update failed. Please refresh.' };
    }

    console.log('[upload] Step 7: revalidating paths');
    revalidatePath(`/g/${participant.deals.group_link_slug}`);
    revalidatePath(`/p/${participantId}`);

    const itemLabel = item.item_type.replace(/_/g, ' ');
    const personName = participant.people?.name ?? 'Someone';
    sendTelegramAsync(
      `📎 ${personName} uploaded ${itemLabel} (${file.name}) in "${participant.deals.name ?? 'Untitled deal'}"`,
    );

    await maybeNotifyDealComplete(supabase, participant.deal_id);

    console.log('[upload] SUCCESS');
    return { success: true };
  } catch (e) {
    console.error('[upload] CATCH — unexpected error:', e);
    // Include the actual error message for debugging
    const msg = e instanceof Error ? e.message : String(e);
    return { error: `Upload failed: ${msg}` };
  }
}
