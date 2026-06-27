// src/modules/performance-report/types/index.ts
// Shared domain types + module error class for the Performance Report module.

/** The acting principal for a write, derived from the authenticated request. */
export interface Actor {
  tenantId: string;
  userId: string;
  employeeId?: string;
}

/** A typed, HTTP-aware error the controller layer maps to a JSON response. */
export class PerfReportError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = 'PerfReportError';
  }

  static notFound(resource: string): PerfReportError {
    return new PerfReportError(404, 'NOT_FOUND', `${resource} not found`);
  }

  static conflict(message: string): PerfReportError {
    return new PerfReportError(409, 'CONFLICT', message);
  }

  static badRequest(message: string): PerfReportError {
    return new PerfReportError(400, 'BAD_REQUEST', message);
  }

  static forbidden(message: string): PerfReportError {
    return new PerfReportError(403, 'FORBIDDEN', message);
  }
}

// ─── Scoring modules ─────────────────────────────────────────────────────────
// The 5 core modules the monthly report scores employees across. This ordered
// list is the single source of truth: defaults are seeded from it and the
// validator rejects any key outside it.
export const MODULE_KEYS = [
  'attendance',
  'leaves',
  'time_tracking',
  'daily_updates',
  'tickets',
] as const;

export type ModuleKey = (typeof MODULE_KEYS)[number];

/** Human-facing labels for each module (handy for the FE / future reports). */
export const MODULE_LABELS: Record<ModuleKey, string> = {
  attendance: 'Attendance',
  leaves: 'Leaves',
  time_tracking: 'Time Tracking',
  daily_updates: 'Daily Updates',
  tickets: 'Tickets',
};

// ─── Settings shapes ─────────────────────────────────────────────────────────
export interface ModuleSetting {
  id: string;
  tenantId: string;
  moduleKey: ModuleKey;
  isEnabled: boolean;
  weight: number;
  config: Record<string, unknown>;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PerfReportSettings {
  id: string;
  tenantId: string;
  autoGenerateEnabled: boolean;
  generationDay: 'last_day';
  generationTime: string;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** The full settings payload returned by GET / produced by PUT. */
export interface PerfReportSettingsDetail extends PerfReportSettings {
  modules: ModuleSetting[];
}
