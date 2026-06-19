import { getChecklistItemFileForParticipant } from '@documenso/lib/server-only/rental/get-checklist-item-file';
import { getFileServerSide } from '@documenso/lib/universal/upload/get-file.server';

import { readParticipantTokens } from '~/storage/rental-participant.server';
import { sniffContentType } from '~/utils/sniff-content-type';

import type { Route } from './+types/a.$slug_.files.$checklistItemId';

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
