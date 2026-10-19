# Persistent ordinary release — redacted local evidence

Run `python3 verify.py --source` for current publication source hashes and recorded receipt consistency. It does **not** execute tests or access a database/provider. Omit `--source` to check historical receipt integrity only.

The adjacent results document gives real test commands. Nineteen groups used a disposable PostgreSQL17.10 container and the production client/store/core, with intercepted provider transport. Sixty-one core cases and seven regression suites are separate evidence. Provider costs, conversion and later lifecycle remain simulated here; no paid approval or live order access occurred. The new SQL is not installed, and its gate defaults OFF.

The three earlier evidence packages are preserved unchanged. Their `--source` option identifies their earlier exact phase, not this changed source. Their default verifiers remain valid; this package hashes the current source and the preserved historical manifests/receipts. Full private logs remain ignored and owner-only in `.gelato-testing/ordinary-store-local-20261019`.
