import express from "express";
import { CompanyLocationController } from "@/controllers/companyLocationController";
import { authenticateToken, requireAuth } from "@/middleware/auth";
import { resolveTenant } from "@/middleware/tenantContext";

const router = express.Router();

// Apply middleware to all routes in sequence
router.use(resolveTenant);
router.use(authenticateToken);
router.use(requireAuth);

// Create a new location
router.post("/", CompanyLocationController.createLocation);

// Get all locations
router.get("/", CompanyLocationController.getAllLocations);

// Get a location by ID
router.get("/:id", CompanyLocationController.getLocationById);

// Update a location
router.put("/:id", CompanyLocationController.updateLocation);

// Delete a location
router.delete("/:id", CompanyLocationController.deleteLocation);

export default router;
