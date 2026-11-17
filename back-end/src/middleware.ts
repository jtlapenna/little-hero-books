import { NextRequest, NextResponse } from 'next/server';
import { withBackendAccess } from './lib/access-boundary';

export async function middleware(request: NextRequest) {
  // Preserve refreshed request cookies and every outgoing cookie, just as the outer Pages wrapper does.
  return withBackendAccess(request, async forwarded => NextResponse.next({ request: { headers: forwarded.headers } }));
}

export const config = { matcher: ['/:path*'] };
