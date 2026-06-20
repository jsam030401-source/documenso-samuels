import { prisma } from '@documenso/prisma';
import { EnvelopeType, type Prisma } from '@prisma/client';

import { AppError, AppErrorCode } from '../../errors/app-error';

export type SetApplicationTemplatesOptions = {
  teamId: number;
  applicationId: string;
  /**
   * Documenso template envelope id (`envelope_…`) to use for the applicant /
   * co-signer signing flow. `null` clears it; `undefined` leaves it unchanged.
   */
  applicantTemplateId?: string | null;
  cosignerTemplateId?: string | null;
  /**
   * Multi-signer "shared" applicant template (1–6 signer slots) — every applicant
   * roommate signs this one document. Mutually exclusive with `applicantTemplateId`
   * (setting one clears the other). `null` clears; `undefined` leaves unchanged.
   */
  sharedApplicantTemplateId?: string | null;
};

/**
 * Attach (or clear) the per-role Documenso template envelopes used to generate
 * signing documents for an application. Every provided id is verified to be a
 * TEMPLATE envelope owned by the caller's team, so an admin can never point an
 * application at another team's template. `undefined` means "don't touch".
 */
export const setApplicationTemplates = async ({
  teamId,
  applicationId,
  applicantTemplateId,
  cosignerTemplateId,
  sharedApplicantTemplateId,
}: SetApplicationTemplatesOptions) => {
  const application = await prisma.rentalApplication.findFirst({
    where: { id: applicationId, teamId },
    select: { id: true },
  });

  if (!application) {
    throw new AppError(AppErrorCode.NOT_FOUND, { message: 'Application not found' });
  }

  const assertTeamTemplate = async (envelopeId: string) => {
    const template = await prisma.envelope.findFirst({
      where: { id: envelopeId, type: EnvelopeType.TEMPLATE, teamId },
      select: { _count: { select: { recipients: true } } },
    });

    if (!template) {
      throw new AppError(AppErrorCode.NOT_FOUND, {
        message: 'Template not found in this team',
      });
    }

    // The participant becomes the template's signer, so the rental flow only
    // supports single-signer templates. Reject anything else loudly here rather
    // than silently mapping the participant onto the wrong recipient later.
    if (template._count.recipients !== 1) {
      throw new AppError(AppErrorCode.INVALID_BODY, {
        message:
          'A rental form template must have exactly one signer (the applicant or co-signer). ' +
          `This template has ${template._count.recipients} recipients.`,
      });
    }
  };

  // The shared roommate template carries one signer slot per tenant line (1–6).
  const assertSharedTemplate = async (envelopeId: string) => {
    const template = await prisma.envelope.findFirst({
      where: { id: envelopeId, type: EnvelopeType.TEMPLATE, teamId },
      select: { _count: { select: { recipients: true } } },
    });

    if (!template) {
      throw new AppError(AppErrorCode.NOT_FOUND, { message: 'Template not found in this team' });
    }

    const slots = template._count.recipients;

    if (slots < 1 || slots > 6) {
      throw new AppError(AppErrorCode.INVALID_BODY, {
        message:
          'A shared roommate template must have 1–6 signer slots (one per tenant signature line). ' +
          `This template has ${slots}.`,
      });
    }
  };

  if (applicantTemplateId) {
    await assertTeamTemplate(applicantTemplateId);
  }

  if (cosignerTemplateId) {
    await assertTeamTemplate(cosignerTemplateId);
  }

  if (sharedApplicantTemplateId) {
    await assertSharedTemplate(sharedApplicantTemplateId);
  }

  // Applicant individual vs shared signing are mutually exclusive — setting one clears the other.
  const data: Prisma.RentalApplicationUpdateInput = {
    // `undefined` is skipped by Prisma; `null` clears the column.
    applicantTemplateId,
    cosignerTemplateId,
    sharedApplicantTemplateId,
  };

  if (sharedApplicantTemplateId) {
    data.applicantTemplateId = null;
  } else if (applicantTemplateId) {
    data.sharedApplicantTemplateId = null;
  }

  return await prisma.rentalApplication.update({
    where: { id: application.id },
    data,
    select: {
      id: true,
      applicantTemplateId: true,
      cosignerTemplateId: true,
      sharedApplicantTemplateId: true,
    },
  });
};
