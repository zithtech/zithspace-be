// src/modules/project-agreements/validators/index.ts
// Request shapes for every endpoint that writes.

import { z } from 'zod';
import {
  AGREEMENT_STATUSES,
  DOCUMENT_TYPE_STATUSES,
  SUMMARY_FIELD_KEYS,
  PLACEHOLDER_SOURCES,
  PLACEHOLDER_TYPES,
  TEMPLATE_STATUSES,
} from '../types';

const uuid = z.string().uuid();

/**
 * A placeholder key is what the body carries as {{key}}. Restricting it to
 * [a-z0-9_] is not fussiness: the renderer builds a RegExp from it, and a key
 * containing regex metacharacters would either fail to match or match far too
 * much.
 */
const placeholderKey = z
  .string()
  .trim()
  .min(1)
  .max(60)
  .regex(/^[a-z][a-z0-9_]*$/, 'Use lowercase letters, numbers and underscores (e.g. client_name)');

/* ── Templates ───────────────────────────────────────────────────────────── */

export const placeholderSchema = z.object({
  key: placeholderKey,
  label: z.string().trim().min(1).max(120),
  dataType: z.enum(PLACEHOLDER_TYPES as unknown as [string, ...string[]]).default('text'),
  source: z.enum(PLACEHOLDER_SOURCES as unknown as [string, ...string[]]).default('manual'),
  required: z.boolean().default(false),
  defaultValue: z.string().max(2000).nullable().optional(),
  displayOrder: z.number().int().min(0).max(500).default(0),
});

/**
 * A document type. `code` is upper-snake and stable; the UI derives it from the
 * name on first entry and then leaves it alone, because changing a code is a
 * rename of the thing other systems key on.
 */
export const documentTypeSchema = z.object({
  name: z.string().trim().min(1, 'A name is required').max(120),
  code: z
    .string()
    .trim()
    .min(1, 'A code is required')
    .max(60)
    .regex(/^[A-Z][A-Z0-9_]*$/, 'Use capitals, digits and underscores, e.g. TEST_PROPOSAL'),
  description: z.string().trim().max(2000).nullable().optional(),
  status: z
    .enum(DOCUMENT_TYPE_STATUSES as unknown as [string, ...string[]])
    .default('active'),
});

export const templateSchema = z.object({
  name: z.string().trim().min(1, 'A name is required').max(160),
  documentTypeId: z.string().uuid('Pick the type of document'),
  category: z.string().trim().max(80).nullable().optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  // 400k is a generous ceiling for a contract with inline images; it exists so
  // a runaway paste cannot push a multi-megabyte row into the table.
  bodyHtml: z.string().max(400_000).default(''),
  status: z.enum(TEMPLATE_STATUSES as unknown as [string, ...string[]]).default('draft'),
  placeholders: z.array(placeholderSchema).max(120).default([]),
});

export const templateStatusSchema = z.object({
  status: z.enum(TEMPLATE_STATUSES as unknown as [string, ...string[]]),
});

/* ── Agreements ──────────────────────────────────────────────────────────── */

const isoDate = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD')
  .nullable()
  .optional();

export const agreementSchema = z
  .object({
    // Optional: plenty of paper — an NDA, an MSA, the proposal that wins the
    // work — is signed before there is a project to hang it on.
    projectId: z.string().trim().min(1).nullable().optional(),
    templateId: uuid.nullable().optional(),
    title: z.string().trim().min(1, 'A document name is required').max(200),
    /** The summary Title row — independent of the document name above. */
    summaryTitle: z.string().trim().max(200).nullable().optional(),
    documentNumber: z.string().trim().max(60).nullable().optional(),
    /**
     * Accepted and normally ignored: the server renders the body from the
     * template + values so the two cannot drift. It is honoured only when
     * `useCustomContent` is set, which is how "edit this one document without
     * touching the template" works.
     */
    contentHtml: z.string().max(400_000).optional(),
    useCustomContent: z.boolean().default(false),
    status: z.enum(AGREEMENT_STATUSES as unknown as [string, ...string[]]).default('draft'),
    effectiveDate: isoDate,
    expiryDate: isoDate,
    documentDate: isoDate,
    kickoffDate: isoDate,
    /**
     * Accepted as a number OR a string, because an <input type="number"> that
     * has been cleared sends "" and a filled one sends a string too. Coerced
     * here rather than in the client so the API has one shape.
     */
    totalValue: z
      .union([z.number(), z.string()])
      .nullable()
      .optional()
      .transform((v) => {
        if (v === null || v === undefined || String(v).trim() === '') return null;
        const n = Number(String(v).replace(/,/g, ''));
        return Number.isFinite(n) ? n : null;
      }),
    valueCurrency: z.string().trim().max(8).nullable().optional(),
    summaryFields: z
      .array(z.enum(SUMMARY_FIELD_KEYS as unknown as [string, ...string[]]))
      .max(SUMMARY_FIELD_KEYS.length)
      .nullable()
      .optional(),
    // MANDATORY, like the title: an agreement with no kind cannot be numbered,
    // grouped or reported on, and the answer is always known at creation.
    documentTypeId: z.string().uuid('Pick the type of document'),
    clientId: z.string().trim().min(1).nullable().optional(),
    clientCompany: z.string().trim().max(200).nullable().optional(),
    clientContactId: z.string().trim().min(1).nullable().optional(),
    partyName: z.string().trim().max(200).nullable().optional(),
    partyEmail: z.string().trim().email('Enter a valid email').max(200).nullable().optional().or(z.literal('')),
    partyPhone: z.string().trim().max(60).nullable().optional(),
    signatoryName: z.string().trim().max(160).nullable().optional(),
    signatoryPosition: z.string().trim().max(160).nullable().optional(),
    signatoryCompany: z.string().trim().max(200).nullable().optional(),
    clientSignatoryName: z.string().trim().max(160).nullable().optional(),
    clientSignatoryPosition: z.string().trim().max(160).nullable().optional(),
    clientSignatoryCompany: z.string().trim().max(200).nullable().optional(),
    showSignatures: z.boolean().default(true),
    notes: z.string().trim().max(4000).nullable().optional(),
    values: z.record(z.string(), z.string().max(10_000)).default({}),
  })
  .refine(
    (v) => !v.effectiveDate || !v.expiryDate || v.expiryDate >= v.effectiveDate,
    { message: 'Expiry date cannot be before the effective date', path: ['expiryDate'] }
  );

export const agreementStatusSchema = z.object({
  status: z.enum(AGREEMENT_STATUSES as unknown as [string, ...string[]]),
});

/* ── Branding ────────────────────────────────────────────────────────────── */

export const brandingSchema = z.object({
  companyName: z.string().trim().max(160).nullable().optional(),
  tagline: z.string().trim().max(200).nullable().optional(),
  /**
   * An R2 URL, or a data: URI.
   *
   * THE CAP IS 8MB FOR A REASON, and 2000 was a bug: the letterhead SEEDS its
   * logo from general_settings.company_logo, which stores base64 rather than a
   * URL — a real one measured 80,891 characters. The form PUTs the whole
   * letterhead back on save, so a 2000-char cap rejected every save that
   * tenant ever made, taking the tagline and everything else down with it.
   * 8MB covers what uploadImageToR2 accepts (5MB binary ≈ 6.7MB of base64).
   */
  logoUrl: z.string().trim().max(8_000_000).nullable().optional(),
  /** Same ceiling as the logo, and for the same reason — see above. */
  signatureUrl: z.string().trim().max(8_000_000).nullable().optional(),
  phone: z.string().trim().max(60).nullable().optional(),
  email: z.string().trim().max(160).nullable().optional(),
  website: z.string().trim().max(300).nullable().optional(),
  location: z.string().trim().max(160).nullable().optional(),
  footerNote: z.string().trim().max(400).nullable().optional(),
});

export const signatureUploadSchema = z.object({
  /** data:image/...;base64,… — validated again by uploadImageToR2. */
  image: z.string().min(32, 'No image received'),
});

export const logoUploadSchema = z.object({
  /** data:image/...;base64,… — validated again by uploadImageToR2. */
  image: z.string().min(32, 'No image received'),
});

/**
 * Seeding the composer's editor from a template.
 *
 * Separate from previewSchema because the answer is a BODY FRAGMENT, not a
 * document: the composer drops it into an editor the person then types in, so
 * it must not arrive wrapped in a letterhead and a stylesheet.
 */
export const composeBodySchema = z.object({
  templateId: uuid,
  projectId: z.string().trim().min(1).nullable().optional(),
  values: z.record(z.string(), z.string().max(10_000)).default({}),
});

/* ── Preview ─────────────────────────────────────────────────────────────── */

export const previewSchema = z.object({
  templateId: uuid.nullable().optional(),
  projectId: z.string().trim().min(1).nullable().optional(),
  title: z.string().trim().max(200).default('Untitled Agreement'),
  summaryTitle: z.string().trim().max(200).nullable().optional(),
  documentNumber: z.string().trim().max(60).nullable().optional(),
  bodyHtml: z.string().max(400_000).optional(),
  values: z.record(z.string(), z.string().max(10_000)).default({}),

  /* The summary block, so a preview shows the same rows the PDF will. */
  client: z.string().trim().max(200).nullable().optional(),
  clientCompany: z.string().trim().max(200).nullable().optional(),
  clientEmail: z.string().trim().max(200).nullable().optional(),
  clientPhone: z.string().trim().max(60).nullable().optional(),
  kickoffDate: isoDate,
  documentDate: isoDate,
  totalValue: z.union([z.number(), z.string()]).nullable().optional(),
  valueCurrency: z.string().trim().max(8).nullable().optional(),
  summaryFields: z
    .array(z.enum(SUMMARY_FIELD_KEYS as unknown as [string, ...string[]]))
    .nullable()
    .optional(),

  /* The sign-off block, so a preview shows it exactly as the PDF will. */
  signatoryName: z.string().trim().max(160).nullable().optional(),
  signatoryPosition: z.string().trim().max(160).nullable().optional(),
  signatoryCompany: z.string().trim().max(200).nullable().optional(),
  clientSignatoryName: z.string().trim().max(160).nullable().optional(),
  clientSignatoryPosition: z.string().trim().max(160).nullable().optional(),
  clientSignatoryCompany: z.string().trim().max(200).nullable().optional(),
  showSignatures: z.boolean().optional(),
});
