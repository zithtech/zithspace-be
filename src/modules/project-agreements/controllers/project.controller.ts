// src/modules/project-agreements/controllers/project.controller.ts
//
// The project picker at the top of the composer, plus the context block that
// prefills {{project_*}} tokens once one is chosen.

import { Response } from 'express';
import { AuthRequest } from '@/types';
import { withTenant } from '../db/pool';
import { AgreementError, actorOf, handle, ok } from '../http';
import * as repo from '../repositories/project.repo';
import { getBranding } from '../repositories/branding.repo';
import { autoTokens } from '../services/render.service';

export const list = handle(async (req: AuthRequest, res: Response) => {
  const { tenantId } = actorOf(req);
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : undefined;
  const projects = await withTenant(tenantId, (c) => repo.listProjects(c, search));
  ok(res, projects);
});

/**
 * One project plus the tokens it resolves. The composer renders these as
 * read-only chips so an author can see what {{project_manager}} will become
 * before generating anything.
 */
export const detail = handle(async (req: AuthRequest, res: Response) => {
  const { tenantId } = actorOf(req);

  const payload = await withTenant(tenantId, async (c) => {
    const project = await repo.getProject(c, req.params.id);
    if (!project) return null;
    const branding = await getBranding(c);
    return { project, tokens: autoTokens(branding, project) };
  });

  if (!payload) throw new AgreementError('Project not found', 404, 'NOT_FOUND');
  ok(res, payload);
});
