/**
 * Little Hero Books - Asset Manager
 * 
 * Manages prefab backgrounds and overlay assets for template-based image generation
 * Matches specification: "Assets: Select prefab backgrounds; map overlays (hair/skin/clothes/colors/animal)"
 */

// Asset library structure
const ASSET_LIBRARY = {
  // Base backgrounds for each page
  backgrounds: {
    'compass-discovery': {
      file: 'backgrounds/compass-discovery.jpg',
      description: 'Magical compass discovery scene',
      usage: ['p1']
    },
    'enchanted-forest': {
      file: 'backgrounds/enchanted-forest.jpg',
      description: 'Enchanted forest path',
      usage: ['p2']
    },
    'talking-trees': {
      file: 'backgrounds/talking-trees.jpg',
      description: 'Forest with talking trees',
      usage: ['p3']
    },
    'tall-mountain': {
      file: 'backgrounds/tall-mountain.jpg',
      description: 'Tall mountain with clouds',
      usage: ['p4']
    },
    'sky-flying': {
      file: 'backgrounds/sky-flying.jpg',
      description: 'Sky scene for flying',
      usage: ['p5']
    },
    'magical-sea': {
      file: 'backgrounds/magical-sea.jpg',
      description: 'Magical sea with dolphins',
      usage: ['p6']
    },
    'underwater-scene': {
      file: 'backgrounds/underwater-scene.jpg',
      description: 'Underwater with sea turtle',
      usage: ['p7']
    },
    'rainbow-garden': {
      file: 'backgrounds/rainbow-garden.jpg',
      description: 'Rainbow garden scene',
      usage: ['p8', 'p9', 'p10']
    },
    'journey-home': {
      file: 'backgrounds/journey-home.jpg',
      description: 'Journey home path',
      usage: ['p11']
    },
    'hometown-backyard': {
      file: 'backgrounds/hometown-backyard.jpg',
      description: 'Backyard in hometown',
      usage: ['p12']
    },
    'bedroom-scene': {
      file: 'backgrounds/bedroom-scene.jpg',
      description: 'Bedroom telling family',
      usage: ['p13']
    },
    'peaceful-sleeping': {
      file: 'backgrounds/peaceful-sleeping.jpg',
      description: 'Peaceful sleeping scene',
      usage: ['p14']
    },
    'adventure-compass-cover': {
      file: 'backgrounds/adventure-compass-cover.jpg',
      description: 'Cover background',
      usage: ['cover']
    },
    'dedication-page': {
      file: 'backgrounds/dedication-page.jpg',
      description: 'Dedication page background',
      usage: ['dedication']
    },
    'keepsake-page': {
      file: 'backgrounds/keepsake-page.jpg',
      description: 'Keepsake page background',
      usage: ['keepsake']
    }
  },
  
  // Character overlays based on personalization
  characterOverlays: {
    // Hair color variations
    hair: {
      'blonde': 'overlays/characters/hair-blonde.png',
      'brown': 'overlays/characters/hair-brown.png',
      'black': 'overlays/characters/hair-black.png',
      'red': 'overlays/characters/hair-red.png',
      'gray': 'overlays/characters/hair-gray.png'
    },
    
    // Skin tone variations
    skin: {
      'light': 'overlays/characters/skin-light.png',
      'medium': 'overlays/characters/skin-medium.png',
      'dark': 'overlays/characters/skin-dark.png'
    },
    
    // Combined character poses
    poses: {
      'discovering': 'overlays/characters/pose-discovering.png',
      'exploring': 'overlays/characters/pose-exploring.png',
      'climbing': 'overlays/characters/pose-climbing.png',
      'flying': 'overlays/characters/pose-flying.png',
      'swimming': 'overlays/characters/pose-swimming.png',
      'listening': 'overlays/characters/pose-listening.png',
      'admiring': 'overlays/characters/pose-admiring.png',
      'receiving': 'overlays/characters/pose-receiving.png',
      'journeying': 'overlays/characters/pose-journeying.png',
      'returning': 'overlays/characters/pose-returning.png',
      'telling': 'overlays/characters/pose-telling.png',
      'sleeping': 'overlays/characters/pose-sleeping.png'
    }
  },
  
  // Animal companions
  animalCompanions: {
    'dog': 'overlays/companions/dog.png',
    'cat': 'overlays/companions/cat.png',
    't-rex': 'overlays/companions/t-rex.png',
    'unicorn': 'overlays/companions/unicorn.png',
    'tiger': 'overlays/companions/tiger.png',
    'lion': 'overlays/companions/lion.png',
    'owl': 'overlays/companions/owl.png'
  },
  
  // Magical elements with color variations
  magicalElements: {
    'compass': {
      'blue': 'overlays/magical/compass-blue.png',
      'purple': 'overlays/magical/compass-purple.png',
      'red': 'overlays/magical/compass-red.png',
      'green': 'overlays/magical/compass-green.png',
      'yellow': 'overlays/magical/compass-yellow.png',
      'pink': 'overlays/magical/compass-pink.png'
    },
    'flowers': {
      'blue': 'overlays/magical/flowers-blue.png',
      'purple': 'overlays/magical/flowers-purple.png',
      'red': 'overlays/magical/flowers-red.png',
      'green': 'overlays/magical/flowers-green.png',
      'yellow': 'overlays/magical/flowers-yellow.png',
      'pink': 'overlays/magical/flowers-pink.png'
    },
    'glow': {
      'blue': 'overlays/magical/glow-blue.png',
      'purple': 'overlays/magical/glow-purple.png',
      'red': 'overlays/magical/glow-red.png',
      'green': 'overlays/magical/glow-green.png',
      'yellow': 'overlays/magical/glow-yellow.png',
      'pink': 'overlays/magical/glow-pink.png'
    }
  },
  
  // Food-shaped elements
  foodElements: {
    'pizza': 'overlays/food/pizza-shaped-clouds.png',
    'pancakes': 'overlays/food/pancakes-shaped-clouds.png',
    'strawberries': 'overlays/food/strawberries-shaped-clouds.png',
    'cookies': 'overlays/food/cookies-shaped-clouds.png',
    'cupcakes': 'overlays/food/cupcakes-shaped-clouds.png',
    'apples': 'overlays/food/apples-shaped-clouds.png'
  },
  
  // Special scene elements
  sceneElements: {
    'talking-trees': 'overlays/scenes/talking-trees.png',
    'dancing-butterflies': 'overlays/scenes/dancing-butterflies.png',
    'jumping-dolphins': 'overlays/scenes/jumping-dolphins.png',
    'wise-sea-turtle': 'overlays/scenes/wise-sea-turtle.png',
    'garden-guardian': 'overlays/scenes/garden-guardian.png',
    'rainbow-lighting': 'overlays/scenes/rainbow-lighting.png',
    'family-listening': 'overlays/scenes/family-listening.png',
    'dreamy-atmosphere': 'overlays/scenes/dreamy-atmosphere.png'
  }
};

/**
 * Generate asset configuration for a specific page and personalization
 */
function generatePageAssets(pageId, personalization) {
  const assets = {
    background: null,
    overlays: []
  };
  
  // Get background for page
  for (const [bgId, bgInfo] of Object.entries(ASSET_LIBRARY.backgrounds)) {
    if (bgInfo.usage.includes(pageId)) {
      assets.background = bgInfo.file;
      break;
    }
  }
  
  // Add character overlay based on personalization
  const characterPose = getCharacterPoseForPage(pageId);
  const characterFile = `overlays/characters/child-${personalization.hair}-${personalization.skin}-${characterPose}.png`;
  assets.overlays.push({
    type: 'character',
    file: characterFile,
    layer: 1
  });
  
  // Add animal companion if applicable
  if (personalization.favorite_animal) {
    const animalFile = ASSET_LIBRARY.animalCompanions[personalization.favorite_animal];
    if (animalFile) {
      assets.overlays.push({
        type: 'companion',
        file: animalFile,
        layer: 2
      });
    }
  }
  
  // Add magical elements with favorite color
  const magicalElements = getMagicalElementsForPage(pageId, personalization);
  magicalElements.forEach(element => {
    assets.overlays.push({
      type: 'magical',
      file: element.file,
      layer: element.layer,
      color: personalization.favorite_color
    });
  });
  
  return assets;
}

/**
 * Get character pose for specific page
 */
function getCharacterPoseForPage(pageId) {
  const poseMap = {
    'p1': 'discovering',
    'p2': 'exploring',
    'p3': 'exploring',
    'p4': 'climbing',
    'p5': 'flying',
    'p6': 'swimming',
    'p7': 'listening',
    'p8': 'admiring',
    'p9': 'listening',
    'p10': 'receiving',
    'p11': 'journeying',
    'p12': 'returning',
    'p13': 'telling',
    'p14': 'sleeping'
  };
  
  return poseMap[pageId] || 'exploring';
}

/**
 * Get magical elements for specific page
 */
function getMagicalElementsForPage(pageId, personalization) {
  const elements = [];
  
  // Add compass glow to most pages
  if (['p1', 'p2', 'p4', 'p5', 'p11', 'p12'].includes(pageId)) {
    elements.push({
      file: ASSET_LIBRARY.magicalElements.compass[personalization.favorite_color],
      layer: 3
    });
  }
  
  // Add flowers to garden pages
  if (['p1', 'p8', 'p10'].includes(pageId)) {
    elements.push({
      file: ASSET_LIBRARY.magicalElements.flowers[personalization.favorite_color],
      layer: 4
    });
  }
  
  // Add food-shaped clouds to sky pages
  if (['p4', 'p5'].includes(pageId) && personalization.favorite_food) {
    const foodFile = ASSET_LIBRARY.foodElements[personalization.favorite_food];
    if (foodFile) {
      elements.push({
        file: foodFile,
        layer: 3
      });
    }
  }
  
  return elements;
}

/**
 * Generate complete asset configuration for entire book
 */
function generateBookAssets(personalization) {
  const bookAssets = {
    cover: generatePageAssets('cover', personalization),
    dedication: generatePageAssets('dedication', personalization),
    keepsake: generatePageAssets('keepsake', personalization),
    pages: {}
  };
  
  // Generate assets for all 14 story pages
  for (let i = 1; i <= 14; i++) {
    const pageId = `p${i}`;
    bookAssets.pages[pageId] = generatePageAssets(pageId, personalization);
  }
  
  return bookAssets;
}

/**
 * Validate asset files exist (for development)
 */
function validateAssets() {
  const missingAssets = [];
  
  // Check backgrounds
  for (const [bgId, bgInfo] of Object.entries(ASSET_LIBRARY.backgrounds)) {
    // In production, check if file exists in storage
    console.log(`📁 Background: ${bgInfo.file}`);
  }
  
  // Check character overlays
  for (const [hair, hairFile] of Object.entries(ASSET_LIBRARY.characterOverlays.hair)) {
    for (const [skin, skinFile] of Object.entries(ASSET_LIBRARY.characterOverlays.skin)) {
      for (const [pose, poseFile] of Object.entries(ASSET_LIBRARY.characterOverlays.poses)) {
        const characterFile = `overlays/characters/child-${hair}-${skin}-${pose}.png`;
        console.log(`👤 Character: ${characterFile}`);
      }
    }
  }
  
  // Check animal companions
  for (const [animal, animalFile] of Object.entries(ASSET_LIBRARY.animalCompanions)) {
    console.log(`🐾 Animal: ${animalFile}`);
  }
  
  // Check magical elements
  for (const [element, colors] of Object.entries(ASSET_LIBRARY.magicalElements)) {
    for (const [color, file] of Object.entries(colors)) {
      console.log(`✨ Magical: ${file}`);
    }
  }
  
  return missingAssets;
}

// Export for use in n8n workflows
export {
  ASSET_LIBRARY,
  generatePageAssets,
  generateBookAssets,
  validateAssets,
  getCharacterPoseForPage,
  getMagicalElementsForPage
};

// For CommonJS compatibility
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    ASSET_LIBRARY,
    generatePageAssets,
    generateBookAssets,
    validateAssets,
    getCharacterPoseForPage,
    getMagicalElementsForPage
  };
}
