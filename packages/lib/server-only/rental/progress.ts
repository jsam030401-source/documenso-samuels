import { ChecklistItemStatus } from '@prisma/client';

/**
 * Participant progress = (supporting docs submitted) + (forms signed) out of
 * (required docs) + (forms assigned).
 *
 * Phase 1 only passes checklist items; `forms` defaults to zero. Phase 2 will
 * pass the participant's Documenso recipient counts (signed / total) so the same
 * bar covers Forms to Sign without changing any callers.
 *
 * Pass the items already narrowed by `requiredChecklist()` so students are not
 * penalised for an income row they never had to provide.
 */
export const getParticipantProgress = (
  items: { status: ChecklistItemStatus }[],
  forms: { signed: number; total: number } = { signed: 0, total: 0 },
): { completed: number; total: number } => {
  const completedDocs = items.filter(
    (item) => item.status === ChecklistItemStatus.UPLOADED || item.status === ChecklistItemStatus.APPROVED,
  ).length;

  return {
    completed: completedDocs + forms.signed,
    total: items.length + forms.total,
  };
};
