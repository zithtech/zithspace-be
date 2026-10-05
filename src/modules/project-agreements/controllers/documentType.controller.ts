// src/modules/project-agreements/controllers/documentType.controller.ts
//
// Settings → Document Types. Reading is open to anyone who may read an
// agreement (the pickers need it); writing needs the module's manage
// permission, like the letterhead.

import { Response } from 'express';
import { AuthRequest } from '@/types';
import { withTenant } from '../db/pool';
import { AgreementError, actorOf, handle, ok } from '../http';
import * as repo from '../repositories/documentType.repo';
import { documentTypeSchema } from '../validators';
import { DocumentTypeStatus } from '../types';

export const list = handle(async (req: AuthRequest, res: Response) => {
  const { tenantId } = actorOf(req);
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : undefined;
  const status = typeof req.query.status === 'string' ? req.query.status : undefined;
  // The pickers ask for activeOnly; the settings tab wants everything.
  const activeOnly = req.query.activeOnly === 'true' || req.query.activeOnly === '1';

  const types = await withTenant(tenantId, (c) =>
    repo.listDocumentTypes(c, {
      search,
      status: (status || undefined) as DocumentTypeStatus | undefined,
      activeOnly,
    })
  );
  ok(res, types);
});

export const create = handle(async (req: AuthRequest, res: Response) => {
  const { tenantId, userId } = actorOf(req);
  const body = documentTypeSchema.parse(req.body);

  const created = await withTenant(tenantId, async (c) => {
    if (await repo.codeTaken(c, body.code)) {
      throw new AgreementError(
        `The code ${body.code} is already in use`,
        409,
        'DOCUMENT_TYPE_CODE_TAKEN'
      );
    }
    return repo.createDocumentType(
      c,
      { name: body.name, code: body.code, description: body.description ?? null, status: body.status as DocumentTypeStatus },
      userId
    );
  });

  ok(res, created, 201);
});

export const update = handle(async (req: AuthRequest, res: Response) => {
  const { tenantId, userId } = actorOf(req);
  const body = documentTypeSchema.parse(req.body);

  const updated = await withTenant(tenantId, async (c) => {
    if (await repo.codeTaken(c, body.code, req.params.id)) {
      throw new AgreementError(
        `The code ${body.code} is already in use`,
        409,
        'DOCUMENT_TYPE_CODE_TAKEN'
      );
    }
    return repo.updateDocumentType(
      c,
      req.params.id,
      { name: body.name, code: body.code, description: body.description ?? null, status: body.status as DocumentTypeStatus },
      userId
    );
  });

  if (!updated) throw new AgreementError('Document type not found', 404, 'NOT_FOUND');
  ok(res, updated);
});

export const remove = handle(async (req: AuthRequest, res: Response) => {
  const { tenantId, userId } = actorOf(req);

  await withTenant(tenantId, async (c) => {
    const usage = await repo.usageOf(c, req.params.id);
    if (usage.templates > 0 || usage.agreements > 0) {
      // Deactivating is the answer here, and the message says so: it takes the
      // type out of every picker without stranding what already cites it.
      const parts = [
        usage.templates ? `${usage.templates} template(s)` : null,
        usage.agreements ? `${usage.agreements} agreement(s)` : null,
      ].filter(Boolean);
      throw new AgreementError(
        `${parts.join(' and ')} still use this type. Set it to Inactive instead.`,
        409,
        'DOCUMENT_TYPE_IN_USE'
      );
    }
    const gone = await repo.deleteDocumentType(c, req.params.id, userId);
    if (!gone) throw new AgreementError('Document type not found', 404, 'NOT_FOUND');
  });

  ok(res, { id: req.params.id });
});
