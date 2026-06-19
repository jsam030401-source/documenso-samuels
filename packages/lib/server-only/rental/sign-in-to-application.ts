import { prisma } from '@documenso/prisma';

export type SignInToApplicationOptions = {
  slug: string;
  email: string;
  phone: string;
};

export type SignInToApplicationResult = { ok: true; accessToken: string } | { ok: false; notFound: boolean };

/**
 * Passwordless sign-in: an email + phone match within the application returns
 * the participant's `accessToken`. Never reveals which field was wrong.
 */
export const signInToApplication = async ({
  slug,
  email,
  phone,
}: SignInToApplicationOptions): Promise<SignInToApplicationResult> => {
  const cleanEmail = email.trim().toLowerCase();
  const cleanPhone = phone.trim();

  if (!cleanEmail || !cleanPhone) {
    return { ok: false, notFound: true };
  }

  const participant = await prisma.applicationParticipant.findFirst({
    where: {
      email: cleanEmail,
      phone: cleanPhone,
      application: { slug },
    },
    select: { accessToken: true },
  });

  if (!participant) {
    return { ok: false, notFound: true };
  }

  return { ok: true, accessToken: participant.accessToken };
};
