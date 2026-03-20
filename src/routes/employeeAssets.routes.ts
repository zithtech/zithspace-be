import express from "express";
import { 
  getEmployeeAssets, 
  updateEmployeeAsset, 
  createEmployeeAssets,
  deleteEmployeeAsset
} from "@/controllers/employeeAssets";
import { authenticateToken, requireAuth } from "@/middleware/auth";
import { resolveTenant } from "@/middleware/tenantContext";

const router = express.Router();

const asyncHandler = (fn: any) => (req: any, res: any, next: any) =>
  Promise.resolve(fn(req, res, next)).catch(next);

// GLOBAL MIDDLEWARE
router.use(resolveTenant);
router.use(authenticateToken);
router.use(requireAuth);

// GET /api/employee-assets/:employeeId
router.get("/:employeeId", asyncHandler(async (req: any, res: any) => {
  const { employeeId } = req.params;
  const assets = await getEmployeeAssets(req, employeeId);
  res.status(200).json({ success: true, data: assets });
}));

// POST /api/employee-assets/:employeeId
router.post("/:employeeId", asyncHandler(async (req: any, res: any) => {
  const { employeeId } = req.params;
  const result = await createEmployeeAssets(req, employeeId);
  res.status(201).json(result);
}));

// PUT /api/employee-assets/:employeeId/:assetId
router.put("/:employeeId/:assetId", asyncHandler(async (req: any, res: any) => {
  const { employeeId, assetId } = req.params;
  const result = await updateEmployeeAsset(req, employeeId, assetId);
  res.status(200).json(result);
}));

// DELETE /api/employee-assets/:employeeId/:assetId
router.delete("/:employeeId/:assetId", asyncHandler(async (req: any, res: any) => {
  const { employeeId, assetId } = req.params;
  const result = await deleteEmployeeAsset(req, employeeId, assetId);
  res.status(200).json(result);
}));

export default router;
