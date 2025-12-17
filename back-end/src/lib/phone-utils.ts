/**
 * Phone number utilities for cleaning and normalizing phone numbers
 * Used to ensure phone numbers are compatible with Lulu API requirements
 */

/**
 * Clean phone number by stripping extensions and normalizing format
 * Lulu API doesn't accept phone numbers with extensions like "ext. 02924"
 * 
 * @param phone - Phone number string (may contain extension)
 * @returns Cleaned phone number without extension, or null if invalid
 * 
 * @example
 * cleanPhoneNumber("+1 602-671-6610 ext. 02924") // Returns "+1 602-671-6610"
 * cleanPhoneNumber("+1-678-478-3477") // Returns "+1-678-478-3477"
 * cleanPhoneNumber(null) // Returns null
 */
export function cleanPhoneNumber(phone: string | null | undefined): string | null {
  if (!phone) return null;
  
  // Convert to string and trim
  let cleaned = String(phone).trim();
  
  // Remove common extension patterns:
  // - "ext. 02924" or "ext 02924"
  // - "extension 02924" or "extension: 02924"
  // - "x 02924" or "x02924"
  // - "ext: 02924" or "ext:02924"
  // Case insensitive, with or without spaces/colons/dots
  cleaned = cleaned.replace(/\s*(ext|extension|x)[\s:\.]*\d+/gi, '');
  
  // Remove any trailing whitespace
  cleaned = cleaned.trim();
  
  // If empty after cleaning, return null
  if (!cleaned) return null;
  
  return cleaned;
}

/**
 * Get phone number for Lulu API submission
 * Uses customer phone if available (cleaned), otherwise uses company fallback
 * 
 * @param shippingAddress - Shipping address object with phone/phone_number
 * @param companyFallback - Company phone number to use as fallback (default: +1-678-478-3477)
 * @returns Phone number ready for Lulu API
 */
export function getPhoneNumberForLulu(
  shippingAddress: { phone?: string; phone_number?: string } | null | undefined,
  companyFallback: string = '+1-678-478-3477'
): string {
  if (!shippingAddress) return companyFallback;
  
  const rawPhone = shippingAddress.phone_number || shippingAddress.phone;
  const cleanedPhone = cleanPhoneNumber(rawPhone);
  
  return cleanedPhone || companyFallback;
}

