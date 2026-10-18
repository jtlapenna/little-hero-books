import { assertGelatoCustomerApproval } from '@/lib/books/gelato-print-admission';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyBearerAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase-client';
import { downloadManifest } from '@/lib/r2-service';
import { claimGelatoPrintRouting, type GelatoPrintClaim } from '@/lib/books/claim-gelato-print-routing';
import { loadPrintRoutingGroupMembers, resolvePrintRoutingRequest } from '@/lib/books/print-routing-endpoint';
import type { FrozenPrintRouting, PrintRoutingOrder } from '@/lib/books/print-routing';

export const dynamic = 'force-dynamic';
const RequestSchema = z.object({
  orderDbIds: z.array(z.number().int().positive()).min(1).max(100),
  idempotencyKey: z.string().trim().min(1).max(255),
}).strict();

export async function POST(request: NextRequest) {
  const auth = verifyBearerAuth(request);
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const parsed = RequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid print routing claim request' }, { status: 400 });
  if (new Set(parsed.data.orderDbIds).size !== parsed.data.orderDbIds.length) {
    return NextResponse.json({ error: 'Invalid print routing claim request' }, { status: 400 });
  }
  try {
    const loadedRows = new Map<number, PrintRoutingOrder>();
    const routes = await resolvePrintRoutingRequest(
      parsed.data.orderDbIds,
      async (ids) => {
        const { data, error } = await supabase.from('orders').select('*').in('id', ids);
        if (error) throw new Error('Print order lookup failed');
        const rows = (data ?? []) as PrintRoutingOrder[];
        for (const row of rows) loadedRows.set(row.id, row);
        return rows;
      },
      async (root) => loadPrintRoutingGroupMembers(root, {
        byRootOrderId: async (id) => {
          const { data, error } = await supabase.from('orders').select('id,orderId').eq('root_order_id', id);
          if (error) throw new Error('Print group lookup failed');
          return (data ?? []) as Array<{ id: number; orderId: string }>;
        },
        byAmazonOrderId: async (id) => {
          const { data, error } = await supabase.from('orders').select('id,orderId').is('root_order_id', null).eq('amazon_order_id', id);
          if (error) throw new Error('Legacy print group lookup failed');
          return (data ?? []) as Array<{ id: number; orderId: string }>;
        },
        selfRoot: async (id) => {
          const { data, error } = await supabase.from('orders').select('id,orderId')
            .is('root_order_id', null).is('amazon_order_id', null).eq('orderId', id);
          if (error) throw new Error('Root print order lookup failed');
          return (data ?? []) as Array<{ id: number; orderId: string }>;
        },
      }),
      downloadManifest,
    );
    for (const route of routes) {
      if (route.provider === 'gelato') assertGelatoCustomerApproval(loadedRows.get(route.orderDbId)!);
    }
    const result = await claimGelatoPrintRouting(routes, parsed.data.idempotencyKey, async (claimRoutes, idempotencyKey) => {
      const rpc = supabase.rpc as unknown as (
        name: string,
        args: { p_routes: FrozenPrintRouting[]; p_idempotency_key: string },
      ) => Promise<{ data: unknown; error: unknown }>;
      const { data, error } = await rpc('claim_gelato_print_submission', {
        p_routes: claimRoutes,
        p_idempotency_key: idempotencyKey,
      });
      if (error) throw new Error('Gelato print claim failed');
      if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Invalid Gelato print claim response');
      return data as GelatoPrintClaim;
    });
    return NextResponse.json({ success: true, ...result });
  } catch {
    return NextResponse.json({ error: 'Print routing claim rejected' }, { status: 409 });
  }
}
