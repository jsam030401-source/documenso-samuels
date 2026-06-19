'use client';

import { ArrowLeft, CheckCircle2, Download, ExternalLink, Loader2, Package, Upload } from 'lucide-react';
import Link from 'next/link';
import { useRef, useState, useTransition } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { Database } from '@/lib/supabase/types';
import { generatePackages, markParticipantSubmitted, uploadAdminDoc } from './actions';

type Deal = Database['public']['Tables']['deals']['Row'];
type Participant = Database['public']['Tables']['participants']['Row'];
type Person = Database['public']['Tables']['people']['Row'];
type ChecklistItem = Database['public']['Tables']['checklist_items']['Row'];
type TemplateInstance = Database['public']['Tables']['template_instances']['Row'];
type Template = Database['public']['Tables']['templates']['Row'];

type ParticipantWithDetails = Participant & {
  people: Person;
  checklist_items: ChecklistItem[];
};

type InstanceWithTemplate = TemplateInstance & {
  templates: Template;
};

const CHECKLIST_LABELS: Record<string, string> = {
  id: 'Photo ID',
  income: 'Proof of Income',
  credit_report: 'Credit Report',
  proof_of_deposit: 'Proof of Deposit',
  other: 'Other Document',
};

export function ReviewView({
  deal,
  participants,
  templateInstances,
}: {
  deal: Deal;
  participants: ParticipantWithDetails[];
  templateInstances: InstanceWithTemplate[];
}) {
  const [isPending, startTransition] = useTransition();
  const [packages, setPackages] = useState<Array<{ name: string; url: string; skipped?: string[] }> | null>(null);

  const applicants = participants.filter((p) => p.role === 'applicant');
  const cosigners = participants.filter((p) => p.role === 'cosigner');

  function handleGeneratePackages() {
    startTransition(async () => {
      const result = await generatePackages(deal.id);
      if (result.packages) {
        setPackages(result.packages);
      }
    });
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href={`/app/deals/${deal.id}`}>
            <Button variant="ghost" size="icon-sm">
              <ArrowLeft className="size-4" />
            </Button>
          </Link>
          <div>
            <h1 className="font-bold text-2xl tracking-tight">Review: {deal.name || deal.unit_address || 'Deal'}</h1>
            <p className="text-muted-foreground text-sm">Review all documents before generating packages</p>
          </div>
        </div>
        <div className="group relative">
          <Button onClick={handleGeneratePackages} disabled={isPending || !!deal.files_purged_at}>
            {isPending ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Package className="size-4" />
                Generate Packages
              </>
            )}
          </Button>
          {deal.files_purged_at && (
            <div className="pointer-events-none absolute right-0 bottom-full mb-2 hidden w-64 rounded-md border bg-popover p-2 text-popover-foreground text-xs shadow-md group-hover:block">
              Files have been purged. View the Application Packets in Drive.
            </div>
          )}
        </div>
      </div>

      {/* Generated packages */}
      {packages && packages.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Generated Packages</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {packages.map((pkg) => (
              <div key={pkg.name} className="space-y-1">
                <div className="flex items-center justify-between rounded-md border p-3">
                  <span className="font-medium text-sm">{pkg.name}</span>
                  <a href={pkg.url} target="_blank" rel="noopener noreferrer">
                    <Button size="sm" variant="outline">
                      <Download className="size-4" />
                      Download
                    </Button>
                  </a>
                </div>
                {pkg.skipped && pkg.skipped.length > 0 && (
                  <div className="rounded-md border border-yellow-300 bg-yellow-50 p-2 text-xs text-yellow-800 dark:border-yellow-700 dark:bg-yellow-950/30 dark:text-yellow-400">
                    <p className="font-medium">
                      {pkg.skipped.length} file{pkg.skipped.length > 1 ? 's' : ''} skipped:
                    </p>
                    <ul className="mt-1 list-inside list-disc">
                      {pkg.skipped.map((s) => (
                        <li key={s}>{s}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Per-applicant review */}
      {applicants.map((applicant) => {
        const linkedCosigners = cosigners.filter((c) => c.linked_to_participant_id === applicant.id);

        const applicantInstances = templateInstances.filter(
          (ti) => ti.participant_id === applicant.id || ti.participant_id === null,
        );

        return (
          <Card key={applicant.id}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>{applicant.people.name}</CardTitle>
                  <p className="mt-0.5 text-muted-foreground text-xs">
                    <a href={`mailto:${applicant.people.email}`} className="hover:underline">
                      {applicant.people.email}
                    </a>
                    {applicant.people.phone && (
                      <>
                        {' · '}
                        <a href={`tel:${applicant.people.phone}`} className="hover:underline">
                          {applicant.people.phone}
                        </a>
                      </>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {applicant.is_student && <Badge variant="outline">Student</Badge>}
                  <ReviewStatusBadge status={applicant.status} />
                  <MarkReviewedButton
                    dealId={deal.id}
                    participantId={applicant.id}
                    isSubmitted={applicant.status === 'reviewed'}
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Signed documents */}
              {applicantInstances.length > 0 && (
                <div className="space-y-1">
                  <h4 className="font-medium text-muted-foreground text-xs">Signed Documents</h4>
                  {applicantInstances.map((ti) => (
                    <DocRow
                      key={ti.id}
                      label={ti.templates.name}
                      url={ti.pdf_file_url}
                      signed={ti.status === 'completed'}
                    />
                  ))}
                </div>
              )}

              {/* Checklist docs */}
              <div className="space-y-1">
                <h4 className="font-medium text-muted-foreground text-xs">Uploaded Documents</h4>
                {applicant.checklist_items.map((ci) => (
                  <DocRow
                    key={ci.id}
                    label={CHECKLIST_LABELS[ci.item_type] || ci.item_type}
                    url={ci.staging_file_url}
                    signed={ci.status === 'uploaded' || ci.status === 'approved' || ci.status === 'signed'}
                  />
                ))}
              </div>

              {/* Admin upload: credit report + proof of deposit */}
              <div className="space-y-2">
                <h4 className="font-medium text-muted-foreground text-xs">Admin Uploads</h4>
                <AdminUploadRow
                  dealId={deal.id}
                  participantId={applicant.id}
                  itemType="credit_report"
                  label="Credit Report"
                  existingUrl={
                    applicant.checklist_items.find((ci) => ci.item_type === 'credit_report')?.staging_file_url
                  }
                />
                <AdminUploadRow
                  dealId={deal.id}
                  participantId={applicant.id}
                  itemType="proof_of_deposit"
                  label="Proof of Deposit"
                  existingUrl={
                    applicant.checklist_items.find((ci) => ci.item_type === 'proof_of_deposit')?.staging_file_url
                  }
                />
              </div>

              {/* Cosigner section */}
              {linkedCosigners.length > 0 && (
                <div className="space-y-3 border-t pt-3">
                  <h4 className="font-medium text-muted-foreground text-xs">Co-signers</h4>
                  {linkedCosigners.map((cosigner) => {
                    const cosignerInstances = templateInstances.filter((ti) => ti.participant_id === cosigner.id);

                    return (
                      <div key={cosigner.id} className="space-y-2 rounded-md border bg-muted/20 p-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="font-medium text-sm">{cosigner.people.name}</span>
                            <p className="text-muted-foreground text-xs">
                              <a href={`mailto:${cosigner.people.email}`} className="hover:underline">
                                {cosigner.people.email}
                              </a>
                              {cosigner.people.phone && (
                                <>
                                  {' · '}
                                  <a href={`tel:${cosigner.people.phone}`} className="hover:underline">
                                    {cosigner.people.phone}
                                  </a>
                                </>
                              )}
                            </p>
                          </div>
                          <ReviewStatusBadge status={cosigner.status} />
                        </div>

                        {cosignerInstances.map((ti) => (
                          <DocRow
                            key={ti.id}
                            label={ti.templates.name}
                            url={ti.pdf_file_url}
                            signed={ti.status === 'completed'}
                          />
                        ))}

                        {cosigner.checklist_items.map((ci) => (
                          <DocRow
                            key={ci.id}
                            label={CHECKLIST_LABELS[ci.item_type] || ci.item_type}
                            url={ci.staging_file_url}
                            signed={ci.status === 'uploaded' || ci.status === 'approved' || ci.status === 'signed'}
                          />
                        ))}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function ReviewStatusBadge({ status }: { status: string }) {
  if (status === 'reviewed') {
    return (
      <Badge variant="default">
        <CheckCircle2 className="mr-1 size-3" />
        Reviewed
      </Badge>
    );
  }
  if (status === 'complete') {
    return <Badge variant="secondary">Complete</Badge>;
  }
  return <Badge variant="outline">{status}</Badge>;
}

function MarkReviewedButton({
  dealId,
  participantId,
  isSubmitted,
}: {
  dealId: string;
  participantId: string;
  isSubmitted: boolean;
}) {
  const [isPending, startTransition] = useTransition();

  if (isSubmitted) {
    return null;
  }

  return (
    <Button
      size="sm"
      variant="outline"
      disabled={isPending}
      onClick={() => {
        startTransition(async () => {
          await markParticipantSubmitted(dealId, participantId);
        });
      }}
    >
      {isPending ? '...' : 'Mark Submitted'}
    </Button>
  );
}

function DocRow({ label, url, signed }: { label: string; url: string | null; signed: boolean }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span>{label}</span>
      <div className="flex items-center gap-2">
        {url ? (
          <>
            <Badge variant={signed ? 'secondary' : 'outline'}>{signed ? 'Ready' : 'Missing'}</Badge>
            <a href={url} target="_blank" rel="noopener noreferrer" className="text-primary">
              <ExternalLink className="size-3" />
            </a>
          </>
        ) : (
          <Badge variant="outline">Missing</Badge>
        )}
      </div>
    </div>
  );
}

function AdminUploadRow({
  dealId,
  participantId,
  itemType,
  label,
  existingUrl,
}: {
  dealId: string;
  participantId: string;
  itemType: 'credit_report' | 'proof_of_deposit';
  label: string;
  existingUrl?: string | null;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [isPending, startTransition] = useTransition();

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) {
      return;
    }

    const formData = new FormData();
    formData.set('file', file);

    startTransition(async () => {
      await uploadAdminDoc(dealId, participantId, itemType, formData);
    });

    e.target.value = '';
  }

  return (
    <div className="flex items-center justify-between text-sm">
      <span>{label}</span>
      <div className="flex items-center gap-2">
        {existingUrl && (
          <>
            <Badge variant="secondary">Uploaded</Badge>
            <a href={existingUrl} target="_blank" rel="noopener noreferrer" className="text-primary">
              <ExternalLink className="size-3" />
            </a>
          </>
        )}
        <input ref={fileRef} type="file" className="hidden" accept=".pdf,image/*" onChange={handleFile} />
        <Button size="icon-xs" variant="outline" disabled={isPending} onClick={() => fileRef.current?.click()}>
          {isPending ? <Loader2 className="size-3 animate-spin" /> : <Upload className="size-3" />}
        </Button>
      </div>
    </div>
  );
}
