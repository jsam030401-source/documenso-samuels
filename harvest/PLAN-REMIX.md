# PLAN-REMIX — Rental-Application module, reconciled to the actual codebase

> Supersedes the framework-agnostic `PLAN.md` / `SPEC.md` for wiring decisions. The *what* (client
> journey, locked product decisions, security model) is unchanged from `PLAN.md`; this file pins the
> *how* to the real code after mapping `apps/remix`. Read `PLAN.md` for product scope, this for build.

## Resolved environment (was "confirm on the Mac mini")
| Precondition | Answer | Evidence |
|---|---|---|
| Frontend generation | **Remix / React Router 7**, `remix-flat-routes` (no manifest) | `apps/remix/app/routes.ts` |
| Storage transport | **Database** (`DocumentDataType.BYTES_64`, base64) — NOT S3 | `packages/lib/universal/upload/put-file.server.ts:76`; deploy `.env` sets no S3 keys |
| Auth/session lib | Custom **oslo**, Hono signed cookies (`__Secure-sessionId`) | `packages/auth/server/lib/session/*` |
| Folders/Envelopes | **Yes** — `Folder` + `Envelope` models exist | `packages/prisma/schema.prisma` |
| Mutation convention | tRPC for authed; public routes use Prisma-in-loader + Remix actions | `packages/trpc`, `_unauthenticated+/organisation.decline.$token.tsx` |

## Biggest structural delta: Envelope generation
The harvest docs assume **old Documenso** (flat `Document` + `DocumentData`-on-Document, "create
Document from Template"). This checkout is the **Envelope generation**:
`Envelope (type DOCUMENT|TEMPLATE) → EnvelopeItem → DocumentData`; signers are `Recipient`s on an
Envelope; teams live under an `Organisation`; a `Folder` model groups envelopes. Every "Document/
Template" noun in PLAN/SPEC/HARVEST-MAP = an **Envelope**. Logic survives; nouns + a few types change.

## Locked architecture decisions (this session)
- **Public portal `/a/:slug` = Remix loader + actions** (not tRPC). Loader returns join-view vs portal
  by reading our participant cookie; actions handle join / sign-in / upload (clean cookie-setting +
  multipart). Matches the kit's `useActionState`+`FormData` components and Documenso's own public-route
  pattern.
- **Admin = a new tRPC router** `application` (`authenticatedProcedure`, gives `ctx.user`+`ctx.teamId`),
  registered in `packages/trpc/server/router.ts`. Admin route `/t/:teamUrl/applications`.
- **Grouping = dedicated models + a Documenso `Folder` per application** so generated signing envelopes
  are visibly grouped in the admin Documents UI.

## Corrected data model (Prisma — `packages/prisma/schema.prisma`)
Key corrections vs `PLAN.md`:
- `applicantTemplateId` / `cosignerTemplateId` are **`String?`** (Envelope `secondaryId`), NOT `Int`.
- Add **`ownerUserId Int`** + `folderId String?` to the application (doc provisioning must run as the
  team's Documenso user, since participants are not users; folder holds generated envelopes).
- `recipientIds Int[]` stays `Int` (`Recipient.id` is `Int`). `teamId Int` stays (`Team.id` is `Int`).
- Model name: **`RentalApplication`** (avoid colliding with generic "application").

```prisma
enum RentalApplicationStatus { OPEN IN_PROGRESS READY_FOR_REVIEW SUBMITTED APPROVED DENIED WITHDRAWN }
enum ParticipantRole         { APPLICANT COSIGNER }
enum ChecklistItemType       { ID INCOME CREDIT_REPORT PROOF_OF_DEPOSIT OTHER }
enum ChecklistItemStatus     { PENDING UPLOADED APPROVED REJECTED }

model RentalApplication {
  id                  String  @id @default(cuid())
  teamId              Int                          // Documenso Team
  ownerUserId         Int                          // acts as the user for envelope provisioning
  folderId            String?                      // Documenso Folder grouping generated envelopes
  slug                String  @unique              // nanoid(8) — the one share link
  title               String?
  unitAddress         String?
  rent                Decimal?
  moveInDate          DateTime?
  status              RentalApplicationStatus @default(OPEN)
  applicantTemplateId String?                      // Envelope.secondaryId (type=TEMPLATE)
  cosignerTemplateId  String?
  participants        ApplicationParticipant[]
  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt
  @@index([teamId])
}

model ApplicationParticipant {
  id            String @id @default(cuid())
  accessToken   String @unique @default(cuid())   // portal link / cookie bearer (NOT the db id)
  applicationId String
  application   RentalApplication @relation(fields: [applicationId], references: [id], onDelete: Cascade)
  role          ParticipantRole
  isStudent     Boolean @default(false)
  linkedToId    String?
  linkedTo      ApplicationParticipant?  @relation("CosignerLink", fields: [linkedToId], references: [id])
  cosigners     ApplicationParticipant[] @relation("CosignerLink")
  name          String
  email         String
  phone         String
  recipientIds  Int[]  @default([])               // Documenso Recipient ids for this person
  checklist     ChecklistItem[]
  createdAt     DateTime @default(now())
  @@unique([applicationId, email])
  @@index([applicationId])
}

model ChecklistItem {
  id             String @id @default(cuid())
  participantId  String
  participant    ApplicationParticipant @relation(fields: [participantId], references: [id], onDelete: Cascade)
  type           ChecklistItemType
  label          String?
  status         ChecklistItemStatus @default(PENDING)
  documentDataId String?                           // REUSE Documenso storage (DocumentData)
  notes          String?
  createdAt      DateTime @default(now())
  @@index([participantId])
}
```

## Integration seam (Phase 2) — Envelope-era services
- Create signable doc from a role template:
  `createDocumentFromTemplate({ id: { secondaryId }, userId: ownerUserId, teamId, folderId,
  recipients: [{ id: templateRecipientId, email, name }], requestMetadata })`
  → returns an Envelope with `recipients[].token`. (`packages/lib/server-only/template/create-document-from-template.ts`)
- Make tokens live WITHOUT email (manual-share decision):
  `sendDocument({ id, userId: ownerUserId, teamId, sendEmail: false, requestMetadata })`
  (`packages/lib/server-only/document/send-document.ts`)
- Signing URL: `/sign/:token` (route `_recipient+/sign.$token+`). Signed = `recipient.signingStatus === 'SIGNED'`.
- Store created `recipient.id`s on `ApplicationParticipant.recipientIds`.

## Storage (Phase 1) — database transport, no signed URLs
- Upload: `putFileServerSide(file) → {type,data}` → `createDocumentData({type,data})` → save
  `documentData.id` on the `ChecklistItem`. (`packages/lib/universal/upload/*`,
  `packages/lib/server-only/document-data/create-document-data.ts`)
- Serve: NO signed URLs. Stream via `getFileServerSide({type,data})` → `c.body(Uint8Array)` in a Hono
  route that filters by the participant's `accessToken` cookie. Pattern: `apps/remix/server/api/files/files.ts`.
- Validate ext + mime; 10 MB cap (app-doc constant) or reuse `APP_DOCUMENT_UPLOAD_SIZE_LIMIT` (50 MB).

## Cookies / identity — no `next/headers`
- Signed participant cookie carrying `accessToken`, set from a Remix action via React Router
  `createCookie('rental_participant', { httpOnly, secure(prod), sameSite:'lax', path:'/a', maxAge:1y })`
  `.serialize(token)` → `Set-Cookie`. Pattern: `packages/auth/server/lib/session/lang-cookie.server.ts`
  + `apps/remix/app/routes/api+/locale.tsx`.
- Entirely separate from `getOptionalSession` (Documenso owner). Sign-in = email+phone match, generic
  not-found.

## i18n LANDMINE (memory: documenso-deploy)
Author strings with `<Trans>` / ``msg`…` ``, then **hand-add** `msgid/msgstr` to
`packages/lib/translations/en/web.po` and run **`npm run translate:compile`**. **Never** run
`lingui extract` — it clobbers the hand-edited en catalog. (This is how commits #1/#2 added strings.)

## Libs / deps
- `pdf-lib` → repo uses **`@cantoo/pdf-lib`** (already in `apps/remix`); packet merge ports 1:1.
- **`heic2any` must be added** to `apps/remix/package.json` (dynamic-imported by `file-utils.ts`).
- UI: `@base-ui/react` → `@documenso/ui/primitives/*` (Button/Card/Badge/Input/Label/Checkbox/Select all
  exist; reuse `DocumentDropzone` for the upload card). Watch `Checkbox.onCheckedChange` (CheckedState),
  `Select.onValueChange`.

## Phase 1 file plan (skeleton, no signing)
```
packages/prisma/schema.prisma                         + models/enums above → migrate
packages/lib/server-only/rental/                      generateChecklist(), requiredChecklist(),
                                                      getParticipantProgress()  (port progress/checklist)
packages/trpc/server/application-router/router.ts     admin: create/list app, set role templates
  + register in packages/trpc/server/router.ts
apps/remix/app/routes/_authenticated+/t.$teamUrl+/applications._index.tsx   admin list + create → slug
apps/remix/app/routes/a.$slug.tsx                     public loader(cookie?portal:join) + actions
apps/remix/app/components/rental/{group-landing,portal-view,checklist-card,portal-banner-header}.tsx
apps/remix/server/api/...rental-files                 Hono download route, scoped by accessToken
apps/remix/app/components/rental/file-utils.ts        HEIC→JPEG (client)
apps/remix/package.json                               + heic2any
packages/lib/translations/en/web.po                   hand-add strings → translate:compile
```

## Phase 1 status (built 2026-06-19)
DONE & type-clean (`apps/remix` `tsc` → 0 errors, biome clean on all new files):
- Schema: `RentalApplication` / `ApplicationParticipant` / `ChecklistItem` + enums (scalar FKs, no core
  edits). `prisma format` + `generate` pass. **Migration NOT applied** — no DB wired to this checkout;
  run `prisma migrate dev --name add_rental_application` (from repo root, with `node_modules/.bin` on
  PATH for the kysely generator) when a DB is available.
- Lib: `packages/lib/server-only/rental/` — checklist rules, progress, create/find application,
  get-by-slug, join, sign-in, get-portal-data, upload, get-checklist-item-file.
- tRPC: `application-router` (getApplications / createApplication) registered in `router.ts`.
- Routes: admin `_authenticated+/t.$teamUrl+/applications._index.tsx`; public `a.$slug.tsx`
  (loader + join/signin/upload actions); scoped download `a.$slug_.files.$checklistItemId.tsx`.
- Components: `apps/remix/app/components/rental/` (group-landing, portal-view, checklist-card,
  portal-banner-header, file-utils) using `useFetcher`. `heic2any` added to apps/remix deps.
- Cookie: `app/storage/rental-participant.server.ts` (signed-path `/a`, `{slug:accessToken}` map).
- i18n: module uses PLAIN English strings (no `<Trans>`/`msg`) → zero catalog edits, sidesteps the
  no-extract landmine.

Remaining before it runs end-to-end: apply the migration against a dev/prod DB, then smoke-test
(`npm run dev` in apps/remix) per the verification list. Then Phase 2 (signing seam + packet).

## Definition of done (Phase 1)
Schema migrated; admin creates an application (gets slug + a Folder); a stranger joins via the link as
applicant (student/non-student) or co-signer (amber "hold tight" when no applicant yet), gets the right
checklist, uploads a phone HEIC + a PDF (stored in DocumentData, status flips), sees a progress bar, can
view their own uploads, is cookie-recognized on return, and **cannot** reach anyone else's files.
Signing wiring is Phase 2.

## Phase 2 status (built + refined 2026-06-19, type-clean + biome-clean)
DONE on `feat/rental-application-phase-1`. Refined in a second pass to match PADS / make every choice
defensible (see `session-reports/2026-06-19-rental-phase-2-refinements.md`). **One new migration:**
`20260619230000_add_rental_packet` (adds `ApplicationParticipant.packetDataId` + `packetGeneratedAt`).
- **Provisioning** `ensure-participant-forms.ts` — idempotent. `ensureParticipantForms({participantId})`
  builds the role template's envelope via `createDocumentFromTemplate({ id:{type:'envelopeId',id},
  userId:ownerUserId, teamId, folderId, recipients:[{id:<the single template recipient>, name, email}] })`
  then `sendDocument({ sendEmail:false })`, stores the participant's recipient id(s) with a conditional
  `updateMany` (recipientIds isEmpty). **Single-signer is now enforced** (not assumed): provisioning
  skips templates with ≠1 recipient. **Send-failure rollback**: if `sendDocument` throws, the just-made
  envelope is deleted + the error re-thrown, so failures don't stack orphan drafts. Runs at **join**
  (the natural write point, best-effort), as a **portal-load fallback** (try/catch — never 500s), and via
  the admin **Sync forms** button (`ensureApplicationForms`).
- **Template id storage**: store the Documenso template *envelope id* (`envelope_…`, from
  `trpc.template.findTemplates → data[].envelopeId`) in `applicantTemplateId`/`cosignerTemplateId`,
  passed as `{type:'envelopeId', id}` (services take `EnvelopeIdOptions`, not a bare secondaryId).
- **Set templates** `set-application-templates.ts` + tRPC `setApplicationTemplates` — validates each id
  is a TEMPLATE in the caller's team **with exactly one recipient** (loud error otherwise). tRPC
  `syncApplicationForms` → `ensureApplicationForms`. tRPC `generateApplicantPacket` → stored packet.
- **Portal forms** `get-portal-data.ts` — provisions (fallback) + resolves recipients to
  `{token,title,signed}`, feeds `{signed,total}` into progress. **Hides admin-only checklist types**
  (CREDIT_REPORT/PROOF_OF_DEPOSIT) from the tenant. `portal-view.tsx` renders "Forms to Sign" + `/sign/:token`.
- **Admin** `get-rental-application.ts` returns template ids, per-participant `forms`, `adminDocs`
  (credit/deposit state), `packetGeneratedAt`, and form-aware progress (tenant docs only).
  `applications.$id.tsx` = *Signing forms* card + **Generate/Regenerate/Download packet** (with
  generated-at + PADS-style skipped-files box) + **Admin uploads** (credit report / proof of deposit) via
  a Remix `action` (multipart) → `uploadAdminChecklistFile`.
- **Admin docs** `upload-admin-checklist-file.ts` — admin-only upload (ports PADS `uploadAdminDoc`):
  upserts a CREDIT_REPORT/PROOF_OF_DEPOSIT checklist item on the applicant (team-scoped). These feed the
  packet (by type) but are hidden from the tenant portal (`ADMIN_ONLY_CHECKLIST_TYPES` in `checklist.ts`).
- **Packet** `build-applicant-packet.ts` (bytes + skipped) + `generate-applicant-packet.ts` (**stores**
  the merged PDF as DocumentData → `packetDataId`/`packetGeneratedAt`; regenerate swaps + deletes the old
  one) + `get-applicant-packet-file.ts` (download serves the *stored* file). Merges COMPLETED signed
  envelopes + checklist docs (ID / income-unless-student / co-signers' forms+ID+income / credit / deposit),
  PDFs copyPages, images centered on Letter; unreadable files **and** not-yet-signed forms reported in
  `skipped`. Verified: `Envelope.status===COMPLETED` ⟹ the seal job has written the **signed** PDF
  (`seal-document.handler.ts` sets status COMPLETED only after repointing documentData), so packets carry
  signed forms, never blanks.

Known limits (audit): a just-signed form shows "Signed" in the portal immediately but is excluded from the
packet until the async seal job finishes (seconds → regenerate). Each form = 1 Documenso "document" against
org limits (irrelevant on self-host). A double-simultaneous portal load for a participant provisioned out
of order could still create one orphan (narrow; join-time provisioning shrinks the window).

LANDMINE carried forward: a clean `npm ci` installs `@ai-sdk/google-vertex@3.0.81`, whose type dropped
`apiKey` — so `ai/google.ts:8` (`createVertex({…, apiKey})`) is a **pre-existing, unrelated** tsc error
(Vertex ignores apiKey; that's the Gemini provider's option). Left untouched. All rental code is type-clean.

## Definition of done (Phase 2)
Admin attaches a single-signer Documenso template per role; a joiner (or an already-joined participant on
next portal load, or everyone via "Sync forms") gets a signing envelope in the app's Folder with a live
`/sign/:token` and no email; the portal shows "Forms to Sign" (Sign/Signed) + a docs+forms progress bar
(admin-only docs hidden); admin sees each participant's signed/awaiting status, uploads credit report +
proof of deposit, then **Generate packet** → a stored merged PDF (signed forms + supporting docs,
co-signers folded in) downloaded per applicant, with skipped items surfaced. **Migration applied + not yet
smoke-tested against a live DB/template** — needs a real one-signer Documenso TEMPLATE, then the
end-to-end walk-through in the session report.

## Post-Phase-2 status (2026-06-20) — see `session-reports/2026-06-20-rental-deal-terms-mapping-handoff.md`
SHIPPED + DEPLOYED (live image `d2d94f5de596`): **deal terms + prefill + calendars + split address**, and a
**`date-fns` prod-crash fix** (react-day-picker's peer dep was pruned by `npm ci --only=production` → boot
crash once a rental route SSR'd the calendar; now declared as an `apps/remix` dep — **smoke-boot the image
before deploying**).

## DONE + MERGED to `main` (2026-06-20) — see `session-reports/2026-06-20-rental-fieldmap-pads-controls-merge.md`
Field-mapping **tRPC + UI** (the per-template dropdown mapping), **PADS controls** (remove participant/group,
edit student⇄non-student type), tenant **"Back to your application"** on the signing-complete page (Share
hidden for rental signers), **start.sh** inline-cert recognition, **calendar dropdown colors**, field-mapping
**collapsed** behind a disclosure, and **compact MM/DD/YYYY** prefill dates. **CHECK-3 confirmed**: read-only
prefilled TEXT values render in the SEALED PDF. Deployed + live-verified; `feat/rental-application-phase-1`
fast-forwarded into `main` and deleted. Migrations `add_rental_template_field_map` + `add_first_month_rent`
applied on the live DB.

## 2026-06-22 — two feature branches off `main`, neither merged yet (see `session-reports/2026-06-22-*.md`)
- **`feat/rental-additional-documents`** (DEPLOYED, Jared testing): add-extra-documents-on-demand, dropped
  redundant Lease-start date, re-issue a signed form, **saving auto-applies** (no more Generate/refresh
  button), whole-dollar amounts (no cents), **US `MM/dd/yyyy` date format** on envelopes (Documenso DATE
  fields were day-first), and signing-page **Return → tenant portal** (not admin login).
- **`feat/rental-phase-3-multi-signer`** (BUILT, PARKED): shared multi-signer roommate signing — one doc all
  applicant roommates sign (parallel, up to 6 slots), opt-in per app. Not tested. Needs a rebase + the
  leaseStartDate-removal and date-format-override applied before testing.

NEXT (priority order):
1. **Finish testing + merge `feat/rental-additional-documents` → `main`**, then delete the branch. (Immediate.)
2. **Un-park Phase 3** when Jared wants multi-signer: rebase onto merged `main`, apply the leaseStartDate
   removal + `override.dateFormat = RENTAL_DOCUMENT_DATE_FORMAT` to its shared provisioner, build a 1–6
   tenant-slot template (deal-term fields on Tenant 1), then test.
3. **Further PADS-parity gaps / UX** as they surface (e.g. collapse the per-person action row into a "⋯" menu).
