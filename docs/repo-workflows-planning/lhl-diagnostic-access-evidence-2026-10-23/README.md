# LHL diagnostic Access compatibility: local source evidence

This additive snapshot prepares the protected diagnostic runner for the existing Cloudflare Access challenge on its immutable provider host. It preserves the complete source coverage and historical verification chain from controlled-character-handoff-evidence-2026-10-22. Earlier manifests, logs and incident receipts are unchanged. Nothing here authorizes a diagnostic, credentials, policy changes, publication or deployment.

The private launcher schema accepts either a complete diagnosticAccessClientId / diagnosticAccessClientSecret pair or neither. New execution requires both before durable claim or process spawn. Close remains usable without the pair. The adapter sends CF-Access-Client-Id and CF-Access-Client-Secret only to its exact bound diagnostic GET, with cookies omitted and redirects rejected. Backend Bearer and runtime proof remain required. No credential is placed in argv, environment, output or the journal.

Five real synthetic suites exercise the adapter, child-process IPC/launcher, independent cleanup/crashes, scoped credential dispatch and actual backend GET proof handler. The recorded local runtime is Node 24; hosted workflows select Node 22 and still require fresh hosted results after publication. No production acceptance or human login is renewed. The existing repository-wide typecheck has 352 baseline diagnostics; an in-memory baseline/current comparison found no added or changed-file diagnostics. This is not a clean global typecheck.

Reproduce from the repository root with an appropriate Node runtime on PATH:

```sh
python3 docs/repo-workflows-planning/lhl-diagnostic-access-evidence-2026-10-23/run.py
python3 docs/repo-workflows-planning/lhl-diagnostic-access-evidence-2026-10-23/test-verifier.py
python3 docs/repo-workflows-planning/lhl-diagnostic-access-evidence-2026-10-23/verify.py --source
```

run.py writes a fresh local snapshot and runs only the five synthetic suites under a scrubbed PATH/NODE_ENV environment; it does not install dependencies. The verifier checks exact source and evidence hashes, full inherited coverage, required paths, successful suite receipts, zero reported live effects, and the unchanged historical chain. The negative test uses disposable copies to reject source/workflow drift, coverage loss, failed tests, altered output, nonzero live-write receipts and unsafe manifest paths.

A hosted setup is separately held for owner approval. Its proposed exact host/path application must explicitly preserve the John/Jeff human Allow association and use one dedicated short-lived Service Auth token, not a broad wildcard service grant or Bypass. Access path matching cannot restrict queries or HTTP methods. No live POST test is authorized; the endpoint can submit a job. Direct diagnostics remain paused until a separately reviewed approved setup and safe verification window.
