import { Response } from 'express';
import { AuthRequest } from '@/types';
import { LeadModel } from '@/models/Lead.model';
import { LeadStatusModel } from '@/models/LeadStatus.model';

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
      console.log('Incoming Body Fields:', Object.keys(req.body));
      console.log('AI Summary Received:', req.body.ai_summary || req.body.aiSummary ? 'YES' : 'NO');

      // Fetch default status if not provided in request (or if it's the generic 'Open')
      let statusToSet = req.body.status;
      const defaultStatus = await LeadStatusModel.findDefault(tenantId);
      
      if (!statusToSet || (statusToSet.toLowerCase() === 'open' && defaultStatus)) {
        if (defaultStatus) {
          statusToSet = defaultStatus.name;
        }
      }

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
        status: statusToSet,
        actions_item: req.body.actions,
        timeline_start: parseDate(req.body.timeline?.[0]),
        timeline_end: parseDate(req.body.timeline?.[1]),
        posted_on: parseDate(req.body.postedOn) || new Date(),
        
        // Job Metadata
        external_job_id: req.body.externalJobId,
        experience_level: req.body.experienceLevel,
        job_type: req.body.jobType,
        budget: req.body.budget,
        hourly_rate: req.body.hourlyRate,
        
        // Client Quality Data
        client_rating: req.body.clientRating,
        client_spend: req.body.clientSpend,
        client_jobs_posted: req.body.clientJobsPosted,
        client_payment_verified: req.body.clientPaymentVerified,
        client_phone_verified: req.body.clientPhoneVerified,
        
        // AI & Proposal Data
        ai_score: req.body.aiScore,
        proposal_text: req.body.proposalText,
        template_used: req.body.templateUsed,
        platform: req.body.platform || (req.body.jobLink?.toLowerCase().includes('upwork.com') ? 'Upwork' : 
                   req.body.jobLink?.toLowerCase().includes('freelancer.com') ? 'Freelancer' :
                   req.body.jobLink?.toLowerCase().includes('fiverr.com') ? 'Fiverr' :
                   req.body.jobLink?.toLowerCase().includes('linkedin.com') ? 'LinkedIn' : 'Upwork'),
        internal_notes: req.body.internalNotes,
        skill_analysis: req.body.skillAnalysis,
        ai_summary: req.body.ai_summary || req.body.aiSummary,
        documents: req.body.attachments || req.body.documents
      };

      console.log('Mapped LeadData:', JSON.stringify(leadData, null, 2));

      const lead = await LeadModel.create(leadData);
      
      return res.status(201).json({
        success: true,
        data: lead
      });
    } catch (error: any) {
      console.error('Create Lead Error:', error);
      
      // Handle Unique Constraint Violation (Postgres Error 23505)
      if (error.code === '23505') {
        return res.status(409).json({ 
          success: false, 
          error: 'A lead with this job link already exists in your pipeline.' 
        });
      }

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
        documents: 'documents',
        
        // Job Metadata
        externalJobId: 'external_job_id',
        experienceLevel: 'experience_level',
        jobType: 'job_type',
        budget: 'budget',
        hourlyRate: 'hourly_rate',
        
        // Client Quality Data
        clientRating: 'client_rating',
        clientSpend: 'client_spend',
        clientJobsPosted: 'client_jobs_posted',
        clientPaymentVerified: 'client_payment_verified',
        clientPhoneVerified: 'client_phone_verified',
        
        // AI & Proposal Data
        aiScore: 'ai_score',
        proposalText: 'proposal_text',
        templateUsed: 'template_used',
        platform: 'platform',
        internalNotes: 'internal_notes',
        skillAnalysis: 'skill_analysis',
        aiSummary: 'ai_summary',
        ai_summary: 'ai_summary',
        attachments: 'documents'
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

      // Handle Unique Constraint Violation (Postgres Error 23505)
      if (error.code === '23505') {
        return res.status(409).json({ 
          success: false, 
          error: 'Update failed: Another lead already exists with this job link.' 
        });
      }

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
