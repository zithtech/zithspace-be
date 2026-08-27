// src/modules/pipeline/controllers/configController.ts
import { Response } from 'express';
import { AuthRequest } from '@/types';
import { handle, actorOf, ok } from '../http';
import * as configService from '../services/configService';
import {
  recordTransaction,
  Section,
  Module,
  Page,
  Action,
  EntityType,
} from '@/utils/transactionHistory';

export const createConfig = handle(async (req: AuthRequest, res: Response) => {
  const actor = actorOf(req);
  const data = req.body;
  const config = await configService.createConfig(actor.tenantId, data);
  recordTransaction({
    req,
    section: Section.HR,
    module: Module.RECRUITMENT,
    page: Page.CANDIDATE_PIPELINE_SETTINGS,
    action: Action.CREATE,
    actionLabel: `Created configuration`,
    entityType: EntityType.PIPELINE_CONFIG,
    entityId: config.id,
    afterData: { name: config.name, type: config.type },
  });
  ok(res, config, 201);
});

export const listConfigs = handle(async (req: AuthRequest, res: Response) => {
  const actor = actorOf(req);
  const configs = await configService.listConfigs(actor.tenantId);
  ok(res, configs);
});

export const updateConfig = handle(async (req: AuthRequest, res: Response) => {
  const actor = actorOf(req);
  const data = req.body;
  const config = await configService.updateConfig(actor.tenantId, req.params.id, data);
  recordTransaction({
    req,
    section: Section.HR,
    module: Module.RECRUITMENT,
    page: Page.CANDIDATE_PIPELINE_SETTINGS,
    action: Action.UPDATE,
    actionLabel: `Updated configuration`,
    entityType: EntityType.PIPELINE_CONFIG,
    entityId: config.id,
    afterData: { name: config.name, type: config.type },
  });
  ok(res, config);
});

export const deleteConfig = handle(async (req: AuthRequest, res: Response) => {
  const actor = actorOf(req);
  await configService.deleteConfig(actor.tenantId, req.params.id);
  recordTransaction({
    req,
    section: Section.HR,
    module: Module.RECRUITMENT,
    page: Page.CANDIDATE_PIPELINE_SETTINGS,
    action: Action.DELETE,
    actionLabel: `Deleted configuration`,
    entityType: EntityType.PIPELINE_CONFIG,
    entityId: req.params.id,
  });
  ok(res, { success: true });
});
