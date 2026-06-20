import { createRentalApplication } from '@documenso/lib/server-only/rental/create-rental-application';
import { ensureApplicationForms } from '@documenso/lib/server-only/rental/ensure-participant-forms';
import { findRentalApplications } from '@documenso/lib/server-only/rental/find-rental-applications';
import { getRentalApplication } from '@documenso/lib/server-only/rental/get-rental-application';
import { setApplicationTemplates } from '@documenso/lib/server-only/rental/set-application-templates';
import { getTeamById } from '@documenso/lib/server-only/team/get-team';

import { authenticatedProcedure, router } from '../trpc';
import {
  ZCreateApplicationRequestSchema,
  ZGetApplicationRequestSchema,
  ZSetApplicationTemplatesRequestSchema,
  ZSyncApplicationFormsRequestSchema,
} from './schema';

export const applicationRouter = router({
  /**
   * @private
   */
  getApplications: authenticatedProcedure.query(async ({ ctx }) => {
    const { teamId, user } = ctx;

    // Verify the caller is a member of this team before returning any data.
    await getTeamById({ userId: user.id, teamId });

    const applications = await findRentalApplications({ teamId });

    return applications.map((application) => ({
      id: application.id,
      slug: application.slug,
      title: application.title,
      status: application.status,
      unitAddress: application.unitAddress,
      rent: application.rent ? Number(application.rent) : null,
      moveInDate: application.moveInDate,
      createdAt: application.createdAt,
      participantCount: application._count.participants,
    }));
  }),

  /**
   * @private
   */
  getApplication: authenticatedProcedure.input(ZGetApplicationRequestSchema).query(async ({ input, ctx }) => {
    const { teamId, user } = ctx;

    await getTeamById({ userId: user.id, teamId });

    return await getRentalApplication({ id: input.id, teamId });
  }),

  /**
   * @private
   */
  createApplication: authenticatedProcedure.input(ZCreateApplicationRequestSchema).mutation(async ({ input, ctx }) => {
    const { teamId, user } = ctx;
    const { title, unitAddress, rent, moveInDate, applicantTemplateId, cosignerTemplateId } = input;

    ctx.logger.info({ input: { title, unitAddress } });

    const application = await createRentalApplication({
      userId: user.id,
      teamId,
      title,
      unitAddress,
      rent,
      moveInDate: moveInDate ? new Date(moveInDate) : undefined,
      applicantTemplateId,
      cosignerTemplateId,
    });

    return { id: application.id, slug: application.slug };
  }),

  /**
   * @private
   */
  setApplicationTemplates: authenticatedProcedure
    .input(ZSetApplicationTemplatesRequestSchema)
    .mutation(async ({ input, ctx }) => {
      const { teamId, user } = ctx;

      await getTeamById({ userId: user.id, teamId });

      return await setApplicationTemplates({
        teamId,
        applicationId: input.applicationId,
        applicantTemplateId: input.applicantTemplateId,
        cosignerTemplateId: input.cosignerTemplateId,
      });
    }),

  /**
   * @private
   */
  syncApplicationForms: authenticatedProcedure
    .input(ZSyncApplicationFormsRequestSchema)
    .mutation(async ({ input, ctx }) => {
      const { teamId, user } = ctx;

      await getTeamById({ userId: user.id, teamId });

      return await ensureApplicationForms({
        applicationId: input.applicationId,
        teamId,
        requestMetadata: ctx.metadata,
      });
    }),
});
