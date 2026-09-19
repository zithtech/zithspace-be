// src/modules/project-agreements/controllers/agreement.controller.ts
//
// The documents. One rule runs through every write below: the SERVER renders
// content_html from the template body plus the submitted values. The client may
// send content_html and it is ignored — unless `useCustomContent` is set, which
// is the explicit "I have edited this one document by hand" path.
//
// Without that rule the snapshot and the answers drift: a client that posts
// stale HTML alongside fresh values produces a contract whose stored values no
// longer describe the text anybody signed.

import { Response } from 'express';
import { AuthRequest } from '@/types';
import { withTenant } from '../db/pool';
import { AgreementError, actorOf, handle, ok } from '../http';
import * as repo from '../repositories/agreement.repo';
import * as templates from '../repositories/template.repo';
import * as projects from '../repositories/project.repo';
import * as documentTypes from '../repositories/documentType.repo';
import { getBranding } from '../repositories/branding.repo';
import {
  agreementSchema,
  agreementStatusSchema,
  composeBodySchema,
  previewSchema,
} from '../validators';
import { Agreement, AgreementStatus } from '../types';
import { renderDocument, substitute, autoTokens } from '../services/render.service';
import { generateAndStorePdf, pageCountOf, renderPdfBuffer } from '../services/pdf.service';

export const list = handle(async (req: AuthRequest, res: Response) => {
  const { tenantId } = actorOf(req);
  const filters = {
    projectId: str(req.query.projectId),
    clientId: str(req.query.clientId),
    status: str(req.query.status) as AgreementStatus | undefined,
    templateId: str(req.query.templateId),
    documentTypeId: str(req.query.documentTypeId),
    search: str(req.query.search),
    expiringWithinDays:
      str(req.query.expiringWithinDays) !== undefined
        ? Number(req.query.expiringWithinDays)
        : undefined,
  };

  const [items, stats] = await withTenant(tenantId, async (c) => [
    await repo.listAgreements(c, filters),
    // Scoped to the chosen type so the chips describe what the rail selected,
    // not the whole tenant.
    await repo.agreementStats(c, filters.documentTypeId),
  ]);
  ok(res, { items, stats });
});

export const detail = handle(async (req: AuthRequest, res: Response) => {
  const { tenantId } = actorOf(req);
  const agreement = await withTenant(tenantId, (c) => repo.getAgreement(c, req.params.id));
  if (!agreement) throw new AgreementError('Agreement not found', 404, 'NOT_FOUND');
  ok(res, agreement);
});

export const create = handle(async (req: AuthRequest, res: Response) => {
  const { tenantId, userId } = actorOf(req);
  const body = agreementSchema.parse(req.body);

  const agreement = await withTenant(tenantId, async (c) => {
    const input = await composeInput(c, body);
    return repo.createAgreement(c, input, userId);
  });
  ok(res, agreement, 201);
});

export const update = handle(async (req: AuthRequest, res: Response) => {
  const { tenantId, userId } = actorOf(req);
  const body = agreementSchema.parse(req.body);

  const agreement = await withTenant(tenantId, async (c) => {
    const input = await composeInput(c, body);
    return repo.updateAgreement(c, req.params.id, input, userId);
  });
  if (!agreement) throw new AgreementError('Agreement not found', 404, 'NOT_FOUND');
  ok(res, agreement);
});

export const setStatus = handle(async (req: AuthRequest, res: Response) => {
  const { tenantId, userId } = actorOf(req);
  const { status } = agreementStatusSchema.parse(req.body);

  const agreement = await withTenant(tenantId, (c) =>
    repo.setAgreementStatus(c, req.params.id, status as AgreementStatus, userId)
  );
  if (!agreement) throw new AgreementError('Agreement not found', 404, 'NOT_FOUND');
  ok(res, agreement);
});

export const remove = handle(async (req: AuthRequest, res: Response) => {
  const { tenantId } = actorOf(req);
  const deleted = await withTenant(tenantId, (c) => repo.deleteAgreement(c, req.params.id));
  if (!deleted) throw new AgreementError('Agreement not found', 404, 'NOT_FOUND');
  ok(res, { id: req.params.id });
});

/** The next free reference, so the composer can offer one without guessing. */
export const nextNumber = handle(async (req: AuthRequest, res: Response) => {
  const { tenantId } = actorOf(req);
  const documentNumber = await withTenant(tenantId, (c) => repo.nextDocumentNumber(c));
  ok(res, { documentNumber });
});

/**
 * The document as HTML, letterhead and all — what the FE iframes as a preview.
 * Rendered from the SNAPSHOT, so an old agreement keeps its agreed wording even
 * after the template moves on. Only the header/footer chrome is current.
 */
export const html = handle(async (req: AuthRequest, res: Response) => {
  const { tenantId } = actorOf(req);

  const document = await withTenant(tenantId, async (c) => {
    const agreement = await repo.getAgreement(c, req.params.id);
    if (!agreement) return null;
    const branding = await getBranding(c);
    const project = agreement.projectId ? await projects.getProject(c, agreement.projectId) : null;

    return renderDocument(
      { ...summaryOf(agreement), branding, project },
      req.query.mode === 'print' ? 'print' : 'screen'
    );
  });

  if (!document) throw new AgreementError('Agreement not found', 404, 'NOT_FOUND');
  res.type('html').send(document);
});

/**
 * A template's wording, with every token already filled in, as a plain HTML
 * fragment — what the composer seeds its editor with.
 *
 * The substitution happens HERE rather than in the browser so there is exactly
 * one implementation of it. The client cannot see a template's defaults or the
 * letterhead's tokens without asking anyway, and a second substituter would be
 * a second set of rules about what an unanswered placeholder looks like.
 */
export const composeBody = handle(async (req: AuthRequest, res: Response) => {
  const { tenantId } = actorOf(req);
  const body = composeBodySchema.parse(req.body);

  const result = await withTenant(tenantId, async (c) => {
    const template = await templates.getTemplate(c, body.templateId);
    if (!template) return null;

    const branding = await getBranding(c);
    const project = body.projectId ? await projects.getProject(c, body.projectId) : null;

    const values = {
      ...autoTokens(branding, project),
      ...Object.fromEntries(
        template.placeholders.flatMap((p) => (p.defaultValue ? [[p.key, p.defaultValue]] : []))
      ),
      ...body.values,
    };

    return {
      bodyHtml: substitute(template.bodyHtml, values),
      templateName: template.name,
      templateVersion: template.version,
    };
  });

  if (!result) throw new AgreementError('That template no longer exists', 404, 'NOT_FOUND');
  ok(res, result);
});

/** Live preview while composing — nothing is stored. */
export const preview = handle(async (req: AuthRequest, res: Response) => {
  const { tenantId } = actorOf(req);
  const body = previewSchema.parse(req.body);

  const document = await withTenant(tenantId, async (c) => {
    const branding = await getBranding(c);
    const project = body.projectId ? await projects.getProject(c, body.projectId) : null;
    const template = body.templateId ? await templates.getTemplate(c, body.templateId) : null;

    return renderDocument(
      {
        title: body.title || template?.name || 'Untitled Agreement',
        bodyHtml: body.bodyHtml ?? template?.bodyHtml ?? '',
        branding,
        project,
        values: body.values,
        placeholders: template?.placeholders,
        summaryTitle: body.summaryTitle ?? null,
        documentNumber: body.documentNumber ?? null,
        client: body.client ?? null,
        clientCompany: body.clientCompany ?? null,
        clientEmail: body.clientEmail ?? null,
        clientPhone: body.clientPhone ?? null,
        kickoffDate: body.kickoffDate ?? null,
        documentDate: body.documentDate ?? null,
        totalValue: body.totalValue ?? null,
        valueCurrency: body.valueCurrency ?? null,
        summaryFields: (body.summaryFields ?? null) as any,
        signatoryName: body.signatoryName ?? null,
        signatoryPosition: body.signatoryPosition ?? null,
        signatoryCompany: body.signatoryCompany ?? null,
        clientSignatoryName: body.clientSignatoryName ?? null,
        clientSignatoryPosition: body.clientSignatoryPosition ?? null,
        clientSignatoryCompany: body.clientSignatoryCompany ?? null,
        showSignatures: body.showSignatures ?? true,
      },
      'screen'
    );
  });

  res.type('html').send(document);
});

/**
 * The document as a real PDF, streamed back — never stored.
 *
 * WHY A PDF AND NOT MORE HTML: the preview has to show every page with its own
 * header and footer, and the only thing that knows where the pages break is the
 * printer. An HTML preview can show one long sheet honestly, or it can guess at
 * pagination and be wrong about widows, orphans and split tables. Handing back
 * the actual print output means the preview cannot disagree with the download,
 * because they are the same bytes.
 *
 * The browser is kept warm (see pdf.service.ts) so this costs a few hundred
 * milliseconds rather than the second a cold launch would.
 */
export const previewPdf = handle(async (req: AuthRequest, res: Response) => {
  const { tenantId } = actorOf(req);
  const body = previewSchema.parse(req.body);

  const html = await withTenant(tenantId, async (c) => {
    const branding = await getBranding(c);
    const project = body.projectId ? await projects.getProject(c, body.projectId) : null;
    const template = body.templateId ? await templates.getTemplate(c, body.templateId) : null;

    return renderDocument(
      {
        title: body.title || template?.name || 'Untitled Agreement',
        bodyHtml: body.bodyHtml ?? template?.bodyHtml ?? '',
        branding,
        project,
        values: body.values,
        placeholders: template?.placeholders,
        summaryTitle: body.summaryTitle ?? null,
        documentNumber: body.documentNumber ?? null,
        client: body.client ?? null,
        clientCompany: body.clientCompany ?? null,
        clientEmail: body.clientEmail ?? null,
        clientPhone: body.clientPhone ?? null,
        kickoffDate: body.kickoffDate ?? null,
        documentDate: body.documentDate ?? null,
        totalValue: body.totalValue ?? null,
        valueCurrency: body.valueCurrency ?? null,
        summaryFields: (body.summaryFields ?? null) as any,
        signatoryName: body.signatoryName ?? null,
        signatoryPosition: body.signatoryPosition ?? null,
        signatoryCompany: body.signatoryCompany ?? null,
        clientSignatoryName: body.clientSignatoryName ?? null,
        clientSignatoryPosition: body.clientSignatoryPosition ?? null,
        clientSignatoryCompany: body.clientSignatoryCompany ?? null,
        showSignatures: body.showSignatures ?? true,
      },
      'print'
    );
  });

  // Chrome runs OUTSIDE the tenant transaction: a render takes hundreds of
  // milliseconds and holding a pooled connection across it would starve the
  // pool under any real load.
  const pdf = await renderPdfBuffer(html);

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'inline; filename="preview.pdf"');
  // The viewer shows this beside the page count it renders.
  res.setHeader('X-Page-Count', String(pageCountOf(pdf)));
  res.setHeader('Access-Control-Expose-Headers', 'X-Page-Count');
  // A draft preview is never the same twice; caching it would show stale pages.
  res.setHeader('Cache-Control', 'no-store');
  res.send(pdf);
});

/** Render to A4, store in R2, and remember where it went. */
export const generatePdf = handle(async (req: AuthRequest, res: Response) => {
  const { tenantId } = actorOf(req);

  const prepared = await withTenant(tenantId, async (c) => {
    const agreement = await repo.getAgreement(c, req.params.id);
    if (!agreement) return null;
    const branding = await getBranding(c);
    const project = agreement.projectId ? await projects.getProject(c, agreement.projectId) : null;

    return {
      agreement,
      html: renderDocument(
        { ...summaryOf(agreement), branding, project },
        'print'
      ),
    };
  });

  if (!prepared) throw new AgreementError('Agreement not found', 404, 'NOT_FOUND');

  // Chrome runs OUTSIDE the tenant transaction on purpose: a PDF takes seconds,
  // and holding a pooled connection open for the whole of it would starve the
  // pool under any real load.
  const { url } = await generateAndStorePdf(
    prepared.html,
    tenantId,
    prepared.agreement.id,
    prepared.agreement.documentNumber || prepared.agreement.title
  );

  await withTenant(tenantId, (c) => repo.recordPdf(c, prepared.agreement.id, url));
  ok(res, { pdfUrl: url });
});

/**
 * The render input a STORED agreement implies.
 *
 * One place, so the on-screen document, the PDF and anything added later cannot
 * drift into printing different summary rows from each other. `contentHtml` is
 * already substituted — it is passed through untouched.
 */
function summaryOf(a: Agreement) {
  return {
    title: a.title,
    summaryTitle: a.summaryTitle,
    bodyHtml: a.contentHtml,
    documentNumber: a.documentNumber,
    effectiveDate: a.effectiveDate,
    client: a.partyName,
    clientCompany: a.clientCompany,
    clientEmail: a.partyEmail,
    clientPhone: a.partyPhone,
    kickoffDate: a.kickoffDate,
    documentDate: a.documentDate,
    totalValue: a.totalValue,
    valueCurrency: a.valueCurrency,
    summaryFields: a.summaryFields,
    signatoryName: a.signatoryName,
    signatoryPosition: a.signatoryPosition,
    signatoryCompany: a.signatoryCompany,
    clientSignatoryName: a.clientSignatoryName,
    clientSignatoryPosition: a.clientSignatoryPosition,
    clientSignatoryCompany: a.clientSignatoryCompany,
    showSignatures: a.showSignatures,
  };
}

/* ── Shared composition ──────────────────────────────────────────────────── */

/**
 * Turn a validated request into the row to write: resolve the project and the
 * template, then render the body ONCE and freeze it.
 */
async function composeInput(
  c: Parameters<typeof repo.createAgreement>[0],
  body: ReturnType<typeof agreementSchema.parse>
): Promise<repo.AgreementInput> {
  // A project is OPTIONAL. Only an id that was given and then failed to resolve
  // is an error — no id at all is a document that simply is not tied to one.
  const project = body.projectId ? await projects.getProject(c, body.projectId) : null;
  if (body.projectId && !project) {
    throw new AgreementError('That project no longer exists', 400, 'PROJECT_NOT_FOUND');
  }

  // The kind of document. Resolved and SNAPSHOT, so renaming the type later
  // never relabels a document somebody has already signed.
  const documentType = await documentTypes.getDocumentType(c, body.documentTypeId);
  if (!documentType) {
    throw new AgreementError('That document type no longer exists', 400, 'DOCUMENT_TYPE_NOT_FOUND');
  }

  const template = body.templateId ? await templates.getTemplate(c, body.templateId) : null;
  if (body.templateId && !template) {
    throw new AgreementError('That template no longer exists', 400, 'TEMPLATE_NOT_FOUND');
  }

  const branding = await getBranding(c);
  const values = {
    ...autoTokens(branding, project),
    ...Object.fromEntries((template?.placeholders ?? []).flatMap((p) =>
      p.defaultValue ? [[p.key, p.defaultValue]] : []
    )),
    ...body.values,
  };

  // Required fields are enforced here rather than in the schema: what is
  // required depends on the template that was chosen, which zod cannot know.
  const missing = (template?.placeholders ?? [])
    .filter((p) => p.required && !String(values[p.key] ?? '').trim())
    .map((p) => p.label);
  if (missing.length > 0 && body.status !== 'draft') {
    throw new AgreementError(
      `Fill in ${missing.join(', ')} before moving this out of draft`,
      400,
      'MISSING_REQUIRED_FIELDS'
    );
  }

  const contentHtml = body.useCustomContent
    ? body.contentHtml ?? ''
    : substitute(template?.bodyHtml ?? body.contentHtml ?? '', values);

  return {
    documentTypeId: documentType.id,
    documentTypeName: documentType.name,
    documentTypeCode: documentType.code,
    projectId: project?.id ?? null,
    projectName: project?.name ?? null,
    projectCode: project?.code ?? null,
    templateId: template?.id ?? null,
    templateName: template?.name ?? null,
    templateVersion: template?.version ?? null,
    title: body.title,
    summaryTitle: nullish(body.summaryTitle),
    documentNumber: nullish(body.documentNumber),
    contentHtml,
    status: body.status as AgreementStatus,
    effectiveDate: nullish(body.effectiveDate),
    expiryDate: nullish(body.expiryDate),
    clientId: nullish(body.clientId),
    clientCompany: nullish(body.clientCompany),
    clientContactId: nullish(body.clientContactId),
    partyName: nullish(body.partyName),
    partyEmail: nullish(body.partyEmail),
    partyPhone: nullish(body.partyPhone),
    documentDate: nullish(body.documentDate),
    kickoffDate: nullish(body.kickoffDate),
    totalValue: body.totalValue ?? null,
    valueCurrency: nullish(body.valueCurrency),
    // null, not an empty array: "every row" and "no rows" are different
    // answers, and only the first is a sensible default.
    summaryFields: (body.summaryFields ?? null) as any,
    signatoryName: nullish(body.signatoryName),
    signatoryPosition: nullish(body.signatoryPosition),
    signatoryCompany: nullish(body.signatoryCompany),
    clientSignatoryName: nullish(body.clientSignatoryName),
    clientSignatoryPosition: nullish(body.clientSignatoryPosition),
    clientSignatoryCompany: nullish(body.clientSignatoryCompany),
    showSignatures: body.showSignatures ?? true,
    notes: nullish(body.notes),
    values: body.values,
  };
}

const str = (v: unknown): string | undefined =>
  typeof v === 'string' && v.trim() ? v.trim() : undefined;

const nullish = (v: unknown): string | null => {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
};
