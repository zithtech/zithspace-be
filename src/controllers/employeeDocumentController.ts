import fs from "fs";
import { Response } from "express";
import { AuthRequest } from "@/types";
import { withTenant, TenantClient } from "@/db/onboardingPool";
import { uploadEmployeeDocumentToR2, generatePresignedUrl } from "@/utils/r2Client";

async function withClient<T>(
  req: AuthRequest,
  client: TenantClient | undefined,
  fn: (db: TenantClient) => Promise<T>,
): Promise<T> {
  if (client) return fn(client);
  return withTenant(req.tenantId as string, fn);
}

// ── Helpers ────────────────────────────────────────────────────────────────

function mapRow(r: any) {
  return {
    id: r.id,
    employeeId: r.employee_id,
    employeeName: r.employee_name || null,
    documentName: r.document_name || r.document_type,
    documentType: r.document_type,
    documentUrl: r.document_url,
    status: r.status || "uploaded",
    expiryDate: r.expiry_date || null,
    notes: r.notes || null,
    uploadedAt: r.uploaded_at,
    createdById: r.created_by_id || null,
    uploadedByName: r.uploaded_by_name || null,
  };
}

// Idempotent column additions (runs inline before each query)
async function ensureColumns(db: any) {
  await db.query(`ALTER TABLE employee_documents ADD COLUMN IF NOT EXISTS document_name text`);
  await db.query(`ALTER TABLE employee_documents ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'uploaded'`);
  await db.query(`ALTER TABLE employee_documents ADD COLUMN IF NOT EXISTS expiry_date date`);
  await db.query(`ALTER TABLE employee_documents ADD COLUMN IF NOT EXISTS notes text`);
  await db.query(`ALTER TABLE employee_documents ADD COLUMN IF NOT EXISTS tenant_id uuid`);
  await db.query(`ALTER TABLE employee_documents ADD COLUMN IF NOT EXISTS deleted_at timestamptz`);
  await db.query(
    `CREATE INDEX IF NOT EXISTS ix_emp_docs_tenant ON employee_documents (tenant_id) WHERE deleted_at IS NULL`,
  );
  await db.query(
    `CREATE INDEX IF NOT EXISTS ix_emp_docs_employee ON employee_documents (employee_id) WHERE deleted_at IS NULL`,
  );
}

// ── GET /api/onboarding/employee-documents ────────────────────────────────

export async function listEmployeeDocuments(req: AuthRequest, res: Response) {
  try {
    if (!req.user?.id || !req.tenantId) throw new Error("Unauthorized");

    const { employeeId, documentType, status, search } = req.query as Record<string, string>;

    const result = await withTenant(req.tenantId, async (db) => {
      await ensureColumns(db);

      const conditions: string[] = ["ed.deleted_at IS NULL", "ed.tenant_id = $1"];
      const params: any[] = [req.tenantId];

      if (employeeId) {
        params.push(employeeId);
        conditions.push(`ed.employee_id = $${params.length}`);
      }
      if (documentType) {
        params.push(documentType);
        conditions.push(`ed.document_type = $${params.length}`);
      }
      if (status) {
        params.push(status);
        conditions.push(`ed.status = $${params.length}`);
      }
      if (search) {
        params.push(`%${search.toLowerCase()}%`);
        const n = params.length;
        conditions.push(
          `(LOWER(COALESCE(ed.document_name, ed.document_type)) LIKE $${n} OR LOWER(e.name) LIKE $${n} OR LOWER(emp.first_name || ' ' || emp.last_name) LIKE $${n})`,
        );
      }

      const where = conditions.join(" AND ");
      const { rows } = await db.query(
        `SELECT
            ed.*,
            COALESCE(e.name, NULLIF(TRIM(CONCAT(emp.first_name, ' ', emp.last_name)), '')) AS employee_name,
            u.name AS uploaded_by_name
          FROM employee_documents ed
          LEFT JOIN users e ON e.id::text = ed.employee_id::text
          LEFT JOIN employees emp ON emp.id::text = ed.employee_id::text
          LEFT JOIN users u ON u.id::text = ed.created_by_id::text
          WHERE ${where}
          ORDER BY ed.uploaded_at DESC`,
        params,
      );
      const mapped = rows.map(mapRow);
      return await Promise.all(mapped.map(async (doc) => {
        if (doc.documentUrl) {
          try {
            doc.documentUrl = await generatePresignedUrl(doc.documentUrl, 86400, true);
          } catch (e) {
            console.error("Failed to sign url for", doc.id, e);
          }
        }
        return doc;
      }));
    });

    // Stats
    const total = result.length;
    const uploaded = result.filter((d: any) => d.status === "uploaded").length;
    const pending = result.filter((d: any) => d.status === "pending").length;
    const expired = result.filter((d: any) => d.expiryDate && new Date(d.expiryDate) < new Date()).length;

    return res.status(200).json({
      success: true,
      data: result,
      stats: { total, uploaded, pending, expired },
    });
  } catch (err: any) {
    console.error("listEmployeeDocuments error:", err);
    return res.status(500).json({ success: false, error: err.message || "Internal Server Error" });
  }
}

// ── GET /api/onboarding/my-documents ──────────────────────────────────────

export async function listMyDocuments(req: AuthRequest, res: Response) {
  try {
    if (!req.user?.id || !req.tenantId) throw new Error("Unauthorized");

    const { documentType, status, search } = req.query as Record<string, string>;

    const result = await withTenant(req.tenantId, async (db) => {
      await ensureColumns(db);

      const conditions: string[] = ["ed.deleted_at IS NULL", "ed.tenant_id = $1"];
      const params: any[] = [req.tenantId];

      params.push(req.user!.id);
      conditions.push(`ed.employee_id = $${params.length}`);

      if (documentType) {
        params.push(documentType);
        conditions.push(`ed.document_type = $${params.length}`);
      }
      if (status) {
        params.push(status);
        conditions.push(`ed.status = $${params.length}`);
      }
      if (search) {
        params.push(`%${search.toLowerCase()}%`);
        const n = params.length;
        conditions.push(
          `(LOWER(COALESCE(ed.document_name, ed.document_type)) LIKE $${n})`,
        );
      }

      const where = conditions.join(" AND ");
      const { rows } = await db.query(
        `SELECT
            ed.*,
            u.name AS uploaded_by_name
          FROM employee_documents ed
          LEFT JOIN users u ON u.id::text = ed.created_by_id::text
          WHERE ${where}
          ORDER BY ed.uploaded_at DESC`,
        params,
      );
      const mapped = rows.map(r => mapRow({ ...r, employee_name: req.user!.name }));
      return await Promise.all(mapped.map(async (doc) => {
        if (doc.documentUrl) {
          try {
            doc.documentUrl = await generatePresignedUrl(doc.documentUrl, 86400, true);
          } catch (e) {
            console.error("Failed to sign url for", doc.id, e);
          }
        }
        return doc;
      }));
    });

    res.json({ success: true, data: result });
  } catch (error: any) {
    console.error("listMyDocuments error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
}

// ── POST /api/onboarding/employee-documents/upload (multipart file) ──────

export async function uploadEmployeeDocument(req: AuthRequest, res: Response) {
  const file = (req as any).file as Express.Multer.File | undefined;
  try {
    if (!req.user?.id || !req.tenantId) throw new Error("Unauthorized");

    const { employeeId, documentName, documentType, status = "uploaded", expiryDate, notes } = req.body;

    if (!employeeId) return res.status(400).json({ success: false, error: "employeeId is required" });
    if (!documentType) return res.status(400).json({ success: false, error: "documentType is required" });

    let documentUrl: string;

    if (file) {
      // Upload to R2
      const buffer = fs.readFileSync(file.path);
      const base64 = `data:${file.mimetype};base64,${buffer.toString("base64")}`;
      documentUrl = await uploadEmployeeDocumentToR2(
        base64,
        file.originalname,
        req.tenantId,
        employeeId,
        documentType.replace(/\s+/g, "_").toLowerCase(),
      );
      // Clean up temp file
      try { fs.unlinkSync(file.path); } catch { /* ignore */ }
    } else if (req.body.documentUrl) {
      documentUrl = req.body.documentUrl;
    } else {
      return res.status(400).json({ success: false, error: "Either a file or documentUrl is required" });
    }

    const row = await withTenant(req.tenantId, async (db) => {
      await ensureColumns(db);
      const { rows } = await db.query(
        `INSERT INTO employee_documents
            (employee_id, tenant_id, document_name, document_type, document_url, status, expiry_date, notes, created_by_id, uploaded_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())
          RETURNING *`,
        [
          employeeId,
          req.tenantId,
          documentName || documentType,
          documentType,
          documentUrl,
          status,
          expiryDate || null,
          notes || null,
          req.user!.id,
        ],
      );
      return rows[0];
    });

    return res.status(201).json({ success: true, data: mapRow(row) });
  } catch (err: any) {
    // Clean up temp file on error
    if (file) { try { fs.unlinkSync(file.path); } catch { /* ignore */ } }
    console.error("uploadEmployeeDocument error:", err);
    return res.status(500).json({ success: false, error: err.message || "Internal Server Error" });
  }
}

// ── DELETE /api/onboarding/employee-documents/:id ─────────────────────────

export async function deleteEmployeeDocument(req: AuthRequest, res: Response) {
  try {
    if (!req.user?.id || !req.tenantId) throw new Error("Unauthorized");
    const { id } = req.params;

    const deleted = await withTenant(req.tenantId, async (db) => {
      await ensureColumns(db);
      const { rows } = await db.query(
        `UPDATE employee_documents
            SET deleted_at = now()
          WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
          RETURNING *`,
        [id, req.tenantId],
      );
      return rows[0] || null;
    });

    if (!deleted) return res.status(404).json({ success: false, error: "Document not found" });
    return res.status(200).json({ success: true, message: "Document deleted" });
  } catch (err: any) {
    console.error("deleteEmployeeDocument error:", err);
    return res.status(500).json({ success: false, error: err.message || "Internal Server Error" });
  }
}
// ── BULK OPERATIONS FOR ONBOARDING WIZARD ────────────────────────────────

export async function createEmployeeDocumentsBulk(
  req: AuthRequest,
  employeeId: string,
  client?: TenantClient,
) {
  try {
    const { documents } = req.body as { documents: any[] };

    if (!documents || !Array.isArray(documents)) {
      return;
    }

    return await withClient(req, client, async (db) => {
      await ensureColumns(db);

      for (const doc of documents) {
        let documentUrl = doc.documentUrl || doc.fileBase64;

        if (doc.fileBase64 && doc.fileBase64.startsWith("data:")) {
          documentUrl = await uploadEmployeeDocumentToR2(
            doc.fileBase64,
            doc.fileName || `${doc.documentType}.pdf`,
            req.tenantId!,
            employeeId,
            doc.documentType.replace(/\s+/g, "_").toLowerCase(),
          );
        }

        if (!documentUrl) continue; // Skip if no document provided

        await db.query(
          `INSERT INTO employee_documents
             (employee_id, tenant_id, document_name, document_type, document_url, status, expiry_date, notes, created_by_id, uploaded_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())`,
          [
            employeeId,
            req.tenantId,
            doc.documentName || doc.documentType,
            doc.documentType,
            documentUrl,
            doc.status || "uploaded",
            doc.expiryDate || null,
            doc.notes || null,
            req.user?.id || null,
          ],
        );
      }

      return {
        success: true,
        message: "Employee documents created successfully",
      };
    });
  } catch (error) {
    console.error("Error in createEmployeeDocumentsBulk:", error);
    throw error;
  }
}

export async function getEmployeeDocuments(req: AuthRequest, employeeId: string) {
  try {
    if (!req.user?.id || !req.tenantId) throw new Error("Unauthorized");

    return await withTenant(req.tenantId, async (db) => {
      await ensureColumns(db);
      const { rows } = await db.query(
        `SELECT
            ed.*,
            COALESCE(e.name, NULLIF(TRIM(CONCAT(emp.first_name, ' ', emp.last_name)), '')) AS employee_name,
            u.name AS uploaded_by_name
          FROM employee_documents ed
          LEFT JOIN users e ON e.id::text = ed.employee_id::text
          LEFT JOIN employees emp ON emp.id::text = ed.employee_id::text
          LEFT JOIN users u ON u.id::text = ed.created_by_id::text
          WHERE ed.deleted_at IS NULL AND ed.tenant_id = $1 AND ed.employee_id = $2
          ORDER BY ed.uploaded_at DESC`,
        [req.tenantId, employeeId],
      );
      
      const mapped = rows.map(mapRow);
      return await Promise.all(mapped.map(async (doc) => {
        if (doc.documentUrl) {
          try {
            doc.documentUrl = await generatePresignedUrl(doc.documentUrl);
          } catch (e) {
            console.error("Failed to generate presigned URL for document", doc.id, e);
          }
        }
        return doc;
      }));
    });
  } catch (err: any) {
    console.error("getEmployeeDocuments Error:", err);
    throw err;
  }
}
