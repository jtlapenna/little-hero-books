/**
 * Load story text (v2, 14 pages) + ensure characterImages exists
 * UPDATED: Extract pronouns from manifest and dynamically inject into story
 * FIXED: Last page always uses "They" and hometown default is context-aware
 */
const order = $input.first().json || {};
const childName = order.characterSpecs?.childName;
// Hometown: use provided value, or default to "a cozy town" for first instance
const hometown = order.characterSpecs?.hometown || 'a cozy town';
// For last page, if no hometown provided, use "back to their cozy town"
const hometownReturn = order.characterSpecs?.hometown 
  ? `to ${order.characterSpecs.hometown}` 
  : 'back to their cozy town';
if (!childName) throw new Error('Child name required (characterSpecs.childName)');

const BASE_PREFIX = 'book-mvp-simple-adventure/order-generated-assets/characters';
const publicR2Url = order.publicR2Url || null;

// Character hash (required for canonical pose paths)
const hash = order.characterHash || order.orderData?.characterHash;
if (!hash) throw new Error('Missing characterHash in order payload');

// Resolve backendUrl (for proxy asset URLs)
let backendUrl = order.backendUrl;
if (!backendUrl) {
  try {
    const ctx = $items('Extract Manifest URL (3)', 0, $runIndex)?.[0]?.json || {};
    backendUrl = ctx.backendUrl || 'https://admin.littleherolabs.com';
  } catch {
    backendUrl = 'https://admin.littleherolabs.com';
  }
}

// --- PRONOUNS EXTRACTION & MAPPING ---
const pronounsRaw = order.characterSpecs?.pronouns || '';
const pronounsLower = String(pronounsRaw).toLowerCase().trim();

// Map pronouns to subject/object/possessive forms
function getPronounSet(pronounStr) {
  const p = pronounStr.toLowerCase();
  
  // She/her
  if (p.includes('she') || p.includes('girl')) {
    return {
      subject: 'she',      // She ran
      object: 'her',       // with her
      possessive: 'her',   // her eyes
      reflexive: 'herself' // she found herself
    };
  }
  
  // He/him
  if (p.includes('he') || p.includes('boy')) {
    return {
      subject: 'he',       // He ran
      object: 'him',       // with him
      possessive: 'his',   // his eyes
      reflexive: 'himself' // he found himself
    };
  }
  
  // They/them (default)
  return {
    subject: 'they',      // They ran
    object: 'them',       // with them
    possessive: 'their',  // their eyes
    reflexive: 'themselves' // they found themselves
  };
}

const pronouns = getPronounSet(pronounsLower);

// Capitalize first letter (for sentence starts)
const capitalize = (str) => str.charAt(0).toUpperCase() + str.slice(1);
const SubjectCap = capitalize(pronouns.subject);

// --- Animal name + trailType (prefer assets node outputs) ---
const animalSlug = order.animalImages?.slug || String(order.characterSpecs?.animalGuide || '').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
function displayNameFromSlug(slug) {
  if (slug === 't-rex') return 'T-Rex';
  if (!slug) return 'Tiger';
  return slug.charAt(0).toUpperCase() + slug.slice(1);
}
const animalDisplayName = order.animalImages?.displayName || displayNameFromSlug(animalSlug || 'tiger');

// Map trail type for story copy
let trailType = 'footprints';
if (/(t\\s*-\\s*rex|t\\s*rex|trex|dinosaur)/i.test(animalSlug)) {
  trailType = 'giant footprints';
} else if (/(owl|penguin)/i.test(animalSlug)) {
  trailType = 'feathers';
} else if (/unicorn/i.test(animalSlug)) {
  trailType = 'colorful fur';
} else if (/(lion|tiger|dog|cat)/i.test(animalSlug)) {
  trailType = 'paw prints';
}

// --- Story lines (v2) — UPDATED with dynamic pronouns ---
// FIXED: Last page always uses "They" and context-aware hometown return phrase
const lines = [
  `It was bedtime in ${hometown}. ${childName} closed ${pronouns.possessive} eyes and took a soft breath.<br>"Let's take a dream-walk," a quiet voice whispered.`,
  `Outside, the night sparkled with stars.<br>"Look up," the voice said. "Pause. Breathe. Listen."`,
  `A glowing door opened.<br>"When we listen to our own quiet, new worlds begin to whisper back."`,
  `${childName} floated among the stars.<br>"This is a place your quiet made," the voice whispered.<br>"Whenever the day feels too much, breathe and visit again."`,
  `${childName} noticed a trail of ${trailType} and felt a tiny yes inside.<br>"You can follow me anytime," the voice said. Listening helps you find the way.`,
  `Wind whooshed as ${childName} ran, light and quick.<br>"Listening brings courage," the voice said. "It can feel like joy."`,
  `A wide view appeared.<br>"Sometimes it helps to stop and see how far you've come," the voice said.`,
  `Lunch was waiting."Hungry? Let's eat," the voice said.<br> "Being kind to your body is listening, too."`,
  `"When you look closely, you can find beautiful things," the voice said.<br>${childName} paused and found a shining shell.`,
  `A crystal cave glimmered.<br>"Small steps. Watch where your feet go," the voice said. "Careful can be brave."`,
  `Giant flowers stretched overhead. ${childName} gasped in surprise.<br>"You'll be amazed by what you can grow," the voice said.`,
  `The voice felt very close now, and a trail led deeper between the trees.<br>"To hear me clearly, go quiet inside," it said. "That quiet is your heart."`,
  `${animalDisplayName} stepped from the light, warm and bright.<br>"I've been with you the whole time," said ${animalDisplayName}. "I am your quiet inside voice."`,
  `"Ready to fly home?" asked ${animalDisplayName}. They whooshed through the stars ${hometownReturn}.<br>"Wherever you go—pause, breathe, listen—I'm always with you."`
];

const storyTexts = lines.map((text, i) => ({
  pageNumber: i + 1,
  text,
  characterName: childName,
  hometown,
  animalGuide: animalDisplayName,
  trailType,
  validated: true,
  // ADDED: Include pronoun info for transparency
  pronouns: pronounsRaw,
  pronounsUsed: pronouns
}));

// --- Pose names for alt/fallbacks ---
const poseNames = [
  'walking','walking-looking-higher','looking','floating',
  'walking-looking-down','jogging','looking','sitting-eating',
  'crouching','crawling-moving-happy','surprised-looking-up','surprised'
];

// --- Ensure processedImages exists (fallback synthesize) ---
let processedImages = Array.isArray(order.processedImages) && order.processedImages.length
  ? order.processedImages
  : Array.from({ length: 12 }, (_, i) => {
      const poseNumber = i + 1;
      const padded = String(poseNumber).padStart(2, '0');
      const fileName = `characters_${hash}_pose${padded}_nobg.png`;
      const r2Path = `${BASE_PREFIX}/${hash}/${fileName}`;
      const publicUrl = publicR2Url ? `${publicR2Url}/${r2Path}` : null;
      return {
        poseNumber,
        fileName,
        r2Path,
        publicUrl,
        briaProcessed: true,
        briaStatus: 'COMPLETED',
        processingError: false,
      };
    });

// --- Ensure characterImages from processedImages (idempotent) ---
if (!order.characterImages || !Array.isArray(order.characterImages.poses)) {
  const poses = processedImages
    .filter(pi => Number.isFinite(Number(pi.poseNumber)) && pi.poseNumber >= 1 && pi.poseNumber <= 12)
    .sort((a, b) => Number(a.poseNumber) - Number(b.poseNumber))
    .map(pi => {
      const poseNum = Number(pi.poseNumber);
      const imagePath = pi.publicUrl || (pi.r2Path ? `${backendUrl}/api/assets/${pi.r2Path}` : null);
      return {
        poseNumber: poseNum,
        poseFilename: poseNames[poseNum - 1] || `pose${String(poseNum).padStart(2, '0')}`,
        imagePath,
        pageNumber: poseNum,
        validated: !pi.processingError,
      };
    });

  order.characterImages = {
    base: `${backendUrl}/api/assets/${BASE_PREFIX}/${hash}/base-character.png`,
    poses,
  };
}

// --- Extract dedicationText from order (preserve from Router payload) ---
let dedicationText = order.dedicationText ?? null;
if (dedicationText === 'null' || dedicationText === '') {
  dedicationText = null;
}

// --- Return merged payload ---
return [{
  json: {
    ...order,
    backendUrl,
    publicR2Url,
    storyTexts,
    processedImages,
    trailType,
    animalDisplayName,
    dedicationText: dedicationText,
    // ADDED: Pass through pronouns for debugging/transparency
    pronounsExtracted: pronounsRaw,
    pronounsResolved: pronouns
  }
}];

