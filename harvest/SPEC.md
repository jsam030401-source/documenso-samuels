# Documenso Rental-Application Portal — Build Spec

Porting the PADS **client onboarding + portal + supporting-document checklist** onto a
self-hosted Documenso, *without* forking Documenso's signing/template engine (which is the part
we're keeping because it's better than PADS).

> Hand this file to Claude Code running on the **Mac mini**, inside the Documenso checkout, so it
> can implement against the real code. Everything below is framework-agnostic on purpose — the
> *what* and the *data/logic* are nailed down; exact file placement is for the on-device agent.

---

## 0. Infra reality (read first)

| | PADS (source) | Documenso (target) |
|---|---|---|
| Host | Vercel | Mac mini @ samuelssystems.com |
| Framework | Next.js 16 App Router | **Confirm:** `apps/web` (Next.js) **or** `apps/remix` (React Router 7) — Documenso migrated the frontend; route/page wiring differs between generations |
| DB | Supabase Postgres | Postgres via **Prisma** (`packages/prisma/schema.prisma`) |
| File storage | Supabase Storage bucket `staging` | Documenso storage layer (`DocumentData`, S3-compatible **or** local/db transport) |
| Tenant isolation | Supabase **RLS** on `workspace_id` | App-level scoping on Documenso **Team** id (no RLS) |
| Server logic | Next server actions + service client | tRPC routers (`packages/trpc`) and/or server actions — match your version's convention |
| Auth | Passwordless (cookie + email/phone) | Reuse the same passwordless pattern for participants; keep it *separate* from Documenso's owner/admin auth |

**First task on the Mac mini:** confirm the framework generation, the auth/session lib, and whether
the storage transport is S3 or local. Those three answers decide the wiring; the schema/logic below
do not change.

---

## 1. Architecture principle: layer, don't fork

Add an **"Applications" module** beside Documenso's document engine. Keep the signing core pristine so
you can still pull upstream updates.

- **New** (you build): public self-register link, `Application`/`Participant`/`ChecklistItem` schema,
  upload endpoint, the aggregated client portal.
- **Reused** (call into Documenso, don't rewrite): storage layer, the `Recipient` token + `/sign/:token`
  signing flow, email/notifications.

Namespacing suggestion (adapt to your router): admin at `/applications`, public join at `/a/[slug]`,
portal at `/a/[slug]?p=<token>` (or `/a/portal/[token]`).

---

## 2. Data model (new Prisma models)

PADS spine: `deal → participant → checklist_items`, plus `person` (reusable identity) and
`template_instances` (forms to sign). For Documenso v1, fold identity into the participant (skip the
reusable `person` table unless you want cross-application reuse later), and use Documenso's own
`Document`/`Recipient` for the "forms to sign" side.

```prisma
enum ApplicationStatus { OPEN IN_PROGRESS READY_FOR_REVIEW SUBMITTED APPROVED DENIED WITHDRAWN }
enum ParticipantRole  { APPLICANT COSIGNER }
enum ParticipantStatus { NOT_STARTED IN_PROGRESS COMPLETE REVIEWED WITHDRAWN }
enum ChecklistItemType { ID INCOME CREDIT_REPORT PROOF_OF_DEPOSIT OTHER }
enum ChecklistItemStatus { PENDING UPLOADED APPROVED REJECTED }

model Application {
  id           String   @id @default(cuid())
  teamId       Int                         // Documenso Team = PADS workspace
  slug         String   @unique            // nanoid(8) — the one share link
  title        String?
  unitAddress  String?
  rent         Decimal?
  moveInDate   DateTime?
  status       ApplicationStatus @default(OPEN)
  // optional: which Documenso template a role gets, so joins can auto-provision docs
  applicantTemplateId Int?
  cosignerTemplateId  Int?
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  participants ApplicationParticipant[]
}

model ApplicationParticipant {
  id             String   @id @default(cuid())
  accessToken    String   @unique @default(cuid())  // portal link uses THIS, not the db id
  applicationId  String
  application    Application @relation(fields: [applicationId], references: [id], onDelete: Cascade)
  role           ParticipantRole
  isStudent      Boolean  @default(false)
  linkedToId     String?                              // cosigner -> applicant
  linkedTo       ApplicationParticipant?  @relation("CosignerLink", fields: [linkedToId], references: [id])
  cosigners      ApplicationParticipant[] @relation("CosignerLink")
  name           String
  email          String
  phone          String
  status         ParticipantStatus @default(NOT_STARTED)
  // link to Documenso recipients created for this participant's forms-to-sign:
  recipientIds   Int[]    @default([])
  checklist      ChecklistItem[]
  createdAt      DateTime @default(now())
  @@index([applicationId])
  @@unique([applicationId, email])         // one email per application (PADS enforces this)
}

model ChecklistItem {
  id            String   @id @default(cuid())
  participantId String
  participant   ApplicationParticipant @relation(fields: [participantId], references: [id], onDelete: Cascade)
  type          ChecklistItemType
  label         String?
  status        ChecklistItemStatus @default(PENDING)
  documentDataId String?              // REUSE Documenso storage (DocumentData), don't roll your own
  notes         String?
  createdAt     DateTime @default(now())
  @@index([participantId])
}
```

Notes:
- `accessToken` (not the raw row id) is the unguessable bearer for the portal link — cleaner than
  PADS leaking `participantId` in the URL.
- `documentDataId` reuses Documenso's storage abstraction so uploaded ID/income files live in the same
  S3/local store as signed PDFs, with one backup/lifecycle story.

---

## 3. The integration seam — "Forms to Sign"

This is the one piece that must talk to Documenso. Everything else is standalone.

1. Admin attaches Documenso **Template(s)** to the Application (`applicantTemplateId` / `cosignerTemplateId`).
2. On join (or on an admin "send"), for each participant: **create a Document from the role's Template**
   and add the participant as a **Recipient (SIGNER)** → Documenso issues the per-recipient signing token.
   (Find the existing "create document from template" + "add recipient" service in `packages/lib` /
   the tRPC document router and call it — do not reimplement.)
3. Portal "Forms to Sign" = list this participant's Documenso Recipients (match by email within this
   Application's documents); each row links to Documenso's own `/sign/:token`.
4. "Signed" = `recipient.signingStatus === SIGNED`. Progress counts these alongside checklist uploads.

Result: 100% of Documenso's signing UX is reused; you only orchestrate doc creation and surface the
tokens inside your portal.

---

## 4. Routes & flows

**Admin — create application**
- Generate `slug = nanoid(8)`, scope to current `teamId`, pick template per role, share the link.
  (PADS ref: `src/app/(admin)/app/deals/actions.ts`.)

**Public `/a/[slug]` — join / sign-in choice** (PADS ref: `group-landing.tsx`)
- **Join**: name / email / phone + role (APPLICANT|COSIGNER) + `isStudent` (applicants only) +
  (cosigner → pick which applicant). On submit:
  1. reject duplicate email in this application,
  2. create participant,
  3. `generateChecklist(role, isStudent)` (see §5),
  4. optionally provision Documenso documents (§3),
  5. set recognition cookie, redirect to portal.
  (PADS ref: `src/app/g/[slug]/join/actions.ts`.)
- **Sign-in**: email **+** phone match → set cookie → portal. Never reveal which field was wrong.

**Portal `/a/[slug]?p=<accessToken>`** (PADS ref: `portal-view.tsx`)
- Welcome (name, role, student badge) · **Your Group** (other participants + "Co-signer for X")
  · deal info · **progress bar** · **Forms to Sign** (Documenso tokens) · **Documents to Submit**
  (checklist upload cards).

**Upload endpoint** (PADS ref: `src/lib/upload-actions.ts`)
- Validate (≤10MB; allow jpg/png/webp/pdf by ext **and** mime) → store via Documenso storage →
  set `ChecklistItem.status = UPLOADED`, save `documentDataId` → revalidate portal.

---

## 5. Checklist + role/student rules — CENTRALIZE THESE

PADS re-implements the student filter in three surfaces and risks drift. Put each rule in **one**
function and call it everywhere.

```ts
// generate on join
function generateChecklist(role, isStudent): ChecklistItemType[] {
  if (role === 'APPLICANT') return isStudent ? ['ID'] : ['ID', 'INCOME'];
  return ['ID', 'INCOME']; // COSIGNER always ID + income
}

// the ONLY place the student->no-income rule lives at read time
function requiredChecklist(participant, items) {
  return participant.isStudent ? items.filter(i => i.type !== 'INCOME') : items;
}
```

(PADS ref: `src/lib/checklist.ts`, and the duplicated filter in `page.tsx` / `portal-view.tsx`.)

Progress (PADS ref: `src/lib/progress.ts`):
`completed = (checklist items UPLOADED/APPROVED) + (recipients SIGNED)`,
`total = checklist.length + recipients.length`.

---

## 6. Identity & security

- **Passwordless**: recognition cookie — `httpOnly`, `secure` in prod, `sameSite=lax`, **scoped to
  `/a/[slug]`**, 1-year `maxAge`. Sign-in = email + phone match. Keep this entirely separate from
  Documenso's owner login.
- Portal link = `accessToken` (unguessable), not the DB id.
- Upload allowlist + size cap as above; HEIC→JPEG client-side before upload (PADS uses `heic2any` +
  `src/lib/file-utils.ts` — phones shoot HEIC, landlords need JPEG/PDF).
- Audit: if Documenso exposes its audit log, reuse it; else add an `ApplicationAuditEvent` table
  (event_type, payload, ip, ua, createdAt).

---

## 7. Supabase → Documenso translation cheatsheet

| PADS (Supabase) | Documenso equivalent |
|---|---|
| `createServiceClient()` + `.from(table)` | Prisma client (`prisma.application.…`) |
| RLS on `workspace_id` | explicit `where: { teamId }` on every query |
| `supabase.storage.from('staging').upload()` | Documenso storage `putFile` → `DocumentData` row |
| signed URL for private file | Documenso's file-download/serve route (signed/streamed) |
| `revalidatePath('/g/[slug]')` | Next `revalidatePath` **or** Remix loader revalidation |
| server action `'use server'` | tRPC mutation **or** action, per your version |
| `cookies()` from `next/headers` | framework cookie API (Next headers or Remix session) |
| `nanoid(8)` slug | same (`nanoid`) or Prisma `cuid()` |
| Telegram notify on events | reuse Documenso email, or keep a webhook/Telegram ping |

---

## 8. Build phases (ship between each)

1. **Skeleton, no signing.** New schema + admin create + public join/sign-in + portal +
   checklist uploads. Fully usable for document collection on day one.
2. **Wire signing.** Template→Document→Recipient provisioning (§3) + "Forms to Sign" surfacing.
3. **Polish.** Your-Group card, progress bar, student/cosigner edge cases, admin review/approve,
   export, notifications.

---

## 9. Cheap UX wins to copy verbatim (PADS refs)

- "Bookmark this page — it's your one link for everything" nudge (`portal-view.tsx`).
- Amber **"Hold tight — wait until the applicant creates their account"** cosigner state
  (`group-landing.tsx`).
- Income microcopy: "paystubs, offer letters, W-2s… feel free to blur sensitive info — landlords
  just want a name and amount" (`checklist-card.tsx`).
- Tappable role cards, drag-drop upload, inline progress bar.

---

## 10. Resolve on the Mac mini (against real code)

- [ ] Framework generation: `apps/web` (Next) vs `apps/remix`?
- [ ] Auth/session lib in your Documenso version (for cookie handling helpers)?
- [ ] Storage transport configured: S3 vs local/db?
- [ ] Does your version have Folders/Envelopes you could reuse instead of a new `Application` grouping?
- [ ] tRPC vs server-action convention for new mutations.
