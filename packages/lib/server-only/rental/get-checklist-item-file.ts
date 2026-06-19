import { prisma } from '@documenso/prisma';

export type GetChecklistItemFileOptions = {
  accessToken: string;
  checklistItemId: string;
};

/**
 * Resolve the stored file for a checklist item, scoped to the requesting
 * participant's `accessToken`. Returns the DocumentData pointer + item metadata,
 * or `null` if the item isn't theirs / has no upload. The caller streams the
 * bytes via `getFileServerSide`.
 */
export const getChecklistItemFileForParticipant = async ({
  accessToken,
  checklistItemId,
}: GetChecklistItemFileOptions) => {
  const item = await prisma.checklistItem.findFirst({
    where: {
      id: checklistItemId,
      participant: { accessToken },
    },
    select: { id: true, type: true, label: true, documentDataId: true },
  });

  if (!item || !item.documentDataId) {
    return null;
  }

  const documentData = await prisma.documentData.findUnique({
    where: { id: item.documentDataId },
  });

  if (!documentData) {
    return null;
  }

  return { item, documentData };
};
