import { Response } from 'express';
import { AuthRequest } from '@/types';
import { LeadModel } from '@/models/Lead.model';
import { LeadStatusModel } from '@/models/LeadStatus.model';
import { BidIQModel } from "../models/BidIQ.model";
import { AIService } from "../services/aiService";
import pool from '@/config/dbpool';
import { MailService } from '@/services/mail/MailService';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { s3Client, BUCKET_NAME } from '../utils/r2Client';
import { Readable } from 'stream';
import { LeadActivityLogModel } from '../models/LeadActivityLog.model';
import { LeadMailModel } from '../models/LeadMail.model';

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

      // Process and upload documents if they are Base64
      if (leadData.documents && Array.isArray(leadData.documents)) {
        leadData.documents = await LeadController.processLeadDocuments(tenantId, leadData.documents);
      }

      const lead = await LeadModel.create(leadData);

      // Log creation (fire-and-forget - optionalAuth so user may be missing)
      if (req.user?.id) {
        LeadActivityLogModel.create({
          tenantId,
          leadId: lead.id,
          action: 'CREATED_LEAD',
          performedBy: req.user.id,
        }).catch(() => {});
      }

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

      // Fetch separate BidIQ intelligence data
      const bidiq = await BidIQModel.findByLeadId(id, tenantId);

      return res.status(200).json({
        success: true,
        data: {
          ...lead,
          // Map separate data back to lead properties for frontend compatibility
          skill_analysis: bidiq ? {
            matchPercentage: bidiq.skill_match_percentage,
            missingSkills: bidiq.missing_skills
          } : (typeof lead.skill_analysis === 'string' ? JSON.parse(lead.skill_analysis) : lead.skill_analysis),
          ai_score: bidiq?.strategic_score || lead.ai_score,
          ai_summary: bidiq?.summary || lead.ai_summary
        }
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
      const mapping: { [key: string]: string } = {
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

      // Process and upload documents if they are Base64
      if (updateData.documents && Array.isArray(updateData.documents)) {
        updateData.documents = await LeadController.processLeadDocuments(tenantId, updateData.documents);
      }

      console.log('--- UPDATE LEAD REQUEST ---');
      console.log('ID:', id);

      const lead = await LeadModel.update(id, tenantId, updateData);

      if (!lead) {
        return res.status(404).json({ success: false, error: 'Lead not found or no changes made' });
      }

      // Log update activity (fire-and-forget to not block response)
      LeadActivityLogModel.create({
        tenantId,
        leadId: id,
        action: 'UPDATED_LEAD',
        performedBy: req.user!.id,
      }).catch(() => {});

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
   * Delete lead (Soft delete)
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
        message: 'Lead moved to Trash'
      });
    } catch (error: any) {
      console.error('Delete Lead Error:', error);
      return res.status(500).json({
        success: false,
        error: error.message || 'Internal server error'
      });
    }
  }

  /**
   * Get all trashed leads
   */
  static async getTrashLeads(req: AuthRequest, res: Response) {
    try {
      const tenantId = req.tenantId;
      if (!tenantId) {
        return res.status(400).json({ success: false, error: 'Tenant context required' });
      }

      const leads = await LeadModel.findAllDeleted(tenantId);

      return res.status(200).json({
        success: true,
        count: leads.length,
        data: leads
      });
    } catch (error: any) {
      console.error('Get Trash Leads Error:', error);
      return res.status(500).json({
        success: false,
        error: error.message || 'Internal server error'
      });
    }
  }

  /**
   * Restore lead from trash
   */
  static async restoreLead(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const tenantId = req.tenantId;
      if (!tenantId) {
        return res.status(400).json({ success: false, error: 'Tenant context required' });
      }

      const success = await LeadModel.restore(id, tenantId);

      if (!success) {
        return res.status(404).json({ success: false, error: 'Lead not found in Trash' });
      }

      return res.status(200).json({
        success: true,
        message: 'Lead restored successfully'
      });
    } catch (error: any) {
      console.error('Restore Lead Error:', error);
      return res.status(500).json({
        success: false,
        error: error.message || 'Internal server error'
      });
    }
  }

  /**
   * Permanently delete lead
   */
  static async permanentlyDeleteLead(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const tenantId = req.tenantId;
      if (!tenantId) {
        return res.status(400).json({ success: false, error: 'Tenant context required' });
      }

      const success = await LeadModel.permanentDelete(id, tenantId);

      if (!success) {
        return res.status(404).json({ success: false, error: 'Lead not found in Trash' });
      }

      return res.status(200).json({
        success: true,
        message: 'Lead permanently deleted'
      });
    } catch (error: any) {
      console.error('Permanent Delete Lead Error:', error);
      return res.status(500).json({
        success: false,
        error: error.message || 'Internal server error'
      });
    }
  }

  /**
   * Onboard a lead to a project (Using Raw SQL)
   */
  static async onboardLead(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const tenantId = req.tenantId;
      if (!tenantId || !req.user) {
        return res.status(400).json({ success: false, error: 'Tenant context and authentication required' });
      }

      // 1. Fetch the lead
      const lead = await LeadModel.findById(id, tenantId);
      if (!lead) {
        return res.status(404).json({ success: false, error: 'Lead not found' });
      }

      // 2. Create or find the Client (ClientV2)
      let clientId;
      const clientName = req.body.client_name || lead.client_name || 'New Client';
      const clientLocation = req.body.client_location || lead.client_location;
      const projectTitle = req.body.title || lead.title;
      const projectSummary = req.body.summary || lead.summary;
      const projectBudget = req.body.budget || lead.budget;

      const existingClientSearch = await pool.query(
        'SELECT id FROM clients_v2 WHERE tenant_id = $1 AND company_name = $2 LIMIT 1',
        [tenantId, clientName]
      );

      if (existingClientSearch.rows.length > 0) {
        clientId = existingClientSearch.rows[0].id;
      } else {
        // Generate Client Code
        const clientPrefix = (clientName)
          .replace(/[^a-zA-Z]/g, "")
          .substring(0, 3)
          .toUpperCase();
        const clientTimestamp = Date.now().toString().slice(-4);
        const clientCode = `${clientPrefix}${clientTimestamp}`;

        const newClient = await pool.query(
          `INSERT INTO clients_v2 (id, tenant_id, client_code, company_name, client_type, status, billing_address, country, created_by_id, created_at, updated_at) 
           VALUES (gen_random_uuid(), $1, $2, $3, 'Enterprise', 'Prospect', $4, $5, $6, NOW(), NOW()) 
           RETURNING id`,
          [tenantId, clientCode, clientName, clientLocation, 'International', req.user.id]
        );
        clientId = newClient.rows[0].id;
      }

      // 3. Create the project (Raw SQL)
      const namePrefix = (projectTitle || 'PRJ')
        .replace(/[^a-zA-Z]/g, "")
        .substring(0, 3)
        .toUpperCase();
      const timestamp = Date.now().toString().slice(-4);
      const projectCode = `${namePrefix}${timestamp}`;

      const newProject = await pool.query(
        `INSERT INTO projects (id, tenant_id, name, code, description, status, start_date, project_manager_id, created_by_id, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, 'active', NOW(), $5, $5, NOW(), NOW())
         RETURNING id, name, code`,
        [tenantId, projectTitle, projectCode, projectSummary || `Project created from lead: ${projectTitle}`, req.user.id]
      );

      const project = newProject.rows[0];

      // 4. Link Client and Project in client_projects table
      // Clean budget string (remove $, commas, etc)
      const cleanBudget = typeof projectBudget === 'string' 
        ? parseFloat(projectBudget.replace(/[^0-9.]/g, '')) || 0
        : (projectBudget || 0);

      await pool.query(
        `INSERT INTO client_projects (id, tenant_id, client_id, project_id, created_at, updated_at, budget)
         VALUES (gen_random_uuid(), $1, $2, $3, NOW(), NOW(), $4)`,
        [tenantId, clientId, project.id, cleanBudget]
      );

      // 5. Update lead status to 'Onboarded'
      await LeadModel.update(id, tenantId, { status: 'Onboarded' });

      // 6. Log timeline activities
      await LeadActivityLogModel.create({
        tenantId,
        leadId: id,
        action: 'CLIENT_CREATED',
        performedBy: req.user.id,
        metadata: { clientId, clientName }
      });

      await LeadActivityLogModel.create({
        tenantId,
        leadId: id,
        action: 'PROJECT_CREATED',
        performedBy: req.user.id,
        metadata: { projectId: project.id, projectName: projectTitle }
      });

      return res.status(200).json({
        success: true,
        message: 'Lead successfully onboarded: Client and Project created.',
        data: {
          project,
          clientId
        }
      });

    } catch (error: any) {
      console.error('Lead Onboarding Error:', error);
      return res.status(500).json({
        success: false,
        error: error.message || 'Internal server error'
      });
    }
  }

  /**
   * Empty Trash (Permanently delete all trashed leads for tenant)
   */
  static async emptyTrash(req: AuthRequest, res: Response) {
    try {
      const tenantId = req.tenantId;
      if (!tenantId) {
        return res.status(400).json({ success: false, error: 'Tenant context required' });
      }

      const count = await LeadModel.emptyTrash(tenantId);

      return res.status(200).json({
        success: true,
        message: `Trash emptied: ${count} leads permanently deleted`,
        data: { deletedCount: count }
      });
    } catch (error: any) {
      console.error('Empty Trash Error:', error);
      return res.status(500).json({
        success: false,
        error: error.message || 'Internal server error'
      });
    }
  }

  /**
   * Bulk Restore Leads
   */
  static async bulkRestoreLeads(req: AuthRequest, res: Response) {
    try {
      const tenantId = req.tenantId;
      const { ids } = req.body;
      if (!tenantId || !ids || !Array.isArray(ids)) {
        return res.status(400).json({ success: false, error: 'Tenant context and IDs array required' });
      }

      const count = await LeadModel.bulkRestore(ids, tenantId);

      return res.status(200).json({
        success: true,
        message: `${count} leads restored successfully`,
        data: { restoredCount: count }
      });
    } catch (error: any) {
      console.error('Bulk Restore Error:', error);
      return res.status(500).json({
        success: false,
        error: error.message || 'Internal server error'
      });
    }
  }

  /**
   * Bulk Permanently Delete Leads
   */
  static async bulkPermanentlyDeleteLeads(req: AuthRequest, res: Response) {
    try {
      const tenantId = req.tenantId;
      const { ids } = req.body;
      if (!tenantId || !ids || !Array.isArray(ids)) {
        return res.status(400).json({ success: false, error: 'Tenant context and IDs array required' });
      }

      const count = await LeadModel.bulkPermanentDelete(ids, tenantId);

      return res.status(200).json({
        success: true,
        message: `${count} leads permanently deleted`,
        data: { deletedCount: count }
      });
    } catch (error: any) {
      console.error('Bulk Permanent Delete Error:', error);
      return res.status(500).json({
        success: false,
        error: error.message || 'Internal server error'
      });
    }
  }

  /**
   * Send mail to lead using integrated invoice mail
   */
  static async sendLeadMail(req: AuthRequest, res: Response) {
    try {
      const tenantId = req.tenantId;
      if (!tenantId) {
        return res.status(400).json({ success: false, error: 'Tenant context required' });
      }

      const { to, subject, body, htmlBody, attachments, leadId } = req.body;

      const mailResponse = await MailService.sendInvoiceViaIntegratedMail(tenantId, {
        to: Array.isArray(to) ? to : [to],
        subject,
        body,
        htmlBody: htmlBody || body,
        attachments: attachments || []
      });

      // Log mail sent activity
      if (leadId && req.user?.id) {
        // 1. Create activity log
        try {
          await LeadActivityLogModel.create({
            tenantId,
            leadId,
            action: 'MAIL_SENT',
            performedBy: req.user.id,
            metadata: { to: Array.isArray(to) ? to : [to], subject }
          });
        } catch (err) {
          console.error("[LeadController] Failed to create mail activity log:", err);
        }

        // 2. Store full mail details in lead_mails table
        try {
          await LeadMailModel.create({
            tenantId,
            leadId,
            sentBy: req.user.id,
            recipientEmail: Array.isArray(to) ? to.join(', ') : to,
            subject,
            body: htmlBody || body,
            attachments: attachments || []
          });
        } catch (err) {
          console.error("[LeadController] Failed to store mail in lead_mails:", err);
        }
      }

      return res.json({
        success: true,
        message: "Email sent successfully via integrated mail",
        data: mailResponse
      });
    } catch (error: any) {
      console.error("[LeadController] sendLeadMail error:", error);
      return res.status(500).json({
        success: false,
        error: error.message || "Failed to send lead mail"
      });
    }
  }

  /**
   * Helper to process documents and upload Base64 strings to R2
   */
  private static async processLeadDocuments(tenantId: string, documents: any[]): Promise<any[]> {
    const processedDocs = [];
    for (const doc of documents) {
      // Check if it's a new Base64 upload
      if (doc.url && doc.url.startsWith('data:')) {
        try {
          console.log(`[LeadController] Uploading Base64 document to R2: ${doc.name}`);
          // Re-using MailService's upload logic
          const uploadResult = await MailService.uploadAttachment(tenantId, doc.url, doc.name);
          processedDocs.push({
            name: doc.name,
            url: uploadResult.url,
            type: 'file'
          });
        } catch (uploadError) {
          console.error(`[LeadController] Failed to upload document ${doc.name}:`, uploadError);
          processedDocs.push(doc); // Fallback to original
        }
      } else {
        processedDocs.push(doc);
      }
    }
    return processedDocs;
  }

  /**
   * Proxy download for lead attachments to resolve R2 authorization and CORS issues.
   * This uses the configured S3 client to handle authentication with R2.
   */
  static async downloadAttachment(req: AuthRequest, res: Response) {
    try {
      const { url: finalUrl, filename, mode = 'inline' } = req.query;

      if (!finalUrl || typeof finalUrl !== 'string') {
        return res.status(400).json({ success: false, error: "URL is required" });
      }

      const urlObj = new URL(finalUrl);
      let key = urlObj.pathname.startsWith("/") ? urlObj.pathname.slice(1) : urlObj.pathname;

      // If the key starts with the bucket name, strip it
      if (key.startsWith(BUCKET_NAME + '/')) {
        key = key.substring(BUCKET_NAME.length + 1);
      }
      
      key = decodeURIComponent(key);

      const filenameStr = typeof filename === 'string' ? filename : 'file';
      const ext = filenameStr.split('.').pop()?.toLowerCase() || '';
      const MIME_MAP: Record<string, string> = {
        pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
        gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', mp4: 'video/mp4',
        mp3: 'audio/mpeg', txt: 'text/plain', csv: 'text/csv', html: 'text/html',
        zip: 'application/zip', ics: 'text/calendar',
        docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      };
      const resolvedContentType = MIME_MAP[ext] || 'application/octet-stream';

      const command = new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key
      });

      const s3Response = await s3Client.send(command);

      if (!s3Response.Body) {
        throw new Error("Empty response body from R2");
      }

      // Set proper headers
      res.setHeader('Content-Type', resolvedContentType);
      res.setHeader('Content-Disposition', mode === 'inline' 
        ? `inline; filename="${filenameStr}"` 
        : `attachment; filename="${filenameStr}"`);

      // Pipe the response
      if (s3Response.Body) {
        const body = s3Response.Body as any;
        
        if (typeof body.pipe === 'function') {
          return body.pipe(res);
        } else {
          const bytes = await s3Response.Body.transformToByteArray();
          return res.send(Buffer.from(bytes));
        }
      } else {
        return res.status(404).json({ success: false, error: "File content empty" });
      }

    } catch (error: any) {
      console.error("[LeadController] downloadAttachment error:", error);
      return res.status(500).json({ 
        success: false, 
        error: "Failed to download attachment",
        details: error.message
      });
    }
  }

  /**
   * Get the activity timeline for a lead
   */
  static async getLeadTimeline(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const tenantId = req.tenantId;
      if (!tenantId) {
        return res.status(400).json({ success: false, error: 'Tenant context required' });
      }

      const timeline = await LeadActivityLogModel.getLogsWithUserInfo(id, tenantId);

      return res.status(200).json({
        success: true,
        data: timeline
      });
    } catch (error: any) {
      console.error('Get Lead Timeline Error:', error);
      return res.status(500).json({
        success: false,
        error: error.message || 'Internal server error'
      });
    }
  }

  /**
   * Get all mails for a lead
   */
  static async getLeadMails(req: AuthRequest, res: Response) {
    try {
      const tenantId = req.tenantId;
      const { id: leadId } = req.params;
      
      if (!tenantId) {
        return res.status(400).json({ success: false, error: 'Tenant context required' });
      }

      const mails = await LeadMailModel.findByLeadId(leadId, tenantId);

      return res.json({
        success: true,
        data: mails
      });
    } catch (error: any) {
      console.error("[LeadController] getLeadMails error:", error);
      return res.status(500).json({
        success: false,
        error: error.message || "Failed to fetch lead mails"
      });
    }
  }
}

//comment added
