import { Response } from 'express';
import { AuthRequest } from '../types';
import { LinearAuthService } from '../services/LinearAuthService';
import { LinearIntegrationService } from '../services/LinearIntegrationService';
import pool from '../config/dbpool';

const linearAuthService = new LinearAuthService();

export class LinearIntegrationController {
  
  static getTeams = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      if (!req.tenantId || !req.user?.id) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }
      
      const token = await linearAuthService.getToken(req.tenantId, req.user.id);
      if (!token) {
        res.status(403).json({ success: false, error: 'Linear is not connected' });
        return;
      }
      
      const teams = await LinearIntegrationService.getTeams(token);
      res.json({ success: true, data: teams });
    } catch (error: any) {
      console.error('Error fetching Linear teams:', error);
      res.status(500).json({ success: false, error: error.message || 'Failed to fetch Linear teams' });
    }
  };

  static getUsers = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      if (!req.tenantId || !req.user?.id) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }
      
      const token = await linearAuthService.getToken(req.tenantId, req.user.id);
      if (!token) {
        res.status(403).json({ success: false, error: 'Linear is not connected' });
        return;
      }
      
      const users = await LinearIntegrationService.getUsers(token);
      res.json({ success: true, data: users });
    } catch (error: any) {
      console.error('Error fetching Linear users:', error);
      res.status(500).json({ success: false, error: error.message || 'Failed to fetch Linear users' });
    }
  };

  static getLabels = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      if (!req.tenantId || !req.user?.id) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }
      
      const token = await linearAuthService.getToken(req.tenantId, req.user.id);
      if (!token) {
        res.status(403).json({ success: false, error: 'Linear is not connected' });
        return;
      }
      
      const labels = await LinearIntegrationService.getLabels(token);
      res.json({ success: true, data: labels });
    } catch (error: any) {
      console.error('Error fetching Linear labels:', error);
      res.status(500).json({ success: false, error: error.message || 'Failed to fetch Linear labels' });
    }
  };

  static createIssue = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      if (!req.tenantId || !req.user?.id) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }
      
      const { title, description, teamId, projectId, assigneeId, priority, labelIds, bugIds, attachments } = req.body;
      
      if (!title || !teamId) {
        res.status(400).json({ success: false, error: 'Title and Team ID are required' });
        return;
      }
      
      const token = await linearAuthService.getToken(req.tenantId, req.user.id);
      if (!token) {
        res.status(403).json({ success: false, error: 'Linear is not connected' });
        return;
      }
      
      let finalDescription = description || '';

      if (bugIds && Array.isArray(bugIds) && bugIds.length > 0) {
        const bugsRes = await pool.query(
          `SELECT bug_number, title, description FROM bugs WHERE id = ANY($1) AND tenant_id = $2`, 
          [bugIds, req.tenantId]
        );
        
        if (bugsRes.rows.length > 0) {
          if (finalDescription) finalDescription += '\n\n';
          finalDescription += '### Linked Bugs:\n';
          for (const bug of bugsRes.rows) {
            finalDescription += `**${bug.bug_number || 'Bug'} - ${bug.title || 'Untitled'}**\n`;
            if (bug.description) {
              // Strip basic block tags to make it somewhat readable in Linear's markdown
              let cleanedDesc = bug.description
                .replace(/<p[^>]*>/g, '')
                .replace(/<\/p>/g, '\n')
                .replace(/<br\s*\/?>/g, '\n')
                .replace(/<[^>]*>?/gm, '');
              finalDescription += `${cleanedDesc.trim()}\n\n`;
            }
          }
        }
      }
      
      const issue = await LinearIntegrationService.createIssue(token, {
        title,
        description: finalDescription.trim(),
        teamId,
        projectId,
        assigneeId,
        priority,
        labelIds
      });

      // Link existing bug attachments to the new Linear issue
      if (bugIds && Array.isArray(bugIds) && bugIds.length > 0) {
        const attRes = await pool.query(
          `SELECT file_name, file_url FROM bug_attachments WHERE bug_id = ANY($1)`, 
          [bugIds]
        );
        
        for (const row of attRes.rows) {
          if (row.file_url && !row.file_url.startsWith('data:')) {
            try {
              await LinearIntegrationService.createAttachment(token, issue.id, row.file_name || 'Attachment', row.file_url);
            } catch (err) {
              console.error(`Failed to link bug attachment ${row.file_name} to issue ${issue.id}:`, err);
            }
          }
        }
      }
      
      // Update bugs with the Linear issue reference
      if (bugIds && Array.isArray(bugIds) && bugIds.length > 0) {
        const updateQuery = `
          UPDATE bugs 
          SET linear_issue_id = $1, linear_issue_url = $2, linear_issue_identifier = $3, status = 'completed', updated_at = NOW()
          WHERE id = ANY($4) AND tenant_id = $5
        `;
        await pool.query(updateQuery, [issue.id, issue.url, issue.identifier, bugIds, req.tenantId]);
      }
      
      res.json({ success: true, data: issue });
    } catch (error: any) {
      console.error('Error creating Linear issue:', error);
      res.status(500).json({ success: false, error: error.message || 'Failed to create Linear issue' });
    }
  };
}
