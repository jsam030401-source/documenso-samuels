# Harvest Map — PADS → Documenso rental portal

Per-file worklist for porting PADS's client experience into the Documenso "Applications" module.
Pair this with the plan (`~/.claude/plans/i-want-to-make-vivid-pnueli.md`) and the architecture spec
(`docs/documenso-rental-portal-spec.md`).

## How to use
1. Copy the **harvest set** files below from this PADS repo to the Mac mini (or open this repo there
   for reference).
2. Confirm the Documenso generation first — **Next.js (`apps/web`)** vs **Remix (`apps/remix`)**. The
   "Lift" components port near-verbatim on Next; on Remix the JSX still ports but the server bits
   (server components, `'use server'`, `next/headers`) are rewritten.
3. Build in plan order: **schema → join → portal → checklist/upload → forms-to-sign wiring.**
4. For each file, apply the common rules (below) plus its specific deltas.

## Harvest set (files to copy)
| PADS source | Role | Target |
|---|---|---|
| `src/app/g/[slug]/group-landing.tsx` | Lift | join/sign-in UI |
| `src/app/g/[slug]/portal-view.tsx` | Lift | portal home |
| `src/app/g/[slug]/checklist-card.tsx` | Lift | upload card |
| `src/lib/file-utils.ts` | Lift | HEIC→JPEG prep |
| `src/components/branding/portal-banner-header.tsx` | Lift (simplify) | branded banner |
| `src/lib/progress.ts` | Lift logic | progress calc |
| `src/lib/checklist.ts` | Lift logic | checklist rules |
| `src/app/g/[slug]/join/actions.ts` | Rewrite | join/sign-in server logic |
| `src/lib/upload-actions.ts` | Rewrite | upload handler |
| `src/app/g/[slug]/page.tsx` | Rewrite | portal data loader |
| `src/app/(admin)/app/deals/[id]/review/actions.ts` | Lift logic + rewrite I/O | packet generator + admin uploads |
| `src/app/(admin)/app/deals/[id]/review/review-view.tsx` | Lift (admin) | review screen + Generate Packages button |

**Do NOT copy** (Documenso replaces these): `src/app/p/[participantId]/sign/*`, the admin template/field
editor, anything Google-Drive.

---

## Common adaptation rules (apply to every file)

- **Data layer:** Supabase `createServiceClient()` + `.from(table)` → **Prisma**. Every read/write
  must be scoped — by `teamId` for admin queries, by the participant's `accessToken` for portal
  queries. (No RLS in Documenso; this scoping is the only thing protecting one applicant's ID/income
  from another. See the plan's "Data-access model" note.)
- **File storage:** Supabase Storage `staging` bucket → Documenso storage (`DocumentData` / `putFile`).
  Store only the pointer + status in the DB.
- **Server functions:** `'use server'` actions → Documenso's convention (server action on Next, or a
  tRPC mutation). Keep the same input/return shape so the client components barely change.
- **Cookies:** `next/headers` `cookies()` → the framework's cookie API (Next headers or Remix session).
- **Revalidation:** `revalidatePath(...)` → Next `revalidatePath` or Remix loader revalidation.
- **UI primitives:** PADS `@/components/ui/*` wrap **`@base-ui/react`**; Documenso's wrap **Radix**.
  Keep the same component names/variant API, swap the import path, re-verify props (table below).
- **Icons:** `lucide-react` → `lucide-react` (same library — no change).
- **Tailwind tokens:** `bg-primary`, `bg-muted`, `text-muted-foreground`, `border`, `ring`, etc. are
  shadcn tokens both apps share. Verify they resolve in Documenso's theme; map any that differ.

### UI primitive mapping
| PADS import | Documenso equivalent | Watch for |
|---|---|---|
| `Button` | `Button` | variant/size names (`outline`, `ghost`, `icon-xs`) |
| `Card / CardHeader / CardContent / CardTitle / CardDescription` | same family | — |
| `Badge` | `Badge` | variants `default/secondary/outline/destructive` |
| `Input`, `Label` | same | — |
| `Checkbox` | `Checkbox` | `onCheckedChange` value (`v === true`) |
| `Select / SelectTrigger / SelectContent / SelectItem / SelectValue` | same family | controlled `value`/`onValueChange` API |

---

## Per-file deltas

### `group-landing.tsx` — Lift
- Pure client component; `'use client'` stays on Next. The choice/join/sign-in view-switching, role
  cards, student checkbox, co-signer dropdown, and amber "hold tight" state all carry over unchanged.
- Swap: `joinDeal` / `signInToDeal` import to the rewritten actions; UI primitives per table.
- `useActionState` + `FormData` pattern: keep on Next; on Remix convert to a `<Form>` + action.
- No `react-hook-form` needed (PADS doesn't use it here).

### `portal-view.tsx` — Lift
- Carries over: welcome card, **Your Group** (names/roles only — never other members' files), deal
  info, progress bar, **Forms to Sign**, **Documents to Submit**, support footer.
- Swap: `getParticipantProgress` import; `useBrand()` → simplified single-brand context (or props);
  the "Sign" link target → Documenso `/sign/:token`; the signed badge condition → Documenso recipient
  `signingStatus === SIGNED`.
- **Add (new for v1):** a view/replace link on each uploaded checklist item and a download link on
  each completed signed PDF — this is the in-portal doc access that replaces PADS's Drive card. Both go
  through a server route scoped to `accessToken`.

### `checklist-card.tsx` — Lift
- Drag/drop, 5 statuses, per-type helper copy (income/ID microcopy), HEIC handling all carry over.
- Swap: `uploadChecklistFile` import to the rewritten action; `prepareFileForUpload` stays (from
  `file-utils.ts`).
- Add a "View" affordance for `uploaded/approved` items (links to the scoped download route).

### `file-utils.ts` — Lift (near-verbatim)
- `heic2any` client-side conversion + image normalization. Keep as-is; verify `heic2any` is added to
  Documenso's web deps.

### `portal-banner-header.tsx` — Lift, simplified
- Drop the 3-tier PADS-default branch and the palette/font machinery. Render: brand logo (or company
  name) on the primary color. Wire the primary color + logo from a single brand config (env/team
  setting), not the 10-palette system.

### `progress.ts` — Lift logic
- Keep the calc. Change the "forms complete" source: instead of `template_instances` status +
  `template_instance_signers`, count Documenso recipients with `signingStatus === SIGNED` for this
  participant. `total = checklist.length + assignedRecipients.length`.

### `checklist.ts` — Lift logic
- Keep the rules verbatim: applicant → `['ID']` (student) or `['ID','INCOME']`; co-signer →
  `['ID','INCOME']`. Rewrite the insert to Prisma. **Centralize** `requiredChecklist()` (the
  student→skip-income filter) in one helper and call it from the loader + portal (PADS duplicates it).

### `join/actions.ts` — Rewrite
- Same flow, Prisma-backed: look up application by slug → reject duplicate email
  (`@@unique([applicationId, email])`) → create participant (set `isStudent`, `linkedToId`) →
  `generateChecklist()` → set recognition cookie → redirect to portal.
- Co-signer guard: require an existing applicant on the application before allowing the join (drives
  the amber state).
- **Provision signing (Phase 2):** after creating the participant, create a Documenso Document from
  the role's Template and add the participant as a SIGNER Recipient; store the recipient id(s) on
  `ApplicationParticipant.recipientIds`. Reuse Documenso's create-from-template + add-recipient
  service — don't reimplement.
- Sign-in: email + phone match; return a not-found flag without revealing which field was wrong.

### `upload-actions.ts` — Rewrite
- Keep validation (10 MB cap; `jpg/png/webp/pdf` by ext **and** mime). Replace the Supabase Storage
  upload with Documenso storage → get a `DocumentData` id → set `ChecklistItem.status = UPLOADED`,
  `documentDataId`. Re-validate the participant owns the checklist item (scope by `accessToken`).

### `g/[slug]/page.tsx` — Rewrite (loader)
- Reproduce the routing: no `?p=`/cookie → join view; cookie present → resolve participant → portal;
  closed application → "no longer accepting" state. Replace all Supabase reads with Prisma queries
  scoped to the slug/`accessToken`. Sign any file URLs through the scoped download route, not public
  URLs.

### `review/actions.ts` — Lift logic, rewrite I/O (Phase 2)
- `generatePackages`: the `pdf-lib` merge is reusable almost verbatim — create doc, `copyPages` for
  PDFs, `embedJpg`/`embedPng` for images centered on a Letter page, skip+report unreadable files, one
  packet per applicant with co-signers folded in, fixed section order. Swap only the file fetch:
  Supabase `storage.download(path)` → Documenso storage read; signed-form PDFs come from Documenso
  **completed documents** (fetch their bytes). Save the merged packet to Documenso storage and return a
  scoped download URL (no Drive / no `createSignedUrl`).
- `uploadAdminDoc` (credit report / proof of deposit): rewrite storage to Documenso `DocumentData`;
  upsert the `ChecklistItem`.

### `review/review-view.tsx` — Lift (admin)
- Per-applicant cards with co-signers grouped under them, doc rows with view links, the `AdminUploadRow`
  for credit report / proof of deposit, and the **Generate Packages** button + results list. Swap UI
  primitives + action imports. Drop the "files purged / view in Drive" tooltip branch for v1.

---

## Definition of done (Phase 1)
Schema migrated; admin can create an application and get a slug; a stranger with the link can join as
applicant (student/non-student) or co-signer (with the amber wait state), gets the right checklist,
uploads a phone HEIC + a PDF (both stored, status flips), sees a progress bar, can view their own
uploads, is recognized on return by cookie, and cannot reach anyone else's files. Signing wiring is
Phase 2.
