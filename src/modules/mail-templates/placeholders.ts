// src/modules/mail-templates/placeholders.ts
//
// The placeholder catalogue, and the renderer that fills it in.
//
// Placeholders are grouped by WHO they describe, because a template is
// addressed either to someone at a client or to someone on the team, and the
// two draw from different tables:
//
//   Client Contacts → client_contacts_v2 (+ clients_v2 for the company)
//   Members         → users (+ positions for the job title)
//   My Details      → the signed-in user's own row in those same tables
//
// The group a token belongs to is carried in its prefix (`client_`/`member_`),
// so resolution never has to guess: a recipient matched in client_contacts_v2
// fills the client_* tokens and leaves member_* alone, and vice versa. Tokens
// left unfilled are reported back as `unresolved` rather than being silently
// blanked — an email that goes out reading "Hi ," is worse than one the sender
// was warned about.

export interface PlaceholderField {
  /** Token name, used as {{field}}. */
  field: string;
  /** Human label shown on the chip in the editor. */
  label: string;
  /** What it fills in, shown as the chip's tooltip. */
  hint: string;
}

export interface PlaceholderGroup {
  key: 'client_contact' | 'member' | 'sender';
  label: string;
  /** One line under the group heading explaining where the values come from. */
  description: string;
  fields: PlaceholderField[];
}

export const PLACEHOLDER_GROUPS: PlaceholderGroup[] = [
  {
    key: 'client_contact',
    label: 'Client Contacts',
    description: 'Filled from the client contact the message is addressed to.',
    fields: [
      { field: 'client_name', label: 'Name', hint: 'Contact’s display name' },
      { field: 'client_first_name', label: 'First name', hint: 'Contact’s first name' },
      { field: 'client_last_name', label: 'Last name', hint: 'Contact’s last name' },
      { field: 'client_mail', label: 'Mail', hint: 'Official email address' },
      { field: 'client_phone', label: 'Phone', hint: 'Mobile number' },
      { field: 'client_company', label: 'Company', hint: 'Client company name' },
      { field: 'client_designation', label: 'Designation', hint: 'Job title at the client' },
      { field: 'client_department', label: 'Department', hint: 'Department at the client' },
      { field: 'client_alt_phone', label: 'Alternate phone', hint: 'Alternate phone or office landline' },
      { field: 'client_website', label: 'Website', hint: 'Client company website' },
    ],
  },
  {
    key: 'member',
    label: 'Members',
    description: 'Filled from the team member the message is addressed to.',
    fields: [
      { field: 'member_name', label: 'Name', hint: 'Member’s full name' },
      { field: 'member_first_name', label: 'First name', hint: 'Member’s first name' },
      { field: 'member_mail', label: 'Mail', hint: 'Work email address' },
      { field: 'member_phone', label: 'Phone', hint: 'Contact number' },
      { field: 'member_position', label: 'Position', hint: 'Job position / title' },
      { field: 'member_department', label: 'Department', hint: 'Department the member belongs to' },
    ],
  },
  {
    key: 'sender',
    label: 'My Details',
    description: 'Filled from you, the signed-in member. Mainly for signatures.',
    fields: [
      { field: 'my_name', label: 'Name', hint: 'Your full name' },
      { field: 'my_first_name', label: 'First name', hint: 'Your first name' },
      { field: 'my_mail', label: 'Mail', hint: 'Your work email address' },
      { field: 'my_phone', label: 'Phone', hint: 'Your contact number' },
      { field: 'my_position', label: 'Position', hint: 'Your job position / title' },
      { field: 'my_department', label: 'Department', hint: 'Your department' },
    ],
  },
];

/** Every known token, flattened — the allow-list the renderer checks against. */
export const KNOWN_FIELDS: Set<string> = new Set(
  PLACEHOLDER_GROUPS.flatMap((g) => g.fields.map((f) => f.field))
);

/**
 * `{{ field }}` with optional inner whitespace. Deliberately narrow — letters,
 * digits and underscores only — so ordinary braces in copy are left alone.
 */
const TOKEN = /\{\{\s*([a-z0-9_]+)\s*\}\}/gi;

/** The tokens a piece of copy uses, lower-cased and de-duplicated. */
export function tokensIn(...sources: string[]): string[] {
  const found = new Set<string>();
  for (const source of sources) {
    if (!source) continue;
    for (const match of source.matchAll(TOKEN)) found.add(match[1].toLowerCase());
  }
  return [...found];
}

export interface RenderResult {
  subject: string;
  body: string;
  /** Tokens left as-is: unknown, or known but empty for this recipient. */
  unresolved: string[];
}

/**
 * Substitute the values we have and leave the rest standing.
 *
 * Leaving an unfilled token visible (rather than replacing it with an empty
 * string) is the deliberate choice: the sender sees `{{client_company}}` in
 * the compose window and can fix it before sending, instead of discovering the
 * gap in their sent folder.
 */
export function renderTemplate(
  template: { subject: string; body: string },
  values: Record<string, string | null | undefined>
): RenderResult {
  const unresolved = new Set<string>();

  const fill = (source: string): string =>
    (source ?? '').replace(TOKEN, (whole, raw: string) => {
      const field = raw.toLowerCase();
      const value = values[field];
      if (value === undefined || value === null || value === '') {
        unresolved.add(field);
        return whole;
      }
      return value;
    });

  return {
    subject: fill(template.subject),
    body: fill(template.body),
    unresolved: [...unresolved],
  };
}

/**
 * A signature built from the signed-in member's own record.
 *
 * This is what a member sees the first time they open the signature editor,
 * instead of an empty box — the details the platform already holds about them,
 * laid out the way a signature reads.
 *
 * It is written with {{my_*}} placeholders rather than the literal values, so
 * an unedited signature follows a change of position or number on its own; the
 * editor shows it resolved, so what the member reads is still their own name
 * and title, not a row of braces.
 *
 * Table-free and inline-styled on purpose: mail clients honour a simple
 * stack of <div>s far more consistently than anything cleverer.
 */
export function buildDefaultSignature(values: Record<string, string | null | undefined>): string {
  const line = (token: string, style: string) =>
    values[token] ? `<div style="${style}">{{${token}}}</div>` : '';

  // A name is the one thing a signature cannot do without; with no name on the
  // record there is nothing worth autofilling, so the member starts blank.
  if (!values.my_name) return '';

  const role = [values.my_position ? '{{my_position}}' : '', values.my_department ? '{{my_department}}' : '']
    .filter(Boolean)
    .join(' · ');

  return [
    '<p>—</p>',
    '<div>',
    line('my_name', 'font-weight: 600;'),
    role ? `<div style="color: #64748b;">${role}</div>` : '',
    line('my_mail', 'color: #64748b;'),
    line('my_phone', 'color: #64748b;'),
    '</div>',
  ]
    .filter(Boolean)
    .join('');
}
