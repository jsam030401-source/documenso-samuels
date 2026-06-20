import { prisma } from '@documenso/prisma';
import { ChecklistItemStatus, ChecklistItemType, ParticipantRole } from '@prisma/client';

import { AppError, AppErrorCode } from '../../errors/app-error';

export type SetParticipantStudentOptions = {
  teamId: number;
  applicationId: string;
  participantId: string;
  isStudent: boolean;
};

/**
 * Switch an applicant between student and non-student (team-scoped) — e.g. when a
 * student picked the wrong type on join. Students skip the proof-of-income
 * requirement; non-students need it, so flipping back to non-student re-adds the
 * INCOME checklist item if it's missing. Only applicants carry this distinction
 * (co-signers always submit ID + income).
 */
export const setParticipantStudent = async ({
  teamId,
  applicationId,
  participantId,
  isStudent,
}: SetParticipantStudentOptions) => {
  const participant = await prisma.applicationParticipant.findFirst({
    where: { id: participantId, applicationId, application: { teamId } },
    select: { id: true, role: true },
  });

  if (!participant) {
    throw new AppError(AppErrorCode.NOT_FOUND, { message: 'Participant not found' });
  }

  if (participant.role !== ParticipantRole.APPLICANT) {
    throw new AppError(AppErrorCode.INVALID_BODY, {
      message: 'Only applicants can be marked as students.',
    });
  }

  await prisma.applicationParticipant.update({
    where: { id: participant.id },
    data: { isStudent },
  });

  // A non-student must submit proof of income — make sure that item exists. (When
  // switching to student we leave any INCOME item in place; the required-checklist
  // read filter simply hides it, so a previously uploaded file isn't destroyed.)
  if (!isStudent) {
    const incomeItems = await prisma.checklistItem.count({
      where: { participantId: participant.id, type: ChecklistItemType.INCOME },
    });

    if (incomeItems === 0) {
      await prisma.checklistItem.create({
        data: {
          participantId: participant.id,
          type: ChecklistItemType.INCOME,
          status: ChecklistItemStatus.PENDING,
        },
      });
    }
  }

  return { success: true };
};
