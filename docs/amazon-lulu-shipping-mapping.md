# Amazon to Lulu Shipping Mapping

## Overview

This document describes how Amazon Custom shipping service levels are mapped to Lulu's shipping options in the Little Hero Books workflow.

## Amazon Shipping Service Levels

Amazon SP-API provides shipping information in two fields:

1. **`ShipmentServiceLevelCategory`**: High-level category
   - `Standard` - 3-5 business days
   - `Expedited` - 2 business days  
   - `Priority` - 1 business day
   - `Overnight` - Next day delivery

2. **`ShipServiceLevel`**: Detailed service level string
   - Examples: `"Std US D2D Dom"`, `"Expedited"`, `"Priority"`, `"Overnight"`

## Lulu Shipping Options

Lulu API supports the following shipping levels:

- **`MAIL`** - Slowest, cheapest, often untraceable (up to 28 days)
- **`PRIORITY_MAIL`** - Trackable, faster than MAIL, widely available
- **`GROUND`** - Trackable (FedEx), faster than MAIL, not available for P.O. Boxes/military addresses
- **`EXPEDITED`** - 2-day delivery, trackable
- **`EXPRESS`** - Overnight delivery, fastest option

## Mapping Logic

The mapping function `mapAmazonShippingToLulu()` converts Amazon shipping to Lulu shipping:

| Amazon Shipping | Lulu Shipping | Notes |
|----------------|---------------|-------|
| `Overnight`, `Priority`, `Express` | `EXPRESS` | Fastest option |
| `Expedited`, `2-Day`, `2DAY` | `EXPEDITED` | 2-day delivery |
| `Standard`, `Std`, `Ground` | `GROUND` | Falls back to `PRIORITY_MAIL` if GROUND unavailable |
| Default/Unknown | `PRIORITY_MAIL` | Safe default (trackable, widely available) |

## Implementation

### Workflow 4: Build Lulu Print Job Payload

The shipping mapping is implemented in the "Build Lulu Print Job Payload" node:

1. **Extract Amazon Shipping**: Checks multiple locations for Amazon shipping info:
   - `order.ShipmentServiceLevelCategory`
   - `order.ShipServiceLevel`
   - `manifest.order.ShipmentServiceLevelCategory`
   - `manifest.order.ShipServiceLevel`

2. **Map to Lulu**: Uses `mapAmazonShippingToLulu()` to convert Amazon shipping to Lulu shipping level

3. **Fallback**: If no Amazon shipping found, uses `printOptions.shippingLevel` or `CONFIG.defaults.shippingLevel` (defaults to `PRIORITY_MAIL`)

### Data Flow

```
Amazon Order (SP-API)
  ↓
1-manifest.json (stored in R2)
  ↓
Workflow 4: Hydrate Order Details
  ↓
Workflow 4: Build Lulu Print Job Payload
  ↓ (extracts Amazon shipping, maps to Lulu)
Lulu Print Job Submission
```

## Storage

Amazon shipping information should be stored in:

1. **Supabase `orders` table**: 
   - Consider adding `amazon_shipment_service_level` column to track original Amazon shipping preference
   - Currently stored in `order_details` JSONB field

2. **1-manifest.json**: 
   - Stored in `order.ShipmentServiceLevelCategory` or `order.ShipServiceLevel`
   - Persisted for audit trail

## Fallback Strategy

If GROUND shipping is not available (e.g., P.O. Box, military address, product configuration), the workflow should:

1. Try GROUND first (if mapped from Amazon Standard)
2. If GROUND fails, fallback to PRIORITY_MAIL
3. Log the fallback for monitoring

## Testing

To test the mapping:

1. Create test orders with different Amazon shipping levels:
   - Standard → Should map to GROUND (or PRIORITY_MAIL if GROUND unavailable)
   - Expedited → Should map to EXPEDITED
   - Priority → Should map to EXPRESS
   - Overnight → Should map to EXPRESS

2. Verify the correct Lulu shipping level is used in print job submission

3. Monitor for GROUND failures and PRIORITY_MAIL fallbacks

## Future Enhancements

1. **Query Lulu Shipping Options**: Before submitting, query `/shipping-options/` endpoint to check available options for the specific product/destination
2. **Dynamic Mapping**: Adjust mapping based on actual Lulu availability
3. **Customer Communication**: Notify customers if shipping method was downgraded due to availability

