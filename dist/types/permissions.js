"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SystemRoles = exports.ALL_PERMISSIONS = exports.PERMISSIONS_BY_RESOURCE = exports.Permissions = void 0;
/**
 * All named permissions in the system.
 * Format: "resource.action"
 *
 * These constants are the single source of truth.
 * Every permission check in the backend MUST use these — no magic strings.
 */
exports.Permissions = {
    // ─── Users / Members ─────────────────────────────────────────────
    USER_CREATE: 'user.create',
    USER_READ: 'user.read',
    USER_UPDATE: 'user.update',
    USER_DELETE: 'user.delete',
    USER_MANAGE: 'user.manage', // activate/deactivate, reset password, assign shift
    // ─── Projects ────────────────────────────────────────────────────
    PROJECT_CREATE: 'project.create',
    PROJECT_READ: 'project.read',
    PROJECT_UPDATE: 'project.update',
    PROJECT_DELETE: 'project.delete',
    PROJECT_MANAGE: 'project.manage', // add/remove members, view all projects
    // ─── Tickets ─────────────────────────────────────────────────────
    TICKET_CREATE: 'ticket.create',
    TICKET_READ: 'ticket.read',
    TICKET_UPDATE: 'ticket.update',
    TICKET_DELETE: 'ticket.delete',
    TICKET_ASSIGN: 'ticket.assign',
    TICKET_ARCHIVE: 'ticket.archive',
    TICKET_MANAGE: 'ticket.manage', // bulk ops, workflow management
    // ─── Attendance ──────────────────────────────────────────────────
    ATTENDANCE_CREATE: 'attendance.create',
    ATTENDANCE_READ: 'attendance.read',
    ATTENDANCE_UPDATE: 'attendance.update',
    ATTENDANCE_MANAGE: 'attendance.manage', // manual entries, admin overrides
    // ─── Leaves ──────────────────────────────────────────────────────
    LEAVE_CREATE: 'leave.create',
    LEAVE_READ: 'leave.read',
    LEAVE_UPDATE: 'leave.update',
    LEAVE_DELETE: 'leave.delete',
    LEAVE_APPROVE: 'leave.approve',
    LEAVE_MANAGE: 'leave.manage', // view all, configure types
    // ─── Shifts ──────────────────────────────────────────────────────
    SHIFT_CREATE: 'shift.create',
    SHIFT_READ: 'shift.read',
    SHIFT_UPDATE: 'shift.update',
    SHIFT_DELETE: 'shift.delete',
    SHIFT_MANAGE: 'shift.manage',
    // ─── Invoices ────────────────────────────────────────────────────
    INVOICE_CREATE: 'invoice.create',
    INVOICE_READ: 'invoice.read',
    INVOICE_UPDATE: 'invoice.update',
    INVOICE_DELETE: 'invoice.delete',
    INVOICE_MANAGE: 'invoice.manage',
    // ─── Invoice Templates ───────────────────────────────────────────
    INVOICE_TEMPLATE_CREATE: 'invoice_template.create',
    INVOICE_TEMPLATE_READ: 'invoice_template.read',
    INVOICE_TEMPLATE_UPDATE: 'invoice_template.update',
    INVOICE_TEMPLATE_DELETE: 'invoice_template.delete',
    // ─── Transactions / Accounts ─────────────────────────────────────
    TRANSACTION_CREATE: 'transaction.create',
    TRANSACTION_READ: 'transaction.read',
    TRANSACTION_UPDATE: 'transaction.update',
    TRANSACTION_DELETE: 'transaction.delete',
    TRANSACTION_MANAGE: 'transaction.manage',
    // ─── Clients ─────────────────────────────────────────────────────
    CLIENT_CREATE: 'client.create',
    CLIENT_READ: 'client.read',
    CLIENT_UPDATE: 'client.update',
    CLIENT_DELETE: 'client.delete',
    CLIENT_MANAGE: 'client.manage',
    // ─── Settings ────────────────────────────────────────────────────
    SETTINGS_READ: 'settings.read',
    SETTINGS_UPDATE: 'settings.update',
    SETTINGS_MANAGE: 'settings.manage', // system-level tenant configuration
    // ─── Roles / RBAC management ─────────────────────────────────────
    ROLE_CREATE: 'role.create',
    ROLE_READ: 'role.read',
    ROLE_UPDATE: 'role.update',
    ROLE_DELETE: 'role.delete',
    ROLE_ASSIGN: 'role.assign', // assign/remove roles from users
    // ─── Reports ─────────────────────────────────────────────────────
    REPORT_READ: 'report.read',
    REPORT_MANAGE: 'report.manage',
    // ─── Reimbursement ───────────────────────────────────────────────
    REIMBURSEMENT_CREATE: 'reimbursement.create',
    REIMBURSEMENT_READ: 'reimbursement.read',
    REIMBURSEMENT_UPDATE: 'reimbursement.update',
    REIMBURSEMENT_APPROVE: 'reimbursement.approve',
    REIMBURSEMENT_MANAGE: 'reimbursement.manage',
    // ─── Salary / Payroll ────────────────────────────────────────────
    SALARY_READ: 'salary.read',
    SALARY_MANAGE: 'salary.manage',
    // ─── Documents ───────────────────────────────────────────────────
    DOCUMENT_CREATE: 'document.create',
    DOCUMENT_READ: 'document.read',
    DOCUMENT_UPDATE: 'document.update',
    DOCUMENT_DELETE: 'document.delete',
    DOCUMENT_MANAGE: 'document.manage',
    // ─── Onboarding ──────────────────────────────────────────────────
    ONBOARDING_CREATE: 'onboarding.create',
    ONBOARDING_READ: 'onboarding.read',
    ONBOARDING_UPDATE: 'onboarding.update',
    ONBOARDING_MANAGE: 'onboarding.manage',
    // ─── Timesheet ───────────────────────────────────────────────────
    TIMESHEET_CREATE: 'timesheet.create',
    TIMESHEET_READ: 'timesheet.read',
    TIMESHEET_UPDATE: 'timesheet.update',
    TIMESHEET_APPROVE: 'timesheet.approve',
    TIMESHEET_MANAGE: 'timesheet.manage',
    // ─── Org Structure ───────────────────────────────────────────────
    ORG_READ: 'org.read',
    ORG_MANAGE: 'org.manage', // departments, grades, positions, employment types
    // ─── Daily Updates ───────────────────────────────────────────────
    DAILY_UPDATE_CREATE: 'daily_update.create',
    DAILY_UPDATE_READ: 'daily_update.read',
    DAILY_UPDATE_MANAGE: 'daily_update.manage',
};
/**
 * All permissions grouped by resource for UI rendering (permission picker).
 */
exports.PERMISSIONS_BY_RESOURCE = {
    user: [exports.Permissions.USER_CREATE, exports.Permissions.USER_READ, exports.Permissions.USER_UPDATE, exports.Permissions.USER_DELETE, exports.Permissions.USER_MANAGE],
    project: [exports.Permissions.PROJECT_CREATE, exports.Permissions.PROJECT_READ, exports.Permissions.PROJECT_UPDATE, exports.Permissions.PROJECT_DELETE, exports.Permissions.PROJECT_MANAGE],
    ticket: [exports.Permissions.TICKET_CREATE, exports.Permissions.TICKET_READ, exports.Permissions.TICKET_UPDATE, exports.Permissions.TICKET_DELETE, exports.Permissions.TICKET_ASSIGN, exports.Permissions.TICKET_ARCHIVE, exports.Permissions.TICKET_MANAGE],
    attendance: [exports.Permissions.ATTENDANCE_CREATE, exports.Permissions.ATTENDANCE_READ, exports.Permissions.ATTENDANCE_UPDATE, exports.Permissions.ATTENDANCE_MANAGE],
    leave: [exports.Permissions.LEAVE_CREATE, exports.Permissions.LEAVE_READ, exports.Permissions.LEAVE_UPDATE, exports.Permissions.LEAVE_DELETE, exports.Permissions.LEAVE_APPROVE, exports.Permissions.LEAVE_MANAGE],
    shift: [exports.Permissions.SHIFT_CREATE, exports.Permissions.SHIFT_READ, exports.Permissions.SHIFT_UPDATE, exports.Permissions.SHIFT_DELETE, exports.Permissions.SHIFT_MANAGE],
    invoice: [exports.Permissions.INVOICE_CREATE, exports.Permissions.INVOICE_READ, exports.Permissions.INVOICE_UPDATE, exports.Permissions.INVOICE_DELETE, exports.Permissions.INVOICE_MANAGE],
    invoice_template: [exports.Permissions.INVOICE_TEMPLATE_CREATE, exports.Permissions.INVOICE_TEMPLATE_READ, exports.Permissions.INVOICE_TEMPLATE_UPDATE, exports.Permissions.INVOICE_TEMPLATE_DELETE],
    transaction: [exports.Permissions.TRANSACTION_CREATE, exports.Permissions.TRANSACTION_READ, exports.Permissions.TRANSACTION_UPDATE, exports.Permissions.TRANSACTION_DELETE, exports.Permissions.TRANSACTION_MANAGE],
    client: [exports.Permissions.CLIENT_CREATE, exports.Permissions.CLIENT_READ, exports.Permissions.CLIENT_UPDATE, exports.Permissions.CLIENT_DELETE, exports.Permissions.CLIENT_MANAGE],
    settings: [exports.Permissions.SETTINGS_READ, exports.Permissions.SETTINGS_UPDATE, exports.Permissions.SETTINGS_MANAGE],
    role: [exports.Permissions.ROLE_CREATE, exports.Permissions.ROLE_READ, exports.Permissions.ROLE_UPDATE, exports.Permissions.ROLE_DELETE, exports.Permissions.ROLE_ASSIGN],
    report: [exports.Permissions.REPORT_READ, exports.Permissions.REPORT_MANAGE],
    reimbursement: [exports.Permissions.REIMBURSEMENT_CREATE, exports.Permissions.REIMBURSEMENT_READ, exports.Permissions.REIMBURSEMENT_UPDATE, exports.Permissions.REIMBURSEMENT_APPROVE, exports.Permissions.REIMBURSEMENT_MANAGE],
    salary: [exports.Permissions.SALARY_READ, exports.Permissions.SALARY_MANAGE],
    document: [exports.Permissions.DOCUMENT_CREATE, exports.Permissions.DOCUMENT_READ, exports.Permissions.DOCUMENT_UPDATE, exports.Permissions.DOCUMENT_DELETE, exports.Permissions.DOCUMENT_MANAGE],
    onboarding: [exports.Permissions.ONBOARDING_CREATE, exports.Permissions.ONBOARDING_READ, exports.Permissions.ONBOARDING_UPDATE, exports.Permissions.ONBOARDING_MANAGE],
    timesheet: [exports.Permissions.TIMESHEET_CREATE, exports.Permissions.TIMESHEET_READ, exports.Permissions.TIMESHEET_UPDATE, exports.Permissions.TIMESHEET_APPROVE, exports.Permissions.TIMESHEET_MANAGE],
    org: [exports.Permissions.ORG_READ, exports.Permissions.ORG_MANAGE],
    daily_update: [exports.Permissions.DAILY_UPDATE_CREATE, exports.Permissions.DAILY_UPDATE_READ, exports.Permissions.DAILY_UPDATE_MANAGE],
};
/** Flat list of all permissions — used for seeding. */
exports.ALL_PERMISSIONS = Object.values(exports.Permissions);
/**
 * Default role slugs. These system roles are seeded on tenant creation.
 */
exports.SystemRoles = {
    SUPER_ADMIN: 'super_admin',
    ADMIN: 'admin',
    USER: 'user',
};
//# sourceMappingURL=permissions.js.map