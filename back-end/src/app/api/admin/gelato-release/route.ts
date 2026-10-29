import { requireAdminAuth } from '@/lib/admin-auth';
import { createOrdinaryReleaseHttpHandler } from '@/lib/books/gelato-ordinary-release-application';
import { ordinaryReleaseApplicationRuntime } from '@/lib/books/gelato-ordinary-release-runtime';

export const dynamic = 'force-dynamic';
export const POST = createOrdinaryReleaseHttpHandler({ authenticate: requireAdminAuth, runtime: ordinaryReleaseApplicationRuntime });
