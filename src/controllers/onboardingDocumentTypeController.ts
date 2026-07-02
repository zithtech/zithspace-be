import { Response } from "express";
import { AuthRequest } from "@/types";
import { withTenant } from "@/db/onboardingPool";
import { recordTransaction, Section, Module, Page, Action, EntityType, diffShallow } from "@/utils/transactionHistory";

const docTypeSnapshot = (r: any) => ({
  name: r.name,
  description: r.description ?? null,
  isActive: r.is_active,
});

// CRUD for the tenant catalog of "documents needed" from a previous employer.
// Raw SQL on the onboarding pool (onboarding_document_types table).

function mapRow(r: any) {
  return {
    id: r.id,
    name: r.name,
    description: r.description ?? null,
    isActive: r.is_active,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/** GET /api/onboarding/document-types */
export async function listDocumentTypes(req: AuthRequest, res: Response) {
  try {
    if (!req.user?.id || !req.tenantId) throw new Error("Unauthorized");
    const data = await withTenant(req.tenantId, async (db) => {
      const { rows } = await db.query(
        `SELECT * FROM onboarding_document_types
          WHERE tenant_id = $1 AND deleted_at IS NULL
          ORDER BY name ASC`,
        [req.tenantId],
      );
      return rows.map(mapRow);
    });
    return res.status(200).json({ success: true, data });
  } catch (err: any) {
    console.error("listDocumentTypes error:", err);
    return res.status(500).json({ success: false, error: err.message || "Internal Server Error" });
  }
}

/** POST /api/onboarding/document-types */
export async function createDocumentType(req: AuthRequest, res: Response) {
  try {
    if (!req.user?.id || !req.tenantId) throw new Error("Unauthorized");
    const name = (req.body?.name || "").trim();
    const description = (req.body?.description || "").trim() || null;
    if (!name) {
      return res.status(400).json({ success: false, error: "Document name is required" });
    }

    const row = await withTenant(req.tenantId, async (db) => {
      // Reject duplicates (case-insensitive) among non-deleted rows.
      const dupe = await db.query(
        `SELECT 1 FROM onboarding_document_types
          WHERE tenant_id = $1 AND lower(name) = lower($2) AND deleted_at IS NULL
          LIMIT 1`,
        [req.tenantId, name],
      );
      if (dupe.rows[0]) {
        const e: any = new Error(`"${name}" already exists`);
        e.code = "DUPLICATE";
        throw e;
      }
      const { rows } = await db.query(
        `INSERT INTO onboarding_document_types
           (tenant_id, name, description, created_by)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [req.tenantId, name, description, req.user!.id],
      );
      return rows[0];
    });

    recordTransaction({
      req,
      section: Section.HR,
      module: Module.ONBOARDING,
      page: Page.ONBOARDING_DOCUMENT_TYPES,
      action: Action.CREATE,
      actionLabel: `Created onboarding document type "${row.name}"`,
      entityType: EntityType.ONBOARDING_DOCUMENT_TYPE,
      entityId: row.id,
      entityLabel: row.name,
      afterData: docTypeSnapshot(row),
    });

    return res.status(201).json({ success: true, data: mapRow(row) });
  } catch (err: any) {
    if (err.code === "DUPLICATE") return res.status(409).json({ success: false, error: err.message });
    console.error("createDocumentType error:", err);
    return res.status(500).json({ success: false, error: err.message || "Internal Server Error" });
  }
}

/** PUT /api/onboarding/document-types/:id */
export async function updateDocumentType(req: AuthRequest, res: Response) {
  try {
    if (!req.user?.id || !req.tenantId) throw new Error("Unauthorized");
    const { id } = req.params;
    const name = (req.body?.name || "").trim();
    const description = req.body?.description !== undefined ? (req.body.description || "").trim() || null : undefined;
    const isActive = req.body?.isActive;

    const result = await withTenant(req.tenantId, async (db) => {
      const beforeRes = await db.query(
        `SELECT * FROM onboarding_document_types
          WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL`,
        [req.tenantId, id],
      );
      const before = beforeRes.rows[0];
      if (!before) return null;

      const sets: string[] = [];
      const params: any[] = [req.tenantId, id];
      if (name) {
        params.push(name);
        sets.push(`name = $${params.length}`);
      }
      if (description !== undefined) {
        params.push(description);
        sets.push(`description = $${params.length}`);
      }
      if (typeof isActive === "boolean") {
        params.push(isActive);
        sets.push(`is_active = $${params.length}`);
      }
      if (sets.length === 0) return { before, after: before };
      sets.push("updated_at = now()");
      const { rows } = await db.query(
        `UPDATE onboarding_document_types
            SET ${sets.join(", ")}
          WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL
          RETURNING *`,
        params,
      );
      return { before, after: rows[0] || null };
    });

    if (!result || !result.after) return res.status(404).json({ success: false, error: "Document type not found" });
    const row = result.after;

    const { changedFields, before: b, after: a } = diffShallow(docTypeSnapshot(result.before), docTypeSnapshot(row));
    if (changedFields.length > 0) {
      recordTransaction({
        req,
        section: Section.HR,
        module: Module.ONBOARDING,
        page: Page.ONBOARDING_DOCUMENT_TYPES,
        action: Action.UPDATE,
        actionLabel: `Updated onboarding document type "${row.name}"`,
        entityType: EntityType.ONBOARDING_DOCUMENT_TYPE,
        entityId: id,
        entityLabel: row.name,
        beforeData: b,
        afterData: a,
        changedFields,
      });
    }

    return res.status(200).json({ success: true, data: mapRow(row) });
  } catch (err: any) {
    console.error("updateDocumentType error:", err);
    return res.status(500).json({ success: false, error: err.message || "Internal Server Error" });
  }
}

/** DELETE /api/onboarding/document-types/:id (soft delete) */
export async function deleteDocumentType(req: AuthRequest, res: Response) {
  try {
    if (!req.user?.id || !req.tenantId) throw new Error("Unauthorized");
    const { id } = req.params;
    const deleted = await withTenant(req.tenantId, async (db) => {
      const { rows } = await db.query(
        `UPDATE onboarding_document_types
            SET deleted_at = now(), updated_at = now()
          WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL
          RETURNING *`,
        [req.tenantId, id],
      );
      return rows[0] || null;
    });
    if (!deleted) return res.status(404).json({ success: false, error: "Document type not found" });

    recordTransaction({
      req,
      section: Section.HR,
      module: Module.ONBOARDING,
      page: Page.ONBOARDING_DOCUMENT_TYPES,
      action: Action.DELETE,
      actionLabel: `Deleted onboarding document type "${deleted.name}"`,
      entityType: EntityType.ONBOARDING_DOCUMENT_TYPE,
      entityId: id,
      entityLabel: deleted.name,
      beforeData: docTypeSnapshot(deleted),
    });

    return res.status(200).json({ success: true, message: "Document type deleted" });
  } catch (err: any) {
    console.error("deleteDocumentType error:", err);
    return res.status(500).json({ success: false, error: err.message || "Internal Server Error" });
  }
}

/** Internal helper — fetch active doc-type names for a tenant (used by the
 *  public invite endpoint, which has no auth context). */
export async function fetchActiveDocumentTypes(
  db: { query: (t: string, p?: any[]) => Promise<any> },
  tenantId: string,
) {
  const { rows } = await db.query(
    `SELECT id, name, description FROM onboarding_document_types
      WHERE tenant_id = $1 AND deleted_at IS NULL AND is_active = true
      ORDER BY name ASC`,
    [tenantId],
  );
  return rows.map((r: any) => ({ id: r.id, name: r.name, description: r.description ?? null }));
}
