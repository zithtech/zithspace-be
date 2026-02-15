# Migration: 001 - Initial Schema

**Sprint:** Initial Setup
**Date:** Project inception
**Description:** Creates all foundational tables including tenants, users, projects, tickets, clients, release plans, shifts, attendance, transactions, dropdown options, status updates, and work entries. Also sets up triggers for `updated_at` timestamps.

## Tables Created
- `tenants` — Multi-tenant support
- `users`, `refresh_tokens` — User management & auth
- `projects`, `project_members` — Project management
- `tickets`, `ticket_workflow_steps`, `ticket_comments`, `ticket_related_links`, `ticket_activity_log` — Ticket management
- `clients` — Client management
- `release_plans` — Release planning
- `shifts`, `attendance`, `attendance_breaks` — Workforce management
- `transactions` — Financial tracking
- `dropdown_options` — System configuration
- `status_updates`, `work_entries` — Daily status updates

## How to run
```bash
npx prisma db execute --file prisma/migrations/001_initial_schema/migration.sql
```
