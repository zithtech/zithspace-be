// src/modules/leave-v2/routes/holiday.routes.ts
import express from 'express';
import { requirePermission } from '@/middleware/permission';
import { Permissions } from '@/types/permissions';
import * as ctrl from '../controllers/holiday.controller';

const router = express.Router();

// Catalog routes MUST come before '/:id' so 'catalog' isn't matched as an id.
router.get('/catalog/countries', requirePermission(Permissions.LEAVE_HOLIDAY_READ), ctrl.catalogCountries);
router.get('/catalog', requirePermission(Permissions.LEAVE_HOLIDAY_READ), ctrl.catalog);
router.post('/catalog/add', requirePermission(Permissions.LEAVE_HOLIDAY_CREATE), ctrl.catalogAdd);
router.post('/catalog/remove', requirePermission(Permissions.LEAVE_HOLIDAY_DELETE), ctrl.catalogRemove);

router.get('/', requirePermission(Permissions.LEAVE_HOLIDAY_READ), ctrl.list);
router.get('/:id', requirePermission(Permissions.LEAVE_HOLIDAY_READ), ctrl.getOne);
router.post('/', requirePermission(Permissions.LEAVE_HOLIDAY_CREATE), ctrl.create);
router.put('/:id', requirePermission(Permissions.LEAVE_HOLIDAY_UPDATE), ctrl.update);
router.delete('/:id', requirePermission(Permissions.LEAVE_HOLIDAY_DELETE), ctrl.remove);

export default router;
