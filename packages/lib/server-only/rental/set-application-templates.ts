import { prisma } from '@documenso/prisma';
import { EnvelopeType } from '@prisma/client';

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
      select: { id: true },
    });

    if (!template) {
      throw new AppError(AppErrorCode.NOT_FOUND, {
        message: 'Template not found in this team',
      });
    }
  };

  if (applicantTemplateId) {
    await assertTeamTemplate(applicantTemplateId);
  }

  if (cosignerTemplateId) {
    await assertTeamTemplate(cosignerTemplateId);
  }

  return await prisma.rentalApplication.update({
    where: { id: application.id },
    data: {
      // `undefined` is skipped by Prisma; `null` clears the column.
      applicantTemplateId,
      cosignerTemplateId,
    },
    select: {
      id: true,
      applicantTemplateId: true,
      cosignerTemplateId: true,
    },
  });
};
