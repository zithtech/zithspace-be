import { Router, Request, Response, NextFunction } from 'express';
import { WebInquiryController } from '@/controllers/WebInquiry.controller';

const router = Router();

/**
 * POST /api/public/web-inquiry/:tenantSlug
 *
 * Fully public endpoint — no authentication or tenant header required.
 * The tenant is identified by the URL slug (subdomain or UUID).
 *
 * External websites (Zukvo, Zithtech, etc.) call this endpoint when a
 * visitor submits a contact / sales enquiry form.
 */
router.post(
  '/:tenantSlug',
  (req: Request, res: Response, next: NextFunction) => {
    // Add permissive CORS for cross-origin website calls
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, x-web-inquiry-key');
    next();
  },
  WebInquiryController.submitInquiry,
);

// Pre-flight OPTIONS for CORS
router.options('/:tenantSlug', (req: Request, res: Response) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, x-web-inquiry-key');
  res.sendStatus(204);
});

export default router;
