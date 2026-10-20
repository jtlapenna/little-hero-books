import {verifyBearerAuth} from '@/lib/auth';
import {GelatoIsolationInput,runGelatoIsolation} from '@/lib/books/gelato-isolation';
export const dynamic='force-dynamic';
export async function POST(request:Request){
 const headers={'Cache-Control':'private, no-store'};
 if(!verifyBearerAuth(request).ok)return Response.json({error:'Unauthorized'},{status:401,headers});
 const token=request.headers.get('x-lhl-engineering-token');
 if(!token||!/^[A-Za-z0-9_-]{43,128}$/.test(token))return Response.json({error:'Invalid isolation capability'},{status:401,headers});
 const parsed=GelatoIsolationInput.safeParse(await request.json().catch(()=>null));
 if(!parsed.success)return Response.json({error:'Invalid isolation request'},{status:400,headers});
 try{
  const {gelatoIsolationRuntime}=await import('@/lib/books/gelato-isolation-runtime');
  const result=await runGelatoIsolation(parsed.data,gelatoIsolationRuntime(parsed.data.scopeId,token));
  return Response.json(result,{headers});
 }catch{return Response.json({error:'Isolation operation was not confirmed',customerMessages:false},{status:409,headers});}
}
