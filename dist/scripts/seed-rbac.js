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
    'project.trash.read': 'View deleted projects in trash',
    'project.trash.restore': 'Restore projects from trash',
    'project.trash.delete': 'Permanently delete projects',
    'project.manage': 'Manage project members and see all projects',
    'ticket.create': 'Create tickets',
    'ticket.read': 'View tickets',
    'ticket.update': 'Edit ticket details',
    'ticket.delete': 'Delete tickets',
    'ticket.assign': 'Assign tickets to users',
    'ticket.bucket.read': 'View ticket buckets/collections',
    'ticket.bucket.create': 'Create new ticket buckets',
    'ticket.bucket.update': 'Update bucket configurations',
    'ticket.bucket.delete': 'Delete ticket buckets',
    'ticket.setting.read': 'View ticket settings',
    'ticket.setting.update': 'Update ticket workflows and settings',
    'ticket.trash.read': 'View deleted tickets in trash',
    'ticket.trash.restore': 'Restore tickets from trash',
    'ticket.trash.delete': 'Permanently delete tickets',
    'ticket.archive.read': 'View archived tickets',
    'ticket.archive.restore': 'Restore tickets from archive',
    'ticket.manage': 'Full ticket management including bulk operations',
    'attendance.create': 'Manual entry creation',
    'attendance.read': 'View attendance records and lists',
    'attendance.update': 'Edit existing attendance records',
    'attendance.delete': 'Remove attendance records from history',
    'attendance.dashboard.read': 'View attendance dashboard and overview analytics',
    'attendance.clock.in_out': 'Ability to clock in and clock out daily',
    'leave.dashboard.read': 'View leave dashboard and statistics',
    'leave.create': 'Submit new leave requests',
    'leave.read': 'View own and team leave requests',
    'leave.update': 'Edit pending leave requests',
    'leave.delete': 'Cancel leave requests',
    'leave.approve': 'Approve or reject leave requests',
    'leave.type.read': 'View leave types and balances',
    'leave.type.create': 'Create new leave types',
    'leave.type.update': 'Edit leave type configurations',
    'leave.type.delete': 'Delete leave types',
    'leave.policy.read': 'View organization leave policies',
    'leave.policy.create': 'Create organization leave policies',
    'leave.policy.update': 'Manage leave policies and accrual rules',
    'leave.policy.delete': 'Delete organization leave policies',
    'leave.holiday.read': 'View company government holidays',
    'leave.holiday.create': 'Create company government holidays',
    'leave.holiday.update': 'Update company government holidays',
    'leave.holiday.delete': 'Delete company government holidays',
    'leave.adjustment.read': 'View leave adjustments',
    'leave.adjustment.create': 'Create leave adjustments',
    'leave.adjustment.update': 'Update leave adjustments',
    'leave.adjustment.delete': 'Delete leave adjustments',
    'leave.trash.read': 'View deleted leave requests',
    'leave.trash.restore': 'Restore deleted leave requests',
    'leave.trash.delete': 'Permanently delete leave requests',
    'leave.manage': 'Full leave module management',
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
    'account.read': 'View transactions and financial summaries',
    'account.create': 'Create new transactions',
    'account.update': 'Edit existing transactions',
    'account.delete': 'Delete transactions',
    'account.manage': 'Full account management',
    'account.setting.read': 'View account settings and categories',
    'account.setting.create': 'Create new account settings or categories',
    'account.setting.update': 'Update account settings or categories',
    'account.setting.delete': 'Delete account settings or categories',
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
    'salary.approve': 'Approve salary structures or components',
    'salary.manage': 'Manage salary components and payroll',
    'payroll.process': 'Process monthly payroll and generate payslips',
    'payroll.manage': 'Full payroll management',
    'document.create': 'Create documents',
    'document.read': 'View documents',
    'document.update': 'Edit documents',
    'document.delete': 'Delete documents',
    'document.manage': 'Full document management',
    'onboarding.create': 'Create onboarding flows',
    'onboarding.read': 'View onboarding data',
    'onboarding.update': 'Edit onboarding flows',
    'onboarding.delete': 'Remove onboarding records',
    'onboarding.setting.read': 'View onboarding configurations',
    'onboarding.setting.update': 'Update onboarding configurations',
    'timesheet.create': 'Create timesheet entries',
    'timesheet.read': 'View timesheets',
    'timesheet.update': 'Edit timesheet entries',
    'timesheet.approve': 'Approve/reject timesheets',
    'timesheet.manage': 'Full timesheet management',
    'org.dashboard.read': 'View organization dashboard and hierarchy overview',
    'org.read': 'View basic organization structure',
    'org.department.read': 'View departments',
    'org.department.create': 'Create new departments',
    'org.department.update': 'Edit department details',
    'org.department.delete': 'Delete departments',
    'org.grade.read': 'View employee grades',
    'org.grade.create': 'Create new employee grades',
    'org.grade.grade.update': 'Edit employee grades',
    'org.grade.delete': 'Delete employee grades',
    'org.position.read': 'View job positions',
    'org.position.create': 'Create new job positions',
    'org.position.update': 'Edit job positions',
    'org.position.delete': 'Delete job positions',
    'org.employment_type.read': 'View employment types',
    'org.employment_type.create': 'Create new employment types',
    'org.employment_type.update': 'Edit employment types',
    'org.employment_type.delete': 'Delete employment types',
    'org.manage': 'Full organization structure management',
    'daily_update.create': 'Create daily status updates',
    'daily_update.read': 'View daily updates',
    'daily_update.update': 'Edit daily status updates',
    'daily_update.delete': 'Delete daily status updates',
    'daily_update.manage_time': 'Manage daily update and time logs',
    'dashboard.read': 'View dashboard analytics and metrics',
    'integration.read': 'View third-party integrations',
    'integration.manage': 'Configure and manage integrations',
    'lead.create': 'Create new sales leads',
    'lead.read': 'View lead pipeline and details',
    'lead.update': 'Update lead status and information',
    'lead.delete': 'Delete or archive leads',
    'lead.setting.read': 'View lead management settings',
    'lead.setting.create': 'Create lead status or actions',
    'lead.setting.update': 'Update lead configurations',
    'lead.setting.delete': 'Remove lead configurations',
    'lead.trash.read': 'View deleted leads in trash',
    'lead.trash.restore': 'Restore leads from trash',
    'lead.trash.delete': 'Permanently delete leads',
    'lead.manage': 'Full lead management including distribution rules',
    'proposal.create': 'Generate new business proposals',
    'proposal.read': 'View sent and drafted proposals',
    'proposal.update': 'Edit existing proposals',
    'proposal.delete': 'Delete proposals',
    'vendor.create': 'Register new vendors',
    'vendor.read': 'View vendor profiles and contracts',
    'vendor.update': 'Update vendor information',
    'vendor.delete': 'Remove vendors from the system',
    'vendor.manage': 'Full vendor relationship management',
    'escalation.create': 'Report new escalations or issues',
    'escalation.read': 'View escalation history and status',
    'escalation.update': 'Update escalation priority or resolution',
    'escalation.delete': 'Delete escalation records',
    'escalation.manage': 'Full escalation management including SLA rules',
    'pipeline.create': 'Create new sales pipelines and stages',
    'pipeline.read': 'View sales pipeline, board, and deals',
    'pipeline.update': 'Update pipeline stages and deal status',
    'pipeline.delete': 'Delete pipelines or deals',
    'pipeline.manage': 'Full pipeline management including automation rules',
    'pipeline.board.read': 'Access the kanban board view for pipelines',
    'pipeline.board.create': 'Create new pipeline stages or configurations',
    'pipeline.board.update': 'Modify pipeline stages or board layouts',
    'pipeline.board.delete': 'Remove pipeline stages or boards',
    'pipeline.deals.read': 'View deal lists and information',
    'pipeline.deals.create': 'Create new sales deals',
    'pipeline.deals.update': 'Update deal status and information',
    'pipeline.deals.delete': 'Remove deals from the system',
    'pipeline.forecast.read': 'Access sales forecast analytics',
    'pipeline.setting.read': 'View pipeline and deal settings',
    'pipeline.setting.update': 'Update pipeline and deal settings',
    'exit.create': 'Initiate employee exit process',
    'exit.read': 'View employee exit requests and status',
    'exit.update': 'Update exit process details',
    'exit.manage': 'Full exit process management',
    'exit.config.read': 'View exit process configurations',
    'exit.config.update': 'Update exit process configurations',
    'bug.create': 'Log new bugs in bug list',
    'bug.read': 'View bug list entries',
    'bug.update': 'Update bug status and details',
    'bug.delete': 'Remove bugs from list',
    'bug.trash.read': 'View deleted bugs in trash',
    'bug.trash.restore': 'Restore bugs from trash',
    'bug.trash.delete': 'Permanently delete bugs',
    'bug.archive.read': 'View archived bugs',
    'bug.archive.restore': 'Restore bugs from archive',
    'bug.manage': 'Manage bug list folders and sheets',
    'squad.create': 'Create new team squads',
    'squad.read': 'View squads and their members',
    'squad.update': 'Edit squad details',
    'squad.delete': 'Dissolve squads',
    'squad.manage': 'Full squad management',
    'performance.read': 'View performance reviews and metrics',
    'performance.manage': 'Manage performance review cycles and settings',
    'opening.create': 'Post new job openings',
    'opening.read': 'View active job openings',
    'opening.update': 'Edit job opening details',
    'opening.delete': 'Remove job openings',
    'opening.manage': 'Full recruitment portal management',
    'profile.create': 'Create initial profile records',
    'profile.read': 'View personal and public profile information',
    'profile.update': 'Update personal profile details',
    'profile.delete': 'Remove profile data',
    'profile.manage': 'Manage profile templates, custom fields, and visibility rules',
    'mail.create': 'Compose and send new emails',
    'mail.read': 'Access personal mail and inbox',
    'mail.update': 'Update email drafts and settings',
    'mail.delete': 'Delete emails',
    'mail.manage': 'Full mail system management',
    'calendar.create': 'Create new calendar events',
    'calendar.read': 'Access personal calendar and events',
    'calendar.update': 'Edit calendar events',
    'calendar.delete': 'Remove calendar events',
    'calendar.manage': 'Full calendar system management',
    'chat.create': 'Start new chat conversations',
    'chat.read': 'Access team chat and messages',
    'chat.update': 'Edit sent messages',
    'chat.delete': 'Delete messages',
    'chat.manage': 'Full chat system management',
    'skills.create': 'Add new skills or training modules',
    'skills.read': 'Access skills and learning portal',
    'skills.update': 'Update skill descriptions or levels',
    'skills.delete': 'Remove skills',
    'skills.manage': 'Full skills portal management',
    'notification.create': 'Send system notifications',
    'notification.read': 'Access system notifications',
    'notification.update': 'Mark notifications as read or dismiss',
    'notification.delete': 'Delete notifications',
    'bookmark.create': 'Create new personal bookmarks and shortcuts',
    'bookmark.read': 'Access personal bookmarks and shortcuts',
    'bookmark.update': 'Edit personal bookmarks',
    'bookmark.delete': 'Remove personal bookmarks',
    'time_tracking.create': 'Start and log own time',
    'time_tracking.read': 'View own time tracking records',
    'time_tracking.delete': 'Delete own time tracking records',
    'time_tracking.team.read': 'View team time tracking records',
    'time_tracking.manage_time': 'Manage team time logs and settings',
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
        let [resource, ...actionParts] = permName.split('.');
        // Treat 'bug' as a sub-resource of 'ticket' for grouping
        if (resource === 'bug') {
            resource = 'ticket';
        }
        const action = actionParts.join('.');
        const description = PERMISSION_DESCRIPTIONS[permName];
        await database_1.prisma.permission.upsert({
            where: { name: permName },
            update: { resource, action, description },
            create: { name: permName, resource, action, description },
        });
        createdPerms++;
    }
    console.log(`   ✅ Seeded ${createdPerms} permissions`);
    // ── 1b. Cleanup stale permissions ─────────────────────────────────────
    const dbPerms = await database_1.prisma.permission.findMany({ select: { name: true, id: true } });
    const stalePerms = dbPerms.filter(p => !permissions_1.ALL_PERMISSIONS.includes(p.name));
    if (stalePerms.length > 0) {
        console.log(`   🧹 Cleaning up ${stalePerms.length} stale permissions...`);
        for (const stale of stalePerms) {
            await database_1.prisma.rolePermission.deleteMany({ where: { permissionId: stale.id } });
            await database_1.prisma.permission.delete({ where: { id: stale.id } });
            console.log(`      - Deleted: ${stale.name}`);
        }
    }
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
        // ── 2b. Sync permissions for system roles (Full Replace) ─────────
        for (const slug of [permissions_1.SystemRoles.SUPER_ADMIN, permissions_1.SystemRoles.ADMIN, permissions_1.SystemRoles.USER]) {
            const roleId = roleIdBySlug[slug];
            const targetPermNames = ROLE_PERMISSIONS[slug];
            // Map names to IDs
            const targetPermIds = targetPermNames
                .map(name => permByName.get(name)?.id)
                .filter((id) => !!id);
            // Get current permissions in DB
            const currentRPs = await database_1.prisma.rolePermission.findMany({
                where: { roleId },
                select: { permissionId: true }
            });
            const currentPermIds = currentRPs.map(rp => rp.permissionId);
            // Add missing
            const toAdd = targetPermIds.filter(id => !currentPermIds.includes(id));
            if (toAdd.length > 0) {
                await database_1.prisma.rolePermission.createMany({
                    data: toAdd.map(permissionId => ({ roleId, permissionId })),
                    skipDuplicates: true,
                });
            }
            // Remove extra
            const toRemove = currentPermIds.filter(id => !targetPermIds.includes(id));
            if (toRemove.length > 0) {
                await database_1.prisma.rolePermission.deleteMany({
                    where: { roleId, permissionId: { in: toRemove } }
                });
            }
            if (toAdd.length > 0 || toRemove.length > 0) {
                console.log(`      🔑 Synced ${ROLE_DISPLAY_NAMES[slug]}: +${toAdd.length}, -${toRemove.length} permissions`);
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
            const legacyRole = user.role;
            if (!legacyRole)
                continue;
            // Only migrate canonical system roles
            let targetSlug = null;
            if (legacyRole === 'super_admin') {
                targetSlug = permissions_1.SystemRoles.SUPER_ADMIN;
            }
            else if (legacyRole === 'admin') {
                targetSlug = permissions_1.SystemRoles.ADMIN;
            }
            else if (legacyRole === 'user') {
                targetSlug = permissions_1.SystemRoles.USER;
            }
            if (!targetSlug) {
                // Skip users with custom role slugs or no canonical role
                continue;
            }
            const roleId = roleIdBySlug[targetSlug];
            if (!roleId)
                continue;
            // Check if user already has ANY role in the new system
            const hasAnyRole = await database_1.prisma.userRole.findFirst({
                where: { userId: user.id }
            });
            if (hasAnyRole) {
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