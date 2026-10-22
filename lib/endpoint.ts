import { createHash, timingSafeEqual } from "node:crypto";
import { APIError, APITimeoutError, APIUserAbortError } from "@typesafe-ai/sdk";
import { analyzeTicket } from "./jev";
import { rateLimit, type Environment } from "./rate-limit";
import { validateTicket } from "./triage";
const MAX_BODY_BYTES = 30000;
async function readBody(request: Request) {
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    throw new Error("Expected JSON.");
  if (Number(request.headers.get("content-length")) > MAX_BODY_BYTES)
    throw new Error("Request too large.");
  const reader = request.body?.getReader();
  if (!reader) throw new Error("Missing body.");
  const parts: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > MAX_BODY_BYTES) {
      await reader.cancel();
      throw new Error("Request too large.");
    }
    parts.push(value);
  }
  return JSON.parse(Buffer.concat(parts).toString("utf8"));
}
const json = (body: unknown, status = 200, retry?: number) =>
  Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      ...(retry ? { "Retry-After": String(retry) } : {}),
    },
  });
export async function handleAnalyze(
  request: Request,
  deps: {
    env: Environment;
    limit: typeof rateLimit;
    analyze: typeof analyzeTicket;
  } = { env: process.env, limit: rateLimit, analyze: analyzeTicket },
): Promise<Response> {
  const code = deps.env.TRIAGE_ACCESS_CODE;
  if (
    !code ||
    code.length < 24 ||
    code.length > 256 ||
    !deps.env.TYPESAFE_API_KEY ||
    !(deps.env.TRIAGE_FIREWALL_HOST || deps.env.VERCEL_URL)
  )
    return json(
      {
        error:
          "Live analysis is not configured. Select Demo to explore fixed samples.",
      },
      503,
    );
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin)
    return json({ error: "Cross-origin requests are not allowed." }, 403);
  try {
    if (!(await deps.limit(deps.env)))
      return json(
        {
          error:
            "The shared analysis rate limit was reached. Try again in a minute.",
        },
        429,
        60,
      );
  } catch {
    return json(
      {
        error:
          "Usage protection is unavailable. Live analysis is temporarily disabled.",
      },
      503,
    );
  }
  const supplied = request.headers.get("x-triage-access-code") || "";
  const hash = (s: string) => createHash("sha256").update(s).digest();
  if (supplied.length > 256 || !timingSafeEqual(hash(supplied), hash(code)))
    return json({ error: "The live access code is incorrect." }, 401);
  let ticket: string;
  try {
    ticket = validateTicket((await readBody(request))?.ticket);
  } catch {
    return json(
      {
        error:
          "Send a JSON ticket of 10–6,000 characters (maximum request size: 30 KB).",
      },
      400,
    );
  }
  try {
    return json({ analysis: await deps.analyze(ticket) });
  } catch (error) {
    // Never return or log provider errors: they can contain request bodies.
    if (
      error instanceof APITimeoutError ||
      error instanceof APIUserAbortError ||
      (error instanceof Error &&
        ["TimeoutError", "AbortError"].includes(error.name))
    )
      return json(
        { error: "Jev took too long. Please retry explicitly." },
        504,
      );
    if (error instanceof APIError && error.status === 429)
      return json(
        {
          error:
            "Jev is rate limiting requests. Wait a minute before retrying.",
        },
        429,
        60,
      );
    return json(
      {
        error:
          "Jev could not return a valid analysis. Please retry later. No demo result was substituted.",
      },
      502,
    );
  }
}
