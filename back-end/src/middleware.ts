// Next.js middleware for error handling and request context
import { NextRequest, NextResponse } from 'next/server';
import { errorHandler, ErrorType, ErrorSeverity } from './lib/error-handler';

export function middleware(request: NextRequest) {
  // Add request ID for tracking
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  // Add request ID to headers for API routes to use
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-request-id', requestId);

  // Create response with request ID
  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  // Add request ID to response headers for debugging
  response.headers.set('x-request-id', requestId);

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    '/((?!_next/static|_next/image|favicon.ico|public).*)',
  ],
};

