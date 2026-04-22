import { Response } from 'express';
import {
  AuthRequest,
  ApiResponse,
  ValidationError
} from '@/types';
import { ProposalExportService } from '@/services/proposalExportService';
import { AIService } from '@/services/aiService';
import { LeadModel } from '@/models/Lead.model';
import { ProposalModel } from '@/models/Proposal.model';

export class ProposalController {

  /**
   * Get all proposals for a tenant
   */
  static async getProposals(req: AuthRequest, res: Response): Promise<void> {
    try {
      const tenantId = req.tenantId;
      if (!tenantId) throw new ValidationError('Tenant context required');

      console.log('🔍 [PROPOSAL FETCH] Active Tenant:', tenantId);

      let proposals = await ProposalModel.findAll(tenantId);

      // DEVELOPMENT FALLBACK
      if (proposals.length === 0 && process.env.NODE_ENV === 'development') {
        const fallbackId = 'b85c1b5b-77a3-4281-9147-51d6bd3ee94d';
        if (tenantId !== fallbackId) {
          console.log('⚠️ [DEV FALLBACK] No proposals for current tenant. Trying fallback:', fallbackId);
          const fallbackProposals = await ProposalModel.findAll(fallbackId);
          if (fallbackProposals.length > 0) {
            proposals = fallbackProposals;
          }
        }
      }

      res.status(200).json({
        success: true,
        data: proposals,
        debug: { tenantId }
      } as ApiResponse & { debug: any });
    } catch (error: any) {
      console.error('Error fetching proposals:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to fetch proposals'
      } as ApiResponse);
    }
  }

  /**
   * Get a single proposal by ID
   */
  static async getProposalById(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const tenantId = req.tenantId;

      let proposal = await ProposalModel.findById(id, tenantId);

      // DEV FALLBACK
      if (!proposal && process.env.NODE_ENV === 'development') {
        const fallbackId = 'b85c1b5b-77a3-4281-9147-51d6bd3ee94d';
        proposal = await ProposalModel.findById(id, fallbackId);
      }

      if (!proposal) {
        res.status(404).json({ success: false, error: 'Proposal not found' });
        return;
      }

      res.status(200).json({
        success: true,
        data: proposal
      } as ApiResponse);
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  /**
   * Create a new proposal
   */
  static async createProposal(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { title, client_name, blocks, status = 'draft' } = req.body;
      const tenantId = req.tenantId;
      const userId = req.user?.id;

      if (!title) throw new ValidationError('Proposal title is required');
      if (!blocks) throw new ValidationError('Proposal blocks data is required');

      const proposal = await ProposalModel.create({
        tenant_id: tenantId,
        title,
        client_name,
        blocks_data: blocks,
        status,
        created_by: userId
      });

      res.status(201).json({
        success: true,
        data: proposal,
        message: 'Proposal created successfully'
      } as ApiResponse);
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  /**
   * Update an existing proposal
   */
  static async updateProposal(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { title, client_name, blocks, status } = req.body;
      const tenantId = req.tenantId;

      const proposal = await ProposalModel.update(id, tenantId, {
        title,
        client_name,
        blocks_data: blocks,
        status
      });

      if (!proposal) {
        res.status(404).json({ success: false, error: 'Proposal not found or unauthorized' });
        return;
      }

      res.status(200).json({
        success: true,
        data: proposal,
        message: 'Proposal updated successfully'
      } as ApiResponse);
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  /**
   * Delete a proposal
   */
  static async deleteProposal(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const tenantId = req.tenantId;

      let success = await ProposalModel.delete(id, tenantId);

      // DEV FALLBACK
      if (!success && process.env.NODE_ENV === 'development') {
        const fallbackId = 'b85c1b5b-77a3-4281-9147-51d6bd3ee94d';
        success = await ProposalModel.delete(id, fallbackId);
      }

      if (!success) {
        res.status(404).json({ success: false, error: 'Proposal not found' });
        return;
      }

      res.status(200).json({
        success: true,
        message: 'Proposal deleted successfully'
      } as ApiResponse);
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  /**
   * Export a proposal
   */
  static async exportProposal(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const tenantId = req.tenantId;

      let proposal = await ProposalModel.findById(id, tenantId);

      // DEV FALLBACK
      if (!proposal && process.env.NODE_ENV === 'development') {
        const fallbackId = 'b85c1b5b-77a3-4281-9147-51d6bd3ee94d';
        proposal = await ProposalModel.findById(id, fallbackId);
      }

      if (!proposal) {
        res.status(404).json({ success: false, error: 'Proposal not found' });
        return;
      }

      const { pdfUrl, docxUrl } = await ProposalExportService.generateAndUpload(proposal);

      res.status(200).json({
        success: true,
        data: { pdfUrl, docxUrl },
        message: 'Proposal exported successfully'
      } as ApiResponse);
    } catch (error: any) {
      console.error('Export error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  /**
   * Generate from lead
   */
  static async generateFromLead(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { leadId } = req.params;
      const tenantId = req.tenantId;
      const userId = req.user?.id;

      const lead = await LeadModel.findById(leadId, tenantId);
      if (!lead) {
        res.status(404).json({ success: false, error: 'Lead not found' });
        return;
      }

      const blocks = await AIService.composeProposal(lead);

      const proposal = await ProposalModel.create({
        tenant_id: tenantId,
        title: `Proposal: ${lead.title}`,
        client_name: lead.client_name,
        blocks_data: blocks,
        status: 'draft',
        created_by: userId
      });

      res.status(201).json({
        success: true,
        data: proposal,
        message: 'AI Proposal generated successfully'
      });
    } catch (error: any) {
      console.error('AI Proposal Gen Error:', error);
      res.status(500).json({ success: false, error: error.message || 'Failed to generate AI proposal' });
    }
  }

  /**
   * Content only generation
   */
  static async generateContentOnly(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { leadId } = req.params;
      const tenantId = req.tenantId;

      const lead = await LeadModel.findById(leadId, tenantId);
      if (!lead) {
        res.status(404).json({ success: false, error: 'Lead not found' });
        return;
      }

      const blocks = await AIService.composeProposal(lead);

      res.status(200).json({
        success: true,
        data: { blocks, title: `Proposal: ${lead.title}`, client_name: lead.client_name },
        message: 'AI Proposal content generated'
      });
    } catch (error: any) {
      console.error('AI Proposal Content Gen Error:', error);
      res.status(500).json({ success: false, error: error.message || 'Failed to generate AI content' });
    }
  }

  /**
   * Refine block
   */
  static async refineBlock(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { blockType, currentData, userPrompt } = req.body;
      const refinedData = await AIService.refineProposalBlock(currentData, userPrompt, blockType);

      res.status(200).json({
        success: true,
        data: refinedData,
        message: 'Content refined successfully'
      });
    } catch (error: any) {
      console.error('AI Refinement Controller Error:', error);
      res.status(500).json({ success: false, error: error.message || 'Failed to refine content' });
    }
  }
}
