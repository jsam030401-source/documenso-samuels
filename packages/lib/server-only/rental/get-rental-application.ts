import { prisma } from '@documenso/prisma';
import { SigningStatus } from '@prisma/client';

import { requiredChecklist } from './checklist';
import { getParticipantProgress } from './progress';

export type GetRentalApplicationOptions = {
  id: string;
  teamId: number;
};

/**
 * Admin detail view for one application, scoped to the team. Returns each
 * participant with their required checklist, signing forms, and combined
 * progress (co-signer grouping is done in the UI via `linkedToId`), plus which
 * Documenso templates are attached per role. `null` if not found in this team.
 */
export const getRentalApplication = async ({ id, teamId }: GetRentalApplicationOptions) => {
  const application = await prisma.rentalApplication.findFirst({
    where: { id, teamId },
    include: {
      participants: {
        orderBy: { createdAt: 'asc' },
        include: {
          checklist: { orderBy: { createdAt: 'asc' } },
          linkedTo: { select: { id: true, name: true } },
        },
      },
    },
  });

  if (!application) {
    return null;
  }

  // Resolve every participant's signing recipients in one query, then index by id.
  const allRecipientIds = application.participants.flatMap((participant) => participant.recipientIds);

  const recipients = allRecipientIds.length
    ? await prisma.recipient.findMany({
        where: { id: { in: allRecipientIds } },
        select: { id: true, signingStatus: true, envelope: { select: { title: true } } },
      })
    : [];

  const recipientById = new Map(recipients.map((recipient) => [recipient.id, recipient]));

  const participants = application.participants.map((participant) => {
    const checklist = requiredChecklist(participant, participant.checklist).map((item) => ({
      id: item.id,
      type: item.type,
      label: item.label,
      status: item.status,
      hasFile: Boolean(item.documentDataId),
    }));

    const forms = participant.recipientIds
      .map((recipientId) => recipientById.get(recipientId))
      .filter((recipient): recipient is NonNullable<typeof recipient> => Boolean(recipient))
      .map((recipient) => ({
        title: recipient.envelope.title,
        signed: recipient.signingStatus === SigningStatus.SIGNED,
      }));

    const formCounts = { signed: forms.filter((form) => form.signed).length, total: forms.length };

    return {
      id: participant.id,
      name: participant.name,
      email: participant.email,
      phone: participant.phone,
      role: participant.role,
      isStudent: participant.isStudent,
      linkedToId: participant.linkedToId,
      linkedToName: participant.linkedTo?.name ?? null,
      checklist,
      forms,
      progress: getParticipantProgress(checklist, formCounts),
    };
  });

  return {
    application: {
      id: application.id,
      slug: application.slug,
      title: application.title,
      unitAddress: application.unitAddress,
      rent: application.rent ? Number(application.rent) : null,
      moveInDate: application.moveInDate,
      status: application.status,
      createdAt: application.createdAt,
      applicantTemplateId: application.applicantTemplateId,
      cosignerTemplateId: application.cosignerTemplateId,
    },
    participants,
  };
};
