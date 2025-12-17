/**
 * CSV Upload Helper Functions
 * Utilities for parsing and processing Amazon order CSV files
 */

import { cleanPhoneNumber } from './phone-utils';

/**
 * Normalize CSV column names for flexible matching
 * Converts to lowercase and handles hyphens/underscores
 */
export function normalizeColumnName(name: string): string {
  if (!name) return '';
  return name.toLowerCase().trim().replace(/-/g, '_');
}

/**
 * Extract customization URL from CSV row
 * Returns null if not found
 */
export function extractCustomizationUrl(
  row: any,
  headers: string[]
): string | null {
  const urlIndex = findColumnIndex(headers, [
    'customized-url',
    'customized_url',
    'customization-url',
    'customization_url',
    'customizedUrl'
  ]);
  
  if (urlIndex === null) {
    return null;
  }
  
  const url = row[urlIndex]?.toString().trim();
  return url || null;
}

/**
 * Find column index by trying multiple name variations
 * Returns the index of the first matching column, or null if not found
 */
export function findColumnIndex(
  headers: string[],
  targetNames: string[]
): number | null {
  const normalizedHeaders = headers.map(normalizeColumnName);
  
  for (const targetName of targetNames) {
    const normalizedTarget = normalizeColumnName(targetName);
    const index = normalizedHeaders.indexOf(normalizedTarget);
    if (index !== -1) {
      return index;
    }
  }
  
  return null;
}

/**
 * Extract and normalize amazon_order_id from CSV row
 * Returns null if missing or invalid
 */
export function extractAmazonOrderId(
  row: any,
  headers: string[]
): string | null {
  const orderIdIndex = findColumnIndex(headers, [
    'amazon-order-id',
    'amazon_order_id',
    'amazonOrderId',
    'order-id',
    'order_id',
    'orderId'
  ]);
  
  if (orderIdIndex === null) {
    return null;
  }
  
  const orderId = row[orderIdIndex];
  if (!orderId) {
    return null;
  }
  
  // Convert to string and trim (handles numbers, etc.)
  const orderIdStr = String(orderId).trim();
  if (!orderIdStr) {
    return null;
  }
  
  return orderIdStr;
}

/**
 * Build shipping_address JSONB object from CSV row
 * Returns null if required fields are missing
 */
export function buildShippingAddress(
  row: any,
  headers: string[]
): {
  name: string;
  address_line_1: string;
  address_line_2?: string;
  city: string;
  state_code: string;
  postal_code: string;
  country: string;
  phone?: string;
  // Legacy fields for backward compatibility
  address?: string;
  zip?: string;
  state?: string;
} | null {
  // Find required columns
  const addressIndex = findColumnIndex(headers, [
    'ship-address-1',
    'ship_address_1',
    'address1',
    'address',
    'address_line_1'
  ]);
  
  const cityIndex = findColumnIndex(headers, [
    'ship-city',
    'ship_city',
    'city'
  ]);
  
  const stateIndex = findColumnIndex(headers, [
    'ship-state',
    'ship_state',
    'state'
  ]);
  
  const zipIndex = findColumnIndex(headers, [
    'ship-postal-code',
    'ship_postal_code',
    'postal_code',
    'zip',
    'postal-code'
  ]);
  
  // Validate required fields
  if (addressIndex === null || cityIndex === null || stateIndex === null || zipIndex === null) {
    return null;
  }
  
  const address = row[addressIndex]?.toString().trim();
  const city = row[cityIndex]?.toString().trim();
  const state = row[stateIndex]?.toString().trim();
  const zip = row[zipIndex]?.toString().trim();
  
  if (!address || !city || !state || !zip) {
    return null;
  }
  
  // Find optional columns
  const address2Index = findColumnIndex(headers, [
    'ship-address-2',
    'ship_address_2',
    'address2',
    'address_line_2'
  ]);
  
  const countryIndex = findColumnIndex(headers, [
    'ship-country',
    'ship_country',
    'country'
  ]);
  
  const phoneIndex = findColumnIndex(headers, [
    'buyer-phone-number',
    'buyer_phone_number',
    'phone',
    'phone_number'
  ]);
  
  // Find name (prefer recipient-name, fallback to buyer-name)
  const recipientNameIndex = findColumnIndex(headers, [
    'recipient-name',
    'recipient_name',
    'ship-to-name',
    'ship_to_name'
  ]);
  
  const buyerNameIndex = findColumnIndex(headers, [
    'buyer-name',
    'buyer_name',
    'buyerName'
  ]);
  
  const nameIndex = recipientNameIndex !== null ? recipientNameIndex : buyerNameIndex;
  const name = nameIndex !== null ? row[nameIndex]?.toString().trim() : '';
  
  // Build shipping address object with expected field names for n8n workflow validation
  const shippingAddress: any = {
    name: name || undefined,
    address_line_1: address, // Expected by n8n workflow validation
    city: city,
    state_code: state, // Expected by n8n workflow validation
    postal_code: zip, // Expected by n8n workflow validation
    country: countryIndex !== null ? row[countryIndex]?.toString().trim() || 'US' : 'US',
    // Legacy fields for backward compatibility
    address: address,
    zip: zip,
    state: state
  };
  
  // Add optional fields if present
  if (address2Index !== null && row[address2Index]) {
    const address2 = row[address2Index]?.toString().trim();
    if (address2) {
      shippingAddress.address_line_2 = address2; // Expected field name
      shippingAddress.address2 = address2; // Legacy field name
    }
  }
  
  if (phoneIndex !== null && row[phoneIndex]) {
    const rawPhone = row[phoneIndex]?.toString().trim();
    if (rawPhone) {
      // Clean phone number to remove extensions (Lulu API doesn't accept extensions)
      // Import at top of file would be better, but this works for now
      const { cleanPhoneNumber } = require('@/lib/phone-utils');
      const cleanedPhone = cleanPhoneNumber(rawPhone);
      if (cleanedPhone) {
        shippingAddress.phone = cleanedPhone;
        shippingAddress.phone_number = cleanedPhone; // Also store as phone_number for consistency
      }
    }
  }
  
  return shippingAddress;
}

/**
 * Extract customer name from CSV row
 * Prefers recipient-name, falls back to buyer-name
 */
export function extractCustomerName(
  row: any,
  headers: string[]
): string | null {
  const recipientNameIndex = findColumnIndex(headers, [
    'recipient-name',
    'recipient_name',
    'ship-to-name',
    'ship_to_name'
  ]);
  
  const buyerNameIndex = findColumnIndex(headers, [
    'buyer-name',
    'buyer_name',
    'buyerName'
  ]);
  
  const nameIndex = recipientNameIndex !== null ? recipientNameIndex : buyerNameIndex;
  
  if (nameIndex === null) {
    return null;
  }
  
  const name = row[nameIndex]?.toString().trim();
  return name || null;
}

/**
 * Extract customer email from CSV row
 */
export function extractCustomerEmail(
  row: any,
  headers: string[]
): string | null {
  const emailIndex = findColumnIndex(headers, [
    'buyer-email',
    'buyer_email',
    'buyerEmail',
    'email'
  ]);
  
  if (emailIndex === null) {
    return null;
  }
  
  const email = row[emailIndex]?.toString().trim();
  return email || null;
}

/**
 * Validate CSV headers contain required columns
 * Returns validation result with list of missing columns
 */
export function validateCsvHeaders(headers: string[]): {
  valid: boolean;
  missing: string[];
} {
  const requiredColumns = [
    ['amazon-order-id', 'amazon_order_id', 'amazonOrderId', 'order-id'],
    ['ship-address-1', 'ship_address_1', 'address1', 'address'],
    ['ship-city', 'ship_city', 'city'],
    ['ship-state', 'ship_state', 'state'],
    ['ship-postal-code', 'ship_postal_code', 'postal_code', 'zip']
  ];
  
  const missing: string[] = [];
  
  for (const columnVariations of requiredColumns) {
    const found = findColumnIndex(headers, columnVariations);
    if (found === null) {
      missing.push(columnVariations[0]); // Use first variation as the "canonical" name
    }
  }
  
  return {
    valid: missing.length === 0,
    missing
  };
}

