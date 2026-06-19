import { prisma } from '@documenso/prisma';

import { requiredChecklist } from './checklist';
import { getParticipantProgress } from './progress';

export type GetPortalDataOptions = {
  accessToken: string;
};

/**
 * Resolve everything the portal renders for one participant, scoped entirely by
 * their `accessToken`. "Your Group" exposes names/roles only — never another
 * member's files. Decimal/relations are flattened to JSON-safe values.
 */
export const getPortalData = async ({ accessToken }: GetPortalDataOptions) => {
  const participant = await prisma.applicationParticipant.findUnique({
    where: { accessToken },
    include: {
      checklist: { orderBy: { createdAt: 'asc' } },
      linkedTo: { select: { name: true } },
      application: {
        include: {
          participants: {
            select: {
              id: true,
              name: true,
              role: true,
              isStudent: true,
              linkedTo: { select: { name: true } },
            },
            orderBy: { createdAt: 'asc' },
          },
        },
      },
    },
  });

  if (!participant) {
    return null;
  }

  const { application } = participant;

  const items = requiredChecklist(participant, participant.checklist).map((item) => ({
    id: item.id,
    type: item.type,
    label: item.label,
    status: item.status,
    hasFile: Boolean(item.documentDataId),
  }));

  // Forms-to-Sign is wired in Phase 2; progress counts checklist only for now.
  const progress = getParticipantProgress(items);

  const group = application.participants
    .filter((other) => other.id !== participant.id)
    .map((other) => ({
      id: other.id,
      name: other.name,
      role: other.role,
      isStudent: other.isStudent,
      linkedToName: other.linkedTo?.name ?? null,
    }));

  return {
    application: {
      slug: application.slug,
      title: application.title,
      unitAddress: application.unitAddress,
      rent: application.rent ? Number(application.rent) : null,
      moveInDate: application.moveInDate,
      status: application.status,
    },
    participant: {
      id: participant.id,
      name: participant.name,
      email: participant.email,
      role: participant.role,
      isStudent: participant.isStudent,
      linkedToName: participant.linkedTo?.name ?? null,
    },
    group,
    checklist: items,
    forms: [] as { token: string; title: string; signed: boolean }[],
    progress,
  };
};

export type PortalData = NonNullable<Awaited<ReturnType<typeof getPortalData>>>;
