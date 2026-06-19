# Rental-application module — start kit (PADS → Documenso)

Everything needed to build the rental-application module into Documenso. **Copy this whole `harvest/`
folder to the Mac mini** (inside or beside the Documenso checkout) and open Claude Code there.

## Read these first
- `PLAN.md` — the approved plan (scope, locked decisions, data model, phases, verification).
- `SPEC.md` — architecture + Prisma schema + the signing integration seam.
- `HARVEST-MAP.md` — per-file copy-paste-then-adapt worklist (covers every source file below).

## Source files (PADS originals to port)
| File here | Original PADS path | Role |
|---|---|---|
| `group-landing.tsx` | `src/app/g/[slug]/group-landing.tsx` | Lift — join/sign-in UI |
| `portal-view.tsx` | `src/app/g/[slug]/portal-view.tsx` | Lift — portal home |
| `checklist-card.tsx` | `src/app/g/[slug]/checklist-card.tsx` | Lift — upload card |
| `portal-page.tsx` | `src/app/g/[slug]/page.tsx` | Rewrite — portal loader |
| `join-actions.ts` | `src/app/g/[slug]/join/actions.ts` | Rewrite — join/sign-in logic |
| `upload-actions.ts` | `src/lib/upload-actions.ts` | Rewrite — upload handler |
| `file-utils.ts` | `src/lib/file-utils.ts` | Lift — HEIC→JPEG |
| `progress.ts` | `src/lib/progress.ts` | Lift logic — progress calc |
| `checklist.ts` | `src/lib/checklist.ts` | Lift logic — checklist rules |
| `portal-banner-header.tsx` | `src/components/branding/portal-banner-header.tsx` | Lift (simplify) — banner |
| `review-actions.ts` | `src/app/(admin)/app/deals/[id]/review/actions.ts` | Lift logic + rewrite I/O — packet generator + admin uploads |
| `review-view.tsx` | `src/app/(admin)/app/deals/[id]/review/review-view.tsx` | Lift (admin) — review screen + Generate Packages |

> Note: these are **Supabase/Next.js** originals. "Lift" = port the component, swap UI primitives +
> action calls. "Rewrite" = keep the behavior, redo the data/storage layer for Prisma + Documenso
> storage. See HARVEST-MAP.md for each file's exact checklist.

## Kickoff prompt (paste into Claude Code inside the Documenso checkout)
> Read `PLAN.md`, `SPEC.md`, and `HARVEST-MAP.md` in this folder. We're adding a **rental-application
> module** to THIS Documenso codebase: a passwordless self-serve join link, a client portal (forms to
> sign + supporting-doc upload checklist + "Your Group"), the applicant / co-signer / student role
> model, and an end-of-deal **merged-PDF packet generator**. Signing reuses Documenso's native
> `/sign/:token` — do **not** fork it. The `*.tsx` / `*.ts` files here are the PADS source to port (each
> file's adapt checklist is in HARVEST-MAP.md). **Before writing anything**, tell me: is this Documenso
> the Next.js (`apps/web`) or Remix (`apps/remix`) generation? What's the storage transport (S3 vs
> local) and the auth/session lib? Then start **Phase 1** (schema + admin create application + public
> join/sign-in + portal + checklist uploads) and stop for review before wiring signing.

## The one thing that decides wiring
Next.js (`apps/web`) vs Remix (`apps/remix`) generation. The schema and logic are identical either way;
only where the routes/pages live differs.
