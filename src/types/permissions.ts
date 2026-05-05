/**
 * All named permissions in the system.
 * Format: "resource.action"
 *
 * These constants are the single source of truth.
 * Every permission check in the backend MUST use these — no magic strings.
 */
export const Permissions = {
  // ─── Home ────────────────────────────────────────────────────────
  DASHBOARD_READ: 'dashboard.read',
  INTEGRATION_READ: 'integration.read',
  INTEGRATION_MANAGE: 'integration.manage', // configure API keys, webhooks, and third-party connections

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
  SHIFT_MANAGE: 'shift.manage',   // managing shift rotations, rosters, and global shift schedules

  // ─── Invoices ────────────────────────────────────────────────────
  INVOICE_CREATE: 'invoice.create',
  INVOICE_READ:   'invoice.read',
  INVOICE_UPDATE: 'invoice.update',
  INVOICE_DELETE: 'invoice.delete',
  INVOICE_MANAGE: 'invoice.manage', // invoice numbering, tax settings, and payment gateway configuration

  // ─── Transactions / Accounts ─────────────────────────────────────
  TRANSACTION_CREATE: 'transaction.create',
  TRANSACTION_READ:   'transaction.read',
  TRANSACTION_UPDATE: 'transaction.update',
  TRANSACTION_DELETE: 'transaction.delete',
  TRANSACTION_MANAGE: 'transaction.manage', // bank account setup, chart of accounts, and financial periods

  // ─── Clients ─────────────────────────────────────────────────────
  CLIENT_CREATE: 'client.create',
  CLIENT_READ:   'client.read',
  CLIENT_UPDATE: 'client.update',
  CLIENT_DELETE: 'client.delete',
  CLIENT_MANAGE: 'client.manage', // bulk client imports, portal settings, and custom fields

  // ─── Settings ────────────────────────────────────────────────────
  SETTINGS_READ:   'settings.read',
  SETTINGS_UPDATE: 'settings.update',
  SETTINGS_MANAGE: 'settings.manage',  // global system preferences and core branding

  // ─── Roles / RBAC management ─────────────────────────────────────
  ROLE_CREATE: 'role.create',
  ROLE_READ:   'role.read',
  ROLE_UPDATE: 'role.update',
  ROLE_DELETE: 'role.delete',
  ROLE_ASSIGN: 'role.assign',   // assign/remove roles from users

  // ─── Reports ─────────────────────────────────────────────────────
  REPORT_READ:   'report.read',
  REPORT_MANAGE: 'report.manage', // global report templates and data export scheduling

  // ─── Reimbursement ───────────────────────────────────────────────
  REIMBURSEMENT_CREATE:  'reimbursement.create',
  REIMBURSEMENT_READ:    'reimbursement.read',
  REIMBURSEMENT_UPDATE:  'reimbursement.update',
  REIMBURSEMENT_APPROVE: 'reimbursement.approve',
  REIMBURSEMENT_MANAGE:  'reimbursement.manage', // expense category setup and reimbursement policies

  // ─── Salary / Payroll ────────────────────────────────────────────
  SALARY_READ:   'salary.read',
  SALARY_APPROVE: 'salary.approve',
  SALARY_MANAGE: 'salary.manage', // payroll cycle management, tax brackets, and compliance settings

  // ─── Documents ───────────────────────────────────────────────────
  DOCUMENT_CREATE: 'document.create',
  DOCUMENT_READ:   'document.read',
  DOCUMENT_UPDATE: 'document.update',
  DOCUMENT_DELETE: 'document.delete',
  DOCUMENT_MANAGE: 'document.manage', // folder structure, version control, and global document access policies

  // ─── Onboarding ──────────────────────────────────────────────────
  ONBOARDING_CREATE: 'onboarding.create',
  ONBOARDING_READ:   'onboarding.read',
  ONBOARDING_UPDATE: 'onboarding.update',
  ONBOARDING_MANAGE: 'onboarding.manage', // checklist templates, welcome docs, and workflow automation

  // ─── Timesheet ───────────────────────────────────────────────────
  TIMESHEET_CREATE:  'timesheet.create',
  TIMESHEET_READ:    'timesheet.read',
  TIMESHEET_UPDATE:  'timesheet.update',
  TIMESHEET_APPROVE: 'timesheet.approve',
  TIMESHEET_MANAGE:  'timesheet.manage', // overriding timesheets, setting billing rates, and reporting

  // ─── Org Structure ───────────────────────────────────────────────
  ORG_READ:   'org.read',
  ORG_MANAGE: 'org.manage',   // departments, grades, positions, employment types

  // ─── Daily Updates ───────────────────────────────────────────────
  DAILY_UPDATE_CREATE: 'daily_update.create',
  DAILY_UPDATE_READ:   'daily_update.read',
  DAILY_UPDATE_MANAGE: 'daily_update.manage', // update reminders, question templates, and compliance tracking

  // ─── Squads ──────────────────────────────────────────────────────
  SQUAD_CREATE: 'squad.create',
  SQUAD_READ:   'squad.read',
  SQUAD_UPDATE: 'squad.update',
  SQUAD_DELETE: 'squad.delete',
  SQUAD_MANAGE: 'squad.manage', // dissolving squads, changing squad leads, and cross-team settings

  // ─── Leads & CRM ─────────────────────────────────────────────────
  LEAD_CREATE: 'lead.create',
  LEAD_READ:   'lead.read',
  LEAD_UPDATE: 'lead.update',
  LEAD_DELETE: 'lead.delete',
  LEAD_MANAGE: 'lead.manage', // lead distribution rules, source tracking, and conversion triggers

  // ─── Proposals ───────────────────────────────────────────────────
  PROPOSAL_CREATE: 'proposal.create',
  PROPOSAL_READ:   'proposal.read',
  PROPOSAL_UPDATE: 'proposal.update',
  PROPOSAL_DELETE: 'proposal.delete',
  PROPOSAL_MANAGE: 'proposal.manage', // legal templates, e-signature settings, and contract automation

  // ─── Vendors ─────────────────────────────────────────────────────
  VENDOR_CREATE: 'vendor.create',
  VENDOR_READ:   'vendor.read',
  VENDOR_UPDATE: 'vendor.update',
  VENDOR_DELETE: 'vendor.delete',
  VENDOR_MANAGE: 'vendor.manage', // category management, compliance docs, and global vendor settings

  // ─── Escalations ─────────────────────────────────────────────────
  ESCALATION_CREATE: 'escalation.create',
  ESCALATION_READ:   'escalation.read',
  ESCALATION_UPDATE: 'escalation.update',
  ESCALATION_DELETE: 'escalation.delete',
  ESCALATION_MANAGE: 'escalation.manage', // SLA policies, notification matrix, and rules engine

  // ─── Employee Exit ───────────────────────────────────────────────
  EXIT_CREATE: 'exit.create',
  EXIT_READ:   'exit.read',
  EXIT_UPDATE: 'exit.update',
  EXIT_MANAGE: 'exit.manage', // exit interview templates, clearing checklists, and separation data

  // ─── Performance ─────────────────────────────────────────────────
  PERFORMANCE_READ:   'performance.read',
  PERFORMANCE_MANAGE: 'performance.manage', // review cycle management, goal settings, and appraisal forms

  // ─── Job Openings ───────────────────────────────────────────────
  OPENING_CREATE: 'opening.create',
  OPENING_READ:   'opening.read',
  OPENING_UPDATE: 'opening.update',
  OPENING_DELETE: 'opening.delete',
  OPENING_MANAGE: 'opening.manage', // external career portal settings, hiring workflows, and ATS config

  // ─── User Profile ───────────────────────────────────────────────
  PROFILE_CREATE: 'profile.create',
  PROFILE_READ:   'profile.read',
  PROFILE_UPDATE: 'profile.update',
  PROFILE_DELETE: 'profile.delete',
  PROFILE_MANAGE: 'profile.manage', // profile templates, custom profile fields, and visibility rules

  // ─── System / General ────────────────────────────────────────────
  MAIL_CREATE:       'mail.create',
  MAIL_READ:         'mail.read',
  MAIL_UPDATE:       'mail.update',
  MAIL_DELETE:       'mail.delete',
  MAIL_MANAGE:       'mail.manage', // global email retention, organization-wide filters, and admin access

  CALENDAR_CREATE:   'calendar.create',
  CALENDAR_READ:     'calendar.read',
  CALENDAR_UPDATE:   'calendar.update',
  CALENDAR_DELETE:   'calendar.delete',
  CALENDAR_MANAGE:   'calendar.manage', // shared resource calendars, global holiday sync, and booking rules

  CHAT_CREATE:       'chat.create',
  CHAT_READ:         'chat.read',
  CHAT_UPDATE:       'chat.update',
  CHAT_DELETE:       'chat.delete',
  CHAT_MANAGE:       'chat.manage', // channel governance, data archiving, and moderation controls

  SKILLS_CREATE:     'skills.create',
  SKILLS_READ:       'skills.read',
  SKILLS_UPDATE:     'skills.update',
  SKILLS_DELETE:     'skills.delete',
  SKILLS_MANAGE:     'skills.manage', // competency matrix, training catalog, and certification tracking

  NOTIFICATION_READ: 'notification.read',
  BOOKMARK_READ:     'bookmark.read',
} as const;

export type Permission = (typeof Permissions)[keyof typeof Permissions];

/**
 * All permissions grouped by resource for UI rendering (permission picker).
 */
export const PERMISSIONS_BY_RESOURCE: Record<string, Permission[]> = {
  dashboard:    [Permissions.DASHBOARD_READ],
  integration:  [Permissions.INTEGRATION_READ, Permissions.INTEGRATION_MANAGE],
  user:         [Permissions.USER_CREATE, Permissions.USER_READ, Permissions.USER_UPDATE, Permissions.USER_DELETE, Permissions.USER_MANAGE],
  project:      [Permissions.PROJECT_CREATE, Permissions.PROJECT_READ, Permissions.PROJECT_UPDATE, Permissions.PROJECT_DELETE, Permissions.PROJECT_MANAGE],
  ticket:       [Permissions.TICKET_CREATE, Permissions.TICKET_READ, Permissions.TICKET_UPDATE, Permissions.TICKET_DELETE, Permissions.TICKET_ASSIGN, Permissions.TICKET_ARCHIVE, Permissions.TICKET_MANAGE],
  attendance:   [Permissions.ATTENDANCE_CREATE, Permissions.ATTENDANCE_READ, Permissions.ATTENDANCE_UPDATE, Permissions.ATTENDANCE_MANAGE],
  leave:        [Permissions.LEAVE_CREATE, Permissions.LEAVE_READ, Permissions.LEAVE_UPDATE, Permissions.LEAVE_DELETE, Permissions.LEAVE_APPROVE, Permissions.LEAVE_MANAGE],
  shift:        [Permissions.SHIFT_CREATE, Permissions.SHIFT_READ, Permissions.SHIFT_UPDATE, Permissions.SHIFT_DELETE, Permissions.SHIFT_MANAGE],
  invoice:      [Permissions.INVOICE_CREATE, Permissions.INVOICE_READ, Permissions.INVOICE_UPDATE, Permissions.INVOICE_DELETE, Permissions.INVOICE_MANAGE],
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
  lead:         [Permissions.LEAD_CREATE, Permissions.LEAD_READ, Permissions.LEAD_UPDATE, Permissions.LEAD_DELETE, Permissions.LEAD_MANAGE],
  proposal:     [Permissions.PROPOSAL_CREATE, Permissions.PROPOSAL_READ, Permissions.PROPOSAL_UPDATE, Permissions.PROPOSAL_DELETE, Permissions.PROPOSAL_MANAGE],
  vendor:       [Permissions.VENDOR_CREATE, Permissions.VENDOR_READ, Permissions.VENDOR_UPDATE, Permissions.VENDOR_DELETE, Permissions.VENDOR_MANAGE],
  escalation:   [Permissions.ESCALATION_CREATE, Permissions.ESCALATION_READ, Permissions.ESCALATION_UPDATE, Permissions.ESCALATION_DELETE, Permissions.ESCALATION_MANAGE],
  exit:         [Permissions.EXIT_CREATE, Permissions.EXIT_READ, Permissions.EXIT_UPDATE, Permissions.EXIT_MANAGE],
  performance:  [Permissions.PERFORMANCE_READ, Permissions.PERFORMANCE_MANAGE],
  opening:      [Permissions.OPENING_CREATE, Permissions.OPENING_READ, Permissions.OPENING_UPDATE, Permissions.OPENING_DELETE, Permissions.OPENING_MANAGE],
  profile:      [Permissions.PROFILE_CREATE, Permissions.PROFILE_READ, Permissions.PROFILE_UPDATE, Permissions.PROFILE_DELETE, Permissions.PROFILE_MANAGE],
  system:       [
    Permissions.MAIL_CREATE, Permissions.MAIL_READ, Permissions.MAIL_UPDATE, Permissions.MAIL_DELETE, Permissions.MAIL_MANAGE,
    Permissions.CALENDAR_CREATE, Permissions.CALENDAR_READ, Permissions.CALENDAR_UPDATE, Permissions.CALENDAR_DELETE, Permissions.CALENDAR_MANAGE,
    Permissions.CHAT_CREATE, Permissions.CHAT_READ, Permissions.CHAT_UPDATE, Permissions.CHAT_DELETE, Permissions.CHAT_MANAGE,
    Permissions.SKILLS_CREATE, Permissions.SKILLS_READ, Permissions.SKILLS_UPDATE, Permissions.SKILLS_DELETE, Permissions.SKILLS_MANAGE,
    Permissions.NOTIFICATION_READ, Permissions.BOOKMARK_READ
  ],
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
