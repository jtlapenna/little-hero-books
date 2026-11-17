import { createServerClient, parseCookieHeader, serializeCookieHeader, type CookieOptions } from '@supabase/ssr';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { adminIdentityPolicy } from './admin-auth-policy';

const REMEMBER_SECONDS = 30 * 24 * 60 * 60;
type CookieWrite = { name: string; value: string; options: CookieOptions };
type ManagedContext = {
  name: string; remember: boolean; secure: boolean; jar: Map<string, string>; writes: Map<string, CookieWrite>;
  duplicate: boolean; client?: SupabaseClient; verification?: Promise<{ actor: string } | false>;
};
const contexts = new WeakMap<Request, ManagedContext>();
export const managedAdminEnabled = () => process.env.ADMIN_SUPABASE_AUTH_ENABLED === 'true';
function context(request: Request): ManagedContext {
  const existing = contexts.get(request); if (existing) return existing;
  const secure = new URL(request.url).protocol === 'https:';
  const name = secure ? '__Host-lhl-admin' : 'lhl-admin';
  const values = parseCookieHeader(request.headers.get('cookie') ?? '');
  const names = (request.headers.get('cookie') ?? '').split(';').map(cookie => cookie.split('=',1)[0].trim()).filter(cookie => cookie === name || cookie.startsWith(name + '.') || cookie.startsWith(name + '-'));
  const jar = new Map(values.map(cookie => [cookie.name, cookie.value ?? '']));
  const created: ManagedContext = { name, secure, jar, writes: new Map(), duplicate: new Set(names).size !== names.length, remember: jar.get(name + '-remember') === '1' };
  contexts.set(request, created); return created;
}
function write(request: Request, entry: CookieWrite): void {
  const state = context(request), deletion = entry.options.maxAge === 0 || (entry.options.expires instanceof Date && entry.options.expires.getTime() <= Date.now());
  // SSR0.12 overrides cookieOptions.maxAge with400days. Enforce the user's choice at the final writer.
  const options: CookieOptions = { path: entry.name === 'CF_Authorization' && entry.options.path === '/__access_setup' ? '/__access_setup' : '/', httpOnly: true, secure: state.secure, sameSite: 'lax',
    ...(deletion ? { maxAge: 0, expires: new Date(0) } : state.remember ? { maxAge: REMEMBER_SECONDS } : {}),
  };
  state.writes.set(entry.name + '\0' + options.path, { ...entry, options });
  if (deletion) state.jar.delete(entry.name); else state.jar.set(entry.name, entry.value);
  // The Next bundle has a separate module instance: pass refreshed cookies, never a trusted identity header.
  request.headers.set('cookie', [...state.jar].map(([name, value]) => name + '=' + encodeURIComponent(value)).join('; '));
}
export function managedAuthClient(request: Request, remember?: boolean): SupabaseClient {
  const state = context(request); if (remember !== undefined) state.remember = remember;
  if (state.client) return state.client;
  const url = (process.env.SUPABASE_URL ?? '').trim(), key = (process.env.SUPABASE_ANON_KEY ?? '').trim();
  const parsed = new URL(url);
  if (!managedAdminEnabled() || !adminIdentityPolicy() || parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash || !['', '/'].includes(parsed.pathname) || !key || key.startsWith('sb_secret_')) throw Error('Managed sign-in is unavailable');
  if (!key.startsWith('sb_publishable_')) {
    try { if (JSON.parse(atob(key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).role !== 'anon') throw Error(); }
    catch { throw Error('Managed sign-in is unavailable'); }
  }
  state.client = createServerClient(url, key, {
    cookieOptions: { name: state.name, path: '/', httpOnly: true, secure: state.secure, sameSite: 'lax' },
    cookies: {
      getAll: () => [...state.jar].map(([name, value]) => ({ name, value })),
      setAll: entries => {
        for (const entry of entries) write(request, entry);
        if (state.remember && entries.some(entry => entry.value && (entry.name === state.name || entry.name.startsWith(state.name + '.')))) {
          write(request, { name: state.name + '-remember', value: '1', options: {} });
        }
      },
    },
    global: { fetch: async (input, init) => {
      const { cache: _cache, ...options } = init ?? {};
      const headers = new Headers(options.headers); headers.set('Cache-Control', 'no-store');
      return fetch(input, { ...options, headers, redirect: 'manual', signal: AbortSignal.timeout(8000) });
    } },
  });
  return state.client;
}
export function approvedManagedUser(user: User | null | undefined, expectedEmail?: string): string | null {
  const email = user?.email?.toLowerCase(), policy = adminIdentityPolicy();
  if (!user?.id || user.is_anonymous || !email || !user.email_confirmed_at || !Number.isFinite(Date.parse(user.email_confirmed_at)) || !policy?.emails.has(email) || expectedEmail !== undefined && email !== expectedEmail) return null;
  return email;
}
/** null means no managed identity; a present but invalid managed cookie never changes human actors via fallback. */
export async function verifyManagedAdmin(request: Request): Promise<{ actor: string } | false | null> {
  if (!managedAdminEnabled()) return null;
  const state = context(request);
  if (![...state.jar.keys()].some(name => name === state.name || new RegExp('^' + state.name + '\\.\\d+$').test(name))) return null;
  if (state.duplicate) return false;
  state.verification ??= (async () => {
    try { const { data, error } = await managedAuthClient(request).auth.getUser(); const actor = error ? null : approvedManagedUser(data.user); return actor ? { actor } : false; }
    catch { return false; }
  })();
  return state.verification;
}
export function rememberManagedSession(request: Request, remember: boolean): void {
  const state = context(request); state.remember = remember;
  write(request, { name: state.name + '-remember', value: remember ? '1' : '0', options: {} });
  write(request, { name: state.name + '-code-verifier', value: '', options: { maxAge: 0 } });
}
export function clearManagedSession(request: Request, clearAccess = false): void {
  const state = context(request);
  for (const name of new Set([...state.jar.keys(), ...[...state.writes.values()].map(entry => entry.name), state.name, state.name + '-remember', state.name + '-code-verifier'])) {
    if (name === state.name || name.startsWith(state.name + '.') || name.startsWith(state.name + '-')) write(request, { name, value: '', options: { maxAge: 0 } });
  }
  if (clearAccess) clearLocalAccessSession(request);
}
export function clearLocalAccessSession(request: Request): void {
  for (const path of ['/', '/__access_setup']) write(request,{name:'CF_Authorization',value:'',options:{maxAge:0,path}});
}
export function applyManagedCookieUpdates(request: Request, response: Response): Response {
  const state = contexts.get(request); if (!state?.writes.size) return response;
  const headers = new Headers(response.headers);
  for (const entry of state.writes.values()) headers.append('Set-Cookie', serializeCookieHeader(entry.name, entry.value, entry.options));
  headers.set('Cache-Control', 'private, no-store'); headers.set('CDN-Cache-Control', 'no-store');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
