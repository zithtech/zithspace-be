import { Router } from "express";
import ReimbursementRequestController from "@/controllers/reimbursementRequest.controller";
import authMiddleware from "@/middleware/auth";

const router = Router();

// Protect all routes
router.use(authMiddleware.authenticateToken);

// CREATE
router.post("/", ReimbursementRequestController.createRequest);

// READ
router.get("/", ReimbursementRequestController.getRequests);
router.get("/:id", ReimbursementRequestController.getRequestById);

// UPDATE
router.put("/:id", ReimbursementRequestController.updateRequest);

// WORKFLOW
router.post("/:id/submit", ReimbursementRequestController.submitRequest);

export default router;
