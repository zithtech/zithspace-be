import pool from '../../config/dbpool';
import { CoreRecord, ModuleRecord, PageRecord, MetadataVersionRecord, FeatureRecord } from './metadata.types';

class MetadataRepository {
  private modulesTableName: string = 'modules';

  async initializeTables(): Promise<void> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Check if `modules` table already exists
      const checkModulesTable = await client.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = 'modules'
        );
      `);

      if (checkModulesTable.rows[0].exists) {
        this.modulesTableName = 'modules_v2';
      }

      // Create metadata_versions
      await client.query(`
        CREATE TABLE IF NOT EXISTS metadata_versions (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          version INTEGER NOT NULL,
          generated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          checksum VARCHAR(255),
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // Create cores
      await client.query(`
        CREATE TABLE IF NOT EXISTS cores (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          key VARCHAR(255) UNIQUE NOT NULL,
          name VARCHAR(255) NOT NULL,
          description TEXT,
          icon VARCHAR(255),
          sort_order INTEGER DEFAULT 0,
          is_active BOOLEAN DEFAULT true,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // Create modules
      await client.query(`
        CREATE TABLE IF NOT EXISTS ${this.modulesTableName} (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          core_id UUID REFERENCES cores(id) ON DELETE CASCADE,
          key VARCHAR(255) NOT NULL,
          name VARCHAR(255) NOT NULL,
          description TEXT,
          icon VARCHAR(255),
          sort_order INTEGER DEFAULT 0,
          is_active BOOLEAN DEFAULT true,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(core_id, key)
        );
      `);

      // Create pages
      await client.query(`
        CREATE TABLE IF NOT EXISTS pages (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          module_id UUID REFERENCES ${this.modulesTableName}(id) ON DELETE CASCADE,
          key VARCHAR(255) NOT NULL,
          name VARCHAR(255) NOT NULL,
          route VARCHAR(255) UNIQUE NOT NULL,
          icon VARCHAR(255),
          component VARCHAR(255),
          menu_title VARCHAR(255),
          menu_order INTEGER DEFAULT 0,
          show_in_menu BOOLEAN DEFAULT true,
          is_active BOOLEAN DEFAULT true,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // Create metadata_features
      await client.query(`
        CREATE TABLE IF NOT EXISTS metadata_features (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          page_id UUID REFERENCES pages(id) ON DELETE CASCADE,
          feature_key VARCHAR(255) NOT NULL,
          name VARCHAR(255) NOT NULL,
          feature_type VARCHAR(50) NOT NULL,
          display_order INTEGER DEFAULT 0,
          is_active BOOLEAN DEFAULT true,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(page_id, feature_key)
        );
      `);

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error initializing metadata tables', error);
      throw error;
    } finally {
      client.release();
    }
  }

  getModulesTableName(): string {
    return this.modulesTableName;
  }

  async upsertCore(core: { key: string, name: string, description?: string, icon?: string, sort_order?: number }): Promise<CoreRecord> {
    const query = `
      INSERT INTO cores (key, name, description, icon, sort_order, is_active, updated_at)
      VALUES ($1, $2, $3, $4, $5, true, CURRENT_TIMESTAMP)
      ON CONFLICT (key) DO UPDATE SET
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        icon = EXCLUDED.icon,
        sort_order = EXCLUDED.sort_order,
        is_active = true,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *;
    `;
    const values = [core.key, core.name, core.description || null, core.icon || null, core.sort_order || 0];
    const res = await pool.query(query, values);
    return res.rows[0];
  }

  async upsertModule(module: { core_id: string, key: string, name: string, description?: string, icon?: string, sort_order?: number }): Promise<ModuleRecord> {
    const query = `
      INSERT INTO ${this.modulesTableName} (core_id, key, name, description, icon, sort_order, is_active, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, true, CURRENT_TIMESTAMP)
      ON CONFLICT (core_id, key) DO UPDATE SET
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        icon = EXCLUDED.icon,
        sort_order = EXCLUDED.sort_order,
        is_active = true,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *;
    `;
    const values = [module.core_id, module.key, module.name, module.description || null, module.icon || null, module.sort_order || 0];
    const res = await pool.query(query, values);
    return res.rows[0];
  }

  async upsertPage(page: { module_id: string, key: string, name: string, route: string, icon?: string, component?: string, menu_title?: string, menu_order?: number, show_in_menu?: boolean }): Promise<PageRecord> {
    const query = `
      INSERT INTO pages (module_id, key, name, route, icon, component, menu_title, menu_order, show_in_menu, is_active, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true, CURRENT_TIMESTAMP)
      ON CONFLICT (route) DO UPDATE SET
        module_id = EXCLUDED.module_id,
        key = EXCLUDED.key,
        name = EXCLUDED.name,
        icon = EXCLUDED.icon,
        component = EXCLUDED.component,
        menu_title = EXCLUDED.menu_title,
        menu_order = EXCLUDED.menu_order,
        show_in_menu = EXCLUDED.show_in_menu,
        is_active = true,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *;
    `;
    const values = [page.module_id, page.key, page.name, page.route, page.icon || null, page.component || null, page.menu_title || null, page.menu_order || 0, page.show_in_menu ?? true];
    const res = await pool.query(query, values);
    return res.rows[0];
  }

  async upsertFeature(feature: { page_id: string, feature_key: string, name: string, feature_type: string, display_order?: number }): Promise<FeatureRecord> {
    const query = `
      INSERT INTO metadata_features (page_id, feature_key, name, feature_type, display_order, is_active, updated_at)
      VALUES ($1, $2, $3, $4, $5, true, CURRENT_TIMESTAMP)
      ON CONFLICT (page_id, feature_key) DO UPDATE SET
        name = EXCLUDED.name,
        feature_type = EXCLUDED.feature_type,
        display_order = EXCLUDED.display_order,
        is_active = true,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *;
    `;
    const values = [feature.page_id, feature.feature_key, feature.name, feature.feature_type, feature.display_order || 0];
    const res = await pool.query(query, values);
    return res.rows[0];
  }

  async markCoresInactive(activeIds: string[]): Promise<number> {
    if (activeIds.length === 0) {
      const res = await pool.query(`UPDATE cores SET is_active = false WHERE is_active = true`);
      return res.rowCount || 0;
    }
    const query = `
      UPDATE cores 
      SET is_active = false, updated_at = CURRENT_TIMESTAMP 
      WHERE is_active = true AND id != ALL($1::uuid[])
    `;
    const res = await pool.query(query, [activeIds]);
    return res.rowCount || 0;
  }

  async markModulesInactive(activeIds: string[]): Promise<number> {
    if (activeIds.length === 0) {
      const res = await pool.query(`UPDATE ${this.modulesTableName} SET is_active = false WHERE is_active = true`);
      return res.rowCount || 0;
    }
    const query = `
      UPDATE ${this.modulesTableName}
      SET is_active = false, updated_at = CURRENT_TIMESTAMP 
      WHERE is_active = true AND id != ALL($1::uuid[])
    `;
    const res = await pool.query(query, [activeIds]);
    return res.rowCount || 0;
  }

  async markPagesInactive(activeIds: string[]): Promise<number> {
    if (activeIds.length === 0) {
      const res = await pool.query(`UPDATE pages SET is_active = false WHERE is_active = true`);
      return res.rowCount || 0;
    }
    const query = `
      UPDATE pages 
      SET is_active = false, updated_at = CURRENT_TIMESTAMP 
      WHERE is_active = true AND id != ALL($1::uuid[])
    `;
    const res = await pool.query(query, [activeIds]);
    return res.rowCount || 0;
  }

  async markFeaturesInactive(activeIds: string[]): Promise<number> {
    if (activeIds.length === 0) {
      const res = await pool.query(`UPDATE metadata_features SET is_active = false WHERE is_active = true`);
      return res.rowCount || 0;
    }
    const query = `
      UPDATE metadata_features 
      SET is_active = false, updated_at = CURRENT_TIMESTAMP 
      WHERE is_active = true AND id != ALL($1::uuid[])
    `;
    const res = await pool.query(query, [activeIds]);
    return res.rowCount || 0;
  }

  async getCurrentVersion(): Promise<number> {
    const query = `SELECT version FROM metadata_versions ORDER BY created_at DESC LIMIT 1`;
    const res = await pool.query(query);
    if (res.rows.length > 0) {
      return res.rows[0].version;
    }
    return 0;
  }

  async incrementVersion(checksum: string = ''): Promise<MetadataVersionRecord> {
    const currentVersion = await this.getCurrentVersion();
    const newVersion = currentVersion + 1;
    const query = `
      INSERT INTO metadata_versions (version, checksum)
      VALUES ($1, $2)
      RETURNING *;
    `;
    const res = await pool.query(query, [newVersion, checksum]);
    return res.rows[0];
  }

  async getAllCores(): Promise<CoreRecord[]> {
    const res = await pool.query('SELECT * FROM cores ORDER BY sort_order ASC');
    return res.rows;
  }

  async getAllModules(): Promise<ModuleRecord[]> {
    const res = await pool.query(`SELECT * FROM ${this.modulesTableName} ORDER BY sort_order ASC`);
    return res.rows;
  }

  async getAllPages(): Promise<PageRecord[]> {
    const res = await pool.query('SELECT * FROM pages ORDER BY menu_order ASC');
    return res.rows;
  }

  async getAllFeatures(): Promise<FeatureRecord[]> {
    const res = await pool.query('SELECT * FROM metadata_features ORDER BY display_order ASC');
    return res.rows;
  }
}

export const metadataRepository = new MetadataRepository();
