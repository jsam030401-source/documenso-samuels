import { prisma } from '@documenso/prisma';

export type FindRentalApplicationsOptions = {
  teamId: number;
};

/**
 * List a team's rental applications (newest first) with participant counts for
 * the admin index.
 */
export const findRentalApplications = async ({ teamId }: FindRentalApplicationsOptions) => {
  return await prisma.rentalApplication.findMany({
    where: { teamId },
    orderBy: { createdAt: 'desc' },
    include: {
      _count: {
        select: { participants: true },
      },
    },
  });
};
