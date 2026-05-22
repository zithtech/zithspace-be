import { prisma } from '@/config/database';

interface CacheEntry {
  permissions: Set<string>;
  expiresAt: number;
}

/**
 * RBACService — resolves a user's effective permission set.
 *
 * Permissions are loaded by joining:
 *   UserRole → Role → RolePermission → Permission
 *
 * Results are cached per (tenantId:userId) for CACHE_TTL ms.
 * Cache is invalidated explicitly whenever roles change.
 *
 * Special case: users with User.role === 'super_admin' bypass all checks —
 * their permission set is treated as "all permissions" without a DB query.
 */
export class RBACService {
  private static cache = new Map<string, CacheEntry>();
  private static readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  // ─── Public API ────────────────────────────────────────────────────────────

  /**
   * Returns the full permission set for a user as a Set<string>.
   * Uses cache; loads from DB on miss.
   */
  static async getUserPermissions(
    userId: string,
    tenantId: string,
    legacyRole?: string,
  ): Promise<Set<string>> {
    // Super admin shortcut — skip cache and DB
    if (legacyRole === 'super_admin') {
      return RBACService.getSuperAdminPermissions();
    }

    const key = `${tenantId}:${userId}`;
    const cached = RBACService.cache.get(key);

    if (cached && cached.expiresAt > Date.now()) {
      return cached.permissions;
    }

    const permissions = await RBACService.loadFromDB(userId, tenantId, legacyRole);
    RBACService.setCache(key, permissions);
    return permissions;
  }

  /**
   * Returns true if the user has the given permission.
   */
  static async hasPermission(
    userId: string,
    tenantId: string,
    permission: string,
    legacyRole?: string,
  ): Promise<boolean> {
    const perms = await RBACService.getUserPermissions(userId, tenantId, legacyRole);
    return perms.has(permission);
  }

  /**
   * Returns true if the user has ALL of the given permissions.
   */
  static async hasAllPermissions(
    userId: string,
    tenantId: string,
    permissions: string[],
    legacyRole?: string,
  ): Promise<boolean> {
    const perms = await RBACService.getUserPermissions(userId, tenantId, legacyRole);
    return permissions.every((p) => perms.has(p));
  }

  /**
   * Returns true if the user has ANY of the given permissions.
   */
  static async hasAnyPermission(
    userId: string,
    tenantId: string,
    permissions: string[],
    legacyRole?: string,
  ): Promise<boolean> {
    const perms = await RBACService.getUserPermissions(userId, tenantId, legacyRole);
    return permissions.some((p) => perms.has(p));
  }

  /**
   * Invalidates the cache for a specific user.
   * Call this whenever a user's roles are changed.
   */
  static invalidateUser(userId: string, tenantId: string): void {
    RBACService.cache.delete(`${tenantId}:${userId}`);
  }

  /**
   * Invalidates the cache for ALL users that have a given role.
   * Call this whenever a role's permissions are changed.
   */
  static async invalidateRole(roleId: string): Promise<void> {
    const userRoles = await prisma.userRole.findMany({
      where: { roleId },
      select: { userId: true, tenantId: true },
    });

    for (const { userId, tenantId } of userRoles) {
      RBACService.invalidateUser(userId, tenantId);
    }
  }

  /**
   * Clears the entire cache. Use sparingly (e.g. permission list changes).
   */
  static clearCache(): void {
    RBACService.cache.clear();
  }

  // ─── Internal helpers ──────────────────────────────────────────────────────

  private static async loadFromDB(
    userId: string,
    tenantId: string,
    legacyRole?: string,
  ): Promise<Set<string>> {
    const permissions = new Set<string>();

    // Load from the new RBAC tables
    const userRoles = await prisma.userRole.findMany({
      where: {
        userId,
        tenantId,
        role: { isActive: true },
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: new Date() } },
        ],
      },
      include: {
        role: {
          include: {
            rolePermissions: {
              include: { permission: true },
            },
          },
        },
      },
    });

    for (const ur of userRoles) {
      for (const rp of ur.role.rolePermissions) {
        permissions.add(rp.permission.name);
      }
    }

    // Fallback: if the user has no roles yet (pre-migration), apply legacy defaults
    if (permissions.size === 0 && legacyRole) {
      const legacyPerms = RBACService.getLegacyPermissions(legacyRole);
      for (const p of legacyPerms) permissions.add(p);
    }

    return permissions;
  }

  private static async getSuperAdminPermissions(): Promise<Set<string>> {
    // Fetch all permission names from DB (or return wildcard shorthand)
    const all = await prisma.permission.findMany({ select: { name: true } });
    return new Set(all.map((p) => p.name));
  }

  private static setCache(key: string, permissions: Set<string>): void {
    RBACService.cache.set(key, {
      permissions,
      expiresAt: Date.now() + RBACService.CACHE_TTL,
    });
  }

  /**
   * Legacy fallback permissions for users not yet migrated to UserRole table.
   * Mirrors the seed script defaults.
   */
  private static getLegacyPermissions(role: string): string[] {
    switch (role) {
      case 'admin':
        return ADMIN_DEFAULT_PERMISSIONS;
      case 'user':
        return USER_DEFAULT_PERMISSIONS;
      default:
        return [];
    }
  }
}

// ─── Default permission sets (mirrors seed-rbac.ts) ──────────────────────────

export const ADMIN_DEFAULT_PERMISSIONS: string[] = [
  'dashboard.read',
  'integration.read', 'integration.manage',
  'user.create', 'user.read', 'user.update', 'user.delete', 'user.manage',
  'project.create', 'project.read', 'project.update', 'project.delete', 'project.trash.read', 'project.trash.restore', 'project.trash.delete', 'project.manage',
  'ticket.create', 'ticket.read', 'ticket.update', 'ticket.delete', 'ticket.assign', 'ticket.bucket.read', 'ticket.bucket.create', 'ticket.bucket.update', 'ticket.bucket.delete', 'ticket.setting.read', 'ticket.setting.update', 'ticket.trash.read', 'ticket.trash.restore', 'ticket.trash.delete', 'ticket.archive.read', 'ticket.archive.restore', 'ticket.manage',
  'bug.create', 'bug.read', 'bug.update', 'bug.delete', 'bug.trash.read', 'bug.trash.restore', 'bug.trash.delete', 'bug.archive.read', 'bug.archive.restore', 'bug.manage',
  'attendance.create', 'attendance.read', 'attendance.update', 'attendance.delete', 'attendance.dashboard.read', 'attendance.clock.in_out',
  'leave.dashboard.read', 'leave.create', 'leave.read', 'leave.update', 'leave.delete', 'leave.approve', 'leave.manage',
  'leave.type.read', 'leave.type.create', 'leave.type.update', 'leave.type.delete',
  'leave.policy.read', 'leave.policy.create', 'leave.policy.update', 'leave.policy.delete',
  'leave.holiday.read', 'leave.holiday.create', 'leave.holiday.update', 'leave.holiday.delete',
  'leave.adjustment.read', 'leave.adjustment.create', 'leave.adjustment.update', 'leave.adjustment.delete',
  'leave.trash.read', 'leave.trash.restore', 'leave.trash.delete',
  'shift.create', 'shift.read', 'shift.update', 'shift.delete', 'shift.manage',
  'invoice.create', 'invoice.read', 'invoice.update', 'invoice.delete', 'invoice.manage',
  'account.read', 'account.create', 'account.update', 'account.delete', 'account.manage',
  'account.setting.read', 'account.setting.create', 'account.setting.update', 'account.setting.delete',
  'client.create', 'client.read', 'client.update', 'client.delete', 'client.manage',
  'settings.read', 'settings.update', 'settings.manage',
  'role.create', 'role.read', 'role.update', 'role.delete', 'role.assign',
  'report.read', 'report.manage',
  'reimbursement.dashboard.read', 'reimbursement.read', 'reimbursement.create', 'reimbursement.update', 'reimbursement.approve', 'reimbursement.manage',
  'reimbursement.config.read', 'reimbursement.config.update',
  'payroll.dashboard.read', 'payroll.read', 'payroll.create', 'payroll.update', 'payroll.delete', 'payroll.approve', 'payroll.pay', 'payroll.process', 'payroll.manage',
  'salary.read', 'salary.approve', 'salary.manage',
  'document.create', 'document.read', 'document.update', 'document.delete', 'document.manage',
  'onboarding.create', 'onboarding.read', 'onboarding.update', 'onboarding.delete', 'onboarding.setting.read', 'onboarding.setting.update',
  'timesheet.create', 'timesheet.read', 'timesheet.update', 'timesheet.approve', 'timesheet.manage',
  'org.dashboard.read', 'org.read', 'org.manage',
  'org.department.read', 'org.department.create', 'org.department.update', 'org.department.delete',
  'org.grade.read', 'org.grade.create', 'org.grade.grade.update', 'org.grade.delete',
  'org.position.read', 'org.position.create', 'org.position.update', 'org.position.delete',
  'org.employment_type.read', 'org.employment_type.create', 'org.employment_type.update', 'org.employment_type.delete',
  'daily_update.create', 'daily_update.read', 'daily_update.update', 'daily_update.delete', 'daily_update.manage_time',
  'squad.create', 'squad.read', 'squad.update', 'squad.delete', 'squad.manage',
  'lead.create', 'lead.read', 'lead.update', 'lead.delete', 'lead.setting.read', 'lead.setting.create', 'lead.setting.update', 'lead.setting.delete', 'lead.trash.read', 'lead.trash.restore', 'lead.trash.delete', 'lead.manage',
  'proposal.create', 'proposal.read', 'proposal.update', 'proposal.delete',
  'vendor.create', 'vendor.read', 'vendor.update', 'vendor.delete', 'vendor.manage',
  'escalation.create', 'escalation.read', 'escalation.update', 'escalation.delete', 'escalation.manage',
  'pipeline.create', 'pipeline.read', 'pipeline.update', 'pipeline.delete', 'pipeline.manage', 'pipeline.board.read', 'pipeline.board.create', 'pipeline.board.update', 'pipeline.board.delete', 'pipeline.deals.read', 'pipeline.deals.create', 'pipeline.deals.update', 'pipeline.deals.delete', 'pipeline.forecast.read', 'pipeline.setting.read', 'pipeline.setting.update',
  'exit.create', 'exit.read', 'exit.update', 'exit.manage', 'exit.config.read', 'exit.config.update',
  'performance.read', 'performance.manage',
  'opening.create', 'opening.read', 'opening.update', 'opening.delete', 'opening.manage',
  'profile.create', 'profile.read', 'profile.update', 'profile.delete', 'profile.manage',
  'mail.create', 'mail.read', 'mail.update', 'mail.delete', 'mail.manage',
  'calendar.create', 'calendar.read', 'calendar.update', 'calendar.delete', 'calendar.manage',
  'chat.create', 'chat.read', 'chat.update', 'chat.delete', 'chat.manage',
  'skills.create', 'skills.read', 'skills.update', 'skills.delete', 'skills.manage',
  'notification.create', 'notification.read', 'notification.update', 'notification.delete',
  'bookmark.create', 'bookmark.read', 'bookmark.update', 'bookmark.delete',
  'time_tracking.create', 'time_tracking.read', 'time_tracking.delete', 'time_tracking.team.read', 'time_tracking.manage_time',
];

export const USER_DEFAULT_PERMISSIONS: string[] = [
  'dashboard.read',
  'user.read',
  'project.read',
  'ticket.create', 'ticket.read', 'ticket.update',
  'attendance.read', 'attendance.update', 'attendance.dashboard.read', 'attendance.clock.in_out',
  'leave.dashboard.read', 'leave.create', 'leave.read', 'leave.update', 'leave.type.read',
  'invoice.read',
  'account.read',
  'settings.read',
  'report.read',
  'reimbursement.read', 'reimbursement.create',
  'document.create', 'document.read', 'document.update',
  'onboarding.read',
  'timesheet.create', 'timesheet.read', 'timesheet.update',
  'org.dashboard.read', 'org.read', 'org.department.read', 'org.grade.read', 'org.position.read', 'org.employment_type.read',
  'daily_update.create', 'daily_update.read',
  'squad.read',
  'lead.read',
  'proposal.read',
  'vendor.read',
  'escalation.read',
  'pipeline.read', 'pipeline.board.read', 'pipeline.deals.read',
  'exit.read',
  'performance.read',
  'opening.read',
  'profile.read', 'profile.update',
  'mail.create', 'mail.read', 'mail.update', 'mail.delete',
  'calendar.create', 'calendar.read', 'calendar.update', 'calendar.delete',
  'chat.create', 'chat.read', 'chat.update', 'chat.delete',
  'skills.create', 'skills.read', 'skills.update', 'skills.delete',
  'notification.create', 'notification.read', 'notification.update', 'notification.delete',
  'bookmark.create', 'bookmark.read', 'bookmark.update', 'bookmark.delete',
  'time_tracking.create', 'time_tracking.read', 'time_tracking.delete',
];
