import { getOptionalSession } from '@documenso/auth/server/lib/utils/get-session';
import { uploadAdminChecklistFile } from '@documenso/lib/server-only/rental/upload-admin-checklist-file';
import { getTeamByUrl } from '@documenso/lib/server-only/team/get-team';
import { DEAL_TERM_FIELDS, type DealTermKey } from '@documenso/lib/types/rental-deal-terms';
import { trpc } from '@documenso/trpc/react';
import { cn } from '@documenso/ui/lib/utils';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@documenso/ui/primitives/alert-dialog';
import { Badge } from '@documenso/ui/primitives/badge';
import { Button } from '@documenso/ui/primitives/button';
import { Calendar } from '@documenso/ui/primitives/calendar';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@documenso/ui/primitives/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@documenso/ui/primitives/collapsible';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@documenso/ui/primitives/dialog';
import { Input } from '@documenso/ui/primitives/input';
import { Label } from '@documenso/ui/primitives/label';
import { Popover, PopoverContent, PopoverTrigger } from '@documenso/ui/primitives/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@documenso/ui/primitives/select';
import { useToast } from '@documenso/ui/primitives/use-toast';
import {
  ArrowLeft,
  CalendarIcon,
  ChevronDown,
  Download,
  ExternalLink,
  FilePlus,
  Loader2,
  Package,
  RotateCcw,
  Settings2,
  Trash2,
  Upload,
} from 'lucide-react';
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

// Sentinel for the field-map Select "leave this field for the tenant" choice.
const NO_MAPPING = 'none';

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

/**
 * Admin: attach an ADDITIONAL single-signer template for one person to sign (a lease,
 * addendum, etc.). It lands in their portal alongside the auto application form — which
 * stays the only form that's sent automatically on join.
 */
function AddDocumentButton({
  applicationId,
  participantId,
  onChanged,
}: {
  applicationId: string;
  participantId: string;
  onChanged: () => void;
}) {
  const { toast } = useToast();
  const { data: templatesResult, isLoading } = trpc.template.findTemplates.useQuery({ perPage: 100 });
  const templates: TemplateOption[] = (templatesResult?.data ?? []).map((template) => ({
    envelopeId: template.envelopeId,
    title: template.title,
  }));
  const { mutateAsync: addDocument, isPending } = trpc.application.addParticipantDocument.useMutation();

  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(NO_TEMPLATE);

  const onAdd = async () => {
    if (selected === NO_TEMPLATE) {
      return;
    }

    try {
      await addDocument({ applicationId, participantId, templateEnvelopeId: selected });
      setOpen(false);
      setSelected(NO_TEMPLATE);
      onChanged();
      toast({ title: 'Document added', description: 'It’s now in the tenant’s portal to sign.' });
    } catch (error) {
      toast({
        title: 'Could not add document',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="ghost" size="sm" className="h-8 text-muted-foreground">
          <FilePlus className="size-4" />
          Add document
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a document</DialogTitle>
          <DialogDescription>
            Send an extra form (a single-signer template) for this person to sign. It appears in their portal alongside
            the application — the application stays the only form sent automatically.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label>Template</Label>
          <Select value={selected} onValueChange={setSelected} disabled={isLoading}>
            <SelectTrigger>
              <SelectValue placeholder={isLoading ? 'Loading templates…' : 'Pick a template'} />
            </SelectTrigger>
            <SelectContent>
              {templates.map((template) => (
                <SelectItem key={template.envelopeId} value={template.envelopeId}>
                  {template.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {templates.length === 0 && !isLoading && (
            <p className="text-muted-foreground text-xs">No templates yet. Create one in Templates first.</p>
          )}
        </div>

        <DialogFooter>
          <Button type="button" onClick={onAdd} loading={isPending} disabled={selected === NO_TEMPLATE}>
            Add &amp; send
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ParticipantActions({
  participant,
  applicationId,
  onChanged,
}: {
  participant: Participant;
  applicationId: string;
  onChanged: () => void;
}) {
  const { toast } = useToast();
  const { mutateAsync: setStudent, isPending: isSettingStudent } = trpc.application.setParticipantStudent.useMutation();
  const { mutateAsync: removeParticipant, isPending: isRemoving } = trpc.application.removeParticipant.useMutation();
  const { mutateAsync: reissueForm, isPending: isReissuing } = trpc.application.reissueParticipantForm.useMutation();

  const isApplicant = participant.role === 'APPLICANT';
  const hasSignedForm = participant.forms.some((form) => form.signed);

  const onReissue = async () => {
    try {
      await reissueForm({ applicationId, participantId: participant.id });
      onChanged();
      toast({ title: 'Form re-issued', description: 'A fresh, unsigned copy is back in their portal to sign.' });
    } catch (error) {
      toast({
        title: 'Could not re-issue form',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      });
    }
  };

  const onChangeType = async (value: string) => {
    try {
      await setStudent({ applicationId, participantId: participant.id, isStudent: value === 'student' });
      onChanged();
      toast({
        title: 'Type updated',
        description:
          value === 'student'
            ? 'Marked as student — proof of income no longer required.'
            : 'Marked as standard — proof of income required.',
      });
    } catch (error) {
      toast({
        title: 'Could not update type',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      });
    }
  };

  const onRemove = async () => {
    try {
      const result = await removeParticipant({ applicationId, participantId: participant.id });
      onChanged();
      toast({
        title: 'Removed',
        description:
          result.removed > 1
            ? `Removed the applicant and ${result.removed - 1} co-signer(s).`
            : `Removed ${participant.name}.`,
      });
    } catch (error) {
      toast({
        title: 'Could not remove',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {isApplicant && (
        <Select
          value={participant.isStudent ? 'student' : 'standard'}
          onValueChange={onChangeType}
          disabled={isSettingStudent}
        >
          <SelectTrigger className="h-8 w-32 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="standard">Standard</SelectItem>
            <SelectItem value="student">Student</SelectItem>
          </SelectContent>
        </Select>
      )}

      <AddDocumentButton applicationId={applicationId} participantId={participant.id} onChanged={onChanged} />

      {hasSignedForm && (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 text-muted-foreground"
              disabled={isReissuing}
            >
              <RotateCcw className="size-4" />
              Re-issue form
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Re-issue {participant.name}'s form?</AlertDialogTitle>
              <AlertDialogDescription>
                This voids their current signed application form and sends a fresh, prefilled copy for them to sign
                again. Their uploaded documents and any added documents are kept. This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={onReissue}>Re-issue</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 text-destructive hover:text-destructive"
            disabled={isRemoving}
          >
            <Trash2 className="size-4" />
            Remove
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {participant.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              {isApplicant
                ? 'This removes the applicant and every co-signer linked to them — including their signing forms and uploaded documents. This cannot be undone.'
                : 'This removes this co-signer, including their signing form and uploaded documents. This cannot be undone.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={onRemove}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ParticipantBlock({
  participant,
  teamUrl,
  applicationId,
  onChanged,
  nested,
}: {
  participant: Participant;
  teamUrl: string;
  applicationId: string;
  onChanged: () => void;
  nested?: boolean;
}) {
  const { progress } = participant;
  const complete = progress.total > 0 && progress.completed === progress.total;

  return (
    <div className={nested ? 'mt-3 border-muted border-l-2 pl-4' : ''}>
      <div className="flex items-start justify-between gap-2">
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
        <div className="flex flex-col items-end gap-2">
          <Badge variant={complete ? 'default' : 'neutral'}>
            {progress.completed}/{progress.total} complete
          </Badge>
          <ParticipantActions participant={participant} applicationId={applicationId} onChanged={onChanged} />
        </div>
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

/**
 * Per-template field → deal-term mapping editor. The broker's template fields are
 * personal shorthand (e.g. `FMR`, `BF`, `Key`) that label auto-match can't resolve,
 * so this is how prefill is told which field holds which deal term. Shown once per
 * attached (saved) template; saving persists the mapping and pushes it into this
 * application's unsigned forms.
 */
function TemplateFieldMap({
  applicationId,
  templateEnvelopeId,
  roleLabel,
}: {
  applicationId: string;
  templateEnvelopeId: string;
  roleLabel: string;
}) {
  const { toast } = useToast();
  const { data, isLoading, refetch } = trpc.application.getTemplateFieldMap.useQuery({ templateEnvelopeId });
  const { mutateAsync: saveMap, isPending: isSaving } = trpc.application.setTemplateFieldMap.useMutation();
  const { mutateAsync: syncForms, isPending: isSyncing } = trpc.application.syncApplicationForms.useMutation();

  const [selections, setSelections] = useState<Record<number, string>>({});

  // Hydrate (and re-sync after save) the local selects from the persisted mapping.
  useEffect(() => {
    if (data) {
      setSelections(Object.fromEntries(data.fields.map((field) => [field.fieldId, field.termKey ?? NO_MAPPING])));
    }
  }, [data]);

  const onSave = async () => {
    if (!data) {
      return;
    }

    try {
      await saveMap({
        templateEnvelopeId,
        mappings: data.fields.map((field) => {
          const value = selections[field.fieldId] ?? NO_MAPPING;

          return { fieldId: field.fieldId, termKey: value === NO_MAPPING ? null : (value as DealTermKey) };
        }),
      });

      await refetch();
      // Saving applies: push the mapping into this application's unsigned forms.
      await syncForms({ applicationId });
      toast({ title: 'Field mapping saved', description: 'Pushed into this application’s unsigned forms.' });
    } catch (error) {
      toast({
        title: 'Could not save mapping',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="space-y-3 rounded-md border p-3">
      <div>
        <p className="font-medium text-sm">Field mapping · {roleLabel}</p>
        <p className="text-muted-foreground text-xs">
          {data?.title ? `“${data.title}”. ` : ''}
          Point each template field at a deal term. Unmapped fields are left blank for the tenant to fill.
        </p>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground text-sm">Loading fields…</p>
      ) : !data || data.fields.length === 0 ? (
        <p className="text-muted-foreground text-sm">This template has no text fields to map.</p>
      ) : (
        <>
          <div className="space-y-2">
            {data.fields.map((field, index) => (
              <div key={field.fieldId} className="grid grid-cols-1 items-center gap-2 sm:grid-cols-2">
                <div className="min-w-0">
                  <p className="truncate text-sm">{field.label ?? `Unlabelled field ${index + 1}`}</p>
                  <p className="text-muted-foreground text-xs">Page {field.page}</p>
                </div>
                <Select
                  value={selections[field.fieldId] ?? NO_MAPPING}
                  onValueChange={(value) => setSelections((prev) => ({ ...prev, [field.fieldId]: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_MAPPING}>Leave for tenant</SelectItem>
                    {DEAL_TERM_FIELDS.map((term) => (
                      <SelectItem key={term.key} value={term.key}>
                        {term.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>

          <Button type="button" size="sm" onClick={onSave} loading={isSaving || isSyncing}>
            Save field mapping
          </Button>
        </>
      )}
    </div>
  );
}

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

  const onSave = async () => {
    try {
      await setTemplates({
        applicationId,
        applicantTemplateId: applicant === NO_TEMPLATE ? null : applicant,
        cosignerTemplateId: cosigner === NO_TEMPLATE ? null : cosigner,
      });

      onChanged();
      // Saving applies on the server: everyone's unsigned forms are (re)generated.
      toast({ title: 'Saved', description: 'Templates saved and everyone’s forms updated.' });
    } catch (error) {
      toast({
        title: 'Could not save templates',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      });
    }
  };

  // Field mapping is driven by the *saved* templates (props), so attach + save a
  // template first, then its fields appear below to map. Dedupe so a template used
  // for both roles is only mapped once.
  const attachedTemplates = (() => {
    const byEnvelope = new Map<string, string[]>();

    for (const [label, envelopeId] of [
      ['Applicant form', applicantTemplateId],
      ['Co-signer form', cosignerTemplateId],
    ] as const) {
      if (envelopeId) {
        byEnvelope.set(envelopeId, [...(byEnvelope.get(envelopeId) ?? []), label]);
      }
    }

    return [...byEnvelope.entries()].map(([envelopeId, labels]) => ({ envelopeId, roleLabel: labels.join(' + ') }));
  })();

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
          Attach a Documenso template (one signer — the tenant) per role. When someone joins, their form is ready to
          sign in their portal — no email is sent. Saving regenerates everyone's unsigned forms automatically (signed
          forms are left untouched).
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
            Save
          </Button>
        </div>

        {/* Field mapping is a one-time, per-template setup, so it stays tucked away
            behind a disclosure (closed by default) rather than cluttering the page. */}
        {attachedTemplates.length > 0 && (
          <Collapsible className="border-t pt-4">
            <CollapsibleTrigger asChild>
              <Button type="button" variant="ghost" size="sm" className="text-muted-foreground">
                <Settings2 className="size-4" />
                Field mapping (one-time setup)
                <ChevronDown className="size-4" />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-3 space-y-4">
              <p className="text-muted-foreground text-xs">
                Map each saved template's fields to deal terms. Their labels are the broker's own shorthand, so this is
                how prefill knows which field holds which value. You only need to do this once per template — every
                application that uses it inherits the mapping.
              </p>
              {attachedTemplates.map((entry) => (
                <TemplateFieldMap
                  key={entry.envelopeId}
                  applicationId={applicationId}
                  templateEnvelopeId={entry.envelopeId}
                  roleLabel={entry.roleLabel}
                />
              ))}
            </CollapsibleContent>
          </Collapsible>
        )}
      </CardContent>
    </Card>
  );
}

type ApplicationTerms = {
  street: string | null;
  unitNumber: string | null;
  city: string | null;
  rent: number | null;
  firstMonthRent: number | null;
  moveInDate: Date | string | null;
  leaseTermMonths: number | null;
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
  const thisYear = new Date().getFullYear();

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
        <Calendar
          mode="single"
          selected={value}
          onSelect={onChange}
          defaultMonth={value}
          captionLayout="dropdown-buttons"
          fromYear={thisYear - 1}
          toYear={thisYear + 6}
        />
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
  const [leaseEndDate, setLeaseEndDate] = useState<Date | undefined>(toDate(application.leaseEndDate));
  const [pets, setPets] = useState(application.petsAllowed === null ? 'unset' : application.petsAllowed ? 'yes' : 'no');
  const [firstMonthRent, setFirstMonthRent] = useState(application.firstMonthRent?.toString() ?? '');
  const [lastMonthRent, setLastMonthRent] = useState(application.lastMonthRent?.toString() ?? '');
  const [securityDeposit, setSecurityDeposit] = useState(application.securityDeposit?.toString() ?? '');
  const [brokerFee, setBrokerFee] = useState(application.brokerFee?.toString() ?? '');
  const [lockChangeFee, setLockChangeFee] = useState(application.lockChangeFee?.toString() ?? '');
  const [applicationFee, setApplicationFee] = useState(application.applicationFee?.toString() ?? '');
  const [todaysDeposit, setTodaysDeposit] = useState(application.todaysDeposit?.toString() ?? '');

  // Balance due is computed, not typed: (all charges) − today's deposit.
  const amount = (value: string) => {
    const parsed = Number(value);
    return value.trim() !== '' && Number.isFinite(parsed) ? parsed : 0;
  };
  const totalDue =
    amount(firstMonthRent) +
    amount(lastMonthRent) +
    amount(securityDeposit) +
    amount(brokerFee) +
    amount(lockChangeFee) +
    amount(applicationFee);
  const balanceDue = totalDue - amount(todaysDeposit);
  const usd = (value: number) =>
    value.toLocaleString('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });

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
        firstMonthRent: money(firstMonthRent),
        moveInDate: isoDate(moveInDate),
        leaseTermMonths: term !== null && Number.isFinite(term) ? term : null,
        leaseEndDate: isoDate(leaseEndDate),
        petsAllowed: pets === 'unset' ? null : pets === 'yes',
        lastMonthRent: money(lastMonthRent),
        securityDeposit: money(securityDeposit),
        brokerFee: money(brokerFee),
        lockChangeFee: money(lockChangeFee),
        applicationFee: money(applicationFee),
        todaysDeposit: money(todaysDeposit),
        balanceDue,
      });

      onChanged();
      toast({
        title: 'Deal terms saved',
        description: 'Pushed into everyone’s unsigned forms automatically.',
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

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Move-in date</Label>
            <DatePickerField value={moveInDate} onChange={setMoveInDate} />
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
            id="terms-firstmonth"
            label="First month's rent"
            value={firstMonthRent}
            onChange={setFirstMonthRent}
          />
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
        </div>

        {/* Balance due is computed: all charges above − today's deposit. */}
        <div className="space-y-1 rounded-md border bg-muted/30 p-3 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Total amount due</span>
            <span className="font-medium">{usd(totalDue)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Balance due (total − today's deposit)</span>
            <span className="font-medium">{usd(balanceDue)}</span>
          </div>
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
                <ParticipantBlock
                  participant={applicant}
                  teamUrl={teamUrl}
                  applicationId={application.id}
                  onChanged={onChanged}
                />
                {cosignersFor(applicant.id).map((cosigner) => (
                  <ParticipantBlock
                    key={cosigner.id}
                    participant={cosigner}
                    teamUrl={teamUrl}
                    applicationId={application.id}
                    onChanged={onChanged}
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
                    onChanged={onChanged}
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
