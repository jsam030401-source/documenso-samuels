import { prisma } from '@documenso/prisma';
import { type Prisma, SigningStatus } from '@prisma/client';

import { composeAddress } from './address';
import { ADMIN_ONLY_CHECKLIST_TYPES, isAdminOnlyChecklistType, requiredChecklist } from './checklist';
import { getParticipantProgress } from './progress';

// Decimal | null -> number | null (preserves 0, unlike a truthy check).
const money = (value: Prisma.Decimal | null) => (value === null ? null : Number(value));

export type GetRentalApplicationOptions = {
  id: string;
  teamId: number;
};

/**
 * Admin detail view for one application, scoped to the team. Returns each
 * participant with their (tenant) checklist, signing forms, and combined
 * progress; the admin-only review docs (credit report / proof of deposit) are
 * split out into `adminDocs`, and applicants carry `packetGeneratedAt`. `null`
 * if not found in this team.
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
  const allRecipientIds = application.participants.flatMap((participant) => [
    ...participant.recipientIds,
    ...participant.additionalRecipientIds,
  ]);

  const recipients = allRecipientIds.length
    ? await prisma.recipient.findMany({
        where: { id: { in: allRecipientIds } },
        select: { id: true, signingStatus: true, envelope: { select: { title: true } } },
      })
    : [];

  const recipientById = new Map(recipients.map((recipient) => [recipient.id, recipient]));

  const participants = application.participants.map((participant) => {
    const narrowed = requiredChecklist(participant, participant.checklist);

    // Tenant-uploaded docs drive the participant's progress + checklist display.
    const checklist = narrowed
      .filter((item) => !isAdminOnlyChecklistType(item.type))
      .map((item) => ({
        id: item.id,
        type: item.type,
        label: item.label,
        status: item.status,
        hasFile: Boolean(item.documentDataId),
      }));

    // Admin-only review docs (credit report / proof of deposit), surfaced for the
    // admin upload controls regardless of whether a row exists yet.
    const adminDocs = ADMIN_ONLY_CHECKLIST_TYPES.map((type) => {
      const item = participant.checklist.find((entry) => entry.type === type);

      return {
        type,
        checklistItemId: item?.id ?? null,
        hasFile: Boolean(item?.documentDataId),
      };
    });

    const forms = [...participant.recipientIds, ...participant.additionalRecipientIds]
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
      adminDocs,
      forms,
      packetGeneratedAt: participant.packetGeneratedAt,
      progress: getParticipantProgress(checklist, formCounts),
    };
  });

  return {
    application: {
      id: application.id,
      slug: application.slug,
      title: application.title,
      // Composed display line + the raw split parts for editing.
      unitAddress: composeAddress(application),
      street: application.street,
      unitNumber: application.unitNumber,
      city: application.city,
      rent: money(application.rent),
      firstMonthRent: money(application.firstMonthRent),
      moveInDate: application.moveInDate,
      leaseTermMonths: application.leaseTermMonths,
      leaseEndDate: application.leaseEndDate,
      petsAllowed: application.petsAllowed,
      lastMonthRent: money(application.lastMonthRent),
      securityDeposit: money(application.securityDeposit),
      brokerFee: money(application.brokerFee),
      lockChangeFee: money(application.lockChangeFee),
      applicationFee: money(application.applicationFee),
      todaysDeposit: money(application.todaysDeposit),
      balanceDue: money(application.balanceDue),
      status: application.status,
      createdAt: application.createdAt,
      applicantTemplateId: application.applicantTemplateId,
      cosignerTemplateId: application.cosignerTemplateId,
    },
    participants,
  };
};
