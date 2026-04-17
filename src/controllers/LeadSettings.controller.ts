import { Response } from 'express';
import { AuthRequest } from '@/types';
import { LeadStatusModel } from '@/models/LeadStatus.model';
import { LeadActionModel } from '@/models/LeadAction.model';

export class LeadSettingsController {
  
  // --- Status Methods ---

  static async createStatus(req: AuthRequest, res: Response) {
    try {
      const tenantId = req.tenantId;
      if (!tenantId) return res.status(400).json({ success: false, error: 'Tenant context required' });

      const status = await LeadStatusModel.create({
        ...req.body,
        tenant_id: tenantId
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
      const tenantId = req.tenantId;
      if (!tenantId) return res.status(400).json({ success: false, error: 'Tenant context required' });

      const statuses = await LeadStatusModel.findAll(tenantId);
      return res.status(200).json({ success: true, data: statuses });
    } catch (error: any) {
      console.error('Get Statuses Error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  static async updateStatus(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const tenantId = req.tenantId;
      if (!tenantId) return res.status(400).json({ success: false, error: 'Tenant context required' });

      const status = await LeadStatusModel.update(id, tenantId, req.body);
      if (!status) return res.status(404).json({ success: false, error: 'Status not found' });

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
      const { id } = req.params;
      const tenantId = req.tenantId;
      if (!tenantId) return res.status(400).json({ success: false, error: 'Tenant context required' });

      const success = await LeadStatusModel.delete(id, tenantId);
      if (!success) return res.status(404).json({ success: false, error: 'Status not found' });

      return res.status(200).json({ success: true, message: 'Status deleted successfully' });
    } catch (error: any) {
      console.error('Delete Status Error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  // --- Action Methods ---

  static async createAction(req: AuthRequest, res: Response) {
    try {
      const tenantId = req.tenantId;
      if (!tenantId) return res.status(400).json({ success: false, error: 'Tenant context required' });

      const action = await LeadActionModel.create({
        ...req.body,
        tenant_id: tenantId
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
      const tenantId = req.tenantId;
      if (!tenantId) return res.status(400).json({ success: false, error: 'Tenant context required' });

      const actions = await LeadActionModel.findAll(tenantId);
      return res.status(200).json({ success: true, data: actions });
    } catch (error: any) {
      console.error('Get Actions Error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  static async updateAction(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const tenantId = req.tenantId;
      if (!tenantId) return res.status(400).json({ success: false, error: 'Tenant context required' });

      const action = await LeadActionModel.update(id, tenantId, req.body);
      if (!action) return res.status(404).json({ success: false, error: 'Action not found' });

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
      const { id } = req.params;
      const tenantId = req.tenantId;
      if (!tenantId) return res.status(400).json({ success: false, error: 'Tenant context required' });

      const success = await LeadActionModel.delete(id, tenantId);
      if (!success) return res.status(404).json({ success: false, error: 'Action not found' });

      return res.status(200).json({ success: true, message: 'Action deleted successfully' });
    } catch (error: any) {
      console.error('Delete Action Error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }
}
