import { NextRequest, NextResponse } from 'next/server';
import { authorizeBackendBoundary, cleanBoundaryHeaders, newBoundaryRequestId } from './lib/access-boundary';

export async function middleware(request: NextRequest) {
  const requestId = newBoundaryRequestId();
  const headers = cleanBoundaryHeaders(request.headers);
  headers.set('x-request-id', requestId);
  const rejection = await authorizeBackendBoundary(request);
  const response = rejection ?? NextResponse.next({ request: { headers } });
  response.headers.set('x-request-id', requestId);
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}

export const config = { matcher: ['/:path*'] };
