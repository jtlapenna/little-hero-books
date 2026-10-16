import {NextRequest,NextResponse} from 'next/server';
import {verifyBearerAuth} from '@/lib/auth';
import {EngineeringAutomationInput,runEngineeringAutomation} from '@/lib/books/gelato-engineering-automation';
import {gelatoEngineeringAutomationRuntime} from '@/lib/books/gelato-engineering-automation-runtime';
export const dynamic='force-dynamic';
export async function POST(request:NextRequest) {
 const headers={'Cache-Control':'private, no-store'};
 if(!verifyBearerAuth(request).ok)return NextResponse.json({error:'Unauthorized'},{status:401,headers});
 const input=EngineeringAutomationInput.safeParse(await request.json().catch(()=>null));
 if(!input.success)return NextResponse.json({error:'Exact engineering action and cohort required'},{status:400,headers});
 try{const result=await runEngineeringAutomation(input.data,gelatoEngineeringAutomationRuntime());return NextResponse.json(result,{status:result.completed?200:409,headers});}
 catch{return NextResponse.json({error:'Engineering execution was not confirmed. Inspect exact cohort and close unresolved authorities independently; never replay conversion.'},{status:409,headers});}
}
