// src/modules/opening-management/controllers/aiAssist.controller.ts
// Thin HTTP layer for the AI writing assist. Stateless — nothing is persisted,
// so there is no transaction history to record here.

import { AuthRequest } from '@/types';
import { Response } from 'express';
import { actorOf, handle, ok } from '../http';
import * as service from '../services/aiAssist.service';
import {
  enhanceSchema,
  grammarSchema,
  suggestSchema,
} from '../validators/aiAssist.validator';

/** Fix spelling/grammar without rewriting the user's words. */
export const grammar = handle(async (req: AuthRequest, res: Response) => {
  const { text } = grammarSchema.parse(req.body);
  const corrected = await service.fixGrammar(actorOf(req).tenantId, text);
  ok(res, { text: corrected, changed: corrected.trim() !== text.trim() });
});

/**
 * The list the "Enhance content" popup shows before anything is written.
 * Served from the shared per-title cache when there is one; `refresh: true`
 * forces a fresh generation.
 */
export const suggest = handle(async (req: AuthRequest, res: Response) => {
  const input = suggestSchema.parse(req.body);
  const result = await service.suggest(
    actorOf(req).tenantId,
    input.field,
    input.context as service.AssistContext,
    { refresh: input.refresh }
  );
  ok(res, result);
});

/** Write or improve the field, covering whatever the user ticked. */
export const enhance = handle(async (req: AuthRequest, res: Response) => {
  const input = enhanceSchema.parse(req.body);

  // Persist the user's own additions on confirm — cancelling stores nothing.
  if (input.customItems?.length) {
    await service.saveCustomItems(
      input.context.jobTitle,
      input.field,
      input.customItems.map((c) => ({ groupKey: c.groupKey, items: c.items }))
    );
  }

  const result = await service.enhance(actorOf(req).tenantId, {
    field: input.field,
    currentText: input.currentText ?? null,
    selected: input.selected,
    context: input.context as service.AssistContext,
  });
  // `missing` is reported rather than swallowed — if a selection did not make
  // it in even after the retry, the user should be told, not left to spot it.
  ok(res, result);
});
