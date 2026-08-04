// src/modules/opening-management/services/skillMatch.ts
//
// Score a candidate's skills against an opening's, out of 100.
//
// Pure functions, no I/O — the matching rules are the whole substance here, so
// they live somewhere they can be read and reasoned about in one sitting.
//
// TWO THINGS THIS DELIBERATELY DOES NOT DO:
//   * It does not claim to judge a candidate. It measures overlap between two
//     lists of words. A 40% match on a strong CV is common when the opening
//     lists eight niche tools; the number is a sorting aid, not a verdict.
//   * It does not fuzzy-match aggressively. "Go" matching "Google" or "Java"
//     matching "JavaScript" would be worse than no match at all, so short
//     tokens only ever match exactly.

export interface SkillMatchResult {
  /** 0–100, or null when the opening lists no skills to match against. */
  score: number | null;
  /** Why the score is null, for the UI to explain rather than show "0%". */
  reason?: string;
  matchedRequired: string[];
  missingRequired: string[];
  matchedPreferred: string[];
  missingPreferred: string[];
  /** Candidate skills that matched nothing on the opening. */
  additional: string[];
}

/**
 * Required skills carry the score; preferred ones are a bonus. An opening with
 * no preferred skills is scored entirely on required, rather than being capped
 * at 80 for something it never asked for.
 */
const REQUIRED_WEIGHT = 0.8;
const PREFERRED_WEIGHT = 0.2;

/** Strip everything that varies between spellings of the same skill. */
function normalize(skill: string): string {
  return skill.toLowerCase().replace(/[^a-z0-9+#]/g, '');
}

/**
 * Spellings that should be treated as the same skill: `React.js` / `ReactJS` /
 * `React`, `Node` / `Node.js`. Handled as a variant set rather than a synonym
 * table because the `js` suffix is the overwhelmingly common case.
 */
function variantsOf(skill: string): Set<string> {
  const base = normalize(skill);
  const set = new Set<string>([base]);
  if (base.endsWith('js') && base.length > 3) set.add(base.slice(0, -2));
  else set.add(`${base}js`);
  return set;
}

/**
 * Do these two skills refer to the same thing?
 *
 * Containment is only allowed when BOTH sides are reasonably long — otherwise
 * "go" matches "mongo" and "r" matches everything. The 5-character floor is the
 * line between "spring" ⊂ "spring boot" (useful) and "go" ⊂ "django" (wrong).
 */
function sameSkill(a: string, b: string): boolean {
  const av = variantsOf(a);
  const bv = variantsOf(b);
  for (const x of av) if (bv.has(x)) return true;

  const an = normalize(a);
  const bn = normalize(b);
  if (an.length >= 5 && bn.length >= 5) {
    if (an.includes(bn) || bn.includes(an)) return true;
  }
  return false;
}

function partition(
  wanted: string[],
  candidateSkills: string[]
): { matched: string[]; missing: string[] } {
  const matched: string[] = [];
  const missing: string[] = [];
  for (const w of wanted) {
    if (candidateSkills.some((c) => sameSkill(w, c))) matched.push(w);
    else missing.push(w);
  }
  return { matched, missing };
}

export function scoreSkillMatch(
  opening: { requiredSkills: string[]; preferredSkills: string[] },
  candidateSkills: string[]
): SkillMatchResult {
  const required = (opening.requiredSkills ?? []).filter(Boolean);
  const preferred = (opening.preferredSkills ?? []).filter(Boolean);
  const skills = (candidateSkills ?? []).map((s) => s.trim()).filter(Boolean);

  const req = partition(required, skills);
  const pref = partition(preferred, skills);

  // Anything the candidate has that the opening did not ask for — useful
  // context, never counted for or against the score.
  const additional = skills.filter(
    (c) => ![...required, ...preferred].some((w) => sameSkill(w, c))
  );

  const base: Omit<SkillMatchResult, 'score' | 'reason'> = {
    matchedRequired: req.matched,
    missingRequired: req.missing,
    matchedPreferred: pref.matched,
    missingPreferred: pref.missing,
    additional,
  };

  if (required.length === 0 && preferred.length === 0) {
    return {
      ...base,
      score: null,
      reason: 'This opening lists no skills, so there is nothing to match against',
    };
  }
  if (skills.length === 0) {
    return {
      ...base,
      score: null,
      reason: 'No skills were found on the resume',
    };
  }

  const reqRatio = required.length ? req.matched.length / required.length : 0;
  const prefRatio = preferred.length ? pref.matched.length / preferred.length : 0;

  let score: number;
  if (required.length && preferred.length) {
    score = reqRatio * REQUIRED_WEIGHT + prefRatio * PREFERRED_WEIGHT;
  } else if (required.length) {
    score = reqRatio;
  } else {
    score = prefRatio;
  }

  return { ...base, score: Math.round(score * 100) };
}
