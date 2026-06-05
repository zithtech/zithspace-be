import { Response } from 'express';
import { AuthRequest } from '@/types';
import { LeadStatusModel } from '@/models/LeadStatus.model';
import { LeadActionModel } from '@/models/LeadAction.model';
import { LeadPlatformModel, deriveCode as derivePlatformCode } from '@/models/LeadPlatform.model';
import { recordTransaction, Section, Module, Page, Action, EntityType, diffShallow } from '../utils/transactionHistory';

export class LeadSettingsController {
  
  // --- Status Methods ---

  static async createStatus(req: AuthRequest, res: Response) {
    try {
      console.log('--- CREATE STATUS START ---');
      const tenantId = req.tenantId;
      console.log('Tenant ID:', tenantId);
      if (!tenantId) {
        console.error('Create Status: Missing tenant context');
        return res.status(400).json({ success: false, error: 'Tenant context required' });
      }

      const status = await LeadStatusModel.create({
        ...req.body,
        tenant_id: tenantId
      });

      console.log('Status created successfully:', status.id);

      // ─── Activity log ───────────────────────────────────────────────
      recordTransaction({
        req,
        section: Section.WORK,
        module: Module.LEADS,
        page: Page.LEAD_SETTINGS,
        action: Action.CREATE,
        actionLabel: `Created lead status "${status.name}"`,
        entityType: EntityType.LEAD_STATUS,
        entityId: status.id,
        entityLabel: status.name,
      });

      return res.status(201).json({ success: true, data: status });
    } catch (error: any) {
      console.error('Create Status Error:', error);
      if (error.code === '23505') {
        return res.status(409).json({ success: false, error: 'A status with this name already exists.' });
      }
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  static async getStatuses(req: AuthRequest, res: Response) {
    try {
      console.log('--- GET STATUSES START ---');
      const tenantId = req.tenantId;
      console.log('Tenant ID:', tenantId);
      if (!tenantId) {
        console.error('Get Statuses: Missing tenant context');
        return res.status(400).json({ success: false, error: 'Tenant context required' });
      }

      const statuses = await LeadStatusModel.findAll(tenantId);
      console.log(`Fetched ${statuses.length} statuses for tenant ${tenantId}`);
      return res.status(200).json({ success: true, data: statuses });
    } catch (error: any) {
      console.error('Get Statuses Error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  static async updateStatus(req: AuthRequest, res: Response) {
    try {
      console.log('--- UPDATE STATUS START ---');
      const { id } = req.params;
      const tenantId = req.tenantId;
      console.log(`Update Status ID: ${id}, Tenant ID: ${tenantId}`);
      if (!tenantId) {
        console.error('Update Status: Missing tenant context');
        return res.status(400).json({ success: false, error: 'Tenant context required' });
      }

      const existingStatus = await LeadStatusModel.findById(id, tenantId);
      const status = await LeadStatusModel.update(id, tenantId, req.body);
      if (!status) {
        console.warn(`Status not found for update: ${id}`);
        return res.status(404).json({ success: false, error: 'Status not found' });
      }

      console.log('Status updated successfully:', id);

      // ─── Activity log ───────────────────────────────────────────────
      if (existingStatus) {
        const beforeSnap = { name: existingStatus.name, color: existingStatus.color, isActive: existingStatus.isActive };
        const afterSnap = { name: status.name, color: status.color, isActive: status.isActive };
        const { changedFields, before, after } = diffShallow(beforeSnap, afterSnap);

        recordTransaction({
          req,
          section: Section.WORK,
          module: Module.LEADS,
          page: Page.LEAD_SETTINGS,
          action: Action.UPDATE,
          actionLabel: `Updated lead status "${status.name}"`,
          entityType: EntityType.LEAD_STATUS,
          entityId: id,
          entityLabel: status.name,
          beforeData: before,
          afterData: after,
          changedFields,
        });
      }

      return res.status(200).json({ success: true, data: status });
    } catch (error: any) {
      console.error('Update Status Error:', error);
      if (error.code === '23505') {
        return res.status(409).json({ success: false, error: 'A status with this name already exists.' });
      }
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  static async deleteStatus(req: AuthRequest, res: Response) {
    try {
      console.log('--- DELETE STATUS START ---');
      const { id } = req.params;
      const tenantId = req.tenantId;
      console.log(`Delete Status ID: ${id}, Tenant ID: ${tenantId}`);
      if (!tenantId) {
        console.error('Delete Status: Missing tenant context');
        return res.status(400).json({ success: false, error: 'Tenant context required' });
      }

      const existingStatus = await LeadStatusModel.findById(id, tenantId);
      const statusName = existingStatus ? existingStatus.name : id;

      const success = await LeadStatusModel.delete(id, tenantId);
      if (!success) {
        console.warn(`Status not found for delete: ${id}`);
        return res.status(404).json({ success: false, error: 'Status not found' });
      }

      console.log('Status deleted successfully:', id);

      // ─── Activity log ───────────────────────────────────────────────
      recordTransaction({
        req,
        section: Section.WORK,
        module: Module.LEADS,
        page: Page.LEAD_SETTINGS,
        action: Action.DELETE,
        actionLabel: `Deleted lead status "${statusName}"`,
        entityType: EntityType.LEAD_STATUS,
        entityId: id,
        entityLabel: statusName,
      });

      return res.status(200).json({ success: true, message: 'Status deleted successfully' });
    } catch (error: any) {
      console.error('Delete Status Error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  // --- Action Methods ---

  static async createAction(req: AuthRequest, res: Response) {
    try {
      console.log('--- CREATE ACTION START ---');
      const tenantId = req.tenantId;
      console.log('Tenant ID:', tenantId);
      if (!tenantId) {
        console.error('Create Action: Missing tenant context');
        return res.status(400).json({ success: false, error: 'Tenant context required' });
      }

      const action = await LeadActionModel.create({
        ...req.body,
        tenant_id: tenantId
      });

      console.log('Action created successfully:', action.id);

      // ─── Activity log ───────────────────────────────────────────────
      recordTransaction({
        req,
        section: Section.WORK,
        module: Module.LEADS,
        page: Page.LEAD_SETTINGS,
        action: Action.CREATE,
        actionLabel: `Created lead action option "${action.name}"`,
        entityType: EntityType.LEAD_ACTION_OPTION,
        entityId: action.id,
        entityLabel: action.name,
      });

      return res.status(201).json({ success: true, data: action });
    } catch (error: any) {
      console.error('Create Action Error:', error);
      if (error.code === '23505') {
        return res.status(409).json({ success: false, error: 'An action with this name already exists.' });
      }
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  static async getActions(req: AuthRequest, res: Response) {
    try {
      console.log('--- GET ACTIONS START ---');
      const tenantId = req.tenantId;
      console.log('Tenant ID:', tenantId);
      if (!tenantId) {
        console.error('Get Actions: Missing tenant context');
        return res.status(400).json({ success: false, error: 'Tenant context required' });
      }

      const actions = await LeadActionModel.findAll(tenantId);
      console.log(`Fetched ${actions.length} actions for tenant ${tenantId}`);
      return res.status(200).json({ success: true, data: actions });
    } catch (error: any) {
      console.error('Get Actions Error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  static async updateAction(req: AuthRequest, res: Response) {
    try {
      console.log('--- UPDATE ACTION START ---');
      const { id } = req.params;
      const tenantId = req.tenantId;
      console.log(`Update Action ID: ${id}, Tenant ID: ${tenantId}`);
      if (!tenantId) {
        console.error('Update Action: Missing tenant context');
        return res.status(400).json({ success: false, error: 'Tenant context required' });
      }

      const existingAction = await LeadActionModel.findById(id, tenantId);
      const action = await LeadActionModel.update(id, tenantId, req.body);
      if (!action) {
        console.warn(`Action not found for update: ${id}`);
        return res.status(404).json({ success: false, error: 'Action not found' });
      }

      console.log('Action updated successfully:', id);

      // ─── Activity log ───────────────────────────────────────────────
      if (existingAction) {
        const beforeSnap = { name: existingAction.name, color: existingAction.color, isActive: existingAction.isActive };
        const afterSnap = { name: action.name, color: action.color, isActive: action.isActive };
        const { changedFields, before, after } = diffShallow(beforeSnap, afterSnap);

        recordTransaction({
          req,
          section: Section.WORK,
          module: Module.LEADS,
          page: Page.LEAD_SETTINGS,
          action: Action.UPDATE,
          actionLabel: `Updated lead action option "${action.name}"`,
          entityType: EntityType.LEAD_ACTION_OPTION,
          entityId: id,
          entityLabel: action.name,
          beforeData: before,
          afterData: after,
          changedFields,
        });
      }

      return res.status(200).json({ success: true, data: action });
    } catch (error: any) {
      console.error('Update Action Error:', error);
      if (error.code === '23505') {
        return res.status(409).json({ success: false, error: 'An action with this name already exists.' });
      }
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  static async deleteAction(req: AuthRequest, res: Response) {
    try {
      console.log('--- DELETE ACTION START ---');
      const { id } = req.params;
      const tenantId = req.tenantId;
      console.log(`Delete Action ID: ${id}, Tenant ID: ${tenantId}`);
      if (!tenantId) {
        console.error('Delete Action: Missing tenant context');
        return res.status(400).json({ success: false, error: 'Tenant context required' });
      }

      const existingAction = await LeadActionModel.findById(id, tenantId);
      const actionName = existingAction ? existingAction.name : id;

      const success = await LeadActionModel.delete(id, tenantId);
      if (!success) {
        console.warn(`Action not found for delete: ${id}`);
        return res.status(404).json({ success: false, error: 'Action not found' });
      }

      console.log('Action deleted successfully:', id);

      // ─── Activity log ───────────────────────────────────────────────
      recordTransaction({
        req,
        section: Section.WORK,
        module: Module.LEADS,
        page: Page.LEAD_SETTINGS,
        action: Action.DELETE,
        actionLabel: `Deleted lead action option "${actionName}"`,
        entityType: EntityType.LEAD_ACTION_OPTION,
        entityId: id,
        entityLabel: actionName,
      });

      return res.status(200).json({ success: true, message: 'Action deleted successfully' });
    } catch (error: any) {
      console.error('Delete Action Error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  // --- Platform Methods ---

  static async createPlatform(req: AuthRequest, res: Response) {
    try {
      const tenantId = req.tenantId;
      if (!tenantId) {
        return res.status(400).json({ success: false, error: 'Tenant context required' });
      }
      const { name, type } = req.body || {};
      if (!name || !type) {
        return res.status(400).json({ success: false, error: 'name and type are required' });
      }
      if (type !== 'online' && type !== 'website') {
        return res.status(400).json({ success: false, error: "type must be 'online' or 'website'" });
      }

      const platform = await LeadPlatformModel.create({
        ...req.body,
        tenant_id: tenantId,
        // Always re-derive on create — body.code is ignored if present.
        code: derivePlatformCode(name),
      });

      recordTransaction({
        req,
        section: Section.WORK,
        module: Module.LEADS,
        page: Page.LEAD_SETTINGS,
        action: Action.CREATE,
        actionLabel: `Created lead platform "${platform.name}"`,
        entityType: EntityType.LEAD_STATUS, // closest existing entity bucket
        entityId: platform.id,
        entityLabel: platform.name,
      });

      return res.status(201).json({ success: true, data: platform });
    } catch (error: any) {
      console.error('Create Platform Error:', error);
      if (error.code === '23505') {
        return res.status(409).json({ success: false, error: 'A platform with this name already exists.' });
      }
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  static async getPlatforms(req: AuthRequest, res: Response) {
    try {
      const tenantId = req.tenantId;
      if (!tenantId) {
        return res.status(400).json({ success: false, error: 'Tenant context required' });
      }
      const platforms = await LeadPlatformModel.findAll(tenantId);
      return res.status(200).json({ success: true, data: platforms });
    } catch (error: any) {
      console.error('Get Platforms Error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  static async updatePlatform(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const tenantId = req.tenantId;
      if (!tenantId) {
        return res.status(400).json({ success: false, error: 'Tenant context required' });
      }

      // Strip code from payload — it's derived at create time and immutable.
      const { code: _ignored, ...payload } = req.body || {};
      const existing = await LeadPlatformModel.findById(id, tenantId);
      const platform = await LeadPlatformModel.update(id, tenantId, payload);
      if (!platform) {
        return res.status(404).json({ success: false, error: 'Platform not found' });
      }

      if (existing) {
        const beforeSnap = { name: existing.name, type: existing.type, is_active: existing.is_active, url: existing.url };
        const afterSnap = { name: platform.name, type: platform.type, is_active: platform.is_active, url: platform.url };
        const { changedFields, before, after } = diffShallow(beforeSnap, afterSnap);
        recordTransaction({
          req,
          section: Section.WORK,
          module: Module.LEADS,
          page: Page.LEAD_SETTINGS,
          action: Action.UPDATE,
          actionLabel: `Updated lead platform "${platform.name}"`,
          entityType: EntityType.LEAD_STATUS,
          entityId: id,
          entityLabel: platform.name,
          beforeData: before,
          afterData: after,
          changedFields,
        });
      }

      return res.status(200).json({ success: true, data: platform });
    } catch (error: any) {
      console.error('Update Platform Error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  static async deletePlatform(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const tenantId = req.tenantId;
      if (!tenantId) {
        return res.status(400).json({ success: false, error: 'Tenant context required' });
      }

      const existing = await LeadPlatformModel.findById(id, tenantId);
      const platformName = existing ? existing.name : id;

      const success = await LeadPlatformModel.delete(id, tenantId);
      if (!success) {
        return res.status(404).json({ success: false, error: 'Platform not found' });
      }

      recordTransaction({
        req,
        section: Section.WORK,
        module: Module.LEADS,
        page: Page.LEAD_SETTINGS,
        action: Action.DELETE,
        actionLabel: `Deleted lead platform "${platformName}"`,
        entityType: EntityType.LEAD_STATUS,
        entityId: id,
        entityLabel: platformName,
      });

      return res.status(200).json({ success: true, message: 'Platform deleted successfully' });
    } catch (error: any) {
      console.error('Delete Platform Error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }
}
