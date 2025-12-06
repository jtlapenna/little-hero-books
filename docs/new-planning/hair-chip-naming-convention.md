# Hair Chip Naming Convention

## Format

**`{hairstyle}-{color-name}.png`**

## Examples

- `afro-blonde.png`
- `curly-short-medium-brown.png`
- `buzz-dark-brown.png`
- `puffy-ponytail-strawberry-blonde.png`
- `side-part-black.png`

## Color Names (Canonical)

These match the color names used in n8n workflows:

1. `blonde` (#D1B26F)
2. `strawberry-blonde` (#E6A273)
3. `light-brown` (#A4754A)
4. `medium-brown` (#7B4B2A)
5. `dark-brown` (#523418)
6. `auburn` (#8B3F2C)
7. `black` (#2B2B2B)
8. `red` (#C25E2E)

## n8n Workflow Usage

In n8n workflows, you can construct the filename using expressions:

```javascript
// If you have hairStyle and hairColor in your JSON:
const hairChipFilename = `${$json.hairStyle}-${$json.hairColor}.png`;

// Full R2 path:
const hairChipR2Key = `book-mvp-simple-adventure/characters/hairstyles/${hairChipFilename}`;

// Public URL:
const hairChipUrl = `${$json.publicR2Url}/${hairChipR2Key}`;
```

## Storage Location

All hair chips are stored at:
```
book-mvp-simple-adventure/characters/hairstyles/
```

## Total Files

17 hairstyles × 8 colors = **136 hair chip files**

## File List Example

```
afro-blonde.png
afro-strawberry-blonde.png
afro-light-brown.png
afro-medium-brown.png
afro-dark-brown.png
afro-auburn.png
afro-black.png
afro-red.png
bun-blonde.png
bun-strawberry-blonde.png
...
```

