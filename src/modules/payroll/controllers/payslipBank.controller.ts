// src/modules/payroll/controllers/payslipBank.controller.ts
// Thin HTTP layer for payslip template & bank settings.

import { AuthRequest } from '@/types';
import { Response } from 'express';
import { actorOf, handle, ok } from '../http';
import * as service from '../services/payslipBank.service';
import * as payslipService from '../services/payslip.service';
import { updatePayslipTemplateSchema, updateBankSettingsSchema, uploadPayslipLogoSchema } from '../validators/payslipBank.validator';

export const getTemplate = handle(async (req: AuthRequest, res: Response) => {
  ok(res, await service.getTemplate(actorOf(req)));
});
export const updateTemplate = handle(async (req: AuthRequest, res: Response) => {
  ok(res, await service.updateTemplate(actorOf(req), updatePayslipTemplateSchema.parse(req.body)));
});

// Sample payslip HTML for the settings preview drawer (reflects the posted config).
export const previewTemplate = handle(async (req: AuthRequest, res: Response) => {
  const cfg = updatePayslipTemplateSchema.parse(req.body);
  const html = await payslipService.renderSampleHtml(actorOf(req), cfg);
  ok(res, { html });
});
// Upload a company logo (base64 data URI) → returns its public R2 URL.
export const uploadLogo = handle(async (req: AuthRequest, res: Response) => {
  const { image } = uploadPayslipLogoSchema.parse(req.body);
  ok(res, await service.uploadLogo(actorOf(req), image));
});
export const getBank = handle(async (req: AuthRequest, res: Response) => {
  ok(res, await service.getBank(actorOf(req)));
});
export const updateBank = handle(async (req: AuthRequest, res: Response) => {
  ok(res, await service.updateBank(actorOf(req), updateBankSettingsSchema.parse(req.body)));
});
