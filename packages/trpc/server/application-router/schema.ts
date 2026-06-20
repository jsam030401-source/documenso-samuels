import { z } from 'zod';

export const ZCreateApplicationRequestSchema = z.object({
  title: z.string().trim().max(200).optional(),
  unitAddress: z.string().trim().max(500).optional(),
  rent: z.number().positive().optional(),
  moveInDate: z.string().datetime().optional(),
  applicantTemplateId: z.string().optional(),
  cosignerTemplateId: z.string().optional(),
});

export type TCreateApplicationRequest = z.infer<typeof ZCreateApplicationRequestSchema>;

export const ZGetApplicationRequestSchema = z.object({
  id: z.string(),
});

export type TGetApplicationRequest = z.infer<typeof ZGetApplicationRequestSchema>;

export const ZSetApplicationTemplatesRequestSchema = z.object({
  applicationId: z.string(),
  applicantTemplateId: z.string().nullable().optional(),
  cosignerTemplateId: z.string().nullable().optional(),
});

export type TSetApplicationTemplatesRequest = z.infer<typeof ZSetApplicationTemplatesRequestSchema>;

export const ZSyncApplicationFormsRequestSchema = z.object({
  applicationId: z.string(),
});

export type TSyncApplicationFormsRequest = z.infer<typeof ZSyncApplicationFormsRequestSchema>;

export const ZGenerateApplicantPacketRequestSchema = z.object({
  applicationId: z.string(),
  participantId: z.string(),
});

export type TGenerateApplicantPacketRequest = z.infer<typeof ZGenerateApplicantPacketRequestSchema>;
