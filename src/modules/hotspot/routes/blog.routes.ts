// src/modules/hotspot/routes/blog.routes.ts
// Blogs feed routes. Auth/tenant middleware is applied once at the module
// router (see ./index.ts).
//
// No per-route permission gate: the feed is open to every authenticated member
// of the tenant. What a caller may do to someone ELSE's post or comment is
// decided in the service (see its header for the full model).

import express, { NextFunction, Request, Response } from 'express';
import multer, { MulterError } from 'multer';
import { validateUuidParam } from '../http';
import * as ctrl from '../controllers/blog.controller';

const router = express.Router();
const upload = multer({
  dest: 'uploads/',
  // 15 MB per image: generous for a phone photo, tight enough that a feed of
  // ten posts does not become a hundred-megabyte page.
  limits: { fileSize: 15 * 1024 * 1024, files: 10 },
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
        ? 'Each image must be 15 MB or smaller'
        : err.code === 'LIMIT_FILE_COUNT'
          ? 'Up to 10 images per upload'
          : `Upload rejected: ${err.message}`;
    res.status(400).json({ success: false, error: message, code: 'VALIDATION_ERROR' });
    return;
  }
  next(err);
}

router.param('id', (req, res, next, value) => validateUuidParam(req, res, next, value, 'post id'));
router.param('imageId', (req, res, next, value) =>
  validateUuidParam(req, res, next, value, 'image id')
);
router.param('commentId', (req, res, next, value) =>
  validateUuidParam(req, res, next, value, 'comment id')
);

// Literal paths first — `/:id` would otherwise swallow them.
router.get('/mentionable-users', ctrl.mentionableUsers);

// Comment-scoped actions live under /comments/:commentId so a comment can be
// addressed without knowing which post it hangs off.
router.put('/comments/:commentId', ctrl.updateComment);
router.delete('/comments/:commentId', ctrl.removeComment);
router.post('/comments/:commentId/reactions', ctrl.reactToComment);

router.get('/', ctrl.list);
router.post('/', ctrl.create);
router.get('/:id', ctrl.getOne);
router.put('/:id', ctrl.update);
router.delete('/:id', ctrl.remove);

router.post('/:id/images', upload.array('files'), uploadErrors, ctrl.uploadImages);
router.delete('/:id/images/:imageId', ctrl.removeImage);

router.post('/:id/reactions', ctrl.reactToPost);
router.delete('/:id/reactions', ctrl.clearPostReaction);
router.get('/:id/reactions', ctrl.postReactors);

router.get('/:id/comments', ctrl.listComments);
router.post('/:id/comments', ctrl.addComment);

export default router;
