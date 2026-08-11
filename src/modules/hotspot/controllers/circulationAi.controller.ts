// src/modules/hotspot/controllers/circulationAi.controller.ts
// Thin HTTP layer for the Circulation writing assist. Stateless — nothing is
// persisted, so there is no transaction history to record here.

import { Response } from 'express';
import { AuthRequest } from '@/types';
import { actorOf, handle, ok } from '../http';
import * as service from '../services/circulationAi.service';
import { composeSchema, grammarSchema } from '../validators/circulationAi.validator';

/** Draft a title and body from a one-line brief. */
export const compose = handle(async (req: AuthRequest, res: Response) => {
  const input = composeSchema.parse(req.body ?? {});
  ok(res, await service.compose(actorOf(req).tenantId, input));
});

/** Fix spelling/grammar in the draft without touching wording or markup. */
export const grammar = handle(async (req: AuthRequest, res: Response) => {
  const { html } = grammarSchema.parse(req.body ?? {});
  ok(res, await service.fixGrammar(actorOf(req).tenantId, html));
});
