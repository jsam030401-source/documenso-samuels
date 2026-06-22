import { prisma } from '@documenso/prisma';

import { AppError, AppErrorCode } from '../../errors/app-error';
import type { ApiRequestMetadata } from '../../universal/extract-request-metadata';
import { ensureParticipantForms } from './ensure-participant-forms';

export type ReissueParticipantFormOptions = {
  teamId: number;
  applicationId: string;
  participantId: string;
  requestMetadata?: ApiRequestMetadata;
};

/**
 * Void a participant's auto application form — even if it's already SIGNED — and send a
 * fresh, prefilled, unsigned copy back to their portal. This is the deliberate escape
 * hatch from the "signed forms are frozen" rule, for when the wrong terms got signed and
 * the tenant needs to re-sign. Their uploaded checklist docs and any admin-added extra
 * documents (additionalRecipientIds) are left untouched.
 */
export const reissueParticipantForm = async ({
  teamId,
  applicationId,
  participantId,
  requestMetadata,
}: ReissueParticipantFormOptions): Promise<{ reissued: boolean }> => {
  const participant = await prisma.applicationParticipant.findFirst({
    where: { id: participantId, applicationId, application: { teamId } },
    select: { id: true, recipientIds: true },
  });

  if (!participant) {
    throw new AppError(AppErrorCode.NOT_FOUND, { message: 'Participant not found' });
  }

  // Delete the current application-form envelope(s) — signed or not — and clear the pointer
  // so the provisioner treats this participant as having no form and builds a fresh one.
  if (participant.recipientIds.length > 0) {
    const recipients = await prisma.recipient.findMany({
      where: { id: { in: participant.recipientIds } },
      select: { envelopeId: true },
    });

    const envelopeIds = [...new Set(recipients.map((recipient) => recipient.envelopeId))];

    if (envelopeIds.length > 0) {
      await prisma.envelope.deleteMany({ where: { id: { in: envelopeIds } } });
    }

    await prisma.applicationParticipant.update({
      where: { id: participant.id },
      data: { recipientIds: [] },
    });
  }

  // Recreate a fresh, unsigned form with the current deal terms.
  const reissued = await ensureParticipantForms({ participantId, requestMetadata, refresh: true });

  return { reissued };
};
