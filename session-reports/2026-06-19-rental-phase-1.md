# Session report — 2026-06-19 — Rental-application module, Phase 1

**Project:** `~/dev/documenso-samuels` (Documenso fork) · **Branch:** `feat/rental-application-phase-1`
**Live:** sign.samuelssystems.com · **Status:** Phase 1 DEPLOYED & verified. Phase 2 not started.

## What this is
Porting PADS's client experience into self-hosted Documenso: a passwordless **join link** → a
client **portal** (sign forms + supporting-doc upload checklist + "Your Group") → the
**applicant / co-signer / student** role model → (later) a merged-PDF **packet** at the end.
Signing reuses Documenso's native `/sign/:token` — not forked. Build plan: `harvest/PLAN-REMIX.md`.

## What shipped this session (all live)
- **Phase 1 — document collection (no signing yet):**
  - Admin can create a rental application and get one shareable tenant link.
  - A stranger opens the link, joins with **no password** (applicant/co-signer, student checkbox,
    co-signer picks their applicant, amber "hold tight" if no applicant exists yet), lands in a
    portal, and uploads ID / income docs (phone HEIC auto-converts to JPEG; 10MB; jpg/png/webp/pdf).
  - Cookie recognises them on return; email+phone sign-in path; each participant sees only their own
    files; progress bar.
- **"Rental Apps" header nav link** (desktop + mobile) → `/t/:teamUrl/applications`.
- **Deal monitoring:** the applications list is the overview; each row has **Manage** → a detail page
  showing each applicant with co-signers grouped under them, each person's checklist status
  (Pending/Uploaded), **View** links to open uploads (team-scoped), and per-person `x/y docs` progress.

## How it's wired (the facts that drove every decision)
- This Documenso is the **Remix / React Router 7** generation (`apps/remix`, flat-routes) — NOT Next.js.
- It's the **Envelope** generation: `Envelope`(type DOCUMENT|TEMPLATE) → `EnvelopeItem` → `DocumentData`;
  signers are `Recipient`s on an Envelope. "Create document from template" = `createDocumentFromTemplate`
  + `sendDocument`.
- **Database storage transport** (files = base64 `BYTES_64` in Postgres, no S3).
- Custom **oslo** auth. Participants use a **separate** signed cookie (`rental_participant`, path `/a`),
  never the Documenso owner session.
- New models use **scalar foreign keys** (teamId/ownerUserId/folderId/documentDataId) with NO Prisma
  relations to core models — so Documenso's core is untouched and upstream merges stay clean.
- Module UI uses **plain English strings** (no lingui `<Trans>`/`msg`/`t` macros) to avoid the repo's
  no-extract catalog landmine. (The one nav label that briefly used a macro rendered as a hashed id in
  the prod build → fixed to a plain literal; commit 2c45b76.)

## Files (all under `documenso-samuels`)
- Schema + migration: `packages/prisma/schema.prisma`,
  `packages/prisma/migrations/20260619215222_add_rental_application/` (additive: 3 tables + 4 enums).
- Server logic: `packages/lib/server-only/rental/` (checklist rules, progress, create/find/get
  application, join, sign-in, portal data, upload, file fetch — participant- and team-scoped).
- tRPC: `packages/trpc/server/application-router/` (getApplications / getApplication / createApplication;
  team-membership verified) → registered in `packages/trpc/server/router.ts`.
- Routes: `apps/remix/app/routes/a.$slug.tsx` (public portal: loader + join/signin/upload actions),
  `a.$slug_.files.$checklistItemId.tsx` (participant file download),
  `_authenticated+/t.$teamUrl+/applications._index.tsx` (admin list+create),
  `applications.$id.tsx` (monitoring detail), `applications.$id_.files.$checklistItemId.tsx` (admin file).
- Components: `apps/remix/app/components/rental/` (group-landing, portal-view, checklist-card,
  portal-banner-header, file-utils). Nav: `app-nav-desktop.tsx`, `app-nav-mobile.tsx`.
- Cookie: `apps/remix/app/storage/rental-participant.server.ts`. Util: `app/utils/sniff-content-type.ts`.
- Dep added: `heic2any` in `apps/remix/package.json`.

## Tests / regression run (actual results)
- `apps/remix` TypeScript typecheck (`tsc`): **0 errors** (whole app).
- Biome lint on all new rental files: **0 errors**.
- Live verification after each deploy: migration applied on boot, all 3 tables + 4 enums present in the
  live `documenso` DB, `/api/health` = ok (database + certificate ok), new route ids + tRPC router
  present in the deployed build, "Rental Apps" now a literal in the header bundle.
- NOT run: Documenso's vitest/playwright suites (need a full running app + services; out of scope for a
  layered, type-clean additive feature). No root `npm test` exists.

## Deploy recipe (confirmed working)
1. From `~/dev/documenso-samuels`: `docker build -f docker/Dockerfile -t documenso-samuels:local .`
2. From `~/dev/hosted-infrastructure/documenso`: `docker compose up -d documenso`
   (boot runs `prisma migrate deploy`; look for **"Started"/"Recreated"**, not "Running", to confirm the
   new image was picked up — same tag, so verify the image ID changed).
- Live DB = the dedicated `documenso-database-1` container (db `documenso`), sealed in the Docker network.
- GOTCHA: `npm install` clobbers the generated Prisma client → re-run `npx prisma generate` after.
- GOTCHA: the prisma-kysely generator needs `node_modules/.bin` on PATH (run from repo root).
- Jared runs `docker compose up` / prod-DB commands himself (safety classifier blocks them for the agent).

## Decisions the user owes / open items
- **Branch not yet merged** to your fork's `main` (it IS pushed to origin — see below). Merge when ready.
- **No sidebar deep-link beyond the top nav** — admin pages reachable via the header "Rental Apps" link.
- **Single brand** (banner shows "Samuels Systems" on theme color; no logo wired). Add a logo later if wanted.
- Optional polish: status board / approve-deny, email/SMS invites, Google Drive export (all Phase 3).

## End-to-end manual test (do this in the browser)
1. Hard-refresh sign.samuelssystems.com → click **Rental Apps** in the header.
2. Create an application → copy its tenant link → open in an incognito window.
3. Join as applicant (try student vs not) and as co-signer (link to the applicant; confirm amber state
   appears before any applicant exists). Upload a phone photo + a PDF; watch status + progress update.
4. Back in admin → **Manage** the application → confirm participants, checklist status, and **View** links.

---

## ▶ PHASE 2 HANDOFF — wire signing + the packet generator (start here next session)

**Goal:** turn collected applications into signed documents using Documenso's native signer, then
generate one merged PDF per applicant at the end.

**Read first:** `harvest/PLAN-REMIX.md` (§"Integration seam") and `harvest/HARVEST-MAP.md`. The PADS
source to port for the packet generator is `harvest/review-actions.ts` (`generatePackages`) +
`harvest/review-view.tsx` (admin "Generate Packages" UI). pdf-lib is already a dep as `@cantoo/pdf-lib`.

**The Envelope seam (exact services — confirmed to exist):**
- `createDocumentFromTemplate({ id: { secondaryId }, userId: <app.ownerUserId>, teamId, folderId,
  recipients: [{ id: <templateRecipientId>, email, name }], requestMetadata })`
  → `packages/lib/server-only/template/create-document-from-template.ts`. Returns an Envelope with
  `recipients[].token`.
- `sendDocument({ id, userId, teamId, sendEmail: false, requestMetadata })`
  → `packages/lib/server-only/document/send-document.ts`. Makes tokens live WITHOUT emailing
  (matches the manual-share decision).
- Signing URL is `/sign/:token`; signed = `recipient.signingStatus === 'SIGNED'`.
- Final signed PDF bytes: `getFileServerSide(envelopeItem.documentData)` after completion.

**Schema is already prepared for this** (no new migration needed to start):
- `RentalApplication.applicantTemplateId` / `cosignerTemplateId` (String? = Envelope `secondaryId`),
  `RentalApplication.ownerUserId` (the Documenso user that provisions envelopes — participants aren't
  users), `RentalApplication.folderId` (groups generated envelopes), `ApplicationParticipant.recipientIds`
  (Int[] — store created recipient ids here).

**Suggested Phase 2 steps:**
1. Admin: let the owner attach a Documenso **Template** per role to an application (extend the admin
   detail page + a `setApplicationTemplates` tRPC mutation; schema `ZSetApplicationTemplatesRequestSchema`
   already stubbed in `application-router/schema.ts`).
2. On join (in `packages/lib/server-only/rental/join-application.ts`, after participant creation): if the
   role has a template, `createDocumentFromTemplate` + `sendDocument({sendEmail:false})` as
   `app.ownerUserId`/`teamId`, store the recipient id(s) on `participant.recipientIds`.
3. Portal "Forms to Sign": in `get-portal-data.ts`, look up the participant's recipients (by
   `recipientIds` or by email within the app's envelopes), return `{ token, title, signed }[]` in the
   already-present `forms` field. `portal-view.tsx` already renders a Forms-to-Sign section + links to
   `/sign/:token` when `forms.length > 0`. Update `getParticipantProgress` callers to pass
   `{ signed, total }` (the fn already supports it).
4. Packet generator (admin): port `generatePackages` from `harvest/review-actions.ts` — merge with
   `@cantoo/pdf-lib` (copyPages for PDFs, embed images centered on Letter, skip+report unreadable), one
   packet per applicant (co-signers folded in), fixed order. Swap the file fetch to `getFileServerSide`
   over the participants' `documentDataId`s (checklist uploads) + completed envelope bytes. Save the
   packet to Documenso storage; expose a team-scoped admin download (mirror the admin file route).

**Gotchas to remember:** re-run `npx prisma generate` after any `npm install`; deploy via the recipe
above; keep new UI strings as plain literals (no lingui macros).
