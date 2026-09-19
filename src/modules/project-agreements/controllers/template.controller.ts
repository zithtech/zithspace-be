// src/modules/project-agreements/controllers/template.controller.ts
//
// Agreement templates: the reusable wording a document is cut from.

import { Response } from 'express';
import { AuthRequest } from '@/types';
import { withTenant } from '../db/pool';
import { AgreementError, actorOf, handle, ok } from '../http';
import * as repo from '../repositories/template.repo';
import * as documentTypes from '../repositories/documentType.repo';
import { templateSchema, templateStatusSchema } from '../validators';
import { TemplateStatus } from '../types';
import { tokensIn } from '../services/render.service';

export const list = handle(async (req: AuthRequest, res: Response) => {
  const { tenantId } = actorOf(req);
  const status = typeof req.query.status === 'string' ? (req.query.status as TemplateStatus) : undefined;
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : undefined;
  const publishedOnly = req.query.publishedOnly === 'true';

  const templates = await withTenant(tenantId, (c) =>
    repo.listTemplates(c, { status, search, publishedOnly })
  );
  ok(res, templates);
});

export const detail = handle(async (req: AuthRequest, res: Response) => {
  const { tenantId } = actorOf(req);
  const template = await withTenant(tenantId, (c) => repo.getTemplate(c, req.params.id));
  if (!template) throw new AgreementError('Template not found', 404, 'NOT_FOUND');
  ok(res, template);
});

/**
 * The type has no foreign key (see migration 011), so it is checked here.
 * Without this a mistyped id stores silently and surfaces as a template with a
 * blank kind, weeks later.
 */
async function requireDocumentType(
  c: Parameters<typeof repo.createTemplate>[0],
  id: string
): Promise<void> {
  const type = await documentTypes.getDocumentType(c, id);
  if (!type) {
    throw new AgreementError('That document type no longer exists', 400, 'DOCUMENT_TYPE_NOT_FOUND');
  }
}

export const create = handle(async (req: AuthRequest, res: Response) => {
  const { tenantId, userId } = actorOf(req);
  const body = templateSchema.parse(req.body);

  const template = await withTenant(tenantId, async (c) => {
    await requireDocumentType(c, body.documentTypeId);
    return repo.createTemplate(c, reconcile(body), userId);
  });
  ok(res, template, 201);
});

export const update = handle(async (req: AuthRequest, res: Response) => {
  const { tenantId, userId } = actorOf(req);
  const body = templateSchema.parse(req.body);

  const template = await withTenant(tenantId, async (c) => {
    await requireDocumentType(c, body.documentTypeId);
    return repo.updateTemplate(c, req.params.id, reconcile(body), userId);
  });
  if (!template) throw new AgreementError('Template not found', 404, 'NOT_FOUND');
  ok(res, template);
});

export const setStatus = handle(async (req: AuthRequest, res: Response) => {
  const { tenantId, userId } = actorOf(req);
  const { status } = templateStatusSchema.parse(req.body);

  const template = await withTenant(tenantId, (c) =>
    repo.setTemplateStatus(c, req.params.id, status as TemplateStatus, userId)
  );
  if (!template) throw new AgreementError('Template not found', 404, 'NOT_FOUND');
  ok(res, template);
});

export const duplicate = handle(async (req: AuthRequest, res: Response) => {
  const { tenantId, userId } = actorOf(req);
  const template = await withTenant(tenantId, (c) =>
    repo.duplicateTemplate(c, req.params.id, userId)
  );
  if (!template) throw new AgreementError('Template not found', 404, 'NOT_FOUND');
  ok(res, template, 201);
});

export const remove = handle(async (req: AuthRequest, res: Response) => {
  const { tenantId } = actorOf(req);
  const deleted = await withTenant(tenantId, (c) => repo.deleteTemplate(c, req.params.id));
  if (!deleted) throw new AgreementError('Template not found', 404, 'NOT_FOUND');
  ok(res, { id: req.params.id });
});

/**
 * Reconcile the declared placeholder list with the tokens the body actually
 * uses, so the composer never asks for a field the wording dropped and never
 * silently omits one the author typed straight into the text.
 *
 * A token with no declared placeholder becomes a manual text field; a declared
 * placeholder the body no longer mentions is discarded. Auto-resolved tokens
 * (project_*, company_*, today — see render.service.ts) are deliberately NOT
 * turned into form fields: the composer already knows their answers.
 */
function reconcile(body: ReturnType<typeof templateSchema.parse>) {
  const used = new Set(tokensIn(body.bodyHtml));
  const declared = new Map(body.placeholders.map((p) => [p.key, p]));

  const AUTO = /^(project_|company_)|^today$/;

  const merged = [...used]
    .filter((key) => !AUTO.test(key) || declared.has(key))
    .map((key, index) => {
      const existing = declared.get(key);
      return {
        key,
        label: existing?.label ?? humanise(key),
        dataType: (existing?.dataType ?? 'text') as any,
        source: (existing?.source ?? 'manual') as any,
        required: existing?.required ?? false,
        defaultValue: existing?.defaultValue ?? null,
        displayOrder: existing?.displayOrder ?? index,
      };
    })
    .sort((a, b) => a.displayOrder - b.displayOrder);

  return { ...body, placeholders: merged } as any;
}

const humanise = (key: string): string =>
  key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
