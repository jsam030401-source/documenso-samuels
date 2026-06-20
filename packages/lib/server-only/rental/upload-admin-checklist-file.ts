import { prisma } from '@documenso/prisma';
import { ChecklistItemStatus, type ChecklistItemType } from '@prisma/client';

import { deleteFile } from '../../universal/upload/delete-file';
import { putFileServerSide } from '../../universal/upload/put-file.server';
import { createDocumentData } from '../document-data/create-document-data';
import { ADMIN_ONLY_CHECKLIST_TYPES } from './checklist';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'pdf']);
const ALLOWED_MIME_PREFIXES = ['image/', 'application/pdf'];

export type UploadAdminChecklistFileOptions = {
  teamId: number;
  applicationId: string;
  participantId: string;
  type: ChecklistItemType;
  file: File;
};

export type UploadAdminChecklistFileResult = { ok: true } | { ok: false; error: string };

/**
 * Admin-only upload of a review document (credit report / proof of deposit) for
 * an applicant — the Documenso analogue of PADS' `uploadAdminDoc`. Stored as a
 * checklist item on the applicant (so the packet generator picks it up by type)
 * but hidden from the tenant portal. Scoped to the team that owns the
 * application; upserts so re-uploading replaces the previous file.
 */
export const uploadAdminChecklistFile = async ({
  teamId,
  applicationId,
  participantId,
  type,
  file,
}: UploadAdminChecklistFileOptions): Promise<UploadAdminChecklistFileResult> => {
  if (!ADMIN_ONLY_CHECKLIST_TYPES.includes(type)) {
    return { ok: false, error: 'This document type cannot be uploaded here.' };
  }

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

  // Scope: the participant must be in this team's application. (Co-signers can
  // legitimately carry these too, but the UI only offers them per applicant.)
  const participant = await prisma.applicationParticipant.findFirst({
    where: { id: participantId, applicationId, application: { teamId } },
    select: { id: true },
  });

  if (!participant) {
    return { ok: false, error: 'Applicant not found.' };
  }

  const existing = await prisma.checklistItem.findFirst({
    where: { participantId: participant.id, type },
    select: { id: true, documentDataId: true },
  });

  const { type: storageType, data } = await putFileServerSide(file);
  const documentData = await createDocumentData({ type: storageType, data });

  if (existing) {
    await prisma.checklistItem.update({
      where: { id: existing.id },
      data: { status: ChecklistItemStatus.UPLOADED, documentDataId: documentData.id },
    });

    if (existing.documentDataId) {
      const previous = await prisma.documentData.findUnique({ where: { id: existing.documentDataId } });

      if (previous) {
        await deleteFile(previous).catch(() => null);
        await prisma.documentData.delete({ where: { id: previous.id } }).catch(() => null);
      }
    }
  } else {
    await prisma.checklistItem.create({
      data: {
        participantId: participant.id,
        type,
        status: ChecklistItemStatus.UPLOADED,
        documentDataId: documentData.id,
      },
    });
  }

  return { ok: true };
};
