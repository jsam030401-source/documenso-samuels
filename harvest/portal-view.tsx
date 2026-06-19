'use client';

import {
  Bookmark,
  CalendarDays,
  CheckCircle2,
  DollarSign,
  ExternalLink,
  FileText,
  FolderOpen,
  MapPin,
  PenLine,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { PortalBannerHeader } from '@/components/branding/portal-banner-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useBrand } from '@/lib/branding/brand-provider';
import { getParticipantProgress } from '@/lib/progress';
import type { Database } from '@/lib/supabase/types';
import { ChecklistCard } from './checklist-card';

type Deal = Database['public']['Tables']['deals']['Row'];
type Participant = Database['public']['Tables']['participants']['Row'];
type Person = Database['public']['Tables']['people']['Row'];
type ChecklistItem = Database['public']['Tables']['checklist_items']['Row'];
type TemplateInstance = Database['public']['Tables']['template_instances']['Row'];
type Template = Database['public']['Tables']['templates']['Row'];

type InstanceWithTemplate = TemplateInstance & { templates: Template };

type GroupMember = {
  id: string;
  role: 'applicant' | 'cosigner';
  linked_to_participant_id: string | null;
  people: { name: string } | null;
};

export function PortalView({
  deal,
  participant,
  checklist,
  templateInstances,
  signedInstanceIdList,
  groupMembers,
  slug,
}: {
  deal: Deal;
  participant: Participant & { people: Person };
  checklist: ChecklistItem[];
  templateInstances: InstanceWithTemplate[];
  signedInstanceIdList: string[];
  groupMembers: GroupMember[];
  slug: string;
}) {
  const participantId = participant.id;
  const signedInstanceIds = new Set(signedInstanceIdList);

  // Students don't need proof of income — suppress income items from their
  // required-documents list so this surface agrees with the admin side.
  const requiredChecklist = participant.is_student
    ? checklist.filter((item) => item.item_type !== 'income')
    : checklist;

  const { completed: completedCount, total: totalCount } = getParticipantProgress(
    requiredChecklist,
    templateInstances,
    participantId,
    signedInstanceIds,
  );

  const brand = useBrand();
  const roleLabel = participant.role === 'applicant' ? 'Applicant' : 'Co-signer';
  const hasDealInfo = deal.unit_address || deal.rent != null || deal.move_in_date;

  const allParticipants: GroupMember[] = [
    {
      id: participant.id,
      role: participant.role,
      linked_to_participant_id: participant.linked_to_participant_id,
      people: { name: participant.people.name },
    },
    ...groupMembers,
  ];
  const nameById = new Map(allParticipants.map((m) => [m.id, m.people?.name ?? 'Unknown']));

  return (
    <div className="flex min-h-screen flex-col bg-muted/30">
      <PortalBannerHeader brand={brand} />
      <div className="mx-auto w-full max-w-lg px-4 py-8 sm:py-12">
        {/* Header */}
        <div className="mb-6 text-center">
          <h1 className="font-bold text-2xl tracking-tight">
            {deal.name || deal.unit_address || 'Rental Application'}
          </h1>
          <p className="mt-1 text-muted-foreground text-sm">Your Application Portal</p>
        </div>

        {/* Your Documents — shown after export */}
        {participant.drive_personal_folder_url && (
          <Card className="mb-4 border-green-200 bg-green-50/50 dark:border-green-900 dark:bg-green-950/20">
            <CardHeader>
              <div className="flex items-center gap-2">
                <FolderOpen className="size-5 text-green-600" />
                <CardTitle className="text-base">Your Documents</CardTitle>
              </div>
              <CardDescription>Your signed forms and submitted documents are now in Google Drive.</CardDescription>
            </CardHeader>
            <CardContent>
              <a href={participant.drive_personal_folder_url} target="_blank" rel="noopener noreferrer">
                <Button size="sm" variant="outline">
                  <ExternalLink className="size-4" />
                  Open your folder
                </Button>
              </a>
              <p className="mt-2 text-muted-foreground text-xs">
                This folder is shared via link. Anyone with the link can view it.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Welcome card */}
        <Card className="mb-4">
          <CardHeader>
            <CardTitle>{participant.people.name}</CardTitle>
            <CardDescription>
              {roleLabel}
              {participant.is_student && ' (Student)'}
            </CardDescription>
          </CardHeader>
          {!hasDealInfo && (
            <CardContent>
              <div className="flex items-center gap-2 rounded-md border bg-muted/50 p-3">
                <Bookmark className="size-4 shrink-0 text-muted-foreground" />
                <p className="text-muted-foreground text-xs">
                  Bookmark this page &mdash; it&apos;s your one link for everything.
                </p>
              </div>
            </CardContent>
          )}
        </Card>

        {/* Your Group */}
        {groupMembers.length > 0 && (
          <Card className="mb-4">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Users className="size-5 text-muted-foreground" />
                <CardTitle className="text-base">Your Group</CardTitle>
              </div>
              <CardDescription>Others who have joined this deal so far.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {groupMembers.map((m) => {
                const name = m.people?.name ?? 'Unknown';
                const isCosigner = m.role === 'cosigner';
                const linkedName = m.linked_to_participant_id ? nameById.get(m.linked_to_participant_id) : null;
                const subtitle = isCosigner ? (linkedName ? `Co-signer for ${linkedName}` : 'Co-signer') : 'Applicant';
                return (
                  <div key={m.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="font-medium">{name}</span>
                    <span className="text-muted-foreground text-xs">{subtitle}</span>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}

        {/* Deal info (shown when available) */}
        {hasDealInfo && (
          <Card className="mb-4">
            <CardContent className="space-y-2 py-4">
              {deal.unit_address && (
                <div className="flex items-center gap-2 text-sm">
                  <MapPin className="size-4 text-muted-foreground" />
                  <span>{deal.unit_address}</span>
                </div>
              )}
              {deal.rent != null && (
                <div className="flex items-center gap-2 text-sm">
                  <DollarSign className="size-4 text-muted-foreground" />
                  <span>${deal.rent.toLocaleString()}/month</span>
                </div>
              )}
              {deal.move_in_date && (
                <div className="flex items-center gap-2 text-sm">
                  <CalendarDays className="size-4 text-muted-foreground" />
                  <span>
                    Move-in:{' '}
                    {new Date(deal.move_in_date + 'T00:00:00').toLocaleDateString('en-US', {
                      month: 'long',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </span>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Progress bar */}
        {totalCount > 0 && (
          <Card className="mb-4">
            <CardContent className="py-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Progress</span>
                <span className="font-medium">
                  {completedCount} / {totalCount} complete
                </span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{
                    width: `${(completedCount / totalCount) * 100}%`,
                  }}
                />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Forms to sign */}
        {templateInstances.length > 0 && (
          <div className="mb-6 space-y-3">
            <h2 className="font-semibold text-lg">Forms to Sign</h2>
            {templateInstances.map((instance) => (
              <Card key={instance.id}>
                <CardContent className="flex items-center justify-between py-4">
                  <div className="flex items-center gap-3">
                    <div className="flex size-10 items-center justify-center rounded-lg bg-muted">
                      <FileText className="size-5 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="font-medium text-sm">{instance.templates.name}</p>
                      <p className="text-muted-foreground text-xs">
                        {instance.participant_id ? 'Assigned to you' : 'Shared document'}
                      </p>
                    </div>
                  </div>
                  {instance.status === 'completed' || signedInstanceIds.has(instance.id) ? (
                    <Badge variant="default">
                      <CheckCircle2 className="mr-1 size-3" />
                      Signed
                    </Badge>
                  ) : (
                    <Link href={`/p/${participantId}/sign/${instance.id}`}>
                      <Button size="sm">
                        <PenLine className="size-4" />
                        Sign
                      </Button>
                    </Link>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Documents to submit */}
        <div className="space-y-3">
          <h2 className="font-semibold text-lg">Documents to Submit</h2>
          {requiredChecklist.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground text-sm">
                No documents required yet.
              </CardContent>
            </Card>
          ) : (
            requiredChecklist.map((item) => <ChecklistCard key={item.id} item={item} participantId={participantId} />)
          )}
        </div>

        {/* Footer */}
        {(brand.supportEmail || brand.supportPhone) && (
          <div className="mt-8 border-t pt-4 text-center text-muted-foreground text-xs">
            {brand.supportEmail && <span>{brand.supportEmail}</span>}
            {brand.supportEmail && brand.supportPhone && <span> {'\u2022'} </span>}
            {brand.supportPhone && <span>{brand.supportPhone}</span>}
          </div>
        )}
      </div>
    </div>
  );
}
