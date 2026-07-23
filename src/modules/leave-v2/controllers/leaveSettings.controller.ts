import { Response } from 'express';
import { AuthRequest } from '@/types';
import { actorOf, handle, ok } from '../http';
import * as service from '../services/leaveSettings.service';

export const getMailSettings = handle(async (req: AuthRequest, res: Response) => {
  const actor = actorOf(req);
  const data = await service.getMailSettings(actor);
  ok(res, data);
});

export const updateMailSettings = handle(async (req: AuthRequest, res: Response) => {
  const actor = actorOf(req);
  // Optional: add validation here
  const data = await service.updateMailSettings(actor, req.body);
  ok(res, data);
});
