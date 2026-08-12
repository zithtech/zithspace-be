// src/modules/company-details/types/index.ts
// Shared domain types + module error class for Company Details.

/** The acting principal for a write, derived from the authenticated request. */
export interface Actor {
  tenantId: string;
  userId: string;
}

/** A typed, HTTP-aware error the controller layer maps to a JSON response. */
export class CompanyDetailsError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = 'CompanyDetailsError';
  }

  static notFound(resource: string): CompanyDetailsError {
    return new CompanyDetailsError(404, 'NOT_FOUND', `${resource} not found`);
  }

  static badRequest(message: string): CompanyDetailsError {
    return new CompanyDetailsError(400, 'BAD_REQUEST', message);
  }

  static conflict(message: string): CompanyDetailsError {
    return new CompanyDetailsError(409, 'CONFLICT', message);
  }
}

/** The postal address shape shared by the company and its branches. */
export interface Address {
  doorNumber: string | null;
  floor: string | null;
  building: string | null;
  area: string | null;
  street: string | null;
  city: string | null;
  district: string | null;
  state: string | null;
  pincode: string | null;
  country: string | null;
}

export interface CompanyDetails extends Address {
  id: string;
  registeredName: string;
  gstNumber: string | null;
  primaryEmail: string;
  primaryPhone: string;
  /** Normalised to always carry a scheme, e.g. https://example.com. */
  website: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CompanyBranch extends Address {
  id: string;
  branchName: string;
  useCompanyEmail: boolean;
  /** NULL whenever useCompanyEmail is true. */
  branchEmail: string | null;
  /** Resolved for the caller: the branch email, or the company's primary email. */
  effectiveEmail: string | null;
  branchPhone: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}
