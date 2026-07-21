import { Response } from "express";
import { randomUUID } from "crypto";
import pool from "@/config/dbpool";
import { AuthRequest } from "@/types";
import {
  uploadBugAttachmentToR2,
  deleteBugAttachmentFromR2,
} from "@/utils/r2Client";
import { BugListAiService } from "@/services/bugListAiService";
import { entitlementService, EntitlementError } from "@/services/EntitlementService";
import { AIPricingEngine } from "@/ai/pricing/AIPricingEngine";
import { AIFeature } from "@/ai/types/AIFeature";
import {
  recordTransaction,
  diffShallow,
  Section,
  Module,
  Page,
  Action,
  EntityType,
} from "@/utils/transactionHistory";

// ============================================================================
// Helpers
// ============================================================================

const ALLOWED_STATUS = new Set([
  "new",
  "converted",
  "ignored",
  "verified",
  "reopened",
  "trash",
  "archived",
]);

const ALLOWED_BUG_STATUS = new Set([
  "not started",
  "pending", 
  "completed",
]);

// Default seeds — used the first time a tenant lists severities/types
const DEFAULT_SEVERITIES: {
  key: string;
  label: string;
  color: string;
  sort: number;
  isDefault: boolean;
}[] = [
  { key: "blocker", label: "Blocker", color: "#ff4d6d", sort: 10, isDefault: false },
  { key: "critical", label: "Critical", color: "#ff5a4e", sort: 20, isDefault: false },
  { key: "major", label: "Major", color: "#f59f3b", sort: 30, isDefault: true },
  { key: "minor", label: "Minor", color: "#e6c84d", sort: 40, isDefault: false },
];
const DEFAULT_BUG_TYPES: {
  key: string;
  label: string;
  sort: number;
  isDefault: boolean;
}[] = [
  { key: "ui", label: "UI", sort: 10, isDefault: false },
  { key: "functional", label: "Functional", sort: 20, isDefault: true },
  { key: "api", label: "API", sort: 30, isDefault: false },
];

async function ensureSeveritySeeded(tenantId: string): Promise<void> {
  const existing = await pool.query(
    `SELECT 1 FROM bug_severity_options WHERE tenant_id = $1 LIMIT 1`,
    [tenantId],
  );
  if (existing.rowCount && existing.rowCount > 0) return;
  for (const s of DEFAULT_SEVERITIES) {
    await pool.query(
      `INSERT INTO bug_severity_options
         (tenant_id, key, label, color, sort_order, is_default, is_system)
       VALUES ($1, $2, $3, $4, $5, $6, true)
       ON CONFLICT (tenant_id, key) DO NOTHING`,
      [tenantId, s.key, s.label, s.color, s.sort, s.isDefault],
    );
  }
}

async function ensureBugTypeSeeded(tenantId: string): Promise<void> {
  const existing = await pool.query(
    `SELECT 1 FROM bug_type_options WHERE tenant_id = $1 LIMIT 1`,
    [tenantId],
  );
  if (existing.rowCount && existing.rowCount > 0) return;
  for (const t of DEFAULT_BUG_TYPES) {
    await pool.query(
      `INSERT INTO bug_type_options
         (tenant_id, key, label, sort_order, is_default, is_system)
       VALUES ($1, $2, $3, $4, $5, true)
       ON CONFLICT (tenant_id, key) DO NOTHING`,
      [tenantId, t.key, t.label, t.sort, t.isDefault],
    );
  }
}

async function getValidSeverityKeys(tenantId: string): Promise<Set<string>> {
  await ensureSeveritySeeded(tenantId);
  const r = await pool.query(
    `SELECT key FROM bug_severity_options WHERE tenant_id = $1 AND is_active = true`,
    [tenantId],
  );
  return new Set(r.rows.map((x: any) => x.key));
}

async function getValidBugTypeKeys(tenantId: string): Promise<Set<string>> {
  await ensureBugTypeSeeded(tenantId);
  const r = await pool.query(
    `SELECT key FROM bug_type_options WHERE tenant_id = $1 AND is_active = true`,
    [tenantId],
  );
  return new Set(r.rows.map((x: any) => x.key));
}

function slugify(input: string): string {
  return input
    .toString()
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
}

function bad(res: Response, status: number, error: string) {
  res.status(status).json({ success: false, error });
}

function ensureAuth(req: AuthRequest, res: Response): boolean {
  if (!req.tenantId || !req.user) {
    bad(res, 401, "Tenant context and authentication required");
    return false;
  }
  return true;
}

interface AttachmentInput {
  id?: string;
  fileName: string;
  fileUrl: string; // base64 data URL when isNew, R2 URL otherwise
  fileSize?: number;
  fileType?: string;
  isNew?: boolean;
}

interface ExternalLinkInput {
  id?: string;
  label?: string | null;
  url: string;
}

async function persistAttachments(
  bugId: string,
  tenantId: string,
  folderId: string,
  sheetId: string,
  uploaderId: string,
  attachments: AttachmentInput[] | undefined,
): Promise<void> {
  if (!attachments) return;

  const incoming = attachments;
  const incomingIds = new Set(
    incoming.filter((a) => a.id).map((a) => a.id as string),
  );

  // Fetch existing rows to know what to delete
  const existing = await pool.query(
    `SELECT id, file_url FROM bug_attachments WHERE bug_id = $1`,
    [bugId],
  );
  const toDelete = existing.rows.filter((row: any) => !incomingIds.has(row.id));

  for (const row of toDelete) {
    try {
      await deleteBugAttachmentFromR2(row.file_url, tenantId);
    } catch (err) {
      console.error("R2 delete failed (best-effort):", err);
    }
    await pool.query(`DELETE FROM bug_attachments WHERE id = $1`, [row.id]);
  }

  for (const att of incoming) {
    if (att.isNew && att.fileUrl?.startsWith("data:")) {
      const uploaded = await uploadBugAttachmentToR2(
        att.fileUrl,
        att.fileName,
        tenantId,
        folderId,
        sheetId,
        bugId,
      );
      await pool.query(
        `INSERT INTO bug_attachments
           (bug_id, file_name, file_url, file_size, file_type, uploaded_by_id)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          bugId,
          att.fileName,
          uploaded.fileUrl,
          uploaded.fileSize,
          uploaded.fileType,
          uploaderId,
        ],
      );
    }
    // Existing rows are kept as-is; nothing to update for now.
  }
}

async function persistExternalLinks(
  bugId: string,
  links: ExternalLinkInput[] | undefined,
): Promise<void> {
  if (!links) return;
  await pool.query(`DELETE FROM bug_external_links WHERE bug_id = $1`, [bugId]);
  for (const link of links) {
    if (!link?.url) continue;
    await pool.query(
      `INSERT INTO bug_external_links (bug_id, label, url) VALUES ($1, $2, $3)`,
      [bugId, link.label || null, link.url],
    );
  }
}

async function loadBugWithChildren(
  bugId: string,
  tenantId: string,
): Promise<any | null> {
  const bugRes = await pool.query(
    `SELECT b.*, t.ticket_number AS ticket_number, t.status AS ticket_status,
            u.id AS creator_id, u.name AS creator_name, u.work_email AS creator_email,
            a.id AS assignee_uid, a.name AS assignee_name, a.work_email AS assignee_email, a.avatar_url AS assignee_avatar
       FROM bugs b
       LEFT JOIN tickets t ON t.id = b.ticket_id
       LEFT JOIN users u ON u.id = b.created_by_id
       LEFT JOIN users a ON a.id = COALESCE(b.assignee_id, t.assignee_id)
      WHERE b.id = $1 AND b.tenant_id = $2`,
    [bugId, tenantId],
  );
  if (bugRes.rows.length === 0) return null;
  const row = bugRes.rows[0];

  const [attRes, linkRes] = await Promise.all([
    pool.query(
      `SELECT id, file_name, file_url, file_size, file_type, created_at AS uploaded_at
         FROM bug_attachments WHERE bug_id = $1 ORDER BY created_at ASC`,
      [bugId],
    ),
    pool.query(
      `SELECT id, label, url FROM bug_external_links WHERE bug_id = $1 ORDER BY created_at ASC`,
      [bugId],
    ),
  ]);

  return shapeBug(row, attRes.rows, linkRes.rows);
}

function shapeBug(row: any, attachments: any[], externalLinks: any[]) {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    folderId: row.folder_id,
    sheetId: row.sheet_id,
    bugNumber: row.bug_number,
    title: row.title,
    description: row.description,
    module: row.module,
    bugType: row.bug_type,
    severity: row.severity,
    status: row.status,
    bugStatus: row.bug_status,
    tags: row.tags || [],
    comments: row.comments,
    ticketId: row.ticket_id,
    ticketNumber: row.ticket_number,
    ticketStatus: row.ticket_status,
    assigneeId: row.assignee_id,
    assignee: row.assignee_uid
      ? {
          id: row.assignee_uid,
          name: row.assignee_name,
          workEmail: row.assignee_email,
          avatarUrl: row.assignee_avatar,
        }
      : null,
    createdById: row.created_by_id,
    createdBy: row.creator_id
      ? {
          id: row.creator_id,
          name: row.creator_name,
          workEmail: row.creator_email,
        }
      : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    attachments: attachments.map((a) => ({
      id: a.id,
      fileName: a.file_name,
      fileUrl: a.file_url,
      fileSize: a.file_size ? Number(a.file_size) : undefined,
      fileType: a.file_type,
      uploadedAt: a.uploaded_at,
    })),
    externalLinks: externalLinks.map((l) => ({
      id: l.id,
      label: l.label,
      url: l.url,
    })),
  };
}

// ============================================================================
// Folders
// ============================================================================

export class BugListController {
  static async listFolders(req: AuthRequest, res: Response): Promise<void> {
    if (!ensureAuth(req, res)) return;
    const { projectId } = req.query;
    try {
      let query = `SELECT f.*, 
                (SELECT COUNT(*)::int FROM bug_sheets s WHERE s.folder_id = f.id) AS sheet_count,
                (SELECT COUNT(*)::int FROM bug_sheets s WHERE s.folder_id = f.id AND s.status = 'completed') AS completed_sheet_count,
                (SELECT COUNT(*)::int FROM bugs b WHERE b.folder_id = f.id) AS bug_count
           FROM bug_folders f
          WHERE f.tenant_id = $1 AND f.status NOT IN ('archived', 'trash')`;
      const values: any[] = [req.tenantId];

      if (projectId && projectId !== 'all') {
        query += ` AND f.project_id = $2`;
        values.push(projectId);
      }

      query += ` ORDER BY f.created_at DESC`;

      const result = await pool.query(query, values);
      const data = result.rows.map((row: any) => ({
        id: row.id,
        tenantId: row.tenant_id,
        name: row.name,
        description: row.description,
        projectId: row.project_id,
        clientId: row.client_id,
        color: row.color,
        createdById: row.created_by_id,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        _count: {
          sheets: row.sheet_count,
          completedSheets: row.completed_sheet_count,
          bugs: row.bug_count,
        },
      }));
      res.json({ success: true, data });
    } catch (err: any) {
      console.error("listFolders error:", err);
      bad(res, 500, err.message || "Failed to list folders");
    }
  }

  static async createFolder(req: AuthRequest, res: Response): Promise<void> {
    if (!ensureAuth(req, res)) return;
    const { name, description, projectId, clientId, color } = req.body;
    if (!name || typeof name !== "string") {
      bad(res, 400, "Folder name is required");
      return;
    }
    try {
      const result = await pool.query(
        `INSERT INTO bug_folders
           (tenant_id, name, description, project_id, client_id, color, created_by_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [
          req.tenantId,
          name.trim(),
          description || null,
          projectId || null,
          clientId || null,
          color || null,
          req.user!.id,
        ],
      );
      const row = result.rows[0];
      recordTransaction({
        req,
        section: Section.WORK,
        module: Module.BUG_LIST,
        page: Page.BUG_FOLDER_LIST,
        action: Action.CREATE,
        actionLabel: "Folder created",
        entityType: EntityType.BUG_FOLDER,
        entityId: row.id,
        entityLabel: row.name,
        parentEntityType: row.project_id ? "project" : null,
        parentEntityId: row.project_id ?? null,
        afterData: {
          name: row.name,
          description: row.description,
          projectId: row.project_id,
          clientId: row.client_id,
          color: row.color,
        },
        statusCode: 201,
      });
      res.status(201).json({
        success: true,
        data: {
          id: row.id,
          tenantId: row.tenant_id,
          name: row.name,
          description: row.description,
          projectId: row.project_id,
          clientId: row.client_id,
          color: row.color,
          status: row.status,
          createdById: row.created_by_id,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          _count: { sheets: 0, completedSheets: 0, bugs: 0 },
        },
      });
    } catch (err: any) {
      console.error("createFolder error:", err);
      bad(res, 500, err.message || "Failed to create folder");
    }
  }

  static async updateFolder(req: AuthRequest, res: Response): Promise<void> {
    if (!ensureAuth(req, res)) return;
    const { id } = req.params;
    const { name, description, color } = req.body;
    try {
      const beforeRes = await pool.query(
        `SELECT name, description, color FROM bug_folders WHERE id = $1 AND tenant_id = $2`,
        [id, req.tenantId],
      );
      const beforeRow = beforeRes.rows[0];
      const result = await pool.query(
        `UPDATE bug_folders
            SET name        = COALESCE($1, name),
                description = COALESCE($2, description),
                color       = COALESCE($3, color)
          WHERE id = $4 AND tenant_id = $5
          RETURNING *`,
        [name ?? null, description ?? null, color ?? null, id, req.tenantId],
      );
      if (result.rows.length === 0) {
        bad(res, 404, "Folder not found");
        return;
      }
      const row = result.rows[0];
      {
        const after = { name: row.name, description: row.description, color: row.color };
        const { changedFields, before, after: afterDiff } = diffShallow(beforeRow ?? {}, after);
        if (changedFields.length > 0) {
          recordTransaction({
            req,
            section: Section.WORK,
            module: Module.BUG_LIST,
            page: Page.BUG_FOLDER_LIST,
            action: Action.UPDATE,
            actionLabel: `Folder updated (${changedFields.join(", ")})`,
            entityType: EntityType.BUG_FOLDER,
            entityId: id,
            entityLabel: row.name,
            beforeData: before,
            afterData: afterDiff,
            changedFields,
            statusCode: 200,
          });
        }
      }
      res.json({
        success: true,
        data: {
          id: row.id,
          tenantId: row.tenant_id,
          name: row.name,
          description: row.description,
          projectId: row.project_id,
          clientId: row.client_id,
          color: row.color,
          createdById: row.created_by_id,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        },
      });
    } catch (err: any) {
      console.error("updateFolder error:", err);
      bad(res, 500, err.message || "Failed to update folder");
    }
  }

  static async deleteFolder(req: AuthRequest, res: Response): Promise<void> {
    if (!ensureAuth(req, res)) return;
    const { id } = req.params;
    try {
      const owned = await pool.query(
        `SELECT id, status FROM bug_folders WHERE id = $1 AND tenant_id = $2`,
        [id, req.tenantId],
      );
      if (owned.rows.length === 0) {
        bad(res, 404, "Folder not found");
        return;
      }
      const currentStatus = owned.rows[0].status;
      const originalStatus = currentStatus === 'trash' ? null : currentStatus;

      const r = await pool.query(
        `UPDATE bug_folders SET status = 'trash', original_status = $1, updated_at = NOW()
          WHERE id = $2 AND tenant_id = $3 RETURNING id`,
        [originalStatus, id, req.tenantId],
      );
      
      if (r.rowCount === 0) {
        bad(res, 404, "Folder not found");
        return;
      }

      // Recursively trash sheets and bugs
      const sheetsRes = await pool.query(
        `UPDATE bug_sheets SET status = 'trash', original_status = status, updated_at = NOW()
          WHERE folder_id = $1 AND tenant_id = $2 AND status != 'trash'`,
        [id, req.tenantId]
      );
      const bugsRes = await pool.query(
        `UPDATE bugs SET status = 'trash', original_status = status, updated_at = NOW()
          WHERE folder_id = $1 AND tenant_id = $2 AND status != 'trash'`,
        [id, req.tenantId]
      );

      recordTransaction({
        req,
        section: Section.WORK,
        module: Module.BUG_LIST,
        page: Page.BUG_FOLDER_LIST,
        action: Action.DELETE,
        actionLabel: "Folder moved to trash",
        entityType: EntityType.BUG_FOLDER,
        entityId: id,
        beforeData: { status: currentStatus },
        afterData: { status: "trash" },
        changedFields: ["status"],
        statusCode: 200,
        metadata: {
          softDelete: true,
          cascadedSheets: sheetsRes.rowCount,
          cascadedBugs: bugsRes.rowCount,
        },
      });

      res.json({ success: true });
    } catch (err: any) {
      console.error("deleteFolder error:", err);
      bad(res, 500, err.message || "Failed to move folder to trash");
    }
  }

  static async archiveFolder(req: AuthRequest, res: Response): Promise<void> {
    if (!ensureAuth(req, res)) return;
    const { id } = req.params;
    try {
      const r = await pool.query(
        `UPDATE bug_folders SET status = 'archived', updated_at = NOW()
          WHERE id = $1 AND tenant_id = $2 RETURNING id, name`,
        [id, req.tenantId],
      );
      if (r.rowCount === 0) {
        bad(res, 404, "Folder not found");
        return;
      }
      recordTransaction({
        req,
        section: Section.WORK,
        module: Module.BUG_LIST,
        page: Page.BUG_FOLDER_LIST,
        action: Action.ARCHIVE,
        actionLabel: "Folder archived",
        entityType: EntityType.BUG_FOLDER,
        entityId: id,
        entityLabel: r.rows[0]?.name ?? null,
        afterData: { status: "archived" },
        changedFields: ["status"],
        statusCode: 200,
      });
      res.json({ success: true });
    } catch (err: any) {
      console.error("archiveFolder error:", err);
      bad(res, 500, err.message || "Failed to archive folder");
    }
  }

  static async listArchivedFolders(req: AuthRequest, res: Response): Promise<void> {
    if (!ensureAuth(req, res)) return;
    try {
      const result = await pool.query(
        `SELECT f.*,
                u.id AS creator_id, u.name AS creator_name, u.work_email AS creator_email, u.avatar_url AS creator_avatar,
                (SELECT COUNT(*)::int FROM bug_sheets s WHERE s.folder_id = f.id) AS sheet_count,
                (SELECT COUNT(*)::int FROM bugs b WHERE b.folder_id = f.id) AS bug_count
           FROM bug_folders f
           LEFT JOIN users u ON u.id = f.created_by_id
          WHERE f.tenant_id = $1 AND f.status = 'archived'
          ORDER BY f.updated_at DESC`,
        [req.tenantId],
      );
      const data = result.rows.map((row: any) => ({
        id: row.id,
        tenantId: row.tenant_id,
        name: row.name,
        description: row.description,
        status: row.status,
        color: row.color,
        createdById: row.created_by_id,
        createdBy: row.creator_id ? {
          id: row.creator_id,
          name: row.creator_name,
          email: row.creator_email,
          avatarUrl: row.creator_avatar,
        } : null,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        _count: { sheets: row.sheet_count, bugs: row.bug_count },
      }));
      res.json({ success: true, data });
    } catch (err: any) {
      console.error("listArchivedFolders error:", err);
      bad(res, 500, err.message || "Failed to list archived folders");
    }
  }

  static async listTrashedFolders(req: AuthRequest, res: Response): Promise<void> {
    if (!ensureAuth(req, res)) return;
    try {
      const result = await pool.query(
        `SELECT f.*,
                u.id AS creator_id, u.name AS creator_name, u.work_email AS creator_email, u.avatar_url AS creator_avatar,
                (SELECT COUNT(*)::int FROM bug_sheets s WHERE s.folder_id = f.id) AS sheet_count,
                (SELECT COUNT(*)::int FROM bugs b WHERE b.folder_id = f.id) AS bug_count
           FROM bug_folders f
           LEFT JOIN users u ON u.id = f.created_by_id
          WHERE f.tenant_id = $1 AND f.status = 'trash'
          ORDER BY f.updated_at DESC`,
        [req.tenantId],
      );
      const data = result.rows.map((row: any) => ({
        id: row.id,
        tenantId: row.tenant_id,
        name: row.name,
        description: row.description,
        status: row.status,
        color: row.color,
        createdById: row.created_by_id,
        createdBy: row.creator_id ? {
          id: row.creator_id,
          name: row.creator_name,
          email: row.creator_email,
          avatarUrl: row.creator_avatar,
        } : null,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        _count: { sheets: row.sheet_count, bugs: row.bug_count },
      }));
      res.json({ success: true, data });
    } catch (err: any) {
      console.error("listTrashedFolders error:", err);
      bad(res, 500, err.message || "Failed to list trashed folders");
    }
  }

  static async restoreFolder(req: AuthRequest, res: Response): Promise<void> {
    if (!ensureAuth(req, res)) return;
    const { id } = req.params;
    try {
      const folderResult = await pool.query(
        `SELECT original_status FROM bug_folders WHERE id = $1 AND tenant_id = $2 AND status IN ('trash', 'archived')`,
        [id, req.tenantId],
      );
      if (folderResult.rows.length === 0) {
        bad(res, 404, "Item not found in trash or archive");
        return;
      }
      const originalStatus = folderResult.rows[0].original_status || 'active';
      await pool.query(
        `UPDATE bug_folders SET status = $1, original_status = NULL, updated_at = NOW()
          WHERE id = $2 AND tenant_id = $3`,
        [originalStatus, id, req.tenantId],
      );

      // Recursively restore sheets and bugs
      const sheetsRes = await pool.query(
        `UPDATE bug_sheets SET status = COALESCE(original_status, 'active'), original_status = NULL, updated_at = NOW()
          WHERE folder_id = $1 AND tenant_id = $2 AND status IN ('trash', 'archived')`,
        [id, req.tenantId]
      );
      const bugsRes = await pool.query(
        `UPDATE bugs SET status = COALESCE(original_status, 'new'), original_status = NULL, updated_at = NOW()
          WHERE folder_id = $1 AND tenant_id = $2 AND status IN ('trash', 'archived')`,
        [id, req.tenantId]
      );

      recordTransaction({
        req,
        section: Section.WORK,
        module: Module.BUG_LIST,
        page: Page.BUG_TRASH,
        action: Action.RESTORE,
        actionLabel: "Folder restored",
        entityType: EntityType.BUG_FOLDER,
        entityId: id,
        afterData: { status: originalStatus },
        changedFields: ["status"],
        statusCode: 200,
        metadata: {
          cascadedSheets: sheetsRes.rowCount,
          cascadedBugs: bugsRes.rowCount,
        },
      });

      res.json({ success: true });
    } catch (err: any) {
      console.error("restoreFolder error:", err);
      bad(res, 500, err.message || "Failed to restore folder");
    }
  }

  static async permanentDeleteFolder(req: AuthRequest, res: Response): Promise<void> {
    if (!ensureAuth(req, res)) return;
    const { id } = req.params;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      
      // Cleanup R2 attachments for all bugs in the folder
      const attachments = await client.query(
        `SELECT a.file_url
           FROM bug_attachments a
           JOIN bugs b ON b.id = a.bug_id
          WHERE b.folder_id = $1 AND b.tenant_id = $2`,
        [id, req.tenantId],
      );
      for (const att of attachments.rows) {
        try {
          await deleteBugAttachmentFromR2(att.file_url, req.tenantId!);
        } catch (e) {
          console.error("R2 cleanup failed:", e);
        }
      }
      
      const r = await client.query(
        `DELETE FROM bug_folders WHERE id = $1 AND tenant_id = $2 AND status = 'trash'`,
        [id, req.tenantId],
      );
      if (r.rowCount === 0) {
        await client.query("ROLLBACK");
        bad(res, 404, "Trashed folder not found");
        return;
      }

      await client.query("COMMIT");
      recordTransaction({
        req,
        section: Section.WORK,
        module: Module.BUG_LIST,
        page: Page.BUG_TRASH,
        action: Action.PERMANENT_DELETE,
        actionLabel: "Folder permanently deleted",
        entityType: EntityType.BUG_FOLDER,
        entityId: id,
        statusCode: 200,
        metadata: { attachmentsCleaned: attachments.rowCount },
      });
      res.json({ success: true });
    } catch (err: any) {
      await client.query("ROLLBACK").catch(() => {});
      console.error("permanentDeleteFolder error:", err);
      bad(res, 500, err.message || "Failed to permanently delete folder");
    } finally {
      client.release();
    }
  }

  // ==========================================================================
  // Sheets
  // ==========================================================================

  static async listSheets(req: AuthRequest, res: Response): Promise<void> {
    if (!ensureAuth(req, res)) return;
    const { folderId } = req.params;
    try {
      // Confirm folder belongs to tenant
      const folder = await pool.query(
        `SELECT id FROM bug_folders WHERE id = $1 AND tenant_id = $2`,
        [folderId, req.tenantId],
      );
      if (folder.rows.length === 0) {
        bad(res, 404, "Folder not found");
        return;
      }
      const result = await pool.query(
        `SELECT s.*,
                (SELECT COUNT(*)::int FROM bugs b WHERE b.sheet_id = s.id) AS bug_count
           FROM bug_sheets s
          WHERE s.folder_id = $1 AND s.tenant_id = $2 AND s.status NOT IN ('archived', 'trash')
          ORDER BY s.created_at ASC`,
        [folderId, req.tenantId],
      );
      const data = result.rows.map((row: any) => ({
        id: row.id,
        folderId: row.folder_id,
        name: row.name,
        description: row.description,
        status: row.status,
        createdById: row.created_by_id,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        _count: { bugs: row.bug_count },
      }));
      res.json({ success: true, data });
    } catch (err: any) {
      console.error("listSheets error:", err);
      bad(res, 500, err.message || "Failed to list sheets");
    }
  }

  static async listProjectSheets(req: AuthRequest, res: Response): Promise<void> {
    if (!ensureAuth(req, res)) return;
    const { projectId } = req.query as { projectId: string };
    if (!projectId) {
      bad(res, 400, "projectId is required");
      return;
    }
    try {
      const r = await pool.query(
        `SELECT s.*, f.name as folder_name 
         FROM bug_sheets s
         INNER JOIN bug_folders f ON s.folder_id = f.id
         WHERE f.project_id = $1 AND f.tenant_id = $2 
           AND s.status NOT IN ('archived', 'trash')
           AND f.status NOT IN ('archived', 'trash')
         ORDER BY f.name ASC, s.name ASC`,
        [projectId, req.tenantId]
      );
      res.json({ 
        success: true, 
        data: r.rows.map(row => ({
          id: row.id,
          folderId: row.folder_id,
          folderName: row.folder_name,
          name: row.name,
          description: row.description,
          status: row.status,
          createdById: row.created_by_id,
          createdAt: row.created_at,
          updatedAt: row.updated_at
        })) 
      });
    } catch (err: any) {
      console.error("listProjectSheets error:", err);
      bad(res, 500, err.message || "Failed to load project sheets");
    }
  }

  static async listArchivedSheets(req: AuthRequest, res: Response): Promise<void> {
    if (!ensureAuth(req, res)) return;
    const { folderId } = req.query;
    try {
      let query = `SELECT s.*,
                f.name as folder_name,
                u.id AS creator_id, u.name AS creator_name, u.work_email AS creator_email, u.avatar_url AS creator_avatar,
                (SELECT COUNT(*)::int FROM bugs b WHERE b.sheet_id = s.id) AS bug_count
           FROM bug_sheets s
           LEFT JOIN bug_folders f ON s.folder_id = f.id
           LEFT JOIN users u ON u.id = s.created_by_id
           WHERE s.tenant_id = $1`;
      const params = [req.tenantId];

      if (folderId) {
        query += ` AND s.folder_id = $2 AND EXISTS (SELECT 1 FROM bug_folders f3 WHERE f3.id = s.folder_id AND f3.status = 'archived') AND s.status != 'trash'`;
        params.push(folderId as string);
      } else {
        query += ` AND s.status = 'archived' AND NOT EXISTS (SELECT 1 FROM bug_folders f2 WHERE f2.id = s.folder_id AND f2.status IN ('archived', 'trash'))`;
      }

      query += ` ORDER BY s.updated_at DESC`;
      const result = await pool.query(query, params);
      const data = result.rows.map((row: any) => ({
        id: row.id,
        folderId: row.folder_id,
        name: row.name,
        description: row.description,
        status: row.status,
        createdById: row.created_by_id,
        createdBy: row.creator_id ? {
          id: row.creator_id,
          name: row.creator_name,
          email: row.creator_email,
          avatarUrl: row.creator_avatar,
        } : null,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        folderName: row.folder_name,
        _count: { bugs: row.bug_count },
      }));
      res.json({ success: true, data });
    } catch (err: any) {
      console.error("listArchivedSheets error:", err);
      bad(res, 500, err.message || "Failed to list archived sheets");
    }
  }

  static async createSheet(req: AuthRequest, res: Response): Promise<void> {
    if (!ensureAuth(req, res)) return;
    const { folderId } = req.params;
    const { name, description } = req.body;
    if (!name || typeof name !== "string") {
      bad(res, 400, "Sheet name is required");
      return;
    }
    try {
      const folder = await pool.query(
        `SELECT id FROM bug_folders WHERE id = $1 AND tenant_id = $2`,
        [folderId, req.tenantId],
      );
      if (folder.rows.length === 0) {
        bad(res, 404, "Folder not found");
        return;
      }
      const result = await pool.query(
        `INSERT INTO bug_sheets (tenant_id, folder_id, name, description, created_by_id)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [req.tenantId, folderId, name.trim(), description || null, req.user!.id],
      );
      const row = result.rows[0];
      recordTransaction({
        req,
        section: Section.WORK,
        module: Module.BUG_LIST,
        page: Page.BUG_SHEET_LIST,
        action: Action.CREATE,
        actionLabel: "Sheet created",
        entityType: EntityType.BUG_SHEET,
        entityId: row.id,
        entityLabel: row.name,
        parentEntityType: EntityType.BUG_FOLDER,
        parentEntityId: folderId,
        afterData: { name: row.name, description: row.description, folderId },
        statusCode: 201,
      });
      res.status(201).json({
        success: true,
        data: {
          id: row.id,
          folderId: row.folder_id,
          name: row.name,
          description: row.description,
          status: row.status,
          createdById: row.created_by_id,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          _count: { bugs: 0 },
        },
      });
    } catch (err: any) {
      console.error("createSheet error:", err);
      bad(res, 500, err.message || "Failed to create sheet");
    }
  }

  static async updateSheet(req: AuthRequest, res: Response): Promise<void> {
    if (!ensureAuth(req, res)) return;
    const { id } = req.params;
    const { name, description, folderId } = req.body;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const beforeRes = await client.query(
        `SELECT name, description, folder_id FROM bug_sheets WHERE id = $1 AND tenant_id = $2`,
        [id, req.tenantId],
      );
      const beforeRow = beforeRes.rows[0];

      // 1. Update the sheet
      const result = await client.query(
        `UPDATE bug_sheets
            SET name        = COALESCE($1, name),
                description = COALESCE($2, description),
                folder_id   = COALESCE($3, folder_id)
          WHERE id = $4 AND tenant_id = $5
          RETURNING *`,
        [name ?? null, description ?? null, folderId ?? null, id, req.tenantId],
      );

      if (result.rows.length === 0) {
        await client.query("ROLLBACK");
        bad(res, 404, "Sheet not found");
        return;
      }

      // 2. If folderId changed, update all bugs in this sheet
      if (folderId) {
        await client.query(
          `UPDATE bugs SET folder_id = $1 WHERE sheet_id = $2 AND tenant_id = $3`,
          [folderId, id, req.tenantId],
        );
      }

      await client.query("COMMIT");

      const row = result.rows[0];
      {
        const after = { name: row.name, description: row.description, folderId: row.folder_id };
        const before = {
          name: beforeRow?.name,
          description: beforeRow?.description,
          folderId: beforeRow?.folder_id,
        };
        const { changedFields, before: b, after: a } = diffShallow(before, after);
        if (changedFields.length > 0) {
          recordTransaction({
            req,
            section: Section.WORK,
            module: Module.BUG_LIST,
            page: Page.BUG_SHEET_LIST,
            action: Action.UPDATE,
            actionLabel: `Sheet updated (${changedFields.join(", ")})`,
            entityType: EntityType.BUG_SHEET,
            entityId: id,
            entityLabel: row.name,
            parentEntityType: EntityType.BUG_FOLDER,
            parentEntityId: row.folder_id,
            beforeData: b,
            afterData: a,
            changedFields,
            statusCode: 200,
          });
        }
      }
      res.json({
        success: true,
        data: {
          id: row.id,
          folderId: row.folder_id,
          name: row.name,
          description: row.description,
          status: row.status,
          createdById: row.created_by_id,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        },
      });
    } catch (err: any) {
      await client.query("ROLLBACK").catch(() => {});
      console.error("updateSheet error:", err);
      bad(res, 500, err.message || "Failed to update sheet");
    } finally {
      client.release();
    }
  }

  static async updateSheetStatus(req: AuthRequest, res: Response): Promise<void> {
    if (!ensureAuth(req, res)) return;
    const { id } = req.params;
    const { status } = req.body;
    if (!status || !["active", "current", "completed", "archived"].includes(status)) {
      bad(res, 400, "status must be one of: active, current, completed, archived");
      return;
    }
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const owned = await client.query(
        `SELECT id, folder_id FROM bug_sheets WHERE id = $1 AND tenant_id = $2`,
        [id, req.tenantId],
      );
      if (owned.rows.length === 0) {
        await client.query("ROLLBACK");
        bad(res, 404, "Sheet not found");
        return;
      }
      const folderId = owned.rows[0].folder_id;
      // 'current' is unique per folder — demote any existing current first.
      if (status === "current") {
        await client.query(
          `UPDATE bug_sheets
              SET status = 'active', updated_at = NOW()
            WHERE folder_id = $1 AND tenant_id = $2 AND status = 'current' AND id <> $3`,
          [folderId, req.tenantId, id],
        );
      }
      const updated = await client.query(
        `UPDATE bug_sheets
            SET status = $1, updated_at = NOW()
          WHERE id = $2 AND tenant_id = $3
          RETURNING *`,
        [status, id, req.tenantId],
      );
      
      // If archiving sheet, also archive all bugs in the sheet
      // If restoring sheet, also restore all archived bugs in the sheet
      if (status === "archived") {
        await client.query(
          `UPDATE bugs
              SET status = 'archived',
                  original_status = COALESCE(original_status, status),
                  updated_at = NOW()
            WHERE sheet_id = $1 AND tenant_id = $2 AND status NOT IN ('archived', 'deleted')`,
          [id, req.tenantId]
        );
      } else if (status === "active" || status === "current" || status === "completed") {
        // When restoring sheet, restore bugs that were archived when sheet was archived
        await client.query(
          `UPDATE bugs
              SET status = COALESCE(original_status, 'new'),
                  original_status = NULL,
                  updated_at = NOW()
            WHERE sheet_id = $1 AND tenant_id = $2 AND status = 'archived'`,
          [id, req.tenantId]
        );
      }
      
      await client.query("COMMIT");
      const row = updated.rows[0];
      recordTransaction({
        req,
        section: Section.WORK,
        module: Module.BUG_LIST,
        page: Page.BUG_SHEET_LIST,
        action: Action.STATUS_CHANGE,
        actionLabel: `Sheet status -> ${status}`,
        entityType: EntityType.BUG_SHEET,
        entityId: id,
        entityLabel: row.name,
        parentEntityType: EntityType.BUG_FOLDER,
        parentEntityId: row.folder_id,
        afterData: { status },
        changedFields: ["status"],
        statusCode: 200,
      });
      res.json({
        success: true,
        data: {
          id: row.id,
          folderId: row.folder_id,
          name: row.name,
          description: row.description,
          status: row.status,
          createdById: row.created_by_id,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        },
      });
    } catch (err: any) {
      await client.query("ROLLBACK").catch(() => {});
      console.error("updateSheetStatus error:", err);
      bad(res, 500, err.message || "Failed to update sheet status");
    } finally {
      client.release();
    }
  }

  static async deleteSheet(req: AuthRequest, res: Response): Promise<void> {
    if (!ensureAuth(req, res)) return;
    const { id } = req.params;
    try {
      // First get current status to preserve it before moving to trash
      const sheetResult = await pool.query(
        `SELECT status FROM bug_sheets WHERE id = $1 AND tenant_id = $2`,
        [id, req.tenantId],
      );
      if (sheetResult.rows.length === 0) {
        bad(res, 404, "Sheet not found");
        return;
      }
      
      const currentStatus = sheetResult.rows[0].status;
      // Only preserve status if it's not already trash
      const originalStatus = currentStatus === 'trash' ? null : currentStatus;
      
      let r;
      try {
        // Try to use trash functionality (if migration has been run)
        r = await pool.query(
          `UPDATE bug_sheets SET status = 'trash', original_status = $1, updated_at = NOW()
            WHERE id = $2 AND tenant_id = $3 RETURNING id`,
          [originalStatus, id, req.tenantId],
        );
      } catch (migrationError: any) {
        // Fallback: use archived status if migration hasn't been run yet
        console.log("Migration not run yet, using archived status as fallback");
        r = await pool.query(
          `UPDATE bug_sheets SET status = 'archived', updated_at = NOW()
            WHERE id = $1 AND tenant_id = $2 RETURNING id`,
          [id, req.tenantId],
        );
      }
      
      if (r.rowCount === 0) {
        bad(res, 404, "Sheet not found");
        return;
      }

      // Recursively trash bugs
      const bugsRes = await pool.query(
        `UPDATE bugs SET status = 'trash', original_status = status, updated_at = NOW()
          WHERE sheet_id = $1 AND tenant_id = $2 AND status != 'trash'`,
        [id, req.tenantId]
      );

      recordTransaction({
        req,
        section: Section.WORK,
        module: Module.BUG_LIST,
        page: Page.BUG_SHEET_LIST,
        action: Action.DELETE,
        actionLabel: "Sheet moved to trash",
        entityType: EntityType.BUG_SHEET,
        entityId: id,
        beforeData: { status: currentStatus },
        afterData: { status: "trash" },
        changedFields: ["status"],
        statusCode: 200,
        metadata: { softDelete: true, cascadedBugs: bugsRes.rowCount },
      });

      res.json({ success: true });
    } catch (err: any) {
      console.error("deleteSheet error:", err);
      bad(res, 500, err.message || "Failed to move sheet to trash");
    }
  }

  static async listTrashedSheets(req: AuthRequest, res: Response): Promise<void> {
    if (!ensureAuth(req, res)) return;
    const { folderId } = req.query;
    try {
      let result;
      try {
        let query = `SELECT s.*,
                  f.name as folder_name,
                  u.id AS creator_id, u.name AS creator_name, u.work_email AS creator_email, u.avatar_url AS creator_avatar,
                  (SELECT COUNT(*)::int FROM bugs b WHERE b.sheet_id = s.id) AS bug_count
             FROM bug_sheets s
             LEFT JOIN bug_folders f ON s.folder_id = f.id
             LEFT JOIN users u ON u.id = s.created_by_id
            WHERE s.tenant_id = $1`;
        const params = [req.tenantId];

        if (folderId) {
          query += ` AND s.folder_id = $2 AND EXISTS (SELECT 1 FROM bug_folders f3 WHERE f3.id = s.folder_id AND f3.status = 'trash')`;
          params.push(folderId as string);
        } else {
          query += ` AND s.status = 'trash' AND NOT EXISTS (SELECT 1 FROM bug_folders f2 WHERE f2.id = s.folder_id AND f2.status = 'trash')`;
        }

        query += ` ORDER BY s.updated_at DESC`;
        result = await pool.query(query, params);
      } catch (migrationError: any) {
        // Fallback: return empty array if migration hasn't been run yet
        console.log("Migration not run yet, no trash functionality available");
        res.json({ success: true, data: [] });
        return;
      }
      
      const data = result.rows.map((row: any) => ({
        id: row.id,
        folderId: row.folder_id,
        name: row.name,
        description: row.description,
        status: row.status,
        originalStatus: row.original_status,
        createdById: row.created_by_id,
        createdBy: row.creator_id ? {
          id: row.creator_id,
          name: row.creator_name,
          email: row.creator_email,
          avatarUrl: row.creator_avatar,
        } : null,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        folderName: row.folder_name,
        _count: { bugs: row.bug_count },
      }));
      res.json({ success: true, data });
    } catch (err: any) {
      console.error("listTrashedSheets error:", err);
      bad(res, 500, err.message || "Failed to list trashed sheets");
    }
  }

  static async restoreSheet(req: AuthRequest, res: Response): Promise<void> {
    if (!ensureAuth(req, res)) return;
    const { id } = req.params;
    try {
      const sheetResult = await pool.query(
        `SELECT original_status FROM bug_sheets WHERE id = $1 AND tenant_id = $2 AND status IN ('trash', 'archived')`,
        [id, req.tenantId],
      );
      if (sheetResult.rows.length === 0) {
        bad(res, 404, "Item not found in trash or archive");
        return;
      }
      
      const originalStatus = sheetResult.rows[0].original_status || 'active';
      
      const r = await pool.query(
        `UPDATE bug_sheets 
           SET status = $1, 
               original_status = NULL, 
               updated_at = NOW()
         WHERE id = $2 AND tenant_id = $3 RETURNING id`,
        [originalStatus, id, req.tenantId],
      );
      if (r.rowCount === 0) {
        bad(res, 404, "Sheet not found");
        return;
      }

      // Recursively restore bugs
      const bugsRes = await pool.query(
        `UPDATE bugs SET status = COALESCE(original_status, 'new'), original_status = NULL, updated_at = NOW()
          WHERE sheet_id = $1 AND tenant_id = $2 AND status IN ('trash', 'archived')`,
        [id, req.tenantId]
      );

      recordTransaction({
        req,
        section: Section.WORK,
        module: Module.BUG_LIST,
        page: Page.BUG_TRASH,
        action: Action.RESTORE,
        actionLabel: "Sheet restored",
        entityType: EntityType.BUG_SHEET,
        entityId: id,
        afterData: { status: originalStatus },
        changedFields: ["status"],
        statusCode: 200,
        metadata: { cascadedBugs: bugsRes.rowCount },
      });

      res.json({ success: true });
    } catch (err: any) {
      console.error("restoreSheet error:", err);
      bad(res, 500, err.message || "Failed to restore sheet");
    }
  }

  static async permanentDeleteSheet(req: AuthRequest, res: Response): Promise<void> {
    if (!ensureAuth(req, res)) return;
    const { id } = req.params;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      
      // Cleanup R2 attachments first
      const attachments = await client.query(
        `SELECT a.file_url
           FROM bug_attachments a
           JOIN bugs b ON b.id = a.bug_id
          WHERE b.sheet_id = $1 AND b.tenant_id = $2`,
        [id, req.tenantId],
      );
      for (const att of attachments.rows) {
        try {
          await deleteBugAttachmentFromR2(att.file_url, req.tenantId!);
        } catch (e) {
          console.error("R2 cleanup failed:", e);
        }
      }
      
      // Delete the sheet and related data (cascade will handle bugs and attachments)
      const r = await client.query(
        `DELETE FROM bug_sheets WHERE id = $1 AND tenant_id = $2 AND status = 'trash'`,
        [id, req.tenantId],
      );
      if (r.rowCount === 0) {
        await client.query("ROLLBACK");
        bad(res, 404, "Trashed sheet not found");
        return;
      }

      await client.query("COMMIT");
      recordTransaction({
        req,
        section: Section.WORK,
        module: Module.BUG_LIST,
        page: Page.BUG_TRASH,
        action: Action.PERMANENT_DELETE,
        actionLabel: "Sheet permanently deleted",
        entityType: EntityType.BUG_SHEET,
        entityId: id,
        statusCode: 200,
        metadata: { attachmentsCleaned: attachments.rowCount },
      });
      res.json({ success: true });
    } catch (err: any) {
      await client.query("ROLLBACK").catch(() => {});
      console.error("permanentDeleteSheet error:", err);
      bad(res, 500, err.message || "Failed to permanently delete sheet");
    } finally {
      client.release();
    }
  }

  // ==========================================================================
  // Bugs — list/get/create/update/delete + bulk
  // ==========================================================================

  static async listBugs(req: AuthRequest, res: Response): Promise<void> {
    if (!ensureAuth(req, res)) return;
    const {
      folderId,
      sheetId,
      search,
      module,
      severity,
      status,
      bugStatus,
      bugType,
      createdById,
      assigneeId,
      scope,
      projectId,
      createdFrom,
      createdTo,
      updatedFrom,
      updatedTo,
      ticketStatus,
      page = "1",
      limit = "50",
      sortBy = "created_at",
      sortOrder = "desc",
    } = req.query as Record<string, string>;

    try {
      const conditions: string[] = ["b.tenant_id = $1"];
      const values: any[] = [req.tenantId];

      const push = (cond: string, value: any) => {
        values.push(value);
        conditions.push(cond.split("$$").join(`$${values.length}`));
      };

      if (folderId) push("b.folder_id = $$", folderId);
      if (sheetId) push("b.sheet_id = $$", sheetId);
      if (module) push("b.module = $$", module);
      if (severity) push("b.severity = $$", severity);
      if (status && ALLOWED_STATUS.has(status)) push("b.status = $$", status);
      if (bugStatus && ALLOWED_BUG_STATUS.has(bugStatus)) {
        if (bugStatus === "not started") {
          push("(b.bug_status = $$ OR b.bug_status IS NULL)", "not started");
        } else {
          push("b.bug_status = $$", bugStatus);
        }
      }
      if (bugType) push("b.bug_type = $$", bugType);
      if (createdById) push("b.created_by_id = $$", createdById);
      if (assigneeId) push("(b.assignee_id = $$ OR (b.assignee_id IS NULL AND t.assignee_id = $$))", assigneeId);
      if (ticketStatus) push("t.status = $$", ticketStatus);
      if (projectId && projectId !== 'all') {
        conditions.push(`b.folder_id IN (SELECT id FROM bug_folders WHERE project_id = $${values.length + 1})`);
        values.push(projectId);
      }
      
      // Default scope: exclude trash/archived unless explicitly requested
      if (scope === "trash") {
        if (sheetId) {
          push("b.sheet_id = $$ AND b.status = 'trash'", sheetId);
        } else if (folderId) {
          push("b.folder_id = $$ AND b.status = 'trash'", folderId);
        } else {
          // Show trashed bugs ONLY if their sheet/folder isn't trashed
          push("b.status = $$ AND NOT EXISTS (SELECT 1 FROM bug_sheets s WHERE s.id = b.sheet_id AND s.status = 'trash') AND NOT EXISTS (SELECT 1 FROM bug_folders f WHERE f.id = b.folder_id AND f.status = 'trash')", "trash");
        }
      } else if (scope === "archived") {
        if (sheetId) {
          push("b.sheet_id = $$ AND b.status = 'archived'", sheetId);
        } else if (folderId) {
          push("b.folder_id = $$ AND b.status = 'archived'", folderId);
        } else {
          // Standard archived view: exclude if parent is archived/trashed
          conditions.push("(b.status = 'archived' AND NOT EXISTS (SELECT 1 FROM bug_sheets s WHERE s.id = b.sheet_id AND s.status IN ('archived', 'trash')) AND NOT EXISTS (SELECT 1 FROM bug_folders f WHERE f.id = b.folder_id AND f.status IN ('archived', 'trash')))");
        }
      } else {
        conditions.push("b.status NOT IN ('trash', 'archived')");
        conditions.push("NOT EXISTS (SELECT 1 FROM bug_sheets s WHERE s.id = b.sheet_id AND s.status = 'archived')");
        conditions.push("NOT EXISTS (SELECT 1 FROM bug_sheets s WHERE s.id = b.sheet_id AND s.status = 'trash')");
      }

      if (scope === "mine") push("b.created_by_id = $$", req.user!.id);

      // Date Range Filters
      if (createdFrom) push("b.created_at >= $$", createdFrom);
      if (createdTo) push("b.created_at <= $$", createdTo);
      if (updatedFrom) push("b.updated_at >= $$", updatedFrom);
      if (updatedTo) push("b.updated_at <= $$", updatedTo);
      if (search) {
        push(
          "(b.title ILIKE $$ OR b.description ILIKE $$ OR $$ = ANY(b.tags))",
          `%${search}%`,
        );
        // The single placeholder repeated three times needs three separate values.
        // Re-do the push: we already added one; pop it and rebuild with 3 placeholders.
        conditions.pop();
        values.pop();
        const i1 = values.push(`%${search}%`);
        const i2 = values.push(`%${search}%`);
        const i3 = values.push(search);
        conditions.push(
          `(b.title ILIKE $${i1} OR b.description ILIKE $${i2} OR $${i3} = ANY(b.tags))`,
        );
      }

      const whereSql = conditions.join(" AND ");
      const safeSortBy = ["created_at", "updated_at", "severity", "status"].includes(
        sortBy,
      )
        ? `b.${sortBy}`
        : "b.created_at";
      const safeSortOrder = sortOrder === "asc" ? "ASC" : "DESC";

      const pageNum = Math.max(1, parseInt(page, 10) || 1);
      const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
      const offset = (pageNum - 1) * limitNum;

      const totalRes = await pool.query(
        `SELECT COUNT(*)::int AS total FROM bugs b LEFT JOIN tickets t ON t.id = b.ticket_id WHERE ${whereSql}`,
        values,
      );
      const total = totalRes.rows[0].total as number;

      const listSql = `
        SELECT b.*, t.ticket_number AS ticket_number, t.status AS ticket_status,
               u.id AS creator_id, u.name AS creator_name, u.work_email AS creator_email,
               a.id AS assignee_uid, a.name AS assignee_name, a.work_email AS assignee_email, a.avatar_url AS assignee_avatar
          FROM bugs b
          LEFT JOIN tickets t ON t.id = b.ticket_id
          LEFT JOIN users u ON u.id = b.created_by_id
          LEFT JOIN users a ON a.id = COALESCE(b.assignee_id, t.assignee_id)
         WHERE ${whereSql}
         ORDER BY ${safeSortBy} ${safeSortOrder}
         LIMIT $${values.length + 1} OFFSET $${values.length + 2}
      `;
      const listRes = await pool.query(listSql, [...values, limitNum, offset]);

      const ids = listRes.rows.map((r: any) => r.id);
      let attachmentsByBug: Record<string, any[]> = {};
      let linksByBug: Record<string, any[]> = {};
      if (ids.length > 0) {
        const att = await pool.query(
          `SELECT id, bug_id, file_name, file_url, file_size, file_type, created_at AS uploaded_at
             FROM bug_attachments WHERE bug_id = ANY($1::text[])`,
          [ids],
        );
        const links = await pool.query(
          `SELECT id, bug_id, label, url
             FROM bug_external_links WHERE bug_id = ANY($1::text[])`,
          [ids],
        );
        for (const a of att.rows) {
          (attachmentsByBug[a.bug_id] ||= []).push(a);
        }
        for (const l of links.rows) {
          (linksByBug[l.bug_id] ||= []).push(l);
        }
      }

      const bugs = listRes.rows.map((row: any) =>
        shapeBug(
          row,
          attachmentsByBug[row.id] || [],
          linksByBug[row.id] || [],
        ),
      );

      res.json({
        success: true,
        data: {
          bugs,
          pagination: {
            page: pageNum,
            limit: limitNum,
            total,
            pages: Math.ceil(total / limitNum),
            hasNext: pageNum * limitNum < total,
            hasPrev: pageNum > 1,
          },
        },
      });
    } catch (err: any) {
      console.error("listBugs error:", err);
      bad(res, 500, err.message || "Failed to list bugs");
    }
  }

  static async getBug(req: AuthRequest, res: Response): Promise<void> {
    if (!ensureAuth(req, res)) return;
    try {
      const bug = await loadBugWithChildren(req.params.id, req.tenantId!);
      if (!bug) {
        bad(res, 404, "Bug not found");
        return;
      }
      res.json({ success: true, data: bug });
    } catch (err: any) {
      console.error("getBug error:", err);
      bad(res, 500, err.message || "Failed to load bug");
    }
  }

  static async createBug(req: AuthRequest, res: Response): Promise<void> {
    if (!ensureAuth(req, res)) return;
    const {
      folderId,
      sheetId,
      title,
      description,
      module,
      bugType,
      severity,
      tags,
      assigneeId,
      bugStatus,
      attachments,
      externalLinks,
      comments,
    } = req.body;

    if (!description || typeof description !== "string") {
      bad(res, 400, "Description is required");
      return;
    }
    if (!folderId || !sheetId) {
      bad(res, 400, "folderId and sheetId are required");
      return;
    }
    if (severity) {
      const valid = await getValidSeverityKeys(req.tenantId!);
      if (!valid.has(severity)) {
        bad(res, 400, "Invalid severity");
        return;
      }
    }
    if (bugType) {
      const valid = await getValidBugTypeKeys(req.tenantId!);
      if (!valid.has(bugType)) {
        bad(res, 400, "Invalid bug type");
        return;
      }
    }
    if (bugStatus && !ALLOWED_BUG_STATUS.has(bugStatus)) {
      bad(res, 400, "Invalid bug status. Must be: not started, pending, or completed");
      return;
    }

    try {
      // Validate folder/sheet belong to tenant + sheet belongs to folder
      const sheetCheck = await pool.query(
        `SELECT s.id FROM bug_sheets s
          WHERE s.id = $1 AND s.folder_id = $2 AND s.tenant_id = $3`,
        [sheetId, folderId, req.tenantId],
      );
      if (sheetCheck.rows.length === 0) {
        bad(res, 404, "Sheet not found in this folder");
        return;
      }

      // Generate bug_number scoped to tenant: BUG-#####
      const seqRes = await pool.query(
        `SELECT bug_number FROM bugs
          WHERE tenant_id = $1 AND bug_number IS NOT NULL
          ORDER BY created_at DESC LIMIT 1`,
        [req.tenantId],
      );
      let nextNum = 1;
      if (seqRes.rows.length > 0 && seqRes.rows[0].bug_number) {
        const parts = String(seqRes.rows[0].bug_number).split("-");
        const last = parseInt(parts[parts.length - 1], 10);
        if (!Number.isNaN(last)) nextNum = last + 1;
      }
      const bugNumber = `BUG-${String(nextNum).padStart(4, "0")}`;

      const insertRes = await pool.query(
        `INSERT INTO bugs
           (tenant_id, folder_id, sheet_id, bug_number, title, description, module,
            bug_type, severity, status, bug_status, tags, assignee_id, created_by_id, comments)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'new', $10, $11, $12, $13, $14)
         RETURNING id`,
        [
          req.tenantId,
          folderId,
          sheetId,
          bugNumber,
          title || null,
          description,
          module || null,
          bugType || null,
          severity || null,
          bugStatus || 'not started',
          Array.isArray(tags) ? tags : [],
          assigneeId || null,
          req.user!.id,
          comments || null,
        ],
      );
      const bugId = insertRes.rows[0].id;

      await persistAttachments(
        bugId,
        req.tenantId!,
        folderId,
        sheetId,
        req.user!.id,
        attachments,
      );
      await persistExternalLinks(bugId, externalLinks);

      const bug = await loadBugWithChildren(bugId, req.tenantId!);
      recordTransaction({
        req,
        section: Section.WORK,
        module: Module.BUG_LIST,
        page: Page.BUG_LIST,
        action: Action.CREATE,
        actionLabel: "Bug created",
        entityType: EntityType.BUG,
        entityId: bugId,
        entityLabel: `${bugNumber}${title ? ` — ${title}` : ""}`,
        parentEntityType: EntityType.BUG_SHEET,
        parentEntityId: sheetId,
        afterData: {
          bugNumber,
          title,
          module,
          bugType,
          severity,
          bugStatus: bugStatus || "not started",
          tags: Array.isArray(tags) ? tags : [],
          assigneeId,
          folderId,
          sheetId,
        },
        statusCode: 201,
        metadata: {
          attachments: Array.isArray(attachments) ? attachments.length : 0,
          externalLinks: Array.isArray(externalLinks) ? externalLinks.length : 0,
        },
      });
      res.status(201).json({ success: true, data: bug });
    } catch (err: any) {
      console.error("createBug error:", err);
      bad(res, 500, err.message || "Failed to create bug");
    }
  }

  static async updateBug(req: AuthRequest, res: Response): Promise<void> {
    if (!ensureAuth(req, res)) return;
    const { id } = req.params;
    const {
      title,
      description,
      module,
      bugType,
      severity,
      status,
      bugStatus,
      tags,
      assigneeId,
      attachments,
      externalLinks,
      comments,
    } = req.body;

    if (severity !== undefined && severity !== null) {
      const valid = await getValidSeverityKeys(req.tenantId!);
      if (!valid.has(severity)) {
        bad(res, 400, "Invalid severity");
        return;
      }
    }
    if (bugType !== undefined && bugType !== null) {
      const valid = await getValidBugTypeKeys(req.tenantId!);
      if (!valid.has(bugType)) {
        bad(res, 400, "Invalid bug type");
        return;
      }
    }
    if (status !== undefined && !ALLOWED_STATUS.has(status)) {
      bad(res, 400, "Invalid status");
      return;
    }
    if (bugStatus !== undefined && bugStatus !== null && !ALLOWED_BUG_STATUS.has(bugStatus)) {
      bad(res, 400, "Invalid bug status. Must be: not started, pending, or completed");
      return;
    }

    try {
      const existing = await pool.query(
        `SELECT folder_id, sheet_id, bug_number, title, description, module,
                bug_type, severity, status, bug_status, tags, assignee_id, comments
           FROM bugs WHERE id = $1 AND tenant_id = $2`,
        [id, req.tenantId],
      );
      if (existing.rows.length === 0) {
        bad(res, 404, "Bug not found");
        return;
      }
      const existingRow = existing.rows[0];
      const { folder_id, sheet_id } = existingRow;

      // Build dynamic update list. `undefined` means "leave as-is", `null` means "clear".
      const sets: string[] = [];
      const values: any[] = [];
      const set = (col: string, val: any) => {
        values.push(val);
        sets.push(`${col} = $${values.length}`);
      };
      if (title !== undefined) set("title", title);
      if (description !== undefined) set("description", description);
      if (module !== undefined) set("module", module);
      if (bugType !== undefined) set("bug_type", bugType);
      if (severity !== undefined) set("severity", severity);
      if (status !== undefined) set("status", status);
      if (bugStatus !== undefined) set("bug_status", bugStatus);
      if (tags !== undefined) set("tags", Array.isArray(tags) ? tags : []);
      if (assigneeId !== undefined) set("assignee_id", assigneeId);
      if (comments !== undefined) set("comments", comments);

      if (sets.length > 0) {
        values.push(id, req.tenantId);
        await pool.query(
          `UPDATE bugs SET ${sets.join(", ")}
             WHERE id = $${values.length - 1} AND tenant_id = $${values.length}`,
          values,
        );
      }

      if (attachments !== undefined) {
        await persistAttachments(
          id,
          req.tenantId!,
          folder_id,
          sheet_id,
          req.user!.id,
          attachments,
        );
      }
      if (externalLinks !== undefined) {
        await persistExternalLinks(id, externalLinks);
      }

      const bug = await loadBugWithChildren(id, req.tenantId!);
      {
        const beforeSnap: Record<string, any> = {
          title: existingRow.title,
          description: existingRow.description,
          module: existingRow.module,
          bugType: existingRow.bug_type,
          severity: existingRow.severity,
          status: existingRow.status,
          bugStatus: existingRow.bug_status,
          tags: existingRow.tags,
          assigneeId: existingRow.assignee_id,
          comments: existingRow.comments,
        };
        const afterSnap: Record<string, any> = {};
        if (title !== undefined) afterSnap.title = title;
        if (description !== undefined) afterSnap.description = description;
        if (module !== undefined) afterSnap.module = module;
        if (bugType !== undefined) afterSnap.bugType = bugType;
        if (severity !== undefined) afterSnap.severity = severity;
        if (status !== undefined) afterSnap.status = status;
        if (bugStatus !== undefined) afterSnap.bugStatus = bugStatus;
        if (tags !== undefined) afterSnap.tags = Array.isArray(tags) ? tags : [];
        if (assigneeId !== undefined) afterSnap.assigneeId = assigneeId;
        if (comments !== undefined) afterSnap.comments = comments;
        const { changedFields, before, after } = diffShallow(beforeSnap, afterSnap);
        const attachmentsChanged = attachments !== undefined;
        const linksChanged = externalLinks !== undefined;
        if (changedFields.length > 0 || attachmentsChanged || linksChanged) {
          recordTransaction({
            req,
            section: Section.WORK,
            module: Module.BUG_LIST,
            page: Page.BUG_LIST,
            action: Action.UPDATE,
            actionLabel: `Bug updated${changedFields.length ? ` (${changedFields.join(", ")})` : ""}`,
            entityType: EntityType.BUG,
            entityId: id,
            entityLabel: `${existingRow.bug_number}${existingRow.title ? ` — ${existingRow.title}` : ""}`,
            parentEntityType: EntityType.BUG_SHEET,
            parentEntityId: sheet_id,
            beforeData: before,
            afterData: after,
            changedFields,
            statusCode: 200,
            metadata: {
              attachmentsReplaced: attachmentsChanged,
              externalLinksReplaced: linksChanged,
            },
          });
        }
      }
      res.json({ success: true, data: bug });
    } catch (err: any) {
      console.error("updateBug error:", err);
      bad(res, 500, err.message || "Failed to update bug");
    }
  }

  static async deleteBug(req: AuthRequest, res: Response): Promise<void> {
    if (!ensureAuth(req, res)) return;
    const { id } = req.params;
    try {
      // First get current status to preserve it before moving to trash
      const bugResult = await pool.query(
        `SELECT status, original_status FROM bugs WHERE id = $1 AND tenant_id = $2`,
        [id, req.tenantId],
      );
      
      if (bugResult.rows.length === 0) {
        bad(res, 404, "Bug not found");
        return;
      }
      
      const bugRow = bugResult.rows[0];
      const currentStatus = bugRow.status;
      // Only preserve status if it's not already trash, using COALESCE logic
      const originalStatus = currentStatus === 'trash' ? bugRow.original_status : (bugRow.original_status || currentStatus);
      
      const r = await pool.query(
        `UPDATE bugs SET status = 'trash', original_status = $1, updated_at = NOW()
          WHERE id = $2 AND tenant_id = $3 RETURNING id`,
        [originalStatus, id, req.tenantId],
      );
      if (r.rowCount === 0) {
        bad(res, 404, "Bug not found");
        return;
      }
      recordTransaction({
        req,
        section: Section.WORK,
        module: Module.BUG_LIST,
        page: Page.BUG_LIST,
        action: Action.DELETE,
        actionLabel: "Bug moved to trash",
        entityType: EntityType.BUG,
        entityId: id,
        beforeData: { status: currentStatus },
        afterData: { status: "trash" },
        changedFields: ["status"],
        statusCode: 200,
        metadata: { softDelete: true },
      });
      res.json({ success: true });
    } catch (err: any) {
      console.error("deleteBug error:", err);
      bad(res, 500, err.message || "Failed to move bug to trash");
    }
  }

  static async permanentDeleteBug(req: AuthRequest, res: Response): Promise<void> {
    if (!ensureAuth(req, res)) return;
    const { id } = req.params;
    try {
      const attachments = await pool.query(
        `SELECT file_url FROM bug_attachments WHERE bug_id = $1`,
        [id],
      );
      for (const att of attachments.rows) {
        try {
          await deleteBugAttachmentFromR2(att.file_url, req.tenantId!);
        } catch (e) {
          console.error("R2 cleanup failed:", e);
        }
      }
      const r = await pool.query(
        `DELETE FROM bugs WHERE id = $1 AND tenant_id = $2`,
        [id, req.tenantId],
      );
      if (r.rowCount === 0) {
        bad(res, 404, "Bug not found");
        return;
      }
      recordTransaction({
        req,
        section: Section.WORK,
        module: Module.BUG_LIST,
        page: Page.BUG_TRASH,
        action: Action.PERMANENT_DELETE,
        actionLabel: "Bug permanently deleted",
        entityType: EntityType.BUG,
        entityId: id,
        statusCode: 200,
        metadata: { attachmentsCleaned: attachments.rowCount },
      });
      res.json({ success: true });
    } catch (err: any) {
      console.error("permanentDeleteBug error:", err);
      bad(res, 500, err.message || "Failed to delete bug permanently");
    }
  }

  static async restoreBug(req: AuthRequest, res: Response): Promise<void> {
    if (!ensureAuth(req, res)) return;
    const { id } = req.params;
    try {
      // First get the bug to see if it has a preserved status
      const bugResult = await pool.query(
        `SELECT original_status FROM bugs WHERE id = $1 AND tenant_id = $2`,
        [id, req.tenantId],
      );
      
      if (bugResult.rows.length === 0) {
        bad(res, 404, "Bug not found");
        return;
      }
      
      const bug = bugResult.rows[0];
      // If there's a preserved original status, use it; otherwise default to 'new'
      const restoredStatus = bug.original_status || 'new';
      
      const r = await pool.query(
        `UPDATE bugs SET status = $1, original_status = NULL, updated_at = NOW()
          WHERE id = $2 AND tenant_id = $3 RETURNING id`,
        [restoredStatus, id, req.tenantId],
      );
      if (r.rowCount === 0) {
        bad(res, 404, "Bug not found");
        return;
      }
      recordTransaction({
        req,
        section: Section.WORK,
        module: Module.BUG_LIST,
        page: Page.BUG_TRASH,
        action: Action.RESTORE,
        actionLabel: "Bug restored",
        entityType: EntityType.BUG,
        entityId: id,
        afterData: { status: restoredStatus },
        changedFields: ["status"],
        statusCode: 200,
      });
      res.json({ success: true });
    } catch (err: any) {
      console.error("restoreBug error:", err);
      bad(res, 500, err.message || "Failed to restore bug");
    }
  }

  static async bulkUpdateStatus(
    req: AuthRequest,
    res: Response,
  ): Promise<void> {
    if (!ensureAuth(req, res)) return;
    const { bugIds, status } = req.body;
    if (!Array.isArray(bugIds) || bugIds.length === 0) {
      bad(res, 400, "bugIds must be a non-empty array");
      return;
    }
    if (!ALLOWED_STATUS.has(status)) {
      bad(res, 400, "Invalid status");
      return;
    }
    try {
      const r = await pool.query(
        `UPDATE bugs
           SET status = $1,
               original_status = CASE 
                 WHEN $1 = 'archived' THEN (CASE WHEN status = 'archived' THEN original_status ELSE status END)
                 WHEN $1 = 'trash' THEN (CASE WHEN status = 'trash' THEN original_status ELSE status END)
                 ELSE NULL
               END,
               updated_at = NOW()
         WHERE id = ANY($2::text[]) AND tenant_id = $3`,
        [status, bugIds, req.tenantId],
      );
      recordTransaction({
        req,
        section: Section.WORK,
        module: Module.BUG_LIST,
        page: Page.BUG_LIST,
        action: Action.BULK_UPDATE_STATUS,
        actionLabel: `Bug bulk status -> ${status} (${r.rowCount})`,
        entityType: EntityType.BUG,
        afterData: { status },
        changedFields: ["status"],
        correlationId: randomUUID(),
        metadata: { targetIds: bugIds, requested: bugIds.length, updated: r.rowCount },
        statusCode: 200,
      });
      res.json({ success: true, data: { updated: r.rowCount } });
    } catch (err: any) {
      console.error("bulkUpdateStatus error:", err);
      bad(res, 500, err.message || "Failed to update bugs");
    }
  }

  static async bulkDelete(req: AuthRequest, res: Response): Promise<void> {
    if (!ensureAuth(req, res)) return;
    const { bugIds } = req.body;
    if (!Array.isArray(bugIds) || bugIds.length === 0) {
      bad(res, 400, "bugIds must be a non-empty array");
      return;
    }
    try {
      // Update all bugs to preserve their original status before moving to trash
      const r = await pool.query(
        `UPDATE bugs
           SET status = 'trash',
               original_status = CASE WHEN status = 'trash' THEN original_status ELSE COALESCE(original_status, status) END,
               updated_at = NOW()
         WHERE id = ANY($1::text[]) AND tenant_id = $2`,
        [bugIds, req.tenantId],
      );
      recordTransaction({
        req,
        section: Section.WORK,
        module: Module.BUG_LIST,
        page: Page.BUG_LIST,
        action: Action.BULK_DELETE,
        actionLabel: `Bugs bulk moved to trash (${r.rowCount})`,
        entityType: EntityType.BUG,
        afterData: { status: "trash" },
        changedFields: ["status"],
        correlationId: randomUUID(),
        metadata: { targetIds: bugIds, requested: bugIds.length, updated: r.rowCount, softDelete: true },
        statusCode: 200,
      });
      res.json({ success: true, data: { movedToTrash: r.rowCount } });
    } catch (err: any) {
      console.error("bulkDelete error:", err);
      bad(res, 500, err.message || "Failed to move bugs to trash");
    }
  }

  static async bulkPermanentDelete(req: AuthRequest, res: Response): Promise<void> {
    if (!ensureAuth(req, res)) return;
    const { bugIds } = req.body;
    if (!Array.isArray(bugIds) || bugIds.length === 0) {
      bad(res, 400, "bugIds must be a non-empty array");
      return;
    }
    try {
      const att = await pool.query(
        `SELECT file_url FROM bug_attachments WHERE bug_id = ANY($1::text[])`,
        [bugIds],
      );
      const r = await pool.query(
        `DELETE FROM bugs WHERE id = ANY($1::text[]) AND tenant_id = $2`,
        [bugIds, req.tenantId],
      );
      for (const a of att.rows) {
        try {
          await deleteBugAttachmentFromR2(a.file_url, req.tenantId!);
        } catch (e) {
          console.error("R2 cleanup failed:", e);
        }
      }
      recordTransaction({
        req,
        section: Section.WORK,
        module: Module.BUG_LIST,
        page: Page.BUG_TRASH,
        action: Action.BULK_PERMANENT_DELETE,
        actionLabel: `Bugs permanently deleted (${r.rowCount})`,
        entityType: EntityType.BUG,
        correlationId: randomUUID(),
        metadata: {
          targetIds: bugIds,
          requested: bugIds.length,
          deleted: r.rowCount,
          attachmentsCleaned: att.rowCount,
        },
        statusCode: 200,
      });
      res.json({ success: true, data: { deleted: r.rowCount } });
    } catch (err: any) {
      console.error("bulkPermanentDelete error:", err);
      bad(res, 500, err.message || "Failed to delete bugs permanently");
    }
  }

  static async bulkRestore(req: AuthRequest, res: Response): Promise<void> {
    if (!ensureAuth(req, res)) return;
    const { bugIds } = req.body;
    if (!Array.isArray(bugIds) || bugIds.length === 0) {
      bad(res, 400, "bugIds must be a non-empty array");
      return;
    }
    try {
      // First get all bugs to restore their original statuses
      const bugsResult = await pool.query(
        `SELECT original_status FROM bugs WHERE id = ANY($1::text[]) AND tenant_id = $2`,
        [bugIds, req.tenantId],
      );
      
      // Update each bug with its original status, defaulting to 'new' if no original status
      const r = await pool.query(
        `UPDATE bugs
           SET status = COALESCE(original_status, 'new'), original_status = NULL, updated_at = NOW()
         WHERE id = ANY($1::text[]) AND tenant_id = $2`,
        [bugIds, req.tenantId],
      );
      recordTransaction({
        req,
        section: Section.WORK,
        module: Module.BUG_LIST,
        page: Page.BUG_TRASH,
        action: Action.BULK_RESTORE,
        actionLabel: `Bugs restored (${r.rowCount})`,
        entityType: EntityType.BUG,
        correlationId: randomUUID(),
        metadata: { targetIds: bugIds, requested: bugIds.length, restored: r.rowCount },
        statusCode: 200,
      });
      res.json({ success: true, data: { restored: r.rowCount } });
    } catch (err: any) {
      console.error("bulkRestore error:", err);
      bad(res, 500, err.message || "Failed to restore bugs");
    }
  }

  static async bulkRestoreFolders(req: AuthRequest, res: Response): Promise<void> {
    if (!ensureAuth(req, res)) return;
    const { folderIds } = req.body;
    if (!Array.isArray(folderIds) || folderIds.length === 0) {
      bad(res, 400, "folderIds must be a non-empty array");
      return;
    }
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      
      const folders = await client.query(
        `SELECT id, original_status FROM bug_folders WHERE id = ANY($1::text[]) AND tenant_id = $2 AND status IN ('trash', 'archived')`,
        [folderIds, req.tenantId],
      );

      for (const folder of folders.rows) {
        const originalStatus = folder.original_status || 'active';
        await client.query(
          `UPDATE bug_folders SET status = $1, original_status = NULL, updated_at = NOW()
            WHERE id = $2 AND tenant_id = $3`,
          [originalStatus, folder.id, req.tenantId],
        );

        // Recursively restore sheets and bugs
        await client.query(
          `UPDATE bug_sheets SET status = COALESCE(original_status, 'active'), original_status = NULL, updated_at = NOW()
            WHERE folder_id = $1 AND tenant_id = $2 AND status IN ('trash', 'archived')`,
          [folder.id, req.tenantId]
        );
        await client.query(
          `UPDATE bugs SET status = COALESCE(original_status, 'new'), original_status = NULL, updated_at = NOW()
            WHERE folder_id = $1 AND tenant_id = $2 AND status IN ('trash', 'archived')`,
          [folder.id, req.tenantId]
        );
      }

      await client.query("COMMIT");
      recordTransaction({
        req,
        section: Section.WORK,
        module: Module.BUG_LIST,
        page: Page.BUG_TRASH,
        action: Action.BULK_RESTORE,
        actionLabel: `Folders restored (${folders.rowCount})`,
        entityType: EntityType.BUG_FOLDER,
        correlationId: randomUUID(),
        metadata: { targetIds: folderIds, requested: folderIds.length, restored: folders.rowCount },
        statusCode: 200,
      });
      res.json({ success: true, data: { restored: folders.rowCount } });
    } catch (err: any) {
      await client.query("ROLLBACK").catch(() => {});
      console.error("bulkRestoreFolders error:", err);
      bad(res, 500, err.message || "Failed to restore folders");
    } finally {
      client.release();
    }
  }

  static async bulkPermanentDeleteFolders(req: AuthRequest, res: Response): Promise<void> {
    if (!ensureAuth(req, res)) return;
    const { folderIds } = req.body;
    if (!Array.isArray(folderIds) || folderIds.length === 0) {
      bad(res, 400, "folderIds must be a non-empty array");
      return;
    }
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      
      const attachments = await client.query(
        `SELECT a.file_url
           FROM bug_attachments a
           JOIN bugs b ON b.id = a.bug_id
          WHERE b.folder_id = ANY($1::text[]) AND b.tenant_id = $2`,
        [folderIds, req.tenantId],
      );
      for (const att of attachments.rows) {
        try {
          await deleteBugAttachmentFromR2(att.file_url, req.tenantId!);
        } catch (e) {
          console.error("R2 cleanup failed:", e);
        }
      }
      
      const r = await client.query(
        `DELETE FROM bug_folders WHERE id = ANY($1::text[]) AND tenant_id = $2 AND status = 'trash'`,
        [folderIds, req.tenantId],
      );

      await client.query("COMMIT");
      recordTransaction({
        req,
        section: Section.WORK,
        module: Module.BUG_LIST,
        page: Page.BUG_TRASH,
        action: Action.BULK_PERMANENT_DELETE,
        actionLabel: `Folders permanently deleted (${r.rowCount})`,
        entityType: EntityType.BUG_FOLDER,
        correlationId: randomUUID(),
        metadata: {
          targetIds: folderIds,
          requested: folderIds.length,
          deleted: r.rowCount,
          attachmentsCleaned: attachments.rowCount,
        },
        statusCode: 200,
      });
      res.json({ success: true, data: { deleted: r.rowCount } });
    } catch (err: any) {
      await client.query("ROLLBACK").catch(() => {});
      console.error("bulkPermanentDeleteFolders error:", err);
      bad(res, 500, err.message || "Failed to permanently delete folders");
    } finally {
      client.release();
    }
  }

  static async bulkRestoreSheets(req: AuthRequest, res: Response): Promise<void> {
    if (!ensureAuth(req, res)) return;
    const { sheetIds } = req.body;
    if (!Array.isArray(sheetIds) || sheetIds.length === 0) {
      bad(res, 400, "sheetIds must be a non-empty array");
      return;
    }
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      
      const sheets = await client.query(
        `SELECT id, original_status FROM bug_sheets WHERE id = ANY($1::text[]) AND tenant_id = $2 AND status IN ('trash', 'archived')`,
        [sheetIds, req.tenantId],
      );

      for (const sheet of sheets.rows) {
        const originalStatus = sheet.original_status || 'active';
        await client.query(
          `UPDATE bug_sheets SET status = $1, original_status = NULL, updated_at = NOW()
            WHERE id = $2 AND tenant_id = $3`,
          [originalStatus, sheet.id, req.tenantId],
        );

        await client.query(
          `UPDATE bugs SET status = COALESCE(original_status, 'new'), original_status = NULL, updated_at = NOW()
            WHERE sheet_id = $1 AND tenant_id = $2 AND status IN ('trash', 'archived')`,
          [sheet.id, req.tenantId]
        );
      }

      await client.query("COMMIT");
      recordTransaction({
        req,
        section: Section.WORK,
        module: Module.BUG_LIST,
        page: Page.BUG_TRASH,
        action: Action.BULK_RESTORE,
        actionLabel: `Sheets restored (${sheets.rowCount})`,
        entityType: EntityType.BUG_SHEET,
        correlationId: randomUUID(),
        metadata: { targetIds: sheetIds, requested: sheetIds.length, restored: sheets.rowCount },
        statusCode: 200,
      });
      res.json({ success: true, data: { restored: sheets.rowCount } });
    } catch (err: any) {
      await client.query("ROLLBACK").catch(() => {});
      console.error("bulkRestoreSheets error:", err);
      bad(res, 500, err.message || "Failed to restore sheets");
    } finally {
      client.release();
    }
  }

  static async bulkPermanentDeleteSheets(req: AuthRequest, res: Response): Promise<void> {
    if (!ensureAuth(req, res)) return;
    const { sheetIds } = req.body;
    if (!Array.isArray(sheetIds) || sheetIds.length === 0) {
      bad(res, 400, "sheetIds must be a non-empty array");
      return;
    }
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      
      const attachments = await client.query(
        `SELECT a.file_url
           FROM bug_attachments a
           JOIN bugs b ON b.id = a.bug_id
          WHERE b.sheet_id = ANY($1::text[]) AND b.tenant_id = $2`,
        [sheetIds, req.tenantId],
      );
      for (const att of attachments.rows) {
        try {
          await deleteBugAttachmentFromR2(att.file_url, req.tenantId!);
        } catch (e) {
          console.error("R2 cleanup failed:", e);
        }
      }
      
      const r = await client.query(
        `DELETE FROM bug_sheets WHERE id = ANY($1::text[]) AND tenant_id = $2 AND status = 'trash'`,
        [sheetIds, req.tenantId],
      );

      await client.query("COMMIT");
      recordTransaction({
        req,
        section: Section.WORK,
        module: Module.BUG_LIST,
        page: Page.BUG_TRASH,
        action: Action.BULK_PERMANENT_DELETE,
        actionLabel: `Sheets permanently deleted (${r.rowCount})`,
        entityType: EntityType.BUG_SHEET,
        correlationId: randomUUID(),
        metadata: {
          targetIds: sheetIds,
          requested: sheetIds.length,
          deleted: r.rowCount,
          attachmentsCleaned: attachments.rowCount,
        },
        statusCode: 200,
      });
      res.json({ success: true, data: { deleted: r.rowCount } });
    } catch (err: any) {
      await client.query("ROLLBACK").catch(() => {});
      console.error("bulkPermanentDeleteSheets error:", err);
      bad(res, 500, err.message || "Failed to permanently delete sheets");
    } finally {
      client.release();
    }
  }

  static async bulkMove(req: AuthRequest, res: Response): Promise<void> {
    if (!ensureAuth(req, res)) return;
    const { bugIds, targetSheetId } = req.body;
    if (!Array.isArray(bugIds) || bugIds.length === 0) {
      bad(res, 400, "bugIds must be a non-empty array");
      return;
    }
    if (!targetSheetId) {
      bad(res, 400, "targetSheetId is required");
      return;
    }
    try {
      const sheet = await pool.query(
        `SELECT id, folder_id FROM bug_sheets WHERE id = $1 AND tenant_id = $2`,
        [targetSheetId, req.tenantId],
      );
      if (sheet.rows.length === 0) {
        bad(res, 404, "Target sheet not found");
        return;
      }
      const folderId = sheet.rows[0].folder_id;
      const r = await pool.query(
        `UPDATE bugs SET sheet_id = $1, folder_id = $2
           WHERE id = ANY($3::text[]) AND tenant_id = $4`,
        [targetSheetId, folderId, bugIds, req.tenantId],
      );
      recordTransaction({
        req,
        section: Section.WORK,
        module: Module.BUG_LIST,
        page: Page.BUG_LIST,
        action: Action.BULK_MOVE,
        actionLabel: `Bugs moved to sheet ${targetSheetId} (${r.rowCount})`,
        entityType: EntityType.BUG,
        afterData: { sheetId: targetSheetId, folderId },
        changedFields: ["sheetId", "folderId"],
        correlationId: randomUUID(),
        metadata: {
          targetIds: bugIds,
          requested: bugIds.length,
          moved: r.rowCount,
          targetSheetId,
          targetFolderId: folderId,
        },
        statusCode: 200,
      });
      res.json({ success: true, data: { moved: r.rowCount } });
    } catch (err: any) {
      console.error("bulkMove error:", err);
      bad(res, 500, err.message || "Failed to move bugs");
    }
  }

  // ==========================================================================
  // Stats (Sprint Pulse)
  // ==========================================================================

  static async getStats(req: AuthRequest, res: Response): Promise<void> {
    if (!ensureAuth(req, res)) return;
    const { folderId, sheetId, scope, projectId } = req.query as Record<string, string>;
    try {
      const conditions: string[] = ["tenant_id = $1"];
      const values: any[] = [req.tenantId];
      const push = (cond: string, value: any) => {
        values.push(value);
        conditions.push(cond.split("$$").join(`$${values.length}`));
      };
      if (folderId) push("folder_id = $$", folderId);
      if (sheetId) push("sheet_id = $$", sheetId);
      if (scope === "mine") push("created_by_id = $$", req.user!.id);
      if (projectId && projectId !== 'all') {
        // Since bugs don't have project_id, we filter by folder's project_id
        conditions.push(`folder_id IN (SELECT id FROM bug_folders WHERE project_id = $${values.length + 1})`);
        values.push(projectId);
      }

      if (scope === "trash") {
        conditions.push("(status = 'trash' OR EXISTS (SELECT 1 FROM bug_sheets s WHERE s.id = sheet_id AND s.status = 'trash') OR EXISTS (SELECT 1 FROM bug_folders f WHERE f.id = folder_id AND f.status = 'trash'))");
      } else if (scope === "archived") {
        conditions.push("(status = 'archived' OR EXISTS (SELECT 1 FROM bug_sheets s WHERE s.id = sheet_id AND s.status = 'archived') OR EXISTS (SELECT 1 FROM bug_folders f WHERE f.id = folder_id AND f.status = 'archived'))");
      } else {
        conditions.push("status NOT IN ('trash', 'archived')");
        conditions.push("NOT EXISTS (SELECT 1 FROM bug_sheets s WHERE s.id = sheet_id AND s.status IN ('archived', 'trash'))");
        conditions.push("NOT EXISTS (SELECT 1 FROM bug_folders f WHERE f.id = folder_id AND f.status IN ('archived', 'trash'))");
      }

      const where = conditions.join(" AND ");
      
      // For summary metrics, we also need to respect projectId if provided
      let summaryWhere = "b.tenant_id = $2";
      const summaryValues: any[] = [req.user!.id, req.tenantId];
      if (projectId && projectId !== 'all') {
        summaryWhere += ` AND EXISTS (SELECT 1 FROM bug_folders f_inner WHERE f_inner.id = b.folder_id AND f_inner.project_id = $3)`;
        summaryValues.push(projectId);
      }

      const [r, foldersRes, sheetsRes, summaryRes] = await Promise.all([
        pool.query(
          `SELECT
              COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE status IN ('new','reopened'))::int AS open,
              COUNT(*) FILTER (WHERE severity = 'blocker' AND status NOT IN ('verified','ignored'))::int AS blockers,
              COUNT(*) FILTER (WHERE status = 'verified')::int AS verified,
              COUNT(*) FILTER (WHERE bug_status = 'completed')::int AS completed,
              COUNT(*) FILTER (WHERE ticket_id IS NOT NULL)::int AS linked
             FROM bugs WHERE ${where}`,
          values,
        ),
        pool.query(
          `SELECT COUNT(*)::int AS c FROM bug_folders WHERE tenant_id = $1 ${projectId && projectId !== 'all' ? 'AND project_id = $2' : ''}`,
          projectId && projectId !== 'all' ? [req.tenantId, projectId] : [req.tenantId],
        ),
        pool.query(
          `SELECT COUNT(*)::int AS c FROM bug_sheets WHERE tenant_id = $1 ${projectId && projectId !== 'all' ? 'AND folder_id IN (SELECT id FROM bug_folders WHERE project_id = $2)' : ''}`,
          projectId && projectId !== 'all' ? [req.tenantId, projectId] : [req.tenantId],
        ),
        pool.query(
          `SELECT
              COUNT(*) FILTER (WHERE created_by_id = $1 AND status NOT IN ('trash', 'archived') 
                AND NOT EXISTS (SELECT 1 FROM bug_sheets s WHERE s.id = b.sheet_id AND s.status IN ('archived', 'trash'))
                AND NOT EXISTS (SELECT 1 FROM bug_folders f WHERE f.id = b.folder_id AND f.status IN ('archived', 'trash')))::int AS mine,
              COUNT(*) FILTER (WHERE status = 'trash' 
                OR EXISTS (SELECT 1 FROM bug_sheets s WHERE s.id = b.sheet_id AND s.status = 'trash') 
                OR EXISTS (SELECT 1 FROM bug_folders f WHERE f.id = b.folder_id AND f.status = 'trash'))::int AS trash,
              COUNT(*) FILTER (WHERE status = 'archived' 
                OR EXISTS (SELECT 1 FROM bug_sheets s WHERE s.id = b.sheet_id AND s.status = 'archived') 
                OR EXISTS (SELECT 1 FROM bug_folders f WHERE f.id = b.folder_id AND f.status = 'archived'))::int AS archived
             FROM bugs b WHERE ${summaryWhere}`,
          summaryValues,
        ),
      ]);
      const stats = r.rows[0];
      const summary = summaryRes.rows[0];
      res.json({
        success: true,
        data: {
          total: stats.total,
          open: stats.open,
          blockers: stats.blockers,
          verified: stats.verified,
          completed: stats.completed,
          linked: stats.linked,
          totalFolders: foldersRes.rows[0].c,
          totalSheets: sheetsRes.rows[0].c,
          mineTotal: summary.mine,
          trashTotal: summary.trash,
          archivedTotal: summary.archived,
        },
      });
    } catch (err: any) {
      console.error("getStats error:", err);
      bad(res, 500, err.message || "Failed to load stats");
    }
  }

  // ==========================================================================
  // AI: review + group
  // ==========================================================================

  static async aiReview(req: AuthRequest, res: Response): Promise<void> {
    if (!ensureAuth(req, res)) return;
    const { bugIds } = req.body;
    if (!Array.isArray(bugIds) || bugIds.length === 0) {
      bad(res, 400, "bugIds is required");
      return;
    }
    try {
      await entitlementService.checkLimit(req.tenantId, 'ai_credits_month');

      const rows = await pool.query(
        `SELECT id, description, module, severity, bug_type
           FROM bugs WHERE id = ANY($1::text[]) AND tenant_id = $2`,
        [bugIds, req.tenantId],
      );
      const bugs = rows.rows.map((r: any) => ({
        id: r.id,
        description: r.description,
        module: r.module,
        severity: r.severity,
        bugType: r.bug_type,
      }));
      const aiResponse = await BugListAiService.review(bugs, req.tenantId);
      const data = aiResponse.data;
      const pricingResult = await AIPricingEngine.calculate(aiResponse);

      await entitlementService.incrementUsage(req.tenantId, 'ai_credits_month', AIFeature.BUG_ANALYSIS, pricingResult);
      res.json({ success: true, data });
    } catch (err: any) {
      if (err instanceof EntitlementError) {
        bad(res, 403, "AI limit reached");
        return;
      }
      console.error("aiReview error:", err);
      bad(res, 500, err.message || "AI review failed");
    }
  }

  static async aiEnhanceText(req: AuthRequest, res: Response): Promise<void> {
    if (!ensureAuth(req, res)) return;
    const { text } = req.body || {};
    if (typeof text !== "string" || !text.trim()) {
      bad(res, 400, "text is required");
      return;
    }
    if (text.length > 8000) {
      bad(res, 400, "text is too long");
      return;
    }
    try {
      await entitlementService.checkLimit(req.tenantId, 'ai_credits_month');

      const aiResponse = await BugListAiService.enhanceText(text, req.tenantId);
      const enhanced = aiResponse.data;
      const pricingResult = await AIPricingEngine.calculate(aiResponse);

      await entitlementService.incrementUsage(req.tenantId, 'ai_credits_month', AIFeature.BUG_ANALYSIS, pricingResult);
      res.json({ success: true, data: { text: enhanced } });
    } catch (err: any) {
      if (err instanceof EntitlementError) {
        bad(res, 403, "AI limit reached");
        return;
      }
      console.error("aiEnhanceText error:", err);
      bad(res, 500, err.message || "Grammar enhancement failed");
    }
  }

  static async aiSuggestGroups(
    req: AuthRequest,
    res: Response,
  ): Promise<void> {
    if (!ensureAuth(req, res)) return;
    const { bugIds } = req.body;
    if (!Array.isArray(bugIds) || bugIds.length === 0) {
      bad(res, 400, "bugIds is required");
      return;
    }
    try {
      await entitlementService.checkLimit(req.tenantId, 'ai_credits_month');

      const rows = await pool.query(
        `SELECT id, description, module, severity, bug_type
           FROM bugs WHERE id = ANY($1::text[]) AND tenant_id = $2`,
        [bugIds, req.tenantId],
      );
      const bugs = rows.rows.map((r: any) => ({
        id: r.id,
        description: r.description,
        module: r.module,
        severity: r.severity,
        bugType: r.bug_type,
      }));
      const aiResponse = await BugListAiService.suggestGroups(bugs, req.tenantId);
      const data = aiResponse.data;
      const pricingResult = await AIPricingEngine.calculate(aiResponse);

      await entitlementService.incrementUsage(req.tenantId, 'ai_credits_month', AIFeature.BUG_ANALYSIS, pricingResult);
      res.json({ success: true, data });
    } catch (err: any) {
      if (err instanceof EntitlementError) {
        bad(res, 403, "AI limit reached");
        return;
      }
      console.error("aiSuggestGroups error:", err);
      bad(res, 500, err.message || "AI grouping failed");
    }
  }

  // ==========================================================================
  // Bulk convert: create one ticket per group, link bugs to ticket
  // ==========================================================================

  static async bulkConvertToTickets(
    req: AuthRequest,
    res: Response,
  ): Promise<void> {
    if (!ensureAuth(req, res)) return;
    const { groups } = req.body;
    if (!Array.isArray(groups) || groups.length === 0) {
      bad(res, 400, "groups must be a non-empty array");
      return;
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const created: { ticketId: string; ticketNumber: string; bugIds: string[] }[] = [];

      for (const group of groups) {
        const {
          title,
          description,
          acceptanceCriteria,
          bugIds,
          projectId: projectIdOverride,
          assigneeId,
          attachments,
          externalLinks,
        } = group;
        if (!title || !Array.isArray(bugIds) || bugIds.length === 0) continue;

        // Project: explicit override wins; otherwise inherit from the folder.
        let projectId = projectIdOverride;
        if (!projectId) {
          const folderRow = await client.query(
            `SELECT f.project_id
               FROM bugs b
               JOIN bug_folders f ON f.id = b.folder_id
              WHERE b.id = ANY($1::text[]) AND b.tenant_id = $2
              LIMIT 1`,
            [bugIds, req.tenantId],
          );
          projectId = folderRow.rows[0]?.project_id;
        }
        if (!projectId) {
          throw new Error(
            `Cannot convert group "${title}": no project selected and folder has no linked project`,
          );
        }

        // Generate ticket number for project (use the existing tenant-wide pattern)
        const projectRes = await client.query(
          `SELECT code FROM projects WHERE id = $1 AND tenant_id = $2`,
          [projectId, req.tenantId],
        );
        const rawCode = projectRes.rows[0]?.code;
        const projectCode = rawCode ? rawCode.replace(`${req.tenantId}_`, '') : "TKT";

        // Sequence is per-project: pull MAX(numeric tail) for tickets sharing
        // this project's prefix. Doing this inside the open transaction means
        // tickets inserted earlier in this same loop are visible, so each
        // iteration produces a fresh number.
        const seqRes = await client.query(
          `SELECT COALESCE(
                    MAX((regexp_match(ticket_number, '-(\\d+)$'))[1]::int),
                    0
                  ) + 1 AS next_seq
             FROM tickets
            WHERE tenant_id = $1
              AND project_id = $2
              AND ticket_number ~ '-\\d+$'`,
          [req.tenantId, projectId],
        );
        const nextSeq: number = seqRes.rows[0]?.next_seq ?? 1;
        const ticketNumber = `${projectCode}-${String(nextSeq).padStart(4, "0")}`;

        // `description` is now sent as HTML from the frontend, so append
        // acceptanceCriteria as HTML as well to keep the viewer rendering correctly.
        const finalDescription = acceptanceCriteria
          ? `${description}<hr><p><strong>Acceptance Criteria</strong></p><p>${acceptanceCriteria.replace(/\n/g, "<br>")}</p>`
          : description;

        const newTicketId = randomUUID();
        const ticketInsert = await client.query(
          `INSERT INTO tickets
             (id, tenant_id, project_id, title, description, ticket_number, type, status,
              priority, platform, task_level, story_point, estimate_hours,
              created_by_id, assignee_id, parent_tickets, current_workflow_step, tags, metadata,
              updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, 'Bug', 'not_started',
                   'Medium (P2)', 'Development', 'Medium', 1, 0,
                   $7, $8, '{}', 'Scope Document', '{}', '{}'::jsonb,
                   NOW())
           RETURNING id, ticket_number`,
          [
            newTicketId,
            req.tenantId,
            projectId,
            title,
            finalDescription,
            ticketNumber,
            req.user!.id,
            assigneeId || null,
          ],
        );
        const ticketId = ticketInsert.rows[0].id;

        await client.query(
          `UPDATE bugs SET ticket_id = $1, status = 'converted', assignee_id = COALESCE($4, assignee_id)
             WHERE id = ANY($2::text[]) AND tenant_id = $3`,
          [ticketId, bugIds, req.tenantId, assigneeId || null],
        );

        // Process ticket attachments if provided
        if (attachments && Array.isArray(attachments) && attachments.length > 0) {
          for (const attachment of attachments) {
            const attachmentId = randomUUID();
            const now = new Date().toISOString();
            console.log("Debug - Attachment data:", {
              attachmentId,
              tenantId: req.tenantId,
              ticketId,
              userId: req.user!.id,
              fileName: attachment.fileName,
              fileUrl: attachment.fileUrl,
              fileSize: attachment.fileSize,
              fileType: attachment.fileType,
            });
            try {
              const insertQuery = `
                INSERT INTO ticket_attachments 
                (id, tenant_id, ticket_id, uploaded_by_id, file_name, file_url, file_size, file_type, uploaded_at, created_at, updated_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
              `;
              
              const currentTimestamp = new Date().toISOString();
              await client.query(insertQuery, [
                attachmentId,
                req.tenantId,
                ticketId,
                req.user!.id,
                attachment.fileName,
                attachment.fileUrl,
                Number(attachment.fileSize) || 0,
                attachment.fileType || '',
                currentTimestamp,
                currentTimestamp,
                currentTimestamp,
              ]);
            } catch (err) {
              console.error("Error inserting attachment:", err);
              throw err;
            }
          }
        }

        // Process ticket external links if provided
        if (externalLinks && Array.isArray(externalLinks) && externalLinks.length > 0) {
          for (const link of externalLinks) {
            const linkId = randomUUID();
            try {
              const linkInsertQuery = `
                INSERT INTO ticket_related_links 
                   (id, tenant_id, ticket_id, added_by_id, title, description, url, link_type, added_at, created_at, updated_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
              `;

              const linkTimestamp = new Date().toISOString();
              await client.query(linkInsertQuery, [
                linkId,
                req.tenantId,
                ticketId,
                req.user!.id,
                link.label || '',
                '', // description - not provided from frontend
                link.url,
                'external',
                linkTimestamp,
                linkTimestamp,
                linkTimestamp,
              ]);
            } catch (err) {
              console.error("Error inserting link:", err);
              throw err;
            }
          }
        }

        created.push({
          ticketId,
          ticketNumber: ticketInsert.rows[0].ticket_number,
          bugIds,
        });
      }

      await client.query("COMMIT");
      const totalBugs = created.reduce((n, g) => n + g.bugIds.length, 0);
      recordTransaction({
        req,
        section: Section.WORK,
        module: Module.BUG_LIST,
        page: Page.BUG_LIST,
        action: Action.BULK_CONVERT,
        actionLabel: `Bugs converted to ${created.length} ticket(s) (${totalBugs} bugs)`,
        entityType: EntityType.BUG,
        afterData: { status: "converted" },
        changedFields: ["status", "ticketId"],
        correlationId: randomUUID(),
        metadata: {
          groupsCreated: created.length,
          totalBugsConverted: totalBugs,
          tickets: created.map((g) => ({
            ticketId: g.ticketId,
            ticketNumber: g.ticketNumber,
            bugCount: g.bugIds.length,
          })),
        },
        statusCode: 200,
      });
      res.json({ success: true, data: created });
    } catch (err: any) {
      await client.query("ROLLBACK");
      console.error("bulkConvertToTickets error:", err);
      bad(res, 500, err.message || "Failed to convert bugs");
    } finally {
      client.release();
    }
  }

  static async bulkMapToTicket(
    req: AuthRequest,
    res: Response,
  ): Promise<void> {
    if (!ensureAuth(req, res)) return;
    const { ticketId, bugIds } = req.body;
    if (!ticketId || !Array.isArray(bugIds) || bugIds.length === 0) {
      bad(res, 400, "ticketId and non-empty bugIds array are required");
      return;
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Verify ticket exists
      const ticketRes = await client.query(
        `SELECT id, ticket_number, description FROM tickets WHERE id = $1 AND tenant_id = $2`,
        [ticketId, req.tenantId],
      );
      if (ticketRes.rows.length === 0) {
        throw new Error("Ticket not found");
      }
      const ticket = ticketRes.rows[0];

      // Update the bugs to status 'converted' and set ticket_id
      await client.query(
        `UPDATE bugs
            SET ticket_id = $1, status = 'converted', updated_at = NOW()
          WHERE id = ANY($2::text[]) AND tenant_id = $3`,
        [ticketId, bugIds, req.tenantId],
      );

      // Fetch mapped bugs' descriptions and bug numbers
      const bugsRes = await client.query(
        `SELECT id, bug_number, title, description FROM bugs WHERE id = ANY($1::text[]) AND tenant_id = $2`,
        [bugIds, req.tenantId],
      );

      let currentDescription = ticket.description || "";
      const bugsToMap = bugsRes.rows;
      let appendHtml = "";
      for (const bug of bugsToMap) {
        const bugNum = bug.bug_number || `BUG-${bug.id.slice(-3).toUpperCase()}`;
        const bugTitle = bug.title || "Untitled Bug";
        const bugDesc = bug.description || "";
        
        if (appendHtml) {
          appendHtml += `<hr />`;
        }
        appendHtml += `<div><strong>Mapped Bug ${bugNum}: ${bugTitle}</strong><br />${bugDesc || "No description provided."}</div>`;
      }

      if (appendHtml) {
        if (currentDescription) {
          currentDescription += `<hr />` + appendHtml;
        } else {
          currentDescription = appendHtml;
        }
      }

      // Update ticket description
      await client.query(
        `UPDATE tickets SET description = $1, updated_at = NOW() WHERE id = $2 AND tenant_id = $3`,
        [currentDescription, ticketId, req.tenantId],
      );

      // Copy bug attachments to ticket_attachments
      const attachmentsRes = await client.query(
        `SELECT file_name, file_url, file_size, file_type FROM bug_attachments WHERE bug_id = ANY($1::text[])`,
        [bugIds]
      );

      if (attachmentsRes.rows.length > 0) {
        const insertQuery = `
          INSERT INTO ticket_attachments 
          (id, tenant_id, ticket_id, uploaded_by_id, file_name, file_url, file_size, file_type, uploaded_at, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        `;
        const currentTimestamp = new Date().toISOString();
        for (const attachment of attachmentsRes.rows) {
          const attachmentId = randomUUID();
          await client.query(insertQuery, [
            attachmentId,
            req.tenantId,
            ticketId,
            req.user!.id,
            attachment.file_name,
            attachment.file_url,
            Number(attachment.file_size) || 0,
            attachment.file_type || '',
            currentTimestamp,
            currentTimestamp,
            currentTimestamp,
          ]);
        }
      }

      // Record transaction
      recordTransaction({
        req,
        section: Section.WORK,
        module: Module.BUG_LIST,
        page: Page.BUG_LIST,
        action: Action.BULK_CONVERT,
        actionLabel: `Bugs mapped to ticket ${ticket.ticket_number}`,
        entityType: EntityType.BUG,
        entityId: bugIds[0],
        afterData: { ticketId, status: "converted", mappedBugCount: bugIds.length },
        changedFields: ["ticketId", "status"],
        statusCode: 200,
      });

      await client.query("COMMIT");
      res.json({ success: true, data: { ticketId, ticketNumber: ticket.ticket_number, bugIds } });
    } catch (err: any) {
      await client.query("ROLLBACK");
      console.error("bulkMapToTicket error:", err);
      bad(res, 500, err.message || "Failed to map bugs to ticket");
    } finally {
      client.release();
    }
  }

  // ==========================================================================
  // QA verify / reopen
  // ==========================================================================

  static async verifyBug(req: AuthRequest, res: Response): Promise<void> {
    if (!ensureAuth(req, res)) return;
    try {
      const r = await pool.query(
        `UPDATE bugs SET status = 'verified'
           WHERE id = $1 AND tenant_id = $2 RETURNING id`,
        [req.params.id, req.tenantId],
      );
      if (r.rowCount === 0) {
        bad(res, 404, "Bug not found");
        return;
      }
      const bug = await loadBugWithChildren(req.params.id, req.tenantId!);
      recordTransaction({
        req,
        section: Section.WORK,
        module: Module.BUG_LIST,
        page: Page.BUG_LIST,
        action: Action.VERIFY,
        actionLabel: "Bug verified",
        entityType: EntityType.BUG,
        entityId: req.params.id,
        afterData: { status: "verified" },
        changedFields: ["status"],
        statusCode: 200,
      });
      res.json({ success: true, data: bug });
    } catch (err: any) {
      console.error("verifyBug error:", err);
      bad(res, 500, err.message || "Failed to verify bug");
    }
  }

  static async reopenBug(req: AuthRequest, res: Response): Promise<void> {
    if (!ensureAuth(req, res)) return;
    try {
      const r = await pool.query(
        `UPDATE bugs SET status = 'reopened'
           WHERE id = $1 AND tenant_id = $2 RETURNING id`,
        [req.params.id, req.tenantId],
      );
      if (r.rowCount === 0) {
        bad(res, 404, "Bug not found");
        return;
      }
      const bug = await loadBugWithChildren(req.params.id, req.tenantId!);
      recordTransaction({
        req,
        section: Section.WORK,
        module: Module.BUG_LIST,
        page: Page.BUG_LIST,
        action: Action.REOPEN,
        actionLabel: "Bug reopened",
        entityType: EntityType.BUG,
        entityId: req.params.id,
        afterData: { status: "reopened" },
        changedFields: ["status"],
        statusCode: 200,
      });
      res.json({ success: true, data: bug });
    } catch (err: any) {
      console.error("reopenBug error:", err);
      bad(res, 500, err.message || "Failed to reopen bug");
    }
  }

  // ==========================================================================
  // Config: Severity options (CRUD, tenant-scoped, auto-seeded)
  // ==========================================================================

  static async listSeverityOptions(
    req: AuthRequest,
    res: Response,
  ): Promise<void> {
    if (!ensureAuth(req, res)) return;
    try {
      await ensureSeveritySeeded(req.tenantId!);
      const r = await pool.query(
        `SELECT id, key, label, description, color, sort_order, is_default, is_system, is_active,
                created_at, updated_at
           FROM bug_severity_options
          WHERE tenant_id = $1
          ORDER BY sort_order ASC, label ASC`,
        [req.tenantId],
      );
      res.json({ success: true, data: r.rows.map(shapeOption) });
    } catch (err: any) {
      console.error("listSeverityOptions error:", err);
      bad(res, 500, err.message || "Failed to load severity options");
    }
  }

  static async createSeverityOption(
    req: AuthRequest,
    res: Response,
  ): Promise<void> {
    if (!ensureAuth(req, res)) return;
    const { label, description, color, sortOrder, isDefault } = req.body;
    let { key } = req.body;
    if (!label || typeof label !== "string") {
      bad(res, 400, "Label is required");
      return;
    }
    if (!key) key = slugify(label);
    if (!key) {
      bad(res, 400, "A valid key could not be derived from the label");
      return;
    }
    try {
      // Auto-assign sort_order to (max + 10) when not provided so new rows
      // naturally land at the end of the list.
      let resolvedSortOrder: number | null =
        typeof sortOrder === "number" ? sortOrder : null;
      if (resolvedSortOrder === null) {
        const maxRes = await pool.query(
          `SELECT COALESCE(MAX(sort_order), 0)::int AS m
             FROM bug_severity_options WHERE tenant_id = $1`,
          [req.tenantId],
        );
        resolvedSortOrder = (maxRes.rows[0]?.m ?? 0) + 10;
      }
      const r = await pool.query(
        `INSERT INTO bug_severity_options
           (tenant_id, key, label, description, color, sort_order, is_default, is_system, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, false), false, true)
         RETURNING *`,
        [
          req.tenantId,
          key,
          label.trim(),
          description || null,
          color || null,
          resolvedSortOrder,
          !!isDefault,
        ],
      );
      if (isDefault) {
        await pool.query(
          `UPDATE bug_severity_options SET is_default = false
             WHERE tenant_id = $1 AND id <> $2`,
          [req.tenantId, r.rows[0].id],
        );
      }
      recordTransaction({
        req,
        section: Section.WORK,
        module: Module.BUG_LIST,
        page: Page.BUG_SETTINGS,
        action: Action.CREATE,
        actionLabel: "Severity option created",
        entityType: EntityType.BUG_SEVERITY_OPTION,
        entityId: r.rows[0].id,
        entityLabel: r.rows[0].label,
        afterData: {
          key: r.rows[0].key,
          label: r.rows[0].label,
          color: r.rows[0].color,
          isDefault: r.rows[0].is_default,
          sortOrder: r.rows[0].sort_order,
        },
        statusCode: 201,
      });
      res.status(201).json({ success: true, data: shapeOption(r.rows[0]) });
    } catch (err: any) {
      if (err.code === "23505") {
        bad(res, 409, `Severity "${key}" already exists`);
        return;
      }
      console.error("createSeverityOption error:", err);
      bad(res, 500, err.message || "Failed to create severity option");
    }
  }

  static async updateSeverityOption(
    req: AuthRequest,
    res: Response,
  ): Promise<void> {
    if (!ensureAuth(req, res)) return;
    const { id } = req.params;
    const { label, description, color, sortOrder, isDefault, isActive } = req.body;
    try {
      const beforeRes = await pool.query(
        `SELECT label, description, color, sort_order, is_default, is_active
           FROM bug_severity_options WHERE id = $1 AND tenant_id = $2`,
        [id, req.tenantId],
      );
      const beforeRow = beforeRes.rows[0];
      const r = await pool.query(
        `UPDATE bug_severity_options SET
           label       = COALESCE($1, label),
           description = COALESCE($2, description),
           color       = COALESCE($3, color),
           sort_order  = COALESCE($4, sort_order),
           is_default  = COALESCE($5, is_default),
           is_active   = COALESCE($6, is_active)
         WHERE id = $7 AND tenant_id = $8
         RETURNING *`,
        [
          label ?? null,
          description ?? null,
          color ?? null,
          typeof sortOrder === "number" ? sortOrder : null,
          typeof isDefault === "boolean" ? isDefault : null,
          typeof isActive === "boolean" ? isActive : null,
          id,
          req.tenantId,
        ],
      );
      if (r.rowCount === 0) {
        bad(res, 404, "Severity option not found");
        return;
      }
      if (isDefault === true) {
        await pool.query(
          `UPDATE bug_severity_options SET is_default = false
             WHERE tenant_id = $1 AND id <> $2`,
          [req.tenantId, id],
        );
      }
      {
        const updated = r.rows[0];
        const before = beforeRow ?? {};
        const after = {
          label: updated.label,
          description: updated.description,
          color: updated.color,
          sort_order: updated.sort_order,
          is_default: updated.is_default,
          is_active: updated.is_active,
        };
        const { changedFields, before: b, after: a } = diffShallow(before, after);
        if (changedFields.length > 0) {
          recordTransaction({
            req,
            section: Section.WORK,
            module: Module.BUG_LIST,
            page: Page.BUG_SETTINGS,
            action: Action.UPDATE,
            actionLabel: `Severity option updated (${changedFields.join(", ")})`,
            entityType: EntityType.BUG_SEVERITY_OPTION,
            entityId: id,
            entityLabel: updated.label,
            beforeData: b,
            afterData: a,
            changedFields,
            statusCode: 200,
          });
        }
      }
      res.json({ success: true, data: shapeOption(r.rows[0]) });
    } catch (err: any) {
      console.error("updateSeverityOption error:", err);
      bad(res, 500, err.message || "Failed to update severity option");
    }
  }

  static async deleteSeverityOption(
    req: AuthRequest,
    res: Response,
  ): Promise<void> {
    if (!ensureAuth(req, res)) return;
    const { id } = req.params;
    try {
      const used = await pool.query(
        `SELECT 1 FROM bugs b
           JOIN bug_severity_options o ON o.key = b.severity AND o.tenant_id = b.tenant_id
          WHERE o.id = $1 AND b.tenant_id = $2 LIMIT 1`,
        [id, req.tenantId],
      );
      if (used.rowCount && used.rowCount > 0) {
        bad(res, 409, "Cannot delete: severity is in use by existing bugs");
        return;
      }
      const r = await pool.query(
        `DELETE FROM bug_severity_options
           WHERE id = $1 AND tenant_id = $2
         RETURNING label`,
        [id, req.tenantId],
      );
      if (r.rowCount === 0) {
        bad(res, 404, "Severity not found");
        return;
      }
      recordTransaction({
        req,
        section: Section.WORK,
        module: Module.BUG_LIST,
        page: Page.BUG_SETTINGS,
        action: Action.DELETE,
        actionLabel: "Severity option deleted",
        entityType: EntityType.BUG_SEVERITY_OPTION,
        entityId: id,
        entityLabel: r.rows[0]?.label ?? null,
        statusCode: 200,
      });
      res.json({ success: true });
    } catch (err: any) {
      console.error("deleteSeverityOption error:", err);
      bad(res, 500, err.message || "Failed to delete severity option");
    }
  }

  // ==========================================================================
  // Config: Type options (CRUD)
  // ==========================================================================

  static async listTypeOptions(
    req: AuthRequest,
    res: Response,
  ): Promise<void> {
    if (!ensureAuth(req, res)) return;
    try {
      await ensureBugTypeSeeded(req.tenantId!);
      const r = await pool.query(
        `SELECT id, key, label, description, sort_order, is_default, is_system, is_active,
                created_at, updated_at
           FROM bug_type_options
          WHERE tenant_id = $1
          ORDER BY sort_order ASC, label ASC`,
        [req.tenantId],
      );
      res.json({ success: true, data: r.rows.map(shapeOption) });
    } catch (err: any) {
      console.error("listTypeOptions error:", err);
      bad(res, 500, err.message || "Failed to load type options");
    }
  }

  static async createTypeOption(
    req: AuthRequest,
    res: Response,
  ): Promise<void> {
    if (!ensureAuth(req, res)) return;
    const { label, description, sortOrder, isDefault } = req.body;
    let { key } = req.body;
    if (!label || typeof label !== "string") {
      bad(res, 400, "Label is required");
      return;
    }
    if (!key) key = slugify(label);
    if (!key) {
      bad(res, 400, "A valid key could not be derived from the label");
      return;
    }
    try {
      let resolvedSortOrder: number | null =
        typeof sortOrder === "number" ? sortOrder : null;
      if (resolvedSortOrder === null) {
        const maxRes = await pool.query(
          `SELECT COALESCE(MAX(sort_order), 0)::int AS m
             FROM bug_type_options WHERE tenant_id = $1`,
          [req.tenantId],
        );
        resolvedSortOrder = (maxRes.rows[0]?.m ?? 0) + 10;
      }
      const r = await pool.query(
        `INSERT INTO bug_type_options
           (tenant_id, key, label, description, sort_order, is_default, is_system, is_active)
         VALUES ($1, $2, $3, $4, $5, COALESCE($6, false), false, true)
         RETURNING *`,
        [
          req.tenantId,
          key,
          label.trim(),
          description || null,
          resolvedSortOrder,
          !!isDefault,
        ],
      );
      if (isDefault) {
        await pool.query(
          `UPDATE bug_type_options SET is_default = false
             WHERE tenant_id = $1 AND id <> $2`,
          [req.tenantId, r.rows[0].id],
        );
      }
      recordTransaction({
        req,
        section: Section.WORK,
        module: Module.BUG_LIST,
        page: Page.BUG_SETTINGS,
        action: Action.CREATE,
        actionLabel: "Bug type option created",
        entityType: EntityType.BUG_TYPE_OPTION,
        entityId: r.rows[0].id,
        entityLabel: r.rows[0].label,
        afterData: {
          key: r.rows[0].key,
          label: r.rows[0].label,
          isDefault: r.rows[0].is_default,
          sortOrder: r.rows[0].sort_order,
        },
        statusCode: 201,
      });
      res.status(201).json({ success: true, data: shapeOption(r.rows[0]) });
    } catch (err: any) {
      if (err.code === "23505") {
        bad(res, 409, `Type "${key}" already exists`);
        return;
      }
      console.error("createTypeOption error:", err);
      bad(res, 500, err.message || "Failed to create type option");
    }
  }

  static async updateTypeOption(
    req: AuthRequest,
    res: Response,
  ): Promise<void> {
    if (!ensureAuth(req, res)) return;
    const { id } = req.params;
    const { label, description, sortOrder, isDefault, isActive } = req.body;
    try {
      const beforeRes = await pool.query(
        `SELECT label, description, sort_order, is_default, is_active
           FROM bug_type_options WHERE id = $1 AND tenant_id = $2`,
        [id, req.tenantId],
      );
      const beforeRow = beforeRes.rows[0];
      const r = await pool.query(
        `UPDATE bug_type_options SET
           label       = COALESCE($1, label),
           description = COALESCE($2, description),
           sort_order  = COALESCE($3, sort_order),
           is_default  = COALESCE($4, is_default),
           is_active   = COALESCE($5, is_active)
         WHERE id = $6 AND tenant_id = $7
         RETURNING *`,
        [
          label ?? null,
          description ?? null,
          typeof sortOrder === "number" ? sortOrder : null,
          typeof isDefault === "boolean" ? isDefault : null,
          typeof isActive === "boolean" ? isActive : null,
          id,
          req.tenantId,
        ],
      );
      if (r.rowCount === 0) {
        bad(res, 404, "Type option not found");
        return;
      }
      if (isDefault === true) {
        await pool.query(
          `UPDATE bug_type_options SET is_default = false
             WHERE tenant_id = $1 AND id <> $2`,
          [req.tenantId, id],
        );
      }
      {
        const updated = r.rows[0];
        const before = beforeRow ?? {};
        const after = {
          label: updated.label,
          description: updated.description,
          sort_order: updated.sort_order,
          is_default: updated.is_default,
          is_active: updated.is_active,
        };
        const { changedFields, before: b, after: a } = diffShallow(before, after);
        if (changedFields.length > 0) {
          recordTransaction({
            req,
            section: Section.WORK,
            module: Module.BUG_LIST,
            page: Page.BUG_SETTINGS,
            action: Action.UPDATE,
            actionLabel: `Bug type option updated (${changedFields.join(", ")})`,
            entityType: EntityType.BUG_TYPE_OPTION,
            entityId: id,
            entityLabel: updated.label,
            beforeData: b,
            afterData: a,
            changedFields,
            statusCode: 200,
          });
        }
      }
      res.json({ success: true, data: shapeOption(r.rows[0]) });
    } catch (err: any) {
      console.error("updateTypeOption error:", err);
      bad(res, 500, err.message || "Failed to update type option");
    }
  }

  static async deleteTypeOption(
    req: AuthRequest,
    res: Response,
  ): Promise<void> {
    if (!ensureAuth(req, res)) return;
    const { id } = req.params;
    try {
      const used = await pool.query(
        `SELECT 1 FROM bugs b
           JOIN bug_type_options o ON o.key = b.bug_type AND o.tenant_id = b.tenant_id
          WHERE o.id = $1 AND b.tenant_id = $2 LIMIT 1`,
        [id, req.tenantId],
      );
      if (used.rowCount && used.rowCount > 0) {
        bad(res, 409, "Cannot delete: type is in use by existing bugs");
        return;
      }
      const r = await pool.query(
        `DELETE FROM bug_type_options
           WHERE id = $1 AND tenant_id = $2
         RETURNING label`,
        [id, req.tenantId],
      );
      if (r.rowCount === 0) {
        bad(res, 404, "Type not found");
        return;
      }
      recordTransaction({
        req,
        section: Section.WORK,
        module: Module.BUG_LIST,
        page: Page.BUG_SETTINGS,
        action: Action.DELETE,
        actionLabel: "Bug type option deleted",
        entityType: EntityType.BUG_TYPE_OPTION,
        entityId: id,
        entityLabel: r.rows[0]?.label ?? null,
        statusCode: 200,
      });
      res.json({ success: true });
    } catch (err: any) {
      console.error("deleteTypeOption error:", err);
      bad(res, 500, err.message || "Failed to delete type option");
    }
  }
}

function shapeOption(row: any) {
  return {
    id: row.id,
    key: row.key,
    label: row.label,
    description: row.description,
    color: row.color,
    sortOrder: row.sort_order,
    isDefault: row.is_default,
    isSystem: row.is_system,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
