import { Request, Response } from "express";
import pool from "@/config/dbpool";
import { ApiResponse } from "@/types";

export class PublicPlaybookController {
  static async getPublicPlaybooks(req: Request, res: Response) {
    try {
      const search = (req.query.search as string) || "";
      const category = (req.query.category as string) || "";

      let where = `WHERE p.visibility IN ('public', 'premium') AND p.status = 'published' AND p.deleted_at IS NULL AND p.category_deleted_at IS NULL`;
      const params: any[] = [];

      if (category && category !== '__all__') {
        params.push(category);
        where += ` AND p.category = $${params.length}`;
      }
      if (search) {
        params.push(`%${search}%`);
        where += ` AND (p.name ILIKE $${params.length} OR p.summary ILIKE $${params.length} OR p.category ILIKE $${params.length})`;
      }

      const { rows } = await pool.query(
        `SELECT p.id, p.slug, p.name, p.category, p.summary, p.version, p.visibility, p.status,
                p.price_credits, p.price_amount, p.price_currency, p.last_updated_at,
                false AS is_own,
                false AS locked,
                COALESCE(stats.item_count, 0)            AS item_count,
                COALESCE(stats.categories, '{}'::text[]) AS categories
           FROM qa_playbooks p
           LEFT JOIN LATERAL (
             SELECT COUNT(*)::int                 AS item_count,
                    array_agg(DISTINCT i.category) AS categories
               FROM qa_playbook_items i
              WHERE i.playbook_id = p.id
           ) stats ON TRUE
           ${where}
           ORDER BY p.category ASC, p.name ASC`,
        params
      );

      const ids = rows.map((r: any) => r.id);
      const levelMap = new Map<string, Record<string, number>>();
      if (ids.length > 0) {
        const { rows: levels } = await pool.query(
          `SELECT playbook_id, level, COUNT(*)::int AS count
             FROM qa_playbook_items
            WHERE playbook_id = ANY($1::uuid[])
            GROUP BY playbook_id, level`,
          [ids]
        );
        for (const row of levels) {
          let map = levelMap.get(row.playbook_id);
          if (!map) {
            map = {};
            levelMap.set(row.playbook_id, map);
          }
          map[row.level] = row.count;
        }
      }

      // Fetch which public collections each playbook belongs to
      const collectionsMap = new Map<string, { slug: string; name: string; kind: string }[]>();
      if (ids.length > 0) {
        const { rows: colRows } = await pool.query(
          `SELECT ci.playbook_id, c.slug, c.name, c.kind
             FROM qa_playbook_collection_items ci
             JOIN qa_playbook_collections c ON c.id = ci.collection_id
            WHERE ci.playbook_id = ANY($1::uuid[])
              AND c.visibility = 'public'
              AND c.status = 'published'
              AND c.deleted_at IS NULL`,
          [ids]
        );
        for (const row of colRows) {
          const list = collectionsMap.get(row.playbook_id) ?? [];
          list.push({ slug: row.slug, name: row.name, kind: row.kind });
          collectionsMap.set(row.playbook_id, list);
        }
      }

      const playbooks = rows.map((r: any) => ({
        id: r.id,
        slug: r.slug,
        name: r.name,
        category: r.category,
        summary: r.summary,
        version: r.version,
        visibility: r.visibility,
        status: r.status,
        price: {
          credits: r.price_credits,
          amount: r.price_amount,
          currency: r.price_currency,
        },
        itemCount: r.item_count,
        categories: r.categories,
        levels: levelMap.get(r.id) ?? {},
        lastUpdatedAt: r.last_updated_at,
        isOwn: false,
        locked: r.visibility === 'premium',
        collections: collectionsMap.get(r.id) ?? [],
      }));

      // Find unique categories
      const categoriesSet = new Set<string>();
      rows.forEach((r: any) => categoriesSet.add(r.category));

      res.status(200).json({
        success: true,
        data: {
          playbooks,
          categories: Array.from(categoriesSet)
        }
      } as ApiResponse);
    } catch (error) {
      console.error("Error fetching public playbooks:", error);
      res.status(500).json({ success: false, error: 'Failed to fetch public playbooks' } as ApiResponse);
    }
  }

  static async getPublicCollections(req: Request, res: Response) {
    try {
      // Collections don't have is_deleted, they have deleted_at
      const { rows } = await pool.query(
        `SELECT c.id, c.slug, c.name, c.kind, c.industry, c.summary, c.icon, c.visibility, c.status,
                c.price_credits, c.price_amount, c.price_currency, c.sort_order, c.updated_at,
                false AS is_own,
                false AS locked,
                false AS pinned,
                COALESCE(stats.playbook_count, 0) AS playbook_count,
                COALESCE(stats.item_count, 0)     AS item_count
           FROM qa_playbook_collections c
           LEFT JOIN LATERAL (
             SELECT COUNT(*)::int AS playbook_count,
                    COALESCE(SUM(pi.item_count), 0)::int AS item_count
               FROM qa_playbook_collection_items ci
               JOIN qa_playbooks p ON p.id = ci.playbook_id AND p.visibility IN ('public', 'premium') AND p.status = 'published' AND p.deleted_at IS NULL AND p.category_deleted_at IS NULL
               LEFT JOIN LATERAL (
                 SELECT COUNT(*)::int AS item_count
                   FROM qa_playbook_items i WHERE i.playbook_id = p.id
               ) pi ON TRUE
              WHERE ci.collection_id = c.id
           ) stats ON TRUE
           WHERE c.visibility = 'public' AND c.status = 'published' AND c.deleted_at IS NULL
           ORDER BY c.sort_order ASC, c.name ASC`
      );

      const collections = rows.map((r: any) => ({
        id: r.id,
        slug: r.slug,
        name: r.name,
        kind: r.kind,
        industry: r.industry,
        summary: r.summary,
        icon: r.icon,
        visibility: r.visibility,
        status: r.status,
        price: {
          credits: r.price_credits,
          amount: r.price_amount,
          currency: r.price_currency,
        },
        isOwn: false,
        locked: false,
        pinned: false,
        playbookCount: r.playbook_count,
        itemCount: r.item_count,
        sortOrder: r.sort_order,
        updatedAt: r.updated_at,
      }));

      // Find unique industries for potential filtering if needed
      const industries = Array.from(new Set(rows.map((r: any) => r.industry).filter(Boolean)));

      res.status(200).json({
        success: true,
        data: {
          collections,
          industries
        }
      } as ApiResponse);
    } catch (error) {
      console.error("Error fetching public collections:", error);
      res.status(500).json({ success: false, error: 'Failed to fetch public collections' } as ApiResponse);
    }
  }

  static async getPublicPlaybookBySlug(req: Request, res: Response) {
    try {
      const { slug } = req.params;

      const { rows: playbooks } = await pool.query(
        `SELECT p.id, p.slug, p.name, p.category, p.summary, p.overview, p.version,
                p.visibility, p.status, p.price_credits, p.price_amount, p.price_currency,
                p.last_updated_at, p.tenant_id,
                false AS is_own,
                p.visibility = 'premium' AS locked
           FROM qa_playbooks p
          WHERE p.visibility IN ('public', 'premium') AND p.status = 'published' AND p.deleted_at IS NULL AND p.category_deleted_at IS NULL AND p.slug = $1
          LIMIT 1`,
        [slug]
      );

      if (playbooks.length === 0) {
        return res.status(404).json({ success: false, error: 'Playbook not found' } as ApiResponse);
      }

      const playbook: any = playbooks[0];

      const { rows: sectionRows } = await pool.query(
        `SELECT id, key, parent_section_id, title, description, sort_order
           FROM qa_playbook_sections
          WHERE playbook_id = $1
          ORDER BY sort_order ASC, title ASC`,
        [playbook.id]
      );

      const itemsBySection = new Map<string, any[]>();
      const countBySection = new Map<string, number>();

      const { rows: counts } = await pool.query(
        `SELECT section_id, COUNT(*)::int AS count FROM qa_playbook_items
          WHERE playbook_id = $1 GROUP BY section_id`,
        [playbook.id]
      );
      for (const row of counts as any[]) countBySection.set(row.section_id, row.count);

      const { rows: itemRows } = await pool.query(
        `SELECT id, key, section_id, title, what_to_test, examples, expected, steps,
                preconditions, edge_cases, "references",
                level, category, risk, why_it_matters, applies_when
           FROM qa_playbook_items
           WHERE playbook_id = $1
           ORDER BY sort_order ASC`,
        [playbook.id]
      );

      for (const row of itemRows as any[]) {
        const list = itemsBySection.get(row.section_id) ?? [];
        list.push({
          id: row.id,
          key: row.key,
          sectionId: row.section_id,
          title: row.title,
          whatToTest: row.what_to_test,
          examples: row.examples ?? [],
          expected: row.expected,
          steps: row.steps ?? [],
          level: row.level,
          category: row.category,
          risk: row.risk,
          whyItMatters: row.why_it_matters,
          preconditions: row.preconditions ?? [],
          edgeCases: row.edge_cases ?? [],
          references: row.references ?? [],
          appliesWhen: row.applies_when ?? {},
        });
        itemsBySection.set(row.section_id, list);
      }

      const byId = new Map<string, any>();
      for (const row of sectionRows as any[]) {
        byId.set(row.id, {
          id: row.id,
          key: row.key,
          parentSectionId: row.parent_section_id,
          title: row.title,
          description: row.description,
          items: itemsBySection.get(row.id) ?? [],
          itemCount: countBySection.get(row.id) ?? 0,
          sections: [],
        });
      }

      const roots: any[] = [];
      for (const row of sectionRows as any[]) {
        const node = byId.get(row.id)!;
        if (row.parent_section_id && byId.has(row.parent_section_id)) {
          byId.get(row.parent_section_id)!.sections.push(node);
        } else {
          roots.push(node);
        }
      }

      const prune = (nodes: any[]): any[] =>
        nodes
          .map((n) => ({ ...n, sections: prune(n.sections) }))
          .filter((n) => n.items.length > 0 || n.sections.length > 0);

      const filtered = prune(roots);

      const { rows: facets } = await pool.query(
        `SELECT level, category, COUNT(*)::int AS count
           FROM qa_playbook_items WHERE playbook_id = $1 GROUP BY level, category`,
        [playbook.id]
      );
      const levelCounts: Record<string, number> = {};
      const categorySet = new Set<string>();
      let itemCount = 0;
      for (const row of facets as any[]) {
        levelCounts[row.level] = (levelCounts[row.level] ?? 0) + row.count;
        categorySet.add(row.category);
        itemCount += row.count;
      }

      res.status(200).json({
        success: true,
        data: {
          id: playbook.id,
          slug: playbook.slug,
          name: playbook.name,
          category: playbook.category,
          summary: playbook.summary,
          overview: playbook.overview,
          version: playbook.version,
          visibility: playbook.visibility,
          status: playbook.status,
          isOwn: playbook.is_own,
          locked: playbook.locked,
          price: {
            credits: playbook.price_credits,
            amount: playbook.price_amount,
            currency: playbook.price_currency,
          },
          lastUpdatedAt: playbook.last_updated_at,
          itemCount,
          levelCounts,
          categories: [...categorySet],
          sections: filtered,
          pendingRequest: false
        }
      } as ApiResponse);
    } catch (error) {
      console.error("Error fetching public playbook details:", error);
      res.status(500).json({ success: false, error: 'Failed to fetch public playbook details' } as ApiResponse);
    }
  }
}
