// src/modules/company-details/validators/companyDetails.validator.ts
// Zod schemas for the company profile and its branch locations.

import { z } from 'zod';

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));

/** The postal address block, identical for the company and every branch. */
const addressShape = {
  doorNumber: optionalText(60),
  floor: optionalText(60),
  building: optionalText(120),
  area: optionalText(120),
  street: optionalText(160),
  city: optionalText(120),
  district: optionalText(120),
  state: optionalText(120),
  pincode: optionalText(20),
  country: optionalText(120),
};

// India's GSTIN: 2-digit state code, 10-char PAN, entity digit, 'Z', checksum.
// Optional field — validated only when a value is actually supplied.
const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

const gstNumber = z
  .string()
  .trim()
  .toUpperCase()
  .optional()
  .nullable()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || GSTIN_RE.test(v), {
    message: 'Invalid GST number (expected a 15-character GSTIN)',
  });

/**
 * People type `company.com` far more often than `https://company.com`, so add
 * the scheme before validating — the stored value is always href-ready.
 */
const website = z
  .string()
  .trim()
  .max(300)
  .optional()
  .nullable()
  .transform((v) => {
    if (!v) return null;
    return /^https?:\/\//i.test(v) ? v : `https://${v}`;
  })
  .refine((v) => v === null || z.string().url().safeParse(v).success, {
    message: 'Invalid website URL',
  });

export const saveCompanyDetailsSchema = z.object({
  registeredName: z.string().trim().min(1, 'Registered company name is required').max(200),
  gstNumber,
  primaryEmail: z.string().trim().toLowerCase().email('Invalid primary email').max(200),
  primaryPhone: z.string().trim().min(5, 'Primary phone is required').max(30),
  website,
  ...addressShape,
});

const branchBase = z.object({
  branchName: z.string().trim().min(1, 'Branch name is required').max(160),
  /** true → the branch inherits the company's primary email. */
  useCompanyEmail: z.boolean().default(true),
  branchEmail: z
    .string()
    .trim()
    .toLowerCase()
    .email('Invalid branch email')
    .max(200)
    .optional()
    .nullable(),
  branchPhone: optionalText(30),
  ...addressShape,
});

/**
 * A branch that opts out of the company email MUST supply its own — the same
 * rule the `cd_branch_email_present` CHECK enforces in the database, surfaced
 * here as a field-level message instead of a 500.
 */
const requireOwnEmail = (data: { useCompanyEmail: boolean; branchEmail?: string | null }) =>
  data.useCompanyEmail || !!data.branchEmail;

const ownEmailIssue = {
  message: 'A branch email is required when not reusing the company email',
  path: ['branchEmail'],
};

export const createBranchSchema = branchBase.refine(requireOwnEmail, ownEmailIssue);

export const updateBranchSchema = branchBase
  .extend({ isActive: z.boolean().optional() })
  .refine(requireOwnEmail, ownEmailIssue);

export type SaveCompanyDetailsInput = z.infer<typeof saveCompanyDetailsSchema>;
export type CreateBranchInput = z.infer<typeof createBranchSchema>;
export type UpdateBranchInput = z.infer<typeof updateBranchSchema>;
