export interface Plan {
  id: number;
  name: string;
  code: string;
}

export interface TenantSubscriptionPayload {
  tenantId: string;
  plan: Plan | null;
  status: string | null;
  version: number;
  features: string[];
  limits: Record<string, { type: string, value: number }>;
  trial_ends_at: string | null;
  expires_at: string | null;
}

export interface CachedTenantSubscription extends TenantSubscriptionPayload {
  cachedAt: string;
}
