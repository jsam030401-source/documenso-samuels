import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/types';

type ChecklistItemType = Database['public']['Enums']['checklist_item_type'];

export async function generateChecklistForParticipant(
  supabase: SupabaseClient,
  participantId: string,
  role: 'applicant' | 'cosigner',
  isStudent: boolean,
) {
  // Check if checklist already exists
  const { data: existing } = await supabase
    .from('checklist_items')
    .select('id')
    .eq('participant_id', participantId)
    .limit(1);

  if (existing && existing.length > 0) {
    return;
  }

  // Documents to submit only — forms tracked separately via template_instances
  const items: Array<{ participant_id: string; item_type: ChecklistItemType; status: 'pending' }> = [];

  if (role === 'applicant') {
    items.push({ participant_id: participantId, item_type: 'id', status: 'pending' });
    if (!isStudent) {
      items.push({ participant_id: participantId, item_type: 'income', status: 'pending' });
    }
  } else {
    // Co-signer always: ID + income
    items.push({ participant_id: participantId, item_type: 'id', status: 'pending' });
    items.push({ participant_id: participantId, item_type: 'income', status: 'pending' });
  }

  if (items.length > 0) {
    await supabase.from('checklist_items').insert(items as never[]);
  }
}

export async function generateChecklistsForDeal(supabase: SupabaseClient, dealId: string) {
  const { data: participantsData } = await supabase
    .from('participants')
    .select('id, role, is_student')
    .eq('deal_id', dealId);

  const participants = (participantsData ?? []) as Array<{
    id: string;
    role: 'applicant' | 'cosigner';
    is_student: boolean;
  }>;

  for (const p of participants) {
    await generateChecklistForParticipant(supabase, p.id, p.role, p.is_student);
  }
}
