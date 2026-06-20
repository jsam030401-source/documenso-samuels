import { prisma } from '@documenso/prisma';
import { EnvelopeType, ParticipantRole, RentalApplicationStatus } from '@prisma/client';

import type { ApiRequestMetadata } from '../../universal/extract-request-metadata';
import { sendDocument } from '../document/send-document';
import { createDocumentFromTemplate } from '../template/create-document-from-template';
import { internalRentalRequestMetadata } from './request-metadata';

const CLOSED_STATUSES: RentalApplicationStatus[] = [
  RentalApplicationStatus.APPROVED,
  RentalApplicationStatus.DENIED,
  RentalApplicationStatus.WITHDRAWN,
];

export type EnsureParticipantFormsOptions = {
  participantId: string;
  requestMetadata?: ApiRequestMetadata;
};

/**
 * Idempotently provision the signing envelope for one participant from the role
 * template attached to their application. Safe to call repeatedly and from any
 * order of events (template attached after someone joined, co-signer joined
 * before the applicant, an old participant predating Phase 2) — that is what
 * makes the portal "self-healing".
 *
 * The envelope is generated as the application's `ownerUserId` (participants are
 * not Documenso users), filed in the application's Folder, and "sent" with
 * `sendEmail: false` so the signing token goes live without emailing anyone
 * (the tenant reaches it from their portal — the manual-share model). We assume
 * a single-signer role template: the participant IS the template's signer.
 *
 * Returns `true` if it created a new envelope this call, `false` otherwise.
 */
export const ensureParticipantForms = async ({
  participantId,
  requestMetadata,
}: EnsureParticipantFormsOptions): Promise<boolean> => {
  const participant = await prisma.applicationParticipant.findUnique({
    where: { id: participantId },
    select: {
      id: true,
      role: true,
      name: true,
      email: true,
      recipientIds: true,
      application: {
        select: {
          teamId: true,
          ownerUserId: true,
          folderId: true,
          status: true,
          applicantTemplateId: true,
          cosignerTemplateId: true,
        },
      },
    },
  });

  if (!participant) {
    return false;
  }

  // Already provisioned. (Read guard; the conditional updateMany below closes
  // most of the remaining race for the rare double-load.)
  if (participant.recipientIds.length > 0) {
    return false;
  }

  const { application } = participant;

  if (CLOSED_STATUSES.includes(application.status)) {
    return false;
  }

  const templateEnvelopeId =
    participant.role === ParticipantRole.APPLICANT ? application.applicantTemplateId : application.cosignerTemplateId;

  // No template attached for this role yet → nothing to sign.
  if (!templateEnvelopeId) {
    return false;
  }

  // Resolve the template's signer recipient. A rental form template has one
  // signer (the tenant); we target the first recipient and override it with the
  // participant's identity.
  const template = await prisma.envelope.findFirst({
    where: { id: templateEnvelopeId, type: EnvelopeType.TEMPLATE, teamId: application.teamId },
    select: { recipients: { orderBy: { id: 'asc' }, select: { id: true } } },
  });

  if (!template || template.recipients.length === 0) {
    // Misconfigured template (deleted, or has no recipient) — skip silently so a
    // portal load never 500s on it.
    return false;
  }

  const templateRecipientId = template.recipients[0].id;
  const metadata = requestMetadata ?? internalRentalRequestMetadata();

  const envelope = await createDocumentFromTemplate({
    id: { type: 'envelopeId', id: templateEnvelopeId },
    userId: application.ownerUserId,
    teamId: application.teamId,
    folderId: application.folderId ?? undefined,
    recipients: [{ id: templateRecipientId, name: participant.name, email: participant.email }],
    requestMetadata: metadata,
  });

  // Make the token live without emailing — the tenant signs from their portal.
  await sendDocument({
    id: { type: 'envelopeId', id: envelope.id },
    userId: application.ownerUserId,
    teamId: application.teamId,
    sendEmail: false,
    requestMetadata: metadata,
  });

  // Persist the recipient id(s) we assigned to this participant.
  const recipientIds = envelope.recipients
    .filter((recipient) => recipient.email.toLowerCase() === participant.email.toLowerCase())
    .map((recipient) => recipient.id);

  // Conditional write: only claim if still un-provisioned, so two simultaneous
  // portal loads don't both attach. If a concurrent call won, we leave the
  // (rare) extra draft envelope in the folder for the admin to clean up.
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
 * Admin "Sync forms": provision missing signing envelopes for every participant
 * of an application (team-scoped). Idempotent — only participants without an
 * envelope get one. Returns how many were newly provisioned.
 */
export const ensureApplicationForms = async ({
  applicationId,
  teamId,
  requestMetadata,
}: EnsureApplicationFormsOptions): Promise<{ provisioned: number; participants: number }> => {
  const participants = await prisma.applicationParticipant.findMany({
    where: { applicationId, application: { teamId } },
    select: { id: true },
  });

  let provisioned = 0;

  // Serial on purpose: createDocumentFromTemplate increments a shared document id
  // and asserts org limits, so we avoid hammering it in parallel.
  for (const participant of participants) {
    const created = await ensureParticipantForms({ participantId: participant.id, requestMetadata });

    if (created) {
      provisioned += 1;
    }
  }

  return { provisioned, participants: participants.length };
};
