// src/modules/leave-v2/controllers/holiday.controller.ts
import { AuthRequest } from '@/types';
import { Response } from 'express';
import { actorOf, handle, ok } from '../http';
import * as service from '../services/holiday.service';
import { holidaySchema } from '../validators/holiday.validator';
import { LeaveV2Error } from '../types';

export const catalogCountries = handle(async (req: AuthRequest, res: Response) => {
  ok(res, await service.getCatalogCountries(actorOf(req)));
});

export const catalog = handle(async (req: AuthRequest, res: Response) => {
  const country = (req.query.country as string) || 'IN';
  ok(res, await service.listCatalog(actorOf(req), country));
});

export const catalogAdd = handle(async (req: AuthRequest, res: Response) => {
  const ids = req.body?.catalogIds;
  if (!Array.isArray(ids) || ids.length === 0) throw LeaveV2Error.badRequest('catalogIds is required');
  ok(res, await service.addFromCatalog(actorOf(req), ids), 201);
});

export const list = handle(async (req: AuthRequest, res: Response) => {
  const year = req.query.year ? Number(req.query.year) : undefined;
  const includeInactive = req.query.includeInactive === 'true';
  ok(res, await service.listHolidays(actorOf(req), { year, includeInactive }));
});

export const getOne = handle(async (req: AuthRequest, res: Response) => {
  ok(res, await service.getHoliday(actorOf(req), req.params.id));
});

export const create = handle(async (req: AuthRequest, res: Response) => {
  const input = holidaySchema.parse(req.body);
  ok(res, await service.createHoliday(actorOf(req), input), 201);
});

export const update = handle(async (req: AuthRequest, res: Response) => {
  const input = holidaySchema.parse(req.body);
  ok(res, await service.updateHoliday(actorOf(req), req.params.id, input));
});

export const remove = handle(async (req: AuthRequest, res: Response) => {
  await service.deleteHoliday(actorOf(req), req.params.id);
  ok(res, { id: req.params.id, deleted: true });
});
