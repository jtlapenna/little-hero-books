import { NextRequest, NextResponse } from 'next/server';

/**
 * Simple in-memory stats tracker for auto-flip endpoint
 * Note: This resets on server restart. For persistent stats, use a database.
 */
const stats = {
  totalRequests: 0,
  successfulFlips: 0,
  noFlipNeeded: 0,
  errors: 0,
  lastRequest: null as string | null,
  lastFlip: null as { characterHash: string; poseNumber: number; timestamp: string } | null,
  recentRequests: [] as Array<{
    timestamp: string;
    characterHash: string;
    poseNumber: number;
    flipped: boolean;
    success: boolean;
  }>,
};

// Keep only last 100 requests
const MAX_RECENT_REQUESTS = 100;

export function recordRequest(characterHash: string, poseNumber: number, flipped: boolean, success: boolean) {
  stats.totalRequests++;
  stats.lastRequest = new Date().toISOString();
  
  if (success) {
    if (flipped) {
      stats.successfulFlips++;
      stats.lastFlip = {
        characterHash,
        poseNumber,
        timestamp: new Date().toISOString(),
      };
    } else {
      stats.noFlipNeeded++;
    }
  } else {
    stats.errors++;
  }
  
  // Add to recent requests
  stats.recentRequests.unshift({
    timestamp: new Date().toISOString(),
    characterHash,
    poseNumber,
    flipped,
    success,
  });
  
  // Keep only recent requests
  if (stats.recentRequests.length > MAX_RECENT_REQUESTS) {
    stats.recentRequests = stats.recentRequests.slice(0, MAX_RECENT_REQUESTS);
  }
}

/**
 * GET /api/check-and-flip-orientation/stats
 * Returns usage statistics for the auto-flip endpoint
 */
export async function GET(request: NextRequest) {
  return NextResponse.json({
    success: true,
    stats: {
      totalRequests: stats.totalRequests,
      successfulFlips: stats.successfulFlips,
      noFlipNeeded: stats.noFlipNeeded,
      errors: stats.errors,
      lastRequest: stats.lastRequest,
      lastFlip: stats.lastFlip,
      recentRequests: stats.recentRequests.slice(0, 20), // Return last 20
      flipRate: stats.totalRequests > 0 
        ? ((stats.successfulFlips / stats.totalRequests) * 100).toFixed(2) + '%'
        : '0%',
    },
    note: 'Stats reset on server restart. For persistent tracking, consider using a database.',
  });
}

