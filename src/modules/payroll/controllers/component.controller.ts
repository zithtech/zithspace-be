// src/modules/payroll/controllers/component.controller.ts
// Thin HTTP layer: validate input → call service → shape response.

import { AuthRequest } from '@/types';
import { Response } from 'express';
import { actorOf, handle, ok } from '../http';
import * as service from '../services/component.service';
import { ComponentCategory } from '../types';
import {
  createComponentSchema,
  updateComponentSchema,
} from '../validators/component.validator';

const CATEGORIES: ComponentCategory[] = ['earning', 'deduction', 'reimbursement', 'benefit'];

export const create = handle(async (req: AuthRequest, res: Response) => {
  const input = createComponentSchema.parse(req.body);
  const component = await service.createComponent(actorOf(req), input);
  ok(res, component, 201);
});

export const list = handle(async (req: AuthRequest, res: Response) => {
  const includeInactive = req.query.includeInactive === 'true';
  const categoryParam = req.query.category as string | undefined;
  const category = CATEGORIES.includes(categoryParam as ComponentCategory)
    ? (categoryParam as ComponentCategory)
    : undefined;
  const components = await service.listComponents(actorOf(req), { includeInactive, category });
  ok(res, components);
});

export const getOne = handle(async (req: AuthRequest, res: Response) => {
  const component = await service.getComponent(actorOf(req), req.params.id);
  ok(res, component);
});

export const update = handle(async (req: AuthRequest, res: Response) => {
  const input = updateComponentSchema.parse(req.body);
  const component = await service.updateComponent(actorOf(req), req.params.id, input);
  ok(res, component);
});

export const remove = handle(async (req: AuthRequest, res: Response) => {
  await service.deleteComponent(actorOf(req), req.params.id);
  ok(res, { id: req.params.id, deleted: true });
});
