// src/modules/project-agreements/services/render.service.ts
//
// THE DOCUMENT LAYOUT. One implementation, two outputs, and that is the whole
// point of this file: the on-screen preview and the PDF must be the same
// document or the preview is a lie.
//
//   ┌──────────────────────────────────────────────────────────────┐
//   │ Document name                        [logo] Company Name     │  header
//   │                                              Company tagline │
//   ├──────────────────────────────────────────────────────────────┤
//   │                                                              │
//   │  body — the template wording with placeholders substituted   │
//   │                                                              │
//   ├──────────────────────────────────────────────────────────────┤
//   │  +91 …   ·   hello@acme.com   ·   acme.com                   │  footer
//   └──────────────────────────────────────────────────────────────┘
//
// HOW THE HEADER AND FOOTER REPEAT ON EVERY PAGE — and the two approaches
// that were tried, because the wrong one looks right until you print page 3:
//
//   `position: fixed` is the obvious answer and it DOES NOT WORK. Chrome paints
//   a fixed element on some printed pages and not others; a three-page test
//   document came out with the header on pages 1–2 and the footer on 2–3.
//
//   `display: table-header-group` / `table-footer-group` is what actually
//   repeats. The print frame therefore wraps the document in a one-column
//   table: <thead> is the letterhead, <tfoot> the contact strip, and Chrome
//   repeats both across every page fragment. That is why the print and screen
//   frames emit different wrappers around the SAME header/body/footer markup.
//
//   Neither is Puppeteer's headerTemplate/footerTemplate: those render in a
//   separate document that cannot see this stylesheet, default to 10px type,
//   and silently drop any image that is not already a data: URI.
//
// WHY CHROME IS THE SUBSTITUTION BOUNDARY:
//   Placeholder values are user input and land inside an HTML document, so
//   every substituted value is HTML-escaped (see escapeHtml). The template BODY
//   is trusted rich text authored in the product's own editor — it must not be
//   escaped or the formatting disappears.

import {
  Branding,
  ProjectContext,
  SUMMARY_FIELDS,
  SUMMARY_PAIRS,
  SummaryFieldKey,
  TemplatePlaceholder,
} from '../types';
import { formatMoneyWithWords } from './money';

export type RenderMode = 'screen' | 'print';

export interface RenderInput {
  /** The DOCUMENT NAME — shown top-left in the header. */
  title: string;
  /** The summary block's Title row. Falls back to `title` when blank. */
  summaryTitle?: string | null;
  /** Rich text from the template, placeholders already present as {{key}}. */
  bodyHtml: string;
  branding: Branding;
  project?: ProjectContext | null;
  values?: Record<string, string>;
  placeholders?: TemplatePlaceholder[];
  documentNumber?: string | null;
  effectiveDate?: string | null;

  /* ── The summary block under the letterhead ──────────────────────────── */
  client?: string | null;
  /** The client's COMPANY. Prints as its own summary row. */
  clientCompany?: string | null;
  clientEmail?: string | null;
  clientPhone?: string | null;
  kickoffDate?: string | null;
  totalValue?: string | number | null;
  valueCurrency?: string | null;
  documentDate?: string | null;
  /** Which rows to print. Absent or null prints every row that has a value. */
  summaryFields?: SummaryFieldKey[] | null;

  /* ── The sign-off block at the foot of the document ──────────────────── */
  signatoryName?: string | null;
  signatoryPosition?: string | null;
  /** Who WE sign as. Falls back to the letterhead's company name. */
  signatoryCompany?: string | null;
  clientSignatoryName?: string | null;
  /** The authority THEY sign under. Prints as "Name - Position", like ours. */
  clientSignatoryPosition?: string | null;
  /** Who THEY sign as. Falls back to the Client row. */
  clientSignatoryCompany?: string | null;
  /** Defaults to true — most agreements are signed. */
  showSignatures?: boolean;
}

/* ── Placeholder substitution ────────────────────────────────────────────── */

/**
 * Tokens the composer never asks for, because it already knows the answer.
 * A template can write {{project_name}} or {{company_name}} and get it filled
 * from the selected project / the letterhead.
 */
export function autoTokens(
  branding: Branding,
  project?: ProjectContext | null
): Record<string, string> {
  return {
    company_name: branding.companyName ?? '',
    company_tagline: branding.tagline ?? '',
    company_phone: branding.phone ?? '',
    company_email: branding.email ?? '',
    company_website: branding.website ?? '',
    company_location: branding.location ?? '',

    project_name: project?.name ?? '',
    project_code: project?.code ?? '',
    project_description: project?.description ?? '',
    project_status: project?.status ?? '',
    project_start_date: formatDate(project?.startDate),
    project_end_date: formatDate(project?.endDate),
    project_manager: project?.managerName ?? '',
    project_manager_email: project?.managerEmail ?? '',

    today: formatDate(new Date().toISOString().slice(0, 10)),
  };
}

/**
 * Replace every {{key}} in `html`.
 *
 * A key with no value is NOT left as {{key}} in the output — a contract that
 * ships with a visible template token reads as a mistake to whoever receives
 * it. It renders as a blank underline instead, which reads as a field somebody
 * still has to complete.
 */
export function substitute(html: string, values: Record<string, string>): string {
  if (!html) return '';
  return html.replace(/\{\{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*\}\}/g, (_match, key: string) => {
    const raw = values[key];
    if (raw === undefined || raw === null || String(raw).trim() === '') {
      return '<span class="pa-blank">&nbsp;</span>';
    }
    return escapeHtml(String(raw)).replace(/\n/g, '<br />');
  });
}

/** Every {{key}} a body references — what the template editor offers to add. */
export function tokensIn(html: string): string[] {
  const found = new Set<string>();
  const re = /\{\{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*\}\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html ?? '')) !== null) found.add(m[1]);
  return [...found];
}

/* ── The document ────────────────────────────────────────────────────────── */

/** The full standalone HTML document — header, body, footer, print CSS. */
export function renderDocument(input: RenderInput, mode: RenderMode = 'print'): string {
  const { branding, project, title } = input;

  const values = {
    ...autoTokens(branding, project),
    ...defaultsOf(input.placeholders),
    ...(input.values ?? {}),
  };

  const body = substitute(input.bodyHtml ?? '', values);
  const header = headerHtml(title, branding);
  const footer = footerHtml(branding);

  const main = `<main class="pa-body">
      ${summaryHtml(input)}
      ${body || '<p class="pa-blank-body">This agreement has no content yet.</p>'}
      ${signoffHtml(input, branding)}
    </main>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title)}</title>
<style>${styles(mode)}</style>
</head>
<body class="pa-${mode}">
  ${mode === 'print' ? printWrapper(header, main, footer) : screenWrapper(header, main, footer)}
</body>
</html>`;
}

/**
 * The print wrapper: a one-column table whose thead and tfoot Chrome repeats on
 * every page. See the note at the top of this file for why this is a table and
 * not three positioned blocks.
 */
function printWrapper(header: string, main: string, footer: string): string {
  return `<table class="pa-sheet">
    <thead><tr><td class="pa-sheet-cell">${header}</td></tr></thead>
    <tbody><tr><td class="pa-sheet-cell">${main}</td></tr></tbody>
    <tfoot><tr><td class="pa-sheet-cell">${footer}</td></tr></tfoot>
  </table>`;
}

/** The screen wrapper: one white A4-width sheet that scrolls as a document. */
function screenWrapper(header: string, main: string, footer: string): string {
  return `<div class="pa-page">
    ${header}
    ${main}
    ${footer}
  </div>`;
}

/**
 * Header: document name hard left, company identity hard right.
 *
 * The right block is a COLUMN of two things — a lockup row, then the tagline:
 *
 *     [logo] Company Name      <- .pa-brand, centred on each other
 *        Company tagline       <- spans under the whole lockup, not just the name
 *
 * The logo and the name are vertically centred on one another rather than
 * top-aligned, because the mark is always taller than a line of type and
 * top-aligning leaves the name floating above a logo that hangs below it.
 */
function headerHtml(title: string, b: Branding): string {
  const logo = b.logoUrl
    ? `<img class="pa-logo" src="${escapeAttr(b.logoUrl)}" alt="" />`
    : '';
  const name = b.companyName
    ? `<div class="pa-company-name">${escapeHtml(b.companyName)}</div>`
    : '';
  const tagline = b.tagline
    ? `<div class="pa-company-tagline">${escapeHtml(b.tagline)}</div>`
    : '';

  return `<header class="pa-header">
    <div class="pa-header-left">
      <div class="pa-doc-name">${escapeHtml(title)}</div>
    </div>
    <div class="pa-header-right">
      <div class="pa-brand">
        ${logo}
        ${name}
      </div>
      ${tagline}
    </div>
  </header>`;
}

/**
 * Footer icons, as inline SVG.
 *
 * Inline and NOT an icon font or a <img>: this markup is printed by headless
 * Chrome with no network, so anything that has to be fetched arrives after the
 * PDF is already rendered — or not at all. The paths are lucide's own
 * (phone / mail / globe / map-pin), so the printed footer carries the same
 * icons the rest of the product draws on screen.
 *
 * `stroke="currentColor"` lets one definition serve the muted footer text and
 * the blue website link without a second copy.
 */
const ICONS: Record<'phone' | 'mail' | 'globe' | 'pin', string> = {
  phone:
    '<path d="M13.832 16.568a1 1 0 0 0 1.213-.303l.355-.465A2 2 0 0 1 17 15h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2A18 18 0 0 1 2 4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-.8 1.6l-.468.351a1 1 0 0 0-.292 1.233 14 14 0 0 0 6.392 6.384"/>',
  mail:
    '<path d="m22 7-8.991 5.727a2 2 0 0 1-2.009 0L2 7"/><rect x="2" y="4" width="20" height="16" rx="2"/>',
  globe:
    '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>',
  pin:
    '<path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/>',
};

const icon = (name: keyof typeof ICONS): string =>
  `<svg class="pa-foot-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" ` +
  `stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">` +
  `${ICONS[name]}</svg>`;

/** Footer: phone, email, website and location, each behind its own icon. */
function footerHtml(b: Branding): string {
  const parts: string[] = [];

  if (b.phone) {
    parts.push(
      `<a class="pa-foot-item" href="tel:${escapeAttr(telHref(b.phone))}">` +
        `${icon('phone')}<span>${escapeHtml(b.phone)}</span></a>`
    );
  }
  if (b.email) {
    parts.push(
      `<a class="pa-foot-item" href="mailto:${escapeAttr(b.email)}">` +
        `${icon('mail')}<span>${escapeHtml(b.email)}</span></a>`
    );
  }
  if (b.website) {
    parts.push(
      `<a class="pa-foot-item pa-foot-link" href="${escapeAttr(normaliseUrl(b.website))}">` +
        `${icon('globe')}<span>${escapeHtml(displayUrl(b.website))}</span></a>`
    );
  }
  // Last, because it is where the company IS rather than how to reach it —
  // and because a place name is the part a reader scans for.
  if (b.location) {
    parts.push(
      `<span class="pa-foot-item">${icon('pin')}<span>${escapeHtml(b.location)}</span></span>`
    );
  }

  const note = b.footerNote
    ? `<div class="pa-foot-note">${escapeHtml(b.footerNote)}</div>`
    : '';

  return `<footer class="pa-footer">
    <div class="pa-foot-row">${parts.join('<span class="pa-foot-sep"></span>')}</div>
    ${note}
  </footer>`;
}

/**
 * The summary block: label left, value right, no header row.
 *
 * A TABLE rather than a grid, and deliberately: this block can land near a page
 * break, and a table row is the one construct Chrome's printer will keep whole
 * on its own. A two-column flex or grid would happily split a label from its
 * value across two pages.
 *
 * A row with nothing to say is dropped rather than printed empty — turning a
 * row on therefore costs nothing until it has a value, which is what makes the
 * "print them all" default safe.
 */
function summaryHtml(input: RenderInput): string {
  const selected = input.summaryFields;
  const wanted = (key: SummaryFieldKey) => !selected || selected.includes(key);

  const contacts = [input.clientEmail, input.clientPhone].filter(Boolean).join('  ·  ');
  const project = input.project
    ? input.project.code
      ? `${input.project.name} (${input.project.code})`
      : input.project.name
    : '';

  const value: Record<SummaryFieldKey, string> = {
    /**
     * The summary Title is ITS OWN VALUE, with no fallback to the document name.
     *
     * It used to fall back, and that was wrong twice over: the row then just
     * restated the header, and it broke this block's one rule — a row with
     * nothing to say is left out. Blank Title now means no Title row.
     */
    title: input.summaryTitle ?? '',
    client: input.client ?? '',
    kickoff: formatDate(input.kickoffDate),
    value: formatMoneyWithWords(input.totalValue, input.valueCurrency),
    contacts,
    date: formatDate(input.documentDate ?? input.effectiveDate),
    reference: input.documentNumber ?? '',
    project,
    company: input.clientCompany ?? '',
  };

  const visible = SUMMARY_FIELDS.filter((f) => wanted(f.key) && value[f.key].trim());

  // Four columns, so a paired row can sit inside the same table as the rest.
  // Single rows span the last three; a pair fills all four and the divider is
  // the left border on its second label.
  //
  // A partner is searched for ANYWHERE in the visible list, not just in the
  // next slot: 'kickoff' and 'date' are third and sixth in the field order, so
  // an adjacency test never matches them. The pair renders at the FIRST
  // member's position and the second is struck from the list.
  const consumed = new Set<string>();
  const cells: string[] = [];

  for (const f of visible) {
    if (consumed.has(f.key)) continue;

    const pair = SUMMARY_PAIRS.find(([a]) => a === f.key);
    const partner = pair && visible.find((v) => v.key === pair[1] && !consumed.has(v.key));

    if (partner) {
      consumed.add(partner.key);
      cells.push(
        `<tr><th scope="row">${escapeHtml(f.label)}</th>` +
          `<td>${escapeHtml(value[f.key])}</td>` +
          `<th scope="row" class="pa-summary-split">${escapeHtml(partner.label)}</th>` +
          `<td>${escapeHtml(value[partner.key])}</td></tr>`
      );
      continue;
    }
    cells.push(
      `<tr><th scope="row">${escapeHtml(f.label)}</th>` +
        `<td colspan="3">${escapeHtml(value[f.key])}</td></tr>`
    );
  }

  const rows = cells.join('');
  if (!rows) return '';
  // Wrapped, because border-radius does not apply to a border-collapse table:
  // the box lives on the wrapper and clips the tinted label column's corners.
  return `<div class="pa-summary-box"><table class="pa-summary"><tbody>${rows}</tbody></table></div>`;
}

/**
 * The sign-off block at the foot of the document.
 *
 * ASYMMETRIC BY DESIGN. Our side names the person and the authority they sign
 * under; the counterparty's side carries a name and a place to sign. We do not
 * get to assert someone else's job title on a contract they have not signed.
 *
 * An empty field prints a RULE TO COMPLETE rather than a blank, because a
 * contract that goes out for wet signature usually wants exactly that — and a
 * silently missing line reads as an omission rather than an invitation.
 *
 * A table, for the reason the summary block is one: this lands at the end of
 * the document, which is exactly where a page break is likely, and a table row
 * is the one construct Chrome's printer keeps whole.
 */
function signoffHtml(input: RenderInput, branding: Branding): string {
  if (input.showSignatures === false) return '';

  /**
   * The COMPANY each side signs for, and the person who signs for it.
   *
   * The company is an override, not a second copy of the letterhead: a
   * subsidiary or a different legal entity often signs a document raised on
   * the group's paper, and the heading has to say which one. Left blank it
   * falls back to what it always was — the letterhead on our side, the Client
   * row on theirs — so an existing document reads exactly as it did.
   */
  const ourCompany = (input.signatoryCompany || branding.companyName || '').trim();
  const ours = ourCompany ? `For ${ourCompany}` : 'For us';

  const theirCompany = (
    input.clientSignatoryCompany || input.clientCompany || input.client || ''
  ).trim();
  const theirs = theirCompany ? `For ${theirCompany}` : 'For the client';
  // The client signatory falls back to the Client row — usually the same party.
  const theirName = input.clientSignatoryName || input.client || '';

  /**
   * "Ithyaz - CEO". One line, no field labels: on a signature block the shape
   * says what it is, and "Name:" / "Position:" only adds furniture between the
   * rule and the person. Position is dropped cleanly when absent rather than
   * leaving a dangling dash.
   */
  const who = (name: string, position = ''): string => {
    const line = [name.trim(), position.trim()].filter(Boolean).join(' - ');
    return line
      ? `<div class="pa-sign-who">${escapeHtml(line)}</div>`
      : `<div class="pa-sign-who"><span class="pa-sign-rule"></span></div>`;
  };

  /**
   * `mark` is the signature image, and ONLY our side ever gets one. We do not
   * hold the counterparty's signature, and printing one we invented would be
   * forgery — their slot stays blank for a wet signature.
   */
  const column = (heading: string, line: string, mark = '') =>
    `<div class="pa-sign-head">${escapeHtml(heading)}</div>` +
    `<div class="pa-sign-slot">${mark}</div>` +
    line;

  const ourMark = branding.signatureUrl
    ? `<img class="pa-sign-mark" src="${escapeAttr(branding.signatureUrl)}" alt="" />`
    : '';

  return `<table class="pa-signoff"><tbody><tr>
    <td>${column(ours, who(input.signatoryName ?? '', input.signatoryPosition ?? ''), ourMark)}</td>
    <td class="pa-signoff-split">${column(
      theirs,
      who(theirName, input.clientSignatoryPosition ?? '')
    )}</td>
  </tr></tbody></table>`;
}

/**
 * The stylesheet, shared by both modes.
 *
 * The only differences between screen and print are how the page is framed
 * (a floating white sheet on grey vs. a real A4 page) and how the letterhead
 * repeats (`fixed` so Chrome paints it per page vs. `static` so the preview
 * scrolls as one continuous document).
 *
 * PALETTE: slate/ash and a single blue accent, matching the rest of the app.
 */
function styles(mode: RenderMode): string {
  // The two letterhead bands, identical in both modes so a preview and a PDF
  // give a clause the same amount of room on the page. They are MINIMUMS —
  // HEADER_H is only a floor now that nothing inside it is a fixed height, so
  // it is set just above the lockup rather than leaving slack that shows as a
  // gap between the letterhead and the rule under it.
  const LOGO_H = '10mm';
  const HEADER_H = '16mm';
  const FOOTER_H = '16mm';

  return `
  :root {
    --pa-ink: #0f172a;
    --pa-muted: #64748b;
    --pa-line: #e2e8f0;
    /* The letterhead rules, deliberately heavier than the hairlines used inside
       tables — they are the edge of the page furniture, not a cell divider. */
    --pa-rule: #475569;
    --pa-accent: #3b82f6;
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Roboto, Arial, sans-serif;
    color: var(--pa-ink);
    font-size: 11pt;
    line-height: 1.6;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  /* ── Header ─────────────────────────────────────────────────────── */
  .pa-header {
    display: flex;
    /* The document name drops to sit ON THE TAGLINE'S LINE, not level with the
       logo. "last baseline" is what does it: the right column's last baseline
       is the tagline's, the left column's is the document name's, so the two
       share a line however differently they are sized.
       flex-end is declared first as the fallback — an engine without
       "last baseline" drops that declaration and bottom-aligns the two blocks,
       which lands in very nearly the same place. With no tagline set, the
       right column's last baseline is the company name's, so the title simply
       aligns with that instead. */
    align-items: flex-end;
    align-items: last baseline;
    justify-content: space-between;
    gap: 12mm;
    /* min-, not a fixed height: a long document name wraps, and in print the
       repeating thead simply reserves more room on every page. A fixed height
       would let it spill over the first clause. */
    min-height: ${HEADER_H};
    /* No top padding. The band already sits below the page margin (12mm in
       print, 16mm on screen); adding more here only pushed the letterhead away
       from the top edge and the rule away from the letterhead. */
    padding-bottom: 3mm;
    border-bottom: 1.5px solid var(--pa-rule);
  }
  /* A plain block on purpose: the header aligns the two columns by their last
     baselines, and a flex box with its own min-height would offer the box's
     edge as the alignment point instead of the title's baseline. */
  .pa-header-left { min-width: 0; }
  .pa-doc-name {
    font-size: 15pt;
    font-weight: 700;
    letter-spacing: -0.01em;
    line-height: 1.2;
    color: var(--pa-ink);
    word-break: break-word;
  }
  .pa-header-right {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    flex-shrink: 0;
    min-width: 0;
    text-align: right;
  }
  /* The lockup: mark and wordmark centred on each other, set tight. The gap is
     optical, not geometric — a logo file almost always carries a little
     transparent margin of its own, so a generous CSS gap reads as a much wider
     one on the page. */
  .pa-brand {
    display: flex;
    align-items: center;
    gap: 1.2mm;
    min-width: 0;
  }
  .pa-logo {
    height: ${LOGO_H};
    max-width: 34mm;
    object-fit: contain;
    display: block;
    flex: none;
  }
  .pa-company-name {
    font-size: 12pt;
    font-weight: 700;
    line-height: 1.15;
    color: var(--pa-ink);
    white-space: nowrap;
  }
  /* Under the WHOLE lockup — logo and name both — not just the name. */
  .pa-company-tagline {
    margin-top: 1mm;
    font-size: 8pt;
    line-height: 1.3;
    color: var(--pa-muted);
    max-width: 64mm;
  }

  /* ── Footer ─────────────────────────────────────────────────────── */
  .pa-footer {
    /* min-, for the reason the header is — a two-line footer note must push the
       band taller rather than print on top of the body text. */
    min-height: ${FOOTER_H};
    padding-top: 3.5mm;
    padding-bottom: 2mm;
    border-top: 1.5px solid var(--pa-rule);
    text-align: center;
  }
  .pa-foot-row {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-wrap: wrap;
    gap: 0 4mm;
    font-size: 8.5pt;
    color: var(--pa-muted);
  }
  .pa-foot-item {
    display: inline-flex;
    align-items: center;
    gap: 1.4mm;
    color: var(--pa-muted);
    text-decoration: none;
    white-space: nowrap;
  }
  .pa-foot-link { color: var(--pa-accent); }
  /* Sized in mm so the icon keeps its proportion to the type at any print
     scale; "flex: none" stops a long contact line from squashing it. */
  .pa-foot-icon {
    width: 3.1mm;
    height: 3.1mm;
    flex: none;
    opacity: 0.85;
  }
  /* A hairline between items rather than a bullet: with an icon already
     opening each item, a "·" reads as a third mark competing with them. */
  .pa-foot-sep {
    width: 1px;
    height: 2.6mm;
    background: var(--pa-line);
    display: inline-block;
  }
  .pa-foot-note { margin-top: 1.5mm; font-size: 7.5pt; color: var(--pa-muted); }

  /* ── Body ───────────────────────────────────────────────────────── */
  /* Matches the per-page gap the print frame puts inside the repeated bands,
     so the continuous screen document opens and closes like a printed page. */
  .pa-body { padding: 9mm 0 8mm; }
  /* ── Summary block: a boxed panel, label left, value right ──────────
     Scoped under .pa-body deliberately. The generic ".pa-body th, .pa-body td"
     rules further down carry the same specificity and are declared later, so an
     unscoped ".pa-summary th" loses to them. The extra class is the override. */
  .pa-body .pa-summary-box {
    margin: 0 0 7mm;
    border: 1px solid var(--pa-line);
    border-radius: 2.5mm;
    /* Clips the tinted label column to the rounded corners. Safe because the
       panel is kept whole below — a clipped box across a page break would lose
       a row's top or bottom edge. */
    overflow: hidden;
    background: #ffffff;
    /* A summary that starts on one page and finishes on the next is not a
       summary. Eight rows is ~60mm, so it always fits somewhere. */
    break-inside: avoid;
    page-break-inside: avoid;
  }
  .pa-body .pa-summary {
    width: 100%;
    margin: 0;
    border-collapse: collapse;
    font-size: 10pt;
  }
  .pa-body .pa-summary th,
  .pa-body .pa-summary td {
    padding: 2.2mm 4mm;
    text-align: left;
    vertical-align: top;
    border: none;
    border-bottom: 1px solid var(--pa-line);
    background: none;
  }
  .pa-body .pa-summary tr:last-child th,
  .pa-body .pa-summary tr:last-child td { border-bottom: none; }
  /* The label rail: tinted and ruled off, so the eye reads down the labels and
     across to the values rather than scanning one undifferentiated grid. */
  .pa-body .pa-summary th {
    width: 46mm;
    font-weight: 600;
    color: var(--pa-muted);
    white-space: nowrap;
    background: #f8fafc;
    border-right: 1px solid var(--pa-line);
  }
  /* The answers. Carried a little heavier than the labels — this is the half
     of the block anybody actually reads. */
  .pa-body .pa-summary td {
    color: var(--pa-ink);
    font-weight: 500;
  }
  /* The divider between the two halves of a paired row. A left border rather
     than a separate cell, so the rule runs the full height of the row however
     tall either side becomes. */
  .pa-body .pa-summary th.pa-summary-split {
    border-left: 1px solid var(--pa-line);
  }

  /* ── Sign-off ───────────────────────────────────────────────────────── */
  .pa-body .pa-signoff {
    width: 100%;
    /* The bottom margin matters on the LAST page, where the footer group sits
       directly under the content instead of at the paper's edge — without it
       the signatories run into the footer rule. */
    margin: 12mm 0 8mm;
    border-collapse: collapse;
    /* The two columns must face each other on the same page. If it will not
       fit, the whole block moves to the next page rather than splitting a
       signature away from the name under it. */
    break-inside: avoid;
    page-break-inside: avoid;
  }
  .pa-body .pa-signoff td {
    width: 50%;
    padding: 0 8mm 0 0;
    border: none;
    background: none;
    vertical-align: top;
  }
  .pa-body .pa-signoff td.pa-signoff-split { padding: 0 0 0 8mm; }
  .pa-sign-head {
    font-size: 10pt;
    font-weight: 700;
    color: var(--pa-ink);
    margin-bottom: 2mm;
  }
  /* Where the pen goes. Deliberately tall enough for a real signature rather
     than a token line. */
  .pa-sign-slot {
    height: 20mm;
    border-bottom: 1px solid var(--pa-ink);
    /* The mark sits ON the line, as a pen would leave it: bottom-aligned and
       left-aligned, not floating in the middle of the box. */
    display: flex;
    align-items: flex-end;
    overflow: hidden;
  }
  .pa-sign-mark {
    max-height: 18mm;
    max-width: 55mm;
    object-fit: contain;
    object-position: left bottom;
    display: block;
    /* Just clear of the rule so the strokes are not sitting on it. */
    margin-bottom: 1mm;
  }
  /* The signatory, under the rule. Close enough to read as belonging to that
     signature, far enough not to look like part of the line itself. */
  .pa-sign-who {
    margin-top: 2.5mm;
    font-size: 10pt;
    font-weight: 600;
    color: var(--pa-ink);
  }
  /* An unfilled field: a line to complete by hand, not an empty space. */
  .pa-sign-rule {
    display: block;
    height: 3.6mm;
    border-bottom: 1px solid var(--pa-muted);
  }

  .pa-body h1 { font-size: 15pt; margin: 6mm 0 3mm; }
  .pa-body h2 { font-size: 13pt; margin: 6mm 0 2.5mm; }
  .pa-body h3 { font-size: 11.5pt; margin: 5mm 0 2mm; }
  .pa-body p { margin: 0 0 3.5mm; }
  .pa-body ul, .pa-body ol { margin: 0 0 3.5mm; padding-left: 7mm; }
  .pa-body li { margin-bottom: 1.5mm; }
  .pa-body img { max-width: 100%; }
  .pa-body a { color: var(--pa-accent); }
  .pa-body table {
    width: 100%;
    border-collapse: collapse;
    margin: 0 0 4mm;
    font-size: 10pt;
  }
  .pa-body th, .pa-body td {
    border: 1px solid var(--pa-line);
    padding: 2mm 2.5mm;
    text-align: left;
    vertical-align: top;
  }
  .pa-body th { background: #f8fafc; font-weight: 600; }
  /* BlockNote — the composer's editor — serialises a list item as
     <li><p>…</p></li> and a cell as <td><p>…</p></td>. Those paragraphs would
     otherwise inherit the 3.5mm bottom margin above, padding every bullet and
     inflating every table row. Confirmed against a real 0.46 round-trip. */
  .pa-body li > p,
  .pa-body td > p,
  .pa-body th > p { margin: 0; }
  /* It also emits table rows with no <tbody>; nothing above depends on one,
     but the colgroup it adds must not draw. */
  .pa-body colgroup, .pa-body col { border: none; }
  .pa-body blockquote {
    margin: 0 0 4mm;
    padding-left: 4mm;
    border-left: 2px solid var(--pa-line);
    color: var(--pa-muted);
  }
  /* An unanswered placeholder: a line to complete, not a stray template token. */
  .pa-blank {
    display: inline-block;
    min-width: 28mm;
    border-bottom: 1px solid var(--pa-muted);
  }
  .pa-blank-body { color: var(--pa-muted); font-style: italic; }

  /* ── Page breaks ─────────────────────────────────────────────────────
     A heading must not be the last thing on a page, and a table must not be
     reduced to its header row at the foot of one. "break-after: avoid" alone
     was not enough: the heading plus the table's FIRST row fitted, which
     satisfied the rule while still stranding both — the heading and a lone
     "Component | Status" at the bottom, every actual deliverable overleaf.

     Adding "break-inside: avoid" to the table itself is what fixes it: the
     table becomes one unit, so there is nowhere for the break to land except
     before the heading, and the pair moves to the next page together.

     A table taller than a page cannot be kept whole and Chrome breaks it
     anyway — which is the right fallback, not a regression. */
  .pa-body h1, .pa-body h2, .pa-body h3,
  .pa-body h4, .pa-body h5, .pa-body h6 {
    break-after: avoid;
    page-break-after: avoid;
    break-inside: avoid;
    page-break-inside: avoid;
  }
  .pa-body table { break-inside: avoid; page-break-inside: avoid; }
  .pa-body tr, .pa-body img, .pa-body blockquote { break-inside: avoid; page-break-inside: avoid; }
  /* And no single stranded line where a paragraph does have to split. */
  .pa-body p, .pa-body li { orphans: 2; widows: 2; }

  ${mode === 'print' ? printFrame(HEADER_H, FOOTER_H) : screenFrame(HEADER_H, FOOTER_H)}
  `;
}

/**
 * PRINT: reserve the letterhead strips as page margins, then pin the header and
 * footer into them with `position: fixed` so Chrome repeats both on every page.
 */
function printFrame(_headerH: string, _footerH: string): string {
  return `
  @page {
    size: A4;
    /* Only the paper edges. The letterhead bands are real table rows inside the
       content box, not page margins — that is what lets Chrome repeat them. */
    margin: 12mm 18mm;
  }
  .pa-sheet { width: 100%; border-collapse: collapse; }
  .pa-sheet-cell { padding: 0; border: none; vertical-align: top; }
  /* The two lines that do the actual work. */
  .pa-sheet thead { display: table-header-group; }
  .pa-sheet tfoot { display: table-footer-group; }
  /* A repeated band must never be split across a page break. */
  .pa-sheet thead tr, .pa-sheet tfoot tr { break-inside: avoid; page-break-inside: avoid; }

  /* THE BREATHING ROOM HAS TO LIVE IN THE REPEATED BANDS.
     .pa-body's own padding is applied once to the whole flow, so page one got a
     gap under the letterhead and every continuation page started hard against
     the rule. Putting the space inside the thead and tfoot cells makes it
     repeat with them — every page opens and closes the same way. */
  .pa-sheet thead .pa-sheet-cell { padding-bottom: 9mm; }
  .pa-sheet tfoot .pa-sheet-cell { padding-top: 8mm; }
  /* ...which would otherwise double the gap on page one. */
  .pa-body { padding: 0; }
  `;
}

/** SCREEN: one white A4-width sheet on a grey ground, scrolling as a document. */
function screenFrame(_headerH: string, _footerH: string): string {
  return `
  /* TRANSPARENT, not a grey ground of its own.
     This document is shown inside the preview pane's <iframe>, sized to the
     sheet plus a small margin. If it painted its own background the pane would
     get a light halo around the paper on a dark tray, and a visible seam at the
     frame edge on a light one. Letting the host supply the ground keeps the
     sheet floating in both themes; opened standalone it simply falls back to
     the browser's white, where the sheet's own border and shadow still read. */
  body.pa-screen { background: transparent; padding: 24px 16px; }
  .pa-page {
    width: 210mm;
    max-width: 100%;
    min-height: 297mm;
    margin: 0 auto;
    /* EXACTLY the print @page margin. These had drifted — 16mm here against
       12mm there — so the preview showed more space above the letterhead than
       the PDF ever printed. A preview that pads differently from the press is
       the same bug as one that rewraps. */
    padding: 12mm 18mm;
    background: #ffffff;
    border: 1px solid var(--pa-line);
    border-radius: 4px;
    box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08);
    display: flex;
    flex-direction: column;
  }
  .pa-body { flex: 1; }
  @media (max-width: 820px) {
    body.pa-screen { padding: 12px 8px; }
    .pa-page { padding: 10mm; min-height: 0; }
  }
  `;
}

/* ── Small helpers ───────────────────────────────────────────────────────── */

function defaultsOf(placeholders?: TemplatePlaceholder[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const p of placeholders ?? []) {
    if (p.defaultValue) out[p.key] = p.defaultValue;
  }
  return out;
}

/** YYYY-MM-DD → "14 Sep 2026". Anything else is passed through untouched. */
export function formatDate(value?: string | null): string {
  if (!value) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!m) return value;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${Number(m[3])} ${months[Number(m[2]) - 1]} ${m[1]}`;
}

/**
 * A website typed as "acme.com" must still be a working link in the footer.
 * Anything that is not already http(s) gets https:// — and an input that tries
 * to smuggle another scheme (javascript:, data:) is treated as a bare host, so
 * the href can never become executable.
 */
function normaliseUrl(url: string): string {
  const trimmed = url.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed.replace(/^[a-z][a-z0-9+.-]*:\/*/i, '')}`;
}

/**
 * `tel:` wants dialable characters only. A footer prints "+91 99946 68876";
 * the spaces are for the reader, and a phone that receives them may refuse to
 * dial. A leading + is kept, everything but digits goes.
 */
function telHref(phone: string): string {
  const trimmed = phone.trim();
  const digits = trimmed.replace(/[^0-9]/g, '');
  return trimmed.startsWith('+') ? `+${digits}` : digits;
}

/** What the reader sees: the host and path, without the scheme noise. */
function displayUrl(url: string): string {
  return url.trim().replace(/^https?:\/\//i, '').replace(/\/$/, '');
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(value: string): string {
  return escapeHtml(value);
}
