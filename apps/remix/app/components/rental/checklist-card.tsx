import { Badge } from '@documenso/ui/primitives/badge';
import { Button } from '@documenso/ui/primitives/button';
import { Card, CardContent } from '@documenso/ui/primitives/card';
import {
  CheckCircle2,
  Clock,
  CreditCard,
  DollarSign,
  ExternalLink,
  FileText,
  Loader2,
  Upload,
  XCircle,
} from 'lucide-react';
import { useRef, useState } from 'react';
import { useFetcher } from 'react-router';

import { prepareFileForUpload } from './file-utils';

export type ChecklistCardItem = {
  id: string;
  type: 'ID' | 'INCOME' | 'CREDIT_REPORT' | 'PROOF_OF_DEPOSIT' | 'OTHER';
  label: string | null;
  status: 'PENDING' | 'UPLOADED' | 'APPROVED' | 'REJECTED';
  hasFile: boolean;
};

const CHECKLIST_LABELS: Record<ChecklistCardItem['type'], string> = {
  ID: 'Photo ID',
  INCOME: 'Proof of Income',
  CREDIT_REPORT: 'Credit Report',
  PROOF_OF_DEPOSIT: 'Proof of Deposit',
  OTHER: 'Other Document',
};

const CHECKLIST_ICONS: Record<ChecklistCardItem['type'], typeof FileText> = {
  ID: CreditCard,
  INCOME: DollarSign,
  CREDIT_REPORT: FileText,
  PROOF_OF_DEPOSIT: DollarSign,
  OTHER: FileText,
};

const STATUS_DISPLAY: Record<
  ChecklistCardItem['status'],
  { label: string; variant: 'default' | 'secondary' | 'neutral' | 'destructive'; icon: typeof Clock }
> = {
  PENDING: { label: 'Pending', variant: 'neutral', icon: Clock },
  UPLOADED: { label: 'Uploaded', variant: 'secondary', icon: Upload },
  APPROVED: { label: 'Approved', variant: 'default', icon: CheckCircle2 },
  REJECTED: { label: 'Rejected', variant: 'destructive', icon: XCircle },
};

export function ChecklistCard({ item, slug }: { item: ChecklistCardItem; slug: string }) {
  const Icon = CHECKLIST_ICONS[item.type] ?? FileText;
  const status = STATUS_DISPLAY[item.status] ?? STATUS_DISPLAY.PENDING;
  const StatusIcon = status.icon;

  const fetcher = useFetcher<{ error?: string }>();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [converting, setConverting] = useState(false);

  const canUpload = item.status === 'PENDING' || item.status === 'REJECTED';
  const isPending = converting || fetcher.state !== 'idle';
  const actionError = error ?? fetcher.data?.error ?? null;

  const handleFile = async (rawFile: File) => {
    setError(null);

    const prepared = await prepareFileForUpload(
      rawFile,
      () => setConverting(true),
      () => setConverting(false),
    );

    if (prepared.error || !prepared.file) {
      setError(prepared.error ?? 'Failed to process file.');
      return;
    }

    const formData = new FormData();
    formData.set('intent', 'upload');
    formData.set('checklistItemId', item.id);
    formData.set('file', prepared.file);

    await fetcher.submit(formData, { method: 'post', encType: 'multipart/form-data' });
  };

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    setDragOver(false);
    const file = event.dataTransfer.files[0];

    if (file) {
      void handleFile(file);
    }
  };

  const handleFileInput = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (file) {
      void handleFile(file);
    }

    event.target.value = '';
  };

  return (
    <Card
      className={dragOver ? 'ring-2 ring-primary' : ''}
      onDragOver={(event) => {
        if (!canUpload) {
          return;
        }
        event.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={canUpload ? handleDrop : undefined}
    >
      <CardContent className="py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-muted">
              <Icon className="size-5 text-muted-foreground" />
            </div>
            <div>
              <p className="font-medium text-sm">{item.label || CHECKLIST_LABELS[item.type] || item.type}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <StatusIcon className="size-4" />
            <Badge variant={status.variant}>{status.label}</Badge>
          </div>
        </div>

        {item.hasFile && (
          <a
            href={`/a/${slug}/files/${item.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex items-center gap-1 text-muted-foreground text-xs hover:text-foreground"
          >
            <ExternalLink className="size-3" />
            View uploaded file
          </a>
        )}

        {canUpload && (
          <div className="mt-3">
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept=".jpg,.jpeg,.png,.webp,.heic,.heif,.pdf,image/*"
              onChange={handleFileInput}
            />
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              disabled={isPending}
              onClick={() => fileInputRef.current?.click()}
            >
              {isPending ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  {converting ? 'Converting photo...' : 'Uploading...'}
                </>
              ) : (
                <>
                  <Upload className="size-4" />
                  {item.status === 'REJECTED' ? 'Re-upload' : 'Upload'}
                </>
              )}
            </Button>
            {item.type === 'INCOME' && (
              <p className="mt-2 text-muted-foreground text-xs italic">
                Examples: paystubs, offer letters, W-2s, 1099s, 1040, bank statements, investment statements, etc. Feel
                free to blur sensitive info &mdash; landlords just want to see a name and amount.
              </p>
            )}
            {item.type === 'ID' && (
              <p className="mt-2 text-muted-foreground text-xs italic">
                A driver&apos;s license, passport, or state ID works.
              </p>
            )}
            {actionError && <p className="mt-1 text-destructive text-xs">{actionError}</p>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
