# Migration: 002 - Chat Tables

**Sprint:** Chat & Meetings
**Date:** Sprint 2
**Description:** Adds tables for real-time chat channels, messaging, and video meetings.

## Tables Created
- `channels` — Chat channels (group, DM, etc.)
- `channel_members` — Channel membership
- `channel_messages` — Messages within channels
- `meetings` — Video/audio meetings
- `meeting_participants` — Meeting attendees

## How to run
```bash
npx prisma db execute --file prisma/migrations/002_chat_tables/migration.sql
```
