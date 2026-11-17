import { z } from 'zod';
import { readBoundedRequestText, RequestBodyError } from './request-body';
import { adminIdentityPolicy, humanAdminRequestAllowed } from './admin-auth-policy';
import { adminReturnPath } from './admin-login-target';
import { managedAdminEnabled, managedAuthClient, approvedManagedUser, rememberManagedSession, clearManagedSession, clearLocalAccessSession, applyManagedCookieUpdates } from './admin-managed-auth';

const emailSchema = z.string().trim().toLowerCase().email().max(320);
const codeSchema = z.object({ email: emailSchema, token: z.string().regex(/^\d{6}$/), remember: z.boolean(), returnTo: z.string().max(512).default('/') }).strict();
const requestSchema = z.object({ email: emailSchema }).strict();
function response(request: Request, body: object, status = 200, extra: Record<string,string> = {}): Response {
  return applyManagedCookieUpdates(request,Response.json(body,{status,headers:{'Cache-Control':'private, no-store','CDN-Cache-Control':'no-store','Referrer-Policy':'no-referrer',...extra}}));
}
function trustedBrowser(request: Request): boolean {
  const origin = adminIdentityPolicy()?.origin;
  if (!origin || request.headers.has('authorization') || !humanAdminRequestAllowed(request,origin)) return false;
  const actual = new URL(request.url);
  return actual.origin === origin || process.env.NODE_ENV === 'development' && actual.protocol === 'http:' && ['localhost','127.0.0.1','[::1]'].includes(actual.hostname);
}
export function createAdminSignInHandler(action: 'request' | 'verify' | 'logout') {
  return async function POST(request: Request): Promise<Response> {
    if(!trustedBrowser(request))return response(request,{error:'This sign-in request could not be verified.'},403);
    if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type')??''))return response(request,{error:'Expected a JSON request.'},415);
    try {
      const input:unknown=JSON.parse(await readBoundedRequestText(request,4096));
      if(action==='logout'){
        z.object({}).strict().parse(input);
        if(managedAdminEnabled()) { try { await managedAuthClient(request).auth.signOut({scope:'local'}); } catch { /* Clear this browser even if the provider is unavailable. */ } }
        clearManagedSession(request,true);return response(request,{signedOut:true});
      }
      if(!managedAdminEnabled())return response(request,{error:'Email sign-in is being configured. Please use the existing sign-in for now.'},503);
      if(action==='request'){
        const {email}=requestSchema.parse(input);
        if(!adminIdentityPolicy()?.emails.has(email))return response(request,{sent:true,resendAfter:60});
        const {error}=await managedAuthClient(request).auth.signInWithOtp({email,options:{shouldCreateUser:false}});
        if(error)return response(request,{error:error.status===429?'Please wait a minute before requesting another code.':'Sign-in email is unavailable. Please try again shortly.'},error.status===429?429:503,error.status===429?{'Retry-After':'60'}:{});
        return response(request,{sent:true,resendAfter:60});
      }
      const inputCode=codeSchema.parse(input),target=adminReturnPath(inputCode.returnTo);
      if(!target)return response(request,{error:'Invalid return destination.'},400);
      if(!adminIdentityPolicy()?.emails.has(inputCode.email))return response(request,{error:'That code is invalid or expired. Please try again or request a new code.'},400);
      const client=managedAuthClient(request,inputCode.remember);
      const verified=await client.auth.verifyOtp({email:inputCode.email,token:inputCode.token,type:'email'});
      if(verified.error || !verified.data.session){clearManagedSession(request);return response(request,{error:'That code is invalid or expired. Please try again or request a new code.'},400);}
      const current=await client.auth.getUser();
      if(current.error || !approvedManagedUser(current.data.user,inputCode.email)){clearManagedSession(request);return response(request,{error:'This account does not have admin access.'},403);}
      rememberManagedSession(request,inputCode.remember);clearLocalAccessSession(request);
      return response(request,{authenticated:true,redirectTo:target});
    } catch(error) {
      if(action==='verify')clearManagedSession(request);
      if(error instanceof z.ZodError || error instanceof SyntaxError)return response(request,{error:'Please check the email address and six-digit code.'},400);
      if(error instanceof RequestBodyError)return response(request,{error:'The sign-in request is too large.'},error.status);
      return response(request,{error:'Sign-in is temporarily unavailable. Please try again.'},503);
    }
  };
}
