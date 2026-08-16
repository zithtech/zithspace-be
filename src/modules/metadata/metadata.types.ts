export interface CoreRecord {
  id: string;
  key: string;
  name: string;
  description: string | null;
  icon: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface ModuleRecord {
  id: string;
  core_id: string;
  key: string;
  name: string;
  description: string | null;
  icon: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface PageRecord {
  id: string;
  module_id: string;
  key: string;
  name: string;
  route: string;
  icon: string | null;
  component: string | null;
  menu_title: string | null;
  menu_order: number;
  show_in_menu: boolean;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface FeatureRecord {
  id: string;
  page_id: string;
  feature_key: string;
  name: string;
  feature_type: string;
  display_order: number;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface MetadataVersionRecord {
  id: string;
  version: number;
  generated_at: Date;
  checksum: string | null;
  created_at: Date;
  updated_at: Date;
}
