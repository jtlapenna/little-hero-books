# Hometown Default Fix for W3 Story Generation

## Problem

The story generation code in W3 workflows hardcodes `hometown` to `'Grass Valley'` when it's not provided in `characterSpecs`. This should use a more appropriate default or fallback to shipping address city.

## Current Code

In both `w3-PNG_Assembly.json` and `w3-AMAZON-PNG_Assembly.json`, the "Load Story Text" node has:

```javascript
const hometown = order.characterSpecs?.hometown || 'Grass Valley';
```

## Solution

Use shipping address city as a fallback, then a generic default:

```javascript
// Get hometown from characterSpecs, fallback to shipping city, then generic default
const hometown = order.characterSpecs?.hometown 
  || order.orderDetails?.shippingAddress?.city 
  || 'their hometown';
```

## Recommended Default Phrasing

Since the story uses hometown in two places:
1. "It was bedtime in ${hometown}."
2. "They flew through the stars to ${hometown}."

A good default would be:
- **"their hometown"** - More personal and works grammatically
- **"home"** - Simple but might be awkward ("bedtime in home")
- **"a cozy town"** - Generic but fits the story tone

**Recommended:** Use `'their hometown'` as it's personal, grammatically correct, and fits the story's warm, inclusive tone.

## Files to Update

- `docs/n8n-workflow-files/finals/w3-PNG_Assembly.json` - Line ~68 (Load Story Text node)
- `docs/n8n-workflow-files/finals/w3-AMAZON-PNG_Assembly.json` - Line ~68 (Load Story Text node)

## Updated Code

```javascript
// Get hometown with fallback: characterSpecs → shipping city → default
const hometown = order.characterSpecs?.hometown 
  || order.orderDetails?.shippingAddress?.city 
  || 'their hometown';
```

This ensures:
1. If customer provided hometown, use it
2. If not, use shipping city (more personalized than hardcoded)
3. If neither available, use "their hometown" (inclusive, personal default)

