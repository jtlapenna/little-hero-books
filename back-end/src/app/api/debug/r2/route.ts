import { NextRequest, NextResponse } from 'next/server';
import { listR2Objects } from '@/lib/r2-service';
import { buildCharacterAssetPrefix, normalizeBookId } from '@/lib/order-paths';

export async function GET(request: NextRequest) {
  try {
    const bookId = normalizeBookId(request.nextUrl.searchParams.get('bookId'));
    const characterPrefix = `${buildCharacterAssetPrefix('__debug__', bookId).replace(/__debug__$/, '')}`;
    console.log('Debug: Testing R2 connection...');
    
    // Test listing all objects
    const allObjects = await listR2Objects('');
    console.log('Debug: Found objects:', allObjects.length);
    console.log('Debug: Object keys:', allObjects.map(o => o.key));
    
    // Test listing with character prefix
    const characterObjects = await listR2Objects(characterPrefix);
    console.log('Debug: Found character objects:', characterObjects.length);
    console.log('Debug: Character object keys:', characterObjects.map(o => o.key));
    
    return NextResponse.json({
      bookId,
      characterPrefix,
      totalObjects: allObjects.length,
      characterObjects: characterObjects.length,
      allKeys: allObjects.map(o => o.key),
      characterKeys: characterObjects.map(o => o.key)
    });
  } catch (error) {
    console.error('Debug: R2 error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown R2 error' },
      { status: 500 },
    );
  }
}
