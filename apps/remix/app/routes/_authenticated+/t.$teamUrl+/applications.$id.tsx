import { getOptionalSession } from '@documenso/auth/server/lib/utils/get-session';
import { uploadAdminChecklistFile } from '@documenso/lib/server-only/rental/upload-admin-checklist-file';
import { getTeamByUrl } from '@documenso/lib/server-only/team/get-team';
import { trpc } from '@documenso/trpc/react';
import { cn } from '@documenso/ui/lib/utils';
import { Badge } from '@documenso/ui/primitives/badge';
import { Button } from '@documenso/ui/primitives/button';
import { Calendar } from '@documenso/ui/primitives/calendar';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@documenso/ui/primitives/card';
import { Input } from '@documenso/ui/primitives/input';
import { Label } from '@documenso/ui/primitives/label';
import { Popover, PopoverContent, PopoverTrigger } from '@documenso/ui/primitives/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@documenso/ui/primitives/select';
import { useToast } from '@documenso/ui/primitives/use-toast';
import { ArrowLeft, CalendarIcon, Download, ExternalLink, Loader2, Package, RefreshCw, Upload } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useFetcher, useParams } from 'react-router';

import type { Route } from './+types/applications.$id';

export function meta() {
  return [{ title: 'Rental Application' }];
}

/**
 * Admin-only uploads (credit report / proof of deposit) post here as multipart.
 * Authorised by the Documenso session AND team membership; the lib call is
 * team-scoped on top of that.
 */
export async function action({ request, params }: Route.ActionArgs) {
  const { teamUrl, id } = params;

  if (!teamUrl || !id) {
    throw new Response('Not Found', { status: 404 });
  }

  const { user } = await getOptionalSession(request);

  if (!user) {
    return { error: 'Your session expired. Please refresh.' };
  }

  const team = await getTeamByUrl({ userId: user.id, teamUrl }).catch(() => null);

  if (!team) {
    return { error: 'Not found.' };
  }

  const formData = await request.formData();
  const intent = formData.get('intent');

  if (intent === 'admin-upload') {
    const participantId = String(formData.get('participantId') ?? '');
    const type = String(formData.get('type') ?? '');
    const file = formData.get('file');

    if (type !== 'CREDIT_REPORT' && type !== 'PROOF_OF_DEPOSIT') {
      return { error: 'Unsupported document type.' };
    }

    if (!(file instanceof File)) {
      return { error: 'No file selected.' };
    }

    const result = await uploadAdminChecklistFile({
      teamId: team.id,
      applicationId: id,
      participantId,
      type,
      file,
    });

    return result.ok ? { ok: true } : { error: result.error };
  }

  return { error: 'Unknown action.' };
}

type ChecklistStatus = 'PENDING' | 'UPLOADED' | 'APPROVED' | 'REJECTED';
type ChecklistType = 'ID' | 'INCOME' | 'CREDIT_REPORT' | 'PROOF_OF_DEPOSIT' | 'OTHER';
type AdminDocType = 'CREDIT_REPORT' | 'PROOF_OF_DEPOSIT';

// Sentinel for the Select "no template" choice (Radix forbids an empty value).
const NO_TEMPLATE = 'none';

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

type AdminDoc = {
  // Server returns the full checklist-type union; only the admin-only ones appear here.
  type: ChecklistType;
  checklistItemId: string | null;
  hasFile: boolean;
};

type SigningForm = {
  title: string;
  signed: boolean;
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
  adminDocs: AdminDoc[];
  forms: SigningForm[];
  packetGeneratedAt: Date | string | null;
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
          {progress.completed}/{progress.total} complete
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

      {participant.forms.length > 0 && (
        <div className="mt-2 space-y-1 border-muted border-t pt-2">
          {participant.forms.map((form, index) => (
            <div key={`${form.title}-${index}`} className="flex items-center justify-between gap-2 text-sm">
              <span className="text-muted-foreground">{form.title}</span>
              <Badge variant={form.signed ? 'default' : 'secondary'}>
                {form.signed ? 'Signed' : 'Awaiting signature'}
              </Badge>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AdminUploadRow({
  participantId,
  type,
  doc,
  teamUrl,
  applicationId,
  onChanged,
}: {
  participantId: string;
  type: AdminDocType;
  doc: AdminDoc | undefined;
  teamUrl: string;
  applicationId: string;
  onChanged: () => void;
}) {
  const { toast } = useToast();
  const fetcher = useFetcher<{ ok?: boolean; error?: string }>();
  const fileRef = useRef<HTMLInputElement>(null);
  const handled = useRef<unknown>(null);

  const isPending = fetcher.state !== 'idle';
  const label = TYPE_LABELS[type];

  useEffect(() => {
    if (fetcher.state === 'idle' && fetcher.data && fetcher.data !== handled.current) {
      handled.current = fetcher.data;

      if (fetcher.data.ok) {
        onChanged();
        toast({ title: `${label} uploaded` });
      } else if (fetcher.data.error) {
        toast({ title: 'Upload failed', description: fetcher.data.error, variant: 'destructive' });
      }
    }
  }, [fetcher.state, fetcher.data, label, onChanged, toast]);

  const onFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (file) {
      const formData = new FormData();
      formData.set('intent', 'admin-upload');
      formData.set('participantId', participantId);
      formData.set('type', type);
      formData.set('file', file);

      void fetcher.submit(formData, { method: 'post', encType: 'multipart/form-data' });
    }

    event.target.value = '';
  };

  return (
    <div className="flex items-center justify-between gap-2 text-sm">
      <span>{label}</span>
      <div className="flex items-center gap-2">
        {doc?.hasFile && doc.checklistItemId && (
          <>
            <a
              href={`/t/${teamUrl}/applications/${applicationId}/files/${doc.checklistItemId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-muted-foreground text-xs hover:text-foreground"
            >
              <ExternalLink className="size-3" />
              View
            </a>
            <Badge variant="secondary">Uploaded</Badge>
          </>
        )}
        <input
          ref={fileRef}
          type="file"
          className="hidden"
          accept=".jpg,.jpeg,.png,.webp,.pdf,image/*"
          onChange={onFile}
        />
        <Button type="button" variant="outline" size="sm" disabled={isPending} onClick={() => fileRef.current?.click()}>
          {isPending ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
          {doc?.hasFile ? 'Replace' : 'Upload'}
        </Button>
      </div>
    </div>
  );
}

function formatGeneratedAt(value: Date | string | null) {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);

  return Number.isNaN(date.getTime()) ? null : date.toLocaleString();
}

function PacketControl({
  applicationId,
  applicant,
  teamUrl,
  onChanged,
}: {
  applicationId: string;
  applicant: Participant;
  teamUrl: string;
  onChanged: () => void;
}) {
  const { toast } = useToast();
  const { mutateAsync: generatePacket, isPending } = trpc.application.generateApplicantPacket.useMutation();
  const [skipped, setSkipped] = useState<string[]>([]);

  const generatedAt = formatGeneratedAt(applicant.packetGeneratedAt);

  const onGenerate = async () => {
    try {
      const result = await generatePacket({ applicationId, participantId: applicant.id });

      setSkipped(result.skipped);
      onChanged();

      toast({
        title: result.generatedAt ? 'Packet generated' : 'Nothing to package yet',
        description: result.generatedAt
          ? result.skipped.length > 0
            ? `${result.skipped.length} item(s) were skipped — see below.`
            : 'All available documents were merged.'
          : 'No signed forms or uploaded documents yet.',
        variant: result.generatedAt ? undefined : 'destructive',
      });
    } catch {
      toast({ title: 'Could not generate packet', description: 'Please try again.', variant: 'destructive' });
    }
  };

  return (
    <div className="mt-3 space-y-2 border-t pt-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onGenerate} loading={isPending}>
          <Package className="size-4" />
          {generatedAt ? 'Regenerate packet' : 'Generate packet'}
        </Button>

        {generatedAt && (
          <a
            href={`/t/${teamUrl}/applications/${applicationId}/packets/${applicant.id}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button type="button" size="sm">
              <Download className="size-4" />
              Download packet
            </Button>
          </a>
        )}

        {generatedAt && <span className="text-muted-foreground text-xs">Generated {generatedAt}</span>}
      </div>

      {skipped.length > 0 && (
        <div className="rounded-md border border-yellow-300 bg-yellow-50 p-2 text-xs text-yellow-800 dark:border-yellow-700 dark:bg-yellow-950/30 dark:text-yellow-400">
          <p className="font-medium">
            {skipped.length} item{skipped.length > 1 ? 's' : ''} skipped:
          </p>
          <ul className="mt-1 list-inside list-disc">
            {skipped.map((entry) => (
              <li key={entry}>{entry}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default function ApplicationDetailPage() {
  const params = useParams();
  const teamUrl = params.teamUrl ?? '';
  const id = params.id ?? '';

  const { data, isLoading, refetch } = trpc.application.getApplication.useQuery({ id });

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
        <ApplicationDetail data={data} teamUrl={teamUrl} origin={origin} onChanged={() => void refetch()} />
      )}
    </div>
  );
}

type TemplateOption = { envelopeId: string; title: string };

function SigningSetup({
  applicationId,
  applicantTemplateId,
  cosignerTemplateId,
  onChanged,
}: {
  applicationId: string;
  applicantTemplateId: string | null;
  cosignerTemplateId: string | null;
  onChanged: () => void;
}) {
  const { toast } = useToast();

  const { data: templatesResult, isLoading } = trpc.template.findTemplates.useQuery({ perPage: 100 });
  const templates: TemplateOption[] = (templatesResult?.data ?? []).map((template) => ({
    envelopeId: template.envelopeId,
    title: template.title,
  }));

  const [applicant, setApplicant] = useState(applicantTemplateId ?? NO_TEMPLATE);
  const [cosigner, setCosigner] = useState(cosignerTemplateId ?? NO_TEMPLATE);

  const { mutateAsync: setTemplates, isPending: isSaving } = trpc.application.setApplicationTemplates.useMutation();
  const { mutateAsync: syncForms, isPending: isSyncing } = trpc.application.syncApplicationForms.useMutation();

  const onSave = async () => {
    try {
      await setTemplates({
        applicationId,
        applicantTemplateId: applicant === NO_TEMPLATE ? null : applicant,
        cosignerTemplateId: cosigner === NO_TEMPLATE ? null : cosigner,
      });

      onChanged();
      toast({ title: 'Templates saved', description: 'New joiners get these forms automatically.' });
    } catch (error) {
      toast({
        title: 'Could not save templates',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      });
    }
  };

  const onSync = async () => {
    try {
      const result = await syncForms({ applicationId });

      onChanged();
      toast({
        title: 'Forms synced',
        description:
          result.provisioned > 0
            ? `Created ${result.provisioned} signing form${result.provisioned === 1 ? '' : 's'}.`
            : 'Everyone already has their forms.',
      });
    } catch {
      toast({ title: 'Could not sync forms', description: 'Please try again.', variant: 'destructive' });
    }
  };

  const renderSelect = (value: string, onValueChange: (value: string) => void) => (
    <Select value={value} onValueChange={onValueChange} disabled={isLoading}>
      <SelectTrigger>
        <SelectValue placeholder={isLoading ? 'Loading templates…' : 'No form'} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NO_TEMPLATE}>No form</SelectItem>
        {templates.map((template) => (
          <SelectItem key={template.envelopeId} value={template.envelopeId}>
            {template.title}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="text-base">Signing forms</CardTitle>
        <CardDescription>
          Attach a Documenso template (one signer — the tenant) per role. When someone joins, their form is created and
          ready to sign in their portal — no email is sent. Use “Sync forms” to generate forms for people who joined
          before a template was attached.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Applicant form</Label>
            {renderSelect(applicant, setApplicant)}
          </div>
          <div className="space-y-2">
            <Label>Co-signer form</Label>
            {renderSelect(cosigner, setCosigner)}
          </div>
        </div>

        {templates.length === 0 && !isLoading && (
          <p className="text-muted-foreground text-xs">
            No templates yet. Create one in Templates first, then attach it here.
          </p>
        )}

        <div className="flex items-center gap-2">
          <Button type="button" onClick={onSave} loading={isSaving}>
            Save templates
          </Button>
          <Button type="button" variant="outline" onClick={onSync} loading={isSyncing}>
            <RefreshCw className="size-4" />
            Generate / refresh forms
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

type ApplicationTerms = {
  street: string | null;
  unitNumber: string | null;
  city: string | null;
  rent: number | null;
  moveInDate: Date | string | null;
  leaseTermMonths: number | null;
  leaseStartDate: Date | string | null;
  leaseEndDate: Date | string | null;
  petsAllowed: boolean | null;
  lastMonthRent: number | null;
  securityDeposit: number | null;
  brokerFee: number | null;
  lockChangeFee: number | null;
  applicationFee: number | null;
  todaysDeposit: number | null;
  balanceDue: number | null;
};

const toDate = (value: Date | string | null) => (value ? new Date(value) : undefined);

function DatePickerField({
  value,
  onChange,
}: {
  value: Date | undefined;
  onChange: (value: Date | undefined) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={cn('w-full justify-start text-left font-normal', !value && 'text-muted-foreground')}
        >
          <CalendarIcon className="mr-2 size-4" />
          {value
            ? value.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
            : 'Pick a date'}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar mode="single" selected={value} onSelect={onChange} />
      </PopoverContent>
    </Popover>
  );
}

function MoneyField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="number"
        min="0"
        step="0.01"
        inputMode="decimal"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="0.00"
      />
    </div>
  );
}

function DealTermsCard({
  application,
  onChanged,
}: {
  application: ApplicationTerms & { id: string };
  onChanged: () => void;
}) {
  const { toast } = useToast();
  const { mutateAsync: saveTerms, isPending } = trpc.application.updateApplicationTerms.useMutation();

  const [street, setStreet] = useState(application.street ?? '');
  const [unitNumber, setUnitNumber] = useState(application.unitNumber ?? '');
  const [city, setCity] = useState(application.city ?? '');
  const [rent, setRent] = useState(application.rent?.toString() ?? '');
  const [leaseTermMonths, setLeaseTermMonths] = useState(application.leaseTermMonths?.toString() ?? '');
  const [moveInDate, setMoveInDate] = useState<Date | undefined>(toDate(application.moveInDate));
  const [leaseStartDate, setLeaseStartDate] = useState<Date | undefined>(toDate(application.leaseStartDate));
  const [leaseEndDate, setLeaseEndDate] = useState<Date | undefined>(toDate(application.leaseEndDate));
  const [pets, setPets] = useState(application.petsAllowed === null ? 'unset' : application.petsAllowed ? 'yes' : 'no');
  const [lastMonthRent, setLastMonthRent] = useState(application.lastMonthRent?.toString() ?? '');
  const [securityDeposit, setSecurityDeposit] = useState(application.securityDeposit?.toString() ?? '');
  const [brokerFee, setBrokerFee] = useState(application.brokerFee?.toString() ?? '');
  const [lockChangeFee, setLockChangeFee] = useState(application.lockChangeFee?.toString() ?? '');
  const [applicationFee, setApplicationFee] = useState(application.applicationFee?.toString() ?? '');
  const [todaysDeposit, setTodaysDeposit] = useState(application.todaysDeposit?.toString() ?? '');
  const [balanceDue, setBalanceDue] = useState(application.balanceDue?.toString() ?? '');

  const onSave = async () => {
    const money = (value: string) => {
      if (value.trim() === '') {
        return null;
      }
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    };
    const isoDate = (value: Date | undefined) => (value ? value.toISOString() : null);
    const term = leaseTermMonths.trim() === '' ? null : Math.trunc(Number(leaseTermMonths));

    try {
      await saveTerms({
        applicationId: application.id,
        street: street.trim() || null,
        unitNumber: unitNumber.trim() || null,
        city: city.trim() || null,
        rent: money(rent),
        moveInDate: isoDate(moveInDate),
        leaseTermMonths: term !== null && Number.isFinite(term) ? term : null,
        leaseStartDate: isoDate(leaseStartDate),
        leaseEndDate: isoDate(leaseEndDate),
        petsAllowed: pets === 'unset' ? null : pets === 'yes',
        lastMonthRent: money(lastMonthRent),
        securityDeposit: money(securityDeposit),
        brokerFee: money(brokerFee),
        lockChangeFee: money(lockChangeFee),
        applicationFee: money(applicationFee),
        todaysDeposit: money(todaysDeposit),
        balanceDue: money(balanceDue),
      });

      onChanged();
      toast({
        title: 'Deal terms saved',
        description: 'Use "Generate / refresh forms" to push them into unsigned forms.',
      });
    } catch {
      toast({ title: 'Could not save terms', description: 'Please try again.', variant: 'destructive' });
    }
  };

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="text-base">Deal terms</CardTitle>
        <CardDescription>
          Fill these once; they prefill (read-only) into every tenant's signing form by matching field labels. Co-tenant
          names and the tenant count fill automatically from who joins.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="terms-street">Street address</Label>
          <Input
            id="terms-street"
            value={street}
            onChange={(e) => setStreet(e.target.value)}
            placeholder="123 Main St"
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="terms-unit">Unit #</Label>
            <Input id="terms-unit" value={unitNumber} onChange={(e) => setUnitNumber(e.target.value)} placeholder="2" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="terms-city">City</Label>
            <Input id="terms-city" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Boston" />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <MoneyField id="terms-rent" label="Monthly rent" value={rent} onChange={setRent} />
          <div className="space-y-2">
            <Label htmlFor="terms-term">Lease term (months)</Label>
            <Input
              id="terms-term"
              type="number"
              min="0"
              value={leaseTermMonths}
              onChange={(e) => setLeaseTermMonths(e.target.value)}
              placeholder="12"
            />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-2">
            <Label>Move-in date</Label>
            <DatePickerField value={moveInDate} onChange={setMoveInDate} />
          </div>
          <div className="space-y-2">
            <Label>Lease start</Label>
            <DatePickerField value={leaseStartDate} onChange={setLeaseStartDate} />
          </div>
          <div className="space-y-2">
            <Label>Lease end</Label>
            <DatePickerField value={leaseEndDate} onChange={setLeaseEndDate} />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Pets</Label>
          <Select value={pets} onValueChange={setPets}>
            <SelectTrigger className="sm:w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="unset">Not set</SelectItem>
              <SelectItem value="yes">Yes</SelectItem>
              <SelectItem value="no">No</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <MoneyField
            id="terms-lastmonth"
            label="Last month's rent"
            value={lastMonthRent}
            onChange={setLastMonthRent}
          />
          <MoneyField
            id="terms-security"
            label="Security deposit"
            value={securityDeposit}
            onChange={setSecurityDeposit}
          />
          <MoneyField id="terms-broker" label="Broker fee" value={brokerFee} onChange={setBrokerFee} />
          <MoneyField id="terms-lock" label="Lock-change fee" value={lockChangeFee} onChange={setLockChangeFee} />
          <MoneyField id="terms-appfee" label="Application fee" value={applicationFee} onChange={setApplicationFee} />
          <MoneyField id="terms-today" label="Today's deposit" value={todaysDeposit} onChange={setTodaysDeposit} />
          <MoneyField id="terms-balance" label="Balance due" value={balanceDue} onChange={setBalanceDue} />
        </div>

        <Button type="button" onClick={onSave} loading={isPending}>
          Save deal terms
        </Button>
      </CardContent>
    </Card>
  );
}

function ApplicationDetail({
  data,
  teamUrl,
  origin,
  onChanged,
}: {
  data: {
    application: ApplicationTerms & {
      id: string;
      slug: string;
      title: string | null;
      unitAddress: string | null;
      status: string;
      applicantTemplateId: string | null;
      cosignerTemplateId: string | null;
    };
    participants: Participant[];
  };
  teamUrl: string;
  origin: string;
  onChanged: () => void;
}) {
  const { application, participants } = data;

  const applicants = participants.filter((p) => p.role === 'APPLICANT');
  const cosignersFor = (applicantId: string) =>
    participants.filter((p) => p.role === 'COSIGNER' && p.linkedToId === applicantId);
  const orphanCosigners = participants.filter((p) => p.role === 'COSIGNER' && !p.linkedToId);

  const adminDocFor = (participant: Participant, type: AdminDocType) =>
    participant.adminDocs.find((entry) => entry.type === type);

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

      <DealTermsCard application={application} onChanged={onChanged} />

      <SigningSetup
        applicationId={application.id}
        applicantTemplateId={application.applicantTemplateId}
        cosignerTemplateId={application.cosignerTemplateId}
        onChanged={onChanged}
      />

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

                {/* Admin-only review docs (credit report / proof of deposit). */}
                <div className="mt-3 space-y-1 border-t pt-3">
                  <p className="font-medium text-muted-foreground text-xs">Admin uploads</p>
                  <AdminUploadRow
                    participantId={applicant.id}
                    type="CREDIT_REPORT"
                    doc={adminDocFor(applicant, 'CREDIT_REPORT')}
                    teamUrl={teamUrl}
                    applicationId={application.id}
                    onChanged={onChanged}
                  />
                  <AdminUploadRow
                    participantId={applicant.id}
                    type="PROOF_OF_DEPOSIT"
                    doc={adminDocFor(applicant, 'PROOF_OF_DEPOSIT')}
                    teamUrl={teamUrl}
                    applicationId={application.id}
                    onChanged={onChanged}
                  />
                </div>

                <PacketControl
                  applicationId={application.id}
                  applicant={applicant}
                  teamUrl={teamUrl}
                  onChanged={onChanged}
                />
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
