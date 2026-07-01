// src/modules/payroll/controllers/structure.controller.ts
// Thin HTTP layer: validate input → call service → shape response.

import { AuthRequest } from '@/types';
import { Response } from 'express';
import { actorOf, handle, ok } from '../http';
import * as service from '../services/structure.service';
import {
  createStructureSchema,
  previewStructureSchema,
  updateStructureSchema,
} from '../validators/structure.validator';

export const create = handle(async (req: AuthRequest, res: Response) => {
  const input = createStructureSchema.parse(req.body);
  const structure = await service.createStructure(actorOf(req), input);
  ok(res, structure, 201);
});

export const list = handle(async (req: AuthRequest, res: Response) => {
  const includeInactive = req.query.includeInactive === 'true';
  const structures = await service.listStructures(actorOf(req), { includeInactive });
  ok(res, structures);
});

export const getOne = handle(async (req: AuthRequest, res: Response) => {
  const structure = await service.getStructure(actorOf(req), req.params.id);
  ok(res, structure);
});

export const update = handle(async (req: AuthRequest, res: Response) => {
  const input = updateStructureSchema.parse(req.body);
  const structure = await service.updateStructure(actorOf(req), req.params.id, input);
  ok(res, structure);
});

export const remove = handle(async (req: AuthRequest, res: Response) => {
  await service.deleteStructure(actorOf(req), req.params.id);
  ok(res, { id: req.params.id, deleted: true });
});

// Live preview of a breakdown for unsaved drawer edits.
export const preview = handle(async (req: AuthRequest, res: Response) => {
  const input = previewStructureSchema.parse(req.body);
  const result = await service.previewStructure(actorOf(req), input);
  ok(res, result);
});
