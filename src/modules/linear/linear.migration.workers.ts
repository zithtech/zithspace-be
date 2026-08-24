import { Worker, Job } from 'bullmq';
import { LINEAR_QUEUES, linearBullMQService } from './linear.bullmq.service';
import { LinearIntegrationService } from '../../services/LinearIntegrationService';
import { LinearAuthService } from '../../services/LinearAuthService';
import pool from '../../config/dbpool';
import crypto from 'crypto';

const linearAuthService = new LinearAuthService();

const connection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
};

export class LinearMigrationWorkers {
  private initWorker: Worker;
  private fetchWorker: Worker;
  private processWorker: Worker;
  private attachmentsWorker: Worker;

  constructor() {
    this.initWorker = new Worker(LINEAR_QUEUES.INIT, this.processInitJob, { connection, concurrency: 1 });
    this.fetchWorker = new Worker(LINEAR_QUEUES.FETCH_ISSUES, this.processFetchJob, { connection, concurrency: parseInt(process.env.LINEAR_FETCH_CONCURRENCY || '5', 10) });
    this.processWorker = new Worker(LINEAR_QUEUES.PROCESS_ISSUE, this.processIssueJob, { connection, concurrency: 1 });
    this.attachmentsWorker = new Worker(LINEAR_QUEUES.ATTACHMENTS, this.processAttachmentJob, { connection, concurrency: 5 });
    
    this.attachEventListeners();
  }

  private attachEventListeners() {
    this.initWorker.on('failed', (job, err) => console.error(`[INIT] Job ${job?.id} failed:`, err));
    this.fetchWorker.on('failed', (job, err) => console.error(`[FETCH] Job ${job?.id} failed:`, err));
    this.processWorker.on('failed', (job, err) => console.error(`[PROCESS] Job ${job?.id} failed:`, err));
    this.attachmentsWorker.on('failed', (job, err) => console.error(`[ATTACH] Job ${job?.id} failed:`, err));
  }

  private cleanMarkdown = (text: string): string => {
    if (!text) return '';
    let cleaned = text;
    cleaned = cleaned.replace(/!?\[([^\]]*)\]\((https:\/\/uploads\.linear\.app\/[^\)]+)\)/g, '');
    cleaned = cleaned.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)');
    cleaned = cleaned.replace(/(\*\*|__)(.*?)\1/g, '$2');
    cleaned = cleaned.replace(/(\*|_)(.*?)\1/g, '$2');
    cleaned = cleaned.replace(/^#{1,6}\s+/gm, '');
    cleaned = cleaned.replace(/^\s*>\s+/gm, '');
    cleaned = cleaned.replace(/```[\w]*\n([\s\S]*?)```/g, '\n$1\n');
    cleaned = cleaned.replace(/`([^`]+)`/g, '$1');
    return cleaned.trim();
  };

  private processInitJob = async (job: Job) => {
    const { migrationId, tenantId, integrationId, projectIds, teamIds, cycleIds, stateIds, userIds, statusMapping, userMapping, migratedBy } = job.data;
    console.log(`[migration=${migrationId}] Init job started`);

    // Ensure linear_entity_mappings table exists
    await pool.query(`
      CREATE TABLE IF NOT EXISTS "linear_entity_mappings" (
        "tenant_id" UUID NOT NULL,
        "linear_integration_id" UUID NOT NULL,
        "entity_type" VARCHAR(50) NOT NULL,
        "linear_id" VARCHAR(255) NOT NULL,
        "zukvo_id" UUID NOT NULL,
        PRIMARY KEY ("tenant_id", "linear_integration_id", "entity_type", "linear_id")
      )
    `);

    // Ensure linear_migration_issues tracking table exists
    await pool.query(`
      CREATE TABLE IF NOT EXISTS "linear_migration_issues" (
        "migration_id" UUID NOT NULL,
        "linear_issue_id" VARCHAR(255) NOT NULL,
        "zukvo_ticket_id" UUID NOT NULL,
        "status" VARCHAR(50) NOT NULL,
        "started_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        "completed_at" TIMESTAMP,
        PRIMARY KEY ("migration_id", "linear_issue_id")
      )
    `);

    // We need user id for the token. Let's use migratedBy.
    const token = await linearAuthService.getToken(tenantId, migratedBy);
    if (!token) throw new Error("No linear token found");

    // 1. Fetch Linear Projects
    let linearProjects = await LinearIntegrationService.getProjects(token);
    
    // Filter projects based on selected projects and teams
    if (projectIds && projectIds.length > 0) {
      linearProjects = linearProjects.filter((p: any) => projectIds.includes(p.id));
    }

    if (teamIds && teamIds.length > 0) {
      linearProjects = linearProjects.filter((p: any) => {
        return p.teams.nodes.some((t: any) => teamIds.includes(t.id));
      });
    }

    for (const lp of linearProjects) {
      // Create or get Zukvo project for Linear Project
      let zukvoProjectId: string;
      const existingProjectMapping = await pool.query(`
        SELECT l.zukvo_id FROM linear_entity_mappings l
        JOIN projects p ON l.zukvo_id::text = p.id
        WHERE l.tenant_id = $1 AND l.linear_integration_id = $2 AND l.entity_type = 'PROJECT' AND l.linear_id = $3
      `, [tenantId, integrationId, lp.id]);

      if (existingProjectMapping.rows.length > 0) {
        zukvoProjectId = existingProjectMapping.rows[0].zukvo_id;
        
        let projectStatus = 'active';
        const linearState = lp.state?.toLowerCase() || '';
        if (linearState === 'planned' || linearState === 'planning') projectStatus = 'planning';
        else if (linearState === 'paused' || linearState === 'on hold') projectStatus = 'on_hold';
        else if (linearState === 'completed' || linearState === 'done') projectStatus = 'completed';
        else if (linearState === 'canceled') projectStatus = 'completed';

        const projectStart = lp.startDate ? new Date(lp.startDate) : new Date();
        const projectEnd = lp.targetDate ? new Date(lp.targetDate) : new Date();
        
        // Update the project details
        await pool.query(`
          UPDATE projects SET 
            name = $1, 
            description = $2, 
            status = $3, 
            start_date = $4, 
            end_date = $5, 
            updated_at = NOW() 
          WHERE id = $6
        `, [lp.name, this.cleanMarkdown(lp.content || lp.description || ''), projectStatus, projectStart, projectEnd, zukvoProjectId]);
      } else {
        zukvoProjectId = crypto.randomUUID();
        // Generate a 3 letter code and ensure it's unique
        const baseCode = (lp.name.substring(0, 3) || 'LNR').toUpperCase();
        let code = baseCode;
        let counter = 1;
        while (true) {
          const check = await pool.query(`SELECT id FROM projects WHERE code = $1 AND tenant_id = $2`, [code, tenantId]);
          if (check.rows.length === 0) break;
          code = `${baseCode.substring(0, 2)}${counter}`;
          counter++;
        }
        
        const linearLeadId = lp.lead?.id;
        const projectManagerId = (linearLeadId && userMapping[linearLeadId]) ? userMapping[linearLeadId] : migratedBy;

        let projectStatus = 'active';
        const linearState = lp.state?.toLowerCase() || '';
        if (linearState === 'planned' || linearState === 'planning') projectStatus = 'planning';
        else if (linearState === 'paused' || linearState === 'on hold') projectStatus = 'on_hold';
        else if (linearState === 'completed' || linearState === 'done') projectStatus = 'completed';
        else if (linearState === 'canceled') projectStatus = 'completed';

        const projectStart = lp.startDate ? new Date(lp.startDate) : new Date();
        const projectEnd = lp.targetDate ? new Date(lp.targetDate) : new Date();

        await pool.query(`
          INSERT INTO projects (id, tenant_id, code, name, description, status, start_date, end_date, project_manager_id, created_at, updated_at, created_by_id)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW(), $10)
        `, [zukvoProjectId, tenantId, code, lp.name, this.cleanMarkdown(lp.content || lp.description || ''), projectStatus, projectStart, projectEnd, projectManagerId, migratedBy]);

        await pool.query(`
          INSERT INTO linear_entity_mappings (tenant_id, linear_integration_id, entity_type, linear_id, zukvo_id)
          VALUES ($1, $2, 'PROJECT', $3, $4)
          ON CONFLICT (tenant_id, linear_integration_id, entity_type, linear_id)
          DO UPDATE SET zukvo_id = EXCLUDED.zukvo_id
        `, [tenantId, integrationId, lp.id, zukvoProjectId]);
      }

          }

    // Enqueue fetch jobs
    if (projectIds && projectIds.length > 0) {
      for (const projectId of projectIds) {
        await linearBullMQService.fetchIssuesQueue.add('fetch', {
          migrationId, tenantId, integrationId, 
          projectId, teamId: undefined, cycleIds, stateIds, userIds,
          zukvoProjectId: null, statusMapping, userMapping, migratedBy
        });
      }
    }
    
    if (teamIds && teamIds.length > 0) {
      for (const teamId of teamIds) {
        await linearBullMQService.fetchIssuesQueue.add('fetch', {
          migrationId, tenantId, integrationId, 
          projectId: undefined, teamId, cycleIds, stateIds, userIds,
          zukvoProjectId: null, statusMapping, userMapping, migratedBy
        });
      }
    }
  };

  private processFetchJob = async (job: any) => {
    const { migrationId, tenantId, integrationId, projectId, teamId, cycleIds, stateIds, userIds, zukvoProjectId, statusMapping, userMapping, migratedBy, cursor } = job.data;
    
    // Get integration token
    
    const { LinearIntegrationService } = await import('../../services/LinearIntegrationService');
    const { linearBullMQService } = await import('./linear.bullmq.service');
    
    const integrationRes = await pool.query(`SELECT access_token FROM linear_integrations WHERE id = $1 AND tenant_id = $2`, [integrationId, tenantId]);
    if (integrationRes.rows.length === 0) throw new Error("Integration not found");
    const token = integrationRes.rows[0].access_token;

    const issuesData = await LinearIntegrationService.getIssues(token, { projectId, teamId, cycleIds, stateIds, userIds }, cursor);

    // Enqueue insert jobs
    for (const issue of issuesData.nodes) {
      await linearBullMQService.processIssueQueue.add('insert', {
        migrationId, tenantId, integrationId, issue, zukvoProjectId, statusMapping, userMapping, migratedBy
      });
    }

    if (issuesData.pageInfo.hasNextPage) {
      await linearBullMQService.fetchIssuesQueue.add('fetch', {
        migrationId, tenantId, integrationId,
        projectId, teamId, cycleIds, stateIds, userIds, zukvoProjectId,
        statusMapping, userMapping, migratedBy,
        cursor: issuesData.pageInfo.endCursor
      });
    }
  };

  private processIssueJob = async (job: Job) => {
    const { migrationId, tenantId, integrationId, issue, statusMapping, userMapping, migratedBy } = job.data;
    const linearIssueId = issue.id;
    let zukvoProjectId = job.data.zukvoProjectId;
    
    const linearProjectId = issue.project?.id;
    
    if (linearProjectId) {
      // Find the mapped Zukvo Project ID
      const projectMapping = await pool.query(`
        SELECT zukvo_id FROM linear_entity_mappings 
        WHERE tenant_id = $1 AND linear_integration_id = $2 AND entity_type = 'PROJECT' AND linear_id = $3
      `, [tenantId, integrationId, linearProjectId]);
      
      if (projectMapping.rows.length > 0) {
        zukvoProjectId = projectMapping.rows[0].zukvo_id;
      } else {
        zukvoProjectId = null;
      }
    } else {
      zukvoProjectId = null;
    }

    if (!zukvoProjectId) {
      // Fallback flow
      await pool.query(`
        INSERT INTO "linear_migration_issues" (migration_id, linear_issue_id, zukvo_ticket_id, status)
        VALUES ($1, $2, '00000000-0000-0000-0000-000000000000'::uuid, 'FALLBACK_NO_PROJECT')
        ON CONFLICT (migration_id, linear_issue_id) DO UPDATE SET status = 'FALLBACK_NO_PROJECT'
      `, [migrationId, linearIssueId]);
      return; // Skip migrating this issue as normal
    }

    // 1. Map Status & User
    const linearStatusId = issue.state?.id;
    const mappedStatus = (linearStatusId && statusMapping[linearStatusId]) ? statusMapping[linearStatusId] : "not_started";
    
    const linearAssigneeId = issue.assignee?.id;
    const assigneeId = (linearAssigneeId && userMapping[linearAssigneeId]) ? userMapping[linearAssigneeId] : null;

    let reportToId = null;
    if (issue.creator?.id && userMapping[issue.creator.id]) {
      reportToId = userMapping[issue.creator.id];
    }

    // 2. Map Cycle -> Sprint Plan
    let sprintPlanId = null;
    const isBacklogState = issue.state?.type === 'backlog' || issue.state?.name?.toLowerCase() === 'backlog';
    
    if (issue.cycle && !isBacklogState) {
      const cycleId = issue.cycle.id;
      const compositeCycleId = `${cycleId}_${linearProjectId}`;
      const existingCycle = await pool.query(`
        SELECT l.zukvo_id FROM linear_entity_mappings l
        JOIN release_plans r ON l.zukvo_id::text = r.id
        WHERE l.tenant_id = $1 AND l.linear_integration_id = $2 AND l.entity_type = 'SPRINT' AND l.linear_id = $3
      `, [tenantId, integrationId, compositeCycleId]);

      if (existingCycle.rows.length > 0) {
        sprintPlanId = existingCycle.rows[0].zukvo_id;
      } else {
        sprintPlanId = crypto.randomUUID();
        const sprintStart = issue.cycle.startsAt ? new Date(issue.cycle.startsAt) : new Date();
        const sprintEnd = issue.cycle.endsAt ? new Date(issue.cycle.endsAt) : new Date();
        const isCompleted = !!issue.cycle.completedAt;
        
        let sprintStatus = 'active';
        if (issue.cycle.completedAt) sprintStatus = 'completed';
        else if (issue.cycle.isFuture || !issue.cycle.isActive) sprintStatus = 'planning';
        
        const sprintRes = await pool.query(`
          INSERT INTO release_plans (id, tenant_id, project_id, version, type, start_date, end_date, status, created_at, updated_at, created_by_id)
          VALUES ($1, $2, $3, $4, 'sprint_plan', $5, $6, $7, NOW(), NOW(), $8)
          ON CONFLICT (tenant_id, project_id, version) 
          DO UPDATE SET start_date = EXCLUDED.start_date, end_date = EXCLUDED.end_date, status = EXCLUDED.status, updated_at = NOW()
          RETURNING id
        `, [sprintPlanId, tenantId, zukvoProjectId, issue.cycle.name, sprintStart, sprintEnd, sprintStatus, migratedBy]);
        
        sprintPlanId = sprintRes.rows[0].id;

        await pool.query(`
          INSERT INTO linear_entity_mappings (tenant_id, linear_integration_id, entity_type, linear_id, zukvo_id)
          VALUES ($1, $2, 'SPRINT', $3, $4)
          ON CONFLICT (tenant_id, linear_integration_id, entity_type, linear_id)
          DO UPDATE SET zukvo_id = EXCLUDED.zukvo_id
        `, [tenantId, integrationId, compositeCycleId, sprintPlanId]);
      }
    }

    const existingTicket = await pool.query(`
      SELECT l.zukvo_id FROM linear_entity_mappings l
      JOIN tickets t ON l.zukvo_id::text = t.id
      WHERE l.tenant_id = $1 AND l.linear_integration_id = $2 AND l.entity_type = 'ISSUE' AND l.linear_id = $3
    `, [tenantId, integrationId, linearIssueId]);

    const isUpdate = existingTicket.rows.length > 0;
    let ticketId: string;

    const startDate = issue.createdAt ? new Date(issue.createdAt) : null;
    const dueDate = issue.dueDate ? new Date(issue.dueDate) : null;

    let priority = 'Medium (P2)';
    if (issue.priority === 1) priority = 'Highest (P0)';
    else if (issue.priority === 2) priority = 'High (P1)';
    else if (issue.priority === 3) priority = 'Medium (P2)';
    else if (issue.priority === 4) priority = 'Low (P3)';

    if (isUpdate) {
      ticketId = existingTicket.rows[0].zukvo_id;
      await pool.query(`
        UPDATE tickets SET
          sprint_plan_id = $1,
          title = $2,
          description = $3,
          status = $4,
          assignee_id = $5,
          report_to_id = $6,
          start_date = $7,
          due_date = $8,
          end_date = $8,
          priority = $9,
          updated_at = NOW()
        WHERE id = $10
      `, [sprintPlanId, issue.title, this.cleanMarkdown(issue.description || ''), mappedStatus, assigneeId, reportToId, startDate, dueDate, priority, ticketId]);
    } else {
      ticketId = crypto.randomUUID();
      
      // Get next ticket number
      const projRes = await pool.query(`SELECT code FROM projects WHERE id = $1`, [zukvoProjectId]);
      const projectKey = projRes.rows[0]?.code || 'LNR';
      
      const seqResult = await pool.query(`
        SELECT COALESCE(MAX(CAST(SUBSTRING(ticket_number FROM '[0-9]+$') AS INTEGER)), 0) + 1 as next_seq
        FROM tickets
        WHERE tenant_id = $1 AND ticket_number LIKE $2
      `, [tenantId, projectKey + '-%']);
      
      const nextTicketNumber = seqResult.rows[0]?.next_seq ?? 1;
      const ticketNumber = `${projectKey}-${String(nextTicketNumber).padStart(4, "0")}`;

      await pool.query(`
        INSERT INTO tickets (
          id, tenant_id, project_id, sprint_plan_id, title, description, ticket_number,
          status, assignee_id, created_by_id, report_to_id, start_date, due_date, end_date, priority, type, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $13, $14, 'Task', NOW(), NOW()
        )
      `, [ticketId, tenantId, zukvoProjectId, sprintPlanId, issue.title, this.cleanMarkdown(issue.description || ''), ticketNumber, mappedStatus, assigneeId, migratedBy, reportToId, startDate, dueDate, priority]);

      await pool.query(`
        INSERT INTO linear_entity_mappings (tenant_id, linear_integration_id, entity_type, linear_id, zukvo_id)
        VALUES ($1, $2, 'ISSUE', $3, $4)
        ON CONFLICT (tenant_id, linear_integration_id, entity_type, linear_id)
        DO UPDATE SET zukvo_id = EXCLUDED.zukvo_id
      `, [tenantId, integrationId, linearIssueId, ticketId]);
    }

    // Process Attachments (explicit and inline from description/comments)
    const attachmentsToProcess: any[] = [];
    
    // Process Comments
    if (!isUpdate && issue.comments?.nodes && issue.comments.nodes.length > 0) {
      for (const comment of issue.comments.nodes) {
        const commentAuthorId = (comment.user?.id && userMapping[comment.user.id]) ? userMapping[comment.user.id] : migratedBy;
        const commentDate = comment.createdAt ? new Date(comment.createdAt) : new Date();
        const crypto = require('crypto');
        await pool.query(`
          INSERT INTO ticket_comments (
            id, tenant_id, ticket_id, user_id, comment, attachments, timestamp, created_at, updated_at
          ) VALUES (
            $1, $2, $3, $4, $5, '[]', $6, $6, $6
          )
        `, [crypto.randomUUID(), tenantId, ticketId, commentAuthorId, this.cleanMarkdown(comment.body), commentDate]);
        
        // Extract inline attachments from comment
        if (comment.body) {
          const regex = /!?\[([^\]]*)\]\((https:\/\/uploads\.linear\.app\/[^\)]+)\)/g;
          let match;
          while ((match = regex.exec(comment.body)) !== null) {
            const title = match[1] || 'Inline Attachment';
            const url = match[2];
            if (!attachmentsToProcess.some(a => a.url === url)) {
              attachmentsToProcess.push({ title, url });
            }
          }
        }
      }
    }

    // 1. Explicit attachments
    if (issue.attachments?.nodes && issue.attachments.nodes.length > 0) {
      for (const att of issue.attachments.nodes) {
        attachmentsToProcess.push({
          title: att.title || 'Attachment',
          url: att.url
        });
      }
    }
    
    // 2. Extract inline attachments from description
    if (issue.description) {
      const regex = /!?\[([^\]]*)\]\((https:\/\/uploads\.linear\.app\/[^\)]+)\)/g;
      let match;
      while ((match = regex.exec(issue.description)) !== null) {
        const title = match[1] || 'Inline Attachment';
        const url = match[2];
        if (!attachmentsToProcess.some(a => a.url === url)) {
          attachmentsToProcess.push({ title, url });
        }
      }
    }

    if (!isUpdate && attachmentsToProcess.length > 0) {
      const { linearBullMQService } = await import('./linear.bullmq.service');
      for (const att of attachmentsToProcess) {
        linearBullMQService.attachmentsQueue.add('attachment', {
          tenantId,
          integrationId,
          ticketId,
          attachment: att,
          migratedBy
        });
      }
    }

    // Insert Activity Log
    if (!isUpdate) {
      const crypto = require('crypto');
      await pool.query(`
        INSERT INTO ticket_activity_log (
          id, tenant_id, ticket_id, action, performed_by_id, timestamp, details, created_at
        ) VALUES (
          $1, $2, $3, $4, $5, NOW(), $6, NOW()
        )
      `, [crypto.randomUUID(), tenantId, ticketId, 'created_ticket', migratedBy, JSON.stringify({ note: 'Ticket migrated from Linear' })]);
    }

    // 4. Record progress
    await pool.query(`
      INSERT INTO linear_migration_issues (migration_id, linear_issue_id, zukvo_ticket_id, status, started_at, completed_at)
      VALUES ($1, $2, $3, 'COMPLETED', NOW(), NOW())
      ON CONFLICT (migration_id, linear_issue_id) 
      DO UPDATE SET status = 'COMPLETED', completed_at = NOW()
    `, [migrationId, linearIssueId, ticketId]);
  };

  private processAttachmentJob = async (job: Job) => {
    const { tenantId, ticketId, attachment, migratedBy } = job.data;
    
    try {
      const axios = require('axios');
      
      // Download attachment buffer
      const token = await linearAuthService.getToken(tenantId, migratedBy);
      const response = await axios.get(attachment.url, { 
        responseType: 'arraybuffer',
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      
      // Convert buffer to base64 Data URI
      const mimeType = response.headers['content-type'] || 'application/octet-stream';
      const cleanMimeType = String(mimeType).split(';')[0].trim();
      const buffer = Buffer.from(response.data);
      const base64Data = buffer.toString('base64');
      const dataUri = `data:${cleanMimeType};base64,${base64Data}`;
      
      // Upload to R2
      const { uploadFileToR2 } = require('../../utils/r2Client');
      const { fileUrl, fileSize, fileType } = await uploadFileToR2(
        dataUri,
        attachment.title,
        tenantId,
        ticketId
      );
      
      // Insert into ticket_attachments table
      const crypto = require('crypto');
      await pool.query(`
        INSERT INTO ticket_attachments (
          id, tenant_id, ticket_id, file_name, file_size, file_type, file_url, uploaded_by_id, uploaded_at, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW(), NOW()
        )
      `, [crypto.randomUUID(), tenantId, ticketId, attachment.title, fileSize, fileType, fileUrl, migratedBy]);
      
      console.log(`[ticket=${ticketId}] Uploaded attachment ${attachment.title}`);
    } catch (error: any) {
      console.error(`Failed to process attachment ${attachment.title} for ticket ${ticketId}:`, error.message);
    }
  };

  public async close() {
    await this.initWorker.close();
    await this.fetchWorker.close();
    await this.processWorker.close();
    await this.attachmentsWorker.close();
  }
}

