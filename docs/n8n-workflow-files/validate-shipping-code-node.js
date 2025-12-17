// Validate Shipping for w4 - Code Node
// This replaces the IF node validation to support both old and new field name formats
// 
// Instructions:
// 1. Replace the "Validate Shipping for w4" IF node with a Code node
// 2. Use this code in the Code node
// 3. The node should have two outputs: "Has Shipping" (true) and "Missing Shipping" (false)

const shipping = $input.first().json.shipping_address;

// Check if shipping_address exists and is an object
if (!shipping || typeof shipping !== 'object') {
  return {
    json: {
      ...$input.first().json,
      hasShipping: false,
      shippingValidation: {
        status: 'missing',
        reason: 'shipping_address is null or not an object'
      }
    }
  };
}

// Validate required fields - check for BOTH old and new field name formats
const hasAddress = !!(shipping.address_line_1 || shipping.address);
const hasCity = !!shipping.city;
const hasPostalCode = !!(shipping.postal_code || shipping.zip);
const hasState = !!(shipping.state_code || shipping.state);
const hasName = !!shipping.name;

// All required fields must be present (using either old or new format)
const hasShipping = hasAddress && hasCity && hasPostalCode && hasState;

if (hasShipping) {
  // Shipping is valid - route to "Has Shipping" output
  return {
    json: {
      ...$input.first().json,
      hasShipping: true,
      shippingValidation: {
        status: 'valid',
        addressFormat: shipping.address_line_1 ? 'new' : 'old',
        hasName: hasName
      }
    }
  };
} else {
  // Shipping is missing - route to "Missing Shipping" output
  const missingFields = [];
  if (!hasAddress) missingFields.push('address (address_line_1 or address)');
  if (!hasCity) missingFields.push('city');
  if (!hasPostalCode) missingFields.push('postal_code or zip');
  if (!hasState) missingFields.push('state_code or state');
  
  return {
    json: {
      ...$input.first().json,
      hasShipping: false,
      shippingValidation: {
        status: 'missing',
        reason: `Missing required fields: ${missingFields.join(', ')}`,
        missingFields: missingFields
      }
    }
  };
}

