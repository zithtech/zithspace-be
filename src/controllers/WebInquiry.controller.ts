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

    // ── 2. Resolve tenant by slug ───────────────────────────────────────────
    const { tenantSlug } = req.params;
    if (!tenantSlug) {
      res.status(400).json({ success: false, message: 'Tenant slug is required.' });
      return;
    }

    const rawClient = tenantAwarePrisma.getRawClient();
    const tenant = await rawClient.tenant.findFirst({
      where: {
        OR: [{ subdomain: tenantSlug.toLowerCase() }, { id: tenantSlug }],
        isActive: true,
      },
      select: { id: true, name: true, subdomain: true, isActive: true },
    });

    if (!tenant) {
      res.status(404).json({ success: false, message: 'Workspace not found.' });
      return;
    }

    const tenantId = tenant.id;

    // ── 3. Read body fields — using the website's NATIVE field names ─────────
    // Zukvo ContactSales sends: firstName, lastName, email, company,
    //                            size, useCase, phoneNumber, description
    const {
      firstName   = '',
      lastName    = '',
      email       = '',
      company     = '',
      size        = '',   // "team size" select — kept as the form sends it
      useCase     = '',
      phoneNumber = '',
      description = '',
    } = req.body as Record<string, string>;

    // ── 4. Validate required fields ─────────────────────────────────────────
    const missing: string[] = [];
    if (!firstName.trim()) missing.push('firstName');
    if (!lastName.trim())  missing.push('lastName');
    if (!email.trim())     missing.push('email');
    if (!company.trim())   missing.push('company');

    if (missing.length) {
      res.status(422).json({
        success: false,
        message: `Missing required fields: ${missing.join(', ')}`,
      });
      return;
    }

    if (!EMAIL_RE.test(email.trim())) {
      res.status(422).json({ success: false, message: 'Invalid email address.' });
      return;
    }

    // ── 5. Derive platform from URL slug & auto-create if needed ─────────────
    const platformName = platformNameFromSlug(tenantSlug);
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
    if (size)        inquiryParts.push(`Team size: ${size}`);
    if (useCase)     inquiryParts.push(`Use case: ${useCase}`);
    if (description) inquiryParts.push(description.trim());
    const inquiryMessage = inquiryParts.join('\n\n');

    // ── 8. Create the lead ───────────────────────────────────────────────────
    try {
      const lead = await LeadModel.create({
        tenant_id:        tenantId,
        title:            `Website enquiry — ${company.trim()}`,
        client_name:      `${firstName.trim()} ${lastName.trim()}`,
        client_mail:      email.trim().toLowerCase(),
        client_phone:     phoneNumber.trim() || null,
        company:          company.trim(),
        status,
        platform:         platformName,
        lead_source_kind: 'website',
        website_source:   tenantSlug,          // raw slug stored for filtering
        inquiry_message:  inquiryMessage || null,
        posted_on:        new Date(),
        summary: inquiryMessage
          || `Enquiry from ${firstName.trim()} at ${company.trim()} via ${platformName}`,
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
