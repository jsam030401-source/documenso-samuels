import { prisma } from '@documenso/prisma';
import { EnvelopeType, FieldType, RentalApplicationStatus } from '@prisma/client';

import { AppError, AppErrorCode } from '../../errors/app-error';
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

/** The deal-terms columns prefilled onto the added document (mirrors PrefillContext.application). */
const DEAL_TERM_SELECT = {
  street: true,
  unitNumber: true,
  city: true,
  rent: true,
  firstMonthRent: true,
  moveInDate: true,
  leaseTermMonths: true,
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

export type AddParticipantDocumentOptions = {
  teamId: number;
  applicationId: string;
  participantId: string;
  templateEnvelopeId: string;
  requestMetadata?: ApiRequestMetadata;
};

/**
 * Manually attach an ADDITIONAL signing document (from a single-signer team template)
 * to one participant — e.g. a lease or addendum sent after the auto application form.
 * Provisions the envelope (deal terms prefilled via the template's field map), sends it
 * token-live (no email), and appends its recipient to the participant's
 * `additionalRecipientIds` so it shows up in their portal as another form to sign —
 * without disturbing the auto application form (which stays the only auto-provisioned one).
 */
export const addParticipantDocument = async ({
  teamId,
  applicationId,
  participantId,
  templateEnvelopeId,
  requestMetadata,
}: AddParticipantDocumentOptions) => {
  const participant = await prisma.applicationParticipant.findFirst({
    where: { id: participantId, applicationId, application: { teamId } },
    select: {
      id: true,
      name: true,
      email: true,
      application: {
        select: { ownerUserId: true, folderId: true, status: true, ...DEAL_TERM_SELECT },
      },
    },
  });

  if (!participant) {
    throw new AppError(AppErrorCode.NOT_FOUND, { message: 'Participant not found' });
  }

  const { application } = participant;

  if (CLOSED_STATUSES.includes(application.status)) {
    throw new AppError(AppErrorCode.INVALID_REQUEST, { message: 'This application is closed.' });
  }

  // Added documents are single-signer (the tenant), owned by this team.
  const template = await prisma.envelope.findFirst({
    where: { id: templateEnvelopeId, type: EnvelopeType.TEMPLATE, teamId },
    select: { recipients: { orderBy: { id: 'asc' }, select: { id: true } } },
  });

  if (!template || template.recipients.length !== 1) {
    throw new AppError(AppErrorCode.INVALID_BODY, {
      message: 'Pick a template with exactly one signer (the tenant).',
    });
  }

  const templateRecipientId = template.recipients[0].id;

  const [textFields, allParticipants, fieldMap] = await Promise.all([
    prisma.field.findMany({
      where: { envelopeId: templateEnvelopeId, type: FieldType.TEXT },
      select: { id: true, fieldMeta: true },
    }),
    prisma.applicationParticipant.findMany({
      where: { applicationId },
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
    teamId,
    folderId: application.folderId ?? undefined,
    recipients: [{ id: templateRecipientId, name: participant.name, email: participant.email }],
    prefillFields,
    requestMetadata: metadata,
  });

  // Make the token live without emailing. Roll back on failure so we don't strand a draft.
  try {
    await sendDocument({
      id: { type: 'envelopeId', id: envelope.id },
      userId: application.ownerUserId,
      teamId,
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

  await prisma.applicationParticipant.update({
    where: { id: participant.id },
    data: { additionalRecipientIds: { push: recipientIds } },
  });

  return { success: true, added: recipientIds.length };
};
