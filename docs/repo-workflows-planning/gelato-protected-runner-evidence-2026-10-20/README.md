# Local protected-runner evidence

These are generated local test receipts and reviewed redacted summaries. They contain no runnable approval packet, credentials, real order/recipient identifiers or provider data. The service model uses synthetic account keys, synthetic sentinel rows and short fake PDF byte fixtures. The crash suite uses actual child processes, SIGKILL, fsync journal writes and a loopback-only HTTP server.

`python3 verify.py` checks retained receipts/checksums only. `--source` additionally compares exact current source bindings. Reproduce actual tests with `npm --prefix back-end run test:gelato-protected-runner` using Node 22 or newer. The original 24-check suite is `npm --prefix back-end run test:gelato-isolated-preparation`.

A late/unacknowledged timer activation is deliberately NOT marked clean, even after an inactive readback. Scope revocation and timer stop are still attempted, but later cases stop pending separate resolution. Missing journal evidence cannot turn that uncertainty into success. These tests do not prove power-loss durability, hosted n8n activation/execution semantics, current account funding, prepress, billing, printing or delivery.

Earlier isolated-runner evidence is retained unchanged and verified as historical. This package binds current changed source without renewing historical live credential/control observations. Full repository typecheck remains failing; no changed-file diagnostics are present in the recorded check.
