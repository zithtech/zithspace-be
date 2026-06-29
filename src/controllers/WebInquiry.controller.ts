import { Request, Response } from 'express';
import { LeadModel } from '@/models/Lead.model';
import { LeadStatusModel } from '@/models/LeadStatus.model';
import { LeadPlatformModel, deriveCode as derivePlatformCode } from '@/models/LeadPlatform.model';
import pool from '@/config/dbpool';
import { tenantAwarePrisma } from '@/config/database';

// ─── simple e-mail validator ─────────────────────────────────────────────────
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ─── per-IP in-memory rate limiter (sliding window) ──────────────────────────
const ipWindowMs = 10 * 60 * 1000; // 10 minutes
const ipMaxReqs  = 5;              // max 5 submissions per window per IP
const ipBuckets  = new Map<string, number[]>();

function isRateLimited(ip: string): boolean {
  const now    = Date.now();
  const window = ipWindowMs;
  let hits = (ipBuckets.get(ip) || []).filter(t => now - t < window);
  if (hits.length >= ipMaxReqs) return true;
  hits.push(now);
  ipBuckets.set(ip, hits);
  return false;
}

// ─── derive a human-readable platform name from the URL slug ─────────────────
// e.g. "zukvo" → "Zukvo",  "my-site" → "My-site"
function platformNameFromSlug(slug: string): string {
  if (!slug) return 'Website';
  // Known branded slugs → proper casing
  const known: Record<string, string> = {
    zukvo:    'Zukvo',
    zithtech: 'Zithtech',
    zithmi:   'Zithmi',
  };
  return known[slug.toLowerCase()] ?? slug.charAt(0).toUpperCase() + slug.slice(1);
}

export class WebInquiryController {

  /**
   * POST /api/public/web-inquiry/:tenantSlug
   *
   * Public endpoint — no auth or tenant header required.
   * Websites call this when a visitor submits a contact / enquiry form.
   *
   * The backend accepts the Zukvo ContactSales form payload as-is:
   *   firstName*  lastName*  email*  company*
   *   size  useCase  phoneNumber  description
   *
   * All field names come straight from the website form — nothing is
   * renamed or repackaged on the client side.
   */
  static async submitInquiry(req: Request, res: Response): Promise<void> {

    // ── 1. Rate-limit by IP ─────────────────────────────────────────────────
    const clientIp =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim()
      || req.socket.remoteAddress
      || 'unknown';

    if (isRateLimited(clientIp)) {
      res.status(429).json({
        success: false,
        message: 'Too many submissions. Please wait a few minutes and try again.',
      });
      return;
    }

    // ── 2. Resolve tenant by secret key ───────────────────────────────────────────
    const secretKey = req.headers['x-web-inquiry-key'] || req.params.tenantSlug;
    if (!secretKey) {
      res.status(400).json({ success: false, message: 'Web inquiry secret key is required.' });
      return;
    }

    let tenantId;
    let tenantSubdomain;
    let tenantName;

    try {
      const result = await pool.query(
        `SELECT id, name, subdomain, is_active 
         FROM tenants 
         WHERE web_inquiry_secret_key = $1 AND is_active = true 
         LIMIT 1`,
        [secretKey]
      );

      const tenant = result.rows[0];

      if (!tenant) {
        res.status(404).json({ success: false, message: 'Workspace not found or invalid key.' });
        return;
      }

      tenantId = tenant.id;
      tenantSubdomain = tenant.subdomain;
      tenantName = tenant.name;
    } catch (err) {
      console.error('[WebInquiry] Error finding tenant by secret key:', err);
      res.status(500).json({ success: false, message: 'Internal server error.' });
      return;
    }

    // ── 3. Read body fields using flexible field extraction and multi-alias fallbacks ──
    const body = (req.body || {}) as Record<string, any>;

    const extractField = (aliases: string[]): any => {
      for (const alias of aliases) {
        if (body[alias] !== undefined && body[alias] !== null) {
          return body[alias];
        }
      }
      return undefined;
    };

    const emailVal = String(extractField(['email', 'email_address', 'contactEmail', 'companyEmail']) || '').trim();
    const phoneNumberVal = String(extractField(['phoneNumber', 'phone', 'mobile', 'contact_phone']) || '').trim();
    const companyVal = String(extractField(['company', 'organisation', 'organization', 'business_name', 'companyName']) || '').trim();

    let clientName = '';
    const fName = String(extractField(['firstName']) || '').trim();
    const lName = String(extractField(['lastName']) || '').trim();
    if (fName || lName) {
      clientName = `${fName} ${lName}`.trim();
    } else {
      clientName = String(extractField(['name', 'full_name', 'fullName', 'contact_name', 'companyName']) || '').trim();
    }

    // Collate all remaining body fields into form_data
    const identityKeys = new Set([
      'firstName', 'lastName', 'name', 'full_name', 'fullName', 'contact_name', 'companyName',
      'email', 'email_address', 'contactEmail', 'companyEmail',
      'phoneNumber', 'phone', 'mobile', 'contact_phone',
      'company', 'organisation', 'organization', 'business_name'
    ]);

    const form_data: Record<string, any> = {};
    for (const [key, value] of Object.entries(body)) {
      if (!identityKeys.has(key)) {
        form_data[key] = value;
      }
    }

    // ── 4. Validate required fields ─────────────────────────────────────────
    const missing: string[] = [];
    if (!clientName) missing.push('name');
    if (!emailVal) missing.push('email');

    if (missing.length) {
      res.status(422).json({
        success: false,
        message: `Missing required fields: ${missing.join(', ')}`,
      });
      return;
    }

    if (!EMAIL_RE.test(emailVal)) {
      res.status(422).json({ success: false, message: 'Invalid email address.' });
      return;
    }

    // ── 5. Derive platform from URL slug & auto-create if needed ─────────────
    let rawSlug = req.params.tenantSlug;
    if (!rawSlug || rawSlug.toLowerCase() === 'submit') {
      rawSlug = tenantName || tenantSubdomain;
    }
    const platformName = platformNameFromSlug(rawSlug);
    const platformCode = derivePlatformCode(platformName);

    try {
      const existingPlatform = await pool.query(
        'SELECT id FROM lead_platforms WHERE tenant_id = $1 AND code = $2 LIMIT 1',
        [tenantId, platformCode],
      );

      if (existingPlatform.rows.length === 0) {
        console.log(`[WebInquiry] Auto-creating website platform: ${platformName} (${platformCode}) for tenant ${tenantId}`);
        await LeadPlatformModel.create({
          tenant_id:   tenantId,
          name:        platformName,
          code:        platformCode,
          type:        'website',
          is_active:   true,
          order:       0,
          url:         req.headers.origin || '',
          description: `Automatically created from website inquiry (${platformName})`,
        });
      }
    } catch (err) {
      // Non-fatal — lead creation continues even if platform insert fails
      console.error('[WebInquiry] Failed to auto-create platform setting:', err);
    }

    // ── 6. Resolve default lead status ──────────────────────────────────────
    const defaultStatus = await LeadStatusModel.findDefault(tenantId);
    const status = defaultStatus?.name || 'Open';

    // ── 7. Build inquiry message from the extra form fields ─────────────────
    const inquiryParts: string[] = [];
    const sizeVal = extractField(['size']);
    if (sizeVal !== undefined && String(sizeVal).trim() !== '') {
      inquiryParts.push(`Team size: ${sizeVal}`);
    }
    const useCaseVal = extractField(['useCase']);
    if (useCaseVal !== undefined && String(useCaseVal).trim() !== '') {
      inquiryParts.push(`Use case: ${useCaseVal}`);
    }
    const msgVal = extractField(['description', 'message', 'inquiry']);
    if (msgVal !== undefined && String(msgVal).trim() !== '') {
      inquiryParts.push(String(msgVal).trim());
    }
    const inquiryMessage = inquiryParts.join('\n\n');

    // ── 8. Create the lead ───────────────────────────────────────────────────
    try {
      const lead = await LeadModel.create({
        tenant_id:        tenantId,
        title:            `Website enquiry — ${companyVal ? companyVal : platformName}`,
        client_name:      clientName,
        client_mail:      emailVal.toLowerCase(),
        client_phone:     phoneNumberVal || null,
        company:          companyVal || null,
        status,
        platform:         platformName,
        lead_source_kind: 'website',
        website_source:   req.params.tenantSlug || tenantSubdomain,          // raw slug stored for filtering
        inquiry_message:  inquiryMessage || null,
        posted_on:        new Date(),
        form_data:        Object.keys(form_data).length > 0 ? form_data : null,
        summary: inquiryMessage
          || `Enquiry from ${clientName}${companyVal ? ` at ${companyVal}` : ''} via ${platformName}`,
      });

      console.log(`[WebInquiry] Created lead ${lead.id} for tenant ${tenantId} from ${platformName}`);

      res.status(201).json({
        success: true,
        message: 'Your enquiry has been received. We will be in touch shortly.',
        data: {
          leadId:    lead.id,
          reference: lead.id.slice(0, 8).toUpperCase(),
        },
      });
    } catch (err: any) {
      console.error('[WebInquiry] Failed to create lead:', err);
      res.status(500).json({
        success: false,
        message: 'We could not process your submission. Please try again.',
      });
    }
  }
}
