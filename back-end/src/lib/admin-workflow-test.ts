/** Server-owned CSV admission. This permits generation/preparation, never provider creation or payment. */
export const ADMIN_WORKFLOW_TEST_MARKER = '_admin_workflow_test';
export const ADMIN_WORKFLOW_TEST_FORM_FIELD = 'admin_workflow_test';
export type AdminWorkflowTestAdmission = {
  schema: 'lhb.admin-workflow-test@v1'; createdBy: string; createdAt: string;
  bookId: 'book-finding-our-inner-voice'; formatId: 'amazon'; configVersion: number;
  preparePrintRequestedAt?: string;
};
function record(value: unknown): Record<string, unknown> | null {
  if (typeof value === 'string') { try { return record(JSON.parse(value)); } catch { return null; } }
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
export function createAdminWorkflowTestAdmission(actor: string, version: number, now = new Date()): AdminWorkflowTestAdmission {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(actor) || !Number.isSafeInteger(version) || version < 2) throw Error('Invalid workflow-test admission');
  return { schema: 'lhb.admin-workflow-test@v1', createdBy: actor.toLowerCase(), createdAt: now.toISOString(), bookId: 'book-finding-our-inner-voice', formatId: 'amazon', configVersion: version };
}
/** Untrusted/machine upserts may preserve an existing admission, never mint one. */
export function stripAdminWorkflowTestAdmission(value: unknown): unknown {
  const info = record(value);
  if (!info || !Object.hasOwn(info, ADMIN_WORKFLOW_TEST_MARKER)) return value;
  const { [ADMIN_WORKFLOW_TEST_MARKER]: _removed, ...rest } = info;
  return rest;
}
export function hasAdminWorkflowTestMarker(value: unknown): boolean {
  const info = record(record(value)?.product_info);
  return Boolean(info && Object.hasOwn(info, ADMIN_WORKFLOW_TEST_MARKER));
}
export function adminWorkflowTestAdmission(value: unknown): AdminWorkflowTestAdmission | null {
  const row = record(value), info = record(row?.product_info), admission = record(info?.[ADMIN_WORKFLOW_TEST_MARKER]);
  if (info?._overnight_test !== true || info?._created_via_csv !== true || !admission || admission.schema !== 'lhb.admin-workflow-test@v1' ||
      typeof admission.createdBy !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(admission.createdBy) ||
      typeof admission.createdAt !== 'string' || !Number.isFinite(Date.parse(admission.createdAt)) ||
      admission.bookId !== 'book-finding-our-inner-voice' || admission.formatId !== 'amazon' ||
      !Number.isSafeInteger(admission.configVersion) || Number(admission.configVersion) < 2) return null;
  if (info._sibling_order === true || Number(info._quantity_unit_count ?? 1) !== 1 || Number(row?.quantity ?? info.quantity ?? 1) !== 1) return null;
  if (row?.one_manifest_url || row?.print_book_id != null) {
    if (row.print_provider !== 'gelato' || row.print_book_id !== admission.bookId || row.print_format_id !== admission.formatId || row.print_config_version !== admission.configVersion) return null;
  } else {
    const selection = record(row?.book_specs) ?? record(info.book_specs) ?? record(info.bookSpecs);
    if (!selection || selection.bookId !== admission.bookId || selection.formatId !== admission.formatId || selection.configVersion !== admission.configVersion) return null;
  }
  return admission as AdminWorkflowTestAdmission;
}
export function adminWorkflowTestMayRoute(value: unknown): boolean {
  const admission = adminWorkflowTestAdmission(value), row = record(value);
  if (!admission || !row) return false;
  const next = String(row.next_workflow ?? ''), current = String(row.current_workflow ?? '');
  if (current && !['0', '1', '2A', '2B', '3'].includes(current)) return false;
  if (['0', '1', '2A', '2B', '3'].includes(next)) return true;
  if (!next && !current && row.execution_status === 'pending_w0' && !row.one_manifest_url) return true;
  if (!next && !current && row.workflow_step === 'order_intake' && row.one_manifest_url && !row.manifest_2a_url) return true;
  const reviews = record(row.review_stages);
  return next === '4' && current === '' && row.print_provider === 'gelato' &&
    typeof admission.preparePrintRequestedAt === 'string' && Number.isFinite(Date.parse(admission.preparePrintRequestedAt)) &&
    row.customer_approval_status === 'approved' && record(reviews?.postPdf)?.status === 'approved' &&
    !row.print_submission_id && !row.gelato_order_id;
}

export function adminWorkflowTestPreparationRequested(value: unknown): boolean {
  const admission = adminWorkflowTestAdmission(value), row = record(value), reviews = record(row?.review_stages);
  return Boolean(admission && typeof admission.preparePrintRequestedAt === 'string' && Number.isFinite(Date.parse(admission.preparePrintRequestedAt)) &&
    row?.customer_approval_status === 'approved' && record(reviews?.postPdf)?.status === 'approved');
}
