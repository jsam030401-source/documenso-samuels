import { prisma } from '@documenso/prisma';

import { requiredChecklist } from './checklist';
import { getParticipantProgress } from './progress';

export type GetRentalApplicationOptions = {
  id: string;
  teamId: number;
};

/**
 * Admin detail view for one application, scoped to the team. Returns each
 * participant with their required checklist + progress (co-signer grouping is
 * done in the UI via `linkedToId`). `null` if not found in this team.
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

  const participants = application.participants.map((participant) => {
    const checklist = requiredChecklist(participant, participant.checklist).map((item) => ({
      id: item.id,
      type: item.type,
      label: item.label,
      status: item.status,
      hasFile: Boolean(item.documentDataId),
    }));

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
      progress: getParticipantProgress(checklist),
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
    },
    participants,
  };
};
