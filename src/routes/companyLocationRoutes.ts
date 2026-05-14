import express from "express";
import { CompanyLocationController } from "@/controllers/companyLocationController";
import { authenticateToken, requireAuth } from "@/middleware/auth";
import { resolveTenant } from "@/middleware/tenantContext";

const router = express.Router();

// Apply middleware to all routes in sequence
router.use(resolveTenant);
router.use(authenticateToken);
router.use(requireAuth);

import { requirePermission } from "@/middleware/permission";
import { Permissions } from "@/types/permissions";

// Create a new location
router.post("/", requirePermission(Permissions.SETTINGS_UPDATE), CompanyLocationController.createLocation);

// Get all locations
router.get("/", requirePermission(Permissions.SETTINGS_READ), CompanyLocationController.getAllLocations);

// Get a location by ID
router.get("/:id", requirePermission(Permissions.SETTINGS_READ), CompanyLocationController.getLocationById);

// Update a location
router.put("/:id", requirePermission(Permissions.SETTINGS_UPDATE), CompanyLocationController.updateLocation);

// Delete a location
router.delete("/:id", requirePermission(Permissions.SETTINGS_DELETE), CompanyLocationController.deleteLocation);

export default router;
