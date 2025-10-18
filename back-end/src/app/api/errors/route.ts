// Error management endpoint
import { NextRequest, NextResponse } from 'next/server';
import { errorHandler, ErrorType, ErrorSeverity } from '@/lib/error-handler';

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const type = url.searchParams.get('type') as ErrorType;
    const severity = url.searchParams.get('severity') as ErrorSeverity;
    const resolved = url.searchParams.get('resolved');
    const limit = url.searchParams.get('limit');

    const filters = {
      type: type || undefined,
      severity: severity || undefined,
      resolved: resolved ? resolved === 'true' : undefined,
      limit: limit ? parseInt(limit) : undefined
    };

    const errors = errorHandler.getErrors(filters);
    const stats = errorHandler.getErrorStats();

    return NextResponse.json({
      errors,
      stats,
      filters
    });
  } catch (error) {
    console.error('Error fetching errors:', error);
    return NextResponse.json(
      { error: 'Failed to fetch errors' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { errorId, resolvedBy } = await request.json();

    if (!errorId || !resolvedBy) {
      return NextResponse.json(
        { error: 'Missing required fields: errorId, resolvedBy' },
        { status: 400 }
      );
    }

    const success = errorHandler.resolveError(errorId, resolvedBy);

    if (!success) {
      return NextResponse.json(
        { error: 'Error not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error resolving error:', error);
    return NextResponse.json(
      { error: 'Failed to resolve error' },
      { status: 500 }
    );
  }
}

