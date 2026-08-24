import { Request, Response } from "express";
import { JiraOAuthService } from "./jira.oauth.service";
import { JiraMigrationService } from "./jira.migration.service";
import { JiraApiService } from "./jira.api.service";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const oauthService = new JiraOAuthService();
const migrationService = new JiraMigrationService();

function getAbsoluteReturnUrl(inputUrl: string | undefined, frontendUrl: string, subdomain?: string): string {
    let target = inputUrl || "/integrations";
    if (target.startsWith("http://") || target.startsWith("https://")) {
        return target;
    }
    try {
        const urlObj = new URL(frontendUrl);
        if (subdomain) {
            let host = urlObj.hostname;
            if (host.startsWith('www.')) {
                host = host.slice(4);
            }
            if (host === "localhost" || host === "127.0.0.1") {
                urlObj.hostname = `${subdomain}.localhost`;
            } else {
                if (host.startsWith(`${subdomain}.`)) {
                    urlObj.hostname = host;
                } else {
                    const parts = host.split('.');
                    if (parts.length >= 3) {
                        const rootDomain = parts.slice(1).join('.');
                        urlObj.hostname = `${subdomain}.${rootDomain}`;
                    } else {
                        urlObj.hostname = `${subdomain}.${host}`;
                    }
                }
            }
        }
        const path = target.startsWith("/") ? target : `/${target}`;
        urlObj.pathname = path;
        return urlObj.toString();
    } catch {
        return `${frontendUrl}/integrations`;
    }
}

export class JiraController {
  public async connect(req: Request, res: Response) {
    try {
      const tenantId = (req as any).user?.tenantId || (req as any).tenant?.id;
      const userId = (req as any).user?.id;
      const subdomain = (req as any).tenant?.subdomain;

      if (!tenantId) return res.status(401).json({ error: "Unauthorized: Tenant ID missing" });
      if (!userId) return res.status(401).json({ error: "Unauthorized: User ID missing" });

      const returnUrl = req.query.returnUrl as string;
      const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
      const targetReturnUrl = getAbsoluteReturnUrl(returnUrl, frontendUrl, subdomain);

      const url = oauthService.getAuthorizationUrl(tenantId, userId, targetReturnUrl);
      res.json({ success: true, data: { url } });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  public async callback(req: Request, res: Response) {
    try {
      const code = req.query.code as string;
      const stateStr = req.query.state as string;
      const state = JSON.parse(decodeURIComponent(stateStr));
      const tenantId = state.tenantId;
      const userId = state.userId;
      const returnUrl = state.returnUrl;

      await oauthService.exchangeCodeForToken(code, tenantId, userId);
      
      // Redirect back to frontend integration page
      let redirectUrl = process.env.FRONTEND_URL ? `${process.env.FRONTEND_URL}/integrations` : "http://localhost:3000/integrations";
      
      if (returnUrl) {
        try {
          const urlObj = new URL(returnUrl);
          urlObj.searchParams.set("connected", "true");
          urlObj.searchParams.set("provider", "jira");
          redirectUrl = urlObj.toString();
        } catch {
          const connector = returnUrl.includes("?") ? "&" : "?";
          redirectUrl = `${returnUrl}${connector}connected=true&provider=jira`;
        }
      }
      
      res.redirect(redirectUrl);
    } catch (error: any) {
      console.error("Jira callback error:", error);
      res.status(500).json({ error: error.message });
    }
  }

  public async getStatus(req: Request, res: Response) {
    try {
      const tenantId = (req as any).user?.tenantId || (req as any).tenant?.id;
      const userId = (req as any).user?.id;

      if (!tenantId || !userId) {
        return res.json({ success: true, data: { connected: false } });
      }

      const integration = await prisma.$queryRaw<Array<{ status: string }>>`
        SELECT "status" FROM "jira_integrations"
        WHERE "tenant_id" = ${tenantId}::uuid AND "user_id" = ${userId}::uuid
        LIMIT 1;
      `;

      if (integration.length > 0 && integration[0].status === 'CONNECTED') {
        res.json({ success: true, data: { connected: true } });
      } else {
        res.json({ success: true, data: { connected: false } });
      }
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  public async disconnect(req: Request, res: Response) {
    try {
      const tenantId = (req as any).user?.tenantId || (req as any).tenant?.id;
      const userId = (req as any).user?.id;

      if (!tenantId || !userId) {
        return res.status(401).json({ success: false, error: "Unauthorized" });
      }

      await prisma.$executeRaw`
        DELETE FROM "jira_integrations" WHERE "tenant_id" = ${tenantId}::uuid AND "user_id" = ${userId}::uuid;
      `;

      res.json({ success: true, data: { message: "Disconnected" } });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  public async startMigration(req: Request, res: Response) {
    try {
      // @ts-ignore
      const tenantId = (req as any).user?.tenantId || req.tenant?.id;
      const { projectKeys, statusMapping, userMapping } = req.body;
      const jql = req.body.jql || "";

      // Get integration ID
      const integration = await prisma.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "jira_integrations"
        WHERE "tenant_id" = ${tenantId}::uuid AND "user_id" = ${(req as any).user?.id || (req as any).user?.userId || (req as any).tenant?.id}::uuid
        LIMIT 1;
      `;

      if (integration.length === 0) {
        return res.status(400).json({ success: false, error: "Jira is not connected." });
      }

      const integrationId = integration[0].id;
      // @ts-ignore
      const migratedBy = (req as any).user?.id || (req as any).user?.userId;
      
      let expandedStatusMapping = statusMapping || {};
      try {
        const oauthService = new (require('./jira.oauth.service').JiraOAuthService)();
        const { accessToken, cloudId } = await oauthService.getAccessTokenByTenantId(tenantId, (req as any).user?.id);
        const apiService = new (require('./jira.api.service').JiraApiService)();
        const statuses = await apiService.getStatuses(accessToken, cloudId);
        
        expandedStatusMapping = { ...expandedStatusMapping };
        const nameToZukvoStatus: Record<string, string> = {};
        
        if (Array.isArray(statuses)) {
          for (const status of statuses) {
            if (expandedStatusMapping[status.id]) {
              nameToZukvoStatus[status.name] = expandedStatusMapping[status.id];
            }
          }
          for (const status of statuses) {
            if (nameToZukvoStatus[status.name]) {
              expandedStatusMapping[status.id] = nameToZukvoStatus[status.name];
            }
          }
        }
      } catch (err) {
        console.error("Failed to expand status mapping", err);
      }
      
      // Create migration record
      const migration = await prisma.$queryRaw<Array<{ id: string }>>`
        INSERT INTO "jira_migrations" (
          "tenant_id", "integration_id", "status", "configuration"
        ) VALUES (
          ${tenantId}::uuid, ${integrationId}::uuid, 'STARTED', ${JSON.stringify({ projectKeys, jql, statusMapping: expandedStatusMapping, userMapping, migratedBy })}::jsonb
        ) RETURNING "id";
      `;
      
      const migrationId = migration[0].id;

      // Enqueue to BullMQ INIT queue
      const { jiraBullMQService } = require('./jira.bullmq.service');
      await jiraBullMQService.enqueueInitMigration(migrationId, tenantId, integrationId, projectKeys, jql, expandedStatusMapping, userMapping, migratedBy);
      
      res.json({ success: true, data: { migrationId, message: "Migration started" } });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  public async getProjects(req: Request, res: Response) {
    try {
      // @ts-ignore
      const tenantId = (req as any).user?.tenantId || req.tenant?.id;
      
      const oauthService = new (require('./jira.oauth.service').JiraOAuthService)();
      const apiService = new (require('./jira.api.service').JiraApiService)();

      let access_token, cloud_id;
      try {
        const creds = await oauthService.getAccessTokenByTenantId(tenantId, (req as any).user?.id);
        access_token = creds.accessToken;
        cloud_id = creds.cloudId;
      } catch (err: any) {
        console.error("Token fetch error:", err.message, err.response?.data);
        return res.status(400).json({ success: false, error: "Jira is not connected." });
      }

      // If cloud_id was not fetched during OAuth, fetch it now and save it
      if (!cloud_id) {
        const resources = await apiService.getAccessibleResources(access_token);
        if (resources && resources.length > 0) {
          cloud_id = resources[0].id;
          await prisma.$executeRaw`
            UPDATE "jira_integrations" 
            SET "cloud_id" = ${cloud_id}
            WHERE "tenant_id" = ${tenantId}::uuid;
          `;
        } else {
          return res.status(400).json({ success: false, error: "No accessible Jira sites found for this token." });
        }
      }
      
      const projects = await apiService.getProjects(access_token, cloud_id!);

      res.json({ success: true, data: projects });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  public async getMigrationProgress(req: Request, res: Response) {
    try {
      // @ts-ignore
      const tenantId = (req as any).user?.tenantId || req.tenant?.id;
      const { migrationId } = req.params;

      const migration = await prisma.$queryRaw<any[]>`
        SELECT 
          "id", "status", "total_issues", "processed_issues", 
          "successful_issues", "failed_issues", "started_at", "completed_at" 
        FROM "jira_migrations"
        WHERE "id" = ${migrationId}::uuid AND "tenant_id" = ${tenantId}::uuid
        LIMIT 1;
      `;

      if (migration.length === 0) {
        return res.status(404).json({ success: false, error: "Migration not found" });
      }

      const mig = migration[0];
      const remainingIssues = Math.max(0, mig.total_issues - mig.processed_issues);
      const progress = mig.total_issues > 0 ? (mig.processed_issues / mig.total_issues) * 100 : 0;

      res.json({
        success: true,
        data: {
          id: mig.id,
          status: mig.status,
          totalIssues: mig.total_issues,
          processedIssues: mig.processed_issues,
          successfulIssues: mig.successful_issues,
          failedIssues: mig.failed_issues,
          remainingIssues,
          progress: Number(progress.toFixed(2))
        }
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // --- Dynamic Mapping Endpoints ---
  private apiService = new JiraApiService();

  public async getFilters(req: Request, res: Response) {
    try {
      // @ts-ignore
      const tenantId = (req as any).user?.tenantId || req.tenant?.id;
      const oauthService = new (require('./jira.oauth.service').JiraOAuthService)();
      const { accessToken, cloudId } = await oauthService.getAccessTokenByTenantId(tenantId, (req as any).user?.id);
      
      const filters = await this.apiService.getFilters(accessToken, cloudId);
      res.json({ success: true, data: filters });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  public async getStatuses(req: Request, res: Response) {
    try {
      // @ts-ignore
      const tenantId = (req as any).user?.tenantId || req.tenant?.id;
      const oauthService = new (require('./jira.oauth.service').JiraOAuthService)();
      const { accessToken, cloudId } = await oauthService.getAccessTokenByTenantId(tenantId, (req as any).user?.id);
      
      const statuses = await this.apiService.getStatuses(accessToken, cloudId);
      
      const uniqueStatusesMap = new Map();
      if (Array.isArray(statuses)) {
        statuses.forEach((status: any) => {
          if (status.name && !uniqueStatusesMap.has(status.name)) {
            uniqueStatusesMap.set(status.name, status);
          }
        });
      }
      const deduplicatedStatuses = Array.from(uniqueStatusesMap.values());
      
      res.json({ success: true, data: deduplicatedStatuses });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  public async getUsers(req: Request, res: Response) {
    try {
      // @ts-ignore
      const tenantId = (req as any).user?.tenantId || req.tenant?.id;
      const oauthService = new (require('./jira.oauth.service').JiraOAuthService)();
      const { accessToken, cloudId } = await oauthService.getAccessTokenByTenantId(tenantId, (req as any).user?.id);
      
      let users = await this.apiService.getUsers(accessToken, cloudId);
      
      // Filter out Jira apps and system bots (only keep human/customer accounts)
      if (Array.isArray(users)) {
        users = users.filter((u: any) => u.accountType !== 'app');
      }
      
      res.json({ success: true, data: users });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  public async getSprints(req: Request, res: Response) {
    try {
      // @ts-ignore
      const tenantId = (req as any).user?.tenantId || req.tenant?.id;
      const projectKeys = req.body.projectKeys || [];
      
      const oauthService = new (require('./jira.oauth.service').JiraOAuthService)();
      const { accessToken, cloudId } = await oauthService.getAccessTokenByTenantId(tenantId, (req as any).user?.id);
      
      let allSprints: any[] = [];
      const boardIds = new Set<number>();

      for (const projectKey of projectKeys) {
        try {
          const boardRes = await this.apiService.getBoardsByProject(accessToken, cloudId, projectKey);
          if (boardRes && boardRes.values) {
            for (const board of boardRes.values) {
              boardIds.add(board.id);
            }
          }
        } catch (e: any) {
          console.warn(`Could not fetch boards for project ${projectKey}:`, e.response?.data || e.message);
        }
      }

      let debugInfo: any = {
        projectKeys,
        initialBoardIds: Array.from(boardIds),
        fallbackAttempted: false,
        fallbackBoardIds: [],
        errors: []
      };

      const fetchSprintsForBoards = async (bIds: Set<number>) => {
        for (const boardId of bIds) {
          let isLast = false;
          let startAt = 0;
          
          while (!isLast) {
            try {
              const sprintRes = await this.apiService.getSprintsForBoard(accessToken, cloudId, boardId, startAt);
              if (sprintRes && sprintRes.values) {
                allSprints.push(...sprintRes.values);
              }
              if (sprintRes && sprintRes.isLast === false) {
                startAt += sprintRes.maxResults;
              } else {
                isLast = true;
              }
            } catch (e: any) {
              debugInfo.errors.push(`Board ${boardId} sprints error: ${e.message}`);
              isLast = true;
            }
          }
        }
      };

      await fetchSprintsForBoards(boardIds);

      if (allSprints.length === 0) {
        debugInfo.fallbackAttempted = true;
        try {
          const fallbackBoards = await this.apiService.getAllBoards(accessToken, cloudId);
          if (fallbackBoards && fallbackBoards.values) {
            const fallbackBoardIds = new Set<number>();
            for (const board of fallbackBoards.values) {
              if (!boardIds.has(board.id)) {
                fallbackBoardIds.add(board.id);
              }
            }
            debugInfo.fallbackBoardIds = Array.from(fallbackBoardIds);
            await fetchSprintsForBoards(fallbackBoardIds);
          }
        } catch (e: any) {
          console.warn(`Could not fetch fallback boards:`, e.response?.data || e.message);
          debugInfo.errors.push(`Fallback boards error: ${e.message}`);
        }
      }

      const uniqueSprints = Array.from(new Map(allSprints.map(s => [s.id, s])).values());
      console.log(`Fetched ${uniqueSprints.length} sprints total. Debug info:`, JSON.stringify(debugInfo, null, 2));
      res.json({ success: true, data: uniqueSprints, debug: debugInfo });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  public async previewTickets(req: Request, res: Response) {
    try {
      // @ts-ignore
      const tenantId = (req as any).user?.tenantId || req.tenant?.id;
      const { jql, nextPageToken, maxResults = 50 } = req.body;
      const oauthService = new (require('./jira.oauth.service').JiraOAuthService)();
      const { accessToken, cloudId } = await oauthService.getAccessTokenByTenantId(tenantId, (req as any).user?.id);
      
      const issues = await this.apiService.searchIssues(accessToken, cloudId, jql || "", nextPageToken, maxResults);
      
      // Since POST /search/jql uses cursor pagination and doesn't return total, we fetch it explicitly
      if (!issues.total) {
        issues.total = await this.apiService.getTotalIssues(accessToken, cloudId, jql || "");
      }
      
      res.json({ success: true, data: issues });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.response?.data ? JSON.stringify(error.response.data) : error.message });
    }
  }

  public async getZukvoStatuses(req: Request, res: Response) {
    try {
      // @ts-ignore
      const tenantId = (req as any).user?.tenantId || req.tenant?.id;
      
      const statuses = await prisma.$queryRawUnsafe<any[]>(`
        SELECT value as id, label as name
        FROM dropdown_options
        WHERE tenant_id = $1 AND category = 'status' AND is_active = true
        ORDER BY "order" ASC, label ASC
      `, tenantId);

      if (statuses.length > 0) {
        res.json({ success: true, data: statuses });
        return;
      }

      // Default fallback statuses matching SettingsController if none configured in DB
      res.json({ success: true, data: [
        { id: "not_started", name: "Not Started" },
        { id: "in_progress", name: "In Progress" },
        { id: "dev_complete", name: "Dev Complete" },
        { id: "dev_testing", name: "Dev Testing" },
        { id: "in_review", name: "In Review" },
        { id: "live", name: "Live" },
        { id: "live_testing", name: "Live Testing" },
        { id: "completed", name: "Completed" },
        { id: "pause", name: "Pause" }
      ] });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  public async getZukvoUsers(req: Request, res: Response) {
    try {
      // @ts-ignore
      const tenantId = (req as any).user?.tenantId || req.tenant?.id;
      const users = await prisma.$queryRaw<Array<{ id: string, name: string, email: string }>>`
        SELECT "id", "name", "work_email" as email
        FROM "users"
        WHERE "tenant_id" = ${tenantId} AND "is_active" = true::boolean
      `;
      res.json({ success: true, data: users });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

    public async getIssueTypes(req: Request, res: Response) {
    try {
      // @ts-ignore
      const tenantId = req.user?.tenantId || req.tenant?.id;
      const { projectId } = req.query;
      if (!projectId) {
        return res.status(400).json({ success: false, error: "projectId is required" });
      }
      const oauthService = new (require('./jira.oauth.service').JiraOAuthService)();
      const { accessToken, cloudId } = await oauthService.getAccessTokenByTenantId(tenantId);
      
      const issueTypes = await this.apiService.getIssueTypes(accessToken, cloudId, projectId as string);
      res.json({ success: true, data: issueTypes });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  public async createIssue(req: Request, res: Response) {
    try {
      // @ts-ignore
      const tenantId = req.user?.tenantId || req.tenant?.id;
      const { title, description, projectId, issueTypeId, assigneeId, bugIds } = req.body;
      
      if (!title || !projectId || !issueTypeId) {
        return res.status(400).json({ success: false, error: 'Title, Project ID, and Issue Type ID are required' });
      }
      
      const oauthService = new (require('./jira.oauth.service').JiraOAuthService)();
      const { accessToken, cloudId } = await oauthService.getAccessTokenByTenantId(tenantId);
      
      let finalDescription = description || '';

      if (bugIds && Array.isArray(bugIds) && bugIds.length > 0) {
        const bugsRes = await prisma.$queryRawUnsafe<any[]>(
          `SELECT bug_number, title, description FROM bugs WHERE id = ANY($1) AND tenant_id = $2`, 
          bugIds, tenantId
        );
        
        if (bugsRes.length > 0) {
          if (finalDescription) finalDescription += '\n\n';
          finalDescription += '### Linked Bugs:\n';
          for (const bug of bugsRes) {
            finalDescription += `**${bug.bug_number || 'Bug'} - ${bug.title || 'Untitled'}**\n`;
            if (bug.description) {
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

      const adfDescription = {
        type: "doc",
        version: 1,
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: finalDescription || "No description provided."
              }
            ]
          }
        ]
      };

      const payload: any = {
        fields: {
          project: { id: projectId },
          summary: title,
          description: adfDescription,
          issuetype: { id: issueTypeId }
        }
      };

      if (assigneeId) {
        payload.fields.assignee = { id: assigneeId };
      }

      const issue = await this.apiService.createIssue(accessToken, cloudId, payload);
      
      if (bugIds && Array.isArray(bugIds) && bugIds.length > 0) {
        await prisma.$executeRawUnsafe(
          `UPDATE bugs SET jira_issue_id = $1, jira_issue_key = $2, jira_issue_url = $3, status = 'completed', updated_at = NOW() WHERE id = ANY($4) AND tenant_id = $5`,
          issue.id, issue.key, issue.self, bugIds, tenantId
        );

        // Upload attachments
        try {
          const attachmentsRes = await prisma.$queryRawUnsafe<any[]>(
            `SELECT file_name, file_url FROM bug_attachments WHERE bug_id = ANY($1)`, 
            bugIds
          );
          if (attachmentsRes.length > 0) {
            const axios = require('axios');
            for (const att of attachmentsRes) {
               if (!att.file_url) continue;
               try {
                 const fileRes = await axios.get(att.file_url, { responseType: 'stream' });
                 await this.apiService.uploadAttachment(accessToken, cloudId, issue.id, fileRes.data, att.file_name);
               } catch (attErr) {
                 console.error("Failed to upload attachment to Jira", att.file_name, attErr);
               }
            }
          }
        } catch (err) {
          console.error("Failed to process attachments", err);
        }
      }
      
      res.json({ success: true, data: issue });
    } catch (error: any) {
      console.error('Error creating Jira issue:', error?.response?.data || error);
      res.status(500).json({ success: false, error: error.message || 'Failed to create Jira issue', details: error?.response?.data });
    }
  }
}
