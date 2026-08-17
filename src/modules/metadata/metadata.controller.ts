import { Request, Response } from 'express';
import { MetadataService } from './metadata.service';

export class MetadataController {
  
  static async getMetadata(req: Request, res: Response) {
    try {
      const tree = await MetadataService.getMetadataTree();
      const versionData = await MetadataService.getVersion();
      res.status(200).json({ version: versionData.version, cores: tree });
    } catch (error: any) {
      console.error('[MetadataController] Error getting metadata:', error);
      res.status(500).json({ error: 'Failed to retrieve metadata', details: error.message });
    }
  }

  static async getVersion(req: Request, res: Response) {
    try {
      const versionData = await MetadataService.getVersion();
      res.status(200).json(versionData);
    } catch (error: any) {
      console.error('[MetadataController] Error getting version:', error);
      res.status(500).json({ error: 'Failed to retrieve metadata version', details: error.message });
    }
  }

  static async syncMetadata(req: Request, res: Response) {
    try {
      const result = await MetadataService.triggerSync();
      res.status(200).json({ message: 'Synchronization successful', result });
    } catch (error: any) {
      console.error('[MetadataController] Error during synchronization:', error);
      res.status(500).json({ error: 'Failed to synchronize metadata', details: error.message });
    }
  }

  static async getHealth(req: Request, res: Response) {
    try {
      const health = await MetadataService.getHealth();
      res.status(200).json(health);
    } catch (error: any) {
      console.error('[MetadataController] Error getting health:', error);
      res.status(500).json({ error: 'Failed to check health', details: error.message });
    }
  }
}
