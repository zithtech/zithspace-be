/**
 * Best-effort JSON repair for common AI Quirks:
 *   - markdown fences
 *   - leading prose before the first `{`
 *   - trailing prose after the matched `}`
 *   - smart/curly quotes
 *   - trailing commas before `}` or `]`
 *   - truncated output (cut off mid-string/object) — walks back to the last
 *     balanced `}` so we can salvage a partial response
 */
export function tryRepairJson(raw: string): string | null {
  if (!raw) return null;

  // Strip markdown fences and leading/trailing whitespace.
  let s = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();

  // Locate the first '{' — anything before it is prose noise.
  const start = s.indexOf("{");
  if (start === -1) return null;
  s = s.slice(start);

  // Replace smart/curly quotes that the model occasionally introduces.
  s = s.replace(/[“”]/g, '"').replace(/[‘’]/g, "'");

  // Walk forward and track brace/bracket depth, ignoring chars inside strings.
  // Returns the substring up to the position where depth returns to zero.
  // If the input is truncated and never closes, returns null.
  const findBalanced = (input: string): string | null => {
    let depth = 0;
    let inString = false;
    let escape = false;
    for (let i = 0; i < input.length; i++) {
      const c = input[i];
      if (inString) {
        if (escape) escape = false;
        else if (c === "\\") escape = true;
        else if (c === '"') inString = false;
        continue;
      }
      if (c === '"') inString = true;
      else if (c === "{" || c === "[") depth++;
      else if (c === "}" || c === "]") {
        depth--;
        if (depth === 0) return input.slice(0, i + 1);
      }
    }
    return null;
  };

  let candidate = findBalanced(s);

  // If no balanced match (truncated mid-object), try stitching closers on.
  // Walk back to the last position where we have a clean shallow context.
  if (!candidate) {
    let depth = 0;
    let inString = false;
    let escape = false;
    let lastSafe = -1;
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (inString) {
        if (escape) escape = false;
        else if (c === "\\") escape = true;
        else if (c === '"') inString = false;
        continue;
      }
      if (c === '"') inString = true;
      else if (c === "{" || c === "[") depth++;
      else if (c === "}" || c === "]") depth--;
      // Track the last position at depth=1 just after a value boundary — a
      // safe place to chop and add a closing brace.
      if (!inString && depth === 1 && (c === "," || c === '"' || c === "}" || c === "]")) {
        lastSafe = i;
      }
    }
    if (lastSafe > 0) {
      // Chop at the last safe point and close any open structures.
      let truncated = s.slice(0, lastSafe + 1).replace(/,\s*$/, "");
      // Re-walk to compute remaining depth after the chop.
      let depth2 = 0;
      let inStr = false;
      let esc = false;
      const stack: string[] = [];
      for (const c of truncated) {
        if (inStr) {
          if (esc) esc = false;
          else if (c === "\\") esc = true;
          else if (c === '"') inStr = false;
          continue;
        }
        if (c === '"') inStr = true;
        else if (c === "{") {
          stack.push("}");
          depth2++;
        } else if (c === "[") {
          stack.push("]");
          depth2++;
        } else if (c === "}" || c === "]") {
          stack.pop();
          depth2--;
        }
      }
      while (stack.length) truncated += stack.pop();
      candidate = truncated;
    }
  }

  if (!candidate) return null;

  // Strip trailing commas before } or ]: ',]' or ',}'.
  candidate = candidate.replace(/,(\s*[}\]])/g, "$1");

  return candidate;
}
