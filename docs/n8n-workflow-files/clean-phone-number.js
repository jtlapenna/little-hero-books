// Clean phone number for Lulu API
// Strips extensions and normalizes format
// Lulu API doesn't accept phone numbers with extensions like "ext. 02924"

function cleanPhoneNumber(phone) {
  if (!phone) return null;
  
  // Convert to string
  let cleaned = String(phone).trim();
  
  // Remove common extension patterns:
  // - "ext. 02924" or "ext 02924"
  // - "extension 02924" or "extension: 02924"
  // - "x 02924" or "x02924"
  // - "ext: 02924" or "ext:02924"
  // Case insensitive, with or without spaces/colons
  cleaned = cleaned.replace(/\s*(ext|extension|x)[\s:\.]*\d+/gi, '');
  
  // Remove any trailing whitespace
  cleaned = cleaned.trim();
  
  // If empty after cleaning, return null
  if (!cleaned) return null;
  
  return cleaned;
}

// Example usage in n8n Code node:
// const phone = cleanPhoneNumber(order.shipping_address?.phone || order.shipping_address?.phone_number);
// const phone_number = phone || '+1-678-478-3477'; // Company fallback

