// src/modules/pipeline/controllers/configController.ts
import { Response } from 'express';
import { AuthRequest } from '@/types';
import { handle, actorOf, ok } from '../http';
import * as configService from '../services/configService';

export const createConfig = handle(async (req: AuthRequest, res: Response) => {
  const actor = actorOf(req);
  const data = req.body;
  const config = await configService.createConfig(actor.tenantId, data);
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
  ok(res, config);
});

export const deleteConfig = handle(async (req: AuthRequest, res: Response) => {
  const actor = actorOf(req);
  await configService.deleteConfig(actor.tenantId, req.params.id);
  ok(res, { success: true });
});
