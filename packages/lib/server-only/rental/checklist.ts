import { prisma } from '@documenso/prisma';
import { ChecklistItemStatus, ChecklistItemType, ParticipantRole } from '@prisma/client';

/**
 * The single source of truth for which supporting documents a participant must
 * submit. Called on join (to seed the checklist) and nowhere else duplicates it.
 *
 * - Applicant: ID, plus INCOME unless they are a student.
 * - Co-signer: always ID + INCOME.
 */
export const generateChecklist = (role: ParticipantRole, isStudent: boolean): ChecklistItemType[] => {
  if (role === ParticipantRole.APPLICANT) {
    return isStudent ? [ChecklistItemType.ID] : [ChecklistItemType.ID, ChecklistItemType.INCOME];
  }

  return [ChecklistItemType.ID, ChecklistItemType.INCOME];
};

/**
 * The ONLY place the "students skip income" rule is applied at read time.
 * Filter a participant's checklist items down to the ones actually required of
 * them before computing progress or rendering the upload cards.
 */
export const requiredChecklist = <T extends { type: ChecklistItemType }>(
  participant: { isStudent: boolean },
  items: T[],
): T[] => {
  if (!participant.isStudent) {
    return items;
  }

  return items.filter((item) => item.type !== ChecklistItemType.INCOME);
};

/**
 * Seed a participant's checklist on join. Idempotent: if the participant already
 * has checklist items, this is a no-op.
 */
export const createChecklistForParticipant = async ({
  participantId,
  role,
  isStudent,
}: {
  participantId: string;
  role: ParticipantRole;
  isStudent: boolean;
}) => {
  const existing = await prisma.checklistItem.count({ where: { participantId } });

  if (existing > 0) {
    return;
  }

  const types = generateChecklist(role, isStudent);

  await prisma.checklistItem.createMany({
    data: types.map((type) => ({
      participantId,
      type,
      status: ChecklistItemStatus.PENDING,
    })),
  });
};
