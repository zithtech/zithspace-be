// src/modules/project-agreements/controllers/branding.controller.ts
//
// The letterhead: what appears in the header (logo, company name, tagline) and
// the footer (phone, email, website) of every generated agreement.

import { Response } from 'express';
import { AuthRequest } from '@/types';
import { withTenant } from '../db/pool';
import { actorOf, handle, ok, AgreementError } from '../http';
import * as repo from '../repositories/branding.repo';
import { brandingSchema, logoUploadSchema, signatureUploadSchema } from '../validators';
import { renderDocument } from '../services/render.service';
import { uploadImageToR2 } from '@/utils/r2Client';
import { assertRenderableImage, UnsupportedImageError } from '../services/imageGuard';

export const get = handle(async (req: AuthRequest, res: Response) => {
  const { tenantId } = actorOf(req);
  const branding = await withTenant(tenantId, (c) => repo.getBranding(c));
  ok(res, branding);
});

export const save = handle(async (req: AuthRequest, res: Response) => {
  const { tenantId, userId } = actorOf(req);
  const body = brandingSchema.parse(req.body);
  const branding = await withTenant(tenantId, (c) => repo.saveBranding(c, body, userId));
  ok(res, branding);
});

export const uploadLogo = handle(async (req: AuthRequest, res: Response) => {
  const { tenantId, userId } = actorOf(req);
  const { image } = logoUploadSchema.parse(req.body);

  // uploadImageToR2 owns the format and size rules (data: URI, ≤5MB, image
  // types only) — one place for them rather than a second copy here that
  // drifts. Its message is already user-facing, so pass it straight through.
  try {
    assertRenderableImage(image);
  } catch (err: any) {
    if (err instanceof UnsupportedImageError) {
      throw new AgreementError(err.message, 400, 'UNSUPPORTED_IMAGE');
    }
    throw err;
  }

  let url: string;
  try {
    url = await uploadImageToR2(image, tenantId, 'project-agreement-logo');
  } catch (err: any) {
    throw new AgreementError(err?.message || 'Could not upload that image', 400, 'UPLOAD_FAILED');
  }

  const branding = await withTenant(tenantId, (c) => repo.saveLogo(c, url, userId));
  ok(res, branding);
});

/**
 * The authorised signature image.
 *
 * Its own endpoint rather than part of saveBranding, for the reason the logo
 * has one: the file arrives as a data: URI that can be megabytes, and a text
 * edit to the phone number has no business carrying it up the wire.
 */
export const uploadSignature = handle(async (req: AuthRequest, res: Response) => {
  const { tenantId, userId } = actorOf(req);
  const { image } = signatureUploadSchema.parse(req.body);

  // Before anything is stored: a mislabelled file uploads fine and then prints
  // as a broken image on every document.
  try {
    assertRenderableImage(image);
  } catch (err: any) {
    if (err instanceof UnsupportedImageError) {
      throw new AgreementError(err.message, 400, 'UNSUPPORTED_IMAGE');
    }
    throw err;
  }

  let url: string;
  try {
    url = await uploadImageToR2(image, tenantId, 'project-agreement-signature');
  } catch (err: any) {
    throw new AgreementError(err?.message || 'Could not upload that image', 400, 'UPLOAD_FAILED');
  }

  const branding = await withTenant(tenantId, (c) => repo.saveSignature(c, url, userId));
  ok(res, branding);
});

/** Take the signature off the letterhead. */
export const removeSignature = handle(async (req: AuthRequest, res: Response) => {
  const { tenantId, userId } = actorOf(req);
  const branding = await withTenant(tenantId, (c) => repo.saveSignature(c, null, userId));
  ok(res, branding);
});

/**
 * The letterhead on its own, over sample wording — so somebody tuning the
 * header and footer can see the result without first creating an agreement.
 */
export const previewLetterhead = handle(async (req: AuthRequest, res: Response) => {
  const { tenantId } = actorOf(req);
  const branding = await withTenant(tenantId, (c) => repo.getBranding(c));

  const document = renderDocument(
    {
      title: 'Master Services Agreement',
      bodyHtml: SAMPLE_BODY,
      branding,
      documentNumber: 'AGR-0000-0000',
      effectiveDate: new Date().toISOString().slice(0, 10),
    },
    'screen'
  );
  res.type('html').send(document);
});

const SAMPLE_BODY = `
  <h2>1. Scope of Work</h2>
  <p>This is sample wording. It is here so the header and footer above and below
  can be judged against a realistic amount of text, and it is never stored.</p>
  <h2>2. Term</h2>
  <p>The agreement begins on the effective date shown above and continues until
  either party terminates it in accordance with clause 7.</p>
  <h2>3. Fees</h2>
  <p>Fees are invoiced monthly in arrears and payable within thirty days of the
  invoice date.</p>
`;
