# 46 - Gemini image generation daily quota hardening

## Status
🟡 Open

## Summary

On March 10, 2026 at 10:51:54 PM, the sibling-order image generation flow hit a hard daily Gemini quota limit in n8n:

- node: `Generate Character in Pose`
- error type: `429 RESOURCE_EXHAUSTED`
- metric: `generativelanguage.googleapis.com/generate_requests_per_model_per_day`
- limit returned by Google: `250`
- model returned by Google: `gemini-3-pro-image`
- retry delay returned by Google: about `18h 8m`

This is not a transient per-minute spike. It is a project-level daily quota exhaustion event.

## Current AI Studio status

AI Studio dashboard evidence reviewed on March 11, 2026 for project `Little Hero Books`:

- the project is currently on `Tier 1`
- the constrained model is `Nano Banana Pro (Gemini 3 Pro Image)`
- peak daily usage for that model reached `251 / 250` RPD over the last 28 days
- peak minute usage for that model was only `10 / 20` RPM
- peak input-token usage for that model was only `19.92K / 100K` TPM
- the dashboard’s `Compare: Tier 2` view shows `+14.75K` additional daily headroom for this model, which implies a Tier 2 daily limit of about `15,000` RPD for the current model/project combination

This means the active bottleneck is the daily per-model request cap, not requests-per-minute and not tokens-per-minute.

Other model usage in the same 28-day window appears low relative to their limits:

- `Gemini 2.5 Flash`: `21 / 10K` RPD
- `Gemini 3 Flash`: `1 / 10K` RPD
- `Gemini 2 Flash`: `2 / Unlimited` RPD
- `Gemini 2.5 Flash Lite`: `18 / Unlimited` RPD

So the current practical limit problem is concentrated in image generation on `Nano Banana Pro (Gemini 3 Pro Image)`.

## Repo context

Current repo references show the system is still calling the Gemini Developer API preview image endpoint in multiple places:

- sibling pose generation workflow: [SIBLING - w2A-SW1-Pose_Generation.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/sibling-orders/sibling-order-n8n-workflows/SIBLING%20-%20w2A-SW1-Pose_Generation.json)
- sibling background-removal workflow: [SIBLING - w2B-sw1-single-pose.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/sibling-orders/sibling-order-n8n-workflows/SIBLING%20-%20w2B-sw1-single-pose.json)
- backend pose regeneration route: [route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/orders/[orderId]/regenerate-pose/route.ts)
- backend preview generation route: [route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/preview/generate/route.ts)

Issue 38 makes this more visible because sibling orders multiply image-generation calls quickly across base generation, pose generation, QA, retries, and re-runs.

## What Google currently documents

Official sources reviewed on March 11, 2026:

- Google says Gemini API rate limits are applied **per project, not per API key**, and daily quotas reset at **midnight Pacific time**: [Gemini API rate limits](https://ai.google.dev/gemini-api/docs/rate-limits)
- Google says preview models can have **more restrictive rate limits**: [Gemini Developer API pricing](https://ai.google.dev/gemini-api/docs/pricing)
- Google says a project only counts as paid when the specific project/key shows a paid quota tier, and some accounts require a one-time prepayment before paid limits activate: [Gemini API billing](https://ai.google.dev/gemini-api/docs/billing/)
- Google Cloud terms prohibit using the service in a way intended to avoid fees or to circumvent usage limits, including creating multiple applications, accounts, or projects to simulate a single one: [Google Cloud Platform Terms, section 3.3](https://cloud.google.com/terms/)
- Google provides both a paid-tier rate-limit increase path and a separate higher-capacity Vertex AI path for enterprise throughput needs: [Gemini API rate limits](https://ai.google.dev/gemini-api/docs/rate-limits), [Provisioned Throughput on Vertex AI](https://cloud.google.com/vertex-ai/generative-ai/docs/provisioned-throughput/overview)

Important current official details:

- Gemini Developer API usage tiers are based on the billing account linked to the project:
  - `Tier 1`: full paid billing account linked to the project
  - `Tier 2`: total spend `> $250` and at least `30` days since successful payment
  - `Tier 3`: total spend `> $1,000` and at least `30` days since successful payment
- Google says tier upgrades are automatic once the project meets the criteria, and subsequent tier upgrades usually take effect within about `10` minutes
- Google says paid-tier rate-limit increase requests can also be submitted through their quota form

Official upgrade and billing references:

- [Gemini API rate limits](https://ai.google.dev/gemini-api/docs/rate-limits)
- [Gemini API billing](https://ai.google.dev/gemini-api/docs/billing/)

## Direct answer to the multi-project question

### Can multiple Google Cloud projects on one account increase total available quota?

Technically, yes, because Gemini Developer API rate limits are enforced per project rather than per API key.

### Should this project use multiple projects as a scaling method for one production workload?

No, not as the default plan.

Google Cloud's terms explicitly prohibit using multiple applications, accounts, or projects to simulate a single one or to circumvent service-specific usage limits or quotas. Based on that language, using five projects as a deliberate quota-pooling layer for one production pipeline is high-risk and should be treated as out of bounds unless Google explicitly approves that architecture in writing.

### When are multiple projects still reasonable?

Multiple projects are still reasonable for normal separation of environments and concerns, for example:

- dev
- staging
- production
- sandbox experiments
- a genuinely separate product or tenant boundary

That is different from round-robinning one production image workload across cloned projects just to multiply the daily cap.

## Likely root cause

The immediate cause is straightforward:

1. the workflow is calling a preview Gemini image model,
2. that model/project combination has a daily request ceiling,
3. sibling-order fan-out and testing/retries exhausted the daily budget before the Pacific-time reset.

Additional inference from the docs and current repo state:

- The active project is already confirmed as `Tier 1`, so the current issue is not “billing never activated.” It is “paid Tier 1 is still too small for current image-generation volume.”
- Even if billing is enabled, preview image models can still have relatively tight limits compared with stable paid production paths.
- Because failed requests still count against quota, repeated retries after exhaustion make the situation worse rather than better.

## Direct answer: how to get to Tier 2 and what it costs

How to get to Tier 2:

1. keep the current Gemini project linked to a real Google Cloud Billing account
2. ensure billing is fully active and any required one-time prepayment verification is completed
3. exceed `>$250` in total cumulative Google Cloud spend on the linked billing account
4. wait until at least `30` days have passed since a successful payment
5. confirm the project tier changed in AI Studio

Important nuance:

- this is not a separate “buy Tier 2” button with a fixed subscription price
- it is a usage-based eligibility threshold on the linked billing account
- if the billing account has already crossed the threshold and the payment-age requirement is already satisfied, the incremental upgrade cost is effectively `$0`
- if not, the incremental cost is simply whatever additional Google Cloud spend is needed to push the billing account above `$250`

So the practical answer to “how much would Tier 2 cost?” is:

- **there is no separate Tier 2 fee**
- **the gating requirement is cumulative billing-account spend above `$250`, plus 30 days since successful payment**

## Direct answer: should this move to Vertex AI?

### What Vertex AI is

Vertex AI is Google Cloud’s fuller managed AI platform. It is not just “Gemini with a different URL.” It is the broader Google Cloud environment for running, governing, deploying, monitoring, and scaling AI workloads.

Google’s own migration guide summarizes the main differences:

- Gemini Developer API uses `generativelanguage.googleapis.com`
- Vertex AI uses `aiplatform.googleapis.com`
- Gemini Developer API typically uses API keys / AI Studio
- Vertex AI typically uses Google Cloud service accounts / Vertex AI Studio
- Vertex AI adds stronger governance, compliance, IAM, regional deployment, logging, and broader MLOps support

### How pricing differs

For the same Google model family, the raw per-token / per-image prices are often broadly similar between Gemini Developer API standard pricing and Vertex AI standard pricing.

For the currently relevant image model class, official pricing shows:

- Gemini Developer API `Gemini 3 Pro Image Preview` paid tier:
  - image output: `$120 / 1M output tokens`
  - about `$0.134` per `1K/2K` image
  - about `$0.24` per `4K` image
- Vertex AI pricing for the same model class also shows:
  - image output: `$120 / 1M output tokens`
  - about `$0.134` per `1K/2K` image
  - about `$0.24` per `4K` image

Where Vertex differs more materially is structure, not just base price:

- Vertex offers regional quotas instead of only AI Studio project-tier framing
- Vertex supports additional commercial modes such as priority / flex-batch pricing and Provisioned Throughput
- Vertex integrates into Google Cloud IAM, logging, networking, and governance

### How the structure differs

Current setup:

- Gemini Developer API
- AI Studio project and API key
- project-tier limits like `Tier 1`
- good for developer-first API usage

Vertex AI setup:

- Google Cloud / Vertex AI project
- usually service-account auth and regional endpoints
- optional Vertex AI express mode for API-key-based access on Vertex endpoints
- stronger enterprise controls, regional deployment choices, and long-term production scaling options

### Should this project switch now?

Recommendation: **not as the first response to yesterday’s quota event**.

Why:

- the immediate bottleneck is clearly the `Tier 1` daily request cap on `Nano Banana Pro (Gemini 3 Pro Image)`
- your screenshots show RPM and TPM are not the problem
- Tier 2 would likely remove the immediate pain by moving this model from roughly `250` RPD to roughly `15,000` RPD in the current project
- migrating to Vertex adds operational work, auth changes, endpoint changes, and new deployment decisions

Recommendation order:

1. harden the current Tier 1 workflow so daily exhaustion stops cleanly
2. push the production project to Tier 2 eligibility
3. keep measuring actual daily image volume
4. evaluate Vertex AI if image generation remains production-critical and you need enterprise-grade scaling, regional quota planning, or provisioned capacity

So:

- **short-term:** stay on Gemini Developer API and get out of Tier 1
- **medium/long-term:** consider Vertex AI if this becomes a real production throughput problem rather than a one-project paid-tier problem

## What the Google AI plans page is, and why it is different

This page:

- [Google AI plans](https://one.google.com/intl/en/about/google-ai-plans/)

is a **consumer Google One subscription offering**, not a backend API quota plan for the Gemini Developer API.

It bundles things like:

- Gemini app access
- Google Search AI features
- NotebookLM
- Flow / Whisk / Veo consumer usage
- Gemini in Gmail / Docs
- Google One storage

Google’s own page says:

- these are `Google AI Plus`, `Google AI Pro`, and `Google AI Ultra` consumer plans
- `Google AI Premium` was renamed to `Google AI Pro`
- these plans are for personal Google accounts

What it is **not**:

- not a Gemini Developer API quota upgrade
- not a Vertex AI quota purchase
- not a replacement for Google Cloud billing on your backend project
- not a way to move your n8n production project from Gemini API Tier 1 to Tier 2

So for Little Hero Books backend capacity planning, that page is mostly unrelated. It is about consumer app access and Google One storage benefits, not production API throughput.

## Recommended strategy order

## Best path with the current setup

If the goal is to keep the existing n8n + Gemini Developer API setup and make it reliable before any larger platform shift, the best path is:

1. confirm the exact n8n credential is attached to the intended paid Google project
2. verify that project is actually on an active paid quota tier
3. keep using a single production project rather than quota-pooling across cloned projects
4. add quota-aware failure handling so the workflow stops cleanly on daily exhaustion
5. reduce avoidable image-generation spend from test runs, retries, and unnecessary re-runs
6. only after that, request a higher quota or evaluate a different production image path

That is the best first plan because it preserves the current architecture, avoids likely terms issues, and fixes the main operational gap: the workflow currently treats a hard daily exhaustion like an ordinary retryable failure.

### What this means in practice

With the current setup, the immediate goal should not be "how do we multiply the quota with more projects?" The immediate goal should be:

- make sure the current project is really paid
- stop burning quota unintentionally
- fail early and clearly when the remaining daily budget is insufficient
- gather enough usage data to justify the right quota increase or model migration

### Current-setup recommendation

Recommended first implementation in the existing stack:

1. Billing check
2. Quota-aware 429 handling
3. Usage budgeting and run gating
4. Test-traffic reduction
5. Production model/path review
6. Paid quota increase request

### Explicit recommendation against the tempting shortcut

Creating `5` projects to try to get `5x` daily capacity is not the recommended way to accomplish the goal, even if it might work technically. For the current setup, the better path is to make one production project correct, observable, and quota-aware first.

### 1. Verify the exact project and key are truly on the paid tier

Do this first before changing architecture.

Check in AI Studio for the exact project behind the n8n credential:

- quota tier for that project/key
- whether it shows `Tier 1`, `Tier 2`, or `Tier 3`
- whether it shows `Action needed`
- whether the active key belongs to the intended production project

If the project is not actually on a paid tier, fix that first. If Google is requiring prepayment, complete that step.

### 2. Stop treating multi-project rotation as the primary scaling plan

Do not implement round-robin across cloned projects for one workload unless Google confirms it is acceptable for this use case. The official terms cut directly against quota-circumvention behavior.

### 3. Move off the current preview image model path for production if a supported alternative fits quality needs

The current implementation still targets `gemini-3-pro-image-preview`. Google’s current docs emphasize newer image options and note that preview models can have tighter limits.

Action:

- evaluate the current supported image-generation options for this workflow
- compare quality, consistency, and quota behavior on a controlled sample set
- prefer a non-preview production path if the output quality is acceptable

This is the most likely medium-term improvement after billing verification.

### 4. Request a rate-limit increase or tier upgrade for the real production project

If the project is already on a paid tier and the daily cap is still too small, use Google’s paid-tier rate-limit increase process. If usage justifies it, progress to the next quota tier rather than working around the cap with extra projects.

### 5. Add workflow-level protection so daily exhaustion fails cleanly

This should be implemented regardless of pricing tier.

Add to n8n:

- retry for transient 429s only
- explicit handling for daily-quota 429s
- stop fan-out once a hard quota exhaustion is detected
- persist a clear order status / manual-review reason
- send an alert with model, project, node, and retry-after window

Important: a generic retry loop is not sufficient here because this error requested a retry roughly 18 hours later.

### 6. Reduce quota burn from non-production traffic

Before buying more capacity, cut waste:

- enforce mock mode for test runs where real images are not required
- avoid regenerating poses that already have acceptable outputs
- cache or reuse character outputs where the workflow is already idempotent
- gate manual re-runs so they do not repeat the full pose set unnecessarily
- separate exploratory QA from production credentials/project

### 7. If this becomes business-critical at sustained volume, evaluate Vertex AI production capacity

For higher-confidence production scaling, evaluate Vertex AI rather than project rotation. Google documents quota-management and Provisioned Throughput options there.

This is probably not the first move, but it is the cleaner long-term path if daily image volume keeps growing.

## Recommended implementation order for this repo

### Immediate

1. Verify the quota tier and billing state for the exact n8n Gemini credential project.
2. Confirm the production n8n credential is pointing at that exact paid project and not an older/free project.
3. Add explicit daily-quota handling in the n8n HTTP request path and downstream error routing.
4. Add lightweight usage budgeting so a run cannot burn the remaining daily capacity blindly.
5. Reduce non-production traffic on the production Gemini credential.

### Short-term

6. Audit every repo path still using `gemini-3-pro-image-preview`.
7. Test one supported non-preview production alternative against current quality expectations.
8. Submit a paid-tier rate-limit increase request if the production project is already correctly paid.

### Longer-term

9. Decide whether production image generation should stay on Gemini Developer API or move to Vertex AI for cleaner capacity planning.

## Implementation notes for follow-up

The first code/workflow changes should likely land in:

- [SIBLING - w2A-SW1-Pose_Generation.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/sibling-orders/sibling-order-n8n-workflows/SIBLING%20-%20w2A-SW1-Pose_Generation.json)
- [SIBLING - w2B-sw1-single-pose.json](/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/sibling-orders/sibling-order-n8n-workflows/SIBLING%20-%20w2B-sw1-single-pose.json)
- [route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/orders/[orderId]/regenerate-pose/route.ts)
- [route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/preview/generate/route.ts)

Minimum behavior change:

- classify 429 responses into transient vs hard-daily-quota
- parse and log retry-delay / quota metric / model
- stop additional sibling pose generation after confirmed daily exhaustion
- surface a human-readable operator message instead of a generic retry storm

Recommended current-setup additions:

- add a preflight estimate of expected Gemini calls before starting a sibling run
- if the expected call count would likely exceed the remaining daily budget, fail the run before fan-out begins
- route quota-exhausted orders into a clear manual-review or deferred-retry state
- keep test and QA runs on mock mode whenever a real image is not required
- log which Google project/credential was used for each generation run

## Decision

Preferred order:

1. verify paid-tier status on the exact project/key
2. make the current single-project setup quota-aware and low-waste
3. evaluate a supported non-preview production image path
4. request higher quota / higher tier
5. evaluate Vertex AI if production volume keeps rising

Not recommended:

- using multiple Google Cloud projects as a quota-multiplication pool for one production workload without explicit Google approval
