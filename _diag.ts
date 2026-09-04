import { Client } from 'pg';
import { getAIProviderForTenant } from '@/services/ai/resolver';
import { entitlementService } from '@/services/EntitlementService';
import { itemSchema } from '@/modules/qa-playbooks/validators';
import { AIPricingEngine } from '@/ai/pricing/AIPricingEngine';
import pool from '@/config/dbpool';

(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  const u = (await c.query(`SELECT id, tenant_id, work_email FROM users WHERE is_active=true AND role ILIKE '%admin%' LIMIT 1`)).rows[0];
  await c.end();
  console.log('tenant:', u.tenant_id);

  console.log('\n1) imports resolved:', {
    itemSchema: typeof itemSchema?.safeParse,
    pricing: typeof AIPricingEngine?.calculate,
    entitlements: typeof entitlementService?.checkLimit,
  });

  console.log('\n2) entitlement checkLimit...');
  try {
    await entitlementService.checkLimit(u.tenant_id, 'ai_credits_month');
    console.log('   ok — within limit');
  } catch (e: any) {
    console.log('   THREW:', e.constructor?.name, '|', e.message);
  }

  console.log('\n3) resolve AI provider...');
  try {
    const p = await getAIProviderForTenant(u.tenant_id);
    console.log('   provider:', p?.name, '| isConfigured:', p?.isConfigured?.());
    console.log('   has generateText:', typeof p?.generateText);
  } catch (e: any) {
    console.log('   THREW:', e.constructor?.name, '|', e.message);
    console.log(e.stack?.split('\n').slice(0, 5).join('\n'));
  }

  await pool.end();
  process.exit(0);
})().catch((e) => { console.error('DIAG FAILED:', e); process.exit(1); });
