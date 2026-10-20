# Offline isolated-runner evidence

This package records local synthetic/disposable-SQL checks and a separate ten-request live read-only credential/control audit. It does not prove a provider order, funded account safety, hosted n8n execution, physical output or deployment. The five workflow-definition GETs did not access execution history or select pins/static data. None of the six existing orders was selected.

Run `python3 verify.py` for receipt/checksum consistency only. Add `--source` to compare retained source bindings with this checkout. Neither mode reruns tests or accesses services. See `../gelato-isolated-runner-preparation-2026-10-20.md` for actual test commands and limitations.

Example candidates are deliberately inactive, not approved packets: fabricated row IDs, fake account digest, unissued scope UUIDs and 2030 dates. Their private JSON/PDF originals remain in the ignored local testing directory; only reviewed hashes and non-sensitive summaries are retained here.

The older isolation evidence stays unchanged and is checked as historical evidence. This package binds the current extended tests and implementation separately. Full repository typecheck is not green.
