// src/modules/project-agreements/routes/index.ts
//
// Every Project Agreements endpoint under one mount point
// (/api/project-agreements).
//
// PERMISSIONS, in two resources:
//   project_agreement_template.*  authoring the reusable WORDING
//   project_agreement.*           raising a document against a project
//   project_agreement.manage      the letterhead — one setting for the whole
//                                 tenant, so administration, not authoring
//
// Composers need to READ templates to pick one, which is why the template list
// and detail routes accept either resource's read permission. Writing a
// template still needs the template permission.
//
// ROUTE ORDER MATTERS inside each block: literal segments (/next-number,
// /preview) are declared before '/:id' so Express never reads them as ids.

import express from 'express';
import { authenticateToken, requireAuth } from '@/middleware/auth';
import { resolveTenant } from '@/middleware/tenantContext';
import { requireAnyPermission } from '@/middleware/permission';
import { Permissions } from '@/types/permissions';
import { requireSubscriptionFeature } from '@/modules/entitlements/entitlements.middleware';
import * as templates from '../controllers/template.controller';
import * as agreements from '../controllers/agreement.controller';
import * as branding from '../controllers/branding.controller';
import * as projects from '../controllers/project.controller';
import * as clients from '../controllers/client.controller';
import * as documentTypes from '../controllers/documentType.controller';

const router = express.Router();

router.use(resolveTenant);
router.use(authenticateToken);
router.use(requireAuth);

/**
 * `hrms` is listed alongside the module's own key on purpose.
 *
 * Feature keys live in admin_feature_catalog, which is the admin control
 * plane's table, not this repo's. Until a `hrms_project_agreements` row exists
 * there and is attached to a plan, gating on that key alone would hide the
 * module from every tenant whose grant list is non-empty. Falling back to the
 * HRMS module key keeps it usable for anyone who already bought HRMS; once the
 * catalogue row lands, drop 'hrms' from this list to gate it per plan.
 */
const FEATURE = ['hrms_project_agreements', 'hrms'] as const;
router.use(requireSubscriptionFeature(FEATURE, { exact: false }));

/* ── Permission gates ────────────────────────────────────────────────────── */

const canReadTemplate = requireAnyPermission(
  Permissions.PROJECT_AGREEMENT_TEMPLATE_READ,
  Permissions.PROJECT_AGREEMENT_READ,
  Permissions.PROJECT_AGREEMENT_MANAGE
);
const canCreateTemplate = requireAnyPermission(
  Permissions.PROJECT_AGREEMENT_TEMPLATE_CREATE,
  Permissions.PROJECT_AGREEMENT_MANAGE
);
const canUpdateTemplate = requireAnyPermission(
  Permissions.PROJECT_AGREEMENT_TEMPLATE_UPDATE,
  Permissions.PROJECT_AGREEMENT_MANAGE
);
const canDeleteTemplate = requireAnyPermission(
  Permissions.PROJECT_AGREEMENT_TEMPLATE_DELETE,
  Permissions.PROJECT_AGREEMENT_MANAGE
);

const canRead = requireAnyPermission(
  Permissions.PROJECT_AGREEMENT_READ,
  Permissions.PROJECT_AGREEMENT_MANAGE
);
const canCreate = requireAnyPermission(
  Permissions.PROJECT_AGREEMENT_CREATE,
  Permissions.PROJECT_AGREEMENT_MANAGE
);
const canUpdate = requireAnyPermission(
  Permissions.PROJECT_AGREEMENT_UPDATE,
  Permissions.PROJECT_AGREEMENT_MANAGE
);
const canDelete = requireAnyPermission(
  Permissions.PROJECT_AGREEMENT_DELETE,
  Permissions.PROJECT_AGREEMENT_MANAGE
);
const canManage = requireAnyPermission(Permissions.PROJECT_AGREEMENT_MANAGE);

/* ── Branding (the letterhead) ───────────────────────────────────────────── */
// Reading is open to anyone who can read a document: the preview needs it.
router.get('/branding', canRead, branding.get);
router.get('/branding/preview', canRead, branding.previewLetterhead);
router.put('/branding', canManage, branding.save);
router.post('/branding/logo', canManage, branding.uploadLogo);
router.post('/branding/signature', canManage, branding.uploadSignature);
router.delete('/branding/signature', canManage, branding.removeSignature);

/* ── Projects (picker + token context) ───────────────────────────────────── */
router.get('/projects', canRead, projects.list);
router.get('/projects/:id', canRead, projects.detail);

// The client the document is addressed to, and who at that client. Gated by
// THIS module's read permission, not the Clients module's — raising an
// agreement must not require access to the whole client book.
router.get('/clients', canRead, clients.list);
router.get('/clients/:id/contacts', canRead, clients.contacts);

/* ── Settings › Document Types ────────────────────────────────────────────── */
// Readable by anyone who may read an agreement — the pickers need the list.
// Writing is a settings change, so it takes the module's manage permission.
router.get('/document-types', canRead, documentTypes.list);
router.post('/document-types', canManage, documentTypes.create);
router.put('/document-types/:id', canManage, documentTypes.update);
router.delete('/document-types/:id', canManage, documentTypes.remove);

/* ── Templates ───────────────────────────────────────────────────────────── */
router.get('/templates', canReadTemplate, templates.list);
router.post('/templates', canCreateTemplate, templates.create);
router.get('/templates/:id', canReadTemplate, templates.detail);
router.put('/templates/:id', canUpdateTemplate, templates.update);
router.post('/templates/:id/status', canUpdateTemplate, templates.setStatus);
router.post('/templates/:id/duplicate', canCreateTemplate, templates.duplicate);
router.delete('/templates/:id', canDeleteTemplate, templates.remove);

/* ── Agreements ──────────────────────────────────────────────────────────── */
// Literal segments before '/:id'.
router.get('/agreements/next-number', canCreate, agreements.nextNumber);
router.post('/agreements/preview', canRead, agreements.preview);
// The same document as real pages — header and footer on each, because it is
// the printer that produced them. See previewPdf in the controller.
router.post('/agreements/preview-pdf', canRead, agreements.previewPdf);
// Seeding the editor from a template. canCreate, not canRead: it is the first
// step of authoring a document, not a way to look at one.
router.post('/agreements/compose-body', canCreate, agreements.composeBody);

router.get('/agreements', canRead, agreements.list);
router.post('/agreements', canCreate, agreements.create);
router.get('/agreements/:id', canRead, agreements.detail);
router.get('/agreements/:id/html', canRead, agreements.html);
router.post('/agreements/:id/pdf', canRead, agreements.generatePdf);
router.put('/agreements/:id', canUpdate, agreements.update);
router.post('/agreements/:id/status', canUpdate, agreements.setStatus);
router.delete('/agreements/:id', canDelete, agreements.remove);

export default router;
