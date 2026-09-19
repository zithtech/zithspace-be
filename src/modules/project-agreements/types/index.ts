// src/modules/project-agreements/types/index.ts
//
// The shapes this module speaks over HTTP. camelCase on the wire, snake_case in
// the database — every repository aliases columns rather than making the
// frontend learn two spellings.

export type TemplateStatus = 'draft' | 'published' | 'archived';
export type DocumentTypeStatus = 'active' | 'inactive';
export type AgreementStatus = 'draft' | 'pending' | 'active' | 'expired' | 'terminated';
export type PlaceholderType = 'text' | 'textarea' | 'number' | 'date' | 'currency';
export type PlaceholderSource = 'manual' | 'project' | 'company';

export const TEMPLATE_STATUSES: readonly TemplateStatus[] = ['draft', 'published', 'archived'];
export const DOCUMENT_TYPE_STATUSES: readonly DocumentTypeStatus[] = ['active', 'inactive'];
export const AGREEMENT_STATUSES: readonly AgreementStatus[] = [
  'draft',
  'pending',
  'active',
  'expired',
  'terminated',
];
export const PLACEHOLDER_TYPES: readonly PlaceholderType[] = [
  'text',
  'textarea',
  'number',
  'date',
  'currency',
];
export const PLACEHOLDER_SOURCES: readonly PlaceholderSource[] = ['manual', 'project', 'company'];

/**
 * The summary block printed under the letterhead — label on the left, value on
 * the right, no header row.
 *
 * ONE ORDERED REGISTRY, and both ends read it: the renderer for what to print,
 * the composer for what to offer. A row whose value is empty is skipped at
 * render time, so turning a row on costs nothing until it has something to say.
 */
export const SUMMARY_FIELDS = [
  { key: 'title', label: 'Title' },
  { key: 'client', label: 'Client' },
  { key: 'kickoff', label: 'Project Kick-off' },
  { key: 'value', label: 'Total Project Value' },
  { key: 'contacts', label: 'Client Contacts' },
  // Key stays 'date' on purpose — renaming it would orphan every stored
  // summary_fields array that already lists it.
  { key: 'date', label: 'Issue Date' },
  { key: 'reference', label: 'Reference' },
  { key: 'project', label: 'Project' },
  // Appended, never inserted: the key order is the PRINT order, and an
  // existing document that stored an explicit summary_fields array keeps
  // exactly the rows it had.
  { key: 'company', label: 'Company' },
] as const;

/**
 * Rows that share a line, split by a divider.
 *
 * Two short dates side by side read better than two near-empty rows, and it is
 * the pair people compare — when work starts against when the paper was
 * issued. A pair collapses back to a single full-width row whenever only one of
 * its halves has something to show.
 */
export const SUMMARY_PAIRS: ReadonlyArray<readonly [string, string]> = [['kickoff', 'date']];

export type SummaryFieldKey = (typeof SUMMARY_FIELDS)[number]['key'];
export const SUMMARY_FIELD_KEYS: readonly SummaryFieldKey[] = SUMMARY_FIELDS.map((f) => f.key);

/**
 * A kind of document — Proposal, MSA, NDA, Change Order.
 *
 * `code` is the stable machine name and `name` is free to change, which is the
 * reason the two are separate fields rather than one.
 */
export interface DocumentType {
  id: string;
  name: string;
  code: string;
  description: string | null;
  status: DocumentTypeStatus;
  /** Live templates citing this type — only on the settings listing. */
  templateCount?: number;
  /** Live agreements citing it. Both block a delete; neither blocks Inactive. */
  agreementCount?: number;
  createdAt: string;
  updatedAt: string;
}

/** A row in the composer's client picker. */
export interface ClientOption {
  id: string;
  companyName: string;
  clientCode: string | null;
  status: string | null;
  website: string | null;
  billingAddress: string | null;
}

/** Somebody at that client the document can be addressed to. */
export interface ClientContact {
  id: string;
  firstName: string | null;
  lastName: string | null;
  displayName: string | null;
  designation: string | null;
  department: string | null;
  contactType: string | null;
  isPrimary: boolean | null;
  officialEmail: string | null;
  secondaryEmail: string | null;
  mobileNumber: string | null;
  alternatePhone: string | null;
  officeLandline: string | null;
  status: string | null;
}

/** The letterhead: header identity on the right, contact strip in the footer. */
export interface Branding {
  companyName: string | null;
  tagline: string | null;
  logoUrl: string | null;
  /** The authorised signature image, printed in our side of the sign-off. */
  signatureUrl: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  /** Free-text "where we are" line, e.g. "Chennai-91, India". */
  location: string | null;
  footerNote: string | null;
  updatedAt?: string;
}

export interface TemplatePlaceholder {
  id: string;
  templateId: string;
  key: string;
  label: string;
  dataType: PlaceholderType;
  source: PlaceholderSource;
  required: boolean;
  defaultValue: string | null;
  displayOrder: number;
}

export interface AgreementTemplate {
  id: string;
  name: string;
  /** The kind of document. Required by the API; nullable on rows predating it. */
  documentTypeId: string | null;
  /** Resolved for display. The template follows a rename; an agreement does not. */
  documentTypeName: string | null;
  documentTypeCode: string | null;
  /**
   * The free text this replaced. Kept as provenance and no longer surfaced —
   * see migration 011.
   */
  category: string | null;
  description: string | null;
  bodyHtml: string;
  status: TemplateStatus;
  version: number;
  placeholders: TemplatePlaceholder[];
  /** Live agreements generated from this template — blocks a careless delete. */
  agreementCount?: number;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Agreement {
  id: string;
  /** The kind of document. Required by the API; nullable on rows predating it. */
  documentTypeId: string | null;
  /** Snapshot, so renaming a type never relabels a signed document. */
  documentTypeName: string | null;
  documentTypeCode: string | null;
  /** null when the document is not raised against a project. */
  projectId: string | null;
  projectName: string | null;
  projectCode: string | null;
  templateId: string | null;
  templateName: string | null;
  templateVersion: number | null;
  /** The DOCUMENT NAME — printed top-left of every page. */
  title: string;
  /** The summary block's Title row. Falls back to `title` when blank. */
  summaryTitle: string | null;
  documentNumber: string | null;
  contentHtml: string;
  status: AgreementStatus;
  effectiveDate: string | null;
  expiryDate: string | null;
  /** The date on the document, which is not the date it takes effect. */
  documentDate: string | null;
  kickoffDate: string | null;
  /** Decimal string — pg returns numeric as text so 15 digits stay exact. */
  totalValue: string | null;
  valueCurrency: string | null;
  /** The client this document is addressed to, when one was picked. */
  clientId: string | null;
  /**
   * The client's COMPANY, snapshot at save time.
   *
   * Distinct from partyName, which is now the person the document is sent to.
   * Copied rather than joined so renaming a client never rewrites a signed
   * document — the same rule projectName follows.
   */
  clientCompany: string | null;
  /** The contact the document is addressed to, when one was picked. */
  clientContactId: string | null;
  partyName: string | null;
  partyEmail: string | null;
  partyPhone: string | null;
  /** Our signatory — name and the authority they sign under. */
  signatoryName: string | null;
  signatoryPosition: string | null;
  /** The entity WE sign for. Falls back to the letterhead's company name. */
  signatoryCompany: string | null;
  /** Theirs. Falls back to partyName when blank. */
  clientSignatoryName: string | null;
  /** The authority THEY sign under — the counterparty's half of "Name - Position". */
  clientSignatoryPosition: string | null;
  /** The entity THEY sign for. Falls back to partyName. */
  clientSignatoryCompany: string | null;
  showSignatures: boolean;
  /** Which summary rows to print. null means every one of them. */
  summaryFields: SummaryFieldKey[] | null;
  notes: string | null;
  pdfUrl: string | null;
  pdfGeneratedAt: string | null;
  /** When the client first opened it in the portal. null means never. */
  portalViewedAt: string | null;
  values?: Record<string, string>;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

/** A project as this module needs it — enough to prefill `project.*` tokens. */
export interface ProjectContext {
  id: string;
  name: string;
  code: string | null;
  description: string | null;
  status: string | null;
  startDate: string | null;
  endDate: string | null;
  managerName: string | null;
  managerEmail: string | null;
}
