import { trpc } from '@documenso/trpc/react';
import { Badge } from '@documenso/ui/primitives/badge';
import { Button } from '@documenso/ui/primitives/button';
import { Card, CardContent, CardHeader, CardTitle } from '@documenso/ui/primitives/card';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import { Link, useParams } from 'react-router';

export function meta() {
  return [{ title: 'Rental Application' }];
}

type ChecklistStatus = 'PENDING' | 'UPLOADED' | 'APPROVED' | 'REJECTED';
type ChecklistType = 'ID' | 'INCOME' | 'CREDIT_REPORT' | 'PROOF_OF_DEPOSIT' | 'OTHER';

const TYPE_LABELS: Record<ChecklistType, string> = {
  ID: 'Photo ID',
  INCOME: 'Proof of Income',
  CREDIT_REPORT: 'Credit Report',
  PROOF_OF_DEPOSIT: 'Proof of Deposit',
  OTHER: 'Other Document',
};

const STATUS_VARIANT: Record<ChecklistStatus, 'neutral' | 'secondary' | 'default' | 'destructive'> = {
  PENDING: 'neutral',
  UPLOADED: 'secondary',
  APPROVED: 'default',
  REJECTED: 'destructive',
};

type ChecklistItem = {
  id: string;
  type: ChecklistType;
  label: string | null;
  status: ChecklistStatus;
  hasFile: boolean;
};

type Participant = {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: 'APPLICANT' | 'COSIGNER';
  isStudent: boolean;
  linkedToId: string | null;
  linkedToName: string | null;
  checklist: ChecklistItem[];
  progress: { completed: number; total: number };
};

function ParticipantBlock({
  participant,
  teamUrl,
  applicationId,
  nested,
}: {
  participant: Participant;
  teamUrl: string;
  applicationId: string;
  nested?: boolean;
}) {
  const { progress } = participant;
  const complete = progress.total > 0 && progress.completed === progress.total;

  return (
    <div className={nested ? 'mt-3 border-muted border-l-2 pl-4' : ''}>
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="font-medium text-sm">
            {participant.name}{' '}
            <span className="font-normal text-muted-foreground">
              · {participant.role === 'APPLICANT' ? 'Applicant' : 'Co-signer'}
              {participant.isStudent && ' (Student)'}
              {participant.role === 'COSIGNER' && participant.linkedToName ? ` for ${participant.linkedToName}` : ''}
            </span>
          </p>
          <p className="text-muted-foreground text-xs">
            {participant.email} · {participant.phone}
          </p>
        </div>
        <Badge variant={complete ? 'default' : 'neutral'}>
          {progress.completed}/{progress.total} docs
        </Badge>
      </div>

      <div className="mt-2 space-y-1">
        {participant.checklist.length === 0 ? (
          <p className="text-muted-foreground text-xs">No documents required.</p>
        ) : (
          participant.checklist.map((item) => (
            <div key={item.id} className="flex items-center justify-between gap-2 text-sm">
              <span>{item.label || TYPE_LABELS[item.type]}</span>
              <div className="flex items-center gap-2">
                {item.hasFile && (
                  <a
                    href={`/t/${teamUrl}/applications/${applicationId}/files/${item.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-muted-foreground text-xs hover:text-foreground"
                  >
                    <ExternalLink className="size-3" />
                    View
                  </a>
                )}
                <Badge variant={STATUS_VARIANT[item.status]}>{item.status}</Badge>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default function ApplicationDetailPage() {
  const params = useParams();
  const teamUrl = params.teamUrl ?? '';
  const id = params.id ?? '';

  const { data, isLoading } = trpc.application.getApplication.useQuery({ id });

  const origin = typeof window !== 'undefined' ? window.location.origin : '';

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <Link
        to={`/t/${teamUrl}/applications`}
        className="mb-4 inline-flex items-center gap-1 text-muted-foreground text-sm hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        All applications
      </Link>

      {isLoading ? (
        <p className="text-muted-foreground text-sm">Loading…</p>
      ) : !data ? (
        <p className="text-muted-foreground text-sm">Application not found.</p>
      ) : (
        <ApplicationDetail data={data} teamUrl={teamUrl} origin={origin} />
      )}
    </div>
  );
}

function ApplicationDetail({
  data,
  teamUrl,
  origin,
}: {
  data: {
    application: {
      id: string;
      slug: string;
      title: string | null;
      unitAddress: string | null;
      rent: number | null;
      moveInDate: Date | string | null;
      status: string;
    };
    participants: Participant[];
  };
  teamUrl: string;
  origin: string;
}) {
  const { application, participants } = data;

  const applicants = participants.filter((p) => p.role === 'APPLICANT');
  const cosignersFor = (applicantId: string) =>
    participants.filter((p) => p.role === 'COSIGNER' && p.linkedToId === applicantId);
  const orphanCosigners = participants.filter((p) => p.role === 'COSIGNER' && !p.linkedToId);

  return (
    <>
      <div className="mb-6">
        <div className="flex items-center gap-2">
          <h1 className="font-semibold text-2xl">
            {application.title || application.unitAddress || 'Rental application'}
          </h1>
          <Badge variant="neutral">{application.status}</Badge>
        </div>
        {application.unitAddress && <p className="mt-1 text-muted-foreground text-sm">{application.unitAddress}</p>}
        <div className="mt-2 flex flex-wrap items-center gap-2 text-muted-foreground text-sm">
          <span className="rounded bg-muted px-2 py-1 text-xs">
            {origin}/a/{application.slug}
          </span>
          <a href={`/a/${application.slug}`} target="_blank" rel="noopener noreferrer">
            <Button type="button" variant="outline" size="sm">
              Open tenant link
            </Button>
          </a>
        </div>
      </div>

      <h2 className="mb-3 font-semibold text-lg">Participants</h2>

      {participants.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground text-sm">
            Nobody has joined yet. Share the tenant link above.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {applicants.map((applicant) => (
            <Card key={applicant.id}>
              <CardContent className="py-4">
                <ParticipantBlock participant={applicant} teamUrl={teamUrl} applicationId={application.id} />
                {cosignersFor(applicant.id).map((cosigner) => (
                  <ParticipantBlock
                    key={cosigner.id}
                    participant={cosigner}
                    teamUrl={teamUrl}
                    applicationId={application.id}
                    nested
                  />
                ))}
              </CardContent>
            </Card>
          ))}

          {orphanCosigners.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Co-signers (unlinked)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 py-4">
                {orphanCosigners.map((cosigner) => (
                  <ParticipantBlock
                    key={cosigner.id}
                    participant={cosigner}
                    teamUrl={teamUrl}
                    applicationId={application.id}
                  />
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </>
  );
}
