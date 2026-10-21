# Frontend deployment smoke failure: local diagnosis and fix

Date: 2026-10-20. Investigation baseline: `8f30377c929bc9386ac99dfd168a5674be978bfb`. Publication base: current main including PR #40.
Investigation scope: local repair and regression tests. Publication adds the tests, CI wiring and this diagnosis; the same workflow repair was independently merged in [PR #40](https://github.com/jtlapenna/little-hero-books/pull/40) before this follow-up. No deployment, provider call, order access, funding, printing or customer communication was performed by this work. Submission controls were not changed. The six pending orders were not accessed or modified.

## Observed incident

[Frontend release run 39472015029](https://github.com/jtlapenna/little-hero-books/actions/runs/39472015029) used source `c479bd5f447ae5296c3ca8da677bdb883f64b32b`. The Cloudflare upload step succeeded. The subsequent customer-site smoke step failed with `curl: (23) Failure writing output to destination` and exit code 23.

The smoke step streamed curl output into `grep -q` under `set -euo pipefail`. Once grep found the expected brand, it could exit before curl finished writing the large homepage. The closed pipe made curl fail and therefore failed the step despite valid matching content. The local regression test reproduced this exact exit code against the original workflow with a valid 4 MiB homepage containing the brand near its start.

Because the shell stops at the first failure, this release log does not establish that its later sitemap and HSTS assertions passed. Successful upload also does not establish complete storefront health.

## Local change

The deployment smoke step now downloads each response into a file under `RUNNER_TEMP`, waits for curl to finish successfully, and then checks that file with grep. HTTP failures, interrupted downloads, missing expected homepage/sitemap text, and missing HSTS still fail the step. The original URLs and assertions remain the same. Deployment commands, triggers, credentials and production controls are unchanged.

`frontend/scripts/test-deployment-smoke.mjs` extracts the actual smoke shell from the workflow and runs it against an ephemeral loopback HTTP server using the real curl executable. A temporary wrapper redirects only the two fixed public URLs to loopback. The shell receives PATH and RUNNER_TEMP only; no project credentials are loaded. The real curl invocation uses first-argument `-q` so workstation curl configuration cannot add requests or alter routing. Temporary response files are cleaned up after testing. The production-build workflow now runs this regression suite before the frontend build.

## Verification

Run from the repository root with Node 22 or newer and curl available at `/usr/bin/curl`:

```sh
npm --prefix frontend run test:deployment-smoke
node --check frontend/scripts/test-deployment-smoke.mjs
git diff --check
```

Locally executed with Node 24.5.0; independent review also verified compatibility with Node 22.17.1. Original shell: failed with curl exit 23 on the valid large response. Repaired shell: all eight checks passed:

| Fixture | Expected and observed |
| --- | --- |
| Large valid homepage, valid sitemap, mixed-case HSTS | Pass; entire homepage downloaded |
| Missing homepage brand | Fail before sitemap/HEAD |
| Homepage HTTP 503 | Fail before content checks |
| Interrupted homepage containing brand in first bytes | Fail before sitemap/HEAD |
| Missing sitemap entry | Fail before HEAD |
| Sitemap HTTP 404 | Fail before HEAD |
| Missing HSTS | Fail after content checks |
| Subsequent healthy invocation | Pass independently |

Zero external requests, deployments or order/provider requests were made by the test. Syntax and whitespace checks also passed. No application source or dependencies changed; the Astro build was not rerun for this workflow-only repair. At initial local verification, hosted CI and the production deployment smoke step had not been run against this patch. Hosted checks for the follow-up are recorded on its PR; no deployment is authorized. These checks do not validate shopping, checkout, Gelato fulfillment or other live application behavior.

A matching workflow-only change found staged in another checkout was left untouched. After fetching current main, this branch retained its merged PR #40 repair and adds independent reproduction and regression coverage without duplicating that workflow change.

Independent review confirmed the original failure reproduction, the eight cases, and unchanged deployment authority. Its one Low finding (curl could load workstation curlrc in the local harness) was fixed by disabling curlrc before processing test arguments. No High or Medium findings were reported.
