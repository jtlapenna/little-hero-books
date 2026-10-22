/** Terminal webhooks must outlive their workflow; scope expiry still wins. */
export const GELATO_DIAGNOSTIC_WORKFLOW_SECONDS = 240;
export const GELATO_TERMINAL_WEBHOOK_MS = 250_000;
// Six metadata/readback requests can precede the terminal webhook: 30s + 250s + 10s margin.
export const GELATO_WORKFLOW_OPERATION_MS = 290_000;
export const GELATO_METADATA_REQUEST_MS = 5_000;
// A 200-call adapter can finish at most 12 ten-call observation iterations.
export const GELATO_STATUS_OBSERVATION_ITERATIONS = 12;
