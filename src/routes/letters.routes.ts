import { Router } from 'express';
import { authenticateToken, requireAuth } from '../middleware/auth';
import { resolveTenant } from '../middleware/tenantContext';
import { requirePermission } from '../middleware/permission';
import { Permissions } from '../types/permissions';
import { DocumentCategoryController } from '../controllers/DocumentCategoryController';
import { LetterTemplateController } from '../controllers/LetterTemplateController';
import { GeneratedLetterController } from '../controllers/GeneratedLetterController';
import { DocumentStructureController } from '../controllers/DocumentStructureController';

const router = Router();

// Apply middleware to all routes
router.use(resolveTenant);
router.use(authenticateToken);
router.use(requireAuth);

// ─── Document Categories ───────────────────────────────────────────
router.get(
  '/categories',
  requirePermission(Permissions.LETTER_TEMPLATE_READ),
  DocumentCategoryController.getCategories
);
router.get(
  '/categories/:id',
  requirePermission(Permissions.LETTER_TEMPLATE_READ),
  DocumentCategoryController.getCategoryById
);
router.post(
  '/categories',
  requirePermission(Permissions.LETTER_TEMPLATE_CREATE),
  DocumentCategoryController.createCategory
);
router.put(
  '/categories/:id',
  requirePermission(Permissions.LETTER_TEMPLATE_UPDATE),
  DocumentCategoryController.updateCategory
);
router.delete(
  '/categories/:id',
  requirePermission(Permissions.LETTER_TEMPLATE_DELETE),
  DocumentCategoryController.deleteCategory
);

// ─── Document Structures ───────────────────────────────────────────
router.get(
  '/structures',
  requirePermission(Permissions.LETTER_FORMAT_READ),
  DocumentStructureController.getStructures
);
router.post(
  '/structures',
  requirePermission(Permissions.LETTER_FORMAT_CREATE),
  DocumentStructureController.createStructure
);
router.get(
  '/structures/:id',
  requirePermission(Permissions.LETTER_FORMAT_READ),
  DocumentStructureController.getStructureById
);
router.put(
  '/structures/:id',
  requirePermission(Permissions.LETTER_FORMAT_UPDATE),
  DocumentStructureController.updateStructure
);
router.delete(
  '/structures/:id',
  requirePermission(Permissions.LETTER_FORMAT_DELETE),
  DocumentStructureController.deleteStructure
);

// ─── Document Templates ────────────────────────────────────────────
router.get(
  '/templates',
  requirePermission(Permissions.LETTER_TEMPLATE_READ),
  LetterTemplateController.getTemplates
);
router.post(
  '/templates/upload-image',
  requirePermission(Permissions.LETTER_TEMPLATE_CREATE),
  LetterTemplateController.uploadTemplateImage
);
router.get(
  '/templates/:id',
  requirePermission(Permissions.LETTER_TEMPLATE_READ),
  LetterTemplateController.getTemplateById
);
router.post(
  '/templates',
  requirePermission(Permissions.LETTER_TEMPLATE_CREATE),
  LetterTemplateController.createTemplate
);
router.post(
  '/templates/zai',
  requirePermission(Permissions.LETTER_TEMPLATE_CREATE),
  LetterTemplateController.generateTemplateWithZai
);
router.put(
  '/templates/:id',
  requirePermission(Permissions.LETTER_TEMPLATE_UPDATE),
  LetterTemplateController.updateTemplate
);
router.post(
  '/templates/:id/duplicate',
  requirePermission(Permissions.LETTER_TEMPLATE_CREATE),
  LetterTemplateController.duplicateTemplate
);
router.post(
  '/templates/:id/restore/:versionNumber',
  requirePermission(Permissions.LETTER_TEMPLATE_UPDATE),
  LetterTemplateController.restoreVersion
);
router.delete(
  '/templates/:id',
  requirePermission(Permissions.LETTER_TEMPLATE_DELETE),
  LetterTemplateController.deleteTemplate
);

// ─── Generated Documents ───────────────────────────────────────────
router.get(
  '/generated',
  requirePermission(Permissions.LETTER_READ),
  GeneratedLetterController.getGeneratedLetters
);
router.post(
  '/generated/preview',
  requirePermission(Permissions.LETTER_GENERATE),
  GeneratedLetterController.previewLetter
);
router.post(
  '/generated',
  requirePermission('canGenerateLetter'),
  GeneratedLetterController.generateLetter
);
router.put(
  '/generated/:id',
  requirePermission(Permissions.LETTER_GENERATE),
  GeneratedLetterController.updateLetter
);
router.get(
  '/generated/:id',
  requirePermission(Permissions.LETTER_READ),
  GeneratedLetterController.getGeneratedLetterById
);
router.get(
  '/generated/:id/download-pdf',
  requirePermission(Permissions.LETTER_READ),
  GeneratedLetterController.downloadPDF
);
router.get(
  '/generated/:id/download-docx',
  requirePermission(Permissions.LETTER_READ),
  GeneratedLetterController.downloadDOCX
);
router.delete(
  '/generated/:id',
  requirePermission(Permissions.LETTER_DELETE),
  GeneratedLetterController.deleteGeneratedLetter
);

export default router;
