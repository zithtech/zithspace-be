// src/modules/mail-templates/validators/mailTemplate.validator.ts
// Zod schemas for template writes and for the render endpoint.

import { z } from 'zod';

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));

export const createTemplateSchema = z.object({
  name: z.string().trim().min(1, 'A template name is required').max(120),
  subject: z.string().trim().min(1, 'A subject is required').max(500),
  // The body is HTML from the editor; an empty paragraph is not a body.
  body: z
    .string()
    .min(1, 'A message body is required')
    .max(200_000)
    .refine((v) => v.replace(/<[^>]*>/g, '').replace(/&nbsp;/gi, ' ').trim().length > 0, {
      message: 'A message body is required',
    }),
  category: optionalText(60),
  isDefault: z.boolean().optional(),
});

export const updateTemplateSchema = createTemplateSchema.partial().refine(
  (v) => Object.keys(v).length > 0,
  { message: 'Nothing to update' }
);

/**
 * Render a template for one recipient. Either name the recipient explicitly
 * (`recipientId` + `recipientKind`, from the picker) or hand over the plain
 * email address the compose window already holds and let the server find them.
 */
export const renderTemplateSchema = z
  .object({
    recipientId: z.string().uuid().optional(),
    recipientKind: z.enum(['client_contact', 'member']).optional(),
    email: z.string().trim().email().optional(),
  })
  .refine((v) => Boolean(v.email) || Boolean(v.recipientId), {
    message: 'Provide a recipient email or a recipient id',
  })
  .refine((v) => !v.recipientId || Boolean(v.recipientKind), {
    message: 'recipientKind is required when recipientId is given',
  });

/**
 * A signature may be emptied — that is how a member says "sign nothing" —
 * so unlike a template body there is no non-empty check here.
 */
export const saveSignatureSchema = z.object({
  html: z.string().max(50_000),
});

export type SaveSignatureInput = z.infer<typeof saveSignatureSchema>;
export type CreateTemplateInput = z.infer<typeof createTemplateSchema>;
export type UpdateTemplateInput = z.infer<typeof updateTemplateSchema>;
export type RenderTemplateInput = z.infer<typeof renderTemplateSchema>;
