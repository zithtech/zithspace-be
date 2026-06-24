# Leave 2.0 (`leave-v2`)

A ground-up rewrite of leave management using **pure raw PostgreSQL** (no Prisma)
with a clean, layered architecture. Self-contained under `src/modules/leave-v2/`.

## Why this exists

The legacy leave system (7 controllers, ~2.7k lines, duplicated `Leave` vs
`LeaveRequest` concepts) was hard to reason about. 2.0 fixes the architecture and
moves to hand-written SQL for full control over queries.

## Layering — the one rule

```
routes → controller (thin) → service (logic + tx) → repository (SQL only)
```

- **routes** — wire URLs + per-action permission middleware.
- **controllers** — validate input (zod), call a service, shape the response. No logic.
- **services** — business rules + the `withTenant()` transaction boundary.
- **repositories** — parameterized SQL and row mapping. Nothing else.

## Tenant isolation — non-negotiable

The platform enforces multi-tenancy via Postgres RLS reading
`app.current_tenant_id`. Prisma sets that on its own connection; our raw pool does
**not** inherit it. So:

1. **Every** data operation runs through `withTenant(tenantId, fn)`
   ([db/pool.ts](db/pool.ts)). It opens a transaction, sets the tenant GUC
   **transaction-local**, and runs all queries on that one connection.
2. **Every** query *also* filters `tenant_id = $1` explicitly (defense in depth).
3. New tables have RLS **enabled and FORCEd** (see migration `001`), so even the
   table owner is bound by the policy.

Never call `lv2Pool.query()` directly for tenant data — only `withTenant`.

## Schema

Tables are prefixed `lv2_` and are **not** in `schema.prisma` — managed solely by
this module's SQL migrations.

| Table | Purpose |
|---|---|
| `lv2_leave_types` | Configurable leave types per tenant |
| `lv2_leave_requests` | Leave applications + approval state |
| `lv2_leave_ledger` | **Append-only** transactions; the source of truth for balances |

Balances are **derived** from the ledger (`SUM(units)`), never a mutable counter.

## Migrations

Forward-only SQL files in `db/migrations/` (lexical order), applied once each and
tracked in `lv2_migrations`.

```bash
npm run lv2:migrate
```

## Status

- ✅ Foundation: tenant-aware pool, migration runner, core schema + RLS
- ✅ **Leave Types** — full CRUD vertical slice (the reference pattern)
- ⬜ Leave Requests — apply / list / cancel
- ⬜ Approvals — approve / reject (writes a ledger debit on approval)
- ⬜ Balances — derived from the ledger

To add a slice, copy the Leave Types files (`validator → repo → service →
controller → routes`) and mount it in `routes/index.ts`.

## API

Mounted at `/api/v2/leave`.

| Method | Path | Permission |
|---|---|---|
| GET | `/api/v2/leave/types` | `leave.type.read` |
| GET | `/api/v2/leave/types/:id` | `leave.type.read` |
| POST | `/api/v2/leave/types` | `leave.type.create` |
| PUT | `/api/v2/leave/types/:id` | `leave.type.update` |
| DELETE | `/api/v2/leave/types/:id` | `leave.type.delete` |
