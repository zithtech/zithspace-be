import express from "express";
import { FixedHolidayController } from "@/controllers/fixedHoliday.controller";
import { authenticateToken, requireAuth } from '@/middleware/auth';
import { resolveTenant } from '@/middleware/tenantContext';

const router = express.Router();

// Apply tenant context and authentication middleware to all routes
router.use(resolveTenant);
router.use(authenticateToken);
router.use(requireAuth);

// Create a new fixed holiday
router.post("/", FixedHolidayController.createFixedHoliday);

// Get all fixed holidays for the current tenant
router.get("/", FixedHolidayController.getFixedHolidays);

// Get a specific fixed holiday by ID
router.get("/:id", FixedHolidayController.getFixedHolidayById);

// Update a fixed holiday
router.put("/:id", FixedHolidayController.updateFixedHoliday);

// Delete a fixed holiday
router.delete("/:id", FixedHolidayController.deleteFixedHoliday);

export default router;
