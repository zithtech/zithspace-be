import { Router } from 'express';
import { MetadataController } from './metadata.controller';

const router = Router();

router.get('/metadata', MetadataController.getMetadata);
router.get('/version', MetadataController.getVersion);
router.post('/sync', MetadataController.syncMetadata);
router.get('/health', MetadataController.getHealth);

export default router;
