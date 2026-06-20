import { prisma } from '@documenso/prisma';
import {
  DocumentStatus,
  EnvelopeType,
  FieldType,
  ParticipantRole,
  RentalApplicationStatus,
  SigningStatus,
} from '@prisma/client';

import type { DealTermKey } from '../../types/rental-deal-terms';
import type { ApiRequestMetadata } from '../../universal/extract-request-metadata';
import { sendDocument } from '../document/send-document';
import { createDocumentFromTemplate } from '../template/create-document-from-template';
import { buildPrefillFields } from './prefill';
import { internalRentalRequestMetadata } from './request-metadata';

const CLOSED_STATUSES: RentalApplicationStatus[] = [
  RentalApplicationStatus.APPROVED,
  RentalApplicationStatus.DENIED,
  RentalApplicationStatus.WITHDRAWN,
];

/** The deal-terms columns prefilled onto the shared document (mirrors PrefillContext.application). */
const DEAL_TERM_SELECT = {
  street: true,
  unitNumber: true,
  city: true,
  rent: true,
  firstMonthRent: true,
  moveInDate: true,
  leaseTermMonths: true,
  leaseStartDate: true,
  leaseEndDate: true,
  petsAllowed: true,
  lastMonthRent: true,
  securityDeposit: true,
  brokerFee: true,
  lockChangeFee: true,
  applicationFee: true,
  todaysDeposit: true,
  balanceDue: true,
} as const;

export type EnsureSharedApplicantFormOptions = {
  applicationId: string;
  requestMetadata?: ApiRequestMetadata;
  /**
   * When true (admin "Generate / refresh forms"), an UNSIGNED shared envelope is
   * torn down and rebuilt so it picks up the latest deal terms + roster. A signed
   * shared envelope is always frozen. When false (join / portal-load), the shared
   * envelope is (re)built only when missing or the roster changed.
   */
  refresh?: boolean;
};

const sortedEmails = (emails: string[]) => [...emails].map((email) => email.toLowerCase()).sort();
const sameRoster = (a: string[], b: string[]) => a.length === b.length && a.every((value, index) => value === b[index]);

/**
 * Provision the ONE shared multi-signer document that every applicant roommate signs
 * (parallel, any order). Only runs when the application has a `sharedApplicantTemplateId`.
 * The roommate roster is bound onto the template's signer slots (Tenant 1..N), unused
 * slots are pruned, deal terms prefill once, and the envelope is sent token-live (no
 * email). It freezes once anyone signs; while unsigned it rebuilds on roster change or
 * an explicit refresh. Idempotent + cheap on the no-op path (safe to call per portal load).
 *
 * Template authoring note: place the prefilled deal-term TEXT fields on the FIRST signer
 * slot (Tenant 1) — it is always bound, so those fields survive when unused slots are pruned.
 */
export const ensureSharedApplicantForm = async ({
  applicationId,
  requestMetadata,
  refresh = false,
}: EnsureSharedApplicantFormOptions): Promise<{ provisioned: boolean; signers: number }> => {
  const application = await prisma.rentalApplication.findUnique({
    where: { id: applicationId },
    select: {
      id: true,
      teamId: true,
      ownerUserId: true,
      folderId: true,
      status: true,
      sharedApplicantTemplateId: true,
      sharedApplicantEnvelopeId: true,
      ...DEAL_TERM_SELECT,
    },
  });

  if (!application || !application.sharedApplicantTemplateId || CLOSED_STATUSES.includes(application.status)) {
    return { provisioned: false, signers: 0 };
  }

  const templateEnvelopeId = application.sharedApplicantTemplateId;

  const applicants = await prisma.applicationParticipant.findMany({
    where: { applicationId, role: ParticipantRole.APPLICANT },
    select: { id: true, name: true, email: true },
    orderBy: { createdAt: 'asc' },
  });

  if (applicants.length === 0) {
    return { provisioned: false, signers: 0 };
  }

  // Existing shared envelope: freeze if signed, otherwise rebuild on roster change / refresh.
  if (application.sharedApplicantEnvelopeId) {
    const existing = await prisma.envelope.findUnique({
      where: { id: application.sharedApplicantEnvelopeId },
      select: { id: true, status: true, recipients: { select: { email: true, signingStatus: true } } },
    });

    if (existing) {
      const isSigned =
        existing.status === DocumentStatus.COMPLETED ||
        existing.recipients.some((recipient) => recipient.signingStatus === SigningStatus.SIGNED);

      if (isSigned) {
        return { provisioned: false, signers: existing.recipients.length };
      }

      const rosterUnchanged = sameRoster(
        sortedEmails(applicants.map((applicant) => applicant.email)),
        sortedEmails(existing.recipients.map((recipient) => recipient.email)),
      );

      if (rosterUnchanged && !refresh) {
        return { provisioned: false, signers: existing.recipients.length };
      }

      // Tear down the stale unsigned shared envelope so we can rebuild with the current roster + terms.
      await prisma.envelope.delete({ where: { id: existing.id } }).catch(() => null);
    }

    await prisma.applicationParticipant.updateMany({
      where: { applicationId, role: ParticipantRole.APPLICANT },
      data: { recipientIds: [] },
    });
    await prisma.rentalApplication.update({
      where: { id: applicationId },
      data: { sharedApplicantEnvelopeId: null },
    });
  }

  // Load the shared template's signer slots (ordered) + its TEXT fields + the broker's field map.
  const [template, textFields, fieldMap] = await Promise.all([
    prisma.envelope.findFirst({
      where: { id: templateEnvelopeId, type: EnvelopeType.TEMPLATE, teamId: application.teamId },
      select: { recipients: { orderBy: { id: 'asc' }, select: { id: true } } },
    }),
    prisma.field.findMany({
      where: { envelopeId: templateEnvelopeId, type: FieldType.TEXT },
      select: { id: true, fieldMeta: true },
    }),
    prisma.rentalTemplateFieldMap.findMany({
      where: { templateEnvelopeId },
      select: { fieldId: true, termKey: true },
    }),
  ]);

  if (!template || template.recipients.length === 0) {
    return { provisioned: false, signers: 0 };
  }

  const slots = template.recipients;
  const bound = applicants.slice(0, slots.length);

  const mapping = new Map(fieldMap.map((row) => [row.fieldId, row.termKey as DealTermKey]));
  const prefillFields = buildPrefillFields(
    textFields,
    { application, participantNames: applicants.map((applicant) => applicant.name) },
    mapping,
  );

  const metadata = requestMetadata ?? internalRentalRequestMetadata();

  const envelope = await createDocumentFromTemplate({
    id: { type: 'envelopeId', id: templateEnvelopeId },
    userId: application.ownerUserId,
    teamId: application.teamId,
    folderId: application.folderId ?? undefined,
    recipients: bound.map((applicant, index) => ({
      id: slots[index].id,
      name: applicant.name,
      email: applicant.email,
    })),
    prefillFields,
    requestMetadata: metadata,
  });

  // Prune the unused signer slots (createDocumentFromTemplate instantiates ALL template
  // recipients; the unbound ones keep the template's placeholder email). Deleting a
  // recipient cascades its fields.
  const boundEmails = new Set(bound.map((applicant) => applicant.email.toLowerCase()));
  const unusedRecipientIds = envelope.recipients
    .filter((recipient) => !boundEmails.has(recipient.email.toLowerCase()))
    .map((recipient) => recipient.id);

  if (unusedRecipientIds.length > 0) {
    await prisma.recipient.deleteMany({ where: { id: { in: unusedRecipientIds } } });
  }

  // Make every roommate's token live without emailing. Roll back on failure so we don't strand a draft.
  try {
    await sendDocument({
      id: { type: 'envelopeId', id: envelope.id },
      userId: application.ownerUserId,
      teamId: application.teamId,
      sendEmail: false,
      requestMetadata: metadata,
    });
  } catch (error) {
    await prisma.envelope.delete({ where: { id: envelope.id } }).catch(() => null);
    throw error;
  }

  // Claim the shared envelope onto the application FIRST (null-guard so two concurrent
  // loads don't both keep one). Only the winner then writes participant recipientIds, so
  // a loser can't leave recipientIds pointing at the envelope it's about to delete.
  const claimed = await prisma.rentalApplication.updateMany({
    where: { id: applicationId, sharedApplicantEnvelopeId: null },
    data: { sharedApplicantEnvelopeId: envelope.id },
  });

  if (claimed.count === 0) {
    // Someone else provisioned first — discard ours to avoid an orphan.
    await prisma.envelope.delete({ where: { id: envelope.id } }).catch(() => null);
    return { provisioned: false, signers: 0 };
  }

  // Point each bound applicant at THEIR recipient on the shared envelope.
  for (const applicant of bound) {
    const recipientId = envelope.recipients.find(
      (recipient) => recipient.email.toLowerCase() === applicant.email.toLowerCase(),
    )?.id;

    if (recipientId !== undefined) {
      await prisma.applicationParticipant.update({
        where: { id: applicant.id },
        data: { recipientIds: [recipientId] },
      });
    }
  }

  return { provisioned: true, signers: bound.length };
};
