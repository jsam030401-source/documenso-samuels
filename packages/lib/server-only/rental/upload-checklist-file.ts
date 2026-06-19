import { prisma } from '@documenso/prisma';
import { ChecklistItemStatus } from '@prisma/client';

import { deleteFile } from '../../universal/upload/delete-file';
import { putFileServerSide } from '../../universal/upload/put-file.server';
import { createDocumentData } from '../document-data/create-document-data';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'pdf']);
const ALLOWED_MIME_PREFIXES = ['image/', 'application/pdf'];

export type UploadChecklistFileOptions = {
  accessToken: string;
  checklistItemId: string;
  file: File;
};

export type UploadChecklistFileResult = { ok: true } | { ok: false; error: string };

/**
 * Store a supporting document against a checklist item. The item must belong to
 * the participant identified by `accessToken` (the only thing isolating one
 * applicant's ID/income from another — there is no DB-level RLS). Files go to
 * Documenso storage (database transport here); we keep only the pointer.
 */
export const uploadChecklistFile = async ({
  accessToken,
  checklistItemId,
  file,
}: UploadChecklistFileOptions): Promise<UploadChecklistFileResult> => {
  if (!file || file.size === 0) {
    return { ok: false, error: 'No file selected.' };
  }

  if (file.size > MAX_FILE_SIZE) {
    return {
      ok: false,
      error: `File too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Maximum is 10MB.`,
    };
  }

  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  const extAllowed = ext !== '' && ALLOWED_EXTENSIONS.has(ext);
  const mimeAllowed = ALLOWED_MIME_PREFIXES.some((prefix) => file.type.startsWith(prefix));

  if (!extAllowed && !mimeAllowed) {
    return { ok: false, error: 'Unsupported file type. Please upload a JPG, PNG, WEBP, or PDF.' };
  }

  // Scope: the item must belong to this participant.
  const item = await prisma.checklistItem.findFirst({
    where: {
      id: checklistItemId,
      participant: { accessToken },
    },
    select: { id: true, documentDataId: true },
  });

  if (!item) {
    return { ok: false, error: 'Checklist item not found. Please refresh and try again.' };
  }

  const { type, data } = await putFileServerSide(file);
  const documentData = await createDocumentData({ type, data });

  await prisma.checklistItem.update({
    where: { id: item.id },
    data: {
      status: ChecklistItemStatus.UPLOADED,
      documentDataId: documentData.id,
    },
  });

  // Clean up the previously uploaded file (no cascade — this is a scalar FK).
  if (item.documentDataId) {
    const previous = await prisma.documentData.findUnique({ where: { id: item.documentDataId } });

    if (previous) {
      await deleteFile(previous).catch(() => null);
      await prisma.documentData.delete({ where: { id: previous.id } }).catch(() => null);
    }
  }

  return { ok: true };
};
