import { prisma } from '@documenso/prisma';
import { EnvelopeType, FieldType } from '@prisma/client';

import { AppError, AppErrorCode } from '../../errors/app-error';
import type { DealTermKey } from '../../types/rental-deal-terms';

export type TemplateFieldMapping = {
  fieldId: number;
  /** The deal-term to map this field to, or null to leave it for the tenant (deletes the row). */
  termKey: DealTermKey | null;
};

export type SetTemplateFieldMapOptions = {
  teamId: number;
  templateEnvelopeId: string;
  mappings: TemplateFieldMapping[];
};

/**
 * Persist a broker's per-template field → deal-term mapping. The template envelope
 * is verified to belong to the caller's team, and only fields that actually belong
 * to this envelope are honoured (so a client can't graft a foreign field id on).
 * A `null` termKey clears the mapping; a non-null one upserts it. Unsigned forms
 * pick the new mapping up on the next "Generate / refresh forms".
 */
export const setTemplateFieldMap = async ({ teamId, templateEnvelopeId, mappings }: SetTemplateFieldMapOptions) => {
  const template = await prisma.envelope.findFirst({
    where: { id: templateEnvelopeId, type: EnvelopeType.TEMPLATE, teamId },
    select: { id: true },
  });

  if (!template) {
    throw new AppError(AppErrorCode.NOT_FOUND, { message: 'Template not found in this team' });
  }

  // Only persist mappings for TEXT fields that really belong to this template.
  const ownFields = await prisma.field.findMany({
    where: {
      id: { in: mappings.map((mapping) => mapping.fieldId) },
      envelopeId: templateEnvelopeId,
      type: FieldType.TEXT,
    },
    select: { id: true },
  });
  const ownFieldIds = new Set(ownFields.map((field) => field.id));

  const toUpsert = mappings.filter((mapping) => mapping.termKey !== null && ownFieldIds.has(mapping.fieldId));
  const toClear = mappings
    .filter((mapping) => mapping.termKey === null && ownFieldIds.has(mapping.fieldId))
    .map((mapping) => mapping.fieldId);

  await prisma.$transaction([
    ...toUpsert.map((mapping) =>
      prisma.rentalTemplateFieldMap.upsert({
        where: { templateEnvelopeId_fieldId: { templateEnvelopeId, fieldId: mapping.fieldId } },
        create: { teamId, templateEnvelopeId, fieldId: mapping.fieldId, termKey: mapping.termKey as string },
        update: { termKey: mapping.termKey as string },
      }),
    ),
    ...(toClear.length > 0
      ? [prisma.rentalTemplateFieldMap.deleteMany({ where: { templateEnvelopeId, fieldId: { in: toClear } } })]
      : []),
  ]);

  return { success: true, mapped: toUpsert.length, cleared: toClear.length };
};
