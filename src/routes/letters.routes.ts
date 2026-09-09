import { Router } from 'express';
import { authenticateToken, requireAuth } from '../middleware/auth';
import { resolveTenant } from '../middleware/tenantContext';
import { requirePermission } from '../middleware/permission';
import { Permissions } from '../types/permissions';
import { requireSubscriptionFeature } from '@/modules/entitlements/entitlements.middleware';
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
  requireSubscriptionFeature('hrms_doc_suite_templates', { exact: false }),
  DocumentCategoryController.getCategories
);
router.get(
  '/categories/:id',
  requirePermission(Permissions.LETTER_TEMPLATE_READ),
  requireSubscriptionFeature('hrms_doc_suite_templates', { exact: false }),
  DocumentCategoryController.getCategoryById
);
router.post(
  '/categories',
  requirePermission(Permissions.LETTER_TEMPLATE_CREATE),
  requireSubscriptionFeature('hrms_doc_suite_templates', { exact: false }),
  DocumentCategoryController.createCategory
);
router.put(
  '/categories/:id',
  requirePermission(Permissions.LETTER_TEMPLATE_UPDATE),
  requireSubscriptionFeature('hrms_doc_suite_templates', { exact: false }),
  DocumentCategoryController.updateCategory
);
router.delete(
  '/categories/:id',
  requirePermission(Permissions.LETTER_TEMPLATE_DELETE),
  requireSubscriptionFeature('hrms_doc_suite_templates', { exact: false }),
  DocumentCategoryController.deleteCategory
);

// ─── Document Structures ───────────────────────────────────────────
router.get(
  '/structures',
  requirePermission(Permissions.LETTER_FORMAT_READ),
  requireSubscriptionFeature('hrms_doc_suite_structures', { exact: false }),
  DocumentStructureController.getStructures
);
router.post(
  '/structures',
  requirePermission(Permissions.LETTER_FORMAT_CREATE),
  requireSubscriptionFeature('hrms_doc_suite_structures', { exact: false }),
  DocumentStructureController.createStructure
);
router.get(
  '/structures/:id',
  requirePermission(Permissions.LETTER_FORMAT_READ),
  requireSubscriptionFeature('hrms_doc_suite_structures', { exact: false }),
  DocumentStructureController.getStructureById
);
router.put(
  '/structures/:id',
  requirePermission(Permissions.LETTER_FORMAT_UPDATE),
  requireSubscriptionFeature('hrms_doc_suite_structures', { exact: false }),
  DocumentStructureController.updateStructure
);
router.delete(
  '/structures/:id',
  requirePermission(Permissions.LETTER_FORMAT_DELETE),
  requireSubscriptionFeature('hrms_doc_suite_structures', { exact: false }),
  DocumentStructureController.deleteStructure
);

// ─── Document Templates ────────────────────────────────────────────
router.get(
  '/templates',
  requirePermission(Permissions.LETTER_TEMPLATE_READ),
  requireSubscriptionFeature('hrms_doc_suite_templates', { exact: false }),
  LetterTemplateController.getTemplates
);
router.post(
  '/templates/upload-image',
  requirePermission(Permissions.LETTER_TEMPLATE_CREATE),
  requireSubscriptionFeature('hrms_doc_suite_templates', { exact: false }),
  LetterTemplateController.uploadTemplateImage
);
router.get(
  '/templates/:id',
  requirePermission(Permissions.LETTER_TEMPLATE_READ),
  requireSubscriptionFeature('hrms_doc_suite_templates', { exact: false }),
  LetterTemplateController.getTemplateById
);
router.post(
  '/templates',
  requirePermission(Permissions.LETTER_TEMPLATE_CREATE),
  requireSubscriptionFeature('hrms_doc_suite_templates', { exact: false }),
  LetterTemplateController.createTemplate
);
router.post(
  '/templates/zai',
  requirePermission(Permissions.LETTER_TEMPLATE_CREATE),
  requireSubscriptionFeature('hrms_doc_suite_templates', { exact: false }),
  LetterTemplateController.generateTemplateWithZai
);
router.put(
  '/templates/:id',
  requirePermission(Permissions.LETTER_TEMPLATE_UPDATE),
  requireSubscriptionFeature('hrms_doc_suite_templates', { exact: false }),
  LetterTemplateController.updateTemplate
);
router.post(
  '/templates/:id/duplicate',
  requirePermission(Permissions.LETTER_TEMPLATE_CREATE),
  requireSubscriptionFeature('hrms_doc_suite_templates', { exact: false }),
  LetterTemplateController.duplicateTemplate
);
router.post(
  '/templates/:id/restore/:versionNumber',
  requirePermission(Permissions.LETTER_TEMPLATE_UPDATE),
  requireSubscriptionFeature('hrms_doc_suite_templates', { exact: false }),
  LetterTemplateController.restoreVersion
);
router.delete(
  '/templates/:id',
  requirePermission(Permissions.LETTER_TEMPLATE_DELETE),
  requireSubscriptionFeature('hrms_doc_suite_templates', { exact: false }),
  LetterTemplateController.deleteTemplate
);

// ─── Generated Documents ───────────────────────────────────────────
router.get(
  '/generated',
  requirePermission(Permissions.LETTER_READ),
  requireSubscriptionFeature('hrms_doc_suite_generate', { exact: false }),
  GeneratedLetterController.getGeneratedLetters
);
router.post(
  '/generated/preview',
  requirePermission(Permissions.LETTER_GENERATE),
  requireSubscriptionFeature('hrms_doc_suite_generate', { exact: false }),
  GeneratedLetterController.previewLetter
);
router.post(
  '/generated',
  requirePermission('canGenerateLetter'),
  requireSubscriptionFeature('hrms_doc_suite_generate', { exact: false }),
  GeneratedLetterController.generateLetter
);
router.put(
  '/generated/:id',
  requirePermission(Permissions.LETTER_GENERATE),
  requireSubscriptionFeature('hrms_doc_suite_generate', { exact: false }),
  GeneratedLetterController.updateLetter
);
router.get(
  '/generated/:id',
  requirePermission(Permissions.LETTER_READ),
  requireSubscriptionFeature('hrms_doc_suite_generate', { exact: false }),
  GeneratedLetterController.getGeneratedLetterById
);
router.get(
  '/generated/:id/download-pdf',
  requirePermission(Permissions.LETTER_READ),
  requireSubscriptionFeature('hrms_doc_suite_generate', { exact: false }),
  GeneratedLetterController.downloadPDF
);
router.get(
  '/generated/:id/download-docx',
  requirePermission(Permissions.LETTER_READ),
  requireSubscriptionFeature('hrms_doc_suite_generate', { exact: false }),
  GeneratedLetterController.downloadDOCX
);
router.delete(
  '/generated/:id',
  requirePermission(Permissions.LETTER_DELETE),
  requireSubscriptionFeature('hrms_doc_suite_generate', { exact: false }),
  GeneratedLetterController.deleteGeneratedLetter
);

export default router;
