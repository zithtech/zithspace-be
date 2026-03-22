import { Router } from "express";
import { DealController } from "@/controllers/dealController";
import { 
  getDealActivities, createDealActivity, 
  getDealCommunications, createDealCommunication, 
  getDealTasks, createDealTask, updateDealTaskStatus,
  getDealFiles, createDealFile,
  getDealFinancials, updateDealFinancials,
  createPaymentMilestone, updatePaymentStatus
} from "@/controllers/dealDetailController";
import { authenticateToken } from "@/middleware/auth";
import { resolveTenant } from "@/middleware/tenantContext";

const router = Router();

// Middleware to resolve tenant and authenticate
router.use(resolveTenant);
router.use(authenticateToken);

router.get("/forecast", DealController.getForecastData);
router.get("/", DealController.getAllDeals);
router.post("/", DealController.createDeal);
router.get("/:id", DealController.getDealById);
router.put("/:id", DealController.updateDeal);
router.post("/:id/convert", DealController.convertToProject);
router.delete("/:id", DealController.deleteDeal);

// Deal Details Sub-resources
router.get("/:id/activities", getDealActivities);
router.post("/:id/activities", createDealActivity);

router.get("/:id/communications", getDealCommunications);
router.post("/:id/communications", createDealCommunication);

router.get("/:id/tasks", getDealTasks);
router.post("/:id/tasks", createDealTask);
router.put("/tasks/:taskId/status", updateDealTaskStatus);

router.get("/:id/files", getDealFiles);
router.post("/:id/files", createDealFile);

router.get("/:id/financials", getDealFinancials);
router.put("/:id/financials", updateDealFinancials);
router.post("/:id/financials/milestones", createPaymentMilestone);
router.put("/financials/milestones/:milestoneId/status", updatePaymentStatus);

export default router;
