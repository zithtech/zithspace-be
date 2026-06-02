# Activity Log — Quick Guide

> **TL;DR** — Add `recordTransaction(...)` to your BE mutation. Add
> `useActivitySource(...)` to your FE page. Done. The `/activity` page picks
> it up automatically, with realtime updates.

---

## Add a new module in 3 steps

### Step 1 — declare it once

**File:** [`zithspace-be/src/utils/transactionHistory.ts`](../src/utils/transactionHistory.ts)

```ts
// Module
LEAVES: "Leaves",

// Page (one per logical FE view that triggers actions)
LEAVE_LIST: "LeaveList",
LEAVE_DETAIL: "LeaveDetail",

// EntityType (one per table)
LEAVE_REQUEST: "leave_request",
```

> Add new actions only if `create / update / delete / archive / restore / bulk_* / share`
> don't fit your verb.

### Step 2 — call it in your BE controller

```ts
import {
  recordTransaction, diffShallow,
  Section, Module, Page, Action, EntityType,
} from "@/utils/transactionHistory";

// CREATE
recordTransaction({
  req, section: Section.HR, module: Module.LEAVES, page: Page.LEAVE_LIST,
  action: Action.CREATE,
  actionLabel: "Leave request submitted",
  entityType: EntityType.LEAVE_REQUEST,
  entityId: leave.id,
  entityLabel: `${leave.type} · ${leave.days}d`,
  afterData: { type, days, from, to },
  statusCode: 201,
});

// UPDATE — use diffShallow
const diff = diffShallow(beforeSnap, afterSnap);
if (diff.changedFields.length > 0) {
  recordTransaction({
    req, section: Section.HR, module: Module.LEAVES, page: Page.LEAVE_DETAIL,
    action: Action.UPDATE,
    actionLabel: `Leave updated (${diff.changedFields.join(", ")})`,
    entityType: EntityType.LEAVE_REQUEST,
    entityId: id,
    entityLabel: `${existing.type} · ${existing.days}d`,
    beforeData: diff.before,
    afterData: diff.after,
    changedFields: diff.changedFields,
    statusCode: 200,
  });
}

// DELETE
recordTransaction({
  req, section: Section.HR, module: Module.LEAVES, page: Page.LEAVE_DETAIL,
  action: Action.DELETE,
  actionLabel: "Leave withdrawn",
  entityType: EntityType.LEAVE_REQUEST,
  entityId: id,
  entityLabel: `${leave.type} · ${leave.days}d`,
  beforeData: { isDeleted: false },
  afterData: { isDeleted: true },
  changedFields: ["isDeleted"],
  metadata: { softDelete: true },
  statusCode: 200,
});

// BULK — one row + correlationId
import { randomUUID } from "crypto";
recordTransaction({
  req, section: Section.HR, module: Module.LEAVES, page: Page.LEAVE_LIST,
  action: Action.BULK_UPDATE_STATUS,
  actionLabel: `Bulk approved (${result.count})`,
  entityType: EntityType.LEAVE_REQUEST,
  afterData: { status: "approved" },
  changedFields: ["status"],
  correlationId: randomUUID(),
  metadata: { targetIds: ids, updated: result.count },
  statusCode: 200,
});
```

### Step 3 — declare the source on the FE page

```tsx
// src/app/leaves/page.tsx
import { useActivitySource } from "@/hooks/useActivitySource";

export default function LeavesPage() {
  useActivitySource({ section: "HR", module: "Leaves", page: "LeaveList" });
  // ...rest of the component
}
```

**Why?** Same BE endpoint can be hit from multiple FE pages. The hook sends
`x-zspace-section / -module / -page` headers that override the controller's
defaults. No hook = controller defaults apply.

> Place the hook **before any conditional return** — React requires stable
> hook order.

✅ Done. Open `/activity`, do the action, watch it pop in within ~1s.

---

## What you get for free

| Concern | Handled by |
|---|---|
| Insert into the audit table | `recordTransaction` helper |
| PII scrub (`password`, `token`, `secret`, `apiKey`...) | helper, recursive |
| Tenant scoping | helper, from `req.tenantId` |
| Actor capture (id / email / name) | helper, from `req.user` |
| IP, user-agent, method, route pattern | helper, from `req` |
| Header overrides (FE source) | helper |
| Realtime emit `transaction:created` | helper, after insert |
| `/activity` page filter dropdowns | auto-driven by distinct values |
| Pagination, search, date filter, drawer | already built |
| FE diff rendering | `<ActivityDiff />` reads `changedFields` |

---

## `recordTransaction` cheat sheet

```ts
recordTransaction({
  req,                       // ← always pass this
  section, module,           // ← required
  page,                      // optional — a stable logical view name
  action,                    // ← required — "create" | "update" | "delete" | ...
  actionLabel,               // human row text e.g. "Leave approved"
  entityType, entityId,      // what was touched
  entityLabel,               // short display: "Annual · 3d"
  parentEntityType, parentEntityId, // optional hierarchy

  beforeData, afterData,     // pre/post snapshots (JSON, PII auto-scrubbed)
  changedFields,             // string[] — keys that actually differ

  statusCode,                // HTTP status
  correlationId,             // group bulk ops
  metadata,                  // free-form extras
  actorType,                 // "staff" (default) | "client_portal" | "system" | "api_key"
});
```

**Fire-and-forget.** Never throws. Logging failures never break the request.

---

## Add the drawer to a detail page (optional)

```tsx
import TransactionHistoryDrawer from "@/components/common/TransactionHistoryDrawer";

const [open, setOpen] = useState(false);
const { canReadActivityLog } = usePermission();

{canReadActivityLog && (
  <Button onClick={() => setOpen(true)}>History</Button>
)}
<TransactionHistoryDrawer
  open={open}
  onClose={() => setOpen(false)}
  entityType="leave_request"   // ← must match what the BE wrote
  entityId={leave.id}
  subtitle={`${leave.type} · ${leave.days}d`}
/>
```

---

## Rules (don't break these)

1. **Page names are stable logical IDs, never URL paths.** Routes can change.
2. **Same endpoint, multiple FE views?** Use `useActivitySource` on each FE page.
3. **Don't add a key to `changedFields` without values in `beforeData/afterData`** — UI shows `— → —`.
4. **Bulk ops = ONE row.** Use `correlationId` + `metadata.targetIds`. Don't loop and emit per item.
5. **Skip noisy mutations.** Content-autosave for example shouldn't log every keystroke — log only structural events (rename, delete, share).
6. **Don't log reads.** Only state-changing actions.
7. **PII never goes raw.** Helper scrubs known keys, but don't push entire `req.body` into `metadata` either.

---

## Files involved

### Backend

| File | What it is |
|---|---|
| [`src/utils/transactionHistory.ts`](../src/utils/transactionHistory.ts) | **Helper + taxonomy constants.** Where you add new Modules / Pages / Actions / EntityTypes. |
| [`src/controllers/transactionHistoryController.ts`](../src/controllers/transactionHistoryController.ts) | Read endpoints (`GET /api/transaction-history` + `/filters`). Touch this only if you add new query params. |
| [`src/routes/transactionHistory.ts`](../src/routes/transactionHistory.ts) | Route + permission middleware. |
| [`src/database/migrations/012_create_transaction_history.sql`](../src/database/migrations/012_create_transaction_history.sql) | Append-only table + indexes + UPDATE/DELETE blocking triggers. Already applied. |
| [`src/types/permissions.ts`](../src/types/permissions.ts) | `ACTIVITY_LOG_READ`, `ACTIVITY_LOG_READ_ALL`. |
| [`src/modules/rbac/rbac.service.ts`](../src/modules/rbac/rbac.service.ts) | Role default permission lists. Run `npm run db:seed-rbac` after changes. |

### Frontend

| File | What it is |
|---|---|
| [`src/hooks/useActivitySource.ts`](../../zithspace-fe/src/hooks/useActivitySource.ts) | **The one hook you'll call on every page.** Sets the FE source for header overrides. |
| [`src/lib/axios.ts`](../../zithspace-fe/src/lib/axios.ts) | Axios interceptor that forwards the activity-source as `x-zspace-*` headers. |
| [`src/services/transactionHistoryService.ts`](../../zithspace-fe/src/services/transactionHistoryService.ts) | API client (`list`, `listPaged`, `filters`). |
| [`src/hooks/useTransactionHistory.ts`](../../zithspace-fe/src/hooks/useTransactionHistory.ts) | Cursor pager (used by drawer). |
| [`src/hooks/useTransactionHistoryPaged.ts`](../../zithspace-fe/src/hooks/useTransactionHistoryPaged.ts) | Offset pager (used by `/activity`). |
| [`src/components/common/TransactionHistoryDrawer.tsx`](../../zithspace-fe/src/components/common/TransactionHistoryDrawer.tsx) | The reusable per-entity drawer — drop in on any detail page. |
| [`src/components/common/ActivityDiff.tsx`](../../zithspace-fe/src/components/common/ActivityDiff.tsx) | Renders field diffs. Extend `FIELD_LABEL` for pretty field names. |
| [`src/app/activity/page.tsx`](../../zithspace-fe/src/app/activity/page.tsx) | The global page. Don't change it when adding new modules. |
| [`src/types/permissions.ts`](../../zithspace-fe/src/types/permissions.ts) + [`src/hooks/usePermission.ts`](../../zithspace-fe/src/hooks/usePermission.ts) | FE permission mirrors. |
| [`src/providers/SocketProvider.tsx`](../../zithspace-fe/src/providers/SocketProvider.tsx) | The socket. Already used by `/activity` and the drawer for realtime. |

---

## What's already wired

> **FE source** = `useActivitySource` declared so mutations from that page
> attribute correctly. **Drawer** = `<TransactionHistoryDrawer />` mounted.

### Section: WORK

| Module | BE mutations | FE pages |
|---|---|---|
| **Tickets** (7) | create/update/delete, bulkUpdateStatus, bulkArchive, bulkDelete | TicketDetail (drawer) |
| **BugList** (35) | folders + sheets + bugs (CRUD + bulk + trash + verify/reopen + convert), severity & type options | Bug edit modal (drawer) |
| **Projects** (10) | createProject, updateProject (with team-member +/- diff), softDelete, restore, permanent delete, emptyTrash, bulk restore/delete, addTeamMember, removeTeamMember | `/projects/manage` (FE source) · `[projectId]/overview` (drawer) · `/projects/project-trash` (FE source) |
| **Sprints** (10) | release-plan CRUD, start/complete sprint, assign/remove tickets, sprint-completion bulkResolve + complete, AI narrative | Sprint detail drawer (drawer) |
| **Buckets** (8) | createBucket, updateBucket, deleteBucket, addBucketMember, removeBucketMember, assignTicketsToBucket, moveBucketToSprint, moveBucketToBacklog | `/projects/buckets/[bucketId]` (drawer) |
| **TicketSettings** (5) | updateWorkflowTemplate, createDropdownOption, updateDropdownOption, deleteDropdownOption, reorderDropdownOptions | — |
| **Trash** (5) | moveToTrash, restoreFromTrash, permanentlyDelete, emptyTrash, autoPurge (system actor) | `TrashManagementPage` (FE source) |
| **Archived** (1) | bulkUnarchive (recategorised from Tickets) | `/projects/archived` (FE source) |
| **DocumentHub** (14) | hub CRUD + share/revoke · tree-node create/update/move/delete/restore · document rename/delete/restore/share · history-entry delete | `/(documenthub)/documenthub` (FE source) · `DocumentWorkspace` (FE source) |

**Total: 95 mutations across 9 modules.**

DocumentHub specifics:
- Every tree-node / document row shows the parent hub name in the action label
  (e.g. `Document folder created in Project Documentation`)
- Hub + tree-node creation supports `source: "ai" | "manual"` — Zai-driven
  creates read `... via Zai`

---

## Permissions

| Permission | Granted to | Effect |
|---|---|---|
| `activity_log.read` | every user | drawer on detail pages |
| `activity_log.read_all` | super_admin + admin | top-nav icon + `/activity` page |

Run `npm run db:seed-rbac` after changing `Permissions` or role defaults.

---

## Realtime — already in place

You don't write socket code for new modules. The helper emits
`transaction:created` to the tenant room after every insert.

- **`/activity` page on page 1** → auto-refresh
- **`/activity` page on page 2+** → shows a "N new · jump to top" pill
- **Open drawer** → refresh when event's `entityType + entityId` matches

---

## Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| Nothing shows in `/activity` | Forgot to call `recordTransaction` · or the code path didn't run · or you're on page 2+ (look for the "N new" pill) |
| Row reads `field: — → —` | `changedFields` includes a key not present in `beforeData/afterData` — drop it or fill it |
| Wrong module / page in the row | Missing `useActivitySource` on the FE page — add it |
| 403 on `/activity` | User missing `activity_log.read_all` — seed RBAC or assign via the role UI |
| Realtime not firing | (a) `useSocket().connected === false` → check token / refresh; (b) different tenant; (c) `recordTransaction` was inside a transaction that rolled back |
| Spammy feed | Mutation is too granular (autosave-ish). Log only structural events. |
| `Rendered more hooks than during the previous render` | A hook (likely `useActivitySource` or `useMemo`) is below an early `return` — move it above all conditionals |

---

## Pre-merge checklist

- [ ] Create → row appears in `/activity` within ~1s
- [ ] Update with 1 field changed → inline diff `field: old → new`
- [ ] Update with 2+ fields → stacked diff below the row
- [ ] Delete → `Deleted: no → yes`
- [ ] Bulk op → ONE row with `correlation_id` and `metadata.targetIds`
- [ ] New Module / Page appears in the global page's filter dropdowns
- [ ] Permission gate works (try as a `user`-role user → no `/activity` access)
- [ ] If the same BE endpoint is hit from 2+ FE pages, `useActivitySource`
      overrides correctly from both

---

## Worked example — adding "Leaves" under HR

**BE — 2 file edits:**

```ts
// src/utils/transactionHistory.ts
Module.LEAVES = "Leaves";
Page.LEAVE_LIST = "LeaveList";
Page.LEAVE_DETAIL = "LeaveDetail";
EntityType.LEAVE_REQUEST = "leave_request";
```

```ts
// src/controllers/leaveController.ts — inside createLeaveRequest
recordTransaction({
  req, section: Section.HR, module: Module.LEAVES, page: Page.LEAVE_LIST,
  action: Action.CREATE,
  actionLabel: "Leave request submitted",
  entityType: EntityType.LEAVE_REQUEST,
  entityId: leave.id,
  entityLabel: `${leave.type} · ${leave.days}d`,
  afterData: { type, days, from, to },
  statusCode: 201,
});
```

**FE — 1 line per page:**

```tsx
// src/app/leaves/page.tsx
useActivitySource({ section: "HR", module: "Leaves", page: "LeaveList" });
```

Run `npx tsc --noEmit` in both repos. Ship it.
