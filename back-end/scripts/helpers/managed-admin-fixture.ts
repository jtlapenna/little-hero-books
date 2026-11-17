/** Synthetic Auth server fixture; never imports credentials or contacts a live service. */
import { SignJWT } from 'jose';
export async function managedAdminFixture(emails: string[]) {
  const key = new TextEncoder().encode('synthetic-managed-consumer-fixture-only');
  process.env.ADMIN_SUPABASE_AUTH_ENABLED = 'true';
  process.env.SUPABASE_ANON_KEY = await new SignJWT({ role: 'anon' }).setProtectedHeader({ alg: 'HS256' }).sign(key);
  const users = new Map<string, object>(), cookies = new Map<string, string>();
  for (const [index, email] of emails.entries()) {
    const id = `11111111-1111-4111-8111-${String(index + 1).padStart(12, '0')}`;
    const now = Math.floor(Date.now()/1000);
    const token = await new SignJWT({sub:id,email,exp:now+3600}).setProtectedHeader({alg:'HS256'}).sign(key);
    const user = {id,email,email_confirmed_at:new Date().toISOString(),aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{}};
    users.set(token,user);
    cookies.set(email,'__Host-lhl-admin=base64-'+Buffer.from(JSON.stringify({access_token:token,refresh_token:'synthetic-'+index,expires_at:now+3600,expires_in:3600,token_type:'bearer',user})).toString('base64url'));
  }
  return {
    cookie: (email: string) => { const value=cookies.get(email);if(!value)throw Error('Unknown synthetic actor');return value; },
    response: (request: Request): Response | null => {
      if(new URL(request.url).origin!==process.env.SUPABASE_URL || new URL(request.url).pathname!=='/auth/v1/user')return null;
      const user=users.get((request.headers.get('authorization')??'').replace(/^Bearer /,''));
      return user ? Response.json(user) : Response.json({msg:'Invalid synthetic session'},{status:401});
    },
  };
}
