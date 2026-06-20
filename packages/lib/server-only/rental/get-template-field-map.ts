import { prisma } from '@documenso/prisma';
import { EnvelopeType, FieldType } from '@prisma/client';

import { AppError, AppErrorCode } from '../../errors/app-error';
import type { DealTermKey } from '../../types/rental-deal-terms';

export type GetTemplateFieldMapOptions = {
  teamId: number;
  templateEnvelopeId: string;
};

export type TemplateFieldMapEntry = {
  fieldId: number;
  /** The broker's field label (their shorthand), or null when the field is unlabelled. */
  label: string | null;
  page: number;
  /** The deal-term this field is currently mapped to, or null when left for the tenant. */
  termKey: DealTermKey | null;
};

/**
 * List a template's TEXT fields joined with their current deal-term mapping, so a
 * broker can wire each shorthand field (e.g. `FMR`, `BF`) to a deal term. The
 * template envelope is verified to belong to the caller's team. Fields come back
 * in document reading order (page, then top-to-bottom) so the list mirrors the PDF.
 */
export const getTemplateFieldMap = async ({ teamId, templateEnvelopeId }: GetTemplateFieldMapOptions) => {
  const template = await prisma.envelope.findFirst({
    where: { id: templateEnvelopeId, type: EnvelopeType.TEMPLATE, teamId },
    select: { id: true, title: true },
  });

  if (!template) {
    throw new AppError(AppErrorCode.NOT_FOUND, { message: 'Template not found in this team' });
  }

  const [fields, rows] = await Promise.all([
    prisma.field.findMany({
      where: { envelopeId: templateEnvelopeId, type: FieldType.TEXT },
      select: { id: true, page: true, fieldMeta: true },
      orderBy: [{ page: 'asc' }, { positionY: 'asc' }, { positionX: 'asc' }],
    }),
    prisma.rentalTemplateFieldMap.findMany({
      where: { templateEnvelopeId },
      select: { fieldId: true, termKey: true },
    }),
  ]);

  const termByField = new Map(rows.map((row) => [row.fieldId, row.termKey as DealTermKey]));

  const entries: TemplateFieldMapEntry[] = fields.map((field) => {
    const label = (field.fieldMeta as { label?: string } | null)?.label?.trim();

    return {
      fieldId: field.id,
      label: label && label.length > 0 ? label : null,
      page: field.page,
      termKey: termByField.get(field.id) ?? null,
    };
  });

  return {
    templateEnvelopeId,
    title: template.title,
    fields: entries,
  };
};
