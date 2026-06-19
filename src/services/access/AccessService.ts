import pool from "@/config/dbpool";

/**
 * Resolves a tenant's plan-based access from the admin-managed access_* tables
 * (which live in this same zukov DB). Used to gate modules/functionalities in
 * addition to the per-user RBAC permissions.
 *
 * Mapping: access_modules.resource ↔ zukov RBAC resource,
 *          access_functionalities.permission_code ↔ zukov permission (`resource.action`).
 */
export interface TenantPlanAccess {
  hasPlan: boolean;
  full: boolean; // full access → everything (subject to RBAC)
  resources: string[];
  permissions: string[];
  functionalityAi: Record<string, boolean>; // permission_code → with_ai
  credits: number;
}

const FULL: TenantPlanAccess = {
  hasPlan: false,
  full: true,
  resources: [],
  permissions: [],
  functionalityAi: {},
  credits: 0,
};

type CacheEntry = { value: TenantPlanAccess; expires: number };
const cache = new Map<string, CacheEntry>();
const TTL_MS = 60_000;

export class AccessService {
  static async getTenantPlanAccess(
    tenantId: string,
    role?: string // eslint-disable-line @typescript-eslint/no-unused-vars
  ): Promise<TenantPlanAccess> {
    // Gate 1 (plan) binds everyone — there is intentionally NO super_admin bypass
    // here. super_admin's RBAC bypass (Gate 2) lives in RBACService.getUserPermissions.
    // `role` is kept only for caller/signature compatibility.
    if (!tenantId) return { ...FULL };

    const cached = cache.get(tenantId);
    if (cached && cached.expires > Date.now()) return cached.value;

    const value = await AccessService.resolve(tenantId);
    cache.set(tenantId, { value, expires: Date.now() + TTL_MS });
    return value;
  }

  private static async resolve(tenantId: string): Promise<TenantPlanAccess> {
    // 1) tenant → plan
    const planRes = await pool.query(
      `SELECT p.id, p.is_full_access, p.credits
         FROM access_tenant_plans tp
         JOIN access_plans p ON p.id = tp.plan_id
        WHERE tp.tenant_id = $1 AND tp.status = 'active'
        LIMIT 1`,
      [tenantId]
    );

    // Fail-open: no plan assigned → full access (nothing breaks until plans roll out).
    if (planRes.rowCount === 0) return { ...FULL };

    const plan = planRes.rows[0];
    if (plan.is_full_access) {
      return { hasPlan: true, full: true, resources: [], permissions: [], functionalityAi: {}, credits: plan.credits ?? 0 };
    }

    // 2) collect granted resources (modules) + permissions (functionalities)
    const [mods, funcs] = await Promise.all([
      pool.query(
        `SELECT m.resource
           FROM access_plan_modules pm
           JOIN access_modules m ON m.id = pm.module_id
          WHERE pm.plan_id = $1 AND m.resource IS NOT NULL`,
        [plan.id]
      ),
      pool.query(
        `SELECT f.permission_code, pf.with_ai
           FROM access_plan_functionalities pf
           JOIN access_functionalities f ON f.id = pf.functionality_id
          WHERE pf.plan_id = $1 AND f.permission_code IS NOT NULL`,
        [plan.id]
      ),
    ]);

    const functionalityAi: Record<string, boolean> = {};
    funcs.rows.forEach((r: any) => { functionalityAi[r.permission_code] = r.with_ai; });

    return {
      hasPlan: true,
      full: false,
      resources: mods.rows.map((r: any) => r.resource),
      permissions: funcs.rows.map((r: any) => r.permission_code),
      functionalityAi,
      credits: plan.credits ?? 0,
    };
  }

  static invalidate(tenantId: string): void {
    cache.delete(tenantId);
  }
}

export default AccessService;
