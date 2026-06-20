import { getOptionalSession } from '@documenso/auth/server/lib/utils/get-session';
import { buildApplicantPacket } from '@documenso/lib/server-only/rental/build-applicant-packet';
import { getTeamByUrl } from '@documenso/lib/server-only/team/get-team';

import type { Route } from './+types/applications.$id_.packets.$participantId';

/**
 * Admin download for an applicant's merged application packet. Authorised by the
 * Documenso session AND team membership (getTeamByUrl throws if the user isn't a
 * member); the packet builder is itself team-scoped, so an admin can never reach
 * another team's application. The PDF is generated on demand from current data —
 * nothing is persisted — so it always reflects the latest uploads + signatures.
 */
export async function loader({ request, params }: Route.LoaderArgs) {
  const { teamUrl, id, participantId } = params;

  if (!teamUrl || !id || !participantId) {
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

  const packet = await buildApplicantPacket({
    teamId: team.id,
    applicationId: id,
    applicantParticipantId: participantId,
  });

  if (!packet) {
    throw new Response('Not Found', { status: 404 });
  }

  if (packet.skipped.length > 0) {
    console.warn(`[rental packet] ${participantId}: skipped ${packet.skipped.length} file(s):`, packet.skipped);
  }

  return new Response(packet.bytes, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${packet.filename}"`,
      'Cache-Control': 'private, no-store',
      'X-Packet-Skipped': String(packet.skipped.length),
    },
  });
}
