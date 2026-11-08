/**
 * Flow-recipe (`lhb.book-render@v2`) release gates. Pure and synchronous: no network, no fs.
 *
 * Gates:
 * 1. Publication: only allow-listed books whose config is `active` may publish a flow order
 *    (`flowPublicationAllowed`).
 * 2. Release: admin stage approvals (preBria, postBria, postPdf, customer) are the release gates. There is
 *    no separate sign-off. A bundled entry with `revokedAt` for a book, version and format is a kill switch
 *    (`hasRecordedFlowReleaseApproval` returns false). Valid unrevoked entries are optional audit stamps.
 *
 * The config checksum is `computeBookConfigChecksum` (sha256 of the canonical JSON with object keys
 * sorted by `localeCompare`), so key order in the source file never changes it, but any value edit does.
 */
import { createHash } from 'node:crypto';
import approvalsJson from './flow-release-approvals.json';
import type { BookConfig } from '@/lib/books/types';
import { computeBookConfigChecksum } from '@/lib/books/runtime-book-config';

export const FLOW_RECIPE_SCHEMA = 'lhb.book-render@v2';
export const FLOW_PUBLICATION_ALLOWLIST: readonly string[] = Object.freeze(['book-finding-our-inner-voice']);

export interface FlowReleaseApprovalEntry {
  bookId: string;
  version: number;
  formatId: string;
  recipeSchema: string;
  configChecksum: string;
  hostedFitReceipt: Record<string, unknown>;
  approvalQuote: string;
  approvedAt: string;
  approver: string;
  approvalReceiptSha256: string;
  revokedAt?: string;
}

export const BUNDLED_APPROVALS: readonly unknown[] = approvalsJson as unknown[];

export function flowPublicationAllowed(config: Pick<BookConfig, 'bookId' | 'status'>): boolean {
  return FLOW_PUBLICATION_ALLOWLIST.includes(config.bookId) && config.status === 'active';
}

export function sha256Hex(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const nonEmpty = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const validIso = (value: unknown): value is string =>
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value) && !Number.isNaN(Date.parse(value));

/** Problems with one entry's shape and traceability. Empty array means valid. */
export function flowReleaseApprovalEntryProblems(entry: unknown): string[] {
  if (!isRecord(entry)) return ['entry is not an object'];
  const problems: string[] = [];
  if (!nonEmpty(entry.bookId)) problems.push('bookId missing');
  if (!Number.isInteger(entry.version) || (entry.version as number) < 1) problems.push('version invalid');
  if (!nonEmpty(entry.formatId)) problems.push('formatId missing');
  if (entry.recipeSchema !== FLOW_RECIPE_SCHEMA) problems.push('recipeSchema must be the flow recipe');
  const checksum = entry.configChecksum;
  if (typeof checksum !== 'string' || !/^[0-9a-f]{64}$/.test(checksum)) problems.push('configChecksum must be 64 hex');
  if (!isRecord(entry.hostedFitReceipt) || Object.keys(entry.hostedFitReceipt).length === 0) problems.push('hostedFitReceipt missing');
  const quote = entry.approvalQuote;
  if (!nonEmpty(quote)) problems.push('approvalQuote empty');
  else if (typeof checksum === 'string' && !quote.includes(checksum.slice(0, 12))) problems.push('approvalQuote does not contain the checksum prefix');
  if (!validIso(entry.approvedAt)) problems.push('approvedAt must be ISO');
  if (!nonEmpty(entry.approver)) problems.push('approver missing');
  if (typeof entry.approvalReceiptSha256 !== 'string' || !/^[0-9a-f]{64}$/.test(entry.approvalReceiptSha256)) problems.push('approvalReceiptSha256 must be 64 hex');
  else if (typeof quote === 'string' && entry.approvalReceiptSha256 !== sha256Hex(quote)) problems.push('approvalReceiptSha256 does not match approvalQuote');
  if (entry.revokedAt !== undefined && !validIso(entry.revokedAt)) problems.push('revokedAt must be ISO when present');
  return problems;
}

/** Problems across a whole approvals list (entries must be an array). Empty array means valid. */
export function flowReleaseApprovalsProblems(approvals: unknown): string[] {
  if (!Array.isArray(approvals)) return ['approvals must be an array'];
  return approvals.flatMap((entry, index) => flowReleaseApprovalEntryProblems(entry).map((problem) => `entry ${index}: ${problem}`));
}

/** The matching unrevoked entry (same rules as `hasRecordedFlowReleaseApproval`), or null. */
export function findFlowReleaseApproval(
  config: BookConfig,
  formatId: string,
  approvals: readonly unknown[] = BUNDLED_APPROVALS,
): FlowReleaseApprovalEntry | null {
  if (!flowPublicationAllowed(config)) return null;
  if (config.rendering.recipe?.schema !== FLOW_RECIPE_SCHEMA) return null;
  if (!Array.isArray(approvals)) return null;
  const checksum = computeBookConfigChecksum(config);
  const match = approvals.find((entry) =>
    isRecord(entry)
    && flowReleaseApprovalEntryProblems(entry).length === 0
    && entry.revokedAt === undefined
    && entry.bookId === config.bookId
    && entry.version === config.version
    && entry.formatId === formatId
    && entry.recipeSchema === FLOW_RECIPE_SCHEMA
    && entry.configChecksum === checksum);
  return (match as FlowReleaseApprovalEntry | undefined) ?? null;
}

/** sha256 of the approvals list as supplied (audit stamp for print inputs). */
export function flowReleaseApprovalsSha256(approvals: readonly unknown[] = BUNDLED_APPROVALS): string {
  return sha256Hex(JSON.stringify(approvals));
}

/**
 * Flow release gate. Admin stage approvals (preBria, postBria, postPdf, customer) are the release gates;
 * there is no separate recipe-level sign-off. True for an allow-listed, active flow-recipe config unless a
 * bundled entry for the same book, version and format has been revoked (explicit kill switch).
 */
export function hasRecordedFlowReleaseApproval(
  config: BookConfig,
  formatId: string,
  approvals: readonly unknown[] = BUNDLED_APPROVALS,
): boolean {
  if (!flowPublicationAllowed(config)) return false;
  if (config.rendering.recipe?.schema !== FLOW_RECIPE_SCHEMA) return false;
  if (!Array.isArray(approvals)) return false;
  const revoked = approvals.some((entry) =>
    isRecord(entry)
    && entry.revokedAt !== undefined
    && entry.bookId === config.bookId
    && entry.version === config.version
    && entry.formatId === formatId);
  return !revoked;
}
