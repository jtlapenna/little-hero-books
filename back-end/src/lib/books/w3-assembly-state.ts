/** Shared completion checkpoint used by ordinary queue admission and W3 replay guard. */
export function hasCompletedW3Assembly(row: { manifest_3_url?: unknown; manifest3Url?: unknown; workflow_step?: unknown; workflowStep?: unknown; execution_status?: unknown; executionStatus?: unknown; status?: unknown } | null): boolean {
  if (!row) return false;
  const manifest = row.manifest_3_url ?? row.manifest3Url;
  return Boolean(typeof manifest === 'string' && manifest.trim() ||
    (row.workflow_step ?? row.workflowStep) === 'book_assembly_completed' || (row.execution_status ?? row.executionStatus) === 'done' && row.status === 'pending_assembly_review');
}
