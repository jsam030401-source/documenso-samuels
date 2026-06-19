import { prisma } from '@documenso/prisma';
import { Prisma } from '@prisma/client';

import { nanoid } from '../../universal/id';
import { createFolder } from '../folder/create-folder';

export type CreateRentalApplicationOptions = {
  userId: number;
  teamId: number;
  title?: string;
  unitAddress?: string;
  rent?: number;
  moveInDate?: Date;
  applicantTemplateId?: string;
  cosignerTemplateId?: string;
};

/**
 * Create a rental application scoped to a team. Also provisions a Documenso
 * Folder to group the signing envelopes this application will later generate.
 * Returns the application (its `slug` is the single shareable link).
 */
export const createRentalApplication = async ({
  userId,
  teamId,
  title,
  unitAddress,
  rent,
  moveInDate,
  applicantTemplateId,
  cosignerTemplateId,
}: CreateRentalApplicationOptions) => {
  const trimmedTitle = title?.trim() || undefined;

  // createFolder also verifies the user has access to the team.
  const folder = await createFolder({
    userId,
    teamId,
    name: trimmedTitle ?? 'Rental application',
  });

  // slug is nanoid(8); retry on the (extremely unlikely) unique collision.
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await prisma.rentalApplication.create({
        data: {
          teamId,
          ownerUserId: userId,
          folderId: folder.id,
          slug: nanoid(8),
          title: trimmedTitle,
          unitAddress: unitAddress?.trim() || undefined,
          rent,
          moveInDate,
          applicantTemplateId,
          cosignerTemplateId,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002' && attempt < 4) {
        continue;
      }

      throw error;
    }
  }

  throw new Error('Failed to generate a unique application slug');
};
