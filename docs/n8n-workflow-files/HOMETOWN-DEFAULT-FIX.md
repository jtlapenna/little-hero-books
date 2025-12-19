# Hometown Default Fix for W3 Story Generation

## Problem

The story generation code in W3 workflows hardcodes `hometown` to `'Grass Valley'` when it's not provided in `characterSpecs`. This should use a more appropriate default or fallback to shipping address city.

## Current Code

In both `w3-PNG_Assembly.json` and `w3-AMAZON-PNG_Assembly.json`, the "Load Story Text" node has:

```javascript
const hometown = order.characterSpecs?.hometown || 'Grass Valley';
```

## Solution

Use a generic default that works for any location and fits the story text:

```javascript
// Get hometown from characterSpecs, fallback to generic default
const hometown = order.characterSpecs?.hometown || 'a cozy town';
```

## Recommended Default Phrasing

Since the story uses hometown in two places:
1. "It was bedtime in ${hometown}."
2. "They flew through the stars to ${hometown}."

A good generic default would be:
- **"a cozy town"** - Generic, works grammatically, fits the warm story tone
- **"a quiet town"** - Alternative generic option
- **"their hometown"** - More personal but still generic

**Recommended:** Use `'a cozy town'` as it:
- Works grammatically in both contexts ("bedtime in a cozy town", "flew through the stars to a cozy town")
- Is generic enough for any location
- Fits the warm, comforting tone of the story
- Doesn't assume shipping address (which may differ from actual hometown)

## Files to Update

- `docs/n8n-workflow-files/finals/w3-PNG_Assembly.json` - Line ~68 (Load Story Text node)
- `docs/n8n-workflow-files/finals/w3-AMAZON-PNG_Assembly.json` - Line ~68 (Load Story Text node)

## Updated Code

```javascript
// Get hometown with fallback: characterSpecs → generic default
const hometown = order.characterSpecs?.hometown || 'a cozy town';
```

This ensures:
1. If customer provided hometown, use it
2. If not, use "a cozy town" (generic, works for any location, fits story tone)

