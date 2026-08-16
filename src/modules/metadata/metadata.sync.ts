// Import types only
import { ICore } from '../../config/app-structure';
import { MetadataValidator } from './metadata.validator';
import { metadataRepository } from './metadata.repository';
import { MetadataPublisher } from './metadata.publisher';
import * as crypto from 'crypto';

export class MetadataSyncService {
  
  static async synchronize(): Promise<{ changes: boolean; newVersion: number }> {
    console.log('[Metadata Sync] Starting synchronization...');
    console.log('[Metadata Sync] Reading metadata configuration...');
    
    // Dynamically require and bust cache to ensure we get the latest structure without server restart
    const appStructurePath = require.resolve('../../config/app-structure');
    delete require.cache[appStructurePath];
    const { APP_STRUCTURE } = require('../../config/app-structure') as { APP_STRUCTURE: ICore[] };

    // 1. Validate Structure
    MetadataValidator.validate(APP_STRUCTURE);

    let changesOccurred = false;

    // Track active ids to mark removed ones as inactive
    const activeCoreIds: string[] = [];
    const activeModuleIds: string[] = [];
    const activePageIds: string[] = [];
    const activeFeatureIds: string[] = [];

    // 2. Upsert Cores, Modules, Pages
    for (const core of APP_STRUCTURE) {
      console.log(`[Metadata Sync] Processing core: ${core.key}`);
      const coreRecord = await metadataRepository.upsertCore(core);
      activeCoreIds.push(coreRecord.id);

      for (const module of core.modules) {
        console.log(`[Metadata Sync] Processing module: ${module.key}`);
        const moduleRecord = await metadataRepository.upsertModule({
          ...module,
          core_id: coreRecord.id
        });
        activeModuleIds.push(moduleRecord.id);

        for (const page of module.pages) {
          console.log(`[Metadata Sync] Processing page: ${page.key}`);
          const pageRecord = await metadataRepository.upsertPage({
            ...page,
            module_id: moduleRecord.id
          });
          activePageIds.push(pageRecord.id);

          if (page.features) {
            let featureOrder = 1;
            for (const feature of page.features) {
              console.log(`[Metadata Sync] Processing feature: ${feature.key} in page: ${page.key}`);
              const featureRecord = await metadataRepository.upsertFeature({
                page_id: pageRecord.id,
                feature_key: feature.key,
                name: feature.name,
                feature_type: feature.featureType,
                display_order: featureOrder++
              });
              activeFeatureIds.push(featureRecord.id);
            }
          }
        }
      }
    }

    // 3. Mark removed items inactive
    console.log('[Metadata Sync] Marking removed items inactive...');
    const inactivatedCores = await metadataRepository.markCoresInactive(activeCoreIds);
    const inactivatedModules = await metadataRepository.markModulesInactive(activeModuleIds);
    const inactivatedPages = await metadataRepository.markPagesInactive(activePageIds);
    const inactivatedFeatures = await metadataRepository.markFeaturesInactive(activeFeatureIds);

    if (inactivatedCores > 0) {
      console.log(`[Metadata Sync] Marked ${inactivatedCores} cores inactive`);
      changesOccurred = true;
    }
    if (inactivatedModules > 0) {
      console.log(`[Metadata Sync] Marked ${inactivatedModules} modules inactive`);
      changesOccurred = true;
    }
    if (inactivatedPages > 0) {
      console.log(`[Metadata Sync] Marked ${inactivatedPages} pages inactive`);
      changesOccurred = true;
    }
    if (inactivatedFeatures > 0) {
      console.log(`[Metadata Sync] Marked ${inactivatedFeatures} features inactive`);
      changesOccurred = true;
    }

    // To determine if inserts/updates occurred, we ideally need to check `updated_at` returned by upsert
    // But since Postgres `ON CONFLICT DO UPDATE` always updates (even if data is same), we use a checksum strategy for the whole structure.
    const currentChecksum = this.generateChecksum(APP_STRUCTURE);
    
    // Let's get the latest version to see if checksum changed
    const currentVersionRecord = await metadataRepository.getCurrentVersion(); 
    // Wait, getCurrentVersion only returns number. We need a way to get the latest checksum or just rely on the version.
    // Instead of querying just the version, let's fetch the actual latest record to compare checksum.
    // I will use a simple query here directly to get the last checksum, or just assume changes occurred if checksum differs.
    
    const res = await (await import('../../config/dbpool')).default.query(`SELECT checksum FROM metadata_versions ORDER BY created_at DESC LIMIT 1`);
    const lastChecksum = res.rows.length > 0 ? res.rows[0].checksum : null;

    if (lastChecksum !== currentChecksum) {
      changesOccurred = true;
    }

    let currentVersionNum = await metadataRepository.getCurrentVersion();

    if (changesOccurred) {
      console.log('[Metadata Sync] Changes detected, incrementing metadata version...');
      await metadataRepository.incrementVersion(currentChecksum);
      currentVersionNum++;

      // Publish the event to RabbitMQ so Admin backend knows to sync
      await MetadataPublisher.publishMetadataUpdated(currentVersionNum);
    } else {
      console.log('[Metadata Sync] No changes detected. Version remains the same.');
    }

    console.log(`[Metadata Sync] Synchronization completed. Current version: ${currentVersionNum}`);

    return {
      changes: changesOccurred,
      newVersion: currentVersionNum
    };
  }

  private static generateChecksum(data: any): string {
    return crypto.createHash('md5').update(JSON.stringify(data)).digest('hex');
  }
}
