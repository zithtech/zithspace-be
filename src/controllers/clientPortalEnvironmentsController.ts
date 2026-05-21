import { Request, Response } from "express";
import pool from "@/config/dbpool";

/**
 * Portal view of environments + deployment history. Filters to
 * `visibility='client'`. Internal-only environments are hidden.
 */
export class ClientPortalEnvironmentsController {
  /** GET /api/client-portal/environments */
  static async list(req: Request, res: Response): Promise<void> {
    const ctx = req.portalUser;
    if (!ctx) {
      res.status(401).json({ success: false, error: "Not authenticated" });
      return;
    }
    const r = await pool.query(
      `SELECT e.id, e.name, e.kind, e.url, e.status, e.current_version,
              e.ssl_expires_at, e.last_backup_at, e.uptime_percent,
              e.position, e.created_at, e.updated_at,
              e.project_id, p.name AS project_name, p.code AS project_code,
              (SELECT COUNT(*)::int FROM portal_deployments d
                WHERE d.environment_id = e.id) AS deployment_count,
              (SELECT MAX(finished_at) FROM portal_deployments d
                WHERE d.environment_id = e.id) AS last_deployed_at
         FROM portal_environments e
         LEFT JOIN projects p ON p.id = e.project_id
        WHERE e.tenant_id = $1 AND e.client_id = $2
          AND e.visibility = 'client'
        ORDER BY
          CASE e.kind
            WHEN 'production' THEN 0
            WHEN 'staging' THEN 1
            WHEN 'uat' THEN 2
            WHEN 'qa' THEN 3
            WHEN 'demo' THEN 4
            WHEN 'preview' THEN 5
            WHEN 'dev' THEN 6
            ELSE 7
          END,
          e.position ASC, e.created_at ASC`,
      [ctx.tenantId, ctx.clientId],
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
        uptimePercent: row.uptime_percent,
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

  /** GET /api/client-portal/environments/:id */
  static async detail(req: Request, res: Response): Promise<void> {
    const ctx = req.portalUser;
    if (!ctx) {
      res.status(401).json({ success: false, error: "Not authenticated" });
      return;
    }
    const { id } = req.params;
    const r = await pool.query(
      `SELECT e.*, p.name AS project_name, p.code AS project_code
         FROM portal_environments e
         LEFT JOIN projects p ON p.id = e.project_id
        WHERE e.id = $1 AND e.tenant_id = $2 AND e.client_id = $3
          AND e.visibility = 'client'`,
      [id, ctx.tenantId, ctx.clientId],
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
              rn.version AS release_note_version, rn.status AS release_note_status,
              d.rollback_of_deployment_id, d.created_at
         FROM portal_deployments d
         LEFT JOIN release_notes rn
                ON rn.id::text = d.release_note_id::text
               AND rn.status = 'RELEASED'
               AND rn.visibility && ARRAY['CLIENT','PUBLIC','EXTERNAL']::text[]
        WHERE d.environment_id = $1 AND d.tenant_id = $2
        ORDER BY d.finished_at DESC NULLS LAST, d.created_at DESC
        LIMIT 100`,
      [id, ctx.tenantId],
    );

    res.json({
      success: true,
      data: {
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
        projectId: env.project_id,
        projectName: env.project_name,
        projectCode: env.project_code,
        createdAt: env.created_at,
        updatedAt: env.updated_at,
        deployments: deploys.rows.map((d) => ({
          id: d.id,
          version: d.version,
          status: d.status,
          startedAt: d.started_at,
          finishedAt: d.finished_at,
          durationSeconds: d.duration_seconds,
          deployedBy: d.deployed_by,
          changelogExcerpt: d.changelog_excerpt,
          releaseNoteId: d.release_note_id,
          releaseNoteTitle: d.release_note_title,
          releaseNoteVersion: d.release_note_version,
          rollbackOfDeploymentId: d.rollback_of_deployment_id,
          createdAt: d.created_at,
        })),
      },
    });
  }
}

export default ClientPortalEnvironmentsController;
