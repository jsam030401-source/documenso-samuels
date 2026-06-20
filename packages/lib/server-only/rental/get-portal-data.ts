import { prisma } from '@documenso/prisma';
import { SigningStatus } from '@prisma/client';

import { composeAddress } from './address';
import { isAdminOnlyChecklistType, requiredChecklist } from './checklist';
import { ensureParticipantForms } from './ensure-participant-forms';
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

  // Tenant portal shows only the documents the tenant uploads — never the
  // admin-only review docs (credit report / proof of deposit).
  const items = requiredChecklist(participant, participant.checklist)
    .filter((item) => !isAdminOnlyChecklistType(item.type))
    .map((item) => ({
      id: item.id,
      type: item.type,
      label: item.label,
      status: item.status,
      hasFile: Boolean(item.documentDataId),
    }));

  // Self-healing provisioning: make sure this participant has their signing
  // envelope if a role template is attached. Idempotent + cheap once provisioned.
  // Never let a provisioning hiccup take down the tenant's portal — on failure we
  // just render without the form; the next load (or admin "Sync forms") retries.
  try {
    await ensureParticipantForms({ participantId: participant.id });
  } catch (error) {
    console.error('[rental] ensureParticipantForms failed for', participant.id, error);
  }

  // Re-read after provisioning, then resolve each form's live signing status.
  const refreshed = await prisma.applicationParticipant.findUnique({
    where: { id: participant.id },
    select: { recipientIds: true },
  });

  const recipientIds = refreshed?.recipientIds ?? participant.recipientIds;

  const recipients = recipientIds.length
    ? await prisma.recipient.findMany({
        where: { id: { in: recipientIds } },
        select: { token: true, signingStatus: true, envelope: { select: { title: true } } },
      })
    : [];

  const forms = recipients.map((recipient) => ({
    token: recipient.token,
    title: recipient.envelope.title,
    signed: recipient.signingStatus === SigningStatus.SIGNED,
  }));

  const progress = getParticipantProgress(items, {
    signed: forms.filter((form) => form.signed).length,
    total: forms.length,
  });

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
      unitAddress: composeAddress(application),
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
    forms,
    progress,
  };
};

export type PortalData = NonNullable<Awaited<ReturnType<typeof getPortalData>>>;
