import { createRentalApplication } from '@documenso/lib/server-only/rental/create-rental-application';
import { findRentalApplications } from '@documenso/lib/server-only/rental/find-rental-applications';

import { authenticatedProcedure, router } from '../trpc';
import { ZCreateApplicationRequestSchema } from './schema';

export const applicationRouter = router({
  /**
   * @private
   */
  getApplications: authenticatedProcedure.query(async ({ ctx }) => {
    const { teamId } = ctx;

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
});
