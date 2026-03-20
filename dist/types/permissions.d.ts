/**
 * All named permissions in the system.
 * Format: "resource.action"
 *
 * These constants are the single source of truth.
 * Every permission check in the backend MUST use these — no magic strings.
 */
export declare const Permissions: {
    readonly USER_CREATE: "user.create";
    readonly USER_READ: "user.read";
    readonly USER_UPDATE: "user.update";
    readonly USER_DELETE: "user.delete";
    readonly USER_MANAGE: "user.manage";
    readonly PROJECT_CREATE: "project.create";
    readonly PROJECT_READ: "project.read";
    readonly PROJECT_UPDATE: "project.update";
    readonly PROJECT_DELETE: "project.delete";
    readonly PROJECT_MANAGE: "project.manage";
    readonly TICKET_CREATE: "ticket.create";
    readonly TICKET_READ: "ticket.read";
    readonly TICKET_UPDATE: "ticket.update";
    readonly TICKET_DELETE: "ticket.delete";
    readonly TICKET_ASSIGN: "ticket.assign";
    readonly TICKET_ARCHIVE: "ticket.archive";
    readonly TICKET_MANAGE: "ticket.manage";
    readonly ATTENDANCE_CREATE: "attendance.create";
    readonly ATTENDANCE_READ: "attendance.read";
    readonly ATTENDANCE_UPDATE: "attendance.update";
    readonly ATTENDANCE_MANAGE: "attendance.manage";
    readonly LEAVE_CREATE: "leave.create";
    readonly LEAVE_READ: "leave.read";
    readonly LEAVE_UPDATE: "leave.update";
    readonly LEAVE_DELETE: "leave.delete";
    readonly LEAVE_APPROVE: "leave.approve";
    readonly LEAVE_MANAGE: "leave.manage";
    readonly SHIFT_CREATE: "shift.create";
    readonly SHIFT_READ: "shift.read";
    readonly SHIFT_UPDATE: "shift.update";
    readonly SHIFT_DELETE: "shift.delete";
    readonly SHIFT_MANAGE: "shift.manage";
    readonly INVOICE_CREATE: "invoice.create";
    readonly INVOICE_READ: "invoice.read";
    readonly INVOICE_UPDATE: "invoice.update";
    readonly INVOICE_DELETE: "invoice.delete";
    readonly INVOICE_MANAGE: "invoice.manage";
    readonly INVOICE_TEMPLATE_CREATE: "invoice_template.create";
    readonly INVOICE_TEMPLATE_READ: "invoice_template.read";
    readonly INVOICE_TEMPLATE_UPDATE: "invoice_template.update";
    readonly INVOICE_TEMPLATE_DELETE: "invoice_template.delete";
    readonly TRANSACTION_CREATE: "transaction.create";
    readonly TRANSACTION_READ: "transaction.read";
    readonly TRANSACTION_UPDATE: "transaction.update";
    readonly TRANSACTION_DELETE: "transaction.delete";
    readonly TRANSACTION_MANAGE: "transaction.manage";
    readonly CLIENT_CREATE: "client.create";
    readonly CLIENT_READ: "client.read";
    readonly CLIENT_UPDATE: "client.update";
    readonly CLIENT_DELETE: "client.delete";
    readonly CLIENT_MANAGE: "client.manage";
    readonly SETTINGS_READ: "settings.read";
    readonly SETTINGS_UPDATE: "settings.update";
    readonly SETTINGS_MANAGE: "settings.manage";
    readonly ROLE_CREATE: "role.create";
    readonly ROLE_READ: "role.read";
    readonly ROLE_UPDATE: "role.update";
    readonly ROLE_DELETE: "role.delete";
    readonly ROLE_ASSIGN: "role.assign";
    readonly REPORT_READ: "report.read";
    readonly REPORT_MANAGE: "report.manage";
    readonly REIMBURSEMENT_CREATE: "reimbursement.create";
    readonly REIMBURSEMENT_READ: "reimbursement.read";
    readonly REIMBURSEMENT_UPDATE: "reimbursement.update";
    readonly REIMBURSEMENT_APPROVE: "reimbursement.approve";
    readonly REIMBURSEMENT_MANAGE: "reimbursement.manage";
    readonly SALARY_READ: "salary.read";
    readonly SALARY_MANAGE: "salary.manage";
    readonly DOCUMENT_CREATE: "document.create";
    readonly DOCUMENT_READ: "document.read";
    readonly DOCUMENT_UPDATE: "document.update";
    readonly DOCUMENT_DELETE: "document.delete";
    readonly DOCUMENT_MANAGE: "document.manage";
    readonly ONBOARDING_CREATE: "onboarding.create";
    readonly ONBOARDING_READ: "onboarding.read";
    readonly ONBOARDING_UPDATE: "onboarding.update";
    readonly ONBOARDING_MANAGE: "onboarding.manage";
    readonly TIMESHEET_CREATE: "timesheet.create";
    readonly TIMESHEET_READ: "timesheet.read";
    readonly TIMESHEET_UPDATE: "timesheet.update";
    readonly TIMESHEET_APPROVE: "timesheet.approve";
    readonly TIMESHEET_MANAGE: "timesheet.manage";
    readonly ORG_READ: "org.read";
    readonly ORG_MANAGE: "org.manage";
    readonly DAILY_UPDATE_CREATE: "daily_update.create";
    readonly DAILY_UPDATE_READ: "daily_update.read";
    readonly DAILY_UPDATE_MANAGE: "daily_update.manage";
};
export type Permission = (typeof Permissions)[keyof typeof Permissions];
/**
 * All permissions grouped by resource for UI rendering (permission picker).
 */
export declare const PERMISSIONS_BY_RESOURCE: Record<string, Permission[]>;
/** Flat list of all permissions — used for seeding. */
export declare const ALL_PERMISSIONS: Permission[];
/**
 * Default role slugs. These system roles are seeded on tenant creation.
 */
export declare const SystemRoles: {
    readonly SUPER_ADMIN: "super_admin";
    readonly ADMIN: "admin";
    readonly USER: "user";
};
export type SystemRole = (typeof SystemRoles)[keyof typeof SystemRoles];
