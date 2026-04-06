import type { AgentRole } from "../agents/types.js";

export type TaskComplexity = "low" | "medium" | "high";

interface ComplexityContext {
  role?: AgentRole;
  authorityLevel?: number;
}

const LOW_KEYWORDS = [
  "ok", "done", "yes", "no", "acknowledged", "ack", "status",
  "list", "thanks", "thank you", "noted", "got it", "sure",
  "agreed", "roger", "confirmed", "understood", "affirmative",
];

const HIGH_KEYWORDS = [
  "architect", "architecture", "design", "review all", "refactor",
  "security", "migrate", "migration", "plan", "strategy",
  "restructure", "overhaul", "rearchitect", "performance audit",
  "scalability", "breaking change", "multi-step", "complex",
  "system design", "trade-off", "tradeoff", "evaluate",
  "critical", "incident", "postmortem", "roadmap",
];

const REVIEW_ROLES: ReadonlySet<AgentRole> = new Set([
  "code-reviewer", "design-reviewer", "qa",
]);

const LEADERSHIP_ROLES: ReadonlySet<AgentRole> = new Set([
  "ceo", "cto", "cpo", "coo",
]);

/** Analyze a task/message and return a complexity level for model selection. */
export function analyzeTaskComplexity(
  message: string,
  context?: ComplexityContext,
): TaskComplexity {
  const baseComplexity = analyzeMessageContent(message);
  return applyContextBump(baseComplexity, context);
}

function analyzeMessageContent(message: string): TaskComplexity {
  const trimmed = message.trim();
  const length = trimmed.length;
  const lower = trimmed.toLowerCase();

  if (isShortAcknowledgement(lower, length)) {
    return "low";
  }

  if (containsHighKeywords(lower)) {
    return "high";
  }

  if (length > 500) {
    return "high";
  }

  if (containsLowKeywords(lower) && length < 200) {
    return "low";
  }

  return "medium";
}

function isShortAcknowledgement(lower: string, length: number): boolean {
  if (length > 100) return false;
  return LOW_KEYWORDS.some((kw) => lower === kw || lower === `${kw}.` || lower === `${kw}!`);
}

function containsHighKeywords(lower: string): boolean {
  return HIGH_KEYWORDS.some((kw) => lower.includes(kw));
}

function containsLowKeywords(lower: string): boolean {
  return LOW_KEYWORDS.some((kw) => {
    const idx = lower.indexOf(kw);
    if (idx === -1) return false;
    const before = idx === 0 || /\s/.test(lower[idx - 1]!);
    const after = idx + kw.length >= lower.length || /[\s.,!?]/.test(lower[idx + kw.length]!);
    return before && after;
  });
}

function applyContextBump(
  base: TaskComplexity,
  context?: ComplexityContext,
): TaskComplexity {
  if (!context) return base;

  const { role, authorityLevel } = context;

  // Leadership making decisions should bump up
  if (role && LEADERSHIP_ROLES.has(role) && authorityLevel !== undefined && authorityLevel >= 4) {
    return bumpUp(base);
  }

  // Reviewers should be at least medium
  if (role && REVIEW_ROLES.has(role)) {
    return base === "low" ? "medium" : base;
  }

  return base;
}

function bumpUp(complexity: TaskComplexity): TaskComplexity {
  if (complexity === "low") return "medium";
  if (complexity === "medium") return "high";
  return "high";
}

/** Map a complexity level to the appropriate agent model shorthand. */
export function complexityToModel(
  complexity: TaskComplexity,
  defaultModel: string,
): string {
  switch (complexity) {
    case "low":
      return "haiku";
    case "high":
      return "opus";
    default:
      return defaultModel;
  }
}
