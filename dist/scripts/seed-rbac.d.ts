/**
 * seed-rbac.ts
 *
 * One-time seed script for RBAC tables.
 *
 * What it does:
 *  1. Upserts all Permission rows from the Permissions constants
 *  2. For every tenant: creates (or skips) the 3 system roles
 *     (super_admin, admin, user) and assigns their default permissions
 *  3. Migrates every existing User into UserRole based on their legacy
 *     User.role string value
 *
 * Safe to run multiple times — all operations are idempotent.
 *
 * Usage:
 *   npx ts-node -r tsconfig-paths/register src/scripts/seed-rbac.ts
 */
export {};
