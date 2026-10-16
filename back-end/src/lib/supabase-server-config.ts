/** Privileged Supabase credentials are read only by server code. */
export function getSupabaseServerConfig(
  env: Record<string, string | undefined> = process.env,
): { supabaseUrl: string; supabaseKey: string } {
  if (typeof window !== 'undefined') {
    throw new Error('Privileged Supabase access is server-only');
  }
  const supabaseUrl = (env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
  const supabaseKey = (env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Server Supabase credentials are not configured');
  }
  return { supabaseUrl, supabaseKey };
}
