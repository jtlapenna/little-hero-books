/**
 * Little Hero Books - Image Template System
 * 
 * Template-based image system for n8n integration
 * Base backgrounds + character overlays for consistent visual experience
 */

// Base image templates for each page of The Adventure Compass
const IMAGE_TEMPLATES = {
  // Page 1: Finding the compass
  p1: {
    baseBackground: 'compass-discovery.jpg',
    overlayLayers: [
      'child-character-{{HAIR_COLOR}}-{{SKIN_TONE}}.png',
      'compass-{{FAVORITE_COLOR}}-glow.png',
      '{{FAVORITE_COLOR}}-flower.png'
    ],
    textAreas: [
      {
        id: 'main-text',
        x: 50,
        y: 400,
        width: 600,
        height: 150,
        fontSize: 18,
        color: '#2c3e50'
      }
    ]
  },
  
  // Page 2: Enchanted forest path
  p2: {
    baseBackground: 'enchanted-forest.jpg',
    overlayLayers: [
      'child-character-{{HAIR_COLOR}}-{{SKIN_TONE}}.png',
      '{{FAVORITE_ANIMAL}}-companion.png',
      'compass-{{FAVORITE_COLOR}}-glow.png'
    ],
    textAreas: [
      {
        id: 'main-text',
        x: 50,
        y: 400,
        width: 600,
        height: 150,
        fontSize: 18,
        color: '#2c3e50'
      }
    ]
  },
  
  // Page 3: Talking trees and butterflies
  p3: {
    baseBackground: 'talking-trees.jpg',
    overlayLayers: [
      'child-character-{{HAIR_COLOR}}-{{SKIN_TONE}}.png',
      '{{FAVORITE_ANIMAL}}-companion.png',
      'butterflies-{{FAVORITE_COLOR}}.png'
    ],
    textAreas: [
      {
        id: 'main-text',
        x: 50,
        y: 400,
        width: 600,
        height: 150,
        fontSize: 18,
        color: '#2c3e50'
      }
    ]
  },
  
  // Page 4: Mountain with food-shaped clouds
  p4: {
    baseBackground: 'tall-mountain.jpg',
    overlayLayers: [
      'child-character-{{HAIR_COLOR}}-{{SKIN_TONE}}.png',
      '{{FAVORITE_ANIMAL}}-companion.png',
      '{{FAVORITE_FOOD}}-shaped-clouds.png',
      'compass-{{FAVORITE_COLOR}}-glow.png'
    ],
    textAreas: [
      {
        id: 'main-text',
        x: 50,
        y: 400,
        width: 600,
        height: 150,
        fontSize: 18,
        color: '#2c3e50'
      }
    ]
  },
  
  // Page 5: Flying in the sky
  p5: {
    baseBackground: 'sky-flying.jpg',
    overlayLayers: [
      'child-character-{{HAIR_COLOR}}-{{SKIN_TONE}}.png',
      '{{FAVORITE_ANIMAL}}-companion.png',
      '{{FAVORITE_FOOD}}-shaped-clouds.png',
      'compass-{{FAVORITE_COLOR}}-glow.png'
    ],
    textAreas: [
      {
        id: 'main-text',
        x: 50,
        y: 400,
        width: 600,
        height: 150,
        fontSize: 18,
        color: '#2c3e50'
      }
    ]
  },
  
  // Page 6: Magical sea
  p6: {
    baseBackground: 'magical-sea.jpg',
    overlayLayers: [
      'child-character-{{HAIR_COLOR}}-{{SKIN_TONE}}.png',
      '{{FAVORITE_ANIMAL}}-companion.png',
      'dolphins-{{FAVORITE_COLOR}}-glow.png',
      'sparkling-water.png'
    ],
    textAreas: [
      {
        id: 'main-text',
        x: 50,
        y: 400,
        width: 600,
        height: 150,
        fontSize: 18,
        color: '#2c3e50'
      }
    ]
  },
  
  // Page 7: Wise sea turtle
  p7: {
    baseBackground: 'underwater-scene.jpg',
    overlayLayers: [
      'child-character-{{HAIR_COLOR}}-{{SKIN_TONE}}.png',
      '{{FAVORITE_ANIMAL}}-companion.png',
      'wise-sea-turtle.png',
      '{{FAVORITE_COLOR}}-underwater-glow.png'
    ],
    textAreas: [
      {
        id: 'main-text',
        x: 50,
        y: 400,
        width: 600,
        height: 150,
        fontSize: 18,
        color: '#2c3e50'
      }
    ]
  },
  
  // Page 8: Rainbow Garden
  p8: {
    baseBackground: 'rainbow-garden.jpg',
    overlayLayers: [
      'child-character-{{HAIR_COLOR}}-{{SKIN_TONE}}.png',
      '{{FAVORITE_ANIMAL}}-companion.png',
      '{{FAVORITE_COLOR}}-flower-prominent.png',
      'rainbow-lighting.png'
    ],
    textAreas: [
      {
        id: 'main-text',
        x: 50,
        y: 400,
        width: 600,
        height: 150,
        fontSize: 18,
        color: '#2c3e50'
      }
    ]
  },
  
  // Page 9: Garden Guardian
  p9: {
    baseBackground: 'rainbow-garden.jpg',
    overlayLayers: [
      'child-character-{{HAIR_COLOR}}-{{SKIN_TONE}}.png',
      '{{FAVORITE_ANIMAL}}-companion.png',
      'garden-guardian.png',
      '{{FAVORITE_COLOR}}-magical-aura.png'
    ],
    textAreas: [
      {
        id: 'main-text',
        x: 50,
        y: 400,
        width: 600,
        height: 150,
        fontSize: 18,
        color: '#2c3e50'
      }
    ]
  },
  
  // Page 10: Receiving the star
  p10: {
    baseBackground: 'rainbow-garden.jpg',
    overlayLayers: [
      'child-character-{{HAIR_COLOR}}-{{SKIN_TONE}}.png',
      '{{FAVORITE_ANIMAL}}-companion.png',
      '{{FAVORITE_COLOR}}-star-gift.png',
      'magical-gift-scene.png'
    ],
    textAreas: [
      {
        id: 'main-text',
        x: 50,
        y: 400,
        width: 600,
        height: 150,
        fontSize: 18,
        color: '#2c3e50'
      }
    ]
  },
  
  // Page 11: Journey home
  p11: {
    baseBackground: 'journey-home.jpg',
    overlayLayers: [
      'child-character-{{HAIR_COLOR}}-{{SKIN_TONE}}.png',
      '{{FAVORITE_ANIMAL}}-companion.png',
      'compass-{{FAVORITE_COLOR}}-pointing-home.png'
    ],
    textAreas: [
      {
        id: 'main-text',
        x: 50,
        y: 400,
        width: 600,
        height: 150,
        fontSize: 18,
        color: '#2c3e50'
      }
    ]
  },
  
  // Page 12: Back in hometown
  p12: {
    baseBackground: 'hometown-backyard.jpg',
    overlayLayers: [
      'child-character-{{HAIR_COLOR}}-{{SKIN_TONE}}.png',
      '{{FAVORITE_ANIMAL}}-companion.png',
      'compass-{{FAVORITE_COLOR}}-keepsake.png'
    ],
    textAreas: [
      {
        id: 'main-text',
        x: 50,
        y: 400,
        width: 600,
        height: 150,
        fontSize: 18,
        color: '#2c3e50'
      }
    ]
  },
  
  // Page 13: Telling family about adventure
  p13: {
    baseBackground: 'bedroom-scene.jpg',
    overlayLayers: [
      'child-character-{{HAIR_COLOR}}-{{SKIN_TONE}}.png',
      'family-listening.png',
      '{{FAVORITE_COLOR}}-star-nightstand.png'
    ],
    textAreas: [
      {
        id: 'main-text',
        x: 50,
        y: 400,
        width: 600,
        height: 150,
        fontSize: 18,
        color: '#2c3e50'
      }
    ]
  },
  
  // Page 14: Dreaming of new adventures
  p14: {
    baseBackground: 'peaceful-sleeping.jpg',
    overlayLayers: [
      'child-character-{{HAIR_COLOR}}-{{SKIN_TONE}}-sleeping.png',
      '{{FAVORITE_COLOR}}-star-and-compass.png',
      'dreamy-magical-atmosphere.png'
    ],
    textAreas: [
      {
        id: 'main-text',
        x: 50,
        y: 400,
        width: 600,
        height: 150,
        fontSize: 18,
        color: '#2c3e50'
      }
    ]
  }
};

// Cover template
const COVER_TEMPLATE = {
  baseBackground: 'adventure-compass-cover.jpg',
  overlayLayers: [
    'child-character-{{HAIR_COLOR}}-{{SKIN_TONE}}-hero-pose.png',
    'compass-{{FAVORITE_COLOR}}-prominent.png',
    '{{FAVORITE_ANIMAL}}-companion-cover.png',
    'magical-elements-{{FAVORITE_COLOR}}.png'
  ],
  textAreas: [
    {
      id: 'title',
      x: 100,
      y: 200,
      width: 400,
      height: 80,
      fontSize: 32,
      color: '#2c3e50',
      fontWeight: 'bold'
    },
    {
      id: 'child-name',
      x: 100,
      y: 300,
      width: 400,
      height: 60,
      fontSize: 24,
      color: '#8e44ad'
    }
  ]
};

// Dedication page template
const DEDICATION_TEMPLATE = {
  baseBackground: 'dedication-page.jpg',
  overlayLayers: [
    'child-character-{{HAIR_COLOR}}-{{SKIN_TONE}}-happy.png',
    '{{FAVORITE_COLOR}}-decorative-elements.png'
  ],
  textAreas: [
    {
      id: 'dedication-text',
      x: 100,
      y: 300,
      width: 500,
      height: 200,
      fontSize: 20,
      color: '#2c3e50',
      textAlign: 'center'
    }
  ]
};

// Keepsake page template
const KEEPSAKE_TEMPLATE = {
  baseBackground: 'keepsake-page.jpg',
  overlayLayers: [
    'child-character-{{HAIR_COLOR}}-{{SKIN_TONE}}-portrait.png',
    '{{FAVORITE_ANIMAL}}-companion.png',
    'compass-{{FAVORITE_COLOR}}-keepsake.png',
    '{{FAVORITE_COLOR}}-magical-border.png'
  ],
  textAreas: [
    {
      id: 'child-info',
      x: 100,
      y: 400,
      width: 500,
      height: 150,
      fontSize: 18,
      color: '#2c3e50',
      textAlign: 'center'
    }
  ]
};

/**
 * Generate image template for a specific page with personalization
 */
function generateImageTemplate(pageId, personalization) {
  if (!IMAGE_TEMPLATES[pageId]) {
    throw new Error(`Unknown page ID: ${pageId}`);
  }
  
  const template = IMAGE_TEMPLATES[pageId];
  
  // Replace placeholders in overlay layers
  const personalizedLayers = template.overlayLayers.map(layer => 
    replacePlaceholders(layer, personalization)
  );
  
  return {
    pageId: pageId,
    baseBackground: template.baseBackground,
    overlayLayers: personalizedLayers,
    textAreas: template.textAreas,
    personalization: personalization
  };
}

/**
 * Generate cover template with personalization
 */
function generateCoverTemplate(personalization) {
  const personalizedLayers = COVER_TEMPLATE.overlayLayers.map(layer => 
    replacePlaceholders(layer, personalization)
  );
  
  return {
    type: 'cover',
    baseBackground: COVER_TEMPLATE.baseBackground,
    overlayLayers: personalizedLayers,
    textAreas: COVER_TEMPLATE.textAreas,
    personalization: personalization
  };
}

/**
 * Generate dedication page template
 */
function generateDedicationTemplate(personalization) {
  const personalizedLayers = DEDICATION_TEMPLATE.overlayLayers.map(layer => 
    replacePlaceholders(layer, personalization)
  );
  
  return {
    type: 'dedication',
    baseBackground: DEDICATION_TEMPLATE.baseBackground,
    overlayLayers: personalizedLayers,
    textAreas: DEDICATION_TEMPLATE.textAreas,
    personalization: personalization
  };
}

/**
 * Generate keepsake page template
 */
function generateKeepsakeTemplate(personalization) {
  const personalizedLayers = KEEPSAKE_TEMPLATE.overlayLayers.map(layer => 
    replacePlaceholders(layer, personalization)
  );
  
  return {
    type: 'keepsake',
    baseBackground: KEEPSAKE_TEMPLATE.baseBackground,
    overlayLayers: personalizedLayers,
    textAreas: KEEPSAKE_TEMPLATE.textAreas,
    personalization: personalization
  };
}

/**
 * Replace placeholders in image layer names
 */
function replacePlaceholders(text, personalization) {
  let result = text;
  
  for (const [key, value] of Object.entries(personalization)) {
    const placeholder = `{{${key}}}`;
    result = result.replace(new RegExp(placeholder, 'g'), value);
  }
  
  return result;
}

/**
 * Generate all image templates for a complete book
 */
function generateAllImageTemplates(personalization) {
  const templates = {
    cover: generateCoverTemplate(personalization),
    dedication: generateDedicationTemplate(personalization),
    keepsake: generateKeepsakeTemplate(personalization),
    pages: {}
  };
  
  // Generate templates for all 14 story pages
  for (let i = 1; i <= 14; i++) {
    const pageId = `p${i}`;
    templates.pages[pageId] = generateImageTemplate(pageId, personalization);
  }
  
  return templates;
}

// Export for use in n8n workflows
export {
  IMAGE_TEMPLATES,
  COVER_TEMPLATE,
  DEDICATION_TEMPLATE,
  KEEPSAKE_TEMPLATE,
  generateImageTemplate,
  generateCoverTemplate,
  generateDedicationTemplate,
  generateKeepsakeTemplate,
  generateAllImageTemplates
};

// For CommonJS compatibility
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    IMAGE_TEMPLATES,
    COVER_TEMPLATE,
    DEDICATION_TEMPLATE,
    KEEPSAKE_TEMPLATE,
    generateImageTemplate,
    generateCoverTemplate,
    generateDedicationTemplate,
    generateKeepsakeTemplate,
    generateAllImageTemplates
  };
}
