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
import { ensureSharedApplicantForm } from './ensure-shared-applicant-form';
import { buildPrefillFields } from './prefill';
import { internalRentalRequestMetadata } from './request-metadata';

const CLOSED_STATUSES: RentalApplicationStatus[] = [
  RentalApplicationStatus.APPROVED,
  RentalApplicationStatus.DENIED,
  RentalApplicationStatus.WITHDRAWN,
];

export type EnsureParticipantFormsOptions = {
  participantId: string;
  requestMetadata?: ApiRequestMetadata;
  /**
   * When true (admin "Generate / refresh forms"), an existing UNSIGNED form is
   * deleted and recreated so it picks up the latest deal terms. Signed forms are
   * always left frozen. When false (join / portal-load), an existing form is left
   * untouched and only missing ones are created.
   */
  refresh?: boolean;
};

/**
 * Idempotently provision (and optionally refresh) the signing envelope for one
 * participant from the role template, prefilling the broker's deal terms +
 * auto-derived co-tenant fields. See EnsureParticipantFormsOptions for the
 * create-vs-refresh behaviour. Returns true if it created an envelope this call.
 */
export const ensureParticipantForms = async ({
  participantId,
  requestMetadata,
  refresh = false,
}: EnsureParticipantFormsOptions): Promise<boolean> => {
  const participant = await prisma.applicationParticipant.findUnique({
    where: { id: participantId },
    select: {
      id: true,
      role: true,
      name: true,
      email: true,
      recipientIds: true,
      applicationId: true,
      application: {
        select: {
          teamId: true,
          ownerUserId: true,
          folderId: true,
          status: true,
          applicantTemplateId: true,
          cosignerTemplateId: true,
          sharedApplicantTemplateId: true,
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
        },
      },
    },
  });

  if (!participant) {
    return false;
  }

  const { application } = participant;

  if (CLOSED_STATUSES.includes(application.status)) {
    return false;
  }

  // Shared multi-signer applicants: every roommate signs ONE document. Delegate to the
  // application-level provisioner (idempotent) instead of making a per-person copy.
  if (application.sharedApplicantTemplateId && participant.role === ParticipantRole.APPLICANT) {
    const result = await ensureSharedApplicantForm({
      applicationId: participant.applicationId,
      requestMetadata,
      refresh,
    });

    return result.provisioned;
  }

  const templateEnvelopeId =
    participant.role === ParticipantRole.APPLICANT ? application.applicantTemplateId : application.cosignerTemplateId;

  // No template attached for this role yet → nothing to sign.
  if (!templateEnvelopeId) {
    return false;
  }

  // Existing form handling.
  if (participant.recipientIds.length > 0) {
    if (!refresh) {
      return false;
    }

    const existing = await prisma.recipient.findMany({
      where: { id: { in: participant.recipientIds } },
      select: { signingStatus: true, envelopeId: true, envelope: { select: { status: true } } },
    });

    const isSigned = existing.some(
      (recipient) =>
        recipient.signingStatus === SigningStatus.SIGNED || recipient.envelope.status === DocumentStatus.COMPLETED,
    );

    // Signed forms are frozen — never regenerate them.
    if (isSigned) {
      return false;
    }

    // Drop the stale unsigned envelope(s) so we can recreate with current terms.
    const envelopeIds = [...new Set(existing.map((recipient) => recipient.envelopeId))];

    if (envelopeIds.length > 0) {
      await prisma.envelope.deleteMany({ where: { id: { in: envelopeIds } } });
    }

    await prisma.applicationParticipant.update({ where: { id: participant.id }, data: { recipientIds: [] } });
  }

  // Resolve the template's single signer (enforced at attach time).
  const template = await prisma.envelope.findFirst({
    where: { id: templateEnvelopeId, type: EnvelopeType.TEMPLATE, teamId: application.teamId },
    select: { recipients: { orderBy: { id: 'asc' }, select: { id: true } } },
  });

  if (!template || template.recipients.length !== 1) {
    return false;
  }

  const templateRecipientId = template.recipients[0].id;

  // Prefill the deal terms + auto-derived co-tenant fields. The per-template field
  // map (broker-configured) takes priority; unmapped fields fall back to label auto-match.
  const [textFields, allParticipants, fieldMap] = await Promise.all([
    prisma.field.findMany({
      where: { envelopeId: templateEnvelopeId, type: FieldType.TEXT },
      select: { id: true, fieldMeta: true },
    }),
    prisma.applicationParticipant.findMany({
      where: { applicationId: participant.applicationId },
      select: { name: true },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.rentalTemplateFieldMap.findMany({
      where: { templateEnvelopeId },
      select: { fieldId: true, termKey: true },
    }),
  ]);

  const mapping = new Map(fieldMap.map((row) => [row.fieldId, row.termKey as DealTermKey]));

  const prefillFields = buildPrefillFields(
    textFields,
    { application, participantNames: allParticipants.map((entry) => entry.name) },
    mapping,
  );

  const metadata = requestMetadata ?? internalRentalRequestMetadata();

  const envelope = await createDocumentFromTemplate({
    id: { type: 'envelopeId', id: templateEnvelopeId },
    userId: application.ownerUserId,
    teamId: application.teamId,
    folderId: application.folderId ?? undefined,
    recipients: [{ id: templateRecipientId, name: participant.name, email: participant.email }],
    prefillFields,
    requestMetadata: metadata,
  });

  // Make the token live without emailing. If sending fails, roll the envelope back
  // so we don't leave an orphan draft and the next attempt starts clean.
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

  const recipientIds = envelope.recipients
    .filter((recipient) => recipient.email.toLowerCase() === participant.email.toLowerCase())
    .map((recipient) => recipient.id);

  // Conditional claim so two simultaneous loads don't both attach.
  const claimed = await prisma.applicationParticipant.updateMany({
    where: { id: participant.id, recipientIds: { isEmpty: true } },
    data: { recipientIds },
  });

  return claimed.count > 0;
};

export type EnsureApplicationFormsOptions = {
  applicationId: string;
  teamId: number;
  requestMetadata?: ApiRequestMetadata;
};

/**
 * Admin "Generate / refresh forms": create missing forms AND refresh unsigned
 * ones with the latest deal terms (signed forms stay frozen), for every
 * participant of an application (team-scoped). Returns how many were (re)created.
 */
export const ensureApplicationForms = async ({
  applicationId,
  teamId,
  requestMetadata,
}: EnsureApplicationFormsOptions): Promise<{ provisioned: number; participants: number }> => {
  const application = await prisma.rentalApplication.findFirst({
    where: { id: applicationId, teamId },
    select: { id: true, sharedApplicantTemplateId: true },
  });

  if (!application) {
    return { provisioned: 0, participants: 0 };
  }

  const participants = await prisma.applicationParticipant.findMany({
    where: { applicationId },
    select: { id: true, role: true },
  });

  let provisioned = 0;

  // Shared mode: provision the one shared applicant document once; co-signers still get
  // their individual forms. Otherwise every participant gets their own form.
  const individualParticipants = application.sharedApplicantTemplateId
    ? participants.filter((participant) => participant.role === ParticipantRole.COSIGNER)
    : participants;

  if (application.sharedApplicantTemplateId) {
    const shared = await ensureSharedApplicantForm({ applicationId, requestMetadata, refresh: true });

    if (shared.provisioned) {
      provisioned += 1;
    }
  }

  // Serial: createDocumentFromTemplate increments a shared id and asserts limits.
  for (const participant of individualParticipants) {
    const created = await ensureParticipantForms({
      participantId: participant.id,
      requestMetadata,
      refresh: true,
    });

    if (created) {
      provisioned += 1;
    }
  }

  return { provisioned, participants: participants.length };
};
