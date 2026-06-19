import { env } from '@documenso/lib/utils/env';
import { createCookie } from 'react-router';

/**
 * Passwordless recognition cookie for rental-application participants. Kept
 * entirely separate from Documenso's owner/admin session. The value is a
 * `{ [slug]: accessToken }` map so one browser can hold tokens for multiple
 * applications. Scoped to `/a` so it is only sent to the portal routes.
 *
 * The bearer is the participant's unguessable `accessToken` (a cuid), which is
 * itself the secret — the same model Documenso uses for recipient signing
 * tokens in the URL.
 */
export const rentalParticipantCookie = createCookie('rental_participant', {
  path: '/a',
  httpOnly: true,
  sameSite: 'lax',
  secure: env('NODE_ENV') === 'production',
  maxAge: 60 * 60 * 24 * 365, // 1 year
});

export const readParticipantTokens = async (request: Request): Promise<Record<string, string>> => {
  const parsed = (await rentalParticipantCookie.parse(request.headers.get('Cookie'))) as unknown;

  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    return parsed as Record<string, string>;
  }

  return {};
};

export const serializeParticipantTokens = async (tokens: Record<string, string>): Promise<string> => {
  return await rentalParticipantCookie.serialize(tokens);
};
