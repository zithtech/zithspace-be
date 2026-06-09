import { Response } from "express";
import pool from "@/config/dbpool";
import { AuthRequest } from "@/types";

const VALID_KINDS = new Set([
  "production",
  "staging",
  "uat",
  "qa",
  "dev",
  "demo",
  "preview",
  "other",
]);
const VALID_STATUSES = new Set([
  "operational",
  "degraded",
  "down",
  "maintenance",
  "unknown",
]);
const VALID_VISIBILITY = new Set(["client", "internal"]);
const VALID_DEPLOY_STATUS = new Set([
  "success",
  "failed",
  "rolled_back",
  "in_progress",
]);

function isValidUrl(str: string): boolean {
  try {
    const url = new URL(str);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export class EnvironmentsStaffController {
  /** GET /api/clients-v2/:clientId/environments */
  static async listForClient(req: AuthRequest, res: Response): Promise<void> {
    const tenantId = req.tenantId!;
    const { clientId } = req.params;
    const r = await pool.query(
      `SELECT e.id, e.name, e.kind, e.url, e.status, e.current_version,
              e.ssl_expires_at, e.last_backup_at, e.last_health_check_at,
              e.uptime_percent, e.visibility, e.position,
              e.created_at, e.updated_at,
              e.project_id, p.name AS project_name, p.code AS project_code,
              (SELECT COUNT(*)::int FROM portal_deployments d
                WHERE d.environment_id = e.id) AS deployment_count,
              (SELECT MAX(finished_at) FROM portal_deployments d
                WHERE d.environment_id = e.id) AS last_deployed_at
         FROM portal_environments e
         LEFT JOIN projects p ON p.id = e.project_id
        WHERE e.tenant_id = $1 AND e.client_id = $2
        ORDER BY e.position ASC, e.created_at ASC`,
      [tenantId, clientId],
    );
    res.json({
      success: true,
      data: r.rows.map((row) => ({
        id: row.id,
        name: row.name,
        kind: row.kind,
        url: row.url,
        status: row.status,
        currentVersion: row.current_version,
        sslExpiresAt: row.ssl_expires_at,
        lastBackupAt: row.last_backup_at,
        lastHealthCheckAt: row.last_health_check_at,
        uptimePercent: row.uptime_percent,
        visibility: row.visibility,
        position: row.position,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        projectId: row.project_id,
        projectName: row.project_name,
        projectCode: row.project_code,
        deploymentCount: row.deployment_count || 0,
        lastDeployedAt: row.last_deployed_at,
      })),
    });
  }

  /**
   * POST /api/clients-v2/:clientId/environments
   * body: { name, kind, url?, projectId?, visibility?, status?,
   *         currentVersion?, sslExpiresAt?, lastBackupAt?, notes? }
   */
  static async create(req: AuthRequest, res: Response): Promise<void> {
    const tenantId = req.tenantId!;
    const userId = req.user?.id || null;
    const { clientId } = req.params;
    const b = req.body || {};

    if (!b.name?.trim() || !b.kind) {
      res.status(400).json({
        success: false,
        error: "name and kind are required",
      });
      return;
    }
    if (!VALID_KINDS.has(String(b.kind))) {
      res.status(400).json({ success: false, error: "Invalid kind" });
      return;
    }
    if (b.url) {
      const trimmedUrl = String(b.url).trim();
      if (trimmedUrl) {
        if (!isValidUrl(trimmedUrl)) {
          res.status(400).json({ success: false, error: "Invalid URL format" });
          return;
        }
      }
    }
    const status = b.status || "operational";
    const visibility = b.visibility || "client";
    if (!VALID_STATUSES.has(status)) {
      res.status(400).json({ success: false, error: "Invalid status" });
      return;
    }
    if (!VALID_VISIBILITY.has(visibility)) {
      res.status(400).json({ success: false, error: "Invalid visibility" });
      return;
    }

    const cl = await pool.query(
      `SELECT 1 FROM clients_v2 WHERE id = $1 AND tenant_id = $2`,
      [clientId, tenantId],
    );
    if (cl.rowCount === 0) {
      res.status(404).json({ success: false, error: "Client not found" });
      return;
    }
    if (b.projectId) {
      const ok = await pool.query(
        `SELECT 1 FROM client_projects
          WHERE tenant_id = $1 AND client_id = $2 AND project_id = $3`,
        [tenantId, clientId, b.projectId],
      );
      if (ok.rowCount === 0) {
        res.status(400).json({
          success: false,
          error: "projectId is not linked to this client",
        });
        return;
      }
    }

    // Default position to end of list
    const posR = await pool.query(
      `SELECT COALESCE(MAX(position), -1) + 1 AS next_pos
         FROM portal_environments
        WHERE tenant_id = $1 AND client_id = $2`,
      [tenantId, clientId],
    );

    const ins = await pool.query(
      `INSERT INTO portal_environments
         (tenant_id, client_id, project_id, name, kind, url, status,
          current_version, ssl_expires_at, last_backup_at, notes,
          visibility, position, created_by_user_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       RETURNING id`,
      [
        tenantId,
        clientId,
        b.projectId || null,
        b.name.trim(),
        b.kind,
        b.url || null,
        status,
        b.currentVersion || null,
        b.sslExpiresAt || null,
        b.lastBackupAt || null,
        b.notes || null,
        visibility,
        posR.rows[0].next_pos,
        userId,
      ],
    );
    res.status(201).json({ success: true, data: { id: ins.rows[0].id } });
  }

  /** GET /api/environments/:id */
  static async detail(req: AuthRequest, res: Response): Promise<void> {
    const tenantId = req.tenantId!;
    const { id } = req.params;
    const r = await pool.query(
      `SELECT e.*, p.name AS project_name, p.code AS project_code,
              u.name AS created_by_name
         FROM portal_environments e
         LEFT JOIN projects p ON p.id = e.project_id
         LEFT JOIN users u ON u.id = e.created_by_user_id
        WHERE e.id = $1 AND e.tenant_id = $2`,
      [id, tenantId],
    );
    if (r.rowCount === 0) {
      res.status(404).json({ success: false, error: "Environment not found" });
      return;
    }
    const env = r.rows[0];

    const deploys = await pool.query(
      `SELECT d.id, d.version, d.status, d.started_at, d.finished_at,
              d.duration_seconds, d.deployed_by, d.changelog_excerpt,
              d.release_note_id, rn.title AS release_note_title,
              rn.version AS release_note_version,
              d.rollback_of_deployment_id,
              d.created_at,
              u.name AS deployed_by_staff_name
         FROM portal_deployments d
         LEFT JOIN release_notes rn ON rn.id::text = d.release_note_id::text
         LEFT JOIN users u ON u.id = d.deployed_by_user_id
        WHERE d.environment_id = $1 AND d.tenant_id = $2
        ORDER BY d.finished_at DESC NULLS LAST, d.created_at DESC
        LIMIT 200`,
      [id, tenantId],
    );

    res.json({
      success: true,
      data: shape(env, deploys.rows),
    });
  }

  /** PUT /api/environments/:id */
  static async update(req: AuthRequest, res: Response): Promise<void> {
    const tenantId = req.tenantId!;
    const { id } = req.params;
    const b = req.body || {};
    const cur = await pool.query(
      `SELECT id FROM portal_environments WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId],
    );
    if (cur.rowCount === 0) {
      res.status(404).json({ success: false, error: "Environment not found" });
      return;
    }

    const sets: string[] = [];
    const params: any[] = [];
    const push = (col: string, val: any) => {
      params.push(val);
      sets.push(`${col} = $${params.length}`);
    };
    if (b.name !== undefined) {
      const trimmedName = String(b.name).trim();
      if (!trimmedName) {
        res.status(400).json({ success: false, error: "name is required" });
        return;
      }
      push("name", trimmedName);
    }
    if (b.kind !== undefined) {
      if (!VALID_KINDS.has(String(b.kind))) {
        res.status(400).json({ success: false, error: "Invalid kind" });
        return;
      }
      push("kind", b.kind);
    }
    if (b.url !== undefined) {
      const trimmedUrl = b.url ? String(b.url).trim() : "";
      if (trimmedUrl) {
        if (!isValidUrl(trimmedUrl)) {
          res.status(400).json({ success: false, error: "Invalid URL format" });
          return;
        }
        push("url", trimmedUrl);
      } else {
        push("url", null);
      }
    }
    if (b.status !== undefined) {
      if (!VALID_STATUSES.has(String(b.status))) {
        res.status(400).json({ success: false, error: "Invalid status" });
        return;
      }
      push("status", b.status);
    }
    if (b.currentVersion !== undefined)
      push("current_version", b.currentVersion || null);
    if (b.sslExpiresAt !== undefined)
      push("ssl_expires_at", b.sslExpiresAt || null);
    if (b.lastBackupAt !== undefined)
      push("last_backup_at", b.lastBackupAt || null);
    if (b.lastHealthCheckAt !== undefined)
      push("last_health_check_at", b.lastHealthCheckAt || null);
    if (b.uptimePercent !== undefined)
      push("uptime_percent", b.uptimePercent ?? null);
    if (b.notes !== undefined) push("notes", b.notes || null);
    if (b.visibility !== undefined) {
      if (!VALID_VISIBILITY.has(String(b.visibility))) {
        res.status(400).json({ success: false, error: "Invalid visibility" });
        return;
      }
      push("visibility", b.visibility);
    }
    if (b.position !== undefined) push("position", Number(b.position));
    if (b.projectId !== undefined) push("project_id", b.projectId || null);

    if (sets.length === 0) {
      res.status(400).json({ success: false, error: "Nothing to update" });
      return;
    }
    params.push(id);
    params.push(tenantId);
    await pool.query(
      `UPDATE portal_environments
          SET ${sets.join(", ")}, updated_at = NOW()
        WHERE id = $${params.length - 1} AND tenant_id = $${params.length}`,
      params,
    );
    res.json({ success: true });
  }

  /** DELETE /api/environments/:id */
  static async remove(req: AuthRequest, res: Response): Promise<void> {
    const tenantId = req.tenantId!;
    const r = await pool.query(
      `DELETE FROM portal_environments WHERE id = $1 AND tenant_id = $2`,
      [req.params.id, tenantId],
    );
    if (r.rowCount === 0) {
      res.status(404).json({ success: false, error: "Environment not found" });
      return;
    }
    res.json({ success: true });
  }

  /**
   * POST /api/environments/:id/deployments
   * body: { version, status?, startedAt?, finishedAt?, deployedBy?,
   *         changelogExcerpt?, releaseNoteId?, rollbackOfDeploymentId? }
   *
   * Creates a deployment log entry. Also denormalizes `current_version` on
   * the environment when this is the latest successful deploy.
   */
  static async createDeployment(
    req: AuthRequest,
    res: Response,
  ): Promise<void> {
    const tenantId = req.tenantId!;
    const userId = req.user?.id || null;
    const { id } = req.params;
    const b = req.body || {};
    if (!b.version?.trim()) {
      res.status(400).json({ success: false, error: "version is required" });
      return;
    }
    const status = b.status || "success";
    if (!VALID_DEPLOY_STATUS.has(status)) {
      res.status(400).json({ success: false, error: "Invalid status" });
      return;
    }
    const env = await pool.query(
      `SELECT client_id, project_id, current_version FROM portal_environments
        WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId],
    );
    if (env.rowCount === 0) {
      res.status(404).json({ success: false, error: "Environment not found" });
      return;
    }
    const e = env.rows[0];

    // Compute duration if both timestamps provided
    let duration = b.durationSeconds ?? null;
    if (duration == null && b.startedAt && b.finishedAt) {
      const s = new Date(b.startedAt).getTime();
      const f = new Date(b.finishedAt).getTime();
      if (!isNaN(s) && !isNaN(f) && f >= s) {
        duration = Math.round((f - s) / 1000);
      }
    }

    const ins = await pool.query(
      `INSERT INTO portal_deployments
         (tenant_id, environment_id, client_id, project_id, version, status,
          started_at, finished_at, duration_seconds, release_note_id,
          deployed_by, deployed_by_user_id, changelog_excerpt,
          rollback_of_deployment_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7, COALESCE($8::timestamptz, NOW()), $9,
               $10, $11, $12, $13, $14)
       RETURNING id, finished_at`,
      [
        tenantId,
        id,
        e.client_id,
        e.project_id,
        b.version.trim(),
        status,
        b.startedAt || null,
        b.finishedAt || null,
        duration,
        b.releaseNoteId || null,
        b.deployedBy || null,
        userId,
        b.changelogExcerpt || null,
        b.rollbackOfDeploymentId || null,
      ],
    );

    // Bump current_version on the env if this is a successful deploy and is
    // the most recent one finished.
    if (status === "success") {
      const latest = await pool.query(
        `SELECT finished_at FROM portal_deployments
          WHERE environment_id = $1 AND tenant_id = $2 AND status = 'success'
          ORDER BY finished_at DESC LIMIT 1`,
        [id, tenantId],
      );
      if (
        latest.rowCount &&
        latest.rows[0].finished_at &&
        new Date(latest.rows[0].finished_at) <=
          new Date(ins.rows[0].finished_at)
      ) {
        await pool.query(
          `UPDATE portal_environments
              SET current_version = $1, updated_at = NOW()
            WHERE id = $2 AND tenant_id = $3`,
          [b.version.trim(), id, tenantId],
        );
      }
    }

    res.status(201).json({ success: true, data: { id: ins.rows[0].id } });
  }

  /** DELETE /api/deployments/:deploymentId */
  static async removeDeployment(
    req: AuthRequest,
    res: Response,
  ): Promise<void> {
    const tenantId = req.tenantId!;
    const r = await pool.query(
      `DELETE FROM portal_deployments WHERE id = $1 AND tenant_id = $2`,
      [req.params.deploymentId, tenantId],
    );
    if (r.rowCount === 0) {
      res.status(404).json({ success: false, error: "Deployment not found" });
      return;
    }
    res.json({ success: true });
  }
}

function shape(env: any, deploys: any[]) {
  return {
    id: env.id,
    name: env.name,
    kind: env.kind,
    url: env.url,
    status: env.status,
    currentVersion: env.current_version,
    sslExpiresAt: env.ssl_expires_at,
    lastBackupAt: env.last_backup_at,
    lastHealthCheckAt: env.last_health_check_at,
    uptimePercent: env.uptime_percent,
    notes: env.notes,
    visibility: env.visibility,
    position: env.position,
    projectId: env.project_id,
    projectName: env.project_name || null,
    projectCode: env.project_code || null,
    createdByName: env.created_by_name || null,
    createdAt: env.created_at,
    updatedAt: env.updated_at,
    deployments: deploys.map((d) => ({
      id: d.id,
      version: d.version,
      status: d.status,
      startedAt: d.started_at,
      finishedAt: d.finished_at,
      durationSeconds: d.duration_seconds,
      deployedBy: d.deployed_by,
      deployedByStaffName: d.deployed_by_staff_name,
      changelogExcerpt: d.changelog_excerpt,
      releaseNoteId: d.release_note_id,
      releaseNoteTitle: d.release_note_title,
      releaseNoteVersion: d.release_note_version,
      rollbackOfDeploymentId: d.rollback_of_deployment_id,
      createdAt: d.created_at,
    })),
  };
}

export default EnvironmentsStaffController;
