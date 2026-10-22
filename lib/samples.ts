import dataset from "../data/synthetic-evaluation.json";
import { Analysis, Category, CATEGORIES, RUBRIC } from "./triage";
export const SAMPLES = dataset;
// Authored fixtures, never live inference or a fallback. Values remain fixed per sample.
const fixtures: [number[], number[], number][] = [
  [[0.96, 0.01, 0.01, 0.01, 0.01], [0.2, 0.8, 0], 0.15],
  [[0.02, 0.94, 0.01, 0.01, 0.02], [0.3, 0.7, 0], 0.12],
  [[0.01, 0, 0.98, 0, 0.01], [0.2, 0.8, 0], 0.98],
  [[0.01, 0.01, 0.01, 0.95, 0.02], [0.95, 0.05, 0], 0.04],
  [[0.01, 0.01, 0.01, 0.01, 0.96], [1, 0, 0], 0.02],
  [[0.25, 0.23, 0.25, 0.02, 0.25], [0.5, 0.5, 0], 0.5],
  [[0.02, 0.01, 0.01, 0.95, 0.01], [0, 0.1, 0.9], 0.2],
  [[0.97, 0.01, 0.01, 0, 0.01], [0.4, 0.6, 0], 0.99],
];
export function demoResponse(index: number) {
  const [probabilities, levels, urgent] = fixtures[index];
  const category = dataset[index].category as Category;
  const peak = levels.indexOf(Math.max(...levels));
  return {
    model: "fixed-demo-v1",
    answers: {
      category: {
        type: "choice",
        choice: category,
        confidence: (probabilities[CATEGORIES.indexOf(category)] - 0.2) / 0.8,
        probabilities: Object.fromEntries(
          CATEGORIES.map((c, i) => [c, probabilities[i]]),
        ),
      },
      frustration: {
        type: "score",
        score: levels[1] + 2 * levels[2],
        confidence: Math.max(
          0,
          1 -
            levels.reduce((sum, p, i) => sum + p * Math.abs(i - peak), 0) /
              (2 / 3),
        ),
        probabilities: Object.fromEntries(levels.map((p, i) => [String(i), p])),
        legend: Object.fromEntries(
          RUBRIC.map((label, i) => [String(i), label]),
        ),
      },
      urgent: { type: "noul", noul: urgent },
    },
  };
}
export type HistoryEntry = {
  id: string;
  createdAt: string;
  mode: "demo" | "live";
  ticket: string;
  analysis: Analysis;
  policyVersion: string;
  correction?: { category: Category; urgent: boolean; savedAt: string };
};
