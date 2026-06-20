import { getOptionalSession } from '@documenso/auth/server/lib/utils/get-session';
import { getApplicantPacketFile } from '@documenso/lib/server-only/rental/get-applicant-packet-file';
import { getTeamByUrl } from '@documenso/lib/server-only/team/get-team';
import { getFileServerSide } from '@documenso/lib/universal/upload/get-file.server';

import type { Route } from './+types/applications.$id_.packets.$participantId';

/**
 * Admin download for an applicant's generated application packet. Authorised by
 * the Documenso session AND team membership (getTeamByUrl throws if the user
 * isn't a member); the packet lookup is itself team-scoped, so an admin can
 * never reach another team's application. Serves the *stored* packet (generated
 * via the "Generate packet" action) — 404 until one has been generated.
 */
export async function loader({ request, params }: Route.LoaderArgs) {
  const { teamUrl, participantId } = params;

  if (!teamUrl || !participantId) {
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

  const packet = await getApplicantPacketFile({ teamId: team.id, participantId });

  if (!packet) {
    throw new Response('Not Found', { status: 404 });
  }

  const bytes = await getFileServerSide(packet.documentData);

  return new Response(bytes, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${packet.filename}"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
