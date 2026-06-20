import { prisma } from '@documenso/prisma';

/**
 * If a signing recipient belongs to a rental-application participant, return that
 * application's public portal slug — so the signing-complete page can offer a
 * "back to your application" link instead of stranding the tenant (who has no
 * Documenso account, and therefore never sees the normal "Go Back Home" button).
 * Returns null for ordinary, non-rental signers.
 */
export const getApplicationSlugForRecipient = async (recipientId: number): Promise<string | null> => {
  const participant = await prisma.applicationParticipant.findFirst({
    where: { recipientIds: { has: recipientId } },
    select: { application: { select: { slug: true } } },
  });

  return participant?.application.slug ?? null;
};
