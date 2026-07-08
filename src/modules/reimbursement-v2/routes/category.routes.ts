// src/modules/reimbursement-v2/routes/category.routes.ts
// Routes for Expense Categories. Auth/tenant middleware is applied once at the
// module router (see ./index.ts); here we only gate per-action permissions.

import express from 'express';
import { requirePermission, requireAnyPermission } from '@/middleware/permission';
import { Permissions } from '@/types/permissions';
import * as ctrl from '../controllers/category.controller';

const router = express.Router();

// Categories are reference data needed to file a claim, so listing/reading them
// is allowed for anyone who can manage categories OR create/read claims (and
// config/policy readers). Writes stay gated by the category-specific perms.
const CAN_READ_CATEGORIES = [
  Permissions.REIMBURSEMENT_CATEGORY_READ,
  Permissions.REIMBURSEMENT_READ,
  Permissions.REIMBURSEMENT_CREATE,
  Permissions.REIMBURSEMENT_CONFIG_READ,
  Permissions.REIMBURSEMENT_MANAGE,
  Permissions.MY_HUB_CLAIMS_READ,
];

router.get('/', requireAnyPermission(...CAN_READ_CATEGORIES), ctrl.list);
router.get('/:id', requireAnyPermission(...CAN_READ_CATEGORIES), ctrl.getOne);
router.post('/', requirePermission(Permissions.REIMBURSEMENT_CATEGORY_CREATE), ctrl.create);
router.put('/:id', requirePermission(Permissions.REIMBURSEMENT_CATEGORY_UPDATE), ctrl.update);
router.delete('/:id', requirePermission(Permissions.REIMBURSEMENT_CATEGORY_DELETE), ctrl.remove);

export default router;
