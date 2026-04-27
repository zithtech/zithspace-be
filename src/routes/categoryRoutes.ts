import { Router } from 'express';
import CategoryController from '../controllers/categoryController';
import { authenticateToken } from '../middleware/auth';
import { resolveTenant } from '../middleware/tenantContext';

const router = Router();

/**
 * Category Routes
 * All routes require authentication and tenant context
 */

// Apply tenant context resolution to all routes
router.use(resolveTenant);

// Apply authentication to all routes
router.use(authenticateToken);

// GET /api/categories - Get all categories for a tenant
router.get('/', 
  CategoryController.getCategories
);

// GET /api/categories/stats - Get category statistics
router.get('/stats', 
  CategoryController.getCategoryStats
);

// GET /api/categories/:id - Get a single category
router.get('/:id', 
  CategoryController.getCategoryById
);

// POST /api/categories - Create a new category
router.post('/', 
  CategoryController.createCategory
);

// PUT /api/categories/:id - Update a category
router.put('/:id', 
  CategoryController.updateCategory
);

// DELETE /api/categories/:id - Delete a category
router.delete('/:id', 
  CategoryController.deleteCategory
);

export default router;
