import { Request, Response } from "express";
import pool from "@/config/dbpool";

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
   * GET /api/client-portal/documents?category=&search=
   * Returns every document attached to the portal user's CRM client, with
   * optional category/search narrowing and a view-row joined in.
   */
  static async list(req: Request, res: Response): Promise<void> {
    const ctx = req.portalUser;
    if (!ctx) {
      res.status(401).json({ success: false, error: "Not authenticated" });
      return;
    }

    const category = ((req.query.category as string) || "").trim();
    const search = ((req.query.search as string) || "").trim();

    const params: any[] = [ctx.tenantId, ctx.clientId, ctx.portalUserId];
    let where = `WHERE d.tenant_id = $1 AND d.client_id = $2`;

    if (category) {
      params.push(category);
      where += ` AND LOWER(d.category) = LOWER($${params.length})`;
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
              v.first_viewed_at, v.last_viewed_at, v.view_count,
              v.download_count, v.last_event,
              u.name AS uploaded_by_name
         FROM client_documents_v2 d
         LEFT JOIN client_document_portal_views v
                ON v.document_id = d.id AND v.portal_user_id = $3
         LEFT JOIN users u ON u.id = d.uploaded_by_id
         ${where}
         ORDER BY d.created_at DESC`,
      params,
    );

    const docs = r.rows.map((row) => ({
      id: row.id,
      category: row.category,
      documentType: row.document_type,
      fileName: row.file_name,
      fileUrl: row.file_url,
      version: row.version,
      tags: row.tags || [],
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      uploadedByName: row.uploaded_by_name,
      firstViewedAt: row.first_viewed_at,
      lastViewedAt: row.last_viewed_at,
      viewCount: row.view_count || 0,
      downloadCount: row.download_count || 0,
      lastEvent: row.last_event || null,
    }));

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

    res.json({
      success: true,
      data: docs,
      meta: {
        total: docs.length,
        groups,
        categories: Array.from(new Set(docs.map((d) => d.category).filter(Boolean))),
      },
    });
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
}

export default ClientPortalDocumentController;
