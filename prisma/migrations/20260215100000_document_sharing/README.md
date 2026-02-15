# Migration: 004 - Document Sharing

**Sprint:** Document Hub Enhancements
**Date:** 2026-02-15
**Description:** Adds document sharing support with visibility levels (private/internal/public) and share tokens for public access.

## Columns Added to `documents`
- `visibility` — `TEXT DEFAULT 'private'` (private | internal | public)
- `share_token` — `TEXT UNIQUE` (UUID for public sharing links)
- `shared_by_id` — `TEXT` (FK to users)
- `shared_at` — `TIMESTAMP`

## How to run
```bash
npx prisma db execute --file prisma/migrations/004_document_sharing/migration.sql
npx prisma generate
```
