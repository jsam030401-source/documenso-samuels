import { DEAL_TERM_KEYS } from '@documenso/lib/types/rental-deal-terms';
import { z } from 'zod';

export const ZCreateApplicationRequestSchema = z.object({
  title: z.string().trim().max(200).optional(),
  street: z.string().trim().max(300).optional(),
  unitNumber: z.string().trim().max(50).optional(),
  city: z.string().trim().max(120).optional(),
  rent: z.number().nonnegative().optional(),
  moveInDate: z.string().datetime().optional(),
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

// All deal-terms fields. `.nullish()` = omitted (leave unchanged) or null (clear).
export const ZUpdateApplicationTermsRequestSchema = z.object({
  applicationId: z.string(),
  title: z.string().trim().max(200).nullish(),
  street: z.string().trim().max(300).nullish(),
  unitNumber: z.string().trim().max(50).nullish(),
  city: z.string().trim().max(120).nullish(),
  rent: z.number().nonnegative().nullish(),
  firstMonthRent: z.number().nonnegative().nullish(),
  moveInDate: z.string().datetime().nullish(),
  leaseTermMonths: z.number().int().nonnegative().nullish(),
  leaseEndDate: z.string().datetime().nullish(),
  petsAllowed: z.boolean().nullish(),
  lastMonthRent: z.number().nonnegative().nullish(),
  securityDeposit: z.number().nonnegative().nullish(),
  brokerFee: z.number().nonnegative().nullish(),
  lockChangeFee: z.number().nonnegative().nullish(),
  applicationFee: z.number().nonnegative().nullish(),
  todaysDeposit: z.number().nonnegative().nullish(),
  balanceDue: z.number().nonnegative().nullish(),
});

export type TUpdateApplicationTermsRequest = z.infer<typeof ZUpdateApplicationTermsRequestSchema>;

export const ZGetTemplateFieldMapRequestSchema = z.object({
  templateEnvelopeId: z.string(),
});

export type TGetTemplateFieldMapRequest = z.infer<typeof ZGetTemplateFieldMapRequestSchema>;

export const ZSetTemplateFieldMapRequestSchema = z.object({
  templateEnvelopeId: z.string(),
  mappings: z.array(
    z.object({
      fieldId: z.number().int(),
      // null = leave this field for the tenant (clears any existing mapping).
      termKey: z.enum(DEAL_TERM_KEYS).nullable(),
    }),
  ),
});

export type TSetTemplateFieldMapRequest = z.infer<typeof ZSetTemplateFieldMapRequestSchema>;

export const ZRemoveParticipantRequestSchema = z.object({
  applicationId: z.string(),
  participantId: z.string(),
});

export type TRemoveParticipantRequest = z.infer<typeof ZRemoveParticipantRequestSchema>;

export const ZSetParticipantStudentRequestSchema = z.object({
  applicationId: z.string(),
  participantId: z.string(),
  isStudent: z.boolean(),
});

export type TSetParticipantStudentRequest = z.infer<typeof ZSetParticipantStudentRequestSchema>;

export const ZAddParticipantDocumentRequestSchema = z.object({
  applicationId: z.string(),
  participantId: z.string(),
  templateEnvelopeId: z.string(),
});

export type TAddParticipantDocumentRequest = z.infer<typeof ZAddParticipantDocumentRequestSchema>;

export const ZReissueParticipantFormRequestSchema = z.object({
  applicationId: z.string(),
  participantId: z.string(),
});

export type TReissueParticipantFormRequest = z.infer<typeof ZReissueParticipantFormRequestSchema>;
