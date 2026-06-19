import type { Database } from '@/lib/supabase/types';

type ChecklistItem = Database['public']['Tables']['checklist_items']['Row'];

type InstanceLike = {
  id?: string;
  status: string;
  fields_json: unknown;
};

/**
 * Calculate participant progress across checklist docs AND form instances.
 *
 * @param checklist - This participant's checklist items
 * @param instances - Template instances already filtered to those where this
 *                    participant has at least one assigned field
 * @param participantId - Used to verify field assignment (defensive check)
 */
export function getParticipantProgress(
  checklist: ChecklistItem[],
  instances: InstanceLike[],
  participantId: string,
  personallySignedIds?: Set<string>,
): { completed: number; total: number } {
  // --- Checklist docs ---
  const completedDocs = checklist.filter(
    (item) => item.status === 'uploaded' || item.status === 'signed' || item.status === 'approved',
  ).length;

  // --- Form instances ---
  // Only count instances where this participant actually has assigned fields.
  const assignedInstances = instances.filter((inst) => {
    const fields = (Array.isArray(inst.fields_json) ? inst.fields_json : []) as Array<{ assignedTo?: string | null }>;
    return fields.some((f) => f.assignedTo === participantId);
  });

  // A form is "complete for this participant" when:
  // - The instance is completed (all signers done), OR
  // - This participant has personally signed (for multi-signer shared forms
  //   where instance stays "sent" until all sign)
  const completedForms = assignedInstances.filter(
    (inst) => inst.status === 'completed' || (inst.id != null && personallySignedIds?.has(inst.id) === true),
  ).length;

  return {
    completed: completedDocs + completedForms,
    total: checklist.length + assignedInstances.length,
  };
}
