# Plan: Port the PADS client experience onto self-hosted Documenso

## Context
Jared self-hosts Documenso (Postgres/Prisma, on a Mac mini at samuelssystems.com) and prefers its
e-sign/templates over those in his own app **PADS** (Next.js 16 + Supabase, on Vercel). He wants
PADS's best-loved *client-facing* experience added to Documenso for rental applications:

- a passwordless, self-serve **join link** (no accounts to provision),
- a unified **client portal** — forms to sign + supporting-document upload checklist + "Your Group",
- the **applicant / co-signer / student** role model that drives each person's checklist.

The client (applicant/co-signer) experience must match PADS. **Documenso's native signer replaces
PADS's signer** (Jared's explicit choice). This plan defines exactly what we harvest from PADS, what
we rebuild against Documenso, and what we defer.

Because the Documenso code lives on the Mac mini (not in this repo), this plan is a **port spec to
execute there**. PADS paths below are the read-only source to harvest from in `C:\dev\pads`. A
companion reference doc already exists at `docs/documenso-rental-portal-spec.md`.

## Client journey — end to end (this IS the "same as PADS" experience)
0. **Get the link.** Admin creates the application, gets one share link (`/a/[slug]`), and sends it by
   text/email/QR — manual share, like PADS. No account is provisioned for the client.
1. **Tap link → choice screen.** "I'm new — join this deal" vs "Already joined? Sign in."
2. **Sign-up (join).** Name, email, phone + role (applicant/co-signer) + student checkbox + (co-signer
   → pick their applicant). No password. Amber "hold tight" state if a co-signer arrives before any
   applicant exists.
3. **Instant portal.** Submit → recognition cookie set → dropped straight into their portal.
4. **Dashboard.** Welcome, Your Group, deal info, progress bar, Forms to Sign, Documents to Submit.
5. **Upload supporting docs.** Tap/drag; phone-photo HEIC auto-converts; status badges update.
6. **Sign forms.** Tap "Sign" → Documenso's native signer → back to the portal (Signed + progress moves).
7. **Return any time.** Cookie auto-recognizes them; or sign in with email + phone.
8. **View/download their finished docs** right in the portal.

## Locked decisions
- **Signing → Documenso-native.** Portal "Forms to Sign" deep-links to Documenso's `/sign/:token`;
  "signed" reads from Documenso recipient status. Do **not** port PADS's signing UI, signature pad,
  UETA consent gate, or pdf-lib generation. (Trade-off accepted: the consent text / audit format at
  the signing step becomes Documenso's, not PADS's MA-specific UETA flow.)
- **Branding → single brand for v1** (logo + one primary color + support footer on the portal
  banner). Skip PADS's 10-palette / 6-font picker. Multi-tenant branding, if ever needed, rides on
  Documenso **Teams** later. (Open-source ≠ not-white-label; they're independent axes.)
- **Doc delivery → in-portal, Documenso-native, for v1.** Each participant can view/replace their own
  uploaded supporting docs and download their completed signed PDFs directly in the portal — this
  replaces PADS's post-export Google Drive "Your Documents" card and is better UX (no waiting for an
  admin export). Google Drive export becomes a later, general-purpose Documenso integration (Phase 3),
  not a v1 dependency.
- **One portal.** Replicate PADS's `/g/[slug]` `PortalView` only; drop the secondary
  `/p/[participantId]` variant and its differing section labels.
- **Link delivery → manual share (v1).** Admin copies the application link and sends it (text/email/QR)
  themselves, exactly like PADS — no automated invite email/SMS in v1. Keeps it account-free and
  simple; can be added later via Documenso's existing email plumbing.

## Precondition — confirm on the Mac mini before coding
- Documenso frontend generation: **Next.js (`apps/web`)** vs **Remix/React-Router (`apps/remix`)**.
  Client components port near-verbatim on Next; on Remix the client UI still ports but server bits are
  rewritten.
- Storage transport (S3 vs local/db) and the auth/session lib (for passwordless cookie helpers).
- Whether the version has Folders/Envelopes that could host the "Application" grouping natively.

## Architecture — an "Applications" module beside Documenso's core
New namespace; **do not edit** Documenso's Document/Recipient/signing core (keeps upstream upgrades
painless). Routes: admin create at `/applications`; public join at `/a/[slug]`; portal at
`/a/[slug]?p=<accessToken>`. Reuse Documenso storage, signing, and email.

## What we take from PADS (harvest map)

**Lift — port the React components ~as-is** (swap UI primitives `@base-ui/react`→Documenso's
shadcn/Radix; swap server-action calls):
- `src/app/g/[slug]/group-landing.tsx` — join/sign-in choice, role cards, student checkbox, co-signer
  dropdown, amber "hold tight" wait state
- `src/app/g/[slug]/portal-view.tsx` — welcome, Your Group, deal info, progress bar, Forms-to-Sign
  list, Documents-to-Submit list, support footer
- `src/app/g/[slug]/checklist-card.tsx` — drag/drop upload card, 5 statuses, per-type helper copy
- `src/lib/file-utils.ts` — HEIC→JPEG (`heic2any`)
- `src/components/branding/portal-banner-header.tsx` — simplified to single brand

**Lift the logic** (keep the rule, rewrite persistence):
- `src/lib/progress.ts` — progress calc; "forms complete" now reads Documenso recipient status
- `src/lib/checklist.ts` `generateChecklistForParticipant` — applicant → ID (+INCOME unless student);
  co-signer → ID + INCOME
- The student income-suppression rule — **centralize** in one helper (PADS duplicates it across
  three surfaces and risks drift)

**Rewrite for Documenso** (Supabase → Prisma / Documenso storage / cookies):
- `src/app/g/[slug]/join/actions.ts` `joinDeal` / `signInToDeal` → Prisma; on join, provision a
  Documenso Document + Recipient from the role's Template
- `src/lib/upload-actions.ts` → store via Documenso storage (`DocumentData`), set checklist status;
  keep the 10 MB cap + jpg/png/webp/pdf allowlist
- server data fetching in `src/app/g/[slug]/page.tsx` → a Documenso loader/query

**Replace with Documenso-native — do NOT port:**
- `src/app/p/[participantId]/sign/*` (signing-view, signature-pad, actions, UETA gate, pdf-lib, audit
  trail) → Documenso `/sign/:token`
- admin template/field editor → Documenso Templates/Fields
- Google Drive export → Phase 3

## Data model — new Prisma models (`packages/prisma/schema.prisma`)
```prisma
enum ApplicationStatus { OPEN IN_PROGRESS READY_FOR_REVIEW SUBMITTED APPROVED DENIED WITHDRAWN }
enum ParticipantRole   { APPLICANT COSIGNER }
enum ChecklistItemType { ID INCOME CREDIT_REPORT PROOF_OF_DEPOSIT OTHER }
enum ChecklistItemStatus { PENDING UPLOADED APPROVED REJECTED }

model RentalApplication {
  id        String  @id @default(cuid())
  teamId    Int                            // Documenso Team = PADS workspace
  slug      String  @unique                // nanoid(8) — the one share link
  title     String?
  unitAddress String?
  rent      Decimal?
  moveInDate DateTime?
  status    ApplicationStatus @default(OPEN)
  applicantTemplateId Int?                  // Documenso Template per role
  cosignerTemplateId  Int?
  participants ApplicationParticipant[]
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model ApplicationParticipant {
  id            String @id @default(cuid())
  accessToken   String @unique @default(cuid())   // portal link uses THIS, not the db id
  applicationId String
  application   RentalApplication @relation(fields: [applicationId], references: [id], onDelete: Cascade)
  role          ParticipantRole
  isStudent     Boolean @default(false)
  linkedToId    String?                            // cosigner -> applicant
  linkedTo      ApplicationParticipant?  @relation("CosignerLink", fields: [linkedToId], references: [id])
  cosigners     ApplicationParticipant[] @relation("CosignerLink")
  name          String
  email         String
  phone         String
  recipientIds  Int[]  @default([])                // Documenso recipients for this person's forms
  checklist     ChecklistItem[]
  createdAt     DateTime @default(now())
  @@unique([applicationId, email])
}

model ChecklistItem {
  id            String @id @default(cuid())
  participantId String
  participant   ApplicationParticipant @relation(fields: [participantId], references: [id], onDelete: Cascade)
  type          ChecklistItemType
  label         String?
  status        ChecklistItemStatus @default(PENDING)
  documentDataId String?                           // REUSE Documenso storage, don't roll your own
  notes         String?
  createdAt     DateTime @default(now())
}
```

## Integration seam — "Forms to Sign" via Documenso
- Admin attaches Documenso Template(s) per role (`applicantTemplateId` / `cosignerTemplateId`).
- On join (or an admin "send"): **create a Document from the role's Template** and add the participant
  as a **SIGNER Recipient** → Documenso issues the token. Reuse Documenso's existing create-from-template
  + add-recipient service (`packages/lib` / the tRPC document router) — do not reimplement.
- Portal "Forms to Sign" lists this participant's Documenso recipients (match by email within the
  application's documents); each row links to `/sign/:token`. **Signed** = `recipient.signingStatus ===
  SIGNED`. Progress counts these alongside checklist uploads.

## End-of-deal packet generator (admin) — committed
One-click **"Generate Packages"**: for each applicant, merge into a single PDF (`pdf-lib`) in this fixed
order — their signed forms → applicant ID → applicant income (skip if student) → each linked co-signer's
signed forms + ID + income → credit report → proof of deposit. PDFs are page-copied; images (phone-photo
ID) are embedded centered on Letter pages; unreadable files are skipped and reported (not fatal). One
packet per applicant (co-signers fold into their applicant). Saved to Documenso storage with a scoped
download link for the admin — no Drive. Comes with two small **admin upload rows** (credit report /
proof of deposit) that populate those sections. **Port note:** the merge logic is ~100% reusable from
PADS `src/app/(admin)/app/deals/[id]/review/actions.ts` (`generatePackages`); only the file fetch
changes (Supabase Storage download → Documenso storage + completed-document fetch).

## Checklist + role/student rules (centralize)
One definition each, called everywhere:
- `generateChecklist(role, isStudent)` → applicant: `['ID']` or `['ID','INCOME']`; cosigner:
  `['ID','INCOME']`.
- `requiredChecklist(participant, items)` → the only place the "students skip income" filter lives.

## Identity & security
Passwordless: recognition cookie (`httpOnly`, `secure` in prod, `sameSite=lax`, scoped to `/a/[slug]`,
1-year). Sign-in = email + phone match; never reveal which field was wrong. Portal link uses
`accessToken`, not the DB id. Upload allowlist + size cap as PADS; HEIC→JPEG client-side. Keep this
auth entirely separate from Documenso's owner/admin login.

**Data-access model (important — Documenso has no RLS).** Clients use the web UI only; the browser
never touches Postgres. Prisma runs server-side, and files live in Documenso storage (S3/local), not
the DB — the DB holds only metadata/pointers (`documentDataId`, status). Unlike PADS/Supabase (which
enforce row isolation in the database via RLS), Documenso enforces scoping in **application code**, so
**every** query and file-download route in this module must filter by the requesting participant's
`accessToken`. Supporting-doc uploads (ID, income) are **private to that participant** — the "Your
Group" card shows names/roles only, never other members' files. Completed signed PDFs are downloadable
only by the participants who are party to that document.

## Phases (ship between each)
1. **Skeleton, no signing.** New schema + admin create + public join/sign-in + portal + checklist
   uploads (Documenso storage). Usable for document collection on day one.
2. **Wire signing + end-of-deal packet.** Template→Document→Recipient provisioning + Forms-to-Sign
   surfacing via Documenso tokens; admin upload of credit report / proof of deposit; the **packet
   generator** (one merged PDF per applicant — see below).
3. **Enhancements.** General "export completed documents to Google Drive" integration (clients +
   admins); the formal review/approve *pipeline* polish (status board, one-click approve/deny);
   richer per-team branding.

## Verification — end-to-end on the Mac mini
- Resolve the precondition (generation / storage / auth).
- Run Documenso locally; create a `RentalApplication`; open the public `/a/[slug]`.
- Join as **applicant** (non-student → ID+income; student → ID only) and as **co-signer** (link to an
  applicant; confirm the amber "hold tight" state appears when no applicant exists yet). Verify the
  checklist matches the rules, the "email already joined" guard, and the email+phone sign-in path.
- Upload a phone **HEIC** photo (converts to JPEG) and a PDF; status → uploaded; progress bar moves.
- Tap a "Sign" form → lands in **Documenso's native signer** → complete → returns to the portal
  showing "Signed" + an updated progress bar.
- As admin, upload a credit report, then hit **Generate Packages** → one merged PDF per applicant
  downloads with signed forms + ID + income + co-signer docs + credit report/proof of deposit in order;
  a bad file shows up as "skipped", not a crash.
- Confirm each participant can view their own uploaded files and download their completed signed PDF
  in-portal, and that one participant **cannot** reach another's uploaded ID/income (scoping check).
- Confirm cookie recognition on return visit, and the deal-closed state when the application is
  approved/denied/withdrawn.
```
