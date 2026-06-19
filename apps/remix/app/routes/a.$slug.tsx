import { getRentalApplicationBySlug } from '@documenso/lib/server-only/rental/get-application-by-slug';
import { getPortalData } from '@documenso/lib/server-only/rental/get-portal-data';
import { joinApplication } from '@documenso/lib/server-only/rental/join-application';
import { signInToApplication } from '@documenso/lib/server-only/rental/sign-in-to-application';
import { uploadChecklistFile } from '@documenso/lib/server-only/rental/upload-checklist-file';
import { ParticipantRole } from '@prisma/client';
import { redirect } from 'react-router';

import { GroupLanding } from '~/components/rental/group-landing';
import { PortalBannerHeader } from '~/components/rental/portal-banner-header';
import { PortalView } from '~/components/rental/portal-view';
import { readParticipantTokens, serializeParticipantTokens } from '~/storage/rental-participant.server';

import type { Route } from './+types/a.$slug';

const CLOSED_STATUSES = ['APPROVED', 'DENIED', 'WITHDRAWN'];

export function meta() {
  return [{ title: 'Rental Application' }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const { slug } = params;

  if (!slug) {
    throw new Response('Not Found', { status: 404 });
  }

  const tokens = await readParticipantTokens(request);
  const accessToken = tokens[slug];

  if (accessToken) {
    const portal = await getPortalData({ accessToken });

    if (portal && portal.application.slug === slug) {
      return { view: 'portal' as const, portal };
    }
  }

  const application = await getRentalApplicationBySlug({ slug });

  if (!application) {
    throw new Response('Not Found', { status: 404 });
  }

  return {
    view: 'join' as const,
    join: {
      title: application.title ?? application.unitAddress ?? 'Rental Application',
      closed: CLOSED_STATUSES.includes(application.status),
      applicants: application.participants.map((participant) => ({
        id: participant.id,
        name: participant.name,
      })),
    },
  };
}

export async function action({ request, params }: Route.ActionArgs) {
  const { slug } = params;

  if (!slug) {
    throw new Response('Not Found', { status: 404 });
  }

  const formData = await request.formData();
  const intent = formData.get('intent');

  if (intent === 'join') {
    const firstName = String(formData.get('first_name') ?? '').trim();
    const lastName = String(formData.get('last_name') ?? '').trim();
    const email = String(formData.get('email') ?? '');
    const phone = String(formData.get('phone') ?? '');
    const role = String(formData.get('role') ?? '');
    const isStudent = formData.get('is_student') === 'on';
    const linkedToRaw = formData.get('linked_to');
    const linkedToId = typeof linkedToRaw === 'string' && linkedToRaw ? linkedToRaw : null;

    if (role !== 'APPLICANT' && role !== 'COSIGNER') {
      return { error: 'Please choose a role.' };
    }

    const result = await joinApplication({
      slug,
      name: `${firstName} ${lastName}`.trim(),
      email,
      phone,
      role: role === 'APPLICANT' ? ParticipantRole.APPLICANT : ParticipantRole.COSIGNER,
      isStudent,
      linkedToId,
    });

    if (!result.ok) {
      return { error: result.error };
    }

    const tokens = await readParticipantTokens(request);
    tokens[slug] = result.accessToken;

    return redirect(`/a/${slug}`, {
      headers: { 'Set-Cookie': await serializeParticipantTokens(tokens) },
    });
  }

  if (intent === 'signin') {
    const email = String(formData.get('email') ?? '');
    const phone = String(formData.get('phone') ?? '');

    const result = await signInToApplication({ slug, email, phone });

    if (!result.ok) {
      return { notFound: true };
    }

    const tokens = await readParticipantTokens(request);
    tokens[slug] = result.accessToken;

    return redirect(`/a/${slug}`, {
      headers: { 'Set-Cookie': await serializeParticipantTokens(tokens) },
    });
  }

  if (intent === 'upload') {
    const tokens = await readParticipantTokens(request);
    const accessToken = tokens[slug];

    if (!accessToken) {
      return { error: 'Your session expired. Please refresh and sign in again.' };
    }

    const checklistItemId = String(formData.get('checklistItemId') ?? '');
    const file = formData.get('file');

    if (!(file instanceof File)) {
      return { error: 'No file selected.' };
    }

    const result = await uploadChecklistFile({ accessToken, checklistItemId, file });

    return result.ok ? { ok: true } : { error: result.error };
  }

  return { error: 'Unknown action.' };
}

export default function ApplicationPortalRoute({ loaderData }: Route.ComponentProps) {
  if (loaderData.view === 'portal') {
    return <PortalView data={loaderData.portal} />;
  }

  const { join } = loaderData;

  return (
    <div className="flex min-h-screen flex-col bg-muted/30">
      <PortalBannerHeader />

      <div className="mx-auto w-full max-w-lg px-4 py-8 sm:py-12">
        <div className="mb-6 text-center">
          <h1 className="font-bold text-2xl tracking-tight">{join.title}</h1>
          <p className="mt-1 text-muted-foreground text-sm">Rental application portal</p>
        </div>

        <GroupLanding title={join.title} applicants={join.applicants} closed={join.closed} />
      </div>
    </div>
  );
}
