// Build Dynamic Hairstyle Description — per user-selected style
// Placement: put this Code node immediately BEFORE your "Build Base Character Prompt" (or before Prepare Binary if you prefer).
// Output: adds `hairPromptBlock` (string) you can inject into the base character prompt.
// Goal: give the model a clear, style-specific description while keeping BG-removal constraints.

const item = $input.first();
const cs = (item.json && item.json.characterSpecs) || {};

function norm(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9+\-\s]/g, ' ')
    .replace(/\s+/g, ' ') // collapse whitespace
    .trim();
}

// Map synonyms → canonical keys
function canonicalStyle(styleRaw) {
  const s = norm(styleRaw);
  if (!s) return 'generic';
  if (/pony\s*tail|high pony|low pony|side pony/.test(s)) return s.includes('side') ? 'side-ponytail' : 'ponytail';
  if (/space buns|pom\s*poms?|puffs?|double buns?/.test(s)) return 'pom-poms';
  if (/afro\s*puffs?/.test(s)) return 'pom-poms';
  if (/afro/.test(s)) return 'afro';
  if (/buzz|very short/.test(s)) return 'buzz-cut';
  if (/pixie/.test(s)) return 'pixie';
  if (/bob/.test(s)) return 'bob';
  if (/(top\s*knot|high bun)/.test(s)) return 'top-knot';
  if (/bun/.test(s)) return 'bun';
  if (/mohawk/.test(s)) return 'mohawk';
  if (/(locs|dreads|dreadlocks)/.test(s)) return 'locs';
  if (/twists?/.test(s)) return 'twists';
  if (/(box\s*braids|braids?)/.test(s)) return s.includes('double') || /pigtail|two/.test(s) ? 'braids-double' : 'braid-single';
  if (/(pigtails?)/.test(s)) return 'pigtails';
  if (/side\s*part/.test(s)) return 'side-part';
  if (/(curly|curls)/.test(s) && /(short|bob)/.test(s)) return 'curly-short';
  if (/(curly|curls)/.test(s)) return 'curly';
  if (/(long|shoulder|back)/.test(s) && /straight/.test(s)) return 'straight-long';
  if (/straight/.test(s)) return 'straight';
  return 'generic';
}

const color = String(cs.hairColor || '').trim() || 'unspecified';
const styleKey = canonicalStyle(cs.hairStyle);

function buildStyleBlock(key) {
  const base = [`HAIRSTYLE DESCRIPTION — ${key.toUpperCase().replace(/-/g,' ')}`, `Hair color: ${color}`];
  const add = (lines) => base.push(...lines);

  switch (key) {
    case 'ponytail':
      add([
        '- Hair is gathered back into a single ponytail; a visible tie secures it.',
        '- Ponytail sits behind the head/neck; do not place loose strands over the face or shoulders.',
        '- Tail thickness is consistent and reads as one connected mass.'
      ]);
      break;
    case 'side-ponytail':
      add([
        '- Hair is gathered to ONE SIDE into a ponytail; a visible tie secures it.',
        '- Tail drapes over that shoulder; the opposite shoulder remains clear.',
        '- Keep the silhouette continuous and closed.'
      ]);
      break;
    case 'pom-poms': // space buns / puffs
      add([
        '- Two symmetric hair puffs/buns high on left and right sides of the head.',
        '- Clean center part from forehead to crown.',
        '- Each puff is a rounded mass; keep interior texture but avoid gaps/holes.'
      ]);
      break;
    case 'afro':
      add([
        '- Rounded afro silhouette surrounding the head; even radius all around.',
        '- Show texture with tonal variation, not cut-out gaps.',
        '- Maintain a smooth, unified outer edge.'
      ]);
      break;
    case 'locs':
      add([
        '- Hair consists of locs gathered neatly so the overall outline remains continuous.',
        '- Indicate individual locs with internal shading/lines; avoid thin flyaway strands.',
        '- Ends are rounded/tidy; no transparency between locs.'
      ]);
      break;
    case 'twists':
      add([
        '- Rope twists arranged neatly; overall silhouette remains a single connected shape.',
        '- Indicate twist pattern with internal lines; avoid see-through gaps.',
        '- Ends are clean and finished (no frays).' 
      ]);
      break;
    case 'braid-single':
      add([
        '- Single braid gathered behind the head; a visible tie at the end.',
        '- Braid tracks along the back, not over the face.',
        '- Keep the braid within a continuous silhouette with internal plait detail.'
      ]);
      break;
    case 'braids-double':
      add([
        '- Two braids with a clean center part; one on each side.',
        '- Braids fall near the shoulders; visible ties at the ends.',
        '- Outer edges remain smooth and continuous.'
      ]);
      break;
    case 'pigtails':
      add([
        '- Two ponytails at mid-height on left and right sides; visible ties.',
        '- Tails drape near the shoulders without covering the face.',
        '- Ensure both tails form a single, closed silhouette each.'
      ]);
      break;
    case 'bun':
      add([
        '- Hair gathered into a bun at the back of the head.',
        '- Front is tidy with minimal flyaways; bun reads as one solid form.',
        '- No loose strands crossing the face or shoulders.'
      ]);
      break;
    case 'top-knot':
      add([
        '- High bun/knot on the crown; compact, centered.',
        '- Sides pulled up cleanly; overall outline remains continuous.',
        '- No stray wisps around the head.'
      ]);
      break;
    case 'bob':
      add([
        '- Chin-length bob with a gentle curve under.',
        '- Front does not obscure the eyes; edges are smooth and closed.',
        '- Interior texture via tone, not cut-out gaps.'
      ]);
      break;
    case 'pixie':
      add([
        '- Short pixie cut close to the head.',
        '- Sideburns and nape are tidy; fringe is short and controlled.',
        '- Overall silhouette hugs the skull; no spiky flyaways.'
      ]);
      break;
    case 'buzz-cut':
      add([
        '- Very short buzz; hair is a subtle texture atop the scalp.',
        '- Emphasize head shape; show texture with shading, not strands.',
        '- Absolutely no flyaways or transparency.'
      ]);
      break;
    case 'straight-long':
      add([
        '- Long, straight hair falling behind the shoulders and back.',
        '- Keep front clear of the eyes; outer contour remains one smooth shape.',
        '- Minimal layering; avoid stringy separated strands.'
      ]);
      break;
    case 'straight':
      add([
        '- Straight hair with a tidy outline.',
        '- Keep the silhouette continuous; show shine/texture with tone only.',
        '- No individual flyaway lines.'
      ]);
      break;
    case 'curly-short':
      add([
        '- Short curls forming a compact halo around the head.',
        '- Suggest curls with internal shapes; avoid holes through to the background.',
        '- Outline remains smooth and connected.'
      ]);
      break;
    case 'curly':
      add([
        '- Medium/long curls; keep them grouped so the outer edge stays continuous.',
        '- Indicate curl pattern with internal detail; no lace-like gaps.',
        '- Avoid stray corkscrews beyond the silhouette.'
      ]);
      break;
    case 'mohawk':
      add([
        '- Central hair ridge from forehead to nape; sides are very short or trimmed.',
        '- Ridge height consistent; edges crisp; no stray spikes.',
        '- Keep the overall outline closed and readable.'
      ]);
      break;
    case 'side-part':
      add([
        '- Clean side part; hair directed predominantly to one side.',
        '- Front does not cover the eyes; outline remains smooth.',
        '- Internal detail via tone/lines only.'
      ]);
      break;
    default: // generic fallback
      add([
        '- Hair silhouette is a single connected mass with clean, closed edges.',
        '- Keep interior detail with tone/lines; avoid gaps between strands.',
        '- Do not cover facial features unless explicitly requested.'
      ]);
  }

  // BG-removal hygiene (append for all styles)
  base.push('', 'HAIR OUTPUT POLICY (BG-REMOVAL):',
    '- Single, opaque silhouette (connected shape).',
    '- No gaps/holes between strands; no transparency; no halos/outer glows.',
    '- Edges anti-aliased OK, but closed—no pinholes where white shows through.',
    'BACKGROUND: Pure white (#FFFFFF). NO transparency.'
  );

  return base.join('\n');
}

const hairPromptBlock = buildStyleBlock(styleKey);

return [{
  json: {
    ...item.json,
    hairPromptBlock,
    hairPromptMeta: { styleKey, color, promptVersion: 'v1.0' }
  }
}];
