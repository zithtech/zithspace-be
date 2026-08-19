import { Router } from "express";
import { DocumentHubUploadController } from "@/controllers/documentHubUploadController";
import { authenticateToken } from "@/middleware/auth";
import { resolveTenant } from "@/middleware/tenantContext";
import multer from "multer";

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// All routes require authentication
router.use(resolveTenant);
router.use(authenticateToken);

// 1. My Computer - Upload Local File
router.post("/:hubId/upload/local", upload.single("file"), DocumentHubUploadController.uploadLocalFile);

// 2. Google Drive
router.get("/:hubId/external/google/files", DocumentHubUploadController.listGoogleDriveFiles);
router.post("/:hubId/external/google/import", DocumentHubUploadController.importGoogleDriveFile);

// 3. Zoho Drive
router.get("/:hubId/external/zoho/files", DocumentHubUploadController.listZohoDriveFiles);
router.post("/:hubId/external/zoho/import", DocumentHubUploadController.importZohoDriveFile);

// 4. Microsoft OneDrive
router.get("/:hubId/external/onedrive/files", DocumentHubUploadController.listOneDriveFiles);
router.post("/:hubId/external/onedrive/import", DocumentHubUploadController.importOneDriveFile);

export default router;
