// src/modules/opening-management/services/aiAssist.types.ts
//
// Shared types for the AI assist slice. They live in their own file so the
// suggestion-cache repository can use them without importing the service —
// which would be a cycle, since the service imports the repository.

export type AssistField = 'job_description' | 'responsibilities';

/** What the form knows about the opening, used to ground the generation. */
export interface AssistContext {
  jobTitle: string;
  departmentName?: string | null;
  employmentType?: string | null;
  workMode?: string | null;
  location?: string | null;
  minExperience?: number | null;
  maxExperience?: number | null;
  requiredSkills?: string[];
  preferredSkills?: string[];
}

export interface SuggestionGroup {
  key: string;
  label: string;
  items: string[];
}

/** What the picker gets back: the groups plus where they came from. */
export interface SuggestionResult {
  groups: SuggestionGroup[];
  /** True when these came from the shared cache rather than a fresh AI call. */
  cached: boolean;
  /** The title the cache is keyed on. */
  position: string;
}
