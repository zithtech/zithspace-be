// src/modules/reimbursement-v2/routes/claim.routes.ts
// Self-service claim routes. Auth/tenant middleware applied once at the module
// router (see ./index.ts); here we gate per-action permissions.

import express from 'express';
import multer from 'multer';
import { requirePermission, requireAnyPermission } from '@/middleware/permission';
import { Permissions } from '@/types/permissions';
import * as ctrl from '../controllers/claim.controller';

const router = express.Router();
const upload = multer({ dest: 'uploads/' });

router.get('/', requireAnyPermission(Permissions.REIMBURSEMENT_READ, Permissions.MY_HUB_CLAIMS_READ), ctrl.listMine);
router.post('/', requireAnyPermission(Permissions.REIMBURSEMENT_CREATE, Permissions.MY_HUB_CLAIMS_READ), ctrl.create);
router.post('/validate', requireAnyPermission(Permissions.REIMBURSEMENT_CREATE, Permissions.MY_HUB_CLAIMS_READ), ctrl.validateLimits);
router.get('/:id', requireAnyPermission(Permissions.REIMBURSEMENT_READ, Permissions.MY_HUB_CLAIMS_READ), ctrl.getOne);
router.put('/:id', requireAnyPermission(Permissions.REIMBURSEMENT_UPDATE, Permissions.MY_HUB_CLAIMS_READ), ctrl.update);
router.delete('/:id', requireAnyPermission(Permissions.REIMBURSEMENT_DELETE, Permissions.MY_HUB_CLAIMS_READ), ctrl.remove);

// Line items
router.post('/:id/items', requireAnyPermission(Permissions.REIMBURSEMENT_UPDATE, Permissions.MY_HUB_CLAIMS_READ), ctrl.addItem);
router.put('/:id/items/:itemId', requireAnyPermission(Permissions.REIMBURSEMENT_UPDATE, Permissions.MY_HUB_CLAIMS_READ), ctrl.updateItem);
router.delete('/:id/items/:itemId', requireAnyPermission(Permissions.REIMBURSEMENT_UPDATE, Permissions.MY_HUB_CLAIMS_READ), ctrl.removeItem);

// Receipts
router.post(
  '/:id/receipts',
  upload.array('files'),
  requireAnyPermission(Permissions.REIMBURSEMENT_UPDATE, Permissions.MY_HUB_CLAIMS_READ),
  ctrl.uploadReceipts
);
router.delete(
  '/:id/receipts/:attachmentId',
  requireAnyPermission(Permissions.REIMBURSEMENT_UPDATE, Permissions.MY_HUB_CLAIMS_READ),
  ctrl.removeAttachment
);

// Workflow
router.post('/:id/submit', requireAnyPermission(Permissions.REIMBURSEMENT_CREATE, Permissions.MY_HUB_CLAIMS_READ), ctrl.submit);
router.post('/:id/cancel', requireAnyPermission(Permissions.REIMBURSEMENT_READ, Permissions.MY_HUB_CLAIMS_READ), ctrl.cancel);

export default router;
