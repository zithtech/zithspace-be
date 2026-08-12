# Opening Management

Enterprise job-opening (requisition) module for the HRMS. Pure **raw SQL** — no
Prisma. Its tables are prefixed `om_` and live outside `schema.prisma`.

The legacy Prisma model `OpeningManagement` (`opening_managements`) and its
`/api/opening-management` routes are **untouched**; this module creates its own
tables and mounts separately, so the two can run side by side during migration.

| | |
|---|---|
| Mount point | `/api/v2/openings` |
| Table prefix | `om_` |
| Migrations | `src/modules/opening-management/db/migrations/*.sql` |
| Run migrations | `npm run om:migrate` (also runs automatically at app startup) |
| Permissions | `opening.create` / `opening.read` / `opening.update` / `opening.delete` |

## Layout

```
db/            pool.ts (withTenant), migrate.ts, migrations/*.sql
types/         domain types + OpeningError
validators/    zod schemas (request shape)
repositories/  raw SQL only — parameterized queries + row mapping
services/      business rules + transaction boundary
controllers/   HTTP: parse → service → respond
routes/        router + per-action permission gates
```

Every data operation goes through `withTenant(tenantId, fn)`, which opens a
transaction and sets `app.current_tenant_id` transaction-locally. Repositories
**also** filter `tenant_id = $1` explicitly — see "Tenant isolation" below for
why that second filter is the one that actually matters today.

## Phase status

- [x] **Phase 1 — Create Opening**: linkage, job details, classification,
      recruiters, hiring team, required documents.
- [x] **Phase 2 — Approval workflow**: configurable chains, submit / approve /
      reject / skip / withdraw, per-approver queue, full audit trail.
- [x] **Phase 3 — Status lifecycle**: transition state machine, append-only
      timeline, hold/resume, board summary.
- [x] **Phase 4 — Posting lifecycle**: internal window, scheduled auto-move to
      external, posting history.
- [x] **Phase 5 — Candidate intake**: applications linking existing candidates
      to openings, ten intake channels, stage pipeline, funnel.
- [x] **Phase 6 — Hiring dashboard**: live funnel per opening, tenant summary,
      source effectiveness, stage velocity, recruiter load. No new tables.
- [x] **Phase 7 — Closing + archive**: closure reasons, reason-driven terminal
      status, auto-archive, ready-to-close queue.

All seven phases are implemented.

The `status` CHECK constraint already carries the full Phase 3 vocabulary
(`draft`, `pending_approval`, `approved`, `internal_posting`,
`external_posting`, `in_progress`, `on_hold`, `filled`, `cancelled`, `closed`)
so later phases add behaviour rather than schema churn. **Phase 1 only ever
writes `draft`** — status is not settable through create or update.

## Tables

| Table | Purpose |
|---|---|
| `om_openings` | The opening itself: linkage, job details, classification, status |
| `om_opening_recruiters` | Assigned recruiters; at most one primary per opening |
| `om_opening_hiring_team` | Hiring manager / technical panel / HR / client interviewers |
| `om_opening_documents` | Documents a candidate must supply (Resume, PAN, …) |
| `om_approval_workflows` | Phase 2 — tenant-level approval templates |
| `om_approval_workflow_steps` | Phase 2 — the ordered chain of a template |
| `om_opening_approvals` | Phase 2 — the per-opening approval snapshot + audit trail |
| `om_opening_status_history` | Phase 3 — append-only status timeline |
| `om_posting_settings` | Phase 4 — per-tenant window length + auto-move switch |
| `om_opening_postings` | Phase 4 — one row per posting event (the posting history) |
| `om_opening_applications` | Phase 5 — candidate ↔ opening, with source and stage |
| `om_application_stage_history` | Phase 5 — append-only stage timeline |

Phases 6 and 7 add no tables: the dashboard is pure aggregation, and closure is
one-to-one with the opening (columns on `om_openings`).

### ID types

`tenant_id`, `created_by`, `updated_by` are `uuid`. Ids pointing at **other
Prisma-owned tables** (`client_id`, `project_id`, `department_id`,
`hiring_manager_id`, …) are `text`, because Prisma stores `String` ids as text
and not all of them are uuids — `recruitment_client_basic_information.id` is a
cuid. `text` also lets the read queries `LEFT JOIN` those tables without a cast.

No foreign keys point into the Prisma schema. Existence of those ids is checked
in the service layer instead (`validateReferences`), which rejects an id that
does not exist *for the caller's tenant* with `400 BAD_REQUEST`.

## API

All routes require `resolveTenant` → `authenticateToken` → `requireAuth`, plus
the permission listed. Responses use the platform envelope:
`{ success: true, data }` or `{ success: false, error, code }`.

| Method | Path | Permission | Notes |
|---|---|---|---|
| `POST` | `/api/v2/openings` | `opening.create` | Creates in `draft`, auto-assigns `openingCode` |
| `GET` | `/api/v2/openings` | `opening.read` | Paginated + filterable list |
| `GET` | `/api/v2/openings/:id` | `opening.read` | Full detail incl. child collections |
| `PUT` | `/api/v2/openings/:id` | `opening.update` | Partial update |
| `DELETE` | `/api/v2/openings/:id` | `opening.delete` | Soft delete |
| `PUT` | `/api/v2/openings/:id/recruiters` | `opening.update` | Replaces the recruiter set |
| `PUT` | `/api/v2/openings/:id/hiring-team` | `opening.update` | Replaces the hiring team |
| `PUT` | `/api/v2/openings/:id/required-documents` | `opening.update` | Replaces the document list |

### Enumerations

| Field | Values |
|---|---|
| `employmentType` | `full_time`, `part_time`, `contract`, `internship`, `freelance` |
| `workMode` | `remote`, `hybrid`, `office` |
| `salaryPeriod` | `hourly`, `monthly`, `yearly` |
| `priority` | `low`, `medium`, `high`, `critical` |
| `hiringType` | `replacement`, `new_position`, `expansion`, `backfill` |
| `visibility` | `internal_only`, `external_only`, `both` |
| `memberType` (hiring team) | `hiring_manager`, `technical_panel`, `hr`, `client_interviewer` |

### `POST /api/v2/openings`

```jsonc
{
  // ── Linkage (all optional) ──
  "clientId": "cku…",              // recruitment client or clients_v2
  "projectId": "uuid",
  "departmentId": "uuid",
  "subDepartmentId": "uuid",
  "hiringManagerId": "uuid",       // users.id
  "employmentTypeId": "uuid",      // employment_types.id, optional master link
  "locationId": "uuid",            // company_locations.id
  "location": "Chennai, IN",

  // ── Required ──
  "employmentType": "full_time",
  "workMode": "hybrid",
  "jobTitle": "Senior Software Engineer",

  // ── Job details ──
  "numberOfPositions": 3,
  "jobDescription": "…",
  "responsibilities": "…",
  "requiredSkills": ["Node.js", "PostgreSQL"],
  "preferredSkills": ["Kubernetes"],
  "minExperience": 4,
  "maxExperience": 8,
  "education": "B.E / B.Tech",
  "certifications": ["AWS SAA"],
  "salaryMin": 1200000,
  "salaryMax": 1800000,
  "salaryCurrency": "INR",
  "salaryPeriod": "yearly",
  "budget": 5400000,
  "noticePeriodDays": 60,
  "shiftTiming": "10:00 - 19:00 IST",
  "joiningTimeline": "Within 30 days",
  "targetJoiningDate": "2026-09-15",   // YYYY-MM-DD

  // ── Classification ──
  "priority": "high",
  "hiringType": "new_position",
  "visibility": "both",

  // ── Child collections (optional) ──
  "recruiters": [
    { "recruiterId": "uuid", "isPrimary": true },
    { "recruiterId": "uuid" }
  ],
  "hiringTeam": [
    { "memberType": "hiring_manager", "memberId": "uuid" },
    { "memberType": "technical_panel", "memberId": "uuid" },
    { "memberType": "client_interviewer",
      "memberName": "Jane Doe", "memberEmail": "jane@client.com" }
  ],
  "requiredDocuments": [
    { "documentName": "Resume", "isMandatory": true },
    { "documentName": "PAN", "isMandatory": false, "notes": "For payroll" }
  ]
}
```

Returns `201` with the full opening detail, including the generated
`openingCode` (`OPN-00001`, per tenant) and `status: "draft"`.

Validation enforced before anything is written:

- `maxExperience >= minExperience`, `salaryMax >= salaryMin`
- at most one `isPrimary` recruiter, no duplicate recruiters
- no duplicate document names (case-insensitive)
- each hiring team member has either `memberId` (internal) or `memberName`
  (external client interviewer)
- every referenced id belongs to the caller's tenant

The same rules are re-checked in the database as `CHECK` constraints and partial
unique indexes, so they hold even for a write that bypasses this service.

### `GET /api/v2/openings`

Query parameters — all optional:

| Param | Notes |
|---|---|
| `page`, `pageSize` | default `1` / `20`, max page size `200` |
| `search` | matches opening code, job title or location |
| `status`, `priority`, `employmentType`, `workMode` | comma-separated, multi-value |
| `visibility`, `hiringType` | single value |
| `clientId`, `projectId`, `departmentId`, `subDepartmentId`, `hiringManagerId` | exact match |
| `recruiterId` | openings this recruiter is assigned to |
| `sortBy` | `createdAt` (default), `updatedAt`, `jobTitle`, `priority`, `numberOfPositions`, `openingCode` |
| `sortOrder` | `asc` / `desc` (default `desc`) |

`sortBy=priority` orders by urgency (`critical` → `low`), not alphabetically.

Response:

```jsonc
{
  "success": true,
  "data": {
    "items": [ { /* opening + resolved names + recruiters */ } ],
    "total": 42, "page": 1, "pageSize": 20, "totalPages": 3
  }
}
```

List rows carry their recruiters (fetched in one extra query, not one per row);
the heavier hiring-team and document sets are detail-only.

### Update semantics

`PUT /api/v2/openings/:id` is a **partial** update — send only what changed.
Range rules are re-evaluated against the *merged* record, so sending just
`salaryMin` still cannot push it past the stored `salaryMax`.

Child collections use **replace** semantics: include `recruiters` (or
`hiringTeam` / `requiredDocuments`) and the whole set is replaced with what you
sent; omit the key and the existing set is left alone. Send `[]` to clear.

## Phase 2 — approval workflow

```
draft ──submit──▶ pending_approval ──all steps approved──▶ approved
                        │
                        ├── reject   ──▶ draft   (round closed, note required)
                        └── withdraw ──▶ draft   (round cancelled)
```

Two layers, deliberately separate:

- **Config** — `om_approval_workflows` + `om_approval_workflow_steps`. Templates
  an admin maintains, e.g. Hiring Manager → HR → Finance (optional).
- **Runtime** — `om_opening_approvals`. On submit, the template's steps are
  **snapshotted** onto the opening and approver ids are **resolved once and
  frozen**. Editing the template afterwards, or changing the opening's hiring
  manager, cannot alter an approval already in flight.

Re-submitting after a rejection starts a new **round**. Old rounds are kept, so
the table is the complete audit trail of who decided what, when, and why.

### Step types

| `approverType` | Resolved at submit to |
|---|---|
| `hiring_manager` | the opening's `hiringManagerId` |
| `department_head` | `departments.head_id` for the opening's department |
| `role` | anyone currently holding `roleId` (e.g. the HR or Finance role) |
| `specific_user` | `specificUserId` |

Each step may carry a `fallbackUserId` (used when the primary approver cannot be
resolved), `isOptional` (Finance is the canonical case — skippable by an admin),
and `slaHours`. A step that resolves to nobody is a **400 at submit time**, not a
dead end discovered later by whoever is waiting on it.

If a tenant has configured no workflow, submission falls back to a single
implicit `hiring_manager` step.

### Endpoints

| Method | Path | Permission |
|---|---|---|
| `GET` | `/api/v2/openings/approval-workflows` | `opening.read` |
| `POST` | `/api/v2/openings/approval-workflows` | `opening.manage` |
| `GET` | `/api/v2/openings/approval-workflows/:workflowId` | `opening.read` |
| `PUT` | `/api/v2/openings/approval-workflows/:workflowId` | `opening.manage` |
| `DELETE` | `/api/v2/openings/approval-workflows/:workflowId` | `opening.manage` |
| `GET` | `/api/v2/openings/approvals/pending` | `opening.read` |
| `POST` | `/api/v2/openings/:id/submit` | `opening.update` |
| `POST` | `/api/v2/openings/:id/approve` | `opening.update` |
| `POST` | `/api/v2/openings/:id/reject` | `opening.update` |
| `POST` | `/api/v2/openings/:id/withdraw` | `opening.update` |
| `POST` | `/api/v2/openings/:id/skip-step` | `opening.manage` |
| `GET` | `/api/v2/openings/:id/approvals` | `opening.read` |

Creating a workflow:

```jsonc
{
  "name": "Standard Hiring Approval",
  "description": "HM → HR → Finance",
  "isDefault": true,
  "steps": [                                   // array order IS the step order
    { "stepName": "Hiring Manager Approval", "approverType": "hiring_manager", "slaHours": 24 },
    { "stepName": "HR Approval",      "approverType": "role", "roleId": "<uuid>", "slaHours": 48 },
    { "stepName": "Finance Approval", "approverType": "specific_user",
      "specificUserId": "<uuid>", "isOptional": true }
  ]
}
```

`POST /:id/submit` accepts an optional `{ "workflowId": "<uuid>" }` to override
the tenant default for that submission. `reject` **requires** a `note`;
`approve`, `skip-step` and `withdraw` take an optional one.

Every action returns the same envelope — the opening, the step that is now
waiting, and the trail grouped by round (newest first):

```jsonc
{
  "success": true,
  "data": {
    "opening":     { "status": "pending_approval", "approvalRound": 1, "submittedAt": "…" },
    "currentStep": { "stepName": "HR Approval", "approverType": "role", "status": "pending" },
    "rounds": [ { "round": 1, "steps": [ /* … */ ] } ]
  }
}
```

### Who may decide

The route gate is coarse (`opening.update` = "may take part in an approval").
*Which* step you may decide is a business rule, enforced in the service against
the frozen snapshot: you must be the named approver, the step's fallback, or a
current holder of the step's role. Holders of `opening.manage` (and
`admin` / `super_admin`) may act on any step — those decisions are flagged
`decidedAsAdmin: true` in the trail.

Two more rules worth knowing:

- **An opening awaiting approval cannot be edited** (`409`). Withdraw it first —
  approvers decided on the content in front of them.
- **Only the lowest-numbered pending step of the current round is actionable**,
  so nothing appears in an approver's queue before its turn.
- Self-approval is *allowed*: the hiring manager is usually also the requester,
  and blocking it would deadlock the common case.

## Phase 3 — status lifecycle

```
draft ─▶ pending_approval ─▶ approved ─┬─▶ internal_posting ─▶ external_posting ─┐
                                       └─────────────────────────────────────────┼─▶ in_progress
                                                                                 │        │
   on_hold ◀── parks any active status, resumes to where it came from ───────────┘        ▼
                                                                                       filled ─▶ closed
   cancelled / closed are terminal — reopening is admin-only.
```

The ten statuses shipped in migration 001; Phase 3 adds the **rules of movement**
and the record of it.

### Where the rules live

`services/statusMachine.ts` — a plain data table, no I/O. Legality is not a
database CHECK because it depends on the actor's permissions and on which phase
owns the move; the database still guarantees the status *value* is one of the
ten. Each transition can be marked:

- `requiresNote` — a note is mandatory (holds, cancellations, closures)
- `requiresManage` — needs `opening.manage` (reopening a closed/cancelled/filled
  opening, undoing an approval)
- `ownedBy: 'approval'` — **not reachable via `POST /:id/status`**. Submitting and
  approving have their own endpoints; routing them through a status change would
  walk straight past the approval chain.

### One timeline

`om_opening_status_history` is append-only and records **every** move, including
the ones made by the Phase 2 approval engine (`submitted_for_approval`,
`approval_completed`, `approval_rejected`, `approval_withdrawn`) and by opening
creation. An opening has one history, not one story in approvals and another in
status. Corrections are new rows — never update or delete one.

Rows are ordered by `seq` (a monotonic bigint), **not** `changed_at`: rows
written in the same transaction share `now()` exactly, and a uuid tiebreaker
scrambles the one thing an audit trail must get right.

### Endpoints

| Method | Path | Permission |
|---|---|---|
| `GET` | `/api/v2/openings/status-catalog` | `opening.read` |
| `GET` | `/api/v2/openings/status-summary` | `opening.read` |
| `GET` | `/api/v2/openings/:id/status` | `opening.read` |
| `GET` | `/api/v2/openings/:id/status-history` | `opening.read` |
| `POST` | `/api/v2/openings/:id/status` | `opening.update` |
| `POST` | `/api/v2/openings/:id/hold` | `opening.update` |
| `POST` | `/api/v2/openings/:id/resume` | `opening.update` |

`POST /:id/status` takes `{ "status": "internal_posting", "reason": "...", "note": "..." }`.
`GET /:id/status` returns the current status plus **`allowedTransitions`** —
already filtered by the caller's permissions, so a UI can render it directly as
buttons instead of duplicating the state machine:

```jsonc
{
  "status": "on_hold",
  "statusNote": "Budget freeze",
  "allowedTransitions": [
    { "to": "in_progress", "label": "Resume interviewing", "requiresNote": false, "requiresManage": false },
    { "to": "cancelled",   "label": "Cancel opening",      "requiresNote": true,  "requiresManage": false }
  ],
  "history": [ /* newest first */ ]
}
```

`POST /:id/resume` returns the opening to whatever it was doing before the hold,
read from the timeline rather than a denormalised column — so it stays correct
across repeated hold/resume cycles.

### Side effects

- Moving to `closed` / `cancelled` stamps `closed_at`; reopening clears it, so a
  later close records the new date rather than a stale one.
- Cancelling while `pending_approval` closes the outstanding approval steps as
  `cancelled`, instead of leaving them pending forever.
- Every transition is a compare-and-set (`WHERE status = <expected>`), so two
  people moving the same opening at once produce one winner and one clean 409.

## Phase 4 — posting lifecycle

```
approved ──post internally──▶ internal_posting ──[N days elapse]──▶ external_posting
                                     │                  ▲
                                     └── publish externally by hand ┘
```

`om_opening_postings` holds one row per posting EVENT — an opening posted
internally, auto-moved, then re-posted has three rows. It is the **source of
truth**; `om_openings.internal_posting_ends_at` is a denormalised copy so list
views can show "3 days left" without a join, written in the same transaction and
never on its own.

Posting is a status transition *plus* a posting record, always in one
transaction. The transition goes through the Phase 3 state machine
(`performTransition`), so posting can never disagree with status about what is
legal.

### The auto-move

`jobs/postingAutoMove.ts` — plain node-cron, hourly, matching the platform's
other schedulers. No Redis: the sweep is a short indexed scan.

It runs in two stages, because a cron tick has no tenant context: one
cross-tenant read for the due ids, then **one `withTenant` transaction per
opening**. One bad row therefore cannot roll back the others, and a row another
process already handled simply fails its compare-and-set and is skipped. The
sweep is idempotent — safe to run as often as you like.

Three levels of off switch, narrowest first:

| Scope | How |
|---|---|
| One posting | `autoMove: false` when posting internally |
| One tenant | `autoMoveToExternal: false` in posting settings |
| Whole deployment | `OPENING_AUTO_MOVE_ENABLED=false` |

Schedule override: `OPENING_AUTO_MOVE_CRON` (default `0 * * * *`).

Moves made by the job write `is_automated = true` on both the posting row and
the status-history row, so the timeline distinguishes machine moves from human
ones.

### Endpoints

| Method | Path | Permission |
|---|---|---|
| `GET` | `/api/v2/openings/posting-settings` | `opening.read` |
| `PUT` | `/api/v2/openings/posting-settings` | `opening.manage` |
| `POST` | `/api/v2/openings/postings/run-auto-move` | `opening.manage` |
| `GET` | `/api/v2/openings/:id/postings` | `opening.read` |
| `POST` | `/api/v2/openings/:id/postings/internal` | `opening.update` |
| `POST` | `/api/v2/openings/:id/postings/external` | `opening.update` |
| `POST` | `/api/v2/openings/:id/postings/:postingId/close` | `opening.update` |

```jsonc
// POST /:id/postings/internal — all fields optional
{
  "days": 15,        // defaults to the tenant setting
  "autoMove": true,  // defaults to the tenant setting
  "note": "IJP first, per policy"
}
```

Both values are **captured on the posting row** at this moment, so changing the
tenant defaults later cannot alter work already live.

`POST /postings/run-auto-move` triggers the sweep on demand — the behaviour can
be exercised without waiting for the tick. It returns
`{ scanned, moved, failed[] }`.

### Rules

- `visibility` is honoured: an `internal_only` opening is never auto-published
  externally (the sweep expires its window and leaves it), and an
  `external_only` one cannot be posted internally.
- One live posting per channel per opening (partial unique index). Re-posting
  internally is fine once the previous window is no longer `active`.
- An internal posting must have a window; an external one must not — both
  enforced by CHECK constraints.
- Reaching `filled` / `closed` / `cancelled` takes every live posting down
  automatically, from whichever endpoint drove the move.

## Phase 5 — candidate intake

The platform already had a rich `candidates` table (work history, skill matrix,
education, documents) but **nothing connecting a candidate to an opening**. Phase
5 adds exactly that join and nothing else: candidate master data is never
duplicated here, `candidate_id` points at the existing table, and the read
queries join to it for display.

That means **the candidate must exist before they can be added to an opening** —
create them through the existing candidate API first. Adding an unknown
`candidateId` returns 400 with that instruction rather than quietly creating a
half-populated second candidate store.

### Intake channels

`careers_page` · `employee_referral` · `internal_transfer` ·
`internal_job_posting` · `recruitment_agency` · `linkedin` · `naukri` ·
`indeed` · `manual_upload` · `campus_hiring` · `other`

`sourceDetail` carries what the channel alone does not — agency name, campus,
board campaign, or what "other" means. Two rules are enforced in both zod and a
CHECK constraint: `employee_referral` requires `referredBy`, and `other` requires
`sourceDetail`.

`GET /intake-catalog` returns the channels and stages with display labels, so
dropdowns are not hard-coded in the frontend.

### Pipeline stages

`applied` → `screening` → `shortlisted` → `interview` → `offer` → `hired`,
plus `rejected`, `withdrawn`, `on_hold`.

**Stage order is not enforced.** Real recruiting skips steps — a referral can go
straight to offer — and doubles back. What *is* enforced: you cannot move out of
`hired`, `rejected` or `withdrawn`, because "hired then rejected" is not a
correction, it is two different facts that deserve two applications.

Rejecting requires a `rejectionReason`. Every move is a compare-and-set, so two
recruiters acting at once produce one winner and one clean 409.

### Endpoints

| Method | Path | Permission |
|---|---|---|
| `GET` | `/api/v2/openings/intake-catalog` | `opening.read` |
| `GET` | `/api/v2/openings/candidates/:candidateId/pipeline` | `opening.read` |
| `GET` | `/api/v2/openings/:id/applications` | `opening.read` |
| `GET` | `/api/v2/openings/:id/applications/funnel` | `opening.read` |
| `GET` | `/api/v2/openings/:id/applications/:applicationId` | `opening.read` |
| `POST` | `/api/v2/openings/:id/applications` | `opening.update` |
| `PUT` | `/api/v2/openings/:id/applications/:applicationId` | `opening.update` |
| `POST` | `/api/v2/openings/:id/applications/:applicationId/stage` | `opening.update` |
| `DELETE` | `/api/v2/openings/:id/applications/:applicationId` | `opening.update` |

```jsonc
// POST /:id/applications
{
  "candidateId": "uuid",              // must already exist in `candidates`
  "source": "employee_referral",
  "referredBy": "uuid",               // required for referrals
  "sourceDetail": "IIT Madras",       // agency / campus / board / "other"
  "resumeUrl": "https://…",           // the CV submitted for THIS opening
  "notes": "Strong systems background",
  "stage": "applied"                  // lets a bulk import land mid-pipeline
}
```

List supports `?page`, `?pageSize`, `?stage=`, `?source=` (both comma-separated)
and `?search=` over candidate name and email.

### The funnel

`GET /:id/applications/funnel` answers the Phase 6 dashboard directly:

```jsonc
{
  "openPositions": 5, "applications": 142, "screened": 85,
  "interview": 40, "offers": 8, "joined": 5, "rejected": 129,
  "byStage":  { "applied": 12, "interview": 6, "hired": 5 },
  "bySource": { "linkedin": 60, "employee_referral": 22 }
}
```

`screened` / `interview` / `offers` are **furthest-reached** counts, not live
ones: somebody holding an offer was screened and interviewed on the way, and a
dashboard that counted them only under "Offers" would make the earlier stages
look like they never happened. That is why the stage history exists — a live
`stage` column alone cannot answer it. `byStage` gives the live pipeline board.

### Two automatic effects

- The first candidate to reach `interview` moves the opening itself to
  `in_progress` — that status means "candidates are being interviewed", so
  leaving it in `*_posting` while interviews happen would be wrong. Best-effort:
  if the state machine will not allow it, the recruiter's action still succeeds.
- Reaching `hired` returns `positionsFilled: true` once hires ≥
  `numberOfPositions`, so the UI can prompt to close. The actual close is
  Phase 7's job — auto-closing here would be a surprise.

## Phase 6 — hiring dashboard

**No migration.** Phase 6 adds no tables, no columns and no counters — every
number is derived from what Phases 1–5 already store. A denormalised counter
that can drift is worse than a query that takes an extra millisecond: the
dashboard must agree with the pipeline the recruiter is looking at. If a very
large tenant ever makes these slow, the fix is a materialised view on a
refresh schedule, *not* counters maintained by application code.

### The one rule that shapes the SQL

**No N+1.** The dashboard shows a funnel per opening, and the obvious
implementation — list openings, then one funnel query each — turns a 25-row page
into 26 round trips. Every query computes its metric for the whole selection in a
single statement, using shared CTEs and `FILTER` aggregates.

### Endpoints

All read-only, all gated on `opening.read`, all taking the same filter set.

| Method | Path | Returns |
|---|---|---|
| `GET` | `/api/v2/openings/dashboard` | Everything below, in one request |
| `GET` | `/api/v2/openings/dashboard/summary` | Tenant-wide totals |
| `GET` | `/api/v2/openings/dashboard/openings` | One row per opening + funnel (paginated) |
| `GET` | `/api/v2/openings/dashboard/sources` | Which channels produce hires |
| `GET` | `/api/v2/openings/dashboard/velocity` | Mean days spent in each stage |
| `GET` | `/api/v2/openings/dashboard/recruiters` | Openings and outcomes per recruiter |

Shared filters: `status`, `priority`, `employmentType` (comma-separated),
`departmentId`, `clientId`, `projectId`, `hiringManagerId`, `recruiterId`,
`dateFrom`, `dateTo`, `search`, `includeClosed`. The list endpoint adds `page`,
`pageSize`, `sortBy` (`createdAt` · `applications` · `joined` · `openPositions` ·
`ageDays` · `jobTitle` · `priority`) and `sortOrder`.

`GET /dashboard` exists because the panels share a filter: fetching them together
also guarantees they are consistent with each other, where four separate requests
could straddle a pipeline change and show numbers that do not add up.

**Cancelled and closed openings are excluded by default** — a hiring dashboard is
about work in flight. Pass `includeClosed=true` for historical reporting.

### The spec's example, as returned

```jsonc
// GET /api/v2/openings/dashboard/openings
{
  "openingCode": "OPN-00001",
  "jobTitle": "Software Engineer",
  "openPositions": 5,        "remainingPositions": 2,
  "applications": 142,       "screened": 85,
  "interview": 40,           "offers": 8,
  "joined": 5,               "rejected": 129,
  "withdrawn": 3,
  "ageDays": 60,             "daysSincePosted": 50,
  "avgDaysToHire": 22
}
```

### What the numbers mean

- **screened / interview / offers are furthest-reached counts**, not live ones.
  Somebody holding an offer was screened and interviewed on the way; counting
  them only under "Offers" would make the earlier stages look like they never
  happened. This is what the stage history is for — a live `stage` column cannot
  answer it.
- **avgDaysToHire** is measured from `applied_at` to the moment the application
  *entered* `hired`, read from the history rather than the live row (a later edit
  would move `stage_changed_at`).
- **stage velocity excludes applications still sitting in a stage.** You cannot
  average a duration that has not finished, and counting them as "0 days" would
  flatter the numbers badly. `transitions` says how many were actually timed.
- **offerAcceptanceRate** is joined ÷ offers, over everyone who reached an offer.
- **remainingPositions** is `numberOfPositions − joined`, floored at zero.

## Phase 7 — closing and archiving

```
all positions filled ──▶ close with a reason ──▶ auto-archive
```

No new table: closure is one-to-one with the opening, so a side table would only
add a join to every read. Migration 007 adds `closure_reason`, `closure_note`,
`closed_by`, `duplicate_of_opening_id`, `is_archived`, `archived_at`,
`archived_by` to `om_openings`.

### The reason decides the status

The caller picks a reason, not a reason *and* a status — otherwise nothing stops
"closed because cancelled".

| Reason | Terminal status |
|---|---|
| `position_filled` | `closed` |
| `cancelled` | `cancelled` |
| `budget_issue` | `cancelled` |
| `client_cancelled` | `cancelled` |
| `duplicate_opening` | `cancelled` (and must link the original) |

The move still goes through the Phase 3 state machine, so an illegal close — a
draft "closed because position filled" — is refused with the same message as any
other bad transition.

### Endpoints

| Method | Path | Permission |
|---|---|---|
| `GET` | `/api/v2/openings/closure-reasons` | `opening.read` |
| `GET` | `/api/v2/openings/closure-candidates` | `opening.read` |
| `POST` | `/api/v2/openings/:id/close` | `opening.update` |
| `POST` | `/api/v2/openings/:id/archive` | `opening.update` |
| `POST` | `/api/v2/openings/:id/unarchive` | `opening.manage` |

```jsonc
// POST /:id/close
{
  "closureReason": "position_filled",
  "note": "All 5 roles filled",
  "archive": true,            // the spec's auto-archive; opt out with false
  "rejectRemaining": false    // bulk-reject whoever is still in the pipeline
}
```

Returns what actually happened — the terminal status, whether it archived, how
many live postings came down, how many candidates were still in play, and how
many of those were rejected.

### Deliberate choices

- **Closing is not automatic.** `GET /closure-candidates` surfaces openings whose
  hires have met `numberOfPositions` and lets a person decide. A background job
  silently closing openings — cutting off candidates mid-interview — would be a
  nasty surprise, so the spec's "when all positions are filled" is a prompt, not
  a trigger. Phase 5's stage change already returns `positionsFilled: true` for
  the same purpose.
- **`rejectRemaining` defaults to false.** Rejecting candidates is a real
  decision with real consequences, not a side effect someone should get without
  asking. When it is on, the stage history records each candidate's *original*
  stage, so the trail reads `interview → rejected`, not `rejected → rejected`.
- **Closing with fewer hires than positions is allowed.** Partial fills are
  normal — the honest move is to record `budget_issue` rather than block the
  close and force a fiction.
- **Archiving requires a finished opening** (`closed` / `cancelled` / `filled`).
  Archiving live work would hide it from the people doing it.
- **Un-archiving does not reopen.** It returns the opening to the list; changing
  status is Phase 3's job, and conflating the two would let "unarchive" quietly
  restart recruitment.

### The archive and the working list

`GET /api/v2/openings` takes `archived=exclude|include|only`, defaulting to
**exclude** — finished work leaves the working list without being deleted.
`only` is the archive view. The dashboard already excludes terminal openings, so
it needs no separate flag.

## Operational notes

- **Opening codes** are derived from the current per-tenant maximum, so two
  simultaneous creates can pick the same one. `uq_om_openings_tenant_code`
  rejects the loser and `createOpening` retries (up to 3 attempts).
- **Soft delete** leaves child rows in place — they cascade only on a hard
  delete, so a restore is a single flag flip. A soft-deleted opening drops out
  of the approval queue automatically (the queue joins on `deleted_at IS NULL`).
- **Mixed id types in one query.** `user_roles.tenant_id` is `text` while every
  `om_*` `tenant_id` is `uuid`. Reusing the same `$n` for both makes Postgres
  infer one type and fail with `text = uuid` — compare column-to-column
  (`ur.tenant_id = a.tenant_id::text`) instead. Same trap for `$n` shared
  between `hiring_manager_id` (text) and `created_by` (uuid).
- **Untyped parameters inside `COALESCE` are inferred as `text`.** `COALESCE($2,
  $4)` against an `integer` column fails with a type error — cast them
  (`COALESCE($2::int, $4::int)`).
- **Migrations are forward-only.** The runner records each applied file and
  never re-runs it, so a schema change after the fact gets a NEW file (see
  `004_status_seq.sql`) rather than an edit to the one already applied.
- **Tenant isolation.** RLS policies are created and `FORCE`d exactly as in
  `leave-v2` / `payroll` / `reimbursement-v2`, but the app currently connects as
  the `postgres` role, which is a superuser with `BYPASSRLS` — so those policies
  do **not** fire today (verified against `zithspace_dev`). The explicit
  `tenant_id = $1` filter present in every repository query is the isolation
  that is actually load-bearing. Do not omit it. Making RLS a real second layer
  needs a non-superuser application role, which is a platform-wide change
  affecting all four raw-SQL modules.
