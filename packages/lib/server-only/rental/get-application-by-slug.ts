import { prisma } from '@documenso/prisma';
import { ParticipantRole } from '@prisma/client';

export type GetRentalApplicationBySlugOptions = {
  slug: string;
};

/**
 * Public lookup for the join screen. Returns the application plus the list of
 * applicants a co-signer can link to (id + name only). `null` if not found.
 */
export const getRentalApplicationBySlug = async ({ slug }: GetRentalApplicationBySlugOptions) => {
  return await prisma.rentalApplication.findUnique({
    where: { slug },
    include: {
      participants: {
        where: { role: ParticipantRole.APPLICANT },
        select: { id: true, name: true },
        orderBy: { createdAt: 'asc' },
      },
    },
  });
};
