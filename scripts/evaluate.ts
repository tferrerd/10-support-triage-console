import { analyzeTicket } from "../lib/jev";
import { demoResponse, SAMPLES } from "../lib/samples";
import { parseResponse, queueFor } from "../lib/triage";
const args = process.argv.slice(2);
if (args.length !== 1 || !["--fixtures", "--live"].includes(args[0])) {
  console.error(
    "Choose --fixtures (free pipeline check) or --live (8 paid API calls). No calls made.",
  );
  process.exit(1);
}
const live = args[0] === "--live";
if (live && !process.env.TYPESAFE_API_KEY) {
  console.error("TYPESAFE_API_KEY is required. No calls made.");
  process.exit(1);
}
let correct = 0,
  review = 0,
  urgencyCorrect = 0,
  failed = 0;
const models = new Set<string>();
for (let i = 0; i < SAMPLES.length; i++) {
  const sample = SAMPLES[i];
  try {
    const a = live
      ? await analyzeTicket(sample.ticket)
      : parseResponse(demoResponse(i));
    const queue = queueFor(a).queue;
    correct += Number(a.category === sample.category);
    review += Number(queue === "human review");
    urgencyCorrect += Number(a.urgentProbability >= 0.75 === sample.urgent);
    models.add(a.model);
    console.log(
      JSON.stringify({
        id: sample.id,
        expectedCategory: sample.category,
        category: a.category,
        queue,
      }),
    );
  } catch {
    failed++;
    console.error(
      `Analysis failed for ${sample.id}. Provider details suppressed.`,
    );
  }
}
const completed = SAMPLES.length - failed;
console.log(
  JSON.stringify(
    {
      mode: live
        ? "LIVE"
        : "FIXTURE PIPELINE CHECK — not model quality evidence",
      models: [...models],
      total: SAMPLES.length,
      completed,
      failed,
      categoryAccuracy: completed ? correct / completed : null,
      reviewShare: completed ? review / completed : null,
      urgencyAccuracy: completed ? urgencyCorrect / completed : null,
    },
    null,
    2,
  ),
);
if (failed) process.exitCode = 1;
