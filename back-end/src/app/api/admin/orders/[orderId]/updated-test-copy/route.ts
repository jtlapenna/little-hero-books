import { updatedTestCopyResponse } from '@/lib/books/updated-test-book-copy-http';

export const dynamic = 'force-dynamic';
type Params = { params: Promise<{ orderId: string }> };
export const GET = (request: Request, context: Params) => updatedTestCopyResponse(request, context);
export const POST = (request: Request, context: Params) => updatedTestCopyResponse(request, context);
