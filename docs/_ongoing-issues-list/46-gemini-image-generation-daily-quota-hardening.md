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

- If the active project is still showing `Free` or `Action needed` in AI Studio instead of `Tier 1/2/3`, then billing may not be fully activated for the exact key/project being used.
- Even if billing is enabled, preview image models can still have relatively tight limits compared with stable paid production paths.
- Because failed requests still count against quota, repeated retries after exhaustion make the situation worse rather than better.

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
