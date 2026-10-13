import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyBearerAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase-client';
import { downloadManifest } from '@/lib/r2-service';
import { loadPrintRoutingGroupMembers, resolvePrintRoutingRequest } from '@/lib/books/print-routing-endpoint';
import type { PrintRoutingOrder } from '@/lib/books/print-routing';

export const dynamic = 'force-dynamic';
const RequestSchema = z.object({ orderDbIds: z.array(z.number().int().positive()).min(1).max(100) }).strict();

export async function POST(request: NextRequest) {
  const auth = verifyBearerAuth(request);
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  let ids: number[];
  try {
    ids = RequestSchema.parse(await request.json()).orderDbIds;
    if (new Set(ids).size !== ids.length) throw new Error('Duplicate order IDs');
  } catch {
    return NextResponse.json({ error: 'Invalid print routing request' }, { status: 400 });
  }
  try {
    const routes = await resolvePrintRoutingRequest(
      ids,
      async (requestedIds) => {
        const { data, error } = await supabase.from('orders').select('*').in('id', requestedIds);
        if (error) throw new Error('Print order lookup failed');
        return (data ?? []) as PrintRoutingOrder[];
      },
      async (root) => {
        return loadPrintRoutingGroupMembers(root, {
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
        });
      },
      downloadManifest,
    );
    return NextResponse.json({ success: true, routes });
  } catch {
    return NextResponse.json({ error: 'Print routing validation failed' }, { status: 409 });
  }
}
