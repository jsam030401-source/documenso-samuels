import { prisma } from '@documenso/prisma';
import { DocumentDataType } from '@prisma/client';
import { base64 } from '@scure/base';

import { buildApplicantPacket } from './build-applicant-packet';

export type GenerateApplicantPacketOptions = {
  teamId: number;
  applicationId: string;
  applicantParticipantId: string;
};

export type GenerateApplicantPacketResult = {
  /** Null when there was nothing to package yet (no signed forms or uploads). */
  generatedAt: Date | null;
  skipped: string[];
};

/**
 * Build an applicant's merged packet and **store** it (matches PADS' "Generate
 * Packages"): the bytes are persisted as a DocumentData and pointed at by
 * `ApplicationParticipant.packetDataId`, with `packetGeneratedAt` for provenance.
 * Re-running regenerates and swaps in the new file, deleting the previous one.
 * The download route then serves the stored file (always the last generated
 * version), and the returned `skipped` list surfaces anything left out.
 */
export const generateApplicantPacket = async ({
  teamId,
  applicationId,
  applicantParticipantId,
}: GenerateApplicantPacketOptions): Promise<GenerateApplicantPacketResult> => {
  // buildApplicantPacket is team-scoped and returns null for a non-applicant /
  // wrong-team id, so a non-null result means the id is valid to write to.
  const packet = await buildApplicantPacket({ teamId, applicationId, applicantParticipantId });

  if (!packet) {
    return { generatedAt: null, skipped: [] };
  }

  // Store the merged PDF (base64 / database transport, same as every other file
  // in this deployment). initialData is left empty — there is no "original" for a
  // derived artifact, and we avoid duplicating a potentially large blob.
  const documentData = await prisma.documentData.create({
    data: {
      type: DocumentDataType.BYTES_64,
      data: base64.encode(packet.bytes),
      initialData: '',
    },
  });

  const previous = await prisma.applicationParticipant.findUnique({
    where: { id: applicantParticipantId },
    select: { packetDataId: true },
  });

  const generatedAt = new Date();

  await prisma.applicationParticipant.update({
    where: { id: applicantParticipantId },
    data: { packetDataId: documentData.id, packetGeneratedAt: generatedAt },
  });

  // Clean up the superseded packet file (scalar FK — no cascade).
  if (previous?.packetDataId && previous.packetDataId !== documentData.id) {
    await prisma.documentData.delete({ where: { id: previous.packetDataId } }).catch(() => null);
  }

  return { generatedAt, skipped: packet.skipped };
};
