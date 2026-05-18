import { Request, Response } from "express";
import pool from "@/config/dbpool";

/**
 * Visibility values stored in `release_notes.visibility` (text[]). A note is
 * visible to the client portal when at least one of these tokens is present.
 * Staff-only notes use 'INTERNAL'.
 */
const CLIENT_VISIBLE_TOKENS = new Set(["CLIENT", "PUBLIC", "EXTERNAL"]);

/**
 * Extract plain text from BlockNote rich-text JSON.
 *
 * The existing staff UI stores section bodies as BlockNote AST:
 *   [{ id, type, props, content: [{ text: "..." }, ...] }, ...]
 *
 * We don't want to bundle a BlockNote renderer into the portal; instead we
 * walk the tree, collect leaf `text` strings, and group them into plain
 * paragraphs. Returns `[]` when the field has no usable text.
 */
function blocksToParagraphs(value: any): string[] {
  if (!value) return [];

  // Empty objects ({}), strings, numbers — coerce as best we can.
  if (typeof value === "string") return value.trim() ? [value.trim()] : [];
  if (typeof value !== "object") return [];

  // Legacy/early shape: a flat object like { overview: "..." } or
  // { insight1: "...", insight2: "..." }. Surface each non-empty leaf
  // string as its own paragraph.
  if (!Array.isArray(value)) {
    const out: string[] = [];
    for (const v of Object.values(value)) {
      if (typeof v === "string" && v.trim()) out.push(v.trim());
    }
    return out;
  }

  // BlockNote AST: top-level array of blocks.
  const paragraphs: string[] = [];
  for (const block of value) {
    const text = collectText(block).trim();
    if (text) paragraphs.push(text);
  }
  return paragraphs;
}

function collectText(node: any): string {
  if (!node) return "";
  if (typeof node === "string") return node;
  if (typeof node !== "object") return "";

  let acc = "";
  if (typeof node.text === "string") acc += node.text;
  if (Array.isArray(node.content)) {
    for (const child of node.content) acc += collectText(child);
  } else if (typeof node.content === "string") {
    acc += node.content;
  }
  if (Array.isArray(node.children)) {
    for (const child of node.children) acc += "\n" + collectText(child);
  }
  return acc;
}

async function projectsForPortalUser(
  tenantId: string,
  clientId: string,
): Promise<string[]> {
  const r = await pool.query(
    `SELECT project_id FROM client_projects
      WHERE tenant_id = $1 AND client_id = $2`,
    [tenantId, clientId],
  );
  return r.rows.map((row) => row.project_id);
}

function isClientVisible(visibility: any): boolean {
  if (!Array.isArray(visibility)) return false;
  return visibility.some((v) =>
    CLIENT_VISIBLE_TOKENS.has(String(v).toUpperCase()),
  );
}

export class ClientPortalReleaseController {
  /**
   * GET /api/client-portal/releases?environment=&projectId=&search=&page=&limit=
   * Returns only RELEASED notes whose visibility array includes a
   * client-facing token.
   */
  static async list(req: Request, res: Response): Promise<void> {
    const ctx = req.portalUser;
    if (!ctx) {
      res.status(401).json({ success: false, error: "Not authenticated" });
      return;
    }

    const projectIds = await projectsForPortalUser(ctx.tenantId, ctx.clientId);
    if (projectIds.length === 0) {
      res.json({
        success: true,
        data: [],
        meta: {
          total: 0,
          page: 1,
          limit: 0,
          environments: [],
          projects: [],
        },
      });
      return;
    }

    const environment = ((req.query.environment as string) || "").toUpperCase();
    const projectFilter = (req.query.projectId as string) || "";
    const search = ((req.query.search as string) || "").trim();
    const page = Math.max(1, parseInt((req.query.page as string) || "1", 10));
    const limit = Math.min(
      100,
      Math.max(1, parseInt((req.query.limit as string) || "20", 10)),
    );
    const offset = (page - 1) * limit;

    // We do the client-visibility filter in SQL via the array overlap
    // operator (&&) on the visibility text[] column for efficiency.
    const visibleTokens = Array.from(CLIENT_VISIBLE_TOKENS);
    const params: any[] = [ctx.tenantId, projectIds, visibleTokens];
    let where = `WHERE rn.tenant_id = $1
                   AND rn.project_id = ANY($2::text[])
                   AND rn.status = 'RELEASED'
                   AND rn.visibility && $3::text[]`;
    if (environment && environment !== "ALL") {
      params.push(environment);
      where += ` AND rn.environment = $${params.length}`;
    }
    if (projectFilter) {
      params.push(projectFilter);
      where += ` AND rn.project_id = $${params.length}`;
    }
    if (search) {
      params.push(`%${search}%`);
      where += ` AND (rn.version ILIKE $${params.length}
                   OR COALESCE(rn.title,'') ILIKE $${params.length})`;
    }

    const countRes = await pool.query(
      `SELECT COUNT(*)::int AS n FROM release_notes rn ${where}`,
      params,
    );
    const total = countRes.rows[0]?.n || 0;

    params.push(limit);
    params.push(offset);

    const list = await pool.query(
      `SELECT rn.id, rn.version, rn.title, rn.environment, rn.release_date,
              rn.summary, rn.new_features, rn.improvements, rn.bug_fixes,
              rn.breaking_changes, rn.database_changes, rn.known_issues,
              rn.linked_tickets, rn.created_at,
              p.id   AS project_id,
              p.name AS project_name,
              p.code AS project_code
         FROM release_notes rn
         JOIN projects p ON p.id = rn.project_id
         ${where}
         ORDER BY COALESCE(rn.release_date, rn.created_at) DESC
         LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );

    // Light summary for each row — just enough for the card preview
    const data = list.rows.map((row) => {
      const summary = blocksToParagraphs(row.summary);
      const counts = {
        newFeatures: blocksToParagraphs(row.new_features).length,
        improvements: blocksToParagraphs(row.improvements).length,
        bugFixes: blocksToParagraphs(row.bug_fixes).length,
        breakingChanges: blocksToParagraphs(row.breaking_changes).length,
        databaseChanges: blocksToParagraphs(row.database_changes).length,
        knownIssues: blocksToParagraphs(row.known_issues).length,
      };
      return {
        id: row.id,
        version: row.version,
        title: row.title,
        environment: row.environment,
        releaseDate: row.release_date,
        createdAt: row.created_at,
        summaryPreview: summary.slice(0, 2).join("\n").slice(0, 240),
        hasBreakingChanges: counts.breakingChanges > 0,
        hasKnownIssues: counts.knownIssues > 0,
        linkedTicketCount: Array.isArray(row.linked_tickets)
          ? row.linked_tickets.length
          : 0,
        counts,
        project: {
          id: row.project_id,
          name: row.project_name,
          code: row.project_code,
        },
      };
    });

    // Filter facets — environments + projects in the visible set, for the FE
    // filter row.
    const facets = await pool.query(
      `SELECT DISTINCT rn.environment, rn.project_id
         FROM release_notes rn
        WHERE rn.tenant_id = $1
          AND rn.project_id = ANY($2::text[])
          AND rn.status = 'RELEASED'
          AND rn.visibility && $3::text[]`,
      [ctx.tenantId, projectIds, visibleTokens],
    );

    const envSet = new Set<string>();
    const projectSet = new Set<string>();
    for (const r of facets.rows) {
      if (r.environment) envSet.add(r.environment);
      if (r.project_id) projectSet.add(r.project_id);
    }
    const projects =
      projectSet.size > 0
        ? (
            await pool.query(
              `SELECT id, name, code FROM projects
                WHERE id = ANY($1::text[]) ORDER BY name ASC`,
              [Array.from(projectSet)],
            )
          ).rows
        : [];

    res.json({
      success: true,
      data,
      meta: {
        total,
        page,
        limit,
        environments: Array.from(envSet).sort(),
        projects,
      },
    });
  }

  /** GET /api/client-portal/releases/:id */
  static async detail(req: Request, res: Response): Promise<void> {
    const ctx = req.portalUser;
    if (!ctx) {
      res.status(401).json({ success: false, error: "Not authenticated" });
      return;
    }
    const { id } = req.params;

    const projectIds = await projectsForPortalUser(ctx.tenantId, ctx.clientId);
    if (projectIds.length === 0) {
      res.status(404).json({ success: false, error: "Release not found" });
      return;
    }

    const r = await pool.query(
      `SELECT rn.*, p.name AS project_name, p.code AS project_code
         FROM release_notes rn
         JOIN projects p ON p.id = rn.project_id
        WHERE rn.id = $1
          AND rn.tenant_id = $2
          AND rn.project_id = ANY($3::text[])
          AND rn.status = 'RELEASED'`,
      [id, ctx.tenantId, projectIds],
    );
    const row = r.rows[0];
    if (!row || !isClientVisible(row.visibility)) {
      res.status(404).json({ success: false, error: "Release not found" });
      return;
    }

    res.json({
      success: true,
      data: {
        id: row.id,
        version: row.version,
        title: row.title,
        environment: row.environment,
        releaseDate: row.release_date,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        sections: {
          summary: blocksToParagraphs(row.summary),
          keyInsights: blocksToParagraphs(row.key_insights),
          newFeatures: blocksToParagraphs(row.new_features),
          improvements: blocksToParagraphs(row.improvements),
          bugFixes: blocksToParagraphs(row.bug_fixes),
          breakingChanges: blocksToParagraphs(row.breaking_changes),
          apiChanges: blocksToParagraphs(row.api_changes),
          databaseChanges: blocksToParagraphs(row.database_changes),
          knownIssues: blocksToParagraphs(row.known_issues),
        },
        linkedTickets: Array.isArray(row.linked_tickets)
          ? row.linked_tickets
          : [],
        repositories: Array.isArray(row.repositories) ? row.repositories : [],
        pullRequests: Array.isArray(row.pull_requests)
          ? row.pull_requests
          : [],
        project: {
          id: row.project_id,
          name: row.project_name,
          code: row.project_code,
        },
      },
    });
  }
}

export default ClientPortalReleaseController;
