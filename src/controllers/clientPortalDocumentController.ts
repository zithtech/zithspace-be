import { Request, Response } from "express";
import pool from "@/config/dbpool";
import { uploadClientDocumentToR2, deleteFileFromR2, generatePresignedUrl, getFileBufferFromR2 } from "@/utils/r2Client";
import { socketService } from "@/services/socketService";

/**
 * Preferred display order for known canonical categories. Anything not in this
 * list still shows up — just sorted after the canonical ones alphabetically.
 */
const CANONICAL_CATEGORY_ORDER = [
  "Agreements",
  "NDA",
  "SOW",
  "Proposal",
  "Architecture",
  "Architecture docs",
  "API docs",
  "Deployment",
  "Deployment docs",
  "Credentials",
  "Credentials handover",
  "Training",
  "Training docs",
  "QA reports",
  "Release notes",
  "Technical docs",
];

function categoryRank(category: string | null): number {
  if (!category) return 9999;
  const idx = CANONICAL_CATEGORY_ORDER.findIndex(
    (c) => c.toLowerCase() === category.toLowerCase(),
  );
  return idx === -1 ? 1000 : idx;
}

export class ClientPortalDocumentController {
  /**
   * GET /api/client-portal/documents?category=&search=&projectId=&source=
   *
   * source: 'all' | 'client' | 'internal'
   *   - 'client'   → only docs uploaded via the portal (uploaded_by_portal_user_id IS NOT NULL)
   *   - 'internal' → only docs uploaded by staff (uploaded_by_portal_user_id IS NULL)
   *   - 'all' / unset → no source filter
   */
  static async list(req: Request, res: Response): Promise<void> {
    const ctx = req.portalUser;
    if (!ctx) {
      res.status(401).json({ success: false, error: "Not authenticated" });
      return;
    }

    const category = ((req.query.category as string) || "").trim();
    const search = ((req.query.search as string) || "").trim();
    const projectId = ((req.query.projectId as string) || "").trim();
    const source = ((req.query.source as string) || "").trim().toLowerCase();

    const params: any[] = [ctx.tenantId, ctx.clientId, ctx.portalUserId];
    let where = `WHERE d.tenant_id = $1 AND d.client_id = $2`;

    if (category) {
      params.push(category);
      where += ` AND LOWER(d.category) = LOWER($${params.length})`;
    }
    if (projectId) {
      params.push(projectId);
      where += ` AND d.project_id = $${params.length}`;
    }
    if (source === "client") {
      where += ` AND d.uploaded_by_portal_user_id IS NOT NULL`;
    } else if (source === "internal") {
      where += ` AND d.uploaded_by_portal_user_id IS NULL`;
    }
    if (search) {
      params.push(`%${search}%`);
      where += ` AND (d.file_name ILIKE $${params.length}
                  OR d.document_type ILIKE $${params.length}
                  OR EXISTS (
                    SELECT 1 FROM unnest(d.tags) tg
                     WHERE tg ILIKE $${params.length}
                  ))`;
    }

    const r = await pool.query(
      `SELECT d.id, d.category, d.document_type, d.file_name, d.file_url,
              d.version, d.tags, d.created_at, d.updated_at,
              d.project_id,
              p.name AS project_name, p.code AS project_code,
              v.first_viewed_at, v.last_viewed_at, v.view_count,
              v.download_count, v.last_event,
              COALESCE(u.name, pu.display_name, pu.username) AS uploaded_by_name,
              (d.uploaded_by_portal_user_id IS NOT NULL) AS uploaded_by_portal
         FROM client_documents_v2 d
         LEFT JOIN client_document_portal_views v
                ON v.document_id = d.id AND v.portal_user_id = $3
         LEFT JOIN users u ON u.id = d.uploaded_by_id
         LEFT JOIN client_portal_users pu ON pu.id = d.uploaded_by_portal_user_id
         LEFT JOIN projects p ON p.id = d.project_id
         ${where}
         ORDER BY d.created_at DESC`,
      params,
    );

    const docs = await Promise.all(
      r.rows.map(async (row) => {
        let signedUrl = row.file_url;
        if (row.file_url && (row.file_url.includes('r2.cloudflarestorage.com') || row.file_url.includes('r2.dev') || (process.env.CF_R2_PUBLIC_URL && row.file_url.includes(process.env.CF_R2_PUBLIC_URL)))) {
          try {
            signedUrl = await generatePresignedUrl(row.file_url, 86400);
          } catch (err) {
            console.error(`Failed to generate presigned URL for document ${row.id}:`, err);
          }
        }
        return {
          id: row.id,
          category: row.category,
          documentType: row.document_type,
          fileName: row.file_name,
          fileUrl: signedUrl,
          version: row.version,
          tags: row.tags || [],
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          projectId: row.project_id,
          projectName: row.project_name,
          projectCode: row.project_code,
          uploadedByName: row.uploaded_by_name,
          uploadedByPortal: row.uploaded_by_portal === true,
          firstViewedAt: row.first_viewed_at,
          lastViewedAt: row.last_viewed_at,
          viewCount: row.view_count || 0,
          downloadCount: row.download_count || 0,
          lastEvent: row.last_event || null,
        };
      })
    );

    // Build category groups for the FE (preserves canonical ordering)
    const groupsMap = new Map<string, typeof docs>();
    for (const d of docs) {
      const key = d.category || "Uncategorised";
      if (!groupsMap.has(key)) groupsMap.set(key, []);
      groupsMap.get(key)!.push(d);
    }
    const groups = Array.from(groupsMap.entries())
      .map(([category, items]) => ({
        category,
        items,
        count: items.length,
      }))
      .sort((a, b) => {
        const ra = categoryRank(a.category);
        const rb = categoryRank(b.category);
        if (ra !== rb) return ra - rb;
        return a.category.localeCompare(b.category);
      });

    // Distinct projects across this client's docs — used to populate the FE
    // project filter dropdown. Built off the unfiltered client/tenant scope so
    // the dropdown stays stable when a project filter is already applied.
    const projectsRes = await pool.query(
      `SELECT DISTINCT p.id, p.name, p.code
         FROM client_documents_v2 d
         JOIN projects p ON p.id = d.project_id
        WHERE d.tenant_id = $1 AND d.client_id = $2
        ORDER BY p.name ASC`,
      [ctx.tenantId, ctx.clientId],
    );

    // Source counts (always over client scope, ignoring active filters) so the
    // segmented filter can show counts like "All 42 · Client 7 · Internal 35".
    const countsRes = await pool.query(
      `SELECT
         COUNT(*)::int AS total,
         SUM(CASE WHEN uploaded_by_portal_user_id IS NOT NULL THEN 1 ELSE 0 END)::int AS client_count,
         SUM(CASE WHEN uploaded_by_portal_user_id IS NULL THEN 1 ELSE 0 END)::int AS internal_count
         FROM client_documents_v2
        WHERE tenant_id = $1 AND client_id = $2`,
      [ctx.tenantId, ctx.clientId],
    );
    const counts = countsRes.rows[0] || { total: 0, client_count: 0, internal_count: 0 };

    res.json({
      success: true,
      data: docs,
      meta: {
        total: docs.length,
        groups,
        categories: Array.from(new Set(docs.map((d) => d.category).filter(Boolean))),
        projects: projectsRes.rows,
        sourceCounts: {
          all: counts.total || 0,
          client: counts.client_count || 0,
          internal: counts.internal_count || 0,
        },
      },
    });
  }

  /**
   * POST /api/client-portal/documents
   * body: { base64?, externalUrl?, fileName?, category?, documentType?, projectId? }
   * Lets the client portal user upload a file or attach an external URL.
   * One of base64 / externalUrl is required. projectId is optional — when
   * provided, the doc is associated to a specific project for filtering.
   */
  static async create(req: Request, res: Response): Promise<void> {
    const ctx = req.portalUser;
    if (!ctx) {
      res.status(401).json({ success: false, error: "Not authenticated" });
      return;
    }
    const b = req.body || {};
    const base64 = typeof b.base64 === "string" ? b.base64 : null;
    const externalUrl =
      typeof b.externalUrl === "string" ? b.externalUrl.trim() : null;
    const reqFileName =
      typeof b.fileName === "string" ? b.fileName.trim() : null;
    const category =
      (typeof b.category === "string" && b.category.trim()) ||
      "Client Uploads";
    const documentType =
      (typeof b.documentType === "string" && b.documentType.trim()) ||
      "Attachment";
    const projectId =
      typeof b.projectId === "string" && b.projectId.trim()
        ? b.projectId.trim()
        : null;

    if (!base64 && !externalUrl) {
      res
        .status(400)
        .json({ success: false, error: "Provide a file or a link" });
      return;
    }
    if (base64 && !reqFileName) {
      res
        .status(400)
        .json({ success: false, error: "fileName is required for uploads" });
      return;
    }

    let fileUrl: string;
    let resolvedFileName: string;

    if (externalUrl) {
      try {
        new URL(externalUrl);
      } catch {
        res
          .status(400)
          .json({ success: false, error: "Link is not a valid URL" });
        return;
      }
      fileUrl = externalUrl;
      if (reqFileName) {
        resolvedFileName = reqFileName;
      } else {
        try {
          const u = new URL(externalUrl);
          const last = u.pathname.split("/").filter(Boolean).pop();
          resolvedFileName = last ? decodeURIComponent(last) : u.hostname;
        } catch {
          resolvedFileName = externalUrl;
        }
      }
    } else {
      resolvedFileName = reqFileName!;
      try {
        fileUrl = await uploadClientDocumentToR2(
          base64!,
          resolvedFileName,
          ctx.tenantId,
          ctx.clientId,
          category,
          documentType,
        );
      } catch (err: any) {
        console.error("[portal] document upload to R2 failed:", err);
        res
          .status(500)
          .json({ success: false, error: "Failed to upload file" });
        return;
      }
    }

    const ins = await pool.query(
      `INSERT INTO client_documents_v2
         (id, tenant_id, client_id, category, document_type,
          file_name, file_url, uploaded_by_portal_user_id, project_id,
          created_at, updated_at)
       VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, $7, $8,
               NOW(), NOW())
       RETURNING id, category, document_type, file_name, file_url,
                 version, tags, project_id, created_at, updated_at`,
      [
        ctx.tenantId,
        ctx.clientId,
        category,
        documentType,
        resolvedFileName,
        fileUrl,
        ctx.portalUserId,
        projectId,
      ],
    );

    const row = ins.rows[0];
    // Resolve project name/code if we got a projectId, so the FE can render
    // without a follow-up fetch.
    let projectName: string | null = null;
    let projectCode: string | null = null;
    if (row.project_id) {
      const p = await pool.query(
        `SELECT name, code FROM projects WHERE id = $1`,
        [row.project_id],
      );
      if (p.rows[0]) {
        projectName = p.rows[0].name;
        projectCode = p.rows[0].code;
      }
    }
    socketService.emitToClient(
      ctx.tenantId,
      ctx.clientId,
      "client_document:created",
      { clientId: ctx.clientId, document: { id: row.id } },
    );

    let responseFileUrl = row.file_url;
    if (row.file_url && (row.file_url.includes('r2.cloudflarestorage.com') || row.file_url.includes('r2.dev') || (process.env.CF_R2_PUBLIC_URL && row.file_url.includes(process.env.CF_R2_PUBLIC_URL)))) {
      try {
        responseFileUrl = await generatePresignedUrl(row.file_url, 86400);
      } catch (err) {
        console.error(`Failed to generate presigned URL for document ${row.id}:`, err);
      }
    }

    res.status(201).json({
      success: true,
      data: {
        id: row.id,
        category: row.category,
        documentType: row.document_type,
        fileName: row.file_name,
        fileUrl: responseFileUrl,
        version: row.version,
        tags: row.tags || [],
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        projectId: row.project_id,
        projectName,
        projectCode,
        uploadedByName: null,
        uploadedByPortal: true,
        firstViewedAt: null,
        lastViewedAt: null,
        viewCount: 0,
        downloadCount: 0,
        lastEvent: null,
      },
    });
  }

  /**
   * PATCH /api/client-portal/documents/:id
   * body: { fileName?, category?, documentType?, projectId? }
   * Portal users may only edit metadata on documents they uploaded themselves.
   */
  static async update(req: Request, res: Response): Promise<void> {
    const ctx = req.portalUser;
    if (!ctx) {
      res.status(401).json({ success: false, error: "Not authenticated" });
      return;
    }
    const { id } = req.params;
    const b = req.body || {};
    const fileName = typeof b.fileName === "string" ? b.fileName.trim() : undefined;
    const category = typeof b.category === "string" ? b.category.trim() : undefined;
    const documentType =
      typeof b.documentType === "string" ? b.documentType.trim() : undefined;
    const projectId =
      b.projectId === null
        ? null
        : typeof b.projectId === "string" && b.projectId.trim()
          ? b.projectId.trim()
          : undefined;

    if (
      fileName === undefined &&
      category === undefined &&
      documentType === undefined &&
      projectId === undefined
    ) {
      res.status(400).json({ success: false, error: "Nothing to update" });
      return;
    }
    if (fileName === "" || category === "" || documentType === "") {
      res.status(400).json({
        success: false,
        error: "fileName, category and documentType cannot be empty",
      });
      return;
    }

    const owns = await pool.query(
      `SELECT id FROM client_documents_v2
        WHERE id = $1 AND tenant_id = $2 AND client_id = $3
          AND uploaded_by_portal_user_id = $4`,
      [id, ctx.tenantId, ctx.clientId, ctx.portalUserId],
    );
    if (owns.rowCount === 0) {
      res.status(404).json({
        success: false,
        error: "Document not found or not editable",
      });
      return;
    }

    const sets: string[] = [];
    const params: any[] = [];
    if (fileName !== undefined) {
      params.push(fileName);
      sets.push(`file_name = $${params.length}`);
    }
    if (category !== undefined) {
      params.push(category);
      sets.push(`category = $${params.length}`);
    }
    if (documentType !== undefined) {
      params.push(documentType);
      sets.push(`document_type = $${params.length}`);
    }
    if (projectId !== undefined) {
      params.push(projectId);
      sets.push(`project_id = $${params.length}`);
    }
    sets.push(`updated_at = NOW()`);

    params.push(id);
    const r = await pool.query(
      `UPDATE client_documents_v2
          SET ${sets.join(", ")}
        WHERE id = $${params.length}
        RETURNING id, category, document_type, file_name, file_url,
                  version, tags, project_id, created_at, updated_at`,
      params,
    );

    const row = r.rows[0];
    let projectName: string | null = null;
    let projectCode: string | null = null;
    if (row.project_id) {
      const p = await pool.query(
        `SELECT name, code FROM projects WHERE id = $1`,
        [row.project_id],
      );
      if (p.rows[0]) {
        projectName = p.rows[0].name;
        projectCode = p.rows[0].code;
      }
    }

    socketService.emitToClient(
      ctx.tenantId,
      ctx.clientId,
      "client_document:updated",
      { clientId: ctx.clientId, id: row.id },
    );

    let responseFileUrl = row.file_url;
    if (row.file_url && (row.file_url.includes('r2.cloudflarestorage.com') || row.file_url.includes('r2.dev') || (process.env.CF_R2_PUBLIC_URL && row.file_url.includes(process.env.CF_R2_PUBLIC_URL)))) {
      try {
        responseFileUrl = await generatePresignedUrl(row.file_url, 86400);
      } catch (err) {
        console.error(`Failed to generate presigned URL for document ${row.id}:`, err);
      }
    }

    res.json({
      success: true,
      data: {
        id: row.id,
        category: row.category,
        documentType: row.document_type,
        fileName: row.file_name,
        fileUrl: responseFileUrl,
        version: row.version,
        tags: row.tags || [],
        projectId: row.project_id,
        projectName,
        projectCode,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      },
    });
  }

  /**
   * DELETE /api/client-portal/documents/:id
   * Portal users may only delete their own uploads.
   */
  static async remove(req: Request, res: Response): Promise<void> {
    const ctx = req.portalUser;
    if (!ctx) {
      res.status(401).json({ success: false, error: "Not authenticated" });
      return;
    }
    const { id } = req.params;

    const doc = await pool.query(
      `SELECT file_url FROM client_documents_v2
        WHERE id = $1 AND tenant_id = $2 AND client_id = $3
          AND uploaded_by_portal_user_id = $4`,
      [id, ctx.tenantId, ctx.clientId, ctx.portalUserId],
    );
    if (doc.rowCount === 0) {
      res.status(404).json({
        success: false,
        error: "Document not found or not deletable",
      });
      return;
    }

    const fileUrl: string | null = doc.rows[0].file_url;
    if (fileUrl) {
      try {
        await deleteFileFromR2(fileUrl, ctx.tenantId);
      } catch (err) {
        // Non-R2 (external link) URLs will safely no-op or throw — either way,
        // proceed with the DB delete so the user isn't blocked.
        console.warn("[portal] R2 delete skipped/failed:", err);
      }
    }

    await pool.query(`DELETE FROM client_documents_v2 WHERE id = $1`, [id]);
    socketService.emitToClient(
      ctx.tenantId,
      ctx.clientId,
      "client_document:deleted",
      { clientId: ctx.clientId, id },
    );
    res.json({ success: true });
  }

  /**
   * POST /api/client-portal/documents/:id/track
   * body: { event: 'view' | 'download' }
   * Idempotent counter bump. Returns 204 — UI doesn't need a body.
   */
  static async track(req: Request, res: Response): Promise<void> {
    const ctx = req.portalUser;
    if (!ctx) {
      res.status(401).json({ success: false, error: "Not authenticated" });
      return;
    }
    const { id } = req.params;
    const event = (req.body?.event === "download" ? "download" : "view") as
      | "view"
      | "download";

    // Verify the document belongs to the portal user's client
    const doc = await pool.query(
      `SELECT 1 FROM client_documents_v2
        WHERE id = $1 AND tenant_id = $2 AND client_id = $3`,
      [id, ctx.tenantId, ctx.clientId],
    );
    if (doc.rowCount === 0) {
      res.status(404).json({ success: false, error: "Document not found" });
      return;
    }

    await pool.query(
      `INSERT INTO client_document_portal_views
         (tenant_id, document_id, portal_user_id, view_count,
          download_count, last_event)
       VALUES ($1, $2, $3,
               CASE WHEN $4 = 'view' THEN 1 ELSE 0 END,
               CASE WHEN $4 = 'download' THEN 1 ELSE 0 END,
               $4)
       ON CONFLICT (document_id, portal_user_id) DO UPDATE
          SET last_viewed_at = NOW(),
              view_count = client_document_portal_views.view_count
                           + CASE WHEN $4 = 'view' THEN 1 ELSE 0 END,
              download_count = client_document_portal_views.download_count
                           + CASE WHEN $4 = 'download' THEN 1 ELSE 0 END,
              last_event = $4`,
      [ctx.tenantId, id, ctx.portalUserId, event],
    );

    res.status(204).end();
  }

  /**
   * GET /api/client-portal/documents/:id/download
   * Securely download document using R2 buffer fetch.
   */
  static async download(req: Request, res: Response): Promise<void> {
    try {
      const ctx = req.portalUser;
      if (!ctx) {
        res.status(401).json({ success: false, error: "Not authenticated" });
        return;
      }

      const { id } = req.params;

      const r = await pool.query(
        `SELECT file_name, file_url FROM client_documents_v2
          WHERE id = $1 AND tenant_id = $2 AND client_id = $3`,
        [id, ctx.tenantId, ctx.clientId],
      );

      if (r.rowCount === 0) {
        res.status(404).json({ success: false, error: "Document not found" });
        return;
      }

      const row = r.rows[0];
      if (!row.file_url) {
        res.status(400).json({ success: false, error: "Document has no file URL" });
        return;
      }

      const isR2Url = row.file_url.includes('r2.cloudflarestorage.com') || 
                      row.file_url.includes('r2.dev') ||
                      (process.env.CF_R2_PUBLIC_URL && row.file_url.includes(process.env.CF_R2_PUBLIC_URL));

      if (!isR2Url) {
        res.redirect(row.file_url);
        return;
      }

      const fileBuffer = await getFileBufferFromR2(row.file_url);

      const fileExtension = row.file_name.split('.').pop()?.toLowerCase();
      let contentType = 'application/octet-stream';
      if (fileExtension === 'pdf') contentType = 'application/pdf';
      else if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(fileExtension || '')) contentType = `image/${fileExtension}`;

      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(row.file_name)}"`);
      
      res.send(fileBuffer);
    } catch (error: any) {
      console.error('Portal download document error:', error);
      res.status(500).json({ success: false, error: 'Failed to download document' });
    }
  }
}

export default ClientPortalDocumentController;
