'use client';

import { CheckCircle2, Clock, CreditCard, DollarSign, FileText, Loader2, Upload, XCircle } from 'lucide-react';
import { useRef, useState, useTransition } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { prepareFileForUpload } from '@/lib/file-utils';
import type { Database } from '@/lib/supabase/types';
import { uploadChecklistFile } from '@/lib/upload-actions';

type ChecklistItem = Database['public']['Tables']['checklist_items']['Row'];

const CHECKLIST_LABELS: Record<string, string> = {
  id: 'Photo ID',
  income: 'Proof of Income',
  credit_report: 'Credit Report',
  proof_of_deposit: 'Proof of Deposit',
  other: 'Other Document',
};

const CHECKLIST_ICONS: Record<string, typeof FileText> = {
  id: CreditCard,
  income: DollarSign,
  credit_report: FileText,
  proof_of_deposit: DollarSign,
  other: FileText,
};

const STATUS_DISPLAY: Record<
  string,
  {
    label: string;
    variant: 'default' | 'secondary' | 'outline' | 'destructive';
    icon: typeof Clock;
  }
> = {
  pending: { label: 'Pending', variant: 'outline', icon: Clock },
  uploaded: { label: 'Uploaded', variant: 'secondary', icon: Upload },
  signed: { label: 'Signed', variant: 'default', icon: CheckCircle2 },
  rejected: { label: 'Rejected', variant: 'destructive', icon: XCircle },
  approved: { label: 'Approved', variant: 'default', icon: CheckCircle2 },
};

export function ChecklistCard({ item, participantId }: { item: ChecklistItem; participantId: string }) {
  const Icon = CHECKLIST_ICONS[item.item_type] ?? FileText;
  const status = STATUS_DISPLAY[item.status] ?? STATUS_DISPLAY.pending;
  const StatusIcon = status.icon;

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isPending, startTransition] = useTransition();
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [converting, setConverting] = useState(false);

  const canUpload = item.status === 'pending' || item.status === 'rejected';

  function handleFile(rawFile: File) {
    setError(null);

    startTransition(async () => {
      try {
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
        formData.set('file', prepared.file);

        const result = await uploadChecklistFile(participantId, item.id, formData);
        if (result.error) {
          setError(result.error);
        }
      } catch (e) {
        console.error('[ChecklistCard] Upload failed:', e);
        setConverting(false);
        setError('Something went wrong. Please try again.');
      }
    });
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) {
      handleFile(file);
    }
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      handleFile(file);
    }
    e.target.value = '';
  }

  return (
    <Card
      className={dragOver ? 'ring-2 ring-primary' : ''}
      onDragOver={(e) => {
        if (!canUpload) {
          return;
        }
        e.preventDefault();
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
              <p className="font-medium text-sm">{item.label || CHECKLIST_LABELS[item.item_type] || item.item_type}</p>
              {item.notes && <p className="text-destructive text-xs">{item.notes}</p>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <StatusIcon className="size-4" />
            <Badge variant={status.variant}>{status.label}</Badge>
          </div>
        </div>

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
                  {item.status === 'rejected' ? 'Re-upload' : 'Upload'}
                </>
              )}
            </Button>
            {item.item_type === 'income' && (
              <p className="mt-2 text-muted-foreground text-xs italic">
                Examples: paystubs, offer letters, W-2s, 1099s, 1040, bank statements, investment statements, etc. Feel
                free to blur sensitive info — landlords just want to see a name and amount.
              </p>
            )}
            {item.item_type === 'id' && (
              <p className="mt-2 text-muted-foreground text-xs italic">
                A driver&apos;s license, passport, or state ID works.
              </p>
            )}
            {error && <p className="mt-1 text-destructive text-xs">{error}</p>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
