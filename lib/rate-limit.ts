import { checkRateLimit } from "@vercel/firewall";
export type Environment = Record<string, string | undefined>;
// Configure the matching Vercel Firewall rule: fixed window, 10 requests / 60 seconds,
// enforce 429. One shared key limits all attempts in each serving region, across instances.
export async function rateLimit(
  env: Environment = process.env,
  checker = checkRateLimit,
): Promise<boolean> {
  const host = env.TRIAGE_FIREWALL_HOST || env.VERCEL_URL;
  if (!host || !/^[a-z0-9][a-z0-9.-]*\.vercel\.app$/.test(host))
    throw new Error("Rate limiter unavailable.");
  const result = await checker(env.TRIAGE_RATE_LIMIT_ID || "triage-analysis", {
    // Server-configured host prevents client-controlled Host headers directing the check.
    // Only this header is forwarded; no access codes, ticket content or credentials.
    headers: { host },
    firewallHostForDevelopment: host,
    rateLimitKey: "support-triage-shared-v1",
    timeout: 3000,
  });
  // The SDK returns rateLimited:false for a missing rule. Explicitly fail closed.
  if (result.error || typeof result.rateLimited !== "boolean")
    throw new Error("Rate limiter unavailable.");
  return !result.rateLimited;
}
