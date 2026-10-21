# Local launcher and readiness evidence — October21

This package contains local loopback/OS-process results, retained redacted quote replay, synthetic negative/reconciliation cases and a non-executable three-case readiness package. It is not live workflow/provider/prepress proof or permission to execute/install/deploy. No new production data or credentials are included.

Offline checksum/consistency check (does not rerun tests):

```sh
python3 docs/repo-workflows-planning/gelato-local-launch-evidence-2026-10-21/verify.py --source
```

To rerun tests, use Node24.5.0 (tested), or supported Node22.19+ with compatible locked dependencies. From `back-end`:

```sh
node --import tsx scripts/test-gelato-protected-launch.ts
node --import tsx scripts/test-gelato-local-window.ts
node --import tsx scripts/test-gelato-protected-runner.ts
node --import tsx scripts/test-gelato-protected-runner-crashes.ts
node --import tsx scripts/test-gelato-isolated-preparation.ts
node --import tsx scripts/test-gelato-pricing-replay.ts
```

The hosted Ubuntu Node22 workflow is prepared, not run by this local phase. Typecheck still has unrelated existing errors; see types.json. Tests use synthetic authorities, loopback, immutable repo fixtures and retired-key fingerprints only, with no project env/key readers. Launcher tests run actual child processes and SIGKILL/SIGINT/SIGTERM. They use synthetic service/PDF bytes, not the four actual assembled PDF binaries. The historical independent PDF inspection and retained quote response identities remain historical; source hashes do not renew live observations.

matrix.json lists12 replay rows: three required cases times three tiers plus a quantity-two control times three tiers. The proposed live plan has9 total quote comparisons:3 primary plus6 additional quote-only. All real recorded parcels are1. Split parcels, changed pricing, receipt tax/fees/discounts and failure scenarios are explicitly synthetic. Receipt comparisons remain unbound observations; a complete final payable source and provider-enforced cap remain unresolved.

readiness.json intentionally has no fresh scope/order/member/hosted workflow identity, approval or private destination. It cannot execute, install, issue a scope or approve anything. Fill its prerequisites under separate authorization, and compile a separately reviewed exact private launch context with a fresh bounded window. Never copy illustrative/synthetic authority into a live context or reset a journal to allow another attempt. Never select the six pending orders.

See the companion local results and run sheet for requirements/statuses and future approval gates. Earlier evidence packages are preserved unchanged. Their optional current-source checks may be stale for older historical packages; run their checksum-only mode where applicable and distinguish it from a fresh source binding.
