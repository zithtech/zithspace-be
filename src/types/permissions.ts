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
  USER_CREATE: 'user.create',
  USER_READ: 'user.read',
  USER_UPDATE: 'user.update',
  USER_DELETE: 'user.delete',
  USER_MANAGE: 'user.manage',   // activate/deactivate, reset password, assign shift
  USER_TRASH_READ: 'user.trash.read',
  USER_TRASH_RESTORE: 'user.trash.restore',
  USER_TRASH_DELETE: 'user.trash.delete',

  // ─── Projects ────────────────────────────────────────────────────
  PROJECT_CREATE: 'project.create',
  PROJECT_READ: 'project.read',
  PROJECT_UPDATE: 'project.update',
  PROJECT_DELETE: 'project.delete',
  PROJECT_TRASH_READ: 'project.trash.read',
  PROJECT_TRASH_RESTORE: 'project.trash.restore',
  PROJECT_TRASH_DELETE: 'project.trash.delete',
  PROJECT_MANAGE: 'project.manage',  // add/remove members, view all projects

  // ─── Tickets ─────────────────────────────────────────────────────
  TICKET_CREATE: 'ticket.create',
  TICKET_READ: 'ticket.read',
  TICKET_UPDATE: 'ticket.update',
  TICKET_DELETE: 'ticket.delete',
  TICKET_ASSIGN: 'ticket.assign',
  TICKET_BUCKET_READ: 'ticket.bucket.read',
  TICKET_BUCKET_CREATE: 'ticket.bucket.create',
  TICKET_BUCKET_UPDATE: 'ticket.bucket.update',
  TICKET_BUCKET_DELETE: 'ticket.bucket.delete',
  TICKET_SETTING_READ: 'ticket.setting.read',
  TICKET_SETTING_CREATE: 'ticket.setting.create',
  TICKET_SETTING_UPDATE: 'ticket.setting.update',
  TICKET_SETTING_DELETE: 'ticket.setting.delete',
  TICKET_TRASH_READ: 'ticket.trash.read',
  TICKET_TRASH_RESTORE: 'ticket.trash.restore',
  TICKET_TRASH_DELETE: 'ticket.trash.delete',
  TICKET_ARCHIVE_READ: 'ticket.archive.read',
  TICKET_ARCHIVE_RESTORE: 'ticket.archive.restore',
  TICKET_PLAN_CREATE: 'ticket.plan.create',
  TICKET_PLAN_READ: 'ticket.plan.read',
  TICKET_PLAN_UPDATE: 'ticket.plan.update',
  TICKET_PLAN_DELETE: 'ticket.plan.delete',
  TICKET_MANAGE: 'ticket.manage',   // bulk ops, workflow management

  // ─── Bug List (QA workspace; converts to tickets) ────────────────
  BUG_CREATE: 'bug.create',
  BUG_READ: 'bug.read',
  BUG_UPDATE: 'bug.update',
  BUG_DELETE: 'bug.delete',
  BUG_TRASH_READ: 'bug.trash.read',
  BUG_TRASH_RESTORE: 'bug.trash.restore',
  BUG_TRASH_DELETE: 'bug.trash.delete',
  BUG_ARCHIVE_READ: 'bug.archive.read',
  BUG_ARCHIVE_RESTORE: 'bug.archive.restore',
  BUG_MANAGE: 'bug.manage',

  // ─── Attendance ──────────────────────────────────────────────────
  ATTENDANCE_CREATE: 'attendance.create',
  ATTENDANCE_READ: 'attendance.read',
  ATTENDANCE_UPDATE: 'attendance.update',
  ATTENDANCE_DELETE: 'attendance.delete',
  ATTENDANCE_DASHBOARD_READ: 'attendance.dashboard.read',
  ATTENDANCE_CLOCK_IN_OUT: 'attendance.clock.in_out',

  // ─── Leaves ──────────────────────────────────────────────────────
  LEAVE_DASHBOARD_READ: 'leave.dashboard.read',
  LEAVE_CREATE: 'leave.create',
  LEAVE_READ: 'leave.read',
  LEAVE_UPDATE: 'leave.update',
  LEAVE_DELETE: 'leave.delete',
  LEAVE_APPROVE: 'leave.approve',
  LEAVE_TYPE_READ: 'leave.type.read',
  LEAVE_TYPE_CREATE: 'leave.type.create',
  LEAVE_TYPE_UPDATE: 'leave.type.update',
  LEAVE_TYPE_DELETE: 'leave.type.delete',
  LEAVE_POLICY_READ: 'leave.policy.read',
  LEAVE_POLICY_CREATE: 'leave.policy.create',
  LEAVE_POLICY_UPDATE: 'leave.policy.update',
  LEAVE_POLICY_DELETE: 'leave.policy.delete',
  LEAVE_ADJUSTMENT_READ: 'leave.adjustment.read',
  LEAVE_ADJUSTMENT_CREATE: 'leave.adjustment.create',
  LEAVE_ADJUSTMENT_UPDATE: 'leave.adjustment.update',
  LEAVE_ADJUSTMENT_DELETE: 'leave.adjustment.delete',
  LEAVE_HOLIDAY_READ: 'leave.holiday.read',
  LEAVE_HOLIDAY_CREATE: 'leave.holiday.create',
  LEAVE_HOLIDAY_UPDATE: 'leave.holiday.update',
  LEAVE_HOLIDAY_DELETE: 'leave.holiday.delete',
  LEAVE_TRASH_READ: 'leave.trash.read',
  LEAVE_TRASH_RESTORE: 'leave.trash.restore',
  LEAVE_TRASH_DELETE: 'leave.trash.delete',
  LEAVE_MANAGE: 'leave.manage',   // view all, configure types

  // ─── Shifts ──────────────────────────────────────────────────────
  SHIFT_CREATE: 'shift.create',
  SHIFT_READ: 'shift.read',
  SHIFT_UPDATE: 'shift.update',
  SHIFT_DELETE: 'shift.delete',
  SHIFT_MANAGE: 'shift.manage',   // managing shift rotations, rosters, and global shift schedules

  // ─── Invoices ────────────────────────────────────────────────────
  INVOICE_DASHBOARD_READ: 'invoice.dashboard.read',
  INVOICE_CREATE: 'invoice.create',
  INVOICE_READ: 'invoice.read',
  INVOICE_UPDATE: 'invoice.update',
  INVOICE_DELETE: 'invoice.delete',
  INVOICE_MANAGE: 'invoice.manage',
  INVOICE_TEMPLATE_READ: 'invoice.template.read',
  INVOICE_TEMPLATE_CREATE: 'invoice.template.create',
  INVOICE_TEMPLATE_UPDATE: 'invoice.template.update',
  INVOICE_TEMPLATE_DELETE: 'invoice.template.delete',
  INVOICE_CUSTOMER_READ: 'invoice.customer.read',
  INVOICE_CUSTOMER_CREATE: 'invoice.customer.create',
  INVOICE_CUSTOMER_UPDATE: 'invoice.customer.update',
  INVOICE_CUSTOMER_DELETE: 'invoice.customer.delete',
  INVOICE_SETTING_READ: 'invoice.setting.read',
  INVOICE_SETTING_CREATE: 'invoice.setting.create',
  INVOICE_SETTING_UPDATE: 'invoice.setting.update',
  INVOICE_SETTING_DELETE: 'invoice.setting.delete',
  INVOICE_TRASH_READ: 'invoice.trash.read',
  INVOICE_TRASH_CREATE: 'invoice.trash.create',
  INVOICE_TRASH_UPDATE: 'invoice.trash.update',
  INVOICE_TRASH_DELETE: 'invoice.trash.delete',
  INVOICE_HISTORY_READ: 'invoice.history.read',
  INVOICE_MAIL_SEND: 'invoice.mail.send',
  INVOICE_STATUS_UPDATE: 'invoice.status.update',

  // ─── Accounts ─────────────────────────────────────────────────────
  ACCOUNT_READ: 'account.read',
  ACCOUNT_CREATE: 'account.create',
  ACCOUNT_UPDATE: 'account.update',
  ACCOUNT_DELETE: 'account.delete',
  ACCOUNT_MANAGE: 'account.manage',
  ACCOUNT_SETTING_READ: 'account.setting.read',
  ACCOUNT_SETTING_CREATE: 'account.setting.create',
  ACCOUNT_SETTING_UPDATE: 'account.setting.update',
  ACCOUNT_SETTING_DELETE: 'account.setting.delete',


  // ─── Clients ─────────────────────────────────────────────────────
  CLIENT_CREATE: 'client.create',
  CLIENT_READ: 'client.read',
  CLIENT_UPDATE: 'client.update',
  CLIENT_DELETE: 'client.delete',
  CLIENT_MANAGE: 'client.manage', // bulk client imports, portal settings, and custom fields

  // ─── Settings ────────────────────────────────────────────────────
  SETTINGS_READ: 'settings.read',
  SETTINGS_UPDATE: 'settings.update',
  SETTINGS_DELETE: 'settings.delete',
  SETTINGS_MANAGE: 'settings.manage',  // global system preferences and core branding

  // ─── Roles / RBAC management ─────────────────────────────────────
  ROLE_CREATE: 'role.create',
  ROLE_READ: 'role.read',
  ROLE_UPDATE: 'role.update',
  ROLE_DELETE: 'role.delete',
  ROLE_ASSIGN: 'role.assign',   // assign/remove roles from users

  // ─── Reports ─────────────────────────────────────────────────────
  REPORT_READ: 'report.read',
  REPORT_MANAGE: 'report.manage', // global report templates and data export scheduling

  // ─── Reimbursement ───────────────────────────────────────────────
  REIMBURSEMENT_DASHBOARD_READ: 'reimbursement.dashboard.read',
  REIMBURSEMENT_READ: 'reimbursement.read',
  REIMBURSEMENT_CREATE: 'reimbursement.create',
  REIMBURSEMENT_UPDATE: 'reimbursement.update',
  REIMBURSEMENT_DELETE: 'reimbursement.delete',
  REIMBURSEMENT_APPROVE: 'reimbursement.approve',
  REIMBURSEMENT_PAY: 'reimbursement.pay',
  REIMBURSEMENT_CATEGORY_READ: 'reimbursement.category.read',
  REIMBURSEMENT_CATEGORY_CREATE: 'reimbursement.category.create',
  REIMBURSEMENT_CATEGORY_UPDATE: 'reimbursement.category.update',
  REIMBURSEMENT_CATEGORY_DELETE: 'reimbursement.category.delete',
  REIMBURSEMENT_SETTING_READ: 'reimbursement.setting.read',
  REIMBURSEMENT_SETTING_CREATE: 'reimbursement.setting.create',
  REIMBURSEMENT_SETTING_UPDATE: 'reimbursement.setting.update',
  REIMBURSEMENT_SETTING_DELETE: 'reimbursement.setting.delete',
  REIMBURSEMENT_TRASH_READ: 'reimbursement.trash.read',
  REIMBURSEMENT_TRASH_CREATE: 'reimbursement.trash.create',
  REIMBURSEMENT_TRASH_UPDATE: 'reimbursement.trash.update',
  REIMBURSEMENT_TRASH_DELETE: 'reimbursement.trash.delete',
  REIMBURSEMENT_CONFIG_READ: 'reimbursement.config.read',
  REIMBURSEMENT_CONFIG_UPDATE: 'reimbursement.config.update',
  REIMBURSEMENT_MANAGE: 'reimbursement.manage',

  // ─── Payroll ──────────────────────────────────────────────────────
  PAYROLL_DASHBOARD_READ: 'payroll.dashboard.read',
  PAYROLL_READ: 'payroll.read',
  PAYROLL_CREATE: 'payroll.create',
  PAYROLL_UPDATE: 'payroll.update',
  PAYROLL_DELETE: 'payroll.delete',
  PAYROLL_APPROVE: 'payroll.approve',
  PAYROLL_PAY: 'payroll.pay',
  PAYROLL_PAYSLIP_READ: 'payroll.payslip.read',
  PAYROLL_PAYSLIP_CREATE: 'payroll.payslip.create',
  PAYROLL_PAYSLIP_DELETE: 'payroll.payslip.delete',
  PAYROLL_PAYSLIP_SEND: 'payroll.payslip.send',
  PAYROLL_STRUCTURE_READ: 'payroll.structure.read',
  PAYROLL_STRUCTURE_CREATE: 'payroll.structure.create',
  PAYROLL_STRUCTURE_UPDATE: 'payroll.structure.update',
  PAYROLL_STRUCTURE_DELETE: 'payroll.structure.delete',
  PAYROLL_SETTING_READ: 'payroll.setting.read',
  PAYROLL_SETTING_CREATE: 'payroll.setting.create',
  PAYROLL_SETTING_UPDATE: 'payroll.setting.update',
  PAYROLL_SETTING_DELETE: 'payroll.setting.delete',
  PAYROLL_TRASH_READ: 'payroll.trash.read',
  PAYROLL_TRASH_CREATE: 'payroll.trash.create',
  PAYROLL_TRASH_UPDATE: 'payroll.trash.update',
  PAYROLL_TRASH_DELETE: 'payroll.trash.delete',
  PAYROLL_PROCESS: 'payroll.process',
  PAYROLL_MANAGE: 'payroll.manage',

  // ── Payroll 2.0 — page-based permissions (12 pages) ─────────────────────────
  // 1. General Settings
  PAYROLL_SETTINGS_READ: 'payroll.settings.read',
  PAYROLL_SETTINGS_UPDATE: 'payroll.settings.update',
  // 2. Salary Components
  PAYROLL_COMPONENTS_READ: 'payroll.components.read',
  PAYROLL_COMPONENTS_CREATE: 'payroll.components.create',
  PAYROLL_COMPONENTS_UPDATE: 'payroll.components.update',
  PAYROLL_COMPONENTS_DELETE: 'payroll.components.delete',
  // 3. Salary Structures
  PAYROLL_STRUCTURES_READ: 'payroll.structures.read',
  PAYROLL_STRUCTURES_CREATE: 'payroll.structures.create',
  PAYROLL_STRUCTURES_UPDATE: 'payroll.structures.update',
  PAYROLL_STRUCTURES_DELETE: 'payroll.structures.delete',
  // 4. Pay Schedules & Groups
  PAYROLL_SCHEDULES_READ: 'payroll.schedules.read',
  PAYROLL_SCHEDULES_CREATE: 'payroll.schedules.create',
  PAYROLL_SCHEDULES_UPDATE: 'payroll.schedules.update',
  PAYROLL_SCHEDULES_DELETE: 'payroll.schedules.delete',
  // 5. Statutory (PF & ESI)
  PAYROLL_STATUTORY_READ: 'payroll.statutory.read',
  PAYROLL_STATUTORY_UPDATE: 'payroll.statutory.update',
  // 6. Professional Tax & LWF
  PAYROLL_STATE_STATUTORY_READ: 'payroll.state_statutory.read',
  PAYROLL_STATE_STATUTORY_CREATE: 'payroll.state_statutory.create',
  PAYROLL_STATE_STATUTORY_UPDATE: 'payroll.state_statutory.update',
  PAYROLL_STATE_STATUTORY_DELETE: 'payroll.state_statutory.delete',
  // 7. Approval Workflows
  PAYROLL_WORKFLOWS_READ: 'payroll.workflows.read',
  PAYROLL_WORKFLOWS_CREATE: 'payroll.workflows.create',
  PAYROLL_WORKFLOWS_UPDATE: 'payroll.workflows.update',
  PAYROLL_WORKFLOWS_DELETE: 'payroll.workflows.delete',
  // 8. Payslip & Bank
  PAYROLL_PAYSLIP_BANK_READ: 'payroll.payslip_bank.read',
  PAYROLL_PAYSLIP_BANK_UPDATE: 'payroll.payslip_bank.update',
  // 9. Employee Pay Setup
  PAYROLL_EMPLOYEES_READ: 'payroll.employees.read',
  PAYROLL_EMPLOYEES_CREATE: 'payroll.employees.create',
  PAYROLL_EMPLOYEES_UPDATE: 'payroll.employees.update',
  PAYROLL_EMPLOYEES_DELETE: 'payroll.employees.delete',
  // 10. Run Payroll
  PAYROLL_RUN_READ: 'payroll.run.read',
  PAYROLL_RUN_CREATE: 'payroll.run.create',
  PAYROLL_RUN_PROCESS: 'payroll.run.process',
  PAYROLL_RUN_APPROVE: 'payroll.run.approve',
  PAYROLL_RUN_FINALIZE: 'payroll.run.finalize',
  PAYROLL_RUN_PAY: 'payroll.run.pay',
  PAYROLL_RUN_PAYSLIPS: 'payroll.run.payslips',
  PAYROLL_RUN_DELETE: 'payroll.run.delete',
  // 11. Reports
  PAYROLL_REPORTS_READ: 'payroll.reports.read',
  PAYROLL_REPORTS_EXPORT: 'payroll.reports.export',
  // 12. My Payslips (self-service)
  PAYROLL_MY_PAYSLIPS_READ: 'payroll.my_payslips.read',
  SALARY_READ: 'salary.read',
  SALARY_APPROVE: 'salary.approve',
  SALARY_MANAGE: 'salary.manage',

  // ─── Documents ───────────────────────────────────────────────────
  DOCUMENT_CREATE: 'document.create',
  DOCUMENT_READ: 'document.read',
  DOCUMENT_UPDATE: 'document.update',
  DOCUMENT_DELETE: 'document.delete',
  DOCUMENT_MANAGE: 'document.manage', // folder structure, version control, and global document access policies

  // ─── Onboarding ──────────────────────────────────────────────────
  ONBOARDING_CREATE: 'onboarding.create',
  ONBOARDING_READ: 'onboarding.read',
  ONBOARDING_UPDATE: 'onboarding.update',
  ONBOARDING_DELETE: 'onboarding.delete',
  ONBOARDING_SETTING_READ: 'onboarding.setting.read',
  ONBOARDING_SETTING_UPDATE: 'onboarding.setting.update',

  // ─── Performance Report ──────────────────────────────────────────
  PERFORMANCE_REPORT_READ: 'performance.report.read',
  PERFORMANCE_REPORT_SETTING_READ: 'performance.report.setting.read',
  PERFORMANCE_REPORT_SETTING_UPDATE: 'performance.report.setting.update',
  PERFORMANCE_REPORT_GENERATED_READ: 'performance.report.generated.read',
  PERFORMANCE_REPORT_MY_READ: 'performance.report.my.read',

  // ─── Timesheet ───────────────────────────────────────────────────
  TIMESHEET_CREATE: 'timesheet.create',
  TIMESHEET_READ: 'timesheet.read',
  TIMESHEET_UPDATE: 'timesheet.update',
  TIMESHEET_DELETE: 'timesheet.delete',
  TIMESHEET_APPROVE: 'timesheet.approve',
  TIMESHEET_MANAGE: 'timesheet.manage', // overriding timesheets, setting billing rates, and reporting

  // ─── Org Structure ───────────────────────────────────────────────
  ORG_DASHBOARD_READ: 'org.dashboard.read',
  ORG_READ: 'org.read',
  ORG_DEPARTMENT_READ: 'org.department.read',
  ORG_DEPARTMENT_CREATE: 'org.department.create',
  ORG_DEPARTMENT_UPDATE: 'org.department.update',
  ORG_DEPARTMENT_DELETE: 'org.department.delete',
  ORG_GRADE_READ: 'org.grade.read',
  ORG_GRADE_CREATE: 'org.grade.create',
  ORG_GRADE_UPDATE: 'org.grade.grade.update',
  ORG_GRADE_DELETE: 'org.grade.delete',
  ORG_POSITION_READ: 'org.position.read',
  ORG_POSITION_CREATE: 'org.position.create',
  ORG_POSITION_UPDATE: 'org.position.update',
  ORG_POSITION_DELETE: 'org.position.delete',
  ORG_EMPLOYMENT_TYPE_READ: 'org.employment_type.read',
  ORG_EMPLOYMENT_TYPE_CREATE: 'org.employment_type.create',
  ORG_EMPLOYMENT_TYPE_UPDATE: 'org.employment_type.update',
  ORG_EMPLOYMENT_TYPE_DELETE: 'org.employment_type.delete',
  ORG_MANAGE: 'org.manage',   // departments, grades, positions, employment types

  // ─── Daily Updates ───────────────────────────────────────────────
  DAILY_UPDATE_CREATE: 'daily_update.create',
  DAILY_UPDATE_READ: 'daily_update.read',
  DAILY_UPDATE_UPDATE: 'daily_update.update',
  DAILY_UPDATE_DELETE: 'daily_update.delete',
  DAILY_UPDATE_MANAGE_TIME: 'daily_update.manage_time', // update reminders, question templates, and compliance tracking

  // ─── Squads ──────────────────────────────────────────────────────
  SQUAD_CREATE: 'squad.create',
  SQUAD_READ: 'squad.read',
  SQUAD_UPDATE: 'squad.update',
  SQUAD_DELETE: 'squad.delete',
  SQUAD_MANAGE: 'squad.manage', // dissolving squads, changing squad leads, and cross-team settings

  // ─── Leads & CRM ─────────────────────────────────────────────────
  LEAD_CREATE: 'lead.create',
  LEAD_READ: 'lead.read',
  LEAD_UPDATE: 'lead.update',
  LEAD_DELETE: 'lead.delete',
  LEAD_SETTING_READ: 'lead.setting.read',
  LEAD_SETTING_CREATE: 'lead.setting.create',
  LEAD_SETTING_UPDATE: 'lead.setting.update',
  LEAD_SETTING_DELETE: 'lead.setting.delete',
  LEAD_TRASH_READ: 'lead.trash.read',
  LEAD_TRASH_RESTORE: 'lead.trash.restore',
  LEAD_TRASH_DELETE: 'lead.trash.delete',
  LEAD_MANAGE: 'lead.manage', // lead distribution rules, source tracking, and conversion triggers

  // ─── BidIq (AI lead intelligence) ────────────────────────────────
  BIDIQ_READ: 'bidiq.read', // view the BidIq menu and analysis list
  BIDIQ_CREATE: 'bidiq.create', // run BidIq analysis on a lead

  // ─── Proposals ───────────────────────────────────────────────────
  PROPOSAL_CREATE: 'proposal.create',
  PROPOSAL_READ: 'proposal.read',
  PROPOSAL_UPDATE: 'proposal.update',
  PROPOSAL_DELETE: 'proposal.delete',

  // ─── Vendors ─────────────────────────────────────────────────────
  VENDOR_CREATE: 'vendor.create',
  VENDOR_READ: 'vendor.read',
  VENDOR_UPDATE: 'vendor.update',
  VENDOR_DELETE: 'vendor.delete',
  VENDOR_MANAGE: 'vendor.manage', // category management, compliance docs, and global vendor settings

  // ─── Escalations ─────────────────────────────────────────────────
  ESCALATION_CREATE: 'escalation.create',
  ESCALATION_READ: 'escalation.read',
  ESCALATION_UPDATE: 'escalation.update',
  ESCALATION_DELETE: 'escalation.delete',
  ESCALATION_MANAGE: 'escalation.manage', // SLA policies, notification matrix, and rules engine

  // ─── Pipeline ────────────────────────────────────────────────────
  PIPELINE_CREATE: 'pipeline.create',
  PIPELINE_READ: 'pipeline.read',
  PIPELINE_UPDATE: 'pipeline.update',
  PIPELINE_DELETE: 'pipeline.delete',
  PIPELINE_MANAGE: 'pipeline.manage', // pipeline stages, automation rules, and global sales workflows
  PIPELINE_BOARD_READ: 'pipeline.board.read',
  PIPELINE_BOARD_CREATE: 'pipeline.board.create',
  PIPELINE_BOARD_UPDATE: 'pipeline.board.update',
  PIPELINE_BOARD_DELETE: 'pipeline.board.delete',
  PIPELINE_DEALS_READ: 'pipeline.deals.read',
  PIPELINE_DEALS_CREATE: 'pipeline.deals.create',
  PIPELINE_DEALS_UPDATE: 'pipeline.deals.update',
  PIPELINE_DEALS_DELETE: 'pipeline.deals.delete',
  PIPELINE_FORECAST_READ: 'pipeline.forecast.read',
  PIPELINE_SETTING_READ: 'pipeline.setting.read',
  PIPELINE_SETTING_UPDATE: 'pipeline.setting.update',

  // ─── Recruitment / ATS ───────────────────────────────────────────
  RECRUITMENT_CREATE: 'recruitment.create',
  RECRUITMENT_READ: 'recruitment.read',
  RECRUITMENT_UPDATE: 'recruitment.update',
  RECRUITMENT_DELETE: 'recruitment.delete',
  RECRUITMENT_MANAGE: 'recruitment.manage',
  RECRUITMENT_SETTING_READ: 'recruitment.setting.read',
  RECRUITMENT_SETTING_CREATE: 'recruitment.setting.create',
  RECRUITMENT_SETTING_UPDATE: 'recruitment.setting.update',
  RECRUITMENT_SETTING_DELETE: 'recruitment.setting.delete',

  // ─── Employee Exit ───────────────────────────────────────────────
  EXIT_CREATE: 'exit.create',
  EXIT_READ: 'exit.read',
  EXIT_UPDATE: 'exit.update',
  EXIT_MANAGE: 'exit.manage', // exit interview templates, clearing checklists, and separation data
  EXIT_CONFIG_READ: 'exit.config.read',
  EXIT_CONFIG_UPDATE: 'exit.config.update',

  // ─── Job Openings ───────────────────────────────────────────────
  OPENING_CREATE: 'opening.create',
  OPENING_READ: 'opening.read',
  OPENING_UPDATE: 'opening.update',
  OPENING_DELETE: 'opening.delete',
  OPENING_MANAGE: 'opening.manage', // external career portal settings, hiring workflows, and ATS config

  // ─── User Profile ───────────────────────────────────────────────
  PROFILE_CREATE: 'profile.create',
  PROFILE_READ: 'profile.read',
  PROFILE_UPDATE: 'profile.update',
  PROFILE_DELETE: 'profile.delete',
  PROFILE_MANAGE: 'profile.manage', // profile templates, custom profile fields, and visibility rules

  // ─── System / General ────────────────────────────────────────────
  MAIL_CREATE: 'mail.create',
  MAIL_READ: 'mail.read',
  MAIL_UPDATE: 'mail.update',
  MAIL_DELETE: 'mail.delete',
  MAIL_MANAGE: 'mail.manage', // global email retention, organization-wide filters, and admin access

  CALENDAR_CREATE: 'calendar.create',
  CALENDAR_READ: 'calendar.read',
  CALENDAR_UPDATE: 'calendar.update',
  CALENDAR_DELETE: 'calendar.delete',
  CALENDAR_MANAGE: 'calendar.manage', // shared resource calendars, global holiday sync, and booking rules

  CHAT_CREATE: 'chat.create',
  CHAT_READ: 'chat.read',
  CHAT_UPDATE: 'chat.update',
  CHAT_DELETE: 'chat.delete',
  CHAT_MANAGE: 'chat.manage', // channel governance, data archiving, and moderation controls

  SKILLS_CREATE: 'skills.create',
  SKILLS_READ: 'skills.read',
  SKILLS_UPDATE: 'skills.update',
  SKILLS_DELETE: 'skills.delete',
  SKILLS_MANAGE: 'skills.manage', // competency matrix, training catalog, and certification tracking

  NOTIFICATION_CREATE: 'notification.create',
  NOTIFICATION_READ: 'notification.read',
  NOTIFICATION_UPDATE: 'notification.update',
  NOTIFICATION_DELETE: 'notification.delete',

  BOOKMARK_CREATE: 'bookmark.create',
  BOOKMARK_READ: 'bookmark.read',
  BOOKMARK_UPDATE: 'bookmark.update',
  BOOKMARK_DELETE: 'bookmark.delete',

  // ─── Time Tracking ───────────────────────────────────────────────
  TIME_TRACKING_CREATE: 'time_tracking.create',
  TIME_TRACKING_READ: 'time_tracking.read',
  TIME_TRACKING_DELETE: 'time_tracking.delete',
  TIME_TRACKING_TEAM_READ: 'time_tracking.team.read',
  TIME_TRACKING_MANAGE_TIME: 'time_tracking.manage_time',

  // ─── Transaction History (audit log) ─────────────────────────────
  ACTIVITY_LOG_READ: 'activity_log.read',         // view history of a specific entity (drawer)
  ACTIVITY_LOG_READ_ALL: 'activity_log.read_all', // view global audit log (admin page)

  // ─── My Hub (personal self-service launcher) ─────────────────────
  // One permission per My Hub page. Granted to every role by default.
  MY_HUB_OVERVIEW_READ: 'my_hub.overview.read',
  MY_HUB_APPLY_LEAVE_READ: 'my_hub.apply_leave.read',
  MY_HUB_ATTENDANCE_READ: 'my_hub.attendance.read',
  MY_HUB_ESCALATION_READ: 'my_hub.escalation.read',
  MY_HUB_DOCUMENTS_READ: 'my_hub.documents.read',
  MY_HUB_PERFORMANCE_READ: 'my_hub.performance.read',
  MY_HUB_PAYSLIPS_READ: 'my_hub.payslips.read',
  MY_HUB_PROFILE_READ: 'my_hub.profile.read',
  MY_HUB_CLAIMS_READ: 'my_hub.claims.read',
} as const;

export type Permission = (typeof Permissions)[keyof typeof Permissions];

/**
 * All permissions grouped by resource for UI rendering (permission picker).
 */
export const PERMISSIONS_BY_RESOURCE: Record<string, Permission[]> = {
  dashboard: [Permissions.DASHBOARD_READ],
  integration: [Permissions.INTEGRATION_READ, Permissions.INTEGRATION_MANAGE],
  user: [Permissions.USER_CREATE, Permissions.USER_READ, Permissions.USER_UPDATE, Permissions.USER_DELETE, Permissions.USER_MANAGE, Permissions.USER_TRASH_READ, Permissions.USER_TRASH_RESTORE, Permissions.USER_TRASH_DELETE],
  project: [
    Permissions.PROJECT_CREATE,
    Permissions.PROJECT_READ,
    Permissions.PROJECT_UPDATE,
    Permissions.PROJECT_DELETE,
    Permissions.PROJECT_TRASH_READ,
    Permissions.PROJECT_TRASH_RESTORE,
    Permissions.PROJECT_TRASH_DELETE,
    Permissions.PROJECT_MANAGE,
  ],
  ticket: [
    Permissions.TICKET_CREATE,
    Permissions.TICKET_READ,
    Permissions.TICKET_UPDATE,
    Permissions.TICKET_DELETE,
    Permissions.TICKET_ASSIGN,
    Permissions.TICKET_BUCKET_READ,
    Permissions.TICKET_BUCKET_CREATE,
    Permissions.TICKET_BUCKET_UPDATE,
    Permissions.TICKET_BUCKET_DELETE,
    Permissions.TICKET_SETTING_READ,
    Permissions.TICKET_SETTING_CREATE,
    Permissions.TICKET_SETTING_UPDATE,
    Permissions.TICKET_SETTING_DELETE,
    Permissions.TICKET_TRASH_READ,
    Permissions.TICKET_TRASH_RESTORE,
    Permissions.TICKET_TRASH_DELETE,
    Permissions.TICKET_ARCHIVE_READ,
    Permissions.TICKET_ARCHIVE_RESTORE,
    Permissions.TICKET_PLAN_CREATE,
    Permissions.TICKET_PLAN_READ,
    Permissions.TICKET_PLAN_UPDATE,
    Permissions.TICKET_PLAN_DELETE,
    Permissions.TICKET_MANAGE,
    Permissions.BUG_CREATE,
    Permissions.BUG_READ,
    Permissions.BUG_UPDATE,
    Permissions.BUG_DELETE,
    Permissions.BUG_TRASH_READ,
    Permissions.BUG_TRASH_RESTORE,
    Permissions.BUG_TRASH_DELETE,
    Permissions.BUG_ARCHIVE_READ,
    Permissions.BUG_ARCHIVE_RESTORE,
    Permissions.BUG_MANAGE,
  ],
  attendance: [
    Permissions.ATTENDANCE_CREATE,
    Permissions.ATTENDANCE_READ,
    Permissions.ATTENDANCE_UPDATE,
    Permissions.ATTENDANCE_DELETE,
    Permissions.ATTENDANCE_DASHBOARD_READ,
    Permissions.ATTENDANCE_CLOCK_IN_OUT,
  ],
  leave: [
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
  shift: [Permissions.SHIFT_CREATE, Permissions.SHIFT_READ, Permissions.SHIFT_UPDATE, Permissions.SHIFT_DELETE, Permissions.SHIFT_MANAGE],
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
    Permissions.ACCOUNT_SETTING_READ,
    Permissions.ACCOUNT_SETTING_CREATE,
    Permissions.ACCOUNT_SETTING_UPDATE,
    Permissions.ACCOUNT_SETTING_DELETE,
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
  // Payroll 2.0 — page-based (12 pages). Old flat payroll.* / salary.* keys are
  // intentionally excluded from the assignable catalog (legacy /salary only).
  payroll: [
    // 1. General Settings
    Permissions.PAYROLL_SETTINGS_READ,
    Permissions.PAYROLL_SETTINGS_UPDATE,
    // 2. Salary Components
    Permissions.PAYROLL_COMPONENTS_READ,
    Permissions.PAYROLL_COMPONENTS_CREATE,
    Permissions.PAYROLL_COMPONENTS_UPDATE,
    Permissions.PAYROLL_COMPONENTS_DELETE,
    // 3. Salary Structures
    Permissions.PAYROLL_STRUCTURES_READ,
    Permissions.PAYROLL_STRUCTURES_CREATE,
    Permissions.PAYROLL_STRUCTURES_UPDATE,
    Permissions.PAYROLL_STRUCTURES_DELETE,
    // 4. Pay Schedules & Groups
    Permissions.PAYROLL_SCHEDULES_READ,
    Permissions.PAYROLL_SCHEDULES_CREATE,
    Permissions.PAYROLL_SCHEDULES_UPDATE,
    Permissions.PAYROLL_SCHEDULES_DELETE,
    // 5. Statutory (PF & ESI)
    Permissions.PAYROLL_STATUTORY_READ,
    Permissions.PAYROLL_STATUTORY_UPDATE,
    // 6. Professional Tax & LWF
    Permissions.PAYROLL_STATE_STATUTORY_READ,
    Permissions.PAYROLL_STATE_STATUTORY_CREATE,
    Permissions.PAYROLL_STATE_STATUTORY_UPDATE,
    Permissions.PAYROLL_STATE_STATUTORY_DELETE,
    // 7. Approval Workflows
    Permissions.PAYROLL_WORKFLOWS_READ,
    Permissions.PAYROLL_WORKFLOWS_CREATE,
    Permissions.PAYROLL_WORKFLOWS_UPDATE,
    Permissions.PAYROLL_WORKFLOWS_DELETE,
    // 8. Payslip & Bank
    Permissions.PAYROLL_PAYSLIP_BANK_READ,
    Permissions.PAYROLL_PAYSLIP_BANK_UPDATE,
    // 9. Employee Pay Setup
    Permissions.PAYROLL_EMPLOYEES_READ,
    Permissions.PAYROLL_EMPLOYEES_CREATE,
    Permissions.PAYROLL_EMPLOYEES_UPDATE,
    Permissions.PAYROLL_EMPLOYEES_DELETE,
    // 10. Run Payroll
    Permissions.PAYROLL_RUN_READ,
    Permissions.PAYROLL_RUN_CREATE,
    Permissions.PAYROLL_RUN_PROCESS,
    Permissions.PAYROLL_RUN_APPROVE,
    Permissions.PAYROLL_RUN_FINALIZE,
    Permissions.PAYROLL_RUN_PAY,
    Permissions.PAYROLL_RUN_PAYSLIPS,
    Permissions.PAYROLL_RUN_DELETE,
    // 11. Reports
    Permissions.PAYROLL_REPORTS_READ,
    Permissions.PAYROLL_REPORTS_EXPORT,
    // 12. My Payslips
    Permissions.PAYROLL_MY_PAYSLIPS_READ,
  ],
  client: [Permissions.CLIENT_CREATE, Permissions.CLIENT_READ, Permissions.CLIENT_UPDATE, Permissions.CLIENT_DELETE, Permissions.CLIENT_MANAGE],
  settings: [Permissions.SETTINGS_READ, Permissions.SETTINGS_UPDATE, Permissions.SETTINGS_DELETE, Permissions.SETTINGS_MANAGE],
  role: [Permissions.ROLE_CREATE, Permissions.ROLE_READ, Permissions.ROLE_UPDATE, Permissions.ROLE_DELETE, Permissions.ROLE_ASSIGN],
  report: [Permissions.REPORT_READ, Permissions.REPORT_MANAGE],
  document: [Permissions.DOCUMENT_CREATE, Permissions.DOCUMENT_READ, Permissions.DOCUMENT_UPDATE, Permissions.DOCUMENT_DELETE, Permissions.DOCUMENT_MANAGE],
  onboarding: [
    Permissions.ONBOARDING_CREATE,
    Permissions.ONBOARDING_READ,
    Permissions.ONBOARDING_UPDATE,
    Permissions.ONBOARDING_DELETE,
    Permissions.ONBOARDING_SETTING_READ,
    Permissions.ONBOARDING_SETTING_UPDATE,
  ],
  performance_report: [
    Permissions.PERFORMANCE_REPORT_READ,
    Permissions.PERFORMANCE_REPORT_SETTING_READ,
    Permissions.PERFORMANCE_REPORT_SETTING_UPDATE,
    Permissions.PERFORMANCE_REPORT_GENERATED_READ,
    Permissions.PERFORMANCE_REPORT_MY_READ,
  ],
  timesheet: [Permissions.TIMESHEET_CREATE, Permissions.TIMESHEET_READ, Permissions.TIMESHEET_UPDATE, Permissions.TIMESHEET_DELETE, Permissions.TIMESHEET_APPROVE, Permissions.TIMESHEET_MANAGE],
  org: [
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
  daily_update: [
    Permissions.DAILY_UPDATE_CREATE,
    Permissions.DAILY_UPDATE_READ,
    Permissions.DAILY_UPDATE_UPDATE,
    Permissions.DAILY_UPDATE_DELETE,
    Permissions.DAILY_UPDATE_MANAGE_TIME,
  ],
  squad: [Permissions.SQUAD_CREATE, Permissions.SQUAD_READ, Permissions.SQUAD_UPDATE, Permissions.SQUAD_DELETE, Permissions.SQUAD_MANAGE],
  lead: [
    Permissions.LEAD_CREATE,
    Permissions.LEAD_READ,
    Permissions.LEAD_UPDATE,
    Permissions.LEAD_DELETE,
    Permissions.LEAD_SETTING_READ,
    Permissions.LEAD_SETTING_CREATE,
    Permissions.LEAD_SETTING_UPDATE,
    Permissions.LEAD_SETTING_DELETE,
    Permissions.LEAD_TRASH_READ,
    Permissions.LEAD_TRASH_RESTORE,
    Permissions.LEAD_TRASH_DELETE,
    Permissions.PROPOSAL_CREATE,
    Permissions.PROPOSAL_READ,
    Permissions.PROPOSAL_UPDATE,
    Permissions.PROPOSAL_DELETE,
  ],
  bidiq: [Permissions.BIDIQ_READ, Permissions.BIDIQ_CREATE],
  vendor: [Permissions.VENDOR_CREATE, Permissions.VENDOR_READ, Permissions.VENDOR_UPDATE, Permissions.VENDOR_DELETE, Permissions.VENDOR_MANAGE],
  escalation: [Permissions.ESCALATION_CREATE, Permissions.ESCALATION_READ, Permissions.ESCALATION_UPDATE, Permissions.ESCALATION_DELETE, Permissions.ESCALATION_MANAGE],
  pipeline: [
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
  recruitment: [
    Permissions.RECRUITMENT_CREATE,
    Permissions.RECRUITMENT_READ,
    Permissions.RECRUITMENT_UPDATE,
    Permissions.RECRUITMENT_DELETE,
    Permissions.RECRUITMENT_MANAGE,
    Permissions.RECRUITMENT_SETTING_READ,
    Permissions.RECRUITMENT_SETTING_CREATE,
    Permissions.RECRUITMENT_SETTING_UPDATE,
    Permissions.RECRUITMENT_SETTING_DELETE,
  ],
  exit: [
    Permissions.EXIT_CREATE,
    Permissions.EXIT_READ,
    Permissions.EXIT_UPDATE,
    Permissions.EXIT_MANAGE,
    Permissions.EXIT_CONFIG_READ,
    Permissions.EXIT_CONFIG_UPDATE,
  ],
  opening: [Permissions.OPENING_CREATE, Permissions.OPENING_READ, Permissions.OPENING_UPDATE, Permissions.OPENING_DELETE, Permissions.OPENING_MANAGE],
  profile: [Permissions.PROFILE_CREATE, Permissions.PROFILE_READ, Permissions.PROFILE_UPDATE, Permissions.PROFILE_DELETE, Permissions.PROFILE_MANAGE],
  system: [
    Permissions.MAIL_CREATE, Permissions.MAIL_READ, Permissions.MAIL_UPDATE, Permissions.MAIL_DELETE, Permissions.MAIL_MANAGE,
    Permissions.CALENDAR_CREATE, Permissions.CALENDAR_READ, Permissions.CALENDAR_UPDATE, Permissions.CALENDAR_DELETE, Permissions.CALENDAR_MANAGE,
    Permissions.CHAT_CREATE, Permissions.CHAT_READ, Permissions.CHAT_UPDATE, Permissions.CHAT_DELETE, Permissions.CHAT_MANAGE,
    Permissions.SKILLS_CREATE, Permissions.SKILLS_READ, Permissions.SKILLS_UPDATE, Permissions.SKILLS_DELETE, Permissions.SKILLS_MANAGE,
    Permissions.NOTIFICATION_CREATE, Permissions.NOTIFICATION_READ, Permissions.NOTIFICATION_UPDATE, Permissions.NOTIFICATION_DELETE,
    Permissions.BOOKMARK_CREATE, Permissions.BOOKMARK_READ, Permissions.BOOKMARK_UPDATE, Permissions.BOOKMARK_DELETE
  ],
  time_tracking: [
    Permissions.TIME_TRACKING_CREATE,
    Permissions.TIME_TRACKING_READ,
    Permissions.TIME_TRACKING_DELETE,
    Permissions.TIME_TRACKING_TEAM_READ,
    Permissions.TIME_TRACKING_MANAGE_TIME,
  ],
  activity_log: [
    Permissions.ACTIVITY_LOG_READ,
    Permissions.ACTIVITY_LOG_READ_ALL,
  ],
  my_hub: [
    Permissions.MY_HUB_OVERVIEW_READ,
    Permissions.MY_HUB_APPLY_LEAVE_READ,
    Permissions.MY_HUB_ATTENDANCE_READ,
    Permissions.MY_HUB_ESCALATION_READ,
    Permissions.MY_HUB_PERFORMANCE_READ,
    Permissions.MY_HUB_PAYSLIPS_READ,
    Permissions.MY_HUB_PROFILE_READ,
    Permissions.MY_HUB_CLAIMS_READ,
  ],
};

/** Flat list of all permissions — used for seeding. */
export const ALL_PERMISSIONS: Permission[] = Object.values(Permissions);

/**
 * Default role slugs. These system roles are seeded on tenant creation.
 */
export const SystemRoles = {
  SUPER_ADMIN: 'super_admin',
  ADMIN: 'admin',
  USER: 'user',
} as const;

export type SystemRole = (typeof SystemRoles)[keyof typeof SystemRoles];
