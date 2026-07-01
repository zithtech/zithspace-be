// src/modules/payroll/validators/payslipBank.validator.ts
// Zod schemas for payslip template & bank/disbursement settings.

import { z } from 'zod';

export const updatePayslipTemplateSchema = z.object({
  templateStyle: z.enum(['modern', 'classic', 'minimal']).default('modern'),
  showLogo: z.boolean().default(true),
  logoUrl: z.string().trim().max(500).optional().nullable(),
  companyName: z.string().trim().max(160).optional().nullable(),
  companyAddress: z.string().trim().max(400).optional().nullable(),
  accentColor: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, 'accentColor must be a hex colour').default('#3B82F6'),
  footerNote: z.string().trim().max(500).optional().nullable(),
  netPayInWords: z.boolean().default(true),
  // Employee-details block
  showEmployeeCode: z.boolean().default(true),
  showEmail: z.boolean().default(true),
  showDesignation: z.boolean().default(true),
  showDepartment: z.boolean().default(true),
  showGrade: z.boolean().default(false),
  showLocation: z.boolean().default(false),
  showDateOfJoining: z.boolean().default(true),
  showBankName: z.boolean().default(true),
  // Statutory / other fields
  showPan: z.boolean().default(true),
  showUan: z.boolean().default(true),
  showPfNumber: z.boolean().default(true),
  showEsiNumber: z.boolean().default(true),
  showBankAccount: z.boolean().default(true),
  showYtd: z.boolean().default(false),
  showLeaveBalance: z.boolean().default(true),
  showAttendanceSummary: z.boolean().default(false),
});

export const updateBankSettingsSchema = z.object({
  companyBankName: z.string().trim().max(160).optional().nullable(),
  companyAccountNumber: z.string().trim().max(40).optional().nullable(),
  companyIfsc: z.string().trim().max(20).optional().nullable(),
  paymentMode: z.enum(['neft', 'imps', 'rtgs']).default('neft'),
  bankFileFormat: z.enum(['generic_csv', 'hdfc', 'icici', 'sbi', 'axis', 'kotak']).default('generic_csv'),
});

export const uploadPayslipLogoSchema = z.object({
  image: z.string().min(1, 'image is required'), // base64 data URI
});

export type UpdatePayslipTemplateInput = z.infer<typeof updatePayslipTemplateSchema>;
export type UploadPayslipLogoInput = z.infer<typeof uploadPayslipLogoSchema>;
export type UpdateBankSettingsInput = z.infer<typeof updateBankSettingsSchema>;
