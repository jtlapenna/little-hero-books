# Gemini Spend Attribution Audit: March 2026

## Question

Was the March 2026 Gemini API bill mostly or entirely caused by our repo-centric workflow testing?

Short answer:

- **Some of it definitely was.**
- **Not all of it was.**
- The repo-centric proof runs explain the Gemini activity on **March 25, 2026**, **March 26, 2026**, and **March 31, 2026**.
- They do **not** explain the largest visible bill spikes on **March 20, 2026** and **March 21, 2026**.

## Billing Snapshot Being Investigated

The billing screenshot under review shows:

- service: `Gemini API`
- invoice month: **March 2026**
- subtotal: **$293.95**
- largest chart spikes: approximately **March 20** and **March 21**

This audit was done on **April 1, 2026** against the current production database plus the repo code and workflow exports.

## Bottom Line

The repo-centric test work is a **real contributor**, but it is **not the whole story**.

What we can prove:

- tracked repo-centric Gemini workflow jobs exist and were created by proof orders
- those tracked jobs all cluster on **March 25**, **March 26**, and **March 31**
- there were **no matching order rows at all** on **March 20** or **March 21**

Strong inference:

- the March 20-21 spend spikes came from Gemini call paths that are **not represented by the tracked repo-centric proof orders**
- the most likely sources are untracked repo calls, untracked n8n Gemini nodes, or non-order tooling/scripts using the same Gemini project/key

## Evidence

## 1. Tracked repo-centric Gemini workflow jobs

Using `workflow_jobs` filtered to `external_provider = gemini` for **March 1-31, 2026**:

- total tracked Gemini workflow jobs: **174**
- all `174` were associated with `W2A-TOP-PROD-*` proof orders
- none were associated with real customer order ids

Breakdown by day:

| Date | Tracked Gemini workflow jobs | Notes |
| --- | ---: | --- |
| 2026-03-25 | 109 | repo-centric proof activity |
| 2026-03-26 | 13 | repo-centric proof activity |
| 2026-03-31 | 52 | repo-centric proof activity |

Examples of the tracked order ids:

- `W2A-TOP-PROD-20260325143602`
- `W2A-TOP-PROD-20260325143935`
- `W2A-TOP-PROD-20260331184840`
- `W2A-TOP-PROD-20260331190756`
- `W2A-TOP-PROD-20260331215249`

Important nuance:

- this `174` count is a **floor**, not a full dollar attribution
- it only proves the subset of Gemini usage that is currently logged through `workflow_jobs`
- it does **not** prove that repo-centric testing used only 174 Gemini calls total

Why it is only a floor:

- the current workflow-job tracking is centered on **W2A pose jobs**
- some Gemini calls in the wider `W2A` and `W2B` workflow graph are still executed in `n8n` and are not represented as separate `workflow_jobs` rows

## 2. Cross-check against orders on the spike days

Production `orders` rows for **March 19-21, 2026** were checked for likely repo-centric proof markers:

- `TOP-PROD`
- `jeff.lapenna+`
- `codex`
- `test`

Result:

- **no matching rows**
- in fact, there were **no order rows at all** returned for **March 19**, **March 20**, or **March 21**

That matters because the visible billing spikes are on **March 20** and **March 21**, but the repo-centric proof orders only appear later, mainly on **March 25** and **March 31**.

## 3. Repo Gemini call paths that can generate spend

These repo code paths can call Gemini directly with the production API key:

### Direct repo-side Gemini API calls

- [preview/generate/route.ts](../../back-end/src/app/api/preview/generate/route.ts)
  - website preview generation
  - uses `gemini-3-pro-image-preview`
  - not represented by `workflow_jobs`
- [regenerate-pose/route.ts](../../back-end/src/app/api/orders/[orderId]/regenerate-pose/route.ts)
  - manual pose regeneration
  - uses `gemini-3-pro-image-preview`
  - not represented by `workflow_jobs`
- [check-and-flip-orientation/route.ts](../../back-end/src/app/api/check-and-flip-orientation/route.ts)
  - orientation fallback / vision comparison
  - defaults to `gemini-2.5-flash`
  - not represented by `workflow_jobs`

### Repo code that shapes Gemini work but does not itself submit it in this phase

- [w2a-base-input.ts](../../back-end/src/lib/books/w2a-base-input.ts)
  - owns prompt contract for repo-centric `W2A-SW0`
  - the actual Gemini submit still happens in `n8n` in this migration phase

### Repo-side Gemini usage that is tracked in `workflow_jobs`

- [w2a-pose-jobs.ts](../../back-end/src/lib/workflow-jobs/w2a-pose-jobs.ts)
  - queues and manages `W2A` pose jobs with `externalProvider = "gemini"`
  - this is the source of the `174` tracked rows above

## 4. n8n Gemini call paths that can generate spend

These workflow exports contain active or likely-active Gemini HTTP nodes:

### Repo-centric workflow exports

- [w2A-SW0-Base_Character_Generation.repo-centric.json](../n8n-workflow-files/repo-centric/workflows/w2A-SW0-Base_Character_Generation.repo-centric.json)
  - base character generation
  - direct `generateContent` call
- [w2A-SW1-Pose_Generation.repo-centric.json](../n8n-workflow-files/repo-centric/workflows/w2A-SW1-Pose_Generation.repo-centric.json)
  - main pose generation
  - direct `generateContent` call
- [w2B-sw1-single-pose.repo-centric.json](../n8n-workflow-files/repo-centric/workflows/w2B-sw1-single-pose.repo-centric.json)
  - Gemini QA / transparency review
  - direct `generateContent` call

### Current non-repo-centric but still relevant workflow exports

- [w2A-SW2-Pose_and_Style_QA.json](../n8n-workflow-files/finals/w2A-SW2-Pose_and_Style_QA.json)
  - Gemini pose/style QA
  - contains direct `generateContent` calls
- [w2A-SW3-Upload.json](../n8n-workflow-files/finals/w2A-SW3-Upload.json)
  - Gemini flip-verdict logic
  - contains direct `generateContent` call

These nodes matter for cost attribution because they can consume Gemini without creating a distinct provider ledger entry in repo-side `workflow_jobs`.

## 5. Non-order / non-production-adjacent Gemini tooling that can also spend money

There is also at least one direct script path that can use the same Gemini API key if someone runs it locally or operationally:

- [generate-hair-chips-from-csv.js](../../scripts/generate-hair-chips-from-csv.js)

This script is not evidence that it was used in March, but it is a real cost path and should be included in any future spend attribution model.

## 6. Most likely largest repo-centric contributor

Inside the repo-centric testing we can currently prove, the **most likely largest contributor is `W2A-SW1` pose generation**.

Reasoning:

- the tracked March ledger rows are all from [w2a-pose-jobs.ts](../../back-end/src/lib/workflow-jobs/w2a-pose-jobs.ts)
- those jobs represent per-pose Gemini work for `W2A`
- each successful `W2A` run can create up to **13 pose jobs**
- `SW0` is typically one base-image generation per order
- `SW1` repeats once per pose, so it naturally dominates the Gemini call count

So if you ask, "within repo-centric proof work, what is probably the biggest cost driver?", the best current answer is:

> `W2A-SW1` is almost certainly the dominant repo-centric contributor, because the tracked Gemini workload is overwhelmingly per-pose generation rather than one-time base generation.

Important caveat:

- this is a **strong attribution judgment**, not a dollar-exact measurement
- it tells us what most likely dominated the repo-centric proof spend
- it still does **not** explain the March 20-21 bill spikes

## 7. How to use Google Billing UI to get the best possible breakdown

The built-in Billing Reports UI can usually tell you:

- which **service** generated cost
- which **SKU** generated cost
- which **project** generated cost
- which **label key** generated cost, if labels exist for that usage

It usually **cannot** tell you:

- which internal route generated the spend
- which workflow node generated the spend
- whether the caller was `preview/generate` versus `W2A-SW1` versus `regenerate-pose`

unless you already separated those callers by project or label.

### Best UI workflow

1. Open the Billing **Reports** page for the billing account.
2. Set:
   - **Time range** to `Invoice month (March 2026)`
   - **Service** filter to `Gemini API`
3. Switch **Group by** to `SKU`.
   - This gives the most granular built-in cost view in the report table.
4. Then switch **Group by** to `Date > SKU`.
   - This shows which Gemini SKU drove each spike day.
5. Then switch **Group by** to `Project`.
   - If you have more than one Gemini project, this is the fastest way to isolate which project owns the spend.
6. Then switch **Group by** to `Date > Project`.
   - This tells you which project produced the spike on March 20 or March 21.
7. If label filters are available, try **Group by = Label keys** or add a **Labels** filter.
   - This only helps if the cost line items actually have labels.

### What to look for

- If the March 20-21 spike is concentrated in a **different project** than the repo-centric proof work, you have your answer immediately.
- If the spike is concentrated in the **same project** and **same SKU** as the repo-centric proof work, the Billing UI will usually stop being useful there.
- If **Labels** are empty or irrelevant, that is normal for many API-driven costs.

## 8. When the Billing UI stops helping

Per Google Cloud's billing docs, reports can be grouped by things like **Project**, **Service**, **SKU**, and **Label keys**, and you can generate a matching BigQuery query from the report if billing export is enabled. But those dimensions are still billing dimensions, not application-level workflow dimensions.

In practice, that means:

- if `preview/generate`, `W2A-SW1`, `W2B-sw1`, and `regenerate-pose` all use the **same Gemini project**
- and none of those requests produce distinct billable labels

then the Billing UI cannot reliably tell you which one caused a given chunk of spend.

At that point, the right answer is not "click a different report" but:

- use **BigQuery billing export**
- correlate by **project**, **SKU**, and **hour**
- then match that against repo logs, workflow executions, and admin activity

## 9. Best next step in Google Cloud if you want a better answer now

Use the Billing Report first, but if the project breakdown is still mixed, do this:

1. Enable **Cloud Billing export to BigQuery** if it is not already enabled.
2. From the Billing Report, click **Generate query**.
3. Run the generated query in BigQuery for:
   - service = `Gemini API`
   - invoice month = `202603`
4. Break the results down by:
   - `project.id`
   - `project.name`
   - `sku.id`
   - `sku.description`
   - `usage_start_time`
5. Compare the hourly spikes to:
   - `W2A` proof execution times
   - preview-generation traffic
   - manual admin regeneration actions
   - n8n execution timestamps

That is the best path to a more precise answer without redesigning your telemetry first.

## What This Means

## What we can say confidently

- Repo-centric testing **definitely contributed** to March Gemini spend.
- The proven repo-centric proof activity is concentrated on:
  - **March 25, 2026**
  - **March 26, 2026**
  - **March 31, 2026**
- The biggest visible billing spikes on **March 20-21, 2026** are **not explained** by the tracked repo-centric proof orders.

## What we cannot say confidently yet

- the exact dollar amount caused by repo-centric testing
- the exact dollar amount caused by preview generation
- the exact dollar amount caused by manual pose regeneration
- whether the March 20-21 spend came from:
  - preview traffic
  - manual admin actions
  - legacy/non-repo-centric n8n workflows
  - local scripts
  - some other external process using the same Gemini project/key

## Best current attribution judgment

Use this wording going forward:

> March 2026 Gemini spend was partly driven by repo-centric workflow proof runs, but the largest spend spike predates the main repo-centric test days and must have come from other Gemini call paths that are not currently attributed in our workflow job ledger.

## Recommended Next Steps

If exact attribution matters, do these next:

1. Add a simple provider ledger for **every** Gemini call site.
   - preview generation
   - regenerate pose
   - orientation fallback
   - `W2A-SW0`
   - `W2A-SW1`
   - `W2A-SW2`
   - `W2A-SW3`
   - `W2B-sw1`

2. Split Gemini usage by purpose.
   - separate API keys or separate Google Cloud projects for:
     - preview generation
     - workflow production/testing
     - experimental/manual scripts

3. Log enough metadata to classify spend by source.
   - order id
   - workflow/stage
   - route name
   - test vs production
   - user/admin actor when applicable

4. Treat `workflow_jobs.external_provider = gemini` as a **partial attribution source**, not the full billing truth.

## Confidence

- **High confidence**
  - tracked repo-centric Gemini workflow jobs occurred mainly on March 25/26/31
  - March 20/21 spikes are not explained by those tracked repo-centric proof orders

- **Medium confidence**
  - untracked preview/manual/n8n Gemini paths are the main missing contributors

- **Low confidence**
  - exact dollar split across each untracked path, because that telemetry does not exist today
