export const FROZEN_PRINT_FIELDS = [
  'print_provider',
  'print_config_version',
  'print_product_uid',
  'print_inner_page_count',
  'print_api_page_count',
  'print_expected_pdf_page_count',
  'print_book_id',
  'print_format_id',
  'print_manifest_key',
] as const;

export function assertPrintAssignmentCompatible(
  existing: Record<string, unknown>,
  incoming: Record<string, unknown>,
): void {
  for (const field of FROZEN_PRINT_FIELDS) {
    if (Object.hasOwn(incoming, field) && existing[field] != null && existing[field] !== incoming[field]) {
      throw new Error(`Frozen print assignment mismatch: ${field}`);
    }
  }
}
