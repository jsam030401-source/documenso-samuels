import { prisma } from '@documenso/prisma';

import { applicantPacketFilename } from './build-applicant-packet';

export type GetApplicantPacketFileOptions = {
  teamId: number;
  participantId: string;
};

/**
 * Resolve the stored packet file for an applicant, scoped to the team that owns
 * the application. The caller must already have verified the requesting user is
 * a member of `teamId`. `null` if not in this team or no packet has been
 * generated yet. The caller streams the bytes via `getFileServerSide`.
 */
export const getApplicantPacketFile = async ({ teamId, participantId }: GetApplicantPacketFileOptions) => {
  const participant = await prisma.applicationParticipant.findFirst({
    where: { id: participantId, application: { teamId } },
    select: { name: true, packetDataId: true },
  });

  if (!participant?.packetDataId) {
    return null;
  }

  const documentData = await prisma.documentData.findUnique({
    where: { id: participant.packetDataId },
  });

  if (!documentData) {
    return null;
  }

  return { documentData, filename: applicantPacketFilename(participant.name) };
};
