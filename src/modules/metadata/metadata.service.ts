import { metadataRepository } from './metadata.repository';
import { MetadataSyncService } from './metadata.sync';
import pool from '../../config/dbpool';

export class MetadataService {

  static async getMetadataTree() {
    const cores = await metadataRepository.getAllCores();
    const modules = await metadataRepository.getAllModules();
    const pages = await metadataRepository.getAllPages();
    const features = await metadataRepository.getAllFeatures();

    const tree = cores.map(core => {
      const coreModules = modules.filter(m => m.core_id === core.id).map(mod => {
        const modulePages = pages.filter(p => p.module_id === mod.id).map(page => {
          const pageFeatures = features.filter(f => f.page_id === page.id).map(feature => ({
            key: feature.feature_key,
            name: feature.name,
            featureType: feature.feature_type
          }));

          return {
            id: page.id,
            key: page.key,
            name: page.name,
            route: page.route,
            icon: page.icon,
            component: page.component,
            menu_title: page.menu_title,
            menu_order: page.menu_order,
            show_in_menu: page.show_in_menu,
            is_active: page.is_active,
            features: pageFeatures
          };
        });

        return {
          id: mod.id,
          key: mod.key,
          name: mod.name,
          description: mod.description,
          icon: mod.icon,
          sort_order: mod.sort_order,
          is_active: mod.is_active,
          pages: modulePages
        };
      });

      return {
        id: core.id,
        key: core.key,
        name: core.name,
        description: core.description,
        icon: core.icon,
        sort_order: core.sort_order,
        is_active: core.is_active,
        modules: coreModules
      };
    });

    return tree;
  }

  static async getVersion() {
    const version = await metadataRepository.getCurrentVersion();
    return { version };
  }

  static async triggerSync() {
    return await MetadataSyncService.synchronize();
  }

  static async getHealth() {
    try {
      const version = await metadataRepository.getCurrentVersion();
      const client = await pool.connect();
      client.release();
      return { status: 'healthy', version, db_connected: true };
    } catch (error) {
      return { status: 'unhealthy', error: String(error) };
    }
  }
}
