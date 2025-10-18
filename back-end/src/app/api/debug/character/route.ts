import { NextRequest, NextResponse } from 'next/server';
import { getCharacterAssets } from '@/lib/r2-service';

export async function GET(request: NextRequest) {
  try {
    const characterHash = '0ccbbb2ece0d4a46';
    console.log('Debug: Testing character assets for hash:', characterHash);
    
    const assets = await getCharacterAssets(characterHash);
    console.log('Debug: Character assets result:', assets);
    
    return NextResponse.json(assets);
  } catch (error) {
    console.error('Debug: Character assets error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

