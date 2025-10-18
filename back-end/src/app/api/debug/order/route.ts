import { NextRequest, NextResponse } from 'next/server';
import { getOrderById } from '@/lib/mock-data';

export async function GET(request: NextRequest) {
  try {
    const orderId = 'book-001-20250116-0ccbbb';
    console.log('Debug: Testing order lookup for ID:', orderId);
    
    const order = getOrderById(orderId);
    console.log('Debug: Order found:', !!order);
    console.log('Debug: Order data:', order);
    
    return NextResponse.json({ found: !!order, order });
  } catch (error) {
    console.error('Debug: Order lookup error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

