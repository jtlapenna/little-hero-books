# W2A Deactivation Investigation Notes

- Public `n8n` API exposes current workflow state and executions, but not workflow audit/history for activation changes.
- `n8n` later confirmed the operational cause by email: `w2A-Orchestrator` was being auto-deactivated due to repeated crashes.
- Comparing live backups shows the suspicious flips are activation-only state changes:
  - `versionId` stays constant
  - `updatedAt` stays constant
  - `activeVersionId` flips between `null` and the current `versionId`
  - `versionCounter` increments
- That isolates the change to publish/activation state, not a workflow-content edit.
- Repo search did not find any normal app path or workflow export that deactivates `HduzTWm0ekmrvwrn`.
- Direct `psql` access to the configured `n8n` Postgres host timed out from this environment, so historical attribution is still blocked.
- The crash remediation changed the live and repo `W2A` entrypoint from `responseMode = responseNode` plus `Respond to Webhook (Ack)` to `responseMode = onReceived` with the webhook routed directly to `Normalize Router Payload`.
- After that live patch, a malformed smoke probe against `2a-start-repo` produced execution `33992` with status `error` instead of another `crashed` execution, which is the expected behavior for a bad payload and strongly suggests the repeated crash path was in the webhook-response entrypoint itself.
- Use `npm --prefix back-end run watch:w2a-activation -- --duration-minutes 240 --until-change` to capture the next flip with recent execution context.
