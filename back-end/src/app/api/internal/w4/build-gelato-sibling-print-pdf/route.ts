import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyBearerAuth } from '@/lib/auth';
import { headObject, getObject, putObject, R2_ORDERS_BUCKET } from '@/lib/r2-client';
import { downloadManifest } from '@/lib/r2-service';
import { getOrderFromSupabase, supabase } from '@/lib/supabase-client';
import { buildGelatoPrintPdf, readGelatoPngResponse } from '@/lib/books/build-gelato-print-pdf';
import { assertW4GelatoPrintInput } from '@/lib/books/w4-gelato-print-input';
import { buildW4SiblingPrintInput } from '@/lib/books/w4-sibling-print-input';
import { assertGelatoPrintOrderRowIdentity } from '@/lib/books/gelato-print-ownership';

export const dynamic = 'force-dynamic';

const ClaimSchema = z.object({ submissionId: z.string().uuid(), claimToken: z.string().uuid() }).strict();
type JsonRecord = Record<string, unknown>;
type PrintSubmissionRow = { id: string; claim_token: string; lease_expires_at: string; request_state: string };
type PrintMembershipRow = { child_order_id: number };
type PrintOrderRow = { print_submission_id: string | null; print_claim_token: string | null; print_provider: string | null };
type PrintQueryResult<T> = { data: T[] | null; error: unknown };
type PrintSingleQueryResult<T> = { data: T | null; error: unknown };
type PrintQuery<T> = PromiseLike<PrintQueryResult<T>> & {
  select(columns: string): PrintQuery<T>;
  eq(column: string, value: unknown): PrintQuery<T>;
  maybeSingle(): Promise<PrintSingleQueryResult<T>>;
};
type PrintDatabase = { from<T>(table: string): PrintQuery<T> };

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function unwrapPayload(value: unknown): JsonRecord | unknown[] | null {
  if (Array.isArray(value)) return value;
  if (!isRecord(value)) return null;
  if (Array.isArray(value.payload)) return value.payload;
  return isRecord(value.payload) ? value.payload : value;
}

export async function POST(request: NextRequest) {
  const auth = verifyBearerAuth(request);
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = unwrapPayload(await request.json().catch(() => null));
  if (!body) return NextResponse.json({ error: 'Request body must be a JSON object or array' }, { status: 400 });
  const claim = ClaimSchema.safeParse(isRecord(body) ? {
    submissionId: body.submissionId,
    claimToken: body.claimToken,
  } : null);
  if (!claim.success) return NextResponse.json({ error: 'Gelato PDF assembly requires a current submission claim' }, { status: 400 });

  try {
    const result = await buildW4SiblingPrintInput(body, {
      loadManifest: downloadManifest,
      loadOrder: getOrderFromSupabase,
      defaultBackendUrl: request.nextUrl.origin,
      expectedProvider: 'gelato',
    });
    if (!result.siblings.length || result.siblings.length !== result.orderIds.length) {
      throw new Error('Gelato sibling PDF assembly requires complete group membership');
    }

    for (const sibling of result.siblings) {
      const printInput = assertW4GelatoPrintInput(sibling);
      if (typeof printInput.orderDbId !== 'number' || !Number.isSafeInteger(printInput.orderDbId) || printInput.orderDbId < 1) {
        throw new Error('Gelato sibling PDF assembly requires persisted order rows');
      }
      const canonicalOrderRow = await getOrderFromSupabase(printInput.orderId);
      assertGelatoPrintOrderRowIdentity(printInput.orderId, printInput.orderDbId, canonicalOrderRow, {
        configVersion: printInput.bookConfigVersion!,
        productUid: printInput.providerPrintConfig.productUid,
        innerPageCount: printInput.providerPrintConfig.innerPageCount,
        apiPageCount: printInput.providerPrintConfig.apiPageCount,
        expectedPdfPageCount: printInput.providerPrintConfig.expectedPdfPageCount,
      });
    }

    const printDb = supabase as unknown as PrintDatabase;
    const [{ data: submission, error: submissionError }, { data: membership, error: membershipError }] = await Promise.all([
      printDb.from<PrintSubmissionRow>('print_provider_submissions').select('id,claim_token,lease_expires_at,request_state').eq('id', claim.data.submissionId).maybeSingle(),
      printDb.from<PrintMembershipRow>('print_provider_submission_items').select('child_order_id').eq('submission_id', claim.data.submissionId),
    ]);
    const leaseExpiresAt = submission?.lease_expires_at ? Date.parse(submission.lease_expires_at) : 0;
    const expectedIds = result.siblings.map((item) => item.orderDbId).filter((id): id is number => Number.isSafeInteger(id) && (id ?? 0) > 0).sort((a, b) => a - b);
    const actualIds = (membership ?? []).map((item) => item.child_order_id).sort((a, b) => a - b);
    if (submissionError || membershipError || !submission || submission.id !== claim.data.submissionId ||
        submission.claim_token !== claim.data.claimToken || submission.request_state !== 'claimed' || leaseExpiresAt <= Date.now() ||
        expectedIds.length !== result.siblings.length || expectedIds.length !== actualIds.length ||
        expectedIds.some((id, index) => id !== actualIds[index])) {
      throw new Error('Gelato sibling PDF assembly claim is stale or does not own the complete group');
    }

    const artifacts = [];
    for (const sibling of result.siblings) {
      const printInput = assertW4GelatoPrintInput(sibling);
      const orderDbId = printInput.orderDbId;
      if (typeof orderDbId !== 'number' || !Number.isSafeInteger(orderDbId) || orderDbId < 1) {
        throw new Error('Gelato sibling PDF assembly requires persisted order rows');
      }
      const assertOwnership = async () => {
        const [{ data: currentSubmission, error: currentSubmissionError }, { data: currentMembership, error: currentMembershipError }, { data: order, error: orderError }] = await Promise.all([
          printDb.from<PrintSubmissionRow>('print_provider_submissions').select('id,claim_token,lease_expires_at,request_state').eq('id', claim.data.submissionId).maybeSingle(),
          printDb.from<PrintMembershipRow>('print_provider_submission_items').select('child_order_id').eq('submission_id', claim.data.submissionId).eq('child_order_id', orderDbId).maybeSingle(),
          printDb.from<PrintOrderRow>('orders').select('print_submission_id,print_claim_token,print_provider').eq('id', orderDbId).maybeSingle(),
        ]);
        const currentLeaseExpiresAt = currentSubmission?.lease_expires_at ? Date.parse(currentSubmission.lease_expires_at) : 0;
        if (currentSubmissionError || currentMembershipError || orderError || !currentSubmission || !currentMembership || !order ||
            currentSubmission.claim_token !== claim.data.claimToken || currentSubmission.request_state !== 'claimed' || currentLeaseExpiresAt <= Date.now() ||
            order.print_submission_id !== claim.data.submissionId || order.print_claim_token !== claim.data.claimToken || order.print_provider !== 'gelato') {
          throw new Error('Gelato sibling PDF assembly claim is stale or does not own this order');
        }
      };
      const artifact = await buildGelatoPrintPdf(printInput, request.nextUrl.origin, {
        loadImage: async (key) => {
          const response = await getObject(R2_ORDERS_BUCKET, key);
          if (!response.ok) throw new Error(`Gelato print image fetch failed (${response.status})`);
          const contentType = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
          if (contentType && contentType !== 'image/png') throw new Error('Gelato print assets must be PNG files');
          return readGelatoPngResponse(response);
        },
        putObject: async (key, stream) => { await putObject(R2_ORDERS_BUCKET, key, stream, 'application/pdf'); },
        headObject: async (key) => (await headObject(R2_ORDERS_BUCKET, key)).ok,
        assertOwnership,
      });
      const { error: receiptError } = await supabase.rpc('register_gelato_print_artifact', {
        p_submission_id: claim.data.submissionId, p_token: claim.data.claimToken, p_order_db_id: orderDbId,
        p_key: artifact.key, p_fingerprint: artifact.sourceFingerprint, p_pdf_page_count: artifact.pageCount,
      });
      if (receiptError) throw new Error('Gelato PDF receipt registration was not confirmed');
      artifacts.push({ orderId: sibling.orderId, orderDbId, ...artifact });
    }
    return NextResponse.json({ success: true, submissionId: claim.data.submissionId, rootGroupId: result.rootGroupId, artifacts });
  } catch (error) {
    const details = error instanceof Error ? error.message : String(error);
    console.error('[Internal W4 Gelato Sibling Print PDF] Error:', error);
    return NextResponse.json({ error: 'Failed to build Gelato sibling print PDFs', details }, { status: 409 });
  }
}
