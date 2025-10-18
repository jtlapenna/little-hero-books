import { NextRequest, NextResponse } from 'next/server';
import { listR2Objects } from '@/lib/r2-service';

export async function GET(request: NextRequest) {
  try {
    console.log('Debug: Testing R2 connection...');
    
    // Test listing all objects
    const allObjects = await listR2Objects('');
    console.log('Debug: Found objects:', allObjects.length);
    console.log('Debug: Object keys:', allObjects.map(o => o.key));
    
    // Test listing with character prefix
    const characterObjects = await listR2Objects('book-mvp-simple-adventure/order-generated-assets/characters/');
    console.log('Debug: Found character objects:', characterObjects.length);
    console.log('Debug: Character object keys:', characterObjects.map(o => o.key));
    
    return NextResponse.json({
      totalObjects: allObjects.length,
      characterObjects: characterObjects.length,
      allKeys: allObjects.map(o => o.key),
      characterKeys: characterObjects.map(o => o.key)
    });
  } catch (error) {
    console.error('Debug: R2 error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

