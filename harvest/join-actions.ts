'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { generateChecklistForParticipant } from '@/lib/checklist';
import { sendTelegramAsync } from '@/lib/notify/telegram';
import { createServiceClient } from '@/lib/supabase/server';
import type { Database } from '@/lib/supabase/types';

type PersonInsert = Database['public']['Tables']['people']['Insert'];
type ParticipantInsert = Database['public']['Tables']['participants']['Insert'];

export type JoinFormState = {
  error?: string;
};

export type SignInFormState = {
  error?: string;
  notFound?: boolean;
};

async function setParticipantCookie(slug: string, participantId: string) {
  const cookieStore = await cookies();
  cookieStore.set(`pads_participant_${slug}`, participantId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: `/g/${slug}`,
    maxAge: 60 * 60 * 24 * 365, // 1 year
  });
}

export async function joinDeal(slug: string, _prev: JoinFormState, formData: FormData): Promise<JoinFormState> {
  const firstName = (formData.get('first_name') as string)?.trim();
  const lastName = (formData.get('last_name') as string)?.trim();
  const email = (formData.get('email') as string)?.trim().toLowerCase();
  const phone = (formData.get('phone') as string)?.trim();
  const role = formData.get('role') as 'applicant' | 'cosigner';
  const isStudent = formData.get('is_student') === 'on';
  const linkedTo = formData.get('linked_to') as string | null;

  if (!firstName || !lastName || !email || !phone || !role) {
    return { error: 'All fields are required.' };
  }

  const name = `${firstName} ${lastName}`;

  try {
    const supabase = await createServiceClient();

    // Look up the deal by slug
    const { data: dealData, error: dealError } = await supabase
      .from('deals')
      .select('id, workspace_id, status, name')
      .eq('group_link_slug', slug)
      .single();

    if (dealError) {
      console.error('[joinDeal] Deal lookup failed:', dealError);
      return { error: 'Something went wrong. Please try again.' };
    }

    const deal = dealData as {
      id: string;
      workspace_id: string;
      status: string;
      name: string | null;
    } | null;

    if (!deal) {
      return { error: 'Deal not found.' };
    }

    if (['approved', 'denied', 'withdrawn'].includes(deal.status)) {
      return { error: 'This deal is no longer accepting applications.' };
    }

    // Cosigners must link to an existing applicant on this deal.
    if (role === 'cosigner') {
      if (!linkedTo) {
        const { data: applicantsData } = await supabase
          .from('participants')
          .select('id')
          .eq('deal_id', deal.id)
          .eq('role', 'applicant')
          .limit(1);

        if (!applicantsData || applicantsData.length === 0) {
          return {
            error: "Wait until the applicant you're co-signing for creates their account, then come back to join.",
          };
        }

        return { error: "Please select the applicant you're co-signing for." };
      }

      const { data: linkedApplicant } = await supabase
        .from('participants')
        .select('id')
        .eq('id', linkedTo)
        .eq('deal_id', deal.id)
        .eq('role', 'applicant')
        .single();

      if (!linkedApplicant) {
        return { error: "Please select the applicant you're co-signing for." };
      }
    }

    // Check if this email already has a participant in this deal
    const { data: existingData } = await supabase
      .from('participants')
      .select('id, people!inner(email)')
      .eq('deal_id', deal.id);

    const existing = (existingData ?? []) as Array<{
      id: string;
      people: { email: string };
    }>;

    const alreadyJoined = existing.find((p) => p.people.email === email);

    if (alreadyJoined) {
      return { error: 'This email is already registered for this deal. Use "Already joined? Sign in" instead.' };
    }

    // Person matching: find existing person in this workspace by email + phone
    const { data: existingPersonData } = await supabase
      .from('people')
      .select('id')
      .eq('workspace_id', deal.workspace_id)
      .eq('email', email)
      .eq('phone', phone)
      .single();

    let personId: string;

    if (existingPersonData) {
      personId = (existingPersonData as { id: string }).id;
    } else {
      const personRow: PersonInsert = {
        workspace_id: deal.workspace_id,
        name,
        email,
        phone,
      };

      const { data: newPersonData, error: personError } = await supabase
        .from('people')
        .insert(personRow as never)
        .select('id')
        .single();

      if (personError || !newPersonData) {
        console.error('[joinDeal] Person insert failed:', personError);
        return { error: 'Something went wrong. Please try again.' };
      }

      personId = (newPersonData as { id: string }).id;
    }

    // Create participant
    const participantRow: ParticipantInsert = {
      deal_id: deal.id,
      person_id: personId,
      role,
      is_student: role === 'applicant' ? isStudent : false,
      linked_to_participant_id: role === 'cosigner' && linkedTo ? linkedTo : undefined,
      status: 'not_started',
    };

    const { data: participantData, error: participantError } = await supabase
      .from('participants')
      .insert(participantRow as never)
      .select('id')
      .single();

    if (participantError || !participantData) {
      console.error('[joinDeal] Participant insert failed:', participantError);
      return { error: 'Something went wrong. Please try again.' };
    }

    const participantId = (participantData as { id: string }).id;

    // Always generate checklist on join
    await generateChecklistForParticipant(supabase, participantId, role, isStudent);

    sendTelegramAsync(
      `🆕 New ${role}${isStudent ? ' (student)' : ''} joined "${deal.name ?? 'Untitled deal'}": ${name} (${email})`,
    );

    await setParticipantCookie(slug, participantId);
    redirect(`/g/${slug}?p=${participantId}`);
  } catch (e) {
    // Re-throw redirect (Next.js uses thrown responses for redirects)
    if (e instanceof Error && e.message === 'NEXT_REDIRECT') {
      throw e;
    }
    // Re-throw any Next.js internal redirect
    if (typeof e === 'object' && e !== null && 'digest' in e) {
      throw e;
    }
    console.error('[joinDeal] Unexpected error:', e);
    return { error: 'Something went wrong. Please try again.' };
  }
}

export async function signInToDeal(slug: string, _prev: SignInFormState, formData: FormData): Promise<SignInFormState> {
  const email = (formData.get('email') as string)?.trim().toLowerCase();
  const phone = (formData.get('phone') as string)?.trim();

  if (!email || !phone) {
    return { error: 'Email and phone are required.' };
  }

  try {
    const supabase = await createServiceClient();

    // Look up the deal
    const { data: dealData, error: dealError } = await supabase
      .from('deals')
      .select('id')
      .eq('group_link_slug', slug)
      .single();

    if (dealError || !dealData) {
      console.error('[signInToDeal] Deal lookup failed:', dealError);
      return { error: 'Something went wrong. Please try again.' };
    }

    const dealId = (dealData as { id: string }).id;

    // Search for participant with matching email AND phone
    const { data: participantsData } = await supabase
      .from('participants')
      .select('id, people!inner(email, phone)')
      .eq('deal_id', dealId);

    const participants = (participantsData ?? []) as Array<{
      id: string;
      people: { email: string; phone: string };
    }>;

    const match = participants.find((p) => p.people.email === email && p.people.phone === phone);

    if (!match) {
      // Don't reveal whether email or phone was wrong
      return { notFound: true };
    }

    await setParticipantCookie(slug, match.id);
    redirect(`/g/${slug}?p=${match.id}`);
  } catch (e) {
    if (e instanceof Error && e.message === 'NEXT_REDIRECT') {
      throw e;
    }
    if (typeof e === 'object' && e !== null && 'digest' in e) {
      throw e;
    }
    console.error('[signInToDeal] Unexpected error:', e);
    return { error: 'Something went wrong. Please try again.' };
  }
}
