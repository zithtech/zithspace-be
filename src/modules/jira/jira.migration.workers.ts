import { Worker, Job } from 'bullmq';
import { JIRA_QUEUES, jiraBullMQService } from './jira.bullmq.service';
import { PrismaClient } from '@prisma/client';
import { JiraApiService } from './jira.api.service';
import { JiraOAuthService } from './jira.oauth.service';

const prisma = new PrismaClient();
const jiraApiService = new JiraApiService();
const jiraOAuthService = new JiraOAuthService();

const connection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
};

export class JiraMigrationWorkers {
  private initWorker: Worker;
  private fetchWorker: Worker;
  private processWorker: Worker;
  private attachmentsWorker: Worker;

  constructor() {
    this.initWorker = new Worker(JIRA_QUEUES.INIT, this.processInitJob, { connection, concurrency: 1 });
    this.fetchWorker = new Worker(JIRA_QUEUES.FETCH_ISSUES, this.processFetchJob, { connection, concurrency: parseInt(process.env.JIRA_FETCH_CONCURRENCY || '10', 10) });
    this.processWorker = new Worker(JIRA_QUEUES.PROCESS_ISSUE, this.processIssueJob, { connection, concurrency: 1 });
    this.attachmentsWorker = new Worker(JIRA_QUEUES.ATTACHMENTS, this.processAttachmentJob, { connection, concurrency: parseInt(process.env.JIRA_ATTACHMENT_CONCURRENCY || '5', 10) });
    
    this.attachEventListeners();
  }

  private attachEventListeners() {
    this.initWorker.on('failed', (job, err) => console.error(`[INIT] Job ${job?.id} failed:`, err));
    this.fetchWorker.on('failed', (job, err) => console.error(`[FETCH] Job ${job?.id} failed:`, err));
    this.processWorker.on('failed', (job, err) => console.error(`[PROCESS] Job ${job?.id} failed:`, err));
    this.attachmentsWorker.on('failed', (job, err) => console.error(`[ATTACH] Job ${job?.id} failed:`, err));
  }

  private async processInitJob(job: Job) {
    const { migrationId, tenantId, integrationId, projectKeys, jql, statusMapping, userMapping, migratedBy } = job.data;
    console.log(`[migration=${migrationId}] Init job started`);
    
    const { accessToken, cloudId } = await jiraOAuthService.getAccessToken(integrationId);
    
    // 1. Fetch all Jira Projects and create missing ones
    let jiraProjects = await jiraApiService.getProjects(accessToken, cloudId);
    if (projectKeys && projectKeys.length > 0) {
      jiraProjects = jiraProjects.filter((p: any) => projectKeys.includes(p.key));
    }

    for (const jp of jiraProjects) {
      // 1. Check if the project exists in Zukvo (even if soft-deleted)
      const existingProject = await prisma.$queryRaw<Array<{ id: string, status: string }>>`
        SELECT id, status FROM "projects" WHERE "code" = ${jp.key} AND "tenant_id" = ${tenantId}
      `;

      let projectId: string;
      const crypto = require('crypto');

      if (existingProject.length > 0) {
        projectId = existingProject[0].id;
        // If it was soft-deleted, reactivate it so the user can see it again
        if (existingProject[0].status === 'DELETED' || existingProject[0].status === 'deleted') {
          await prisma.$executeRaw`
            UPDATE "projects" SET "status" = 'active' WHERE "id" = ${projectId}
          `;
          console.log(`[migration=${migrationId}] Reactivated soft-deleted Zukvo Project ${jp.key}`);
        }
      } else {
        // Create new Zukvo Project
        projectId = crypto.randomUUID();
        await prisma.$queryRaw<Array<{ id: string }>>`
          INSERT INTO "projects" (
            "id", "tenant_id", "name", "code", "description", "status", "start_date", "project_manager_id", "created_by_id", "workflow_template", "updated_at"
          ) VALUES (
            ${projectId}, ${tenantId}, ${jp.name}, ${jp.key}, COALESCE(${jp.description}, ''), 'active', CURRENT_TIMESTAMP, ${migratedBy}, ${migratedBy}, ARRAY[]::text[], CURRENT_TIMESTAMP
          ) RETURNING id
        `;

        await prisma.$executeRaw`
          INSERT INTO "project_members" ("id", "project_id", "user_id", "role", "joined_at")
          VALUES (${crypto.randomUUID()}, ${projectId}, ${migratedBy}, 'admin', CURRENT_TIMESTAMP)
        `;
        console.log(`[migration=${migrationId}] Auto-created Zukvo Project ${jp.key}`);
      }

      // 2. Ensure mapping is fresh
      await prisma.$executeRaw`
        DELETE FROM "jira_entity_mappings"
        WHERE "jira_integration_id" = ${integrationId}::uuid 
          AND "entity_type" = 'PROJECT' 
          AND "jira_id" = ${jp.key}
      `;
      
      await prisma.$executeRaw`
        INSERT INTO "jira_entity_mappings" ("tenant_id", "jira_integration_id", "entity_type", "jira_id", "zukvo_id")
        VALUES (${tenantId}::uuid, ${integrationId}::uuid, 'PROJECT', ${jp.key}, ${projectId}::uuid)
      `;
    }

    // 2. Fetch total issues using search (maxResults=1 to avoid Jira API v3 error)
    const searchRes = await jiraApiService.searchIssues(accessToken, cloudId, jql || "", undefined, 1);
    const totalIssues = searchRes.total || 0;
    
    await prisma.$executeRaw`
      UPDATE "jira_migrations" 
      SET "total_issues" = ${totalIssues}, "started_at" = CURRENT_TIMESTAMP, "status" = 'RUNNING'
      WHERE "id" = ${migrationId}::uuid
    `;

    // 3. Enqueue first fetch job
    const BATCH_SIZE = parseInt(process.env.JIRA_BATCH_SIZE || '100', 10);
    
    await jiraBullMQService.fetchIssuesQueue.add('fetch', {
      migrationId,
      tenantId,
      integrationId,
      jql,
      statusMapping,
      userMapping,
      migratedBy,
      nextPageToken: undefined,
      maxResults: BATCH_SIZE
    }, { attempts: 3, backoff: { type: 'exponential', delay: 2000 } });
  }

  private async processFetchJob(job: Job) {
    const { migrationId, nextPageToken, maxResults = 50, statusMapping, userMapping, tenantId, integrationId, migratedBy, jql } = job.data;
    
    const { accessToken, cloudId } = await jiraOAuthService.getAccessToken(integrationId);
    
    const searchRes = await jiraApiService.searchIssues(accessToken, cloudId, jql || "", nextPageToken, maxResults);
    const issues = searchRes.issues || [];
    const total = searchRes.total || 0;

    for (const issue of issues) {
      await jiraBullMQService.processIssueQueue.add('process', {
        migrationId,
        tenantId,
        integrationId,
        statusMapping,
        userMapping,
        migratedBy,
        issue
      }, { attempts: 5, backoff: { type: 'exponential', delay: 2000 } });
    }

    if (issues.length > 0) {
      await prisma.$executeRaw`
        UPDATE "jira_migrations"
        SET "total_issues" = "total_issues" + ${issues.length}
        WHERE "id" = ${migrationId}::uuid
      `;
    }

    if (searchRes.nextPageToken) {
      await jiraBullMQService.fetchIssuesQueue.add('fetch', {
        migrationId,
        tenantId,
        integrationId,
        jql,
        statusMapping,
        userMapping,
        migratedBy,
        nextPageToken: searchRes.nextPageToken,
        maxResults
      }, { attempts: 3, backoff: { type: 'exponential', delay: 2000 } });
    } else {
      // Done fetching! Enqueue a finish job to mark it completed once all issues are processed
      await jiraBullMQService.processIssueQueue.add('finish', {
        migrationId,
        isFinishJob: true
      }, { attempts: 5 });
    }
  }

  private async processIssueJob(job: Job) {
    if (job.data.isFinishJob) {
      await prisma.$executeRaw`
        UPDATE "jira_migrations"
        SET "status" = 'COMPLETED', "completed_at" = CURRENT_TIMESTAMP
        WHERE "id" = ${job.data.migrationId}::uuid
      `;
      console.log(`[migration=${job.data.migrationId}] Migration completed successfully!`);
      return;
    }

    const { migrationId, issue, statusMapping, userMapping, tenantId, integrationId, migratedBy } = job.data;
    const jiraIssueId = issue.key; // e.g. PROJ-123
    
    // Idempotency check
    const existing = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM "jira_migration_issues" WHERE "migration_id" = ${migrationId}::uuid AND "jira_issue_id" = ${jiraIssueId}
    `;
    
    if (existing.length > 0) {
      console.log(`[migration=${migrationId}] Skipping issue ${jiraIssueId} (already exists)`);
      return;
    }
    
    const projectKey = jiraIssueId.split('-')[0];

    // Resolve Zukvo Project ID
    const projectMapping = await prisma.$queryRaw<Array<{ zukvo_id: string }>>`
      SELECT zukvo_id FROM "jira_entity_mappings" 
      WHERE "jira_integration_id" = ${integrationId}::uuid AND "entity_type" = 'PROJECT' AND "jira_id" = ${projectKey}
    `;
    if (projectMapping.length === 0) {
      throw new Error(`Project mapping not found for ${projectKey}`);
    }
    const zukvoProjectId = projectMapping[0].zukvo_id;

    // Resolve Sprints
    let sprintPlanId = null;
    const fields = issue.fields || {};
    
    // Search customfields for Sprint
    let sprintObj: any = null;
    for (const key of Object.keys(fields)) {
      if (key.startsWith('customfield_') && Array.isArray(fields[key])) {
        const potentialSprint = fields[key].find((item: any) => item && item.id && item.name && item.state);
        if (potentialSprint) {
          sprintObj = potentialSprint;
          break;
        }
      }
    }

    if (sprintObj) {
      const sprintMapping = await prisma.$queryRaw<Array<{ zukvo_id: string }>>`
        SELECT m.zukvo_id 
        FROM "jira_entity_mappings" m
        JOIN "release_plans" r ON r.id = m.zukvo_id::text
        WHERE m."jira_integration_id" = ${integrationId}::uuid 
          AND m."entity_type" = 'SPRINT' 
          AND m."jira_id" = ${String(sprintObj.id)}
      `;

      if (sprintMapping.length > 0) {
        sprintPlanId = sprintMapping[0].zukvo_id;
      } else {
        // Clean up broken sprint mappings
        await prisma.$executeRaw`
          DELETE FROM "jira_entity_mappings"
          WHERE "jira_integration_id" = ${integrationId}::uuid 
            AND "entity_type" = 'SPRINT' 
            AND "jira_id" = ${String(sprintObj.id)}
        `;
        // Auto-create Zukvo Sprint (ReleasePlan)
        const sprintId = crypto.randomUUID();
        const startDate = sprintObj.startDate ? new Date(sprintObj.startDate) : new Date();
        const endDate = sprintObj.endDate ? new Date(sprintObj.endDate) : new Date(startDate.getTime() + 14 * 24 * 60 * 60 * 1000); // default to 2 weeks later

        const newSprint = await prisma.$queryRaw<Array<{ id: string }>>`
          INSERT INTO "release_plans" (
            "id", "tenant_id", "project_id", "version", "description", "status", "type", "created_by_id", "start_date", "end_date", "updated_at"
          ) VALUES (
            ${sprintId}, ${tenantId}, ${zukvoProjectId}, ${sprintObj.name}, '', ${sprintObj.state === 'active' ? 'active' : 'planning'}, 'sprint_plan', ${migratedBy}, ${startDate}, ${endDate}, CURRENT_TIMESTAMP
          ) RETURNING id
        `;
        sprintPlanId = newSprint[0].id;
        
        await prisma.$executeRaw`
          INSERT INTO "jira_entity_mappings" ("tenant_id", "jira_integration_id", "entity_type", "jira_id", "zukvo_id")
          VALUES (${tenantId}::uuid, ${integrationId}::uuid, 'SPRINT', ${String(sprintObj.id)}, ${sprintPlanId}::uuid)
        `;
      }
    }

    // Map User & Status
    const jiraAssigneeId = fields.assignee?.accountId;
    const assigneeId = (jiraAssigneeId && userMapping[jiraAssigneeId]) ? userMapping[jiraAssigneeId] : null;
    
    const jiraStatusId = fields.status?.id;
    const mappedStatus = (jiraStatusId && statusMapping[jiraStatusId]) ? statusMapping[jiraStatusId] : "not_started"; // Fallback to not_started if not mapped properly but UI forces it

    const title = fields.summary || "Untitled Issue";
    let descriptionText = '';
    if (typeof fields.description === 'string') {
      descriptionText = fields.description;
    } else if (fields.description && fields.description.content) {
      // Basic recursive extractor for Jira ADF
      const extractText = (node: any): string => {
        if (!node) return '';
        if (node.type === 'text') return node.text || '';
        if (node.type === 'paragraph') return (node.content || []).map(extractText).join('') + '\n\n';
        if (node.type === 'bulletList' || node.type === 'orderedList') return (node.content || []).map(extractText).join('') + '\n';
        if (node.type === 'listItem') return '• ' + (node.content || []).map(extractText).join('') + '\n';
        if (node.content) return node.content.map(extractText).join('');
        return '';
      };
      descriptionText = extractText(fields.description).trim();
    }
    
    const description = descriptionText || '';
    
    // Map Dates and Reporter
    const dueDate = fields.duedate ? new Date(fields.duedate) : null;
    const startDate = fields.created ? new Date(fields.created) : null;
    let reportToId = null;
    if (fields.reporter?.accountId && userMapping[fields.reporter.accountId]) {
      reportToId = userMapping[fields.reporter.accountId];
    }

    // Check if issue was already migrated
    const existingTicketMapping = await prisma.$queryRaw<Array<{ zukvo_id: string }>>`
      SELECT m.zukvo_id 
      FROM "jira_entity_mappings" m
      JOIN "tickets" t ON t.id = m.zukvo_id::text
      WHERE m."jira_integration_id" = ${integrationId}::uuid 
        AND m."entity_type" = 'ISSUE' 
        AND m."jira_id" = ${jiraIssueId}
    `;

    let ticketId: string;
    let newTicket: any[] = [];
    const isUpdate = existingTicketMapping.length > 0;

    if (isUpdate) {
      ticketId = existingTicketMapping[0].zukvo_id;
      // Update existing ticket
      newTicket = await prisma.$queryRawUnsafe<Array<{ id: string }>>(`
        UPDATE "tickets" SET
          "sprint_plan_id" = $1,
          "title" = $2,
          "description" = $3,
          "status" = $4,
          "assignee_id" = $5,
          "report_to_id" = $6,
          "start_date" = $7,
          "due_date" = $8,
          "end_date" = $8,
          "updated_at" = CURRENT_TIMESTAMP
        WHERE "id" = $9
        RETURNING id
      `, sprintPlanId || null, title, String(description), mappedStatus, assigneeId || null, reportToId, startDate, dueDate, ticketId);
    } else {
      // Clean up broken mappings (e.g. if the user deleted the ticket from Zukvo)
      await prisma.$executeRaw`
        DELETE FROM "jira_entity_mappings"
        WHERE "jira_integration_id" = ${integrationId}::uuid 
          AND "entity_type" = 'ISSUE' 
          AND "jira_id" = ${jiraIssueId}
      `;

      ticketId = crypto.randomUUID();
      // Generate Zukvo Ticket Number
      const seqResult = await prisma.$queryRaw<{ next_seq: number }[]>`
        SELECT COALESCE(
          MAX((regexp_match(ticket_number, '-(\\d+)$'))[1]::int),
          0
        ) + 1 AS next_seq
        FROM tickets
        WHERE tenant_id = ${tenantId}
          AND ticket_number LIKE ${projectKey + '-%'}
      `;
      const nextTicketNumber = seqResult[0]?.next_seq ?? 1;
      const ticketNumber = `${projectKey}-${String(nextTicketNumber).padStart(4, "0")}`;

      // Insert new ticket
      newTicket = await prisma.$queryRawUnsafe<Array<{ id: string }>>(`
        INSERT INTO "tickets" (
          "id", "tenant_id", "project_id", "sprint_plan_id", "title", "description", "ticket_number",
          "status", "assignee_id", "created_by_id", "report_to_id", "start_date", "due_date", "end_date", "type", "created_at", "updated_at"
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7,
          $8, $9, $10, $11, $12, $13, $13, 'Task', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        ) RETURNING id
      `, ticketId, tenantId, zukvoProjectId, sprintPlanId || null, title, String(description), ticketNumber, mappedStatus, assigneeId || null, migratedBy, reportToId, startDate, dueDate);
      
      // Save mapping to prevent duplicates
      await prisma.$executeRaw`
        INSERT INTO "jira_entity_mappings" ("tenant_id", "jira_integration_id", "entity_type", "jira_id", "zukvo_id")
        VALUES (${tenantId}::uuid, ${integrationId}::uuid, 'ISSUE', ${jiraIssueId}, ${ticketId}::uuid)
      `;
    }
    
    // Record successful processing (useful for migration progress tracking)
    await prisma.$executeRaw`
      INSERT INTO "jira_migration_issues" ("migration_id", "jira_issue_id", "zukvo_ticket_id", "status", "started_at", "completed_at")
      VALUES (${migrationId}::uuid, ${jiraIssueId}, ${newTicket[0].id}::uuid, 'COMPLETED', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT ("migration_id", "jira_issue_id") DO UPDATE SET "status" = 'COMPLETED', "completed_at" = CURRENT_TIMESTAMP
    `;

    // Process Changelog (skip on update to prevent duplicate history)
    if (!isUpdate && issue.changelog && issue.changelog.histories && Array.isArray(issue.changelog.histories)) {
      for (const history of issue.changelog.histories) {
        const historyAuthorId = (history.author?.accountId && userMapping[history.author.accountId]) ? userMapping[history.author.accountId] : migratedBy;
        const historyDate = history.created ? new Date(history.created) : new Date();
        const details: any = { items: history.items || [] };
        
        await prisma.$queryRawUnsafe(`
          INSERT INTO "ticket_activity_log" (
            "id", "tenant_id", "ticket_id", "action", "performed_by_id", "timestamp", "details"
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7::jsonb
          )
        `, crypto.randomUUID(), tenantId, newTicket[0].id, 'Jira Update', historyAuthorId, historyDate, JSON.stringify(details));
      }
    }

    // Process Worklogs (skip on update to prevent duplicates)
    if (!isUpdate && fields.worklog && fields.worklog.worklogs && Array.isArray(fields.worklog.worklogs)) {
      for (const worklog of fields.worklog.worklogs) {
        const worklogAuthorId = (worklog.author?.accountId && userMapping[worklog.author.accountId]) ? userMapping[worklog.author.accountId] : migratedBy;
        const worklogStart = worklog.started ? new Date(worklog.started) : new Date();
        const durationSeconds = worklog.timeSpentSeconds || 0;
        
        await prisma.$executeRaw`
          INSERT INTO "time_tracking_entries" (
            "id", "tenant_id", "user_id", "ticket_id", "description", "billable", "start_time", "end_time", "duration", "status", "created_at", "updated_at"
          ) VALUES (
            ${crypto.randomUUID()}, ${tenantId}, ${worklogAuthorId}, ${newTicket[0].id}, ${typeof worklog.comment === 'string' ? worklog.comment : 'Jira Worklog'}, false, ${worklogStart}, ${new Date(worklogStart.getTime() + durationSeconds * 1000)}, ${durationSeconds}, 'COMPLETED', ${worklogStart}, ${worklogStart}
          )
        `;
      }
    }
    
    // Process Comments (skip on update to prevent duplicate comments)
    if (!isUpdate && fields.comment && fields.comment.comments && Array.isArray(fields.comment.comments)) {
      for (const comment of fields.comment.comments) {
        let commentText = '';
        if (typeof comment.body === 'string') {
          commentText = comment.body;
        } else if (comment.body) {
          const extractText = (node: any): string => {
            if (!node) return '';
            if (node.type === 'text') return node.text || '';
            if (node.type === 'paragraph') return (node.content || []).map(extractText).join('') + '\\n\\n';
            if (node.type === 'bulletList' || node.type === 'orderedList') return (node.content || []).map(extractText).join('') + '\\n';
            if (node.type === 'listItem') return '• ' + (node.content || []).map(extractText).join('') + '\\n';
            if (node.content) return node.content.map(extractText).join('');
            return '';
          };
          commentText = extractText(comment.body).trim();
        }

        const commentAuthorId = (comment.author?.accountId && userMapping[comment.author.accountId]) ? userMapping[comment.author.accountId] : migratedBy;
        const commentDate = comment.created ? new Date(comment.created) : new Date();

        await prisma.$executeRaw`
          INSERT INTO "ticket_comments" (
            "id", "tenant_id", "ticket_id", "user_id", "comment", "attachments", "timestamp", "created_at", "updated_at"
          ) VALUES (
            ${crypto.randomUUID()}, ${tenantId}, ${newTicket[0].id}, ${commentAuthorId}, ${commentText}, '[]', ${commentDate}, ${commentDate}, ${commentDate}
          )
        `;
      }
    }

    // Process Changelog
    if (issue.changelog && issue.changelog.histories && Array.isArray(issue.changelog.histories)) {
      for (const history of issue.changelog.histories) {
        const historyAuthorId = (history.author?.accountId && userMapping[history.author.accountId]) ? userMapping[history.author.accountId] : migratedBy;
        const historyDate = history.created ? new Date(history.created) : new Date();
        const details: any = { items: history.items || [] };
        
        await prisma.$queryRawUnsafe(`
          INSERT INTO "ticket_activity_log" (
            "id", "tenant_id", "ticket_id", "action", "performed_by_id", "timestamp", "details"
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7::jsonb
          )
        `, crypto.randomUUID(), tenantId, newTicket[0].id, 'Jira Update', historyAuthorId, historyDate, JSON.stringify(details));
      }
    }

    // Process Worklogs
    if (fields.worklog && fields.worklog.worklogs && Array.isArray(fields.worklog.worklogs)) {
      for (const worklog of fields.worklog.worklogs) {
        const worklogAuthorId = (worklog.author?.accountId && userMapping[worklog.author.accountId]) ? userMapping[worklog.author.accountId] : migratedBy;
        const worklogStart = worklog.started ? new Date(worklog.started) : new Date();
        const durationSeconds = worklog.timeSpentSeconds || 0;
        
        await prisma.$executeRaw`
          INSERT INTO "time_tracking_entries" (
            "id", "tenant_id", "user_id", "ticket_id", "description", "billable", "start_time", "end_time", "duration", "status", "created_at", "updated_at"
          ) VALUES (
            ${crypto.randomUUID()}, ${tenantId}, ${worklogAuthorId}, ${newTicket[0].id}, ${typeof worklog.comment === 'string' ? worklog.comment : 'Jira Worklog'}, false, ${worklogStart}, ${new Date(worklogStart.getTime() + durationSeconds * 1000)}, ${durationSeconds}, 'COMPLETED', ${worklogStart}, ${worklogStart}
          )
        `;
      }
    }
    
    // Pass ticketId to the attachment jobs that were just added
    if (!isUpdate && fields.attachment && fields.attachment.length > 0) {
      // It's safer to queue them here once the ticket is definitely created
      for (const att of fields.attachment) {
        jiraBullMQService.attachmentsQueue.add('attachment', {
          tenantId,
          integrationId,
          ticketId: newTicket[0].id,
          attachment: att,
          migratedBy
        });
      }
    }
    
    // Update progress
    await prisma.$executeRaw`
      UPDATE "jira_migrations" 
      SET "processed_issues" = "processed_issues" + 1, "successful_issues" = "successful_issues" + 1
      WHERE "id" = ${migrationId}::uuid
    `;
  }

  private async processAttachmentJob(job: Job) {
    const { tenantId, integrationId, ticketId, attachment, migratedBy } = job.data;
    
    try {
      const { accessToken } = await jiraOAuthService.getAccessToken(integrationId);
      
      // Download attachment buffer
      const { buffer, mimeType } = await jiraApiService.downloadAttachment(accessToken, attachment.content);
      
      // Convert buffer to base64 Data URI
      const cleanMimeType = mimeType ? String(mimeType).split(';')[0].trim() : 'application/octet-stream';
      const base64Data = Buffer.from(buffer).toString('base64');
      const dataUri = `data:${cleanMimeType};base64,${base64Data}`;
      
      // Upload to R2
      const { uploadFileToR2 } = require('../../utils/r2Client');
      const { fileUrl, fileSize, fileType } = await uploadFileToR2(
        dataUri,
        attachment.filename,
        tenantId,
        ticketId
      );
      
      // Insert into ticket_attachments table
      const crypto = require('crypto');
      await prisma.$executeRaw`
        INSERT INTO "ticket_attachments" (
          "id", "tenant_id", "ticket_id", "file_name", "file_size", "file_type", "file_url", "uploaded_by_id", "uploaded_at", "created_at", "updated_at"
        ) VALUES (
          ${crypto.randomUUID()}, ${tenantId}, ${ticketId}, ${attachment.filename}, ${fileSize}, ${fileType}, ${fileUrl}, ${migratedBy}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        )
      `;
      console.log(`[ticket=${ticketId}] Uploaded attachment ${attachment.filename}`);
    } catch (error: any) {
      console.error(`Failed to process attachment ${attachment.filename} for ticket ${ticketId}:`, error.message);
    }
  }

  public async close() {
    await this.initWorker.close();
    await this.fetchWorker.close();
    await this.processWorker.close();
    await this.attachmentsWorker.close();
  }
}
