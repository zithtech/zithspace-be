import express from "express";
import { FixedHolidayController } from "@/controllers/fixedHoliday.controller";
import { authenticateToken, requireAuth } from '@/middleware/auth';
import { resolveTenant } from '@/middleware/tenantContext';
import { requirePermission } from "@/middleware/permission";
import { Permissions } from "@/types/permissions";

const router = express.Router();

// Apply tenant context and authentication middleware to all routes
router.use(resolveTenant);
router.use(authenticateToken);
router.use(requireAuth);

// Create a new fixed holiday
router.post("/", requirePermission(Permissions.LEAVE_HOLIDAY_CREATE), FixedHolidayController.createFixedHoliday);

// Get all fixed holidays for the current tenant
router.get("/", requirePermission(Permissions.LEAVE_HOLIDAY_READ), FixedHolidayController.getFixedHolidays);

// Get a specific fixed holiday by ID
router.get("/:id", requirePermission(Permissions.LEAVE_HOLIDAY_READ), FixedHolidayController.getFixedHolidayById);

// Update a fixed holiday
router.put("/:id", requirePermission(Permissions.LEAVE_HOLIDAY_UPDATE), FixedHolidayController.updateFixedHoliday);

// Delete a fixed holiday
router.delete("/:id", requirePermission(Permissions.LEAVE_HOLIDAY_DELETE), FixedHolidayController.deleteFixedHoliday);

export default router;
