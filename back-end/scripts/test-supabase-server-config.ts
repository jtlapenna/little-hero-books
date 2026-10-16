import assert from 'node:assert/strict';
import { getSupabaseServerConfig } from '../src/lib/supabase-server-config';

const key = ['synthetic', 'private', 'credential'].join('-');
const url = 'https://example.invalid';
const publicName = ['NEXT_PUBLIC_SUPABASE', 'SERVICE_ROLE_KEY'].join('_');
assert.throws(() => getSupabaseServerConfig({ SUPABASE_URL: url, [publicName]: key }),
  /not configured/);
assert.deepEqual(getSupabaseServerConfig({ SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: key }),
  { supabaseUrl: url, supabaseKey: key });
assert.deepEqual(getSupabaseServerConfig({ SUPABASE_URL: url, SUPABASE_SECRET_KEY: key }),
  { supabaseUrl: url, supabaseKey: key });
Object.defineProperty(globalThis, 'window', { configurable: true, value: {} });
try {
  assert.throws(() => getSupabaseServerConfig({ SUPABASE_URL: url, SUPABASE_SECRET_KEY: key }),
    /server-only/);
} finally { Reflect.deleteProperty(globalThis, 'window'); }
console.log('Server Supabase configuration tests passed');
