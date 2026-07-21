import { GoogleGenerativeAI } from "@google/generative-ai";
import { AIResponse } from "../ai/interfaces/AIResponse";
import dotenv from "dotenv";

dotenv.config();

const MODEL = "gemini-flash-latest";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

export interface AiNarrative {
  executiveSummary: string;
  healthNarrative: string;
  keyWins: string[];
  keyConcerns: string[];
  delayPatterns: { pattern: string; cause: string; severity: "low" | "medium" | "high" }[];
  predictions: { title: string; detail: string; severity: "info" | "warn" | "critical" }[];
  retroActions: string[];
}

export interface SprintAiContext {
  sprintName: string | null;
  goal: string | null;
  status: string | null;
  startDate: string | null;
  endDate: string | null;
  durationDays: number | null;
  daysElapsed: number | null;
  daysRemaining: number | null;
  teamSize: number;
  totalTickets: number;
  completionPct: number;
  pointCompletionPct: number;
  spilloverPct: number;
  addedAfterStartPct: number;
  bugCount: number;
  featureCount: number;
  blockedTickets: number;
  qaTickets: number;
  plannedPoints: number;
  completedPoints: number;
  healthScore: number;
  healthBand: string;

  topContributors: { name: string; points: number; tickets: number; bugsFixed: number }[];
  idleContributors: number;

  scope: {
    plannedTickets: number;
    addedTickets: number;
    removedTickets: number;
    scopeIncreasePct: number;
    capacityDisruptionPct: number;
    topAdders: { name: string; tickets: number }[];
  };

  velocity: {
    daysWithCompletions: number;
    daysTotal: number;
    finalRushPct: number;
    midSlackPct: number;
    pointsPerDayAvg: number;
  };

  timeline: {
    delayedCount: number;
    avgDelayDays: number;
    longestDelayDays: number | null;
    delayByAssigneeTop: { name: string; avgDelay: number; count: number }[];
    delayByTypeTop: { type: string; avgDelay: number; count: number }[];
    totalReopens: number;
    highComplexityCount: number;
  };

  bottlenecks: {
    qaQueueCount: number;
    blockedCount: number;
    stuckInProgressCount: number;
    oversizedCount: number;
    concentration: { name: string; sharePct: number }[];
  };

  hotspots: {
    topEpics: { title: string; tickets: number; assignees: number; reopens: number; urgent: number }[];
    topTags: { tag: string; tickets: number; urgent: number }[];
  };

  quality: {
    reworkPct: number;
    totalReopens: number;
    qaRejectedTicketCount: number;
    totalQaRejections: number;
    highComplexityCount: number;
  };
}

function extractJson<T>(text: string): T | null {
  const stripped = text.replace(/```(?:json)?/g, "").trim();
  const match = stripped.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]) as T;
  } catch {
    return null;
  }
}

function buildDeterministicPredictions(
  ctx: SprintAiContext
): AiNarrative["predictions"] {
  const out: AiNarrative["predictions"] = [];

  // Projected spillover based on current pace
  if (
    ctx.daysRemaining != null &&
    ctx.daysRemaining > 0 &&
    ctx.velocity.pointsPerDayAvg > 0
  ) {
    const projectedRemainingBurn = ctx.velocity.pointsPerDayAvg * ctx.daysRemaining;
    const pointsLeft = Math.max(0, ctx.plannedPoints - ctx.completedPoints);
    if (pointsLeft > projectedRemainingBurn && ctx.plannedPoints > 0) {
      const projectedSpilloverPts = pointsLeft - projectedRemainingBurn;
      const projectedSpilloverPct = Math.round((projectedSpilloverPts / ctx.plannedPoints) * 100);
      if (projectedSpilloverPct >= 5) {
        out.push({
          title: `Projected ${projectedSpilloverPct}% point spillover`,
          detail: `At current pace (${ctx.velocity.pointsPerDayAvg.toFixed(1)} pts/day), ${Math.round(
            projectedSpilloverPts
          )} of ${ctx.plannedPoints} planned points will spill over with ${ctx.daysRemaining}d remaining.`,
          severity: projectedSpilloverPct >= 25 ? "critical" : "warn",
        });
      }
    }
  }

  // Capacity overload from scope creep
  if (ctx.scope.capacityDisruptionPct >= 15) {
    out.push({
      title: `Capacity overloaded by ${ctx.scope.capacityDisruptionPct}%`,
      detail: `${ctx.scope.addedTickets} mid-sprint additions consumed an extra ${ctx.scope.capacityDisruptionPct}% of original committed capacity.`,
      severity: ctx.scope.capacityDisruptionPct >= 30 ? "critical" : "warn",
    });
  }

  // Single-person dependency
  if (ctx.bottlenecks.concentration.length > 0) {
    const top = ctx.bottlenecks.concentration[0];
    if (top.sharePct >= 40) {
      out.push({
        title: `${top.name} carries ${top.sharePct}% of in-flight work`,
        detail: "Risk of stall if this contributor is unavailable. Consider redistributing.",
        severity: top.sharePct >= 55 ? "critical" : "warn",
      });
    }
  }

  // Oversized in-flight risk
  if (ctx.bottlenecks.oversizedCount > 0 && (ctx.daysRemaining ?? 0) <= 3) {
    out.push({
      title: `${ctx.bottlenecks.oversizedCount} oversized ticket${
        ctx.bottlenecks.oversizedCount === 1 ? "" : "s"
      } unlikely to close`,
      detail: `Tickets ≥13 pts with ${ctx.daysRemaining ?? 0}d remaining typically slip to next sprint.`,
      severity: "warn",
    });
  }

  return out;
}

export class SprintReportAiService {
  static isAvailable(): boolean {
    return !!process.env.GEMINI_API_KEY;
  }

  static buildPredictions(ctx: SprintAiContext): AiNarrative["predictions"] {
    return buildDeterministicPredictions(ctx);
  }

  static async generateNarrative(ctx: SprintAiContext): Promise<AIResponse<AiNarrative>> {
    if (!SprintReportAiService.isAvailable()) {
      throw new Error(
        "AI narrative unavailable: GEMINI_API_KEY is not configured on the server."
      );
    }

    const deterministicPredictions = buildDeterministicPredictions(ctx);

    const model = genAI.getGenerativeModel({ model: MODEL });
    const prompt = `
You are an engineering delivery analyst. Produce a sharp, concise sprint retrospective narrative.

RULES:
- Use only data provided. Never invent ticket IDs, names, or numbers not present.
- Be specific. Reference real numbers from the context.
- No fluff, no marketing tone. Each sentence must add information.
- Output MUST be a single JSON object matching the schema. No prose outside JSON.

SCHEMA:
{
  "executiveSummary": "1-2 sentences. Top-level verdict on the sprint.",
  "healthNarrative": "2-3 sentences. Explain WHY the health score is what it is, citing drivers.",
  "keyWins": ["3-5 short bullets — positives worth keeping"],
  "keyConcerns": ["3-5 short bullets — risks worth addressing"],
  "delayPatterns": [
    { "pattern": "what the delays look like", "cause": "likely root cause given the data", "severity": "low|medium|high" }
  ],
  "predictions": [
    { "title": "short prediction headline", "detail": "1 sentence with numbers", "severity": "info|warn|critical" }
  ],
  "retroActions": ["3-5 concrete actions the team should take in the next sprint"]
}

NOTES ON delayPatterns:
- Choose from causes like: waiting-for-QA, dependency-blocked, scope-increased, frequent-rework, missing-requirements, oversized-tickets, single-person-dependency, environment-issue.
- Only include patterns the data actually supports.

CONTEXT:
${JSON.stringify(ctx, null, 2)}

ADDITIONAL DETERMINISTIC PREDICTIONS (include these in "predictions" plus any AI-derived ones you add):
${JSON.stringify(deterministicPredictions, null, 2)}
`.trim();

    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const parsed = extractJson<AiNarrative>(text);
    if (!parsed) {
      throw new Error("AI returned an unparseable response.");
    }

    // Backstop: ensure required arrays exist
    parsed.keyWins = Array.isArray(parsed.keyWins) ? parsed.keyWins : [];
    parsed.keyConcerns = Array.isArray(parsed.keyConcerns) ? parsed.keyConcerns : [];
    parsed.delayPatterns = Array.isArray(parsed.delayPatterns) ? parsed.delayPatterns : [];
    parsed.predictions = Array.isArray(parsed.predictions) ? parsed.predictions : [];
    parsed.retroActions = Array.isArray(parsed.retroActions) ? parsed.retroActions : [];

    // Ensure deterministic predictions are present even if AI omitted them
    for (const dp of deterministicPredictions) {
      if (!parsed.predictions.some((p) => p.title === dp.title)) {
        parsed.predictions.push(dp);
      }
    }

    const usageMetadata = result.response.usageMetadata || { promptTokenCount: 0, candidatesTokenCount: 0 };
    return {
        data: parsed,
        provider: "gemini",
        model: MODEL,
        usage: {
            promptTokens: usageMetadata.promptTokenCount || 0,
            completionTokens: usageMetadata.candidatesTokenCount || 0
        },
        metadata: {}
    };
  }
}
