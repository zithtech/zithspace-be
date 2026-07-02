// src/modules/leave-v2/controllers/holiday.controller.ts
import { AuthRequest } from '@/types';
import { Response } from 'express';
import { actorOf, handle, ok } from '../http';
import * as service from '../services/holiday.service';
import { holidaySchema } from '../validators/holiday.validator';
import { LeaveV2Error } from '../types';
import { recordTransaction, Section, Module, Page, Action, EntityType, diffShallow } from '@/utils/transactionHistory';

function holidaySnapshot(h: any) {
  return {
    name: h.name,
    fromDate: h.fromDate,
    toDate: h.toDate,
    type: h.type,
    country: h.country,
    states: h.states,
    districts: h.districts,
    rule: h.rule,
    isActive: h.isActive,
  };
}

function holidayLabel(h: any): string {
  return h.fromDate === h.toDate ? `${h.name} · ${h.fromDate}` : `${h.name} · ${h.fromDate} → ${h.toDate}`;
}

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
  const result = await service.addFromCatalog(actorOf(req), ids);
  if (result.added > 0) {
    recordTransaction({
      req,
      section: Section.HR,
      module: Module.LEAVES,
      page: Page.LEAVE_HOLIDAYS,
      action: Action.CREATE,
      actionLabel: `Added ${result.added} holiday${result.added === 1 ? '' : 's'} from catalog${result.skipped ? ` (${result.skipped} already present)` : ''}`,
      entityType: EntityType.LEAVE_HOLIDAY,
      metadata: { ...result, catalogIds: ids },
    });
  }
  ok(res, result, 201);
});

export const catalogRemove = handle(async (req: AuthRequest, res: Response) => {
  const ids = req.body?.catalogIds;
  if (!Array.isArray(ids) || ids.length === 0) throw LeaveV2Error.badRequest('catalogIds is required');
  const result = await service.removeFromCatalog(actorOf(req), ids);
  if (result.removed > 0) {
    recordTransaction({
      req,
      section: Section.HR,
      module: Module.LEAVES,
      page: Page.LEAVE_HOLIDAYS,
      action: Action.DELETE,
      actionLabel: `Removed ${result.removed} holiday${result.removed === 1 ? '' : 's'} via catalog${result.missing ? ` (${result.missing} not found)` : ''}`,
      entityType: EntityType.LEAVE_HOLIDAY,
      metadata: { ...result, catalogIds: ids },
    });
  }
  ok(res, result);
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
  const holiday = await service.createHoliday(actorOf(req), input);
  recordTransaction({
    req,
    section: Section.HR,
    module: Module.LEAVES,
    page: Page.LEAVE_HOLIDAYS,
    action: Action.CREATE,
    actionLabel: `Added holiday "${holiday.name}"`,
    entityType: EntityType.LEAVE_HOLIDAY,
    entityId: holiday.id,
    entityLabel: holidayLabel(holiday),
    afterData: holidaySnapshot(holiday),
  });
  ok(res, holiday, 201);
});

export const update = handle(async (req: AuthRequest, res: Response) => {
  const input = holidaySchema.parse(req.body);
  const actor = actorOf(req);
  const before = await service.getHoliday(actor, req.params.id);
  const holiday = await service.updateHoliday(actor, req.params.id, input);
  const { changedFields, before: b, after: a } = diffShallow(holidaySnapshot(before), holidaySnapshot(holiday));
  if (changedFields.length > 0) {
    recordTransaction({
      req,
      section: Section.HR,
      module: Module.LEAVES,
      page: Page.LEAVE_HOLIDAYS,
      action: Action.UPDATE,
      actionLabel: `Updated holiday "${holiday.name}"`,
      entityType: EntityType.LEAVE_HOLIDAY,
      entityId: holiday.id,
      entityLabel: holidayLabel(holiday),
      beforeData: b,
      afterData: a,
      changedFields,
    });
  }
  ok(res, holiday);
});

export const remove = handle(async (req: AuthRequest, res: Response) => {
  const actor = actorOf(req);
  const existing = await service.getHoliday(actor, req.params.id);
  await service.deleteHoliday(actor, req.params.id);
  recordTransaction({
    req,
    section: Section.HR,
    module: Module.LEAVES,
    page: Page.LEAVE_HOLIDAYS,
    action: Action.DELETE,
    actionLabel: `Deleted holiday "${existing.name}"`,
    entityType: EntityType.LEAVE_HOLIDAY,
    entityId: req.params.id,
    entityLabel: holidayLabel(existing),
    beforeData: holidaySnapshot(existing),
  });
  ok(res, { id: req.params.id, deleted: true });
});
