// // routes/managerReimbursementRoutes.ts
// import { Router } from "express";
// import { ManagerReimbursementController } from "@/controllers/managerReimbursementController";
// import { authenticateToken, requireAuth } from "@/middleware/auth";
// import { resolveTenant } from "@/middleware/tenantContext";

// const router = Router();

// // Middleware
// router.use(resolveTenant);
// router.use(authenticateToken);
// router.use(requireAuth);

// /* ==================== MANAGER REIMBURSEMENT ROUTES ==================== */

// // Get pending approvals
// router.get("/approvals", ManagerReimbursementController.getApprovalList);

// // Approve reimbursement
// router.put("/approve/:approverId/:reimbursementId", ManagerReimbursementController.approveReimbursement);

// // Reject reimbursement
// router.put("/reject/:approverId/:reimbursementId", ManagerReimbursementController.rejectReimbursement);

// // Get approval history
// router.get("/history/:reimbursementId", ManagerReimbursementController.getApprovalHistory);

// export default router;