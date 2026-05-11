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
  ATTENDANCE_DASHBOARD_READ: 'attendance.dashboard.read',
  ATTENDANCE_CLOCK_IN_OUT:   'attendance.clock.in_out',

  // ─── Leaves ──────────────────────────────────────────────────────
  LEAVE_DASHBOARD_READ: 'leave.dashboard.read',
  LEAVE_CREATE:  'leave.create',
  LEAVE_READ:    'leave.read',
  LEAVE_UPDATE:  'leave.update',
  LEAVE_DELETE:  'leave.delete',
  LEAVE_APPROVE: 'leave.approve',
  LEAVE_TYPE_READ:   'leave.type.read',
  LEAVE_TYPE_CREATE: 'leave.type.create',
  LEAVE_TYPE_UPDATE: 'leave.type.update',
  LEAVE_TYPE_DELETE: 'leave.type.delete',
  LEAVE_POLICY_READ:   'leave.policy.read',
  LEAVE_POLICY_CREATE: 'leave.policy.create',
  LEAVE_POLICY_UPDATE: 'leave.policy.update',
  LEAVE_POLICY_DELETE: 'leave.policy.delete',
  LEAVE_ADJUSTMENT_READ:   'leave.adjustment.read',
  LEAVE_ADJUSTMENT_CREATE: 'leave.adjustment.create',
  LEAVE_ADJUSTMENT_UPDATE: 'leave.adjustment.update',
  LEAVE_ADJUSTMENT_DELETE: 'leave.adjustment.delete',
  LEAVE_HOLIDAY_READ:   'leave.holiday.read',
  LEAVE_HOLIDAY_CREATE: 'leave.holiday.create',
  LEAVE_HOLIDAY_UPDATE: 'leave.holiday.update',
  LEAVE_HOLIDAY_DELETE: 'leave.holiday.delete',
  LEAVE_TRASH_READ:    'leave.trash.read',
  LEAVE_TRASH_RESTORE: 'leave.trash.restore',
  LEAVE_TRASH_DELETE:  'leave.trash.delete',
  LEAVE_MANAGE:  'leave.manage',   // view all, configure types

  // ─── Shifts ──────────────────────────────────────────────────────
  SHIFT_CREATE: 'shift.create',
  SHIFT_READ:   'shift.read',
  SHIFT_UPDATE: 'shift.update',
  SHIFT_DELETE: 'shift.delete',
  SHIFT_MANAGE: 'shift.manage',   // managing shift rotations, rosters, and global shift schedules

  // ─── Invoices ────────────────────────────────────────────────────
  INVOICE_DASHBOARD_READ: 'invoice.dashboard.read',
  INVOICE_CREATE:         'invoice.create',
  INVOICE_READ:           'invoice.read',
  INVOICE_UPDATE:         'invoice.update',
  INVOICE_DELETE:         'invoice.delete',
  INVOICE_MANAGE:         'invoice.manage',
  INVOICE_TEMPLATE_READ:   'invoice.template.read',
  INVOICE_TEMPLATE_CREATE: 'invoice.template.create',
  INVOICE_TEMPLATE_UPDATE: 'invoice.template.update',
  INVOICE_TEMPLATE_DELETE: 'invoice.template.delete',
  INVOICE_CUSTOMER_READ:   'invoice.customer.read',
  INVOICE_CUSTOMER_CREATE: 'invoice.customer.create',
  INVOICE_CUSTOMER_UPDATE: 'invoice.customer.update',
  INVOICE_CUSTOMER_DELETE: 'invoice.customer.delete',
  INVOICE_SETTING_READ:    'invoice.setting.read',
  INVOICE_SETTING_CREATE:  'invoice.setting.create',
  INVOICE_SETTING_UPDATE:  'invoice.setting.update',
  INVOICE_SETTING_DELETE:  'invoice.setting.delete',
  INVOICE_TRASH_READ:      'invoice.trash.read',
  INVOICE_TRASH_CREATE:    'invoice.trash.create',
  INVOICE_TRASH_UPDATE:    'invoice.trash.update',
  INVOICE_TRASH_DELETE:    'invoice.trash.delete',
  INVOICE_HISTORY_READ:    'invoice.history.read',
  INVOICE_MAIL_SEND:       'invoice.mail.send',
  INVOICE_STATUS_UPDATE:   'invoice.status.update',

  // ─── Accounts ─────────────────────────────────────────────────────
  ACCOUNT_READ:           'account.read',
  ACCOUNT_CREATE:         'account.create',
  ACCOUNT_UPDATE:         'account.update',
  ACCOUNT_DELETE:         'account.delete',
  ACCOUNT_MANAGE:         'account.manage',
  ACCOUNT_CHART_READ:     'account.chart.read',
  ACCOUNT_CHART_CREATE:   'account.chart.create',
  ACCOUNT_CHART_UPDATE:   'account.chart.update',
  ACCOUNT_CHART_DELETE:   'account.chart.delete',
  ACCOUNT_BANK_READ:      'account.bank.read',
  ACCOUNT_BANK_CREATE:    'account.bank.create',
  ACCOUNT_BANK_UPDATE:    'account.bank.update',
  ACCOUNT_BANK_DELETE:    'account.bank.delete',
  ACCOUNT_SETTING_READ:    'account.setting.read',
  ACCOUNT_SETTING_CREATE:  'account.setting.create',
  ACCOUNT_SETTING_UPDATE:  'account.setting.update',
  ACCOUNT_SETTING_DELETE:  'account.setting.delete',
  ACCOUNT_TRASH_READ:      'account.trash.read',
  ACCOUNT_TRASH_CREATE:    'account.trash.create',
  ACCOUNT_TRASH_UPDATE:    'account.trash.update',
  ACCOUNT_TRASH_DELETE:    'account.trash.delete',
  ACCOUNT_CONFIG_READ:     'account.config.read',
  ACCOUNT_CONFIG_CREATE:   'account.config.create',
  ACCOUNT_CONFIG_UPDATE:   'account.config.update',
  ACCOUNT_CONFIG_DELETE:   'account.config.delete',

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
  REIMBURSEMENT_DASHBOARD_READ: 'reimbursement.dashboard.read',
  REIMBURSEMENT_READ:           'reimbursement.read',
  REIMBURSEMENT_CREATE:         'reimbursement.create',
  REIMBURSEMENT_UPDATE:         'reimbursement.update',
  REIMBURSEMENT_DELETE:         'reimbursement.delete',
  REIMBURSEMENT_APPROVE:        'reimbursement.approve',
  REIMBURSEMENT_PAY:            'reimbursement.pay',
  REIMBURSEMENT_CATEGORY_READ:   'reimbursement.category.read',
  REIMBURSEMENT_CATEGORY_CREATE: 'reimbursement.category.create',
  REIMBURSEMENT_CATEGORY_UPDATE: 'reimbursement.category.update',
  REIMBURSEMENT_CATEGORY_DELETE: 'reimbursement.category.delete',
  REIMBURSEMENT_SETTING_READ:    'reimbursement.setting.read',
  REIMBURSEMENT_SETTING_CREATE:  'reimbursement.setting.create',
  REIMBURSEMENT_SETTING_UPDATE:  'reimbursement.setting.update',
  REIMBURSEMENT_SETTING_DELETE:  'reimbursement.setting.delete',
  REIMBURSEMENT_TRASH_READ:      'reimbursement.trash.read',
  REIMBURSEMENT_TRASH_CREATE:    'reimbursement.trash.create',
  REIMBURSEMENT_TRASH_UPDATE:    'reimbursement.trash.update',
  REIMBURSEMENT_TRASH_DELETE:    'reimbursement.trash.delete',
  REIMBURSEMENT_CONFIG_READ:     'reimbursement.config.read',
  REIMBURSEMENT_CONFIG_UPDATE:   'reimbursement.config.update',
  REIMBURSEMENT_MANAGE:          'reimbursement.manage',

  // ─── Payroll ──────────────────────────────────────────────────────
  PAYROLL_DASHBOARD_READ: 'payroll.dashboard.read',
  PAYROLL_READ:           'payroll.read',
  PAYROLL_CREATE:         'payroll.create',
  PAYROLL_UPDATE:         'payroll.update',
  PAYROLL_DELETE:         'payroll.delete',
  PAYROLL_APPROVE:        'payroll.approve',
  PAYROLL_PAY:            'payroll.pay',
  PAYROLL_PAYSLIP_READ:   'payroll.payslip.read',
  PAYROLL_PAYSLIP_CREATE: 'payroll.payslip.create',
  PAYROLL_PAYSLIP_DELETE: 'payroll.payslip.delete',
  PAYROLL_PAYSLIP_SEND:   'payroll.payslip.send',
  PAYROLL_STRUCTURE_READ:   'payroll.structure.read',
  PAYROLL_STRUCTURE_CREATE: 'payroll.structure.create',
  PAYROLL_STRUCTURE_UPDATE: 'payroll.structure.update',
  PAYROLL_STRUCTURE_DELETE: 'payroll.structure.delete',
  PAYROLL_SETTING_READ:    'payroll.setting.read',
  PAYROLL_SETTING_CREATE:  'payroll.setting.create',
  PAYROLL_SETTING_UPDATE:  'payroll.setting.update',
  PAYROLL_SETTING_DELETE:  'payroll.setting.delete',
  PAYROLL_TRASH_READ:      'payroll.trash.read',
  PAYROLL_TRASH_CREATE:    'payroll.trash.create',
  PAYROLL_TRASH_UPDATE:    'payroll.trash.update',
  PAYROLL_TRASH_DELETE:    'payroll.trash.delete',
  PAYROLL_PROCESS:         'payroll.process',
  PAYROLL_MANAGE:          'payroll.manage',
  SALARY_READ:             'salary.read',
  SALARY_APPROVE:          'salary.approve',
  SALARY_MANAGE:           'salary.manage',

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
  ONBOARDING_ONBOARDED_READ: 'onboarding.onboarded.read',
  ONBOARDING_SETTING_READ:   'onboarding.setting.read',
  ONBOARDING_SETTING_UPDATE: 'onboarding.setting.update',

  // ─── Timesheet ───────────────────────────────────────────────────
  TIMESHEET_CREATE:  'timesheet.create',
  TIMESHEET_READ:    'timesheet.read',
  TIMESHEET_UPDATE:  'timesheet.update',
  TIMESHEET_APPROVE: 'timesheet.approve',
  TIMESHEET_MANAGE:  'timesheet.manage', // overriding timesheets, setting billing rates, and reporting

  // ─── Org Structure ───────────────────────────────────────────────
  ORG_DASHBOARD_READ: 'org.dashboard.read',
  ORG_READ:   'org.read',
  ORG_DEPARTMENT_READ:   'org.department.read',
  ORG_DEPARTMENT_CREATE: 'org.department.create',
  ORG_DEPARTMENT_UPDATE: 'org.department.update',
  ORG_DEPARTMENT_DELETE: 'org.department.delete',
  ORG_GRADE_READ:   'org.grade.read',
  ORG_GRADE_CREATE: 'org.grade.create',
  ORG_GRADE_UPDATE: 'org.grade.grade.update',
  ORG_GRADE_DELETE: 'org.grade.delete',
  ORG_POSITION_READ:   'org.position.read',
  ORG_POSITION_CREATE: 'org.position.create',
  ORG_POSITION_UPDATE: 'org.position.update',
  ORG_POSITION_DELETE: 'org.position.delete',
  ORG_EMPLOYMENT_TYPE_READ:   'org.employment_type.read',
  ORG_EMPLOYMENT_TYPE_CREATE: 'org.employment_type.create',
  ORG_EMPLOYMENT_TYPE_UPDATE: 'org.employment_type.update',
  ORG_EMPLOYMENT_TYPE_DELETE: 'org.employment_type.delete',
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

  // ─── Pipeline ────────────────────────────────────────────────────
  PIPELINE_CREATE: 'pipeline.create',
  PIPELINE_READ:   'pipeline.read',
  PIPELINE_UPDATE: 'pipeline.update',
  PIPELINE_DELETE: 'pipeline.delete',
  PIPELINE_MANAGE: 'pipeline.manage', // pipeline stages, automation rules, and global sales workflows
  PIPELINE_BOARD_READ:    'pipeline.board.read',
  PIPELINE_BOARD_CREATE:  'pipeline.board.create',
  PIPELINE_BOARD_UPDATE:  'pipeline.board.update',
  PIPELINE_BOARD_DELETE:  'pipeline.board.delete',
  PIPELINE_DEALS_READ:    'pipeline.deals.read',
  PIPELINE_DEALS_CREATE:  'pipeline.deals.create',
  PIPELINE_DEALS_UPDATE:  'pipeline.deals.update',
  PIPELINE_DEALS_DELETE:  'pipeline.deals.delete',
  PIPELINE_FORECAST_READ: 'pipeline.forecast.read',
  PIPELINE_SETTING_READ:   'pipeline.setting.read',
  PIPELINE_SETTING_UPDATE: 'pipeline.setting.update',

  // ─── Employee Exit ───────────────────────────────────────────────
  EXIT_CREATE: 'exit.create',
  EXIT_READ:   'exit.read',
  EXIT_UPDATE: 'exit.update',
  EXIT_MANAGE: 'exit.manage', // exit interview templates, clearing checklists, and separation data
  EXIT_CONFIG_READ:   'exit.config.read',
  EXIT_CONFIG_UPDATE: 'exit.config.update',

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

  // ─── Time Tracking ───────────────────────────────────────────────
  TIME_TRACKING_CREATE: 'time_tracking.create',
  TIME_TRACKING_READ:   'time_tracking.read',
  TIME_TRACKING_UPDATE: 'time_tracking.update',
  TIME_TRACKING_DELETE: 'time_tracking.delete',
  TIME_TRACKING_MANAGE: 'time_tracking.manage',
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
  attendance:   [
    Permissions.ATTENDANCE_CREATE,
    Permissions.ATTENDANCE_READ,
    Permissions.ATTENDANCE_UPDATE,
    Permissions.ATTENDANCE_MANAGE,
    Permissions.ATTENDANCE_DASHBOARD_READ,
    Permissions.ATTENDANCE_CLOCK_IN_OUT,
  ],
  leave:        [
    Permissions.LEAVE_DASHBOARD_READ,
    Permissions.LEAVE_CREATE,
    Permissions.LEAVE_READ,
    Permissions.LEAVE_UPDATE,
    Permissions.LEAVE_DELETE,
    Permissions.LEAVE_APPROVE,
    Permissions.LEAVE_TYPE_READ,
    Permissions.LEAVE_TYPE_CREATE,
    Permissions.LEAVE_TYPE_UPDATE,
    Permissions.LEAVE_TYPE_DELETE,
    Permissions.LEAVE_POLICY_READ,
    Permissions.LEAVE_POLICY_CREATE,
    Permissions.LEAVE_POLICY_UPDATE,
    Permissions.LEAVE_POLICY_DELETE,
    Permissions.LEAVE_ADJUSTMENT_READ,
    Permissions.LEAVE_ADJUSTMENT_CREATE,
    Permissions.LEAVE_ADJUSTMENT_UPDATE,
    Permissions.LEAVE_ADJUSTMENT_DELETE,
    Permissions.LEAVE_HOLIDAY_READ,
    Permissions.LEAVE_HOLIDAY_CREATE,
    Permissions.LEAVE_HOLIDAY_UPDATE,
    Permissions.LEAVE_HOLIDAY_DELETE,
    Permissions.LEAVE_MANAGE
  ],
  shift:        [Permissions.SHIFT_CREATE, Permissions.SHIFT_READ, Permissions.SHIFT_UPDATE, Permissions.SHIFT_DELETE, Permissions.SHIFT_MANAGE],
  invoice: [
    Permissions.INVOICE_DASHBOARD_READ,
    Permissions.INVOICE_CREATE,
    Permissions.INVOICE_READ,
    Permissions.INVOICE_UPDATE,
    Permissions.INVOICE_DELETE,
    Permissions.INVOICE_TEMPLATE_READ,
    Permissions.INVOICE_TEMPLATE_CREATE,
    Permissions.INVOICE_TEMPLATE_UPDATE,
    Permissions.INVOICE_TEMPLATE_DELETE,
    Permissions.INVOICE_CUSTOMER_READ,
    Permissions.INVOICE_CUSTOMER_CREATE,
    Permissions.INVOICE_CUSTOMER_UPDATE,
    Permissions.INVOICE_CUSTOMER_DELETE,
    Permissions.INVOICE_SETTING_READ,
    Permissions.INVOICE_SETTING_CREATE,
    Permissions.INVOICE_SETTING_UPDATE,
    Permissions.INVOICE_SETTING_DELETE,
    Permissions.INVOICE_TRASH_READ,
    Permissions.INVOICE_TRASH_CREATE,
    Permissions.INVOICE_TRASH_UPDATE,
    Permissions.INVOICE_TRASH_DELETE,
    Permissions.INVOICE_HISTORY_READ,
    Permissions.INVOICE_MAIL_SEND,
    Permissions.INVOICE_STATUS_UPDATE,
    Permissions.INVOICE_MANAGE,
  ],
  account: [
    Permissions.ACCOUNT_READ,
    Permissions.ACCOUNT_CREATE,
    Permissions.ACCOUNT_UPDATE,
    Permissions.ACCOUNT_DELETE,
    Permissions.ACCOUNT_CHART_READ,
    Permissions.ACCOUNT_CHART_CREATE,
    Permissions.ACCOUNT_CHART_UPDATE,
    Permissions.ACCOUNT_CHART_DELETE,
    Permissions.ACCOUNT_BANK_READ,
    Permissions.ACCOUNT_BANK_CREATE,
    Permissions.ACCOUNT_BANK_UPDATE,
    Permissions.ACCOUNT_BANK_DELETE,
    Permissions.ACCOUNT_SETTING_READ,
    Permissions.ACCOUNT_SETTING_CREATE,
    Permissions.ACCOUNT_SETTING_UPDATE,
    Permissions.ACCOUNT_SETTING_DELETE,
    Permissions.ACCOUNT_TRASH_READ,
    Permissions.ACCOUNT_TRASH_CREATE,
    Permissions.ACCOUNT_TRASH_UPDATE,
    Permissions.ACCOUNT_TRASH_DELETE,
    Permissions.ACCOUNT_CONFIG_READ,
    Permissions.ACCOUNT_CONFIG_CREATE,
    Permissions.ACCOUNT_CONFIG_UPDATE,
    Permissions.ACCOUNT_CONFIG_DELETE,
    Permissions.ACCOUNT_MANAGE,
  ],
  reimbursement: [
    Permissions.REIMBURSEMENT_DASHBOARD_READ,
    Permissions.REIMBURSEMENT_READ,
    Permissions.REIMBURSEMENT_CREATE,
    Permissions.REIMBURSEMENT_UPDATE,
    Permissions.REIMBURSEMENT_DELETE,
    Permissions.REIMBURSEMENT_APPROVE,
    Permissions.REIMBURSEMENT_PAY,
    Permissions.REIMBURSEMENT_CATEGORY_READ,
    Permissions.REIMBURSEMENT_CATEGORY_CREATE,
    Permissions.REIMBURSEMENT_CATEGORY_UPDATE,
    Permissions.REIMBURSEMENT_CATEGORY_DELETE,
    Permissions.REIMBURSEMENT_SETTING_READ,
    Permissions.REIMBURSEMENT_SETTING_CREATE,
    Permissions.REIMBURSEMENT_SETTING_UPDATE,
    Permissions.REIMBURSEMENT_SETTING_DELETE,
    Permissions.REIMBURSEMENT_TRASH_READ,
    Permissions.REIMBURSEMENT_TRASH_CREATE,
    Permissions.REIMBURSEMENT_TRASH_UPDATE,
    Permissions.REIMBURSEMENT_TRASH_DELETE,
    Permissions.REIMBURSEMENT_CONFIG_READ,
    Permissions.REIMBURSEMENT_CONFIG_UPDATE,
    Permissions.REIMBURSEMENT_MANAGE,
  ],
  payroll: [
    Permissions.PAYROLL_DASHBOARD_READ,
    Permissions.PAYROLL_READ,
    Permissions.PAYROLL_CREATE,
    Permissions.PAYROLL_UPDATE,
    Permissions.PAYROLL_DELETE,
    Permissions.PAYROLL_APPROVE,
    Permissions.PAYROLL_PAY,
    Permissions.PAYROLL_PAYSLIP_READ,
    Permissions.PAYROLL_PAYSLIP_CREATE,
    Permissions.PAYROLL_PAYSLIP_DELETE,
    Permissions.PAYROLL_PAYSLIP_SEND,
    Permissions.PAYROLL_STRUCTURE_READ,
    Permissions.PAYROLL_STRUCTURE_CREATE,
    Permissions.PAYROLL_STRUCTURE_UPDATE,
    Permissions.PAYROLL_STRUCTURE_DELETE,
    Permissions.PAYROLL_SETTING_READ,
    Permissions.PAYROLL_SETTING_CREATE,
    Permissions.PAYROLL_SETTING_UPDATE,
    Permissions.PAYROLL_SETTING_DELETE,
    Permissions.PAYROLL_TRASH_READ,
    Permissions.PAYROLL_TRASH_CREATE,
    Permissions.PAYROLL_TRASH_UPDATE,
    Permissions.PAYROLL_TRASH_DELETE,
    Permissions.PAYROLL_PROCESS,
    Permissions.PAYROLL_MANAGE,
    Permissions.SALARY_READ,
    Permissions.SALARY_MANAGE,
  ],
  client:       [Permissions.CLIENT_CREATE, Permissions.CLIENT_READ, Permissions.CLIENT_UPDATE, Permissions.CLIENT_DELETE, Permissions.CLIENT_MANAGE],
  settings:     [Permissions.SETTINGS_READ, Permissions.SETTINGS_UPDATE, Permissions.SETTINGS_MANAGE],
  role:         [Permissions.ROLE_CREATE, Permissions.ROLE_READ, Permissions.ROLE_UPDATE, Permissions.ROLE_DELETE, Permissions.ROLE_ASSIGN],
  report:       [Permissions.REPORT_READ, Permissions.REPORT_MANAGE],
  document:     [Permissions.DOCUMENT_CREATE, Permissions.DOCUMENT_READ, Permissions.DOCUMENT_UPDATE, Permissions.DOCUMENT_DELETE, Permissions.DOCUMENT_MANAGE],
  onboarding:   [
    Permissions.ONBOARDING_CREATE,
    Permissions.ONBOARDING_READ,
    Permissions.ONBOARDING_UPDATE,
    Permissions.ONBOARDING_MANAGE,
    Permissions.ONBOARDING_ONBOARDED_READ,
    Permissions.ONBOARDING_SETTING_READ,
    Permissions.ONBOARDING_SETTING_UPDATE,
  ],
  timesheet:    [Permissions.TIMESHEET_CREATE, Permissions.TIMESHEET_READ, Permissions.TIMESHEET_UPDATE, Permissions.TIMESHEET_APPROVE, Permissions.TIMESHEET_MANAGE],
  org:          [
    Permissions.ORG_DASHBOARD_READ,
    Permissions.ORG_READ,
    Permissions.ORG_DEPARTMENT_READ,
    Permissions.ORG_DEPARTMENT_CREATE,
    Permissions.ORG_DEPARTMENT_UPDATE,
    Permissions.ORG_DEPARTMENT_DELETE,
    Permissions.ORG_GRADE_READ,
    Permissions.ORG_GRADE_CREATE,
    Permissions.ORG_GRADE_UPDATE,
    Permissions.ORG_GRADE_DELETE,
    Permissions.ORG_POSITION_READ,
    Permissions.ORG_POSITION_CREATE,
    Permissions.ORG_POSITION_UPDATE,
    Permissions.ORG_POSITION_DELETE,
    Permissions.ORG_EMPLOYMENT_TYPE_READ,
    Permissions.ORG_EMPLOYMENT_TYPE_CREATE,
    Permissions.ORG_EMPLOYMENT_TYPE_UPDATE,
    Permissions.ORG_EMPLOYMENT_TYPE_DELETE,
    Permissions.ORG_MANAGE
  ],
  daily_update: [Permissions.DAILY_UPDATE_CREATE, Permissions.DAILY_UPDATE_READ, Permissions.DAILY_UPDATE_MANAGE],
  squad:        [Permissions.SQUAD_CREATE, Permissions.SQUAD_READ, Permissions.SQUAD_UPDATE, Permissions.SQUAD_DELETE, Permissions.SQUAD_MANAGE],
  lead:         [Permissions.LEAD_CREATE, Permissions.LEAD_READ, Permissions.LEAD_UPDATE, Permissions.LEAD_DELETE, Permissions.LEAD_MANAGE],
  proposal:     [Permissions.PROPOSAL_CREATE, Permissions.PROPOSAL_READ, Permissions.PROPOSAL_UPDATE, Permissions.PROPOSAL_DELETE, Permissions.PROPOSAL_MANAGE],
  vendor:       [Permissions.VENDOR_CREATE, Permissions.VENDOR_READ, Permissions.VENDOR_UPDATE, Permissions.VENDOR_DELETE, Permissions.VENDOR_MANAGE],
  escalation:   [Permissions.ESCALATION_CREATE, Permissions.ESCALATION_READ, Permissions.ESCALATION_UPDATE, Permissions.ESCALATION_DELETE, Permissions.ESCALATION_MANAGE],
  pipeline:     [
    Permissions.PIPELINE_CREATE,
    Permissions.PIPELINE_READ,
    Permissions.PIPELINE_UPDATE,
    Permissions.PIPELINE_DELETE,
    Permissions.PIPELINE_MANAGE,
    Permissions.PIPELINE_BOARD_READ,
    Permissions.PIPELINE_BOARD_CREATE,
    Permissions.PIPELINE_BOARD_UPDATE,
    Permissions.PIPELINE_BOARD_DELETE,
    Permissions.PIPELINE_DEALS_READ,
    Permissions.PIPELINE_DEALS_CREATE,
    Permissions.PIPELINE_DEALS_UPDATE,
    Permissions.PIPELINE_DEALS_DELETE,
    Permissions.PIPELINE_FORECAST_READ,
    Permissions.PIPELINE_SETTING_READ,
    Permissions.PIPELINE_SETTING_UPDATE,
  ],
  exit:         [
    Permissions.EXIT_CREATE,
    Permissions.EXIT_READ,
    Permissions.EXIT_UPDATE,
    Permissions.EXIT_MANAGE,
    Permissions.EXIT_CONFIG_READ,
    Permissions.EXIT_CONFIG_UPDATE,
  ],
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
  time_tracking: [
    Permissions.TIME_TRACKING_CREATE,
    Permissions.TIME_TRACKING_READ,
    Permissions.TIME_TRACKING_UPDATE,
    Permissions.TIME_TRACKING_DELETE,
    Permissions.TIME_TRACKING_MANAGE,
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
