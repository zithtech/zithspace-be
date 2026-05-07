import { Router } from 'express';
import { ExcelController } from '@/controllers/excelController';
import { authenticateToken } from '@/middleware/auth';
import { resolveTenant } from '@/middleware/tenantContext';

const router = Router();

// Apply global middleware to all excel routes
router.use(resolveTenant);
router.use(authenticateToken);

/**
 * @route   POST /api/excel/init
 * @desc    Initialize database schema (admin/system)
 */
router.post('/init', ExcelController.initSchema);

/**
 * @route   POST /api/excel/folders
 * @desc    Create a new folder
 */
router.post('/folders', ExcelController.createFolder);

/**
 * @route   GET /api/excel/content
 * @desc    List folders and files in a directory
 */
router.get('/content', ExcelController.listContent);

/**
 * @route   GET /api/excel/file-content
 * @desc    Get file content through a proxy (bypass CORS)
 */
router.get('/file-content', ExcelController.getFileContent);

/**
 * @route   POST /api/excel/save
 * @desc    Save a workbook to R2 and database
 */
router.post('/save', ExcelController.saveWorkbook);

/**
 * @route   DELETE /api/excel/:id
 * @desc    Delete a spreadsheet
 */
router.delete('/:id', ExcelController.deleteSpreadsheet);

/**
 * @route   POST /api/excel/upload
 * @desc    Simple upload and parse (legacy)
 */
router.post('/upload', ExcelController.uploadExcel);

export default router;
