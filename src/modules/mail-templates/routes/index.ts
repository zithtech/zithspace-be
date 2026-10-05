// src/modules/mail-templates/routes/index.ts
// All Mail Template endpoints under one mount point (/api/mail/templates).
// Tenant + auth middleware is applied here ONCE for the whole module, matching
// the platform convention (resolveTenant → authenticateToken → requireAuth).
//
// Permissions reuse the mail set: a template is mail you have not sent yet, so
// whoever may compose may write one, and only mail.delete may remove one.

import express from 'express';
import { authenticateToken, requireAuth } from '@/middleware/auth';
import { resolveTenant } from '@/middleware/tenantContext';
import { requirePermission } from '@/middleware/permission';
import { Permissions } from '@/types/permissions';
import { validateUuidParam } from '../http';
import * as ctrl from '../controllers/mailTemplate.controller';

const router = express.Router();

router.use(resolveTenant);
router.use(authenticateToken);
router.use(requireAuth);

router.param('id', validateUuidParam);

// ─── Placeholder catalogue, recipients, categories ──────────────────────────
// Lookups the editor, compose window and sidebar need; they sit before /:id so
// none of these words is ever read as a template id.
router.get('/placeholders', requirePermission(Permissions.MAIL_READ), ctrl.getPlaceholders);
router.get('/recipients', requirePermission(Permissions.MAIL_READ), ctrl.listRecipients);
router.get('/categories', requirePermission(Permissions.MAIL_READ), ctrl.listCategories);

// ─── Signature (the signed-in member's own) ─────────────────────────────────
// Only mail.create is required to write one: a signature is part of composing,
// and it affects nobody else's mail.
router.get('/signature', requirePermission(Permissions.MAIL_READ), ctrl.getSignature);
router.put('/signature', requirePermission(Permissions.MAIL_CREATE), ctrl.saveSignature);
router.delete('/signature', requirePermission(Permissions.MAIL_CREATE), ctrl.resetSignature);

// ─── Templates ──────────────────────────────────────────────────────────────
router.get('/', requirePermission(Permissions.MAIL_READ), ctrl.listTemplates);
router.post('/', requirePermission(Permissions.MAIL_CREATE), ctrl.createTemplate);
router.get('/:id', requirePermission(Permissions.MAIL_READ), ctrl.getTemplate);
router.put('/:id', requirePermission(Permissions.MAIL_UPDATE), ctrl.updateTemplate);
router.delete('/:id', requirePermission(Permissions.MAIL_DELETE), ctrl.deleteTemplate);
router.post('/:id/default', requirePermission(Permissions.MAIL_UPDATE), ctrl.setDefault);

// Rendering is a read of the template plus a read of the recipient, so it only
// needs mail.read — you do not have to be able to edit a template to use one.
router.post('/:id/render', requirePermission(Permissions.MAIL_READ), ctrl.renderTemplate);

export default router;
