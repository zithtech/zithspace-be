"use strict";
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const database_1 = require("@/config/database");
const permissions_1 = require("@/types/permissions");
const rbac_service_1 = require("@/modules/rbac/rbac.service");
// ─── Permission descriptions ──────────────────────────────────────────────────
const PERMISSION_DESCRIPTIONS = {
    'user.create': 'Create new users / members',
    'user.read': 'View user profiles and lists',
    'user.update': 'Edit user details',
    'user.delete': 'Deactivate or remove users',
    'user.manage': 'Full user management (activate, reset password, assign shift)',
    'project.create': 'Create new projects',
    'project.read': 'View projects and stats',
    'project.update': 'Edit project details',
    'project.delete': 'Delete projects',
    'project.manage': 'Manage project members and see all projects',
    'ticket.create': 'Create tickets',
    'ticket.read': 'View tickets',
    'ticket.update': 'Edit ticket details',
    'ticket.delete': 'Delete tickets',
    'ticket.assign': 'Assign tickets to users',
    'ticket.archive': 'Archive tickets',
    'ticket.manage': 'Full ticket management including bulk operations',
    'attendance.create': 'Create manual attendance records',
    'attendance.read': 'View attendance records',
    'attendance.update': 'Edit attendance records',
    'attendance.manage': 'Full attendance management',
    'leave.create': 'Apply for leave',
    'leave.read': 'View leave records',
    'leave.update': 'Edit leave applications',
    'leave.delete': 'Cancel/delete leave applications',
    'leave.approve': 'Approve or reject leave requests',
    'leave.manage': 'Full leave management including types and policies',
    'shift.create': 'Create work shifts',
    'shift.read': 'View shifts',
    'shift.update': 'Edit shifts',
    'shift.delete': 'Delete shifts',
    'shift.manage': 'Full shift management',
    'invoice.create': 'Create invoices',
    'invoice.read': 'View invoices',
    'invoice.update': 'Edit invoices',
    'invoice.delete': 'Delete invoices',
    'invoice.manage': 'Full invoice management',
    'transaction.create': 'Create financial transactions',
    'transaction.read': 'View financial transactions',
    'transaction.update': 'Edit transactions',
    'transaction.delete': 'Delete transactions',
    'transaction.manage': 'Full transaction management',
    'client.create': 'Create clients',
    'client.read': 'View clients',
    'client.update': 'Edit clients',
    'client.delete': 'Delete clients',
    'client.manage': 'Full client management',
    'settings.read': 'View system settings',
    'settings.update': 'Update system settings',
    'settings.manage': 'Full settings management including tenant configuration',
    'role.create': 'Create new roles',
    'role.read': 'View roles and permissions',
    'role.update': 'Edit role permissions',
    'role.delete': 'Delete roles',
    'role.assign': 'Assign/remove roles from users',
    'report.read': 'View reports',
    'report.manage': 'Full report management',
    'reimbursement.create': 'Submit reimbursement requests',
    'reimbursement.read': 'View reimbursement requests',
    'reimbursement.update': 'Edit reimbursement requests',
    'reimbursement.approve': 'Approve/reject reimbursements',
    'reimbursement.manage': 'Full reimbursement management',
    'salary.read': 'View salary information',
    'salary.manage': 'Manage salary components and payroll',
    'document.create': 'Create documents',
    'document.read': 'View documents',
    'document.update': 'Edit documents',
    'document.delete': 'Delete documents',
    'document.manage': 'Full document management',
    'onboarding.create': 'Create onboarding flows',
    'onboarding.read': 'View onboarding data',
    'onboarding.update': 'Edit onboarding flows',
    'onboarding.manage': 'Full onboarding management',
    'timesheet.create': 'Create timesheet entries',
    'timesheet.read': 'View timesheets',
    'timesheet.update': 'Edit timesheet entries',
    'timesheet.approve': 'Approve/reject timesheets',
    'timesheet.manage': 'Full timesheet management',
    'org.read': 'View org structure (departments, grades, positions)',
    'org.manage': 'Manage org structure',
    'daily_update.create': 'Create daily status updates',
    'daily_update.read': 'View daily updates',
    'daily_update.manage': 'Manage daily update settings',
};
// ─── Role permission maps ─────────────────────────────────────────────────────
const ROLE_PERMISSIONS = {
    [permissions_1.SystemRoles.SUPER_ADMIN]: permissions_1.ALL_PERMISSIONS, // all permissions
    [permissions_1.SystemRoles.ADMIN]: rbac_service_1.ADMIN_DEFAULT_PERMISSIONS,
    [permissions_1.SystemRoles.USER]: rbac_service_1.USER_DEFAULT_PERMISSIONS,
};
const ROLE_DESCRIPTIONS = {
    [permissions_1.SystemRoles.SUPER_ADMIN]: 'System administrator — full access to all features',
    [permissions_1.SystemRoles.ADMIN]: 'Tenant administrator — manages users, projects, and settings',
    [permissions_1.SystemRoles.USER]: 'Regular employee — standard access to daily work features',
};
const ROLE_DISPLAY_NAMES = {
    [permissions_1.SystemRoles.SUPER_ADMIN]: 'Super Admin',
    [permissions_1.SystemRoles.ADMIN]: 'Admin',
    [permissions_1.SystemRoles.USER]: 'User',
};
// ─── Main ────────────────────────────────────────────────────────────────────
async function main() {
    console.log('🌱 Starting RBAC seed...\n');
    // ── 1. Seed all permissions ──────────────────────────────────────────────
    console.log('1️⃣  Seeding permissions...');
    let createdPerms = 0;
    let skippedPerms = 0;
    for (const permName of permissions_1.ALL_PERMISSIONS) {
        const [resource, action] = permName.split('.');
        const description = PERMISSION_DESCRIPTIONS[permName];
        const existing = await database_1.prisma.permission.findUnique({ where: { name: permName } });
        if (existing) {
            skippedPerms++;
            continue;
        }
        await database_1.prisma.permission.create({
            data: { name: permName, resource, action, description },
        });
        createdPerms++;
    }
    console.log(`   ✅ Created ${createdPerms} permissions, skipped ${skippedPerms} (already exist)\n`);
    // Load all permission records for lookup
    const allPermRecords = await database_1.prisma.permission.findMany();
    const permByName = new Map(allPermRecords.map((p) => [p.name, p]));
    // ── 2. Process each tenant ───────────────────────────────────────────────
    console.log('2️⃣  Processing tenants...');
    const tenants = await database_1.prisma.tenant.findMany({ select: { id: true, name: true } });
    console.log(`   Found ${tenants.length} tenant(s)\n`);
    for (const tenant of tenants) {
        console.log(`   🏢 Tenant: ${tenant.name} (${tenant.id})`);
        // ── 2a. Create system roles ────────────────────────────────────────────
        const roleIdBySlug = {};
        for (const slug of [permissions_1.SystemRoles.SUPER_ADMIN, permissions_1.SystemRoles.ADMIN, permissions_1.SystemRoles.USER]) {
            let role = await database_1.prisma.role.findUnique({
                where: { tenantId_slug: { tenantId: tenant.id, slug } },
            });
            if (!role) {
                role = await database_1.prisma.role.create({
                    data: {
                        tenantId: tenant.id,
                        name: ROLE_DISPLAY_NAMES[slug],
                        slug,
                        description: ROLE_DESCRIPTIONS[slug],
                        isSystem: true,
                    },
                });
                console.log(`      ✅ Created role: ${role.name}`);
            }
            else {
                console.log(`      ⏭️  Role already exists: ${role.name}`);
            }
            roleIdBySlug[slug] = role.id;
        }
        // ── 2b. Assign permissions to roles ───────────────────────────────────
        for (const slug of [permissions_1.SystemRoles.SUPER_ADMIN, permissions_1.SystemRoles.ADMIN, permissions_1.SystemRoles.USER]) {
            const roleId = roleIdBySlug[slug];
            const targetPerms = ROLE_PERMISSIONS[slug];
            let added = 0;
            for (const permName of targetPerms) {
                const perm = permByName.get(permName);
                if (!perm) {
                    console.warn(`      ⚠️  Permission not found: ${permName}`);
                    continue;
                }
                const exists = await database_1.prisma.rolePermission.findUnique({
                    where: { roleId_permissionId: { roleId, permissionId: perm.id } },
                });
                if (!exists) {
                    await database_1.prisma.rolePermission.create({
                        data: { roleId, permissionId: perm.id },
                    });
                    added++;
                }
            }
            if (added > 0) {
                console.log(`      🔑 Assigned ${added} permissions to ${ROLE_DISPLAY_NAMES[slug]}`);
            }
        }
        // ── 2c. Migrate existing users into UserRole ───────────────────────────
        console.log(`      👥 Migrating users...`);
        const users = await database_1.prisma.user.findMany({
            where: { tenantId: tenant.id },
            select: { id: true, role: true },
        });
        let migrated = 0;
        let alreadyMigrated = 0;
        for (const user of users) {
            const legacyRole = user.role || permissions_1.SystemRoles.USER;
            // Determine which system role to assign
            let targetSlug;
            if (legacyRole === 'super_admin') {
                targetSlug = permissions_1.SystemRoles.SUPER_ADMIN;
            }
            else if (legacyRole === 'admin') {
                targetSlug = permissions_1.SystemRoles.ADMIN;
            }
            else {
                targetSlug = permissions_1.SystemRoles.USER;
            }
            const roleId = roleIdBySlug[targetSlug];
            if (!roleId)
                continue;
            const existing = await database_1.prisma.userRole.findUnique({
                where: { userId_roleId: { userId: user.id, roleId } },
            });
            if (existing) {
                alreadyMigrated++;
                continue;
            }
            await database_1.prisma.userRole.create({
                data: { userId: user.id, roleId, tenantId: tenant.id },
            });
            migrated++;
        }
        console.log(`      ✅ Migrated ${migrated} users, ${alreadyMigrated} already had roles\n`);
    }
    console.log('✅ RBAC seed complete!');
}
main()
    .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
})
    .finally(() => database_1.prisma.$disconnect());
//# sourceMappingURL=seed-rbac.js.map