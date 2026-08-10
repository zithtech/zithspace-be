// src/modules/company-details/controllers/companyDetails.controller.ts
// Thin HTTP layer: validate → delegate to the service → record the audit trail.

import { Response } from 'express';
import { AuthRequest } from '@/types';
import { recordTransaction, Section, Module, Page, Action } from '@/utils/transactionHistory';
import { actorOf, handle, ok } from '../http';
import * as service from '../services/companyDetails.service';
import {
  createBranchSchema,
  saveCompanyDetailsSchema,
  updateBranchSchema,
} from '../validators/companyDetails.validator';

type ActionValue = (typeof Action)[keyof typeof Action];

const audit = (
  req: AuthRequest,
  action: ActionValue,
  label: string,
  entityType: string,
  entityId: string,
  entityLabel: string
) =>
  recordTransaction({
    req,
    section: Section.ADMIN,
    module: Module.GENERAL_SETTINGS,
    page: Page.GENERAL_SETTINGS_VIEW,
    action,
    actionLabel: label,
    entityType,
    entityId,
    entityLabel,
  });

/** Company profile + branches in one round trip — what the settings tab loads. */
export const getOverview = handle(async (req: AuthRequest, res: Response) => {
  ok(res, await service.getOverview(actorOf(req)));
});

export const getCompany = handle(async (req: AuthRequest, res: Response) => {
  ok(res, await service.getCompany(actorOf(req)));
});

/** Upsert: the first call creates the tenant's company row, later ones update it. */
export const saveCompany = handle(async (req: AuthRequest, res: Response) => {
  const input = saveCompanyDetailsSchema.parse(req.body);
  const existed = !!(await service.getCompany(actorOf(req)));
  const company = await service.saveCompany(actorOf(req), input);

  audit(
    req,
    existed ? Action.UPDATE : Action.CREATE,
    `Company details ${existed ? 'updated' : 'created'}: ${company.registeredName}`,
    'company_details',
    company.id,
    company.registeredName
  );
  ok(res, company, existed ? 200 : 201);
});

export const listBranches = handle(async (req: AuthRequest, res: Response) => {
  ok(res, await service.listBranches(actorOf(req)));
});

export const getBranch = handle(async (req: AuthRequest, res: Response) => {
  ok(res, await service.getBranch(actorOf(req), req.params.id));
});

export const createBranch = handle(async (req: AuthRequest, res: Response) => {
  const input = createBranchSchema.parse(req.body);
  const branch = await service.createBranch(actorOf(req), input);

  audit(
    req,
    Action.CREATE,
    `Branch location created: ${branch.branchName}`,
    'company_branch',
    branch.id,
    branch.branchName
  );
  ok(res, branch, 201);
});

export const updateBranch = handle(async (req: AuthRequest, res: Response) => {
  const input = updateBranchSchema.parse(req.body);
  const branch = await service.updateBranch(actorOf(req), req.params.id, input);

  audit(
    req,
    Action.UPDATE,
    `Branch location updated: ${branch.branchName}`,
    'company_branch',
    branch.id,
    branch.branchName
  );
  ok(res, branch);
});

export const deleteBranch = handle(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  // Read before deleting so the audit entry can name what disappeared.
  const branch = await service.getBranch(actorOf(req), id);
  await service.deleteBranch(actorOf(req), id);

  audit(
    req,
    Action.DELETE,
    `Branch location deleted: ${branch.branchName}`,
    'company_branch',
    id,
    branch.branchName
  );
  ok(res, { id });
});
