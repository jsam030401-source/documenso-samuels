import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { PortalBannerHeader } from '@/components/branding/portal-banner-header';
import { BrandProvider } from '@/lib/branding/brand-provider';
import { getBrandFromSlug } from '@/lib/branding/portal-brand';
import { getSignedUrl } from '@/lib/storage';
import { createServiceClient } from '@/lib/supabase/server';
import type { Database } from '@/lib/supabase/types';
import { GroupLanding } from './group-landing';
import { PortalView } from './portal-view';

type Deal = Database['public']['Tables']['deals']['Row'];
type Participant = Database['public']['Tables']['participants']['Row'];
type Person = Database['public']['Tables']['people']['Row'];
type ChecklistItem = Database['public']['Tables']['checklist_items']['Row'];
type TemplateInstance = Database['public']['Tables']['template_instances']['Row'];
type Template = Database['public']['Tables']['templates']['Row'];

type InstanceWithTemplate = TemplateInstance & { templates: Template };

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  try {
    const brand = await getBrandFromSlug(slug);
    return {
      title: `Your Application \u2022 ${brand.companyName}`,
    };
  } catch {
    return { title: 'Your Application \u2022 PADS' };
  }
}

export default async function GroupPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ p?: string; role?: string }>;
}) {
  const { slug } = await params;
  const { p: participantId, role } = await searchParams;

  const supabase = await createServiceClient();

  const { data: dealData } = await supabase.from('deals').select('*').eq('group_link_slug', slug).single();

  if (!dealData) {
    notFound();
  }

  const deal = dealData as Deal;
  const isClosed = ['approved', 'denied', 'withdrawn'].includes(deal.status);
  const brand = await getBrandFromSlug(slug);

  // If no ?p= param, check for recognition cookie
  if (!participantId) {
    const cookieStore = await cookies();
    const savedId = cookieStore.get(`pads_participant_${slug}`)?.value;

    if (savedId) {
      // Verify the participant still exists
      const { data: check } = await supabase
        .from('participants')
        .select('id')
        .eq('id', savedId)
        .eq('deal_id', deal.id)
        .single();

      if (check) {
        redirect(`/g/${slug}?p=${savedId}`);
      }
    }
  }

  // If ?p= is present, render portal view
  if (participantId) {
    const { data: participantData } = await supabase
      .from('participants')
      .select('*, people(*)')
      .eq('id', participantId)
      .single();

    if (!participantData) {
      notFound();
    }

    const participant = participantData as Participant & { people: Person };

    // Cookie is set by the join/sign-in server actions — can't set in server components

    // Fetch checklist items
    const { data: checklistData } = await supabase
      .from('checklist_items')
      .select('*')
      .eq('participant_id', participantId)
      .order('created_at', { ascending: true });

    const checklist = (checklistData ?? []) as ChecklistItem[];

    // Fetch sent/completed template instances for this deal
    const { data: instancesData } = await supabase
      .from('template_instances')
      .select('*, templates(*)')
      .eq('deal_id', participant.deal_id)
      .in('status', ['sent', 'completed']);

    // Filter to only instances where this participant has at least one assigned field
    const allInstances = (instancesData ?? []) as InstanceWithTemplate[];
    const templateInstances = allInstances.filter((inst) => {
      const fields = (Array.isArray(inst.fields_json) ? inst.fields_json : []) as Array<{ assignedTo?: string | null }>;
      return fields.some((f) => f.assignedTo === participantId);
    });

    // Query this participant's per-signer signed state
    const { data: signerData } = await supabase
      .from('template_instance_signers')
      .select('instance_id')
      .eq('participant_id', participantId)
      .not('signed_at', 'is', null);

    const signedInstanceIdList = ((signerData ?? []) as Array<{ instance_id: string }>).map((r) => r.instance_id);

    // Sign file URLs for private storage
    for (const ci of checklist) {
      if (ci.staging_file_url) {
        ci.staging_file_url = (await getSignedUrl(supabase, ci.staging_file_url)) ?? ci.staging_file_url;
      }
    }

    // Fetch other participants in the deal for the "Your Group" card
    const { data: groupData } = await supabase
      .from('participants')
      .select('id, role, linked_to_participant_id, people(name)')
      .eq('deal_id', participant.deal_id)
      .order('created_at', { ascending: true });

    const groupMembers = (
      (groupData ?? []) as Array<{
        id: string;
        role: 'applicant' | 'cosigner';
        linked_to_participant_id: string | null;
        people: { name: string } | null;
      }>
    ).filter((m) => m.id !== participantId);

    return (
      <BrandProvider brand={brand}>
        <PortalView
          deal={deal}
          participant={participant}
          checklist={checklist}
          templateInstances={templateInstances}
          signedInstanceIdList={signedInstanceIdList}
          groupMembers={groupMembers}
          slug={slug}
        />
      </BrandProvider>
    );
  }

  // No ?p= and no cookie — show join view
  if (isClosed) {
    return (
      <BrandProvider brand={brand}>
        <div className="flex min-h-screen flex-col bg-muted/30">
          <PortalBannerHeader brand={brand} />
          <div className="mx-auto w-full max-w-lg px-4 py-8 sm:py-12">
            <div className="mb-6 text-center">
              <h1 className="font-bold text-2xl tracking-tight">
                {deal.name || deal.unit_address || 'Rental Application'}
              </h1>
            </div>
            <div className="rounded-lg border bg-muted p-6 text-center">
              <p className="font-medium text-sm">This deal is no longer accepting applications.</p>
            </div>
          </div>
        </div>
      </BrandProvider>
    );
  }

  // Fetch existing applicants for cosigner link_to dropdown
  const { data: applicantsData } = await supabase
    .from('participants')
    .select('id, people(name)')
    .eq('deal_id', deal.id)
    .eq('role', 'applicant')
    .order('created_at', { ascending: true });

  const applicants = (applicantsData ?? []) as Array<{
    id: string;
    people: { name: string } | null;
  }>;

  const defaultRole = role === 'cosigner' ? 'cosigner' : 'applicant';
  const dealName = deal.name || deal.unit_address || 'Rental Application';

  return (
    <BrandProvider brand={brand}>
      <div className="flex min-h-screen flex-col bg-muted/30">
        <PortalBannerHeader brand={brand} />
        <div className="mx-auto w-full max-w-lg px-4 py-8 sm:py-12">
          <div className="mb-6 text-center">
            <h1 className="font-bold text-2xl tracking-tight">{dealName}</h1>
            <p className="mt-1 text-muted-foreground text-sm">Rental Application Portal</p>
          </div>

          <GroupLanding slug={slug} dealName={dealName} defaultRole={defaultRole} applicants={applicants} />
        </div>
      </div>
    </BrandProvider>
  );
}
