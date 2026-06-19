'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { PageSizes, PDFDocument } from 'pdf-lib';
import { createClient, createServiceClient } from '@/lib/supabase/server';

async function requireAuth() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }
  return user;
}

export async function markParticipantSubmitted(dealId: string, participantId: string) {
  await requireAuth();
  const sc = await createServiceClient();

  await sc
    .from('participants')
    .update({ status: 'reviewed' } as never)
    .eq('id', participantId);

  revalidatePath(`/app/deals/${dealId}/review`);
}

export async function uploadAdminDoc(
  dealId: string,
  participantId: string,
  itemType: 'credit_report' | 'proof_of_deposit',
  formData: FormData,
) {
  const file = formData.get('file') as File;
  if (!file || file.size === 0) {
    return { error: 'No file provided.' };
  }

  await requireAuth();
  const sc = await createServiceClient();

  // Get workspace_id
  const { data: dealData } = await sc.from('deals').select('workspace_id').eq('id', dealId).single();

  const deal = dealData as { workspace_id: string } | null;
  if (!deal) {
    return { error: 'Deal not found.' };
  }

  const ext = file.name.split('.').pop() ?? 'pdf';
  const storagePath = `${deal.workspace_id}/${dealId}/${participantId}/${itemType}.${ext}`;

  const { error: uploadError } = await sc.storage.from('staging').upload(storagePath, file, { upsert: true });

  if (uploadError) {
    return { error: `Upload failed: ${uploadError.message}` };
  }

  // Upsert checklist item
  const { data: existingData } = await sc
    .from('checklist_items')
    .select('id')
    .eq('participant_id', participantId)
    .eq('item_type', itemType)
    .single();

  const existing = existingData as { id: string } | null;

  if (existing) {
    await sc
      .from('checklist_items')
      .update({
        status: 'uploaded',
        staging_file_url: storagePath,
      } as never)
      .eq('id', existing.id);
  } else {
    await sc.from('checklist_items').insert({
      participant_id: participantId,
      item_type: itemType,
      status: 'uploaded',
      staging_file_url: storagePath,
    } as never);
  }

  revalidatePath(`/app/deals/${dealId}/review`);
  return { success: true };
}

export async function generatePackages(dealId: string) {
  await requireAuth();
  const sc = await createServiceClient();

  // Get deal + workspace
  const { data: dealData } = await sc.from('deals').select('workspace_id').eq('id', dealId).single();

  const deal = dealData as { workspace_id: string } | null;
  if (!deal) {
    throw new Error('Deal not found');
  }

  // Get all participants with checklist + person info
  const { data: participantsData } = await sc
    .from('participants')
    .select('*, people(name), checklist_items(*)')
    .eq('deal_id', dealId)
    .order('created_at', { ascending: true });

  type ParticipantRow = {
    id: string;
    role: 'applicant' | 'cosigner';
    linked_to_participant_id: string | null;
    is_student: boolean;
    people: { name: string };
    checklist_items: Array<{
      item_type: string;
      staging_file_url: string | null;
      status: string;
    }>;
  };

  const participants = (participantsData ?? []) as ParticipantRow[];

  // Get signed template instances
  const { data: instancesData } = await sc
    .from('template_instances')
    .select('participant_id, pdf_file_url, templates(name)')
    .eq('deal_id', dealId)
    .eq('status', 'completed');

  type SignedInstance = {
    participant_id: string | null;
    pdf_file_url: string | null;
    templates: { name: string };
  };

  const signedInstances = (instancesData ?? []) as SignedInstance[];

  const applicants = participants.filter((p) => p.role === 'applicant');
  const results: Array<{ name: string; url: string; skipped?: string[] }> = [];

  for (const applicant of applicants) {
    const pdfDoc = await PDFDocument.create();
    const skippedFiles: string[] = [];

    // Helper to fetch and merge a file (PDF or image) into the package
    async function mergeFile(pathOrUrl: string | null | undefined, label?: string) {
      if (!pathOrUrl) {
        return;
      }

      // Extract storage path if it's a full URL (legacy data)
      const path = pathOrUrl.includes('/storage/v1/')
        ? (pathOrUrl.match(/\/storage\/v1\/object\/public\/staging\/(.+)/)?.[1] ?? pathOrUrl)
        : pathOrUrl;

      const { data, error } = await sc.storage.from('staging').download(path);

      if (error || !data) {
        const reason = error?.message ?? 'file not found';
        console.warn(`[generatePackages] SKIPPED "${label ?? path}": download failed (${reason})`);
        skippedFiles.push(`${label ?? path}: ${reason}`);
        return;
      }

      const bytes = await data.arrayBuffer();
      const ext = path.split('.').pop()?.toLowerCase() ?? '';

      // Try as PDF first
      if (ext === 'pdf' || !ext) {
        try {
          const srcDoc = await PDFDocument.load(bytes);
          const pages = await pdfDoc.copyPages(srcDoc, srcDoc.getPageIndices());
          for (const page of pages) {
            pdfDoc.addPage(page);
          }
          return;
        } catch {
          // Not a valid PDF — fall through to image handling
        }
      }

      // Try as image (JPEG or PNG)
      try {
        const uint8 = new Uint8Array(bytes);
        let img;
        if (ext === 'jpg' || ext === 'jpeg' || (uint8[0] === 0xff && uint8[1] === 0xd8)) {
          img = await pdfDoc.embedJpg(uint8);
        } else if (ext === 'png' || (uint8[0] === 0x89 && uint8[1] === 0x50)) {
          img = await pdfDoc.embedPng(uint8);
        } else {
          // Unknown format — try JPEG first, then PNG
          try {
            img = await pdfDoc.embedJpg(uint8);
          } catch {
            img = await pdfDoc.embedPng(uint8);
          }
        }

        // Create a page sized to fit the image (max letter size)
        const [letterW, letterH] = PageSizes.Letter;
        const scale = Math.min(letterW / img.width, letterH / img.height, 1);
        const w = img.width * scale;
        const h = img.height * scale;
        const page = pdfDoc.addPage([letterW, letterH]);
        page.drawImage(img, {
          x: (letterW - w) / 2,
          y: (letterH - h) / 2,
          width: w,
          height: h,
        });
        return;
      } catch (imgErr) {
        const reason = imgErr instanceof Error ? imgErr.message : String(imgErr);
        console.warn(`[generatePackages] SKIPPED "${label ?? path}": unsupported format (${reason})`);
        skippedFiles.push(`${label ?? path}: unsupported format`);
      }
    }

    // 1. Signed application (template instances assigned to this applicant or shared)
    const applicantSignedDocs = signedInstances.filter(
      (si) => si.participant_id === applicant.id || si.participant_id === null,
    );
    for (const doc of applicantSignedDocs) {
      await mergeFile(doc.pdf_file_url, `Signed form: ${doc.templates.name}`);
    }

    // Helper to get checklist file
    function getChecklistFile(participant: ParticipantRow, itemType: string): string | null {
      const item = participant.checklist_items.find(
        (ci) =>
          ci.item_type === itemType &&
          ci.staging_file_url &&
          (ci.status === 'uploaded' || ci.status === 'approved' || ci.status === 'signed'),
      );
      return item?.staging_file_url ?? null;
    }

    // 2. Applicant ID
    await mergeFile(getChecklistFile(applicant, 'id'), `Photo ID: ${applicant.people.name}`);

    // 3. Applicant income (if not student)
    if (!applicant.is_student) {
      await mergeFile(getChecklistFile(applicant, 'income'), `Income: ${applicant.people.name}`);
    }

    // 4-6. Cosigner docs
    const cosigners = participants.filter((p) => p.role === 'cosigner' && p.linked_to_participant_id === applicant.id);

    for (const cosigner of cosigners) {
      // Cosigner signed form (template instances)
      const cosignerSignedDocs = signedInstances.filter((si) => si.participant_id === cosigner.id);
      for (const doc of cosignerSignedDocs) {
        await mergeFile(doc.pdf_file_url, `Signed form: ${doc.templates.name} (${cosigner.people.name})`);
      }

      // Cosigner ID
      await mergeFile(getChecklistFile(cosigner, 'id'), `Photo ID: ${cosigner.people.name}`);

      // Cosigner income
      await mergeFile(getChecklistFile(cosigner, 'income'), `Income: ${cosigner.people.name}`);
    }

    // 7. Credit report
    await mergeFile(getChecklistFile(applicant, 'credit_report'), `Credit Report: ${applicant.people.name}`);

    // 8. Proof of deposit
    await mergeFile(getChecklistFile(applicant, 'proof_of_deposit'), `Proof of Deposit: ${applicant.people.name}`);

    // Save merged package
    if (pdfDoc.getPageCount() === 0) {
      continue;
    }

    const mergedBytes = await pdfDoc.save();
    const packagePath = `${deal.workspace_id}/${dealId}/packages/${applicant.id}_package.pdf`;

    await sc.storage.from('staging').upload(packagePath, mergedBytes, {
      contentType: 'application/pdf',
      upsert: true,
    });

    // Generate signed URL for the package download
    const { data: signedData } = await sc.storage.from('staging').createSignedUrl(packagePath, 3600);

    if (skippedFiles.length > 0) {
      console.warn(
        `[generatePackages] ${applicant.people.name}: ${skippedFiles.length} file(s) skipped:`,
        skippedFiles,
      );
    }

    results.push({
      name: applicant.people.name,
      url: signedData?.signedUrl ?? packagePath,
      skipped: skippedFiles.length > 0 ? skippedFiles : undefined,
    });
  }

  revalidatePath(`/app/deals/${dealId}/review`);
  return { packages: results };
}
