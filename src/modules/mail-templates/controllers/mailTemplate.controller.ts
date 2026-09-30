// src/modules/mail-templates/controllers/mailTemplate.controller.ts
// Thin HTTP layer: validate → delegate to the service → record the audit trail.

import { Response } from 'express';
import { AuthRequest } from '@/types';
import { recordTransaction, Section, Module, Page, Action } from '@/utils/transactionHistory';
import { actorOf, handle, ok } from '../http';
import * as service from '../services/mailTemplate.service';
import {
  createTemplateSchema,
  renderTemplateSchema,
  saveSignatureSchema,
  updateTemplateSchema,
} from '../validators/mailTemplate.validator';

type ActionValue = (typeof Action)[keyof typeof Action];

const audit = (req: AuthRequest, action: ActionValue, label: string, id: string, name: string) =>
  recordTransaction({
    req,
    section: Section.HOME,
    module: Module.INTEGRATIONS,
    page: Page.INTEGRATION_MAIL,
    action,
    actionLabel: label,
    entityType: 'mail_template',
    entityId: id,
    entityLabel: name,
  });

/**
 * The placeholder catalogue. Static, so it needs no tenant round trip — the
 * editor asks for it once and renders the groups as clickable chips.
 */
export const getPlaceholders = handle(async (_req: AuthRequest, res: Response) => {
  ok(res, service.getPlaceholders());
});

export const listTemplates = handle(async (req: AuthRequest, res: Response) => {
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : undefined;
  const category = typeof req.query.category === 'string' ? req.query.category.trim() : undefined;
  ok(res, await service.listTemplates(actorOf(req), search || undefined, category || undefined));
});

/** The category shelves shown under Templates in the mail sidebar. */
export const listCategories = handle(async (req: AuthRequest, res: Response) => {
  ok(res, await service.listCategories(actorOf(req)));
});

export const getTemplate = handle(async (req: AuthRequest, res: Response) => {
  ok(res, await service.getTemplate(actorOf(req), req.params.id));
});

export const createTemplate = handle(async (req: AuthRequest, res: Response) => {
  const input = createTemplateSchema.parse(req.body);
  const template = await service.createTemplate(actorOf(req), input);

  audit(req, Action.CREATE, `Mail template created: ${template.name}`, template.id, template.name);
  ok(res, template, 201);
});

export const updateTemplate = handle(async (req: AuthRequest, res: Response) => {
  const input = updateTemplateSchema.parse(req.body);
  const template = await service.updateTemplate(actorOf(req), req.params.id, input);

  audit(req, Action.UPDATE, `Mail template updated: ${template.name}`, template.id, template.name);
  ok(res, template);
});

export const deleteTemplate = handle(async (req: AuthRequest, res: Response) => {
  // Read it first so the audit line can name what went, not just its id.
  const template = await service.getTemplate(actorOf(req), req.params.id);
  await service.deleteTemplate(actorOf(req), req.params.id);

  audit(req, Action.DELETE, `Mail template deleted: ${template.name}`, template.id, template.name);
  ok(res, { id: template.id });
});

export const setDefault = handle(async (req: AuthRequest, res: Response) => {
  const template = await service.setDefault(actorOf(req), req.params.id);

  audit(
    req,
    Action.UPDATE,
    `Default mail template set: ${template.name}`,
    template.id,
    template.name
  );
  ok(res, template);
});

/**
 * The signed-in member's signature. Never another member's: the actor is the
 * only user id that reaches the repository.
 */
export const getSignature = handle(async (req: AuthRequest, res: Response) => {
  ok(res, await service.getSignature(actorOf(req)));
});

export const saveSignature = handle(async (req: AuthRequest, res: Response) => {
  const { html } = saveSignatureSchema.parse(req.body);
  const signature = await service.saveSignature(actorOf(req), html);

  audit(req, Action.UPDATE, 'Mail signature updated', actorOf(req).userId, 'My signature');
  ok(res, signature);
});

/** Discard the saved signature and fall back to the autofilled one. */
export const resetSignature = handle(async (req: AuthRequest, res: Response) => {
  const signature = await service.resetSignature(actorOf(req));

  audit(req, Action.DELETE, 'Mail signature reset to member details', actorOf(req).userId, 'My signature');
  ok(res, signature);
});

/** Who a template can be addressed to — client contacts and members. */
export const listRecipients = handle(async (req: AuthRequest, res: Response) => {
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : undefined;
  ok(res, await service.searchRecipients(actorOf(req), search || undefined));
});

/**
 * Fill a template in for one recipient. A read, not a write — Compose calls it
 * every time the template or the "To" address changes, so it records nothing.
 */
export const renderTemplate = handle(async (req: AuthRequest, res: Response) => {
  const input = renderTemplateSchema.parse(req.body);
  ok(res, await service.renderForRecipient(actorOf(req), req.params.id, input));
});
