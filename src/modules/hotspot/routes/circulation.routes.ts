// src/modules/hotspot/routes/circulation.routes.ts
// Circulation noticeboard routes. Auth/tenant middleware is applied once at the
// module router (see ./index.ts).
//
// No per-route permission gate: the noticeboard is open to every authenticated
// member of the tenant. What a caller may do to a post they do NOT own is
// decided in the service from `actor.canModerate` (see middleware/moderation.ts).

import express, { NextFunction, Request, Response } from 'express';
import multer, { MulterError } from 'multer';
import { requirePermission } from '@/middleware/permission';
import { Permissions } from '@/types/permissions';
import { validateUuidParam } from '../http';
import * as ctrl from '../controllers/circulation.controller';

const router = express.Router();
const upload = multer({
  dest: 'uploads/',
  // 25 MB per file: comfortably covers a photo or a policy PDF while keeping a
  // stray multi-GB upload from filling the disk.
  limits: { fileSize: 25 * 1024 * 1024, files: 10 },
});

/**
 * multer rejects oversized/too-many files inside the middleware, before any
 * controller runs — so `handle()` never sees it and the global handler would
 * report a 500. Translate it to the 400 it is.
 */
function uploadErrors(err: any, _req: Request, res: Response, next: NextFunction): void {
  if (err instanceof MulterError) {
    const message =
      err.code === 'LIMIT_FILE_SIZE'
        ? 'Each file must be 25 MB or smaller'
        : err.code === 'LIMIT_FILE_COUNT'
          ? 'Up to 10 files per upload'
          : `Upload rejected: ${err.message}`;
    res.status(400).json({ success: false, error: message, code: 'VALIDATION_ERROR' });
    return;
  }
  next(err);
}

router.param('id', (req, res, next, value) => validateUuidParam(req, res, next, value, 'post id'));
router.param('attachmentId', (req, res, next, value) =>
  validateUuidParam(req, res, next, value, 'attachment id')
);
router.param('categoryId', (req, res, next, value) =>
  validateUuidParam(req, res, next, value, 'category id')
);

// Literal paths first — `/:id` would otherwise swallow them.
// Categories. Creating one is open to anyone who may post: a category the
// poster cannot create is a category they will not use. Removing one is
// moderator-only and blocked while posts still reference it (see the service).
router.get('/authors', requirePermission(Permissions.HOTSPOT_CIRCULATION_READ), ctrl.listAuthors);
router.get('/categories', requirePermission(Permissions.HOTSPOT_CIRCULATION_READ), ctrl.listCategories);
router.post('/categories', requirePermission(Permissions.HOTSPOT_CIRCULATION_CREATE), ctrl.createCategory);
router.delete('/categories/:categoryId', requirePermission(Permissions.HOTSPOT_CIRCULATION_DELETE), ctrl.removeCategory);

router.get('/', requirePermission(Permissions.HOTSPOT_CIRCULATION_READ), ctrl.list);
router.post('/', requirePermission(Permissions.HOTSPOT_CIRCULATION_CREATE), ctrl.create);
router.get('/:id', requirePermission(Permissions.HOTSPOT_CIRCULATION_READ), ctrl.getOne);
router.put('/:id', requirePermission(Permissions.HOTSPOT_CIRCULATION_UPDATE), ctrl.update);
router.delete('/:id', requirePermission(Permissions.HOTSPOT_CIRCULATION_DELETE), ctrl.remove);

router.post('/:id/pin', requirePermission(Permissions.HOTSPOT_CIRCULATION_PIN), ctrl.setPinned);

router.post('/:id/attachments', requirePermission(Permissions.HOTSPOT_CIRCULATION_UPDATE), upload.array('files'), uploadErrors, ctrl.uploadAttachments);
router.delete('/:id/attachments/:attachmentId', requirePermission(Permissions.HOTSPOT_CIRCULATION_UPDATE), ctrl.removeAttachment);

export default router;
