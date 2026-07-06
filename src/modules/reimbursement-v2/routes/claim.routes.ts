// src/modules/reimbursement-v2/routes/claim.routes.ts
// Self-service claim routes. Auth/tenant middleware applied once at the module
// router (see ./index.ts); here we gate per-action permissions.

import express from 'express';
import multer from 'multer';
import { requirePermission } from '@/middleware/permission';
import { Permissions } from '@/types/permissions';
import * as ctrl from '../controllers/claim.controller';

const router = express.Router();
const upload = multer({ dest: 'uploads/' });

router.get('/', requirePermission(Permissions.REIMBURSEMENT_READ), ctrl.listMine);
router.post('/', requirePermission(Permissions.REIMBURSEMENT_CREATE), ctrl.create);
router.get('/:id', requirePermission(Permissions.REIMBURSEMENT_READ), ctrl.getOne);
router.put('/:id', requirePermission(Permissions.REIMBURSEMENT_UPDATE), ctrl.update);
router.delete('/:id', requirePermission(Permissions.REIMBURSEMENT_DELETE), ctrl.remove);

// Line items
router.post('/:id/items', requirePermission(Permissions.REIMBURSEMENT_UPDATE), ctrl.addItem);
router.put('/:id/items/:itemId', requirePermission(Permissions.REIMBURSEMENT_UPDATE), ctrl.updateItem);
router.delete('/:id/items/:itemId', requirePermission(Permissions.REIMBURSEMENT_UPDATE), ctrl.removeItem);

// Receipts
router.post(
  '/:id/receipts',
  upload.array('files'),
  requirePermission(Permissions.REIMBURSEMENT_UPDATE),
  ctrl.uploadReceipts
);
router.delete(
  '/:id/receipts/:attachmentId',
  requirePermission(Permissions.REIMBURSEMENT_UPDATE),
  ctrl.removeAttachment
);

// Workflow
router.post('/:id/submit', requirePermission(Permissions.REIMBURSEMENT_CREATE), ctrl.submit);
router.post('/:id/cancel', requirePermission(Permissions.REIMBURSEMENT_READ), ctrl.cancel);

export default router;
