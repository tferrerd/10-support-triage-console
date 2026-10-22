import { test } from "node:test";
import assert from "node:assert/strict";
import { TypeSafeClient, APIError, APITimeoutError } from "@typesafe-ai/sdk";
import {
  parseResponse,
  parseAnalysis,
  queueFor,
  validateTicket,
} from "../lib/triage";
import { demoResponse, SAMPLES } from "../lib/samples";
import { analyzeTicket } from "../lib/jev";
import { handleAnalyze } from "../lib/endpoint";
import { rateLimit } from "../lib/rate-limit";

test("parser accepts documented shapes and fractional scores; rejects malformed data", () => {
  for (let i = 0; i < SAMPLES.length; i++)
    assert.ok(parseResponse(demoResponse(i)));
  const valid = parseResponse(demoResponse(0));
  assert.equal(valid.frustration, 0.8);
  assert.deepEqual(parseAnalysis(valid), valid);
  for (const mutation of [
    (r: ReturnType<typeof demoResponse>) => {
      r.answers.category.choice =
        "invented" as typeof r.answers.category.choice;
    },
    (r: ReturnType<typeof demoResponse>) => {
      r.answers.category.confidence = NaN;
    },
    (r: ReturnType<typeof demoResponse>) => {
      r.answers.category.probabilities.payments = 0.1;
    },
    (r: ReturnType<typeof demoResponse>) => {
      r.answers.urgent.noul = 2;
    },
    (r: ReturnType<typeof demoResponse>) => {
      r.answers.frustration.score = 1.7;
    },
    (r: ReturnType<typeof demoResponse>) => {
      Object.assign(r.answers.frustration.legend, { "0": "Unexpected" });
    },
  ]) {
    const raw = demoResponse(0);
    mutation(raw);
    assert.throws(() => parseResponse(raw));
  }
  assert.throws(() => parseResponse({}));
  assert.throws(() => parseAnalysis({ category: "payments" }));
});

test("queue rules distinguish routine, priority and uncertain human review", () => {
  const base = parseResponse(demoResponse(0));
  assert.equal(queueFor(base).queue, "routine");
  assert.equal(
    queueFor({ ...base, urgentProbability: 0.75 }).queue,
    "priority",
  );
  assert.equal(queueFor({ ...base, frustration: 1.5 }).queue, "priority");
  for (const p of [0.35, 0.5, 0.65])
    assert.equal(
      queueFor({ ...base, urgentProbability: p }).queue,
      "human review",
    );
  assert.equal(
    queueFor({ ...base, categoryConfidence: 0.59, urgentProbability: 0.99 })
      .queue,
    "human review",
  );
  assert.equal(queueFor(parseResponse(demoResponse(5))).queue, "human review");
});

test("ticket validation rejects wrong types, short, oversized and null-byte input", () => {
  for (const value of [
    null,
    {},
    42,
    "  ",
    "short",
    "x".repeat(6001),
    "Valid ticket\0 text",
  ])
    assert.throws(() => validateTicket(value));
  assert.equal(
    validateTicket("  A valid support ticket.  "),
    "A valid support ticket.",
  );
});

test("official SDK serializes all three questions in exactly one request", async () => {
  let calls = 0;
  const client = new TypeSafeClient({
    apiKey: "synthetic-test-key",
    compression: false,
    retry: { maxRetries: 0 },
    logLevel: "off",
    fetch: async (url, options) => {
      calls++;
      assert.match(String(url), /\/v1\/systemone$/);
      const body = JSON.parse(String(options?.body));
      assert.equal(body.state.untrusted_ticket, SAMPLES[0].ticket);
      assert.equal(body.model, "jev-latest");
      assert.deepEqual(
        Object.values(body.questions).map((q) => (q as { type: string }).type),
        ["choice", "score", "noul"],
      );
      return Response.json({
        ...demoResponse(0),
        usage: { input_tokens: 1, output_tokens: 1 },
      });
    },
  });
  assert.equal(
    (await analyzeTicket(SAMPLES[0].ticket, client)).category,
    "payments",
  );
  assert.equal(calls, 1);
});

const env = {
  TRIAGE_ACCESS_CODE: "test-only-long-access-code-123456",
  TYPESAFE_API_KEY: "test-key",
  TRIAGE_FIREWALL_HOST: "triage.example.vercel.app",
};
const request = (
  ticket: unknown = SAMPLES[0].ticket,
  code = env.TRIAGE_ACCESS_CODE,
) =>
  new Request("https://triage.example/api/analyze", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-triage-access-code": code,
      origin: "https://triage.example",
    },
    body: JSON.stringify({ ticket }),
  });
test("endpoint fails closed for missing config, wrong code, invalid input, limits and firewall failure", async () => {
  let calls = 0;
  const deps = {
    env,
    limit: async () => true,
    analyze: async () => {
      calls++;
      return parseResponse(demoResponse(0));
    },
  };
  assert.equal(
    (await handleAnalyze(request(), { ...deps, env: {} })).status,
    503,
  );
  assert.equal(
    (await handleAnalyze(request(undefined, "wrong"), deps)).status,
    401,
  );
  assert.equal((await handleAnalyze(request("tiny"), deps)).status, 400);
  assert.equal(
    (await handleAnalyze(request("x".repeat(40000)), deps)).status,
    400,
  );
  const cross = request();
  cross.headers.set("origin", "https://attacker.example");
  assert.equal((await handleAnalyze(cross, deps)).status, 403);
  assert.equal(
    (await handleAnalyze(request(), { ...deps, limit: async () => false }))
      .status,
    429,
  );
  assert.equal(
    (
      await handleAnalyze(request(), {
        ...deps,
        limit: async () => {
          throw new Error("offline");
        },
      })
    ).status,
    503,
  );
  assert.equal(calls, 0);
  const response = await handleAnalyze(request(), deps);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(calls, 1);
  assert.ok(!(await response.text()).includes(env.TYPESAFE_API_KEY));
});
test("upstream errors never become demo results or expose provider details", async () => {
  for (const [error, status] of [
    [new APITimeoutError(1), 504],
    [new APIError(429, { ticket: "private" }, new Headers()), 429],
    [new Error("private ticket and key"), 502],
  ] as const) {
    const response = await handleAnalyze(request(), {
      env,
      limit: async () => true,
      analyze: async () => {
        throw error;
      },
    });
    assert.equal(response.status, status);
    const text = await response.text();
    assert.ok(!text.includes("private"));
    assert.equal("analysis" in JSON.parse(text), false);
  }
});
test("native firewall uses a trusted host and shared key, never forwards secrets, and fails closed", async () => {
  let calls = 0;
  assert.equal(
    await rateLimit(env, async (id, options) => {
      calls++;
      assert.equal(id, "triage-analysis");
      assert.deepEqual(options?.headers, { host: env.TRIAGE_FIREWALL_HOST });
      assert.equal(options?.rateLimitKey, "support-triage-shared-v1");
      assert.equal(
        options?.firewallHostForDevelopment,
        env.TRIAGE_FIREWALL_HOST,
      );
      assert.equal(options?.timeout, 3000);
      return { rateLimited: false };
    }),
    true,
  );
  assert.equal(calls, 1);
  assert.equal(await rateLimit({ VERCEL_URL: env.TRIAGE_FIREWALL_HOST }, async (_id, options) => {
    assert.deepEqual(options?.headers, { host: env.TRIAGE_FIREWALL_HOST });
    return { rateLimited: false };
  }), true);
  assert.equal(
    await rateLimit(env, async () => ({ rateLimited: true })),
    false,
  );
  await assert.rejects(
    rateLimit(env, async () => ({ rateLimited: false, error: "not-found" })),
  );
  await assert.rejects(
    rateLimit(env, async () => {
      throw new Error("unavailable");
    }),
  );
  await assert.rejects(rateLimit({}, async () => ({ rateLimited: false })));
});
