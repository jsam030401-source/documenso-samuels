import { composeAddress } from '@documenso/lib/server-only/rental/address';
import { createRentalApplication } from '@documenso/lib/server-only/rental/create-rental-application';
import { ensureApplicationForms } from '@documenso/lib/server-only/rental/ensure-participant-forms';
import { findRentalApplications } from '@documenso/lib/server-only/rental/find-rental-applications';
import { generateApplicantPacket } from '@documenso/lib/server-only/rental/generate-applicant-packet';
import { getRentalApplication } from '@documenso/lib/server-only/rental/get-rental-application';
import { getTemplateFieldMap } from '@documenso/lib/server-only/rental/get-template-field-map';
import { removeParticipant } from '@documenso/lib/server-only/rental/remove-participant';
import { setApplicationTemplates } from '@documenso/lib/server-only/rental/set-application-templates';
import { setParticipantStudent } from '@documenso/lib/server-only/rental/set-participant-student';
import { setTemplateFieldMap } from '@documenso/lib/server-only/rental/set-template-field-map';
import { updateApplicationTerms } from '@documenso/lib/server-only/rental/update-application-terms';
import { getTeamById } from '@documenso/lib/server-only/team/get-team';

import { authenticatedProcedure, router } from '../trpc';
import {
  ZCreateApplicationRequestSchema,
  ZGenerateApplicantPacketRequestSchema,
  ZGetApplicationRequestSchema,
  ZGetTemplateFieldMapRequestSchema,
  ZRemoveParticipantRequestSchema,
  ZSetApplicationTemplatesRequestSchema,
  ZSetParticipantStudentRequestSchema,
  ZSetTemplateFieldMapRequestSchema,
  ZSyncApplicationFormsRequestSchema,
  ZUpdateApplicationTermsRequestSchema,
} from './schema';

export const applicationRouter = router({
  /**
   * @private
   */
  getApplications: authenticatedProcedure.query(async ({ ctx }) => {
    const { teamId, user } = ctx;

    // Verify the caller is a member of this team before returning any data.
    await getTeamById({ userId: user.id, teamId });

    const applications = await findRentalApplications({ teamId });

    return applications.map((application) => ({
      id: application.id,
      slug: application.slug,
      title: application.title,
      status: application.status,
      unitAddress: composeAddress(application),
      rent: application.rent ? Number(application.rent) : null,
      moveInDate: application.moveInDate,
      createdAt: application.createdAt,
      participantCount: application._count.participants,
    }));
  }),

  /**
   * @private
   */
  getApplication: authenticatedProcedure.input(ZGetApplicationRequestSchema).query(async ({ input, ctx }) => {
    const { teamId, user } = ctx;

    await getTeamById({ userId: user.id, teamId });

    return await getRentalApplication({ id: input.id, teamId });
  }),

  /**
   * @private
   */
  createApplication: authenticatedProcedure.input(ZCreateApplicationRequestSchema).mutation(async ({ input, ctx }) => {
    const { teamId, user } = ctx;
    const { title, street, unitNumber, city, rent, moveInDate } = input;

    ctx.logger.info({ input: { title, street } });

    const application = await createRentalApplication({
      userId: user.id,
      teamId,
      title,
      street,
      unitNumber,
      city,
      rent,
      moveInDate: moveInDate ? new Date(moveInDate) : undefined,
    });

    return { id: application.id, slug: application.slug };
  }),

  /**
   * @private
   */
  setApplicationTemplates: authenticatedProcedure
    .input(ZSetApplicationTemplatesRequestSchema)
    .mutation(async ({ input, ctx }) => {
      const { teamId, user } = ctx;

      await getTeamById({ userId: user.id, teamId });

      return await setApplicationTemplates({
        teamId,
        applicationId: input.applicationId,
        applicantTemplateId: input.applicantTemplateId,
        cosignerTemplateId: input.cosignerTemplateId,
      });
    }),

  /**
   * @private
   */
  syncApplicationForms: authenticatedProcedure
    .input(ZSyncApplicationFormsRequestSchema)
    .mutation(async ({ input, ctx }) => {
      const { teamId, user } = ctx;

      await getTeamById({ userId: user.id, teamId });

      return await ensureApplicationForms({
        applicationId: input.applicationId,
        teamId,
        requestMetadata: ctx.metadata,
      });
    }),

  /**
   * @private
   */
  generateApplicantPacket: authenticatedProcedure
    .input(ZGenerateApplicantPacketRequestSchema)
    .mutation(async ({ input, ctx }) => {
      const { teamId, user } = ctx;

      await getTeamById({ userId: user.id, teamId });

      return await generateApplicantPacket({
        teamId,
        applicationId: input.applicationId,
        applicantParticipantId: input.participantId,
      });
    }),

  /**
   * @private
   */
  updateApplicationTerms: authenticatedProcedure
    .input(ZUpdateApplicationTermsRequestSchema)
    .mutation(async ({ input, ctx }) => {
      const { teamId, user } = ctx;
      const { applicationId, ...data } = input;

      await getTeamById({ userId: user.id, teamId });

      await updateApplicationTerms({ teamId, applicationId, data });

      return { success: true };
    }),

  /**
   * @private
   */
  getTemplateFieldMap: authenticatedProcedure.input(ZGetTemplateFieldMapRequestSchema).query(async ({ input, ctx }) => {
    const { teamId, user } = ctx;

    await getTeamById({ userId: user.id, teamId });

    return await getTemplateFieldMap({ teamId, templateEnvelopeId: input.templateEnvelopeId });
  }),

  /**
   * @private
   */
  setTemplateFieldMap: authenticatedProcedure
    .input(ZSetTemplateFieldMapRequestSchema)
    .mutation(async ({ input, ctx }) => {
      const { teamId, user } = ctx;

      await getTeamById({ userId: user.id, teamId });

      return await setTemplateFieldMap({
        teamId,
        templateEnvelopeId: input.templateEnvelopeId,
        mappings: input.mappings,
      });
    }),

  /**
   * @private
   */
  removeParticipant: authenticatedProcedure.input(ZRemoveParticipantRequestSchema).mutation(async ({ input, ctx }) => {
    const { teamId, user } = ctx;

    await getTeamById({ userId: user.id, teamId });

    return await removeParticipant({
      teamId,
      applicationId: input.applicationId,
      participantId: input.participantId,
    });
  }),

  /**
   * @private
   */
  setParticipantStudent: authenticatedProcedure
    .input(ZSetParticipantStudentRequestSchema)
    .mutation(async ({ input, ctx }) => {
      const { teamId, user } = ctx;

      await getTeamById({ userId: user.id, teamId });

      return await setParticipantStudent({
        teamId,
        applicationId: input.applicationId,
        participantId: input.participantId,
        isStudent: input.isStudent,
      });
    }),
});
