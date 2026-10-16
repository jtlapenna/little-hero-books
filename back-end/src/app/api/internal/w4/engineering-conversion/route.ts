import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyBearerAuth } from '@/lib/auth';
import { runEngineeringConversion } from '@/lib/books/gelato-engineering-conversion';
import { gelatoSubmissionStore } from '@/lib/books/gelato-submission-store';
import { gelatoEngineeringConversionRuntime } from '@/lib/books/gelato-engineering-conversion-runtime';

export const dynamic = 'force-dynamic';
const Body=z.object({authorizationId:z.string().uuid(),action:z.enum(['convert','observe'])}).strict();
export async function POST(request: NextRequest) {
  const headers={'Cache-Control':'private, no-store'};
  if(!verifyBearerAuth(request).ok)return NextResponse.json({error:'Unauthorized'},{status:401,headers});
  const parsed=Body.safeParse(await request.json().catch(()=>null));
  if(!parsed.success)return NextResponse.json({error:'Exact engineering authorization and action required'},{status:400,headers});
  try {
    // The authenticated operator stores privateEvidence locally; it is never logged or sent to customer consumers.
    const result=await runEngineeringConversion(parsed.data.authorizationId,parsed.data.action,gelatoEngineeringConversionRuntime());
    return NextResponse.json({success:result.persistenceConfirmed&&result.closureConfirmed,...result},{headers});
  } catch {
    return NextResponse.json({error:'Engineering conversion was not confirmed. Close its authorization independently and observe; never retry conversion.'},{status:409,headers});
  } finally {
    await gelatoSubmissionStore.transition('close_gelato_engineering_conversion',{p_id:parsed.data.authorizationId}).catch(()=>undefined);
  }
}
