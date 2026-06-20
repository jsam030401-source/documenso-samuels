import { PageSizes, PDFDocument, type PDFImage } from '@cantoo/pdf-lib';
import { prisma } from '@documenso/prisma';
import { ChecklistItemStatus, type ChecklistItemType, DocumentStatus, ParticipantRole } from '@prisma/client';

import { getFileServerSide } from '../../universal/upload/get-file.server';

export type BuildApplicantPacketOptions = {
  teamId: number;
  applicationId: string;
  applicantParticipantId: string;
};

export type ApplicantPacket = {
  bytes: Uint8Array;
  filename: string;
  /** Human-readable labels of files that could not be merged (logged, not fatal). */
  skipped: string[];
};

type DocumentDataRef = { type: Parameters<typeof getFileServerSide>[0]['type']; data: string };

type ParticipantForPacket = {
  id: string;
  name: string;
  isStudent: boolean;
  recipientIds: number[];
  checklist: { type: ChecklistItemType; status: ChecklistItemStatus; documentDataId: string | null }[];
};

const SATISFIED_STATUSES: ChecklistItemStatus[] = [ChecklistItemStatus.UPLOADED, ChecklistItemStatus.APPROVED];

/** Stable download filename for an applicant's packet (shared with the download route). */
export const applicantPacketFilename = (name: string) => {
  const slug =
    name
      .trim()
      .replace(/[^a-z0-9]+/gi, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase() || 'applicant';

  return `${slug}-application-packet.pdf`;
};

/**
 * Build one merged PDF "packet" per applicant for an application, scoped to the
 * team. Ports the PADS `generatePackages` merge logic to Documenso storage:
 * completed signed envelopes + each person's supporting documents (PDFs are
 * page-copied; images are centered on a Letter page), in a fixed order, with
 * the applicant's linked co-signers folded in. Unreadable/missing files are
 * skipped and reported rather than aborting the packet.
 *
 * Returns `null` if the application/applicant isn't found in this team or there
 * is nothing to package yet (no merged pages).
 */
export const buildApplicantPacket = async ({
  teamId,
  applicationId,
  applicantParticipantId,
}: BuildApplicantPacketOptions): Promise<ApplicantPacket | null> => {
  const application = await prisma.rentalApplication.findFirst({
    where: { id: applicationId, teamId },
    select: { id: true },
  });

  if (!application) {
    return null;
  }

  const checklistSelect = {
    select: { type: true, status: true, documentDataId: true },
    orderBy: { createdAt: 'asc' },
  } as const;

  const applicant = await prisma.applicationParticipant.findFirst({
    where: { id: applicantParticipantId, applicationId: application.id, role: ParticipantRole.APPLICANT },
    select: {
      id: true,
      name: true,
      isStudent: true,
      recipientIds: true,
      additionalRecipientIds: true,
      checklist: checklistSelect,
    },
  });

  if (!applicant) {
    return null;
  }

  const cosigners = await prisma.applicationParticipant.findMany({
    where: { applicationId: application.id, role: ParticipantRole.COSIGNER, linkedToId: applicant.id },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      name: true,
      isStudent: true,
      recipientIds: true,
      additionalRecipientIds: true,
      checklist: checklistSelect,
    },
  });

  const pdfDoc = await PDFDocument.create();
  const skipped: string[] = [];

  // Merge a single stored file (PDF → copy pages; image → centered Letter page).
  const mergeFile = async (documentData: DocumentDataRef | null, label: string) => {
    if (!documentData) {
      return;
    }

    let bytes: Uint8Array;

    try {
      bytes = await getFileServerSide(documentData);
    } catch {
      skipped.push(`${label}: could not read file`);
      return;
    }

    const isPdf = bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46; // "%PDF"

    if (isPdf) {
      try {
        const src = await PDFDocument.load(bytes);
        const pages = await pdfDoc.copyPages(src, src.getPageIndices());

        for (const page of pages) {
          pdfDoc.addPage(page);
        }

        return;
      } catch {
        // Not a usable PDF — fall through to image handling.
      }
    }

    try {
      const isJpg = bytes[0] === 0xff && bytes[1] === 0xd8;
      const isPng = bytes[0] === 0x89 && bytes[1] === 0x50;

      let image: PDFImage;

      if (isJpg) {
        image = await pdfDoc.embedJpg(bytes);
      } else if (isPng) {
        image = await pdfDoc.embedPng(bytes);
      } else {
        try {
          image = await pdfDoc.embedJpg(bytes);
        } catch {
          image = await pdfDoc.embedPng(bytes);
        }
      }

      const [letterW, letterH] = PageSizes.Letter;
      const scale = Math.min(letterW / image.width, letterH / image.height, 1);
      const width = image.width * scale;
      const height = image.height * scale;

      const page = pdfDoc.addPage([letterW, letterH]);
      page.drawImage(image, {
        x: (letterW - width) / 2,
        y: (letterH - height) / 2,
        width,
        height,
      });
    } catch {
      skipped.push(`${label}: unsupported file format`);
    }
  };

  // Resolve completed signed envelopes for a participant → their merged-in pages.
  const mergeSignedForms = async (recipientIds: number[], who: string) => {
    if (!recipientIds.length) {
      return;
    }

    const recipients = await prisma.recipient.findMany({
      where: { id: { in: recipientIds } },
      select: {
        envelope: {
          select: {
            title: true,
            status: true,
            envelopeItems: {
              orderBy: { order: 'asc' },
              select: { documentData: { select: { type: true, data: true } } },
            },
          },
        },
      },
    });

    for (const { envelope } of recipients) {
      // Only fully-executed envelopes belong in the final packet; note the rest so
      // the reviewer knows a form was omitted because it isn't signed yet.
      if (envelope.status !== DocumentStatus.COMPLETED) {
        skipped.push(`Signed form "${envelope.title}" (${who}): not signed yet — omitted`);
        continue;
      }

      for (const item of envelope.envelopeItems) {
        await mergeFile(item.documentData, `Signed form "${envelope.title}" (${who})`);
      }
    }
  };

  // Look up a participant's checklist upload, fetch its bytes, and merge.
  const mergeChecklist = async (participant: ParticipantForPacket, type: ChecklistItemType, label: string) => {
    const item = participant.checklist.find(
      (entry) => entry.type === type && entry.documentDataId && SATISFIED_STATUSES.includes(entry.status),
    );

    if (!item?.documentDataId) {
      return;
    }

    const documentData = await prisma.documentData.findUnique({
      where: { id: item.documentDataId },
      select: { type: true, data: true },
    });

    await mergeFile(documentData, label);
  };

  // Fixed packet order (mirrors the PADS reviewer's expectation). Added documents
  // fold in alongside the applicant's auto application form.
  await mergeSignedForms([...applicant.recipientIds, ...applicant.additionalRecipientIds], applicant.name);
  await mergeChecklist(applicant, 'ID', `Photo ID: ${applicant.name}`);

  if (!applicant.isStudent) {
    await mergeChecklist(applicant, 'INCOME', `Income: ${applicant.name}`);
  }

  for (const cosigner of cosigners) {
    await mergeSignedForms([...cosigner.recipientIds, ...cosigner.additionalRecipientIds], cosigner.name);
    await mergeChecklist(cosigner, 'ID', `Photo ID: ${cosigner.name}`);
    await mergeChecklist(cosigner, 'INCOME', `Income: ${cosigner.name}`);
  }

  await mergeChecklist(applicant, 'CREDIT_REPORT', `Credit report: ${applicant.name}`);
  await mergeChecklist(applicant, 'PROOF_OF_DEPOSIT', `Proof of deposit: ${applicant.name}`);

  if (pdfDoc.getPageCount() === 0) {
    return null;
  }

  const bytes = await pdfDoc.save();

  return {
    bytes,
    filename: applicantPacketFilename(applicant.name),
    skipped,
  };
};
