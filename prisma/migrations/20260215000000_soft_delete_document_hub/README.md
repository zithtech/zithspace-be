# Migration: 003 - Soft Delete for Document Hub

**Sprint:** Document Hub Enhancements
**Date:** 2026-02-15
**Description:** Adds soft delete support (`is_deleted`, `deleted_at`, `deleted_by_id`) to Document Hub, Documents, and DocumentTree tables. Uses `IF NOT EXISTS` for safe re-runs.

## Tables Modified
- `document_hub` — Added `is_deleted`, `deleted_at`, `deleted_by_id` + index
- `documents` — Added `is_deleted`, `deleted_at`, `deleted_by_id` + index
- `documenttree` — Added `is_deleted`, `deleted_at`, `deleted_by_id`

## How to run
```bash
npx prisma db execute --file prisma/migrations/003_soft_delete_document_hub/migration.sql
```

Then regenerate Prisma client:
```bash
npx prisma generate
```
