/**
 * All named permissions in the system.
 * Format: "resource.action"
 *
 * These constants are the single source of truth.
 * Every permission check in the backend MUST use these — no magic strings.
 */
export const Permissions = {
  // ─── Users / Members ─────────────────────────────────────────────
  USER_CREATE:   'user.create',
  USER_READ:     'user.read',
  USER_UPDATE:   'user.update',
  USER_DELETE:   'user.delete',
  USER_MANAGE:   'user.manage',   // activate/deactivate, reset password, assign shift

  // ─── Projects ────────────────────────────────────────────────────
  PROJECT_CREATE: 'project.create',
  PROJECT_READ:   'project.read',
  PROJECT_UPDATE: 'project.update',
  PROJECT_DELETE: 'project.delete',
  PROJECT_MANAGE: 'project.manage',  // add/remove members, view all projects

  // ─── Tickets ─────────────────────────────────────────────────────
  TICKET_CREATE:  'ticket.create',
  TICKET_READ:    'ticket.read',
  TICKET_UPDATE:  'ticket.update',
  TICKET_DELETE:  'ticket.delete',
  TICKET_ASSIGN:  'ticket.assign',
  TICKET_ARCHIVE: 'ticket.archive',
  TICKET_MANAGE:  'ticket.manage',   // bulk ops, workflow management

  // ─── Attendance ──────────────────────────────────────────────────
  ATTENDANCE_CREATE: 'attendance.create',
  ATTENDANCE_READ:   'attendance.read',
  ATTENDANCE_UPDATE: 'attendance.update',
  ATTENDANCE_MANAGE: 'attendance.manage',  // manual entries, admin overrides

  // ─── Leaves ──────────────────────────────────────────────────────
  LEAVE_CREATE:  'leave.create',
  LEAVE_READ:    'leave.read',
  LEAVE_UPDATE:  'leave.update',
  LEAVE_DELETE:  'leave.delete',
  LEAVE_APPROVE: 'leave.approve',
  LEAVE_MANAGE:  'leave.manage',   // view all, configure types

  // ─── Shifts ──────────────────────────────────────────────────────
  SHIFT_CREATE: 'shift.create',
  SHIFT_READ:   'shift.read',
  SHIFT_UPDATE: 'shift.update',
  SHIFT_DELETE: 'shift.delete',
  SHIFT_MANAGE: 'shift.manage',

  // ─── Invoices ────────────────────────────────────────────────────
  INVOICE_CREATE: 'invoice.create',
  INVOICE_READ:   'invoice.read',
  INVOICE_UPDATE: 'invoice.update',
  INVOICE_DELETE: 'invoice.delete',
  INVOICE_MANAGE: 'invoice.manage',

  // ─── Invoice Templates ───────────────────────────────────────────
  INVOICE_TEMPLATE_CREATE: 'invoice_template.create',
  INVOICE_TEMPLATE_READ:   'invoice_template.read',
  INVOICE_TEMPLATE_UPDATE: 'invoice_template.update',
  INVOICE_TEMPLATE_DELETE: 'invoice_template.delete',

  // ─── Transactions / Accounts ─────────────────────────────────────
  TRANSACTION_CREATE: 'transaction.create',
  TRANSACTION_READ:   'transaction.read',
  TRANSACTION_UPDATE: 'transaction.update',
  TRANSACTION_DELETE: 'transaction.delete',
  TRANSACTION_MANAGE: 'transaction.manage',

  // ─── Clients ─────────────────────────────────────────────────────
  CLIENT_CREATE: 'client.create',
  CLIENT_READ:   'client.read',
  CLIENT_UPDATE: 'client.update',
  CLIENT_DELETE: 'client.delete',
  CLIENT_MANAGE: 'client.manage',

  // ─── Settings ────────────────────────────────────────────────────
  SETTINGS_READ:   'settings.read',
  SETTINGS_UPDATE: 'settings.update',
  SETTINGS_MANAGE: 'settings.manage',  // system-level tenant configuration

  // ─── Roles / RBAC management ─────────────────────────────────────
  ROLE_CREATE: 'role.create',
  ROLE_READ:   'role.read',
  ROLE_UPDATE: 'role.update',
  ROLE_DELETE: 'role.delete',
  ROLE_ASSIGN: 'role.assign',   // assign/remove roles from users

  // ─── Reports ─────────────────────────────────────────────────────
  REPORT_READ:   'report.read',
  REPORT_MANAGE: 'report.manage',

  // ─── Reimbursement ───────────────────────────────────────────────
  REIMBURSEMENT_CREATE:  'reimbursement.create',
  REIMBURSEMENT_READ:    'reimbursement.read',
  REIMBURSEMENT_UPDATE:  'reimbursement.update',
  REIMBURSEMENT_APPROVE: 'reimbursement.approve',
  REIMBURSEMENT_MANAGE:  'reimbursement.manage',

  // ─── Salary / Payroll ────────────────────────────────────────────
  SALARY_READ:   'salary.read',
  SALARY_APPROVE: 'salary.approve',
  SALARY_MANAGE: 'salary.manage',

  // ─── Documents ───────────────────────────────────────────────────
  DOCUMENT_CREATE: 'document.create',
  DOCUMENT_READ:   'document.read',
  DOCUMENT_UPDATE: 'document.update',
  DOCUMENT_DELETE: 'document.delete',
  DOCUMENT_MANAGE: 'document.manage',

  // ─── Onboarding ──────────────────────────────────────────────────
  ONBOARDING_CREATE: 'onboarding.create',
  ONBOARDING_READ:   'onboarding.read',
  ONBOARDING_UPDATE: 'onboarding.update',
  ONBOARDING_MANAGE: 'onboarding.manage',

  // ─── Timesheet ───────────────────────────────────────────────────
  TIMESHEET_CREATE:  'timesheet.create',
  TIMESHEET_READ:    'timesheet.read',
  TIMESHEET_UPDATE:  'timesheet.update',
  TIMESHEET_APPROVE: 'timesheet.approve',
  TIMESHEET_MANAGE:  'timesheet.manage',

  // ─── Org Structure ───────────────────────────────────────────────
  ORG_READ:   'org.read',
  ORG_MANAGE: 'org.manage',   // departments, grades, positions, employment types

  // ─── Daily Updates ───────────────────────────────────────────────
  DAILY_UPDATE_CREATE: 'daily_update.create',
  DAILY_UPDATE_READ:   'daily_update.read',
  DAILY_UPDATE_MANAGE: 'daily_update.manage',

  // ─── Squads ──────────────────────────────────────────────────────
  SQUAD_CREATE: 'squad.create',
  SQUAD_READ:   'squad.read',
  SQUAD_UPDATE: 'squad.update',
  SQUAD_DELETE: 'squad.delete',
  SQUAD_MANAGE: 'squad.manage',
} as const;

export type Permission = (typeof Permissions)[keyof typeof Permissions];

/**
 * All permissions grouped by resource for UI rendering (permission picker).
 */
export const PERMISSIONS_BY_RESOURCE: Record<string, Permission[]> = {
  user:         [Permissions.USER_CREATE, Permissions.USER_READ, Permissions.USER_UPDATE, Permissions.USER_DELETE, Permissions.USER_MANAGE],
  project:      [Permissions.PROJECT_CREATE, Permissions.PROJECT_READ, Permissions.PROJECT_UPDATE, Permissions.PROJECT_DELETE, Permissions.PROJECT_MANAGE],
  ticket:       [Permissions.TICKET_CREATE, Permissions.TICKET_READ, Permissions.TICKET_UPDATE, Permissions.TICKET_DELETE, Permissions.TICKET_ASSIGN, Permissions.TICKET_ARCHIVE, Permissions.TICKET_MANAGE],
  attendance:   [Permissions.ATTENDANCE_CREATE, Permissions.ATTENDANCE_READ, Permissions.ATTENDANCE_UPDATE, Permissions.ATTENDANCE_MANAGE],
  leave:        [Permissions.LEAVE_CREATE, Permissions.LEAVE_READ, Permissions.LEAVE_UPDATE, Permissions.LEAVE_DELETE, Permissions.LEAVE_APPROVE, Permissions.LEAVE_MANAGE],
  shift:        [Permissions.SHIFT_CREATE, Permissions.SHIFT_READ, Permissions.SHIFT_UPDATE, Permissions.SHIFT_DELETE, Permissions.SHIFT_MANAGE],
  invoice:      [Permissions.INVOICE_CREATE, Permissions.INVOICE_READ, Permissions.INVOICE_UPDATE, Permissions.INVOICE_DELETE, Permissions.INVOICE_MANAGE],
  invoice_template: [Permissions.INVOICE_TEMPLATE_CREATE, Permissions.INVOICE_TEMPLATE_READ, Permissions.INVOICE_TEMPLATE_UPDATE, Permissions.INVOICE_TEMPLATE_DELETE],
  transaction:  [Permissions.TRANSACTION_CREATE, Permissions.TRANSACTION_READ, Permissions.TRANSACTION_UPDATE, Permissions.TRANSACTION_DELETE, Permissions.TRANSACTION_MANAGE],
  client:       [Permissions.CLIENT_CREATE, Permissions.CLIENT_READ, Permissions.CLIENT_UPDATE, Permissions.CLIENT_DELETE, Permissions.CLIENT_MANAGE],
  settings:     [Permissions.SETTINGS_READ, Permissions.SETTINGS_UPDATE, Permissions.SETTINGS_MANAGE],
  role:         [Permissions.ROLE_CREATE, Permissions.ROLE_READ, Permissions.ROLE_UPDATE, Permissions.ROLE_DELETE, Permissions.ROLE_ASSIGN],
  report:       [Permissions.REPORT_READ, Permissions.REPORT_MANAGE],
  reimbursement:[Permissions.REIMBURSEMENT_CREATE, Permissions.REIMBURSEMENT_READ, Permissions.REIMBURSEMENT_UPDATE, Permissions.REIMBURSEMENT_APPROVE, Permissions.REIMBURSEMENT_MANAGE],
  salary:       [Permissions.SALARY_READ, Permissions.SALARY_APPROVE, Permissions.SALARY_MANAGE],
  document:     [Permissions.DOCUMENT_CREATE, Permissions.DOCUMENT_READ, Permissions.DOCUMENT_UPDATE, Permissions.DOCUMENT_DELETE, Permissions.DOCUMENT_MANAGE],
  onboarding:   [Permissions.ONBOARDING_CREATE, Permissions.ONBOARDING_READ, Permissions.ONBOARDING_UPDATE, Permissions.ONBOARDING_MANAGE],
  timesheet:    [Permissions.TIMESHEET_CREATE, Permissions.TIMESHEET_READ, Permissions.TIMESHEET_UPDATE, Permissions.TIMESHEET_APPROVE, Permissions.TIMESHEET_MANAGE],
  org:          [Permissions.ORG_READ, Permissions.ORG_MANAGE],
  daily_update: [Permissions.DAILY_UPDATE_CREATE, Permissions.DAILY_UPDATE_READ, Permissions.DAILY_UPDATE_MANAGE],
  squad:        [Permissions.SQUAD_CREATE, Permissions.SQUAD_READ, Permissions.SQUAD_UPDATE, Permissions.SQUAD_DELETE, Permissions.SQUAD_MANAGE],
};

/** Flat list of all permissions — used for seeding. */
export const ALL_PERMISSIONS: Permission[] = Object.values(Permissions);

/**
 * Default role slugs. These system roles are seeded on tenant creation.
 */
export const SystemRoles = {
  SUPER_ADMIN: 'super_admin',
  ADMIN:       'admin',
  USER:        'user',
} as const;

export type SystemRole = (typeof SystemRoles)[keyof typeof SystemRoles];
