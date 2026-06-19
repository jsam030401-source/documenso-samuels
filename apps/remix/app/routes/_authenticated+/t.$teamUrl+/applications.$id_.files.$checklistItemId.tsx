import { getOptionalSession } from '@documenso/auth/server/lib/utils/get-session';
import { getChecklistItemFileForTeam } from '@documenso/lib/server-only/rental/get-checklist-item-file';
import { getTeamByUrl } from '@documenso/lib/server-only/team/get-team';
import { getFileServerSide } from '@documenso/lib/universal/upload/get-file.server';

import { sniffContentType } from '~/utils/sniff-content-type';

import type { Route } from './+types/applications.$id_.files.$checklistItemId';

/**
 * Admin file viewer for a participant's supporting document. Authorised by the
 * Documenso session AND team membership (getTeamByUrl throws if the user isn't a
 * member), then the item is scoped to that team — so an admin can never reach
 * another team's uploads.
 */
export async function loader({ request, params }: Route.LoaderArgs) {
  const { teamUrl, checklistItemId } = params;

  if (!teamUrl || !checklistItemId) {
    throw new Response('Not Found', { status: 404 });
  }

  const { user } = await getOptionalSession(request);

  if (!user) {
    throw new Response('Unauthorized', { status: 401 });
  }

  const team = await getTeamByUrl({ userId: user.id, teamUrl }).catch(() => null);

  if (!team) {
    throw new Response('Not Found', { status: 404 });
  }

  const result = await getChecklistItemFileForTeam({ teamId: team.id, checklistItemId });

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
