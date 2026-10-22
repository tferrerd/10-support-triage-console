# Support Triage Console

A responsive Next.js + TypeScript app for recommending how to route support tickets with [Jev from TypeSafe AI](https://docs.typesafe.ai/). No accounts, ticket database, messages, refunds, or other external support actions.

## Run locally

Use Node.js **24 LTS** (the SDK requires Node 22+) and npm:

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Open http://localhost:3000. Demo mode works with **no credentials**, including after a public deployment. Select one of eight synthetic examples, click **Analyze ticket**, inspect the result, then accept or correct the category and urgency with **Save review**. The ambiguous sample demonstrates human review.

Demo numbers are authored, fixed fixtures, clearly marked `FIXED DEMO`. Custom text requires Live mode. A failed live request always displays an error; it never switches to a demo result. The demo does not call Jev.

## Live configuration

Set server-only values in `.env.local` or Vercel environment settings. Never use a `NEXT_PUBLIC_` prefix.

| Variable                          | Value                                                                                    |
| --------------------------------- | ---------------------------------------------------------------------------------------- |
| `TYPESAFE_API_KEY`                | Your [TypeSafe API key](https://console.typesafe.ai/keys)                                |
| `TYPESAFE_MODEL`                  | Optional; defaults to the documented stable alias `jev-latest`                           |
| `TRIAGE_ACCESS_CODE`              | A random code, 24–256 characters, privately shared with authorized users                 |
| `TRIAGE_FIREWALL_HOST` | Optional on Vercel; defaults to server-provided `VERCEL_URL`. For local live mode, use a trusted protected-preview hostname without protocol or slash. |
| `TRIAGE_RATE_LIMIT_ID`            | Optional; defaults to `triage-analysis`, matching a published Vercel Firewall rule       |
| `VERCEL_AUTOMATION_BYPASS_SECRET` | Only if needed for a protected preview; Vercel's Protection Bypass for Automation secret |

TypeSafe may require available organization credits before allowing API key creation. If the console reports that the organization has no credits, use its Billing page to add funds or redeem a valid credit code before creating the key. No credits have been purchased by this project setup.

Generate an access code with `node -e "console.log(require('node:crypto').randomBytes(24).toString('base64url'))"`. The app validates it on the server using constant-time hash comparison. It stays only in browser memory, and is excluded from history/exports. Rotate it by changing the environment variable and redeploying.

Live mode needs the native firewall rule below, **even in local development**: local checks call the configured hosted firewall. Missing configuration, a missing rule, a firewall timeout or a blocked check disables live analysis. There is no development bypass or process-memory rate limiter. For a completely credential-free local check, use Demo and the mocked tests.

## Deploy to Vercel

A login-protected [Vercel preview](https://10-support-triage-console-3l0u2t4do-tferrerd-gmailcoms-projects.vercel.app) is now configured in `tferrerd-gmailcoms-projects/10-support-triage-console`, with the user's subsequent approval. Preview server-only secrets are configured, and an enforcing `triage-analysis` rule is published. No production domains point to the app. Vercel automatically made the initial credential-free seed deployment production despite an explicit preview flag; its production aliases were removed. The working deployment is a genuine Preview and retains Vercel login protection.

Verified October 21, 2026: the preview rendered; an incorrect app access code returned 401; one synthetic live analysis returned 200 with category `payments` from `jev-1.13.0`; invalid-code attempts then reached 429; an unauthenticated page request redirected to Vercel login. Seven automated tests, lint and the production build pass. The full eight-ticket paid evaluation completed with eight requests and no retries; results and limitations are recorded below. Local `.env.local` contains the Jev key, app access code, preview firewall hostname and approved automation token, is gitignored, and has mode 0600. In Live mode, enter the `TRIAGE_ACCESS_CODE` value from that file. Do not share or export the file.

The following steps document a fresh setup or future production deployment:

1. Import this repository into Vercel. If importing the surrounding portfolio workspace, set Root Directory to `10-support-triage-console`. Select Next.js and Node.js 24.x. Use `npm ci`, `npm run build`, and the default Next.js output settings. The repository includes `vercel.json`; the paid route has a 30-second maximum duration.
2. An initial deployment with no secrets runs the public demo; live requests return 503. Note the project's `.vercel.app` hostname.
3. In the project's **Firewall → Configure → New Rule**, create an **`@vercel/firewall`** condition with Rate limit ID **`triage-analysis`**. Set **Fixed Window**, **60 seconds**, **10 requests**, and an enforcing **429 / Rate Limit** action. Save, review, and publish the rule. Do not use Log mode. See the [official Rate Limiting SDK setup](https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting-sdk) and [WAF rate limiting controls](https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting). Plan availability/charges are controlled by Vercel.
4. Set the live variables above. On Vercel, the app automatically uses the server-provided `VERCEL_URL`; an explicit `TRIAGE_FIREWALL_HOST` overrides it and must reference a trusted deployed hostname in this project with that published rule. Enable automatic system environment variables. For protected previews, configure Protection Bypass for Automation as described in the SDK docs. Apply secrets to the intended environments only and redeploy.
5. Check the deployed demo. Verify a wrong code returns 401, a valid request works, and repeated attempts eventually return 429. Temporarily test an unknown rule ID in a preview: live mode must return 503. Never remove protection to troubleshoot live inference.

The app uses the official `@vercel/firewall` SDK **before checking the access code**, with a fixed shared counting key and server-configured host. All attempts share the allowance across app instances in each serving region; invalid requests consume it too. No ticket text, access code or API key is passed to the firewall check. Only a trusted Host header is forwarded. The SDK's `not-found` result explicitly fails closed. The check times out after three seconds.

Vercel's counters are regional: this is rate limiting, **not a globally exact daily spending cap**. Fixed windows can permit bursts at a boundary. The shared limit is deliberately conservative and can temporarily affect all users. Set the same deployment environment's rule values intentionally; separate staging and production hosts/rule IDs to isolate budgets. Use provider budget controls where available. This implementation targets Vercel; another host needs an equivalent distributed limiter before live use. No Redis or application database is required.

## Jev request and response

`lib/jev.ts` uses official `@typesafe-ai/sdk` 0.7.0. One server-side `systemOne` call includes:

- **Choice**: primary category, its returned confidence, and all five option probabilities.
- **Score**: customer frustration on a descriptive 0–2 rubric, returned confidence and level probabilities. 0 = calm; 1 = frustrated but civil; 2 = very angry, strong language or threatening to leave. The score is a probability-weighted mean and may be fractional.
- **Noul**: probability urgent attention is needed due to ongoing harm, outage, an imminent deadline or safety risk. It has **no separate confidence field**. A demanding tone alone is insufficient.

Confidence summarizes the probability distribution; **it is not guaranteed accuracy**. This app displays the API's Choice and Score confidence rather than inventing a Noul confidence. Responses preserve the returned model ID because aliases can move.

Ticket text is a separate `untrusted_ticket` state field. Each question instructs Jev to evaluate the issue and ignore embedded instructions. This reduces instruction confusion, without promising immunity. Schema/range checks validate category, type discriminants, finite values, distributions, expected score consistency and rubric. Input is limited to 10–6,000 characters; the JSON body is capped at 30 KB while reading, not just by Content-Length.

The SDK uses a 12-second attempt timeout and a 15-second abort budget, and **zero automatic retries**, preserving one upstream request per click. Visitors explicitly retry after a timeout, 429, or upstream failure. Failed requests may already incur charges. Provider error bodies are neither returned nor logged. Logging is explicitly disabled in the SDK, including when its logging environment variable is set.

Documentation verified October 21, 2026: [index](https://docs.typesafe.ai/llms.txt), [quick start](https://docs.typesafe.ai/introduction/quickstart), [JavaScript SDK](https://docs.typesafe.ai/sdk/javascript), [confidence](https://docs.typesafe.ai/confidence), [errors](https://docs.typesafe.ai/api/errors), [retry policy](https://docs.typesafe.ai/sdk/javascript/api/interfaces/RetryPolicy), [models and stable alias](https://docs.typesafe.ai/models). Transport serialization is also tested using the installed SDK.

## Queue policy

`POLICY` and `queueFor` in `lib/triage.ts` hold ordinary, adjustable code. Rules run in this order:

1. **Human review** if category confidence is below 0.60, the top two category probabilities differ by less than 0.20, or urgency probability is between 0.35 and 0.65 inclusive.
2. **Priority** if urgency probability is at least 0.75 or frustration is at least 1.50.
3. **Routine** otherwise.

These are **initial, unevaluated operating thresholds**. Review uncertainty before priority so even an urgent case with an unclear category reaches a person. Tune on representative labeled tickets and error costs before operational use. Frustration confidence is displayed but does not gate the queue; category ambiguity and urgency ambiguity trigger review. Queue suggestions never execute actions.

Review controls initialize the urgency decision at 0.75. Save unchanged values to accept, or change them to correct. Original model results, reviewed category/urgency, timestamps, mode, model ID and policy version are exported together. Reviews do not overwrite predictions, silently reroute tickets, or train a model.

## Privacy and history

History stores the latest 30 ticket bodies, results and reviews in browser `localStorage` **on this device and browser only**. It is not shared between devices, synchronized, encrypted by this app or backed up. Export JSON includes ticket text; handle it accordingly. Clear history removes the local key and the visible results. Exported files must be deleted separately. If browser storage is disabled/full, the page reports the problem and still supports in-session analysis/export.

The server processes text transiently and sends it to TypeSafe in Live mode, but does not persist or log ticket bodies, keys, request payloads or provider errors. The firewall stores only usage counters under an app-wide key. Hosting and TypeSafe have their own processing policies; consult [TypeSafe's legal documentation](https://docs.typesafe.ai/legal). Do not enable request-body logging or tracing when deploying. Use synthetic or redacted tickets. No analytics or error-reporting service is installed.

## Verification and evaluation

```sh
npm test
npm run lint
npm run build
npm run evaluate -- --fixtures
```

Tests cover response parsing, invalid input, queue rules, official SDK serialization, endpoint authentication and fail-closed rate limiting, timeout/upstream handling, and native firewall checks. Tests mock network responses; they make no paid calls. Fixture evaluation checks all eight fixed examples through the parser and queue policy. Its metrics **are not evidence of model quality**.

`data/synthetic-evaluation.json` is a small, manually authored labeled dataset with expected primary category and urgency, including an ambiguous ticket labeled `other`. It is a smoke set, not a representative benchmark. The earlier BANKING77 data is preserved under `data/raw`; it is not used to validate the five-category Jev taxonomy.

Live evaluation is deliberately explicit and incurs **eight paid requests**:

```sh
node --env-file=.env.local --import tsx scripts/evaluate.ts --live
# Or, after exporting the environment variables:
npm run evaluate -- --live
```

Running the command with no mode exits without calling Jev. It reports category accuracy, share routed for review, urgency accuracy, completion/failure counts and returned model versions. Metric denominators are completed analyses; failures cause a nonzero exit. Live evaluation runs directly from your terminal and bypasses the public endpoint/access code/firewall, so never expose it as a web route or run it automatically in CI. Expand and separate development/test labels before threshold tuning; compare versions on held-out data. A single direct live SDK smoke request was verified on October 21, 2026: the synthetic duplicate-charge ticket returned `payments`, queue `routine`, from `jev-1.13.0`. This confirms connectivity and response parsing, not model accuracy. The full paid evaluation and hosted firewall enforcement were subsequently verified as recorded here.

## Existing portfolio work

The prior repository brief is preserved as [PROJECT_BRIEF.md](PROJECT_BRIEF.md), with its original dataset references and outstanding research deliverables. This implementation fulfills the requested hosted Jev triage app. It does not claim to complete the separate trained BANKING77 classifier, MLflow lifecycle, or production performance work described in that brief.

## Recorded live evaluation — October 21, 2026

[Saved results](evaluations/2026-10-21-live.json): eight paid requests to `jev-1.13.0`, eight completed, no retries or failures. Primary category accuracy was 8/8; urgency decisions at the 0.75 threshold also matched 8/8 labels. Review share was 0/8.

**Routing failure:** the ambiguous ticket was classified as `other` and sent to `routine`, although the authored scenario calls for human review. The fixed demo sends that same sample to review; demo fixtures do not predict live behavior. This result shows why category accuracy alone is insufficient. Queue thresholds remain initial values and need evaluation on a larger, representative held-out set before operational use. They were not tuned against this smoke set after seeing the results.

The evaluation made exactly eight short calls. Exact billed cost was not recorded because the script does not retain token usage; no dollar amount is claimed as a measured result.
