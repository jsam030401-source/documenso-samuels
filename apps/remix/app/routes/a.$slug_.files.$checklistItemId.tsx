import { getChecklistItemFileForParticipant } from '@documenso/lib/server-only/rental/get-checklist-item-file';
import { getFileServerSide } from '@documenso/lib/universal/upload/get-file.server';

import { readParticipantTokens } from '~/storage/rental-participant.server';

import type { Route } from './+types/a.$slug_.files.$checklistItemId';

/**
 * Sniff a content type from the leading magic bytes. We don't persist the
 * original mime/filename, and the upload allowlist is small (pdf/jpeg/png/webp),
 * so this is enough to serve inline.
 */
const sniffContentType = (bytes: Uint8Array): string => {
  if (bytes.length >= 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) {
    return 'application/pdf';
  }

  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }

  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return 'image/png';
  }

  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return 'image/webp';
  }

  return 'application/octet-stream';
};

/**
 * Streams a participant's own supporting-document file. Scoped by the
 * `accessToken` held in the (path `/a`) participant cookie for this slug — the
 * only thing isolating one applicant's ID/income from another (no DB RLS).
 */
export async function loader({ request, params }: Route.LoaderArgs) {
  const { slug, checklistItemId } = params;

  if (!slug || !checklistItemId) {
    throw new Response('Not Found', { status: 404 });
  }

  const tokens = await readParticipantTokens(request);
  const accessToken = tokens[slug];

  if (!accessToken) {
    throw new Response('Unauthorized', { status: 401 });
  }

  const result = await getChecklistItemFileForParticipant({ accessToken, checklistItemId });

  if (!result) {
    throw new Response('Not Found', { status: 404 });
  }

  const bytes = await getFileServerSide(result.documentData);

  return new Response(bytes, {
    headers: {
      'Content-Type': sniffContentType(bytes),
      'Content-Disposition': 'inline',
      'Cache-Control': 'private, no-store',
    },
  });
}
