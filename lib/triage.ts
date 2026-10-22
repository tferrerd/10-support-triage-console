export const CATEGORIES = [
  "payments",
  "shipping",
  "technical",
  "returns",
  "other",
] as const;
export type Category = (typeof CATEGORIES)[number];
export const TEAMS: Record<Category, string> = {
  payments: "Payments & billing",
  shipping: "Delivery support",
  technical: "Technical support",
  returns: "Returns & exchanges",
  other: "General support",
};
export const RUBRIC = [
  "Calm, just stating facts",
  "Frustrated but civil",
  "Very angry, strong language or threatening to leave",
] as const;
export const MAX_TICKET_LENGTH = 6000;
// Initial policy, not validated operating thresholds. Evaluate before operational use.
export const POLICY = {
  version: "1",
  categoryConfidence: 0.6,
  categoryMargin: 0.2,
  urgencyReviewLow: 0.35,
  urgencyReviewHigh: 0.65,
  urgent: 0.75,
  frustration: 1.5,
};
export type Analysis = {
  model: string;
  category: Category;
  categoryConfidence: number;
  categoryProbabilities: Record<Category, number>;
  frustration: number;
  frustrationConfidence: number;
  frustrationProbabilities: Record<string, number>;
  urgentProbability: number;
};
export type Queue = "routine" | "priority" | "human review";
export function queueFor(a: Analysis): { queue: Queue; reason: string } {
  const sorted = Object.values(a.categoryProbabilities).sort((a, b) => b - a);
  if (
    a.categoryConfidence < POLICY.categoryConfidence ||
    sorted[0] - sorted[1] < POLICY.categoryMargin
  )
    return {
      queue: "human review",
      reason: "The category is uncertain or overlaps with another team.",
    };
  if (
    a.urgentProbability >= POLICY.urgencyReviewLow &&
    a.urgentProbability <= POLICY.urgencyReviewHigh
  )
    return {
      queue: "human review",
      reason: "Urgency is uncertain. A person should decide.",
    };
  if (
    a.urgentProbability >= POLICY.urgent ||
    a.frustration >= POLICY.frustration
  )
    return {
      queue: "priority",
      reason: "Urgency or frustration exceeds the initial priority threshold.",
    };
  return {
    queue: "routine",
    reason: "No review or priority threshold was reached.",
  };
}
export function validateTicket(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.trim().length < 10 ||
    value.length > MAX_TICKET_LENGTH ||
    value.includes("\0")
  )
    throw new Error(
      "Enter a ticket of 10–6,000 characters, without null characters.",
    );
  return value.trim();
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid upstream response.");
  return value as Record<string, unknown>;
}
function number(value: unknown, max = 1): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > max
  )
    throw new Error("Invalid upstream response.");
  return value;
}
function distribution(
  value: unknown,
  keys: readonly string[],
): Record<string, number> {
  const source = object(value);
  if (Object.keys(source).length !== keys.length)
    throw new Error("Invalid upstream distribution.");
  const result = Object.fromEntries(
    keys.map((key) => [key, number(source[key])]),
  );
  if (Math.abs(Object.values(result).reduce((a, b) => a + b, 0) - 1) > 0.025)
    throw new Error("Invalid upstream distribution.");
  return result;
}
export function parseResponse(raw: unknown): Analysis {
  const root = object(raw),
    answers = object(root.answers);
  const category = object(answers.category),
    frustration = object(answers.frustration),
    urgent = object(answers.urgent);
  if (
    typeof root.model !== "string" ||
    !root.model.trim() ||
    root.model.length > 100 ||
    category.type !== "choice" ||
    frustration.type !== "score" ||
    urgent.type !== "noul" ||
    !CATEGORIES.includes(category.choice as Category)
  )
    throw new Error("Invalid upstream response.");
  const probabilities = distribution(
    category.probabilities,
    CATEGORIES,
  ) as Record<Category, number>;
  if (
    probabilities[category.choice as Category] + 0.001 <
    Math.max(...Object.values(probabilities))
  )
    throw new Error("Invalid upstream choice.");
  const scoreProbabilities = distribution(frustration.probabilities, [
    "0",
    "1",
    "2",
  ]);
  const legend = object(frustration.legend);
  if (RUBRIC.some((text, i) => legend[String(i)] !== text))
    throw new Error("Unexpected upstream rubric.");
  const score = number(frustration.score, 2);
  if (
    Math.abs(score - (scoreProbabilities["1"] + 2 * scoreProbabilities["2"])) >
    0.04
  )
    throw new Error("Invalid upstream score.");
  return {
    model: root.model,
    category: category.choice as Category,
    categoryConfidence: number(category.confidence),
    categoryProbabilities: probabilities,
    frustration: score,
    frustrationConfidence: number(frustration.confidence),
    frustrationProbabilities: scoreProbabilities,
    urgentProbability: number(urgent.noul),
  };
}

// Revalidate compact results at browser/storage boundaries using the same parser.
export function parseAnalysis(value: unknown): Analysis {
  const a = object(value);
  return parseResponse({
    model: a.model,
    answers: {
      category: {
        type: "choice",
        choice: a.category,
        confidence: a.categoryConfidence,
        probabilities: a.categoryProbabilities,
      },
      frustration: {
        type: "score",
        score: a.frustration,
        confidence: a.frustrationConfidence,
        probabilities: a.frustrationProbabilities,
        legend: Object.fromEntries(RUBRIC.map((r, i) => [String(i), r])),
      },
      urgent: { type: "noul", noul: a.urgentProbability },
    },
  });
}
