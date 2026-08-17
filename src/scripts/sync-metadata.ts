import { metadataRepository } from '../modules/metadata/metadata.repository';
import { MetadataSyncService } from '../modules/metadata/metadata.sync';

async function main() {
  try {
    console.log('Initializing metadata tables...');
    await metadataRepository.initializeTables();
    console.log('Tables initialized successfully.');

    console.log('Starting metadata synchronization...');
    const result = await MetadataSyncService.synchronize();
    
    console.log('Sync Result:', result);
    process.exit(0);
  } catch (error) {
    console.error('Error syncing metadata:', error);
    process.exit(1);
  }
}

main();
