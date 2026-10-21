# Local incident safeguards evidence

These are synthetic local regression receipts, not current provider/account observations or authority to execute a live test. See the [results and revised plan](../gelato-incident-local-safeguards-2026-10-21.md). No real order identifiers, recipient addresses, credential values or signed URLs are included.

`checks.json` records completed suites, output digests, structured incident/runner/crash checks, the disposable PostgreSQL result and typecheck limitations. `manifest.json` binds evidence and current source. Older evidence packages are preserved unchanged. Their offline integrity checks still run; current-source verification is superseded by this manifest, which covers every source path in both earlier runner/launcher manifests as well as the incident changes. This avoids rewriting a historical receipt to pretend it tested new code.

Offline evidence verification (does not execute tests or access services):

```sh
python3 docs/repo-workflows-planning/gelato-incident-safeguards-evidence-2026-10-21/verify.py --source
```

To reproduce behavior, use locked backend dependencies and Node >=22.19 (recorded locally with Node 24.19). From `back-end`, run each listed script with `node --import tsx scripts/NAME.ts`; the admin-inspection script uses `.tsx`. Use an environment without project credentials, for example `env -i HOME="$HOME" PATH="$PATH" NODE_ENV=test node --import tsx scripts/test-gelato-incident-safeguards.ts`. Tests install synthetic bindings internally. Never use dotenv or an ops/live command. Loopback Worker/process suites need local socket permissions. No installation or live context is part of these instructions.

The disposable SQL suite requires PostgreSQL and ripgrep in PATH. Run `bash scripts/test-gelato-print-submissions.sh` with `GELATO_TEST_PG_BIN` pointing to a local PostgreSQL bin directory. It initializes a new temporary database, binds a Unix socket with TCP disabled, applies repository schema fixtures and removes the database afterward. It never uses a hosted database URL. Its macOS locale is explicitly C and startup errors are printed before cleanup.

The full typecheck command is `node node_modules/typescript/bin/tsc --noEmit --pretty false --incremental false`. It remains non-green with 387 diagnostics on the publication base. To reproduce the read-only baseline comparison, from `back-end` run `node scripts/compare-gelato-incident-types.mjs --base 5c900710179ad3604b27cc6bfc853aa720dcf17b --output /tmp/NEW-UNUSED-TYPE-RECEIPT.json` with that Git commit already fetched locally. The tool overlays changed source from the base in memory, excludes new source for the baseline, and compares file/code/message multisets under identical dependencies/config/generated types. It never changes the checkout, fetches or emits code, and refuses to overwrite a receipt. The package records matching 387-diagnostic multisets, not a passing full typecheck.

The live engineering conversion routes are retired by local source changes. The historical conversion and queue protocol suites now use an explicitly injected reserved-domain simulation; passing them must not be described as live unpaid conversion proof. The real runtime tests separately verify default rejection before provider/authority transport in Node and the configured Worker runtime, and verify scoped status handling with fake services.

Source inspection, checksums and passing local tests do not explain why Gelato fulfilled earlier orders at zero cost or prove an atomic provider spending cap. Those matters remain blocked on provider evidence and separately approved live/physical work. This package is not deployed.
