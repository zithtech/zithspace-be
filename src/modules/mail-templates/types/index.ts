// src/modules/mail-templates/types/index.ts
// Shared domain types + module error class for Mail Templates.

/**
 * The value that stands for "no category" wherever a category is passed as a
 * single string — a sidebar entry and a query param cannot carry null, and an
 * empty string is indistinguishable from "no filter at all".
 */
export const UNCATEGORIZED = '__none__';

/** A shelf in the template library: a category name and how full it is. */
export interface TemplateCategory {
  /** null for the templates nobody has filed. */
  name: string | null;
  count: number;
}

/** The acting principal for a write, derived from the authenticated request. */
export interface Actor {
  tenantId: string;
  userId: string;
}

/** A typed, HTTP-aware error the controller layer maps to a JSON response. */
export class MailTemplateError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = 'MailTemplateError';
  }

  static notFound(resource: string): MailTemplateError {
    return new MailTemplateError(404, 'NOT_FOUND', `${resource} not found`);
  }

  static badRequest(message: string): MailTemplateError {
    return new MailTemplateError(400, 'BAD_REQUEST', message);
  }

  static conflict(message: string): MailTemplateError {
    return new MailTemplateError(409, 'CONFLICT', message);
  }
}

export interface MailTemplate {
  id: string;
  name: string;
  subject: string;
  /** Sanitised HTML, placeholders included. */
  body: string;
  category: string | null;
  isDefault: boolean;
  /** Tokens this template uses — saves the client re-parsing the body. */
  placeholders: string[];
  /** Tokens it uses that are not in the catalogue; they will send literally. */
  unknownPlaceholders: string[];
  createdAt: Date;
  updatedAt: Date;
}

/** The signed-in member, as the source of the `my_*` placeholders. */
export interface Sender {
  id: string;
  name: string;
  email: string;
  values: Record<string, string | null>;
}

/** A member's signature, and whether it is theirs or one we built for them. */
export interface MailSignature {
  /** As stored (or as generated) — placeholders still standing. */
  html: string;
  /** The same signature with the sender's details filled in. */
  resolvedHtml: string;
  /**
   * True when nothing has been saved yet and this was built from the member's
   * own record — the editor says so, and saving turns it into theirs.
   */
  isAutofilled: boolean;
  updatedAt: Date | null;
  /** Who it was built from, so the editor can show whose details these are. */
  sender: Sender | null;
}

/** Someone a template can be addressed to, from either placeholder group. */
export interface Recipient {
  id: string;
  kind: 'client_contact' | 'member';
  name: string;
  email: string;
  /** Company for a client contact, position for a member — the list subtitle. */
  subtitle: string | null;
  /** The placeholder values this recipient resolves, keyed by token. */
  values: Record<string, string | null>;
}
