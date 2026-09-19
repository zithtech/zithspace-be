// src/modules/project-agreements/controllers/client.controller.ts
//
// The client picker in the composer, and the contact list that opens once a
// client is chosen.
//
// Gated by this module's own read permission rather than the Clients module's,
// for the same reason the project picker is: somebody who may raise an
// agreement must be able to address it, and that should not require handing
// them the whole client book.

import { Response } from 'express';
import { AuthRequest } from '@/types';
import { withTenant } from '../db/pool';
import { AgreementError, actorOf, handle, ok } from '../http';
import * as repo from '../repositories/client.repo';

export const list = handle(async (req: AuthRequest, res: Response) => {
  const { tenantId } = actorOf(req);
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : undefined;
  const clients = await withTenant(tenantId, (c) => repo.listClients(c, search));
  ok(res, clients);
});

/** One client and everyone at it the document could be addressed to. */
export const contacts = handle(async (req: AuthRequest, res: Response) => {
  const { tenantId } = actorOf(req);

  const payload = await withTenant(tenantId, async (c) => {
    const client = await repo.getClient(c, req.params.id);
    if (!client) return null;
    return { client, contacts: await repo.listContacts(c, req.params.id) };
  });

  if (!payload) throw new AgreementError('Client not found', 404, 'NOT_FOUND');
  ok(res, payload);
});
