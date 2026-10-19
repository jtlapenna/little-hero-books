import { NextRequest, NextResponse } from 'next/server';
import { verifyBearerAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase-client';
import { NativePrintQueueInput, runNativePrintQueue } from '@/lib/books/gelato-native-queue';
import { claimPrintRoutingRequest } from '@/lib/books/print-routing-claim-runtime';
import { loadPrintRoutingGroupMembers } from '@/lib/books/print-routing-endpoint';
import type { PrintRoutingOrder } from '@/lib/books/print-routing';
export const dynamic='force-dynamic';
export async function POST(request: NextRequest) {
  const headers={'Cache-Control':'private, no-store'};
  if(!verifyBearerAuth(request).ok)return NextResponse.json({error:'Unauthorized'},{status:401,headers});
  const parsed=NativePrintQueueInput.safeParse(await request.json().catch(()=>null));
  if(!parsed.success)return NextResponse.json({error:'Invalid native print queue request'},{status:400,headers});
  try {
    const result=await runNativePrintQueue(parsed.data,{
      draftsEnabled:process.env.GELATO_DRAFT_SUBMISSION_ENABLED==='true',
      loadOrders:async ids=>{const {data,error}=await supabase.from('orders').select('*').in('id',ids);if(error)throw Error('Queue order lookup failed');return (data??[]) as PrintRoutingOrder[];},
      loadMembers:root=>loadPrintRoutingGroupMembers(root,{
        byRootOrderId:async id=>{const {data,error}=await supabase.from('orders').select('id,orderId').eq('root_order_id',id);if(error)throw Error('Group lookup failed');return data??[];},
        byAmazonOrderId:async id=>{const {data,error}=await supabase.from('orders').select('id,orderId').is('root_order_id',null).eq('amazon_order_id',id);if(error)throw Error('Group lookup failed');return data??[];},
        selfRoot:async id=>{const {data,error}=await supabase.from('orders').select('id,orderId').is('root_order_id',null).is('amazon_order_id',null).eq('orderId',id);if(error)throw Error('Group lookup failed');return data??[];},
      }),
      claim:claimPrintRoutingRequest,
      fence:async (id,token)=>{const {error}=await supabase.rpc('fence_gelato_print_submission',{p_submission_id:id,p_token:token});if(error)throw Error('Fence unconfirmed');return true;},
    });
    return NextResponse.json(result,{headers});
  }catch{return NextResponse.json({error:'Native print queue was not confirmed'},{status:409,headers});}
}
