/**
 * Analytics Helper Functions
 * Utilities for processing order data for analytics
 */

/**
 * Determines if an order is a test order or production order
 * Logic: "Is this clearly an Amazon order? If not, it's a test order"
 * 
 * @param orderId - The order ID to check
 * @returns true if test order, false if production (Amazon) order
 */
export function isTestOrder(orderId: string | null | undefined): boolean {
  if (!orderId) return true; // No order ID = test
  
  // Known test patterns
  const testPatterns = [
    /^TEST-/i,
    /^E2E-/i,
    /-TEST/i,
    /^JOHN-TEST/i,
    /^JESSICA-/i,
    // Add more test patterns as needed
  ];
  
  if (testPatterns.some(pattern => pattern.test(orderId))) {
    return true;
  }
  
  // Amazon order ID patterns (production)
  // Typical format: 3 digits, dash, 7 digits, dash, 7 digits
  // Example: 123-4567890-1234567
  const amazonPattern = /^\d{3}-\d{7}-\d{7}$/;
  if (amazonPattern.test(orderId)) {
    return false; // Looks like Amazon order
  }
  
  // If it doesn't match Amazon pattern and isn't a known test pattern,
  // assume it's a test order (safer default)
  return true;
}

/**
 * Extracts book ID from manifest URL or book specs
 * 
 * @param manifestUrl - The one_manifest_url from Supabase (e.g., "book-mvp-simple-adventure/orders/...")
 * @param bookSpecs - The book_specs JSONB object from Supabase
 * @returns The book ID (e.g., "book-mvp-simple-adventure")
 */
export function extractBookId(
  manifestUrl: string | null | undefined,
  bookSpecs: any
): string {
  // Primary: Extract from manifest URL pattern
  if (manifestUrl) {
    // Pattern: "book-mvp-simple-adventure/orders/..."
    const match = manifestUrl.match(/^([^/]+)\//);
    if (match && match[1]) {
      return match[1];
    }
  }
  
  // Fallback: Use book_specs.bookType or project field
  if (bookSpecs) {
    return bookSpecs.bookType || bookSpecs.project || 'unknown';
  }
  
  return 'unknown';
}

/**
 * Formats a date to ISO string for API queries
 */
export function formatDateForQuery(date: Date): string {
  return date.toISOString();
}

/**
 * Gets date range for last N days
 */
export function getLastNDays(n: number): { start: Date; end: Date } {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - n);
  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

/**
 * Groups data by time period
 */
export function groupByTimePeriod(
  data: Array<{ date: string | Date; [key: string]: any }>,
  period: 'day' | 'week' | 'month'
): Record<string, any[]> {
  const grouped: Record<string, any[]> = {};
  
  data.forEach(item => {
    const date = new Date(item.date);
    let key: string;
    
    switch (period) {
      case 'day':
        key = date.toISOString().split('T')[0]; // YYYY-MM-DD
        break;
      case 'week':
        const weekStart = new Date(date);
        weekStart.setDate(date.getDate() - date.getDay()); // Start of week (Sunday)
        key = weekStart.toISOString().split('T')[0];
        break;
      case 'month':
        key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`; // YYYY-MM
        break;
      default:
        key = date.toISOString().split('T')[0];
    }
    
    if (!grouped[key]) {
      grouped[key] = [];
    }
    grouped[key].push(item);
  });
  
  return grouped;
}

