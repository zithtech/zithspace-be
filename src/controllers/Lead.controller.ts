import { Response } from 'express';
import { AuthRequest } from '@/types';
import { LeadModel } from '@/models/Lead.model';

export class LeadController {
  
  /**
   * Create a lead
   */
  static async createLead(req: AuthRequest, res: Response) {
    try {
      const tenantId = req.tenantId;
      if (!tenantId) {
        return res.status(400).json({ success: false, error: 'Tenant context required' });
      }

      // Robust date parsing for Postgres compatibility
      const parseDate = (val: any) => {
        if (!val) return null;
        const d = new Date(val);
        return isNaN(d.getTime()) ? null : d;
      };

      console.log('--- CREATE LEAD REQUEST ---');
      console.log('Body:', JSON.stringify(req.body, null, 2));

      const leadData = {
        tenant_id: tenantId,
        client_name: req.body.clientName,
        client_mail: req.body.clientMail,
        client_phone: req.body.clientPhone,
        client_location: req.body.clientLocation,
        title: req.body.title,
        summary: req.body.summary,
        skills: req.body.skills,
        duration: req.body.duration,
        hour_based_amount: req.body.hourBasedAmount,
        job_link: req.body.jobLink,
        est_project_duration: req.body.estOrProjectDuration,
        status: req.body.status,
        actions_item: req.body.actions,
        timeline_start: parseDate(req.body.timeline?.[0]),
        timeline_end: parseDate(req.body.timeline?.[1]),
        posted_on: parseDate(req.body.postedOn) || new Date(),
        documents: req.body.documents
      };

      console.log('Mapped LeadData:', JSON.stringify(leadData, null, 2));

      const lead = await LeadModel.create(leadData);
      
      return res.status(201).json({
        success: true,
        data: lead
      });
    } catch (error: any) {
      console.error('Create Lead Error:', error);
      return res.status(500).json({
        success: false,
        error: error.message || 'Internal server error',
        details: error.detail // pg often provides details in .detail
      });
    }
  }

  /**
   * Get all leads for current tenant
   */
  static async getLeads(req: AuthRequest, res: Response) {
    try {
      const tenantId = req.tenantId;
      if (!tenantId) {
        return res.status(400).json({ success: false, error: 'Tenant context required' });
      }

      const leads = await LeadModel.findAll(tenantId);
      
      return res.status(200).json({
        success: true,
        count: leads.length,
        data: leads
      });
    } catch (error: any) {
      console.error('Get Leads Error:', error);
      return res.status(500).json({
        success: false,
        error: error.message || 'Internal server error'
      });
    }
  }

  /**
   * Get a single lead
   */
  static async getLead(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const tenantId = req.tenantId;
      if (!tenantId) {
        return res.status(400).json({ success: false, error: 'Tenant context required' });
      }

      const lead = await LeadModel.findById(id, tenantId);
      
      if (!lead) {
        return res.status(404).json({ success: false, error: 'Lead not found' });
      }

      return res.status(200).json({
        success: true,
        data: lead
      });
    } catch (error: any) {
      console.error('Get Lead Error:', error);
      return res.status(500).json({
        success: false,
        error: error.message || 'Internal server error'
      });
    }
  }

  /**
   * Update lead
   */
  static async updateLead(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const tenantId = req.tenantId;
      if (!tenantId) {
        return res.status(400).json({ success: false, error: 'Tenant context required' });
      }

      const updateData: any = {};
      const mapping: any = {
        clientName: 'client_name',
        clientMail: 'client_mail',
        clientPhone: 'client_phone',
        clientLocation: 'client_location',
        title: 'title',
        summary: 'summary',
        skills: 'skills',
        duration: 'duration',
        hourBasedAmount: 'hour_based_amount',
        jobLink: 'job_link',
        estOrProjectDuration: 'est_project_duration',
        status: 'status',
        actions: 'actions_item',
        postedOn: 'posted_on',
        documents: 'documents'
      };

      const parseDate = (val: any) => {
        if (!val) return null;
        const d = new Date(val);
        return isNaN(d.getTime()) ? null : d;
      };

      Object.keys(req.body).forEach(key => {
        if (mapping[key]) {
          if (key === 'postedOn') {
            updateData[mapping[key]] = parseDate(req.body[key]);
          } else {
            updateData[mapping[key]] = req.body[key];
          }
        } else if (key === 'timeline') {
          updateData.timeline_start = parseDate(req.body.timeline?.[0]);
          updateData.timeline_end = parseDate(req.body.timeline?.[1]);
        }
      });

      console.log('--- UPDATE LEAD REQUEST ---');
      console.log('ID:', id);
      console.log('UpdateData:', JSON.stringify(updateData, null, 2));

      const lead = await LeadModel.update(id, tenantId, updateData);
      
      if (!lead) {
        return res.status(404).json({ success: false, error: 'Lead not found or no changes made' });
      }

      return res.status(200).json({
        success: true,
        data: lead
      });
    } catch (error: any) {
      console.error('Update Lead Error:', error);
      return res.status(500).json({
        success: false,
        error: error.message || 'Internal server error'
      });
    }
  }

  /**
   * Delete lead
   */
  static async deleteLead(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const tenantId = req.tenantId;
      if (!tenantId) {
        return res.status(400).json({ success: false, error: 'Tenant context required' });
      }

      const success = await LeadModel.delete(id, tenantId);
      
      if (!success) {
        return res.status(404).json({ success: false, error: 'Lead not found' });
      }

      return res.status(200).json({
        success: true,
        message: 'Lead deleted successfully'
      });
    } catch (error: any) {
      console.error('Delete Lead Error:', error);
      return res.status(500).json({
        success: false,
        error: error.message || 'Internal server error'
      });
    }
  }
}
