import { prisma } from '@documenso/prisma';
import { ParticipantRole, Prisma, RentalApplicationStatus } from '@prisma/client';

import { createChecklistForParticipant } from './checklist';
import { ensureParticipantForms } from './ensure-participant-forms';

const CLOSED_STATUSES: RentalApplicationStatus[] = [
  RentalApplicationStatus.APPROVED,
  RentalApplicationStatus.DENIED,
  RentalApplicationStatus.WITHDRAWN,
];

export type JoinApplicationOptions = {
  slug: string;
  name: string;
  email: string;
  phone: string;
  role: ParticipantRole;
  isStudent: boolean;
  linkedToId?: string | null;
};

export type JoinApplicationResult = { ok: true; accessToken: string } | { ok: false; error: string };

/**
 * Passwordless join. Ports the PADS flow onto Prisma: validate, enforce the
 * co-signer-needs-an-applicant rule and the one-email-per-application rule, then
 * create the participant + seed their checklist. Returns the participant's
 * `accessToken` (the portal bearer) on success.
 */
export const joinApplication = async ({
  slug,
  name,
  email,
  phone,
  role,
  isStudent,
  linkedToId,
}: JoinApplicationOptions): Promise<JoinApplicationResult> => {
  const cleanName = name.trim();
  const cleanEmail = email.trim().toLowerCase();
  const cleanPhone = phone.trim();

  if (!cleanName || !cleanEmail || !cleanPhone) {
    return { ok: false, error: 'All fields are required.' };
  }

  const application = await prisma.rentalApplication.findUnique({
    where: { slug },
    select: { id: true, status: true },
  });

  if (!application) {
    return { ok: false, error: 'Application not found.' };
  }

  if (CLOSED_STATUSES.includes(application.status)) {
    return { ok: false, error: 'This application is no longer accepting submissions.' };
  }

  // Co-signers must link to an existing applicant on this application.
  if (role === ParticipantRole.COSIGNER) {
    const applicantCount = await prisma.applicationParticipant.count({
      where: { applicationId: application.id, role: ParticipantRole.APPLICANT },
    });

    if (applicantCount === 0) {
      return {
        ok: false,
        error:
          "Hold tight — wait until the applicant you're co-signing for creates their account, then come back to join.",
      };
    }

    if (!linkedToId) {
      return { ok: false, error: "Please select the applicant you're co-signing for." };
    }

    const linkedApplicant = await prisma.applicationParticipant.findFirst({
      where: {
        id: linkedToId,
        applicationId: application.id,
        role: ParticipantRole.APPLICANT,
      },
      select: { id: true },
    });

    if (!linkedApplicant) {
      return { ok: false, error: "Please select the applicant you're co-signing for." };
    }
  }

  // Friendly duplicate-email guard (the @@unique constraint is the backstop).
  const existing = await prisma.applicationParticipant.findUnique({
    where: { applicationId_email: { applicationId: application.id, email: cleanEmail } },
    select: { id: true },
  });

  if (existing) {
    return {
      ok: false,
      error: 'This email is already registered for this application. Use "Sign in" instead.',
    };
  }

  try {
    const participant = await prisma.applicationParticipant.create({
      data: {
        applicationId: application.id,
        role,
        isStudent: role === ParticipantRole.APPLICANT ? isStudent : false,
        linkedToId: role === ParticipantRole.COSIGNER ? linkedToId : null,
        name: cleanName,
        email: cleanEmail,
        phone: cleanPhone,
      },
      select: { id: true, accessToken: true },
    });

    await createChecklistForParticipant({
      participantId: participant.id,
      role,
      isStudent: role === ParticipantRole.APPLICANT ? isStudent : false,
    });

    // Provision the role's signing form now, at the natural write point. If no
    // template is attached yet this is a no-op; the portal-load fallback and the
    // admin "Sync forms" button cover anyone provisioned out of order. Best-effort
    // so a signing hiccup never blocks the join itself.
    try {
      await ensureParticipantForms({ participantId: participant.id });
    } catch (error) {
      console.error('[rental] ensureParticipantForms failed on join for', participant.id, error);
    }

    return { ok: true, accessToken: participant.accessToken };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return {
        ok: false,
        error: 'This email is already registered for this application. Use "Sign in" instead.',
      };
    }

    throw error;
  }
};
