import { AdminSignIn } from '@/components/ui/admin-sign-in';
import { adminReturnPath } from '@/lib/admin-login-target';
import { managedAdminEnabled } from '@/lib/admin-managed-auth';

export const dynamic = 'force-dynamic';
export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const target = typeof query.returnTo === 'string' ? adminReturnPath(query.returnTo) : '/';
  return <AdminSignIn enabled={managedAdminEnabled()} returnTo={target ?? '/'} signedOut={query.signedOut === '1'} />;
}
