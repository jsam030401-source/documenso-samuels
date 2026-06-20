import { prisma } from '@documenso/prisma';
import { ParticipantRole } from '@prisma/client';

import { AppError, AppErrorCode } from '../../errors/app-error';

export type RemoveParticipantOptions = {
  teamId: number;
  applicationId: string;
  participantId: string;
};

/**
 * Remove a participant from an application (team-scoped). Removing an APPLICANT
 * removes their whole group — the applicant plus every co-signer linked to them —
 * since the co-signers only exist to support that applicant. Removing a lone
 * co-signer removes just that person.
 *
 * Deletes each removed participant's signing envelopes (which cascades their
 * recipients + fields) and their checklist items (cascaded by the participant
 * delete), plus a best-effort cleanup of any generated packet blob.
 */
export const removeParticipant = async ({ teamId, applicationId, participantId }: RemoveParticipantOptions) => {
  const participant = await prisma.applicationParticipant.findFirst({
    where: { id: participantId, applicationId, application: { teamId } },
    select: { id: true, role: true },
  });

  if (!participant) {
    throw new AppError(AppErrorCode.NOT_FOUND, { message: 'Participant not found' });
  }

  const ids = [participant.id];

  // Applicant => take their co-signers with them.
  if (participant.role === ParticipantRole.APPLICANT) {
    const cosigners = await prisma.applicationParticipant.findMany({
      where: { applicationId, linkedToId: participant.id },
      select: { id: true },
    });

    ids.push(...cosigners.map((cosigner) => cosigner.id));
  }

  const targets = await prisma.applicationParticipant.findMany({
    where: { id: { in: ids } },
    select: { id: true, recipientIds: true, packetDataId: true },
  });

  const recipientIds = targets.flatMap((target) => target.recipientIds);
  const packetDataIds = targets.map((target) => target.packetDataId).filter((id): id is string => id !== null);

  // Delete the signing envelopes these recipients belong to (cascades recipients + fields).
  if (recipientIds.length > 0) {
    const recipients = await prisma.recipient.findMany({
      where: { id: { in: recipientIds } },
      select: { envelopeId: true },
    });

    const envelopeIds = [...new Set(recipients.map((recipient) => recipient.envelopeId))];

    if (envelopeIds.length > 0) {
      await prisma.envelope.deleteMany({ where: { id: { in: envelopeIds } } });
    }
  }

  // Delete the participants themselves (cascades their checklist items).
  await prisma.applicationParticipant.deleteMany({ where: { id: { in: ids } } });

  // Best-effort cleanup of generated packet blobs (no relation, scalar FK).
  if (packetDataIds.length > 0) {
    await prisma.documentData.deleteMany({ where: { id: { in: packetDataIds } } }).catch(() => null);
  }

  return { removed: ids.length };
};
