/**
 * Little Hero Books - Template-Based Story System
 * 
 * This system uses a consistent base story with personalization placeholders
 * instead of AI generation for reliable, consistent results.
 */

// Base Adventure Compass Story Template
const ADVENTURE_COMPASS_TEMPLATE = {
  title: "{{CHILD_NAME}} and the Adventure Compass",
  
  pages: [
    {
      id: "p1",
      text: "On a sunny morning in {{HOMETOWN}}, {{CHILD_NAME}} discovers a magical compass hidden under a {{FAVORITE_COLOR}} flower. The compass glows with {{FAVORITE_COLOR}} light and seems to whisper, 'Adventure awaits!' {{CHILD_NAME}} feels excitement bubbling in their heart.",
      illustration_prompt: "watercolor style, warm lighting, child with {{HAIR_COLOR}} hair and {{SKIN_TONE}} skin finding a magical compass under a {{FAVORITE_COLOR}} flower in {{HOMETOWN}}, {{FAVORITE_COLOR}} magical glow"
    },
    {
      id: "p2", 
      text: "{{CHILD_NAME}} picks up the compass and it begins to spin! It points toward an enchanted forest path. 'Come with me, {{CHILD_NAME}}!' says a friendly {{FAVORITE_ANIMAL}} who appears beside them. Together, they step into the magical woods.",
      illustration_prompt: "watercolor style, enchanted forest path, child with {{HAIR_COLOR}} hair and {{SKIN_TONE}} skin holding compass, friendly {{FAVORITE_ANIMAL}} companion, {{FAVORITE_COLOR}} magical elements"
    },
    {
      id: "p3",
      text: "In the enchanted forest, {{CHILD_NAME}} and their {{FAVORITE_ANIMAL}} friend meet talking trees and dancing butterflies. The compass glows brighter, showing them the way forward. 'This is amazing!' {{CHILD_NAME}} says with wonder.",
      illustration_prompt: "watercolor style, enchanted forest scene, talking trees, dancing butterflies, child with {{HAIR_COLOR}} hair and {{SKIN_TONE}} skin, {{FAVORITE_ANIMAL}} companion, {{FAVORITE_COLOR}} magical glow"
    },
    {
      id: "p4",
      text: "The compass leads {{CHILD_NAME}} to a tall mountain where clouds shaped like {{FAVORITE_FOOD}} float in the sky. Their {{FAVORITE_ANIMAL}} friend helps them climb higher and higher. 'We can do this together!' {{CHILD_NAME}} says bravely.",
      illustration_prompt: "watercolor style, tall mountain with clouds shaped like {{FAVORITE_FOOD}}, child with {{HAIR_COLOR}} hair and {{SKIN_TONE}} skin climbing with {{FAVORITE_ANIMAL}} companion, {{FAVORITE_COLOR}} sky"
    },
    {
      id: "p5",
      text: "At the mountain's peak, {{CHILD_NAME}} discovers a sparkling sky where they can fly among the {{FAVORITE_FOOD}}-shaped clouds. The compass guides them through the sky, and {{CHILD_NAME}} feels like they're soaring with the birds.",
      illustration_prompt: "watercolor style, sky scene with {{FAVORITE_FOOD}}-shaped clouds, child with {{HAIR_COLOR}} hair and {{SKIN_TONE}} skin flying with compass, {{FAVORITE_ANIMAL}} companion, {{FAVORITE_COLOR}} magical sky"
    },
    {
      id: "p6",
      text: "The compass leads {{CHILD_NAME}} down to a magical sea where dolphins jump and play. The water sparkles with {{FAVORITE_COLOR}} light, and {{CHILD_NAME}}'s {{FAVORITE_ANIMAL}} friend swims alongside them. 'This is the most beautiful place!' {{CHILD_NAME}} says.",
      illustration_prompt: "watercolor style, magical sea with dolphins, child with {{HAIR_COLOR}} hair and {{SKIN_TONE}} skin swimming, {{FAVORITE_ANIMAL}} companion, {{FAVORITE_COLOR}} sparkling water"
    },
    {
      id: "p7",
      text: "In the magical sea, {{CHILD_NAME}} meets a wise sea turtle who tells them about the Rainbow Garden. 'Only the bravest adventurers can find it,' the turtle says. {{CHILD_NAME}} feels ready for this challenge.",
      illustration_prompt: "watercolor style, underwater scene with wise sea turtle, child with {{HAIR_COLOR}} hair and {{SKIN_TONE}} skin listening, {{FAVORITE_ANIMAL}} companion, {{FAVORITE_COLOR}} underwater glow"
    },
    {
      id: "p8",
      text: "The compass guides {{CHILD_NAME}} to the Rainbow Garden, where flowers bloom in every color of the rainbow. {{CHILD_NAME}}'s {{FAVORITE_COLOR}} flower is the most beautiful of all. 'I've never seen anything so magical!' {{CHILD_NAME}} exclaims.",
      illustration_prompt: "watercolor style, rainbow garden with colorful flowers, child with {{HAIR_COLOR}} hair and {{SKIN_TONE}} skin admiring {{FAVORITE_COLOR}} flower, {{FAVORITE_ANIMAL}} companion, rainbow lighting"
    },
    {
      id: "p9",
      text: "In the Rainbow Garden, {{CHILD_NAME}} meets the Garden Guardian, who tells them they are a true hero. 'You've shown courage, kindness, and wonder on your journey,' the guardian says. {{CHILD_NAME}} feels proud and special.",
      illustration_prompt: "watercolor style, rainbow garden with Garden Guardian, child with {{HAIR_COLOR}} hair and {{SKIN_TONE}} skin meeting guardian, {{FAVORITE_ANIMAL}} companion, {{FAVORITE_COLOR}} magical aura"
    },
    {
      id: "p10",
      text: "The Garden Guardian gives {{CHILD_NAME}} a special gift: a {{FAVORITE_COLOR}} star that will always remind them of their adventure. 'You are the hero of your own story,' the guardian says. {{CHILD_NAME}} holds the star close to their heart.",
      illustration_prompt: "watercolor style, rainbow garden, child with {{HAIR_COLOR}} hair and {{SKIN_TONE}} skin receiving {{FAVORITE_COLOR}} star, {{FAVORITE_ANIMAL}} companion, magical gift scene"
    },
    {
      id: "p11",
      text: "The compass begins to glow and points back toward {{HOMETOWN}}. 'It's time to go home,' {{CHILD_NAME}} says to their {{FAVORITE_ANIMAL}} friend. Together, they follow the compass back through the magical places they've visited.",
      illustration_prompt: "watercolor style, compass pointing homeward, child with {{HAIR_COLOR}} hair and {{SKIN_TONE}} skin with {{FAVORITE_ANIMAL}} companion, {{FAVORITE_COLOR}} compass glow, journey home"
    },
    {
      id: "p12",
      text: "Back in {{HOMETOWN}}, {{CHILD_NAME}} finds themselves in their own backyard, but everything feels different now. They know they've been on a real adventure. The compass has become a special keepsake, and {{CHILD_NAME}} feels brave and magical.",
      illustration_prompt: "watercolor style, backyard in {{HOMETOWN}}, child with {{HAIR_COLOR}} hair and {{SKIN_TONE}} skin holding compass, {{FAVORITE_ANIMAL}} companion, {{FAVORITE_COLOR}} magical glow, homecoming scene"
    },
    {
      id: "p13",
      text: "That night, {{CHILD_NAME}} tells their family about the amazing adventure with the magical compass. 'I'm a real hero!' {{CHILD_NAME}} says proudly. The {{FAVORITE_COLOR}} star from the Rainbow Garden glows softly on their nightstand.",
      illustration_prompt: "watercolor style, bedroom scene, child with {{HAIR_COLOR}} hair and {{SKIN_TONE}} skin telling family about adventure, {{FAVORITE_COLOR}} star glowing on nightstand, warm family scene"
    },
    {
      id: "p14",
      text: "As {{CHILD_NAME}} falls asleep, they dream of new adventures waiting to be discovered. The compass taught them that they are brave, kind, and special. Every child is the hero of their own story, and {{CHILD_NAME}}'s story is just beginning.",
      illustration_prompt: "watercolor style, peaceful sleeping scene, child with {{HAIR_COLOR}} hair and {{SKIN_TONE}} skin dreaming, {{FAVORITE_COLOR}} star and compass nearby, dreamy magical atmosphere"
    }
  ],
  
  meta: {
    reading_age: "3-7",
    theme: "adventure-compass",
    version: "1.0"
  }
};

/**
 * Generate a personalized story using the template system
 */
function generatePersonalizedStory(childData, options = {}) {
  console.log(`📚 Generating personalized story for ${childData.name}...`);
  
  // Prepare personalization data
  const personalization = {
    CHILD_NAME: childData.name,
    CHILD_AGE: childData.age.toString(),
    HAIR_COLOR: childData.hair || 'brown',
    SKIN_TONE: childData.skin || 'medium',
    PRONOUNS: childData.pronouns || 'they/them',
    FAVORITE_ANIMAL: options.favorite_animal || 'dog',
    FAVORITE_FOOD: options.favorite_food || 'pizza',
    FAVORITE_COLOR: options.favorite_color || 'blue',
    HOMETOWN: options.hometown || 'Adventure City',
    OCCASION: options.occasion || 'general'
  };
  
  // Create personalized story by replacing placeholders
  const personalizedStory = {
    title: replacePlaceholders(ADVENTURE_COMPASS_TEMPLATE.title, personalization),
    pages: ADVENTURE_COMPASS_TEMPLATE.pages.map(page => ({
      id: page.id,
      text: replacePlaceholders(page.text, personalization),
      illustration_prompt: replacePlaceholders(page.illustration_prompt, personalization)
    })),
    meta: {
      ...ADVENTURE_COMPASS_TEMPLATE.meta,
      personalization_used: Object.keys(personalization),
      generated_at: new Date().toISOString()
    }
  };
  
  // Validate the personalized story
  validatePersonalizedStory(personalizedStory, childData.name);
  
  console.log(`✅ Story generated successfully for ${childData.name}`);
  return personalizedStory;
}

/**
 * Replace placeholders in text with personalization data
 */
function replacePlaceholders(text, personalization) {
  let result = text;
  
  // Replace all placeholders
  for (const [key, value] of Object.entries(personalization)) {
    const placeholder = `{{${key}}}`;
    result = result.replace(new RegExp(placeholder, 'g'), value);
  }
  
  return result;
}

/**
 * Validate the personalized story
 */
function validatePersonalizedStory(story, childName) {
  // Check required fields
  if (!story.title || !story.pages || !Array.isArray(story.pages)) {
    throw new Error('Invalid story structure: missing title or pages');
  }
  
  // Check page count
  if (story.pages.length !== 14) {
    throw new Error(`Invalid page count: expected 14, got ${story.pages.length}`);
  }
  
  // Check each page
  story.pages.forEach((page, index) => {
    if (!page.id || !page.text || !page.illustration_prompt) {
      throw new Error(`Invalid page ${index + 1}: missing required fields`);
    }
    
    // Check for remaining placeholders
    if (page.text.includes('{{') || page.illustration_prompt.includes('{{')) {
      console.warn(`Page ${index + 1} contains unresolved placeholders`);
    }
  });
  
  // Check if child's name appears in story
  const storyText = story.pages.map(p => p.text).join(' ');
  const nameCount = (storyText.match(new RegExp(childName, 'gi')) || []).length;
  if (nameCount < 3) {
    console.warn(`Child's name "${childName}" appears only ${nameCount} times (target: 3-5)`);
  }
  
  console.log(`📊 Story validation: ${story.pages.length} pages, name appears ${nameCount} times`);
}

/**
 * Get available personalization options
 */
function getPersonalizationOptions() {
  return {
    required: ['name', 'age', 'hair', 'skin'],
    optional: ['favorite_animal', 'favorite_food', 'favorite_color', 'hometown', 'occasion', 'dedication'],
    defaults: {
      favorite_animal: 'dog',
      favorite_food: 'pizza', 
      favorite_color: 'blue',
      hometown: 'Adventure City',
      occasion: 'general'
    }
  };
}

/**
 * Test the template system
 */
function testTemplateSystem() {
  console.log('🧪 Testing Template-Based Story System\n');
  
  const testChild = {
    name: 'Emma',
    age: 5,
    hair: 'blonde',
    skin: 'light',
    pronouns: 'she/her'
  };
  
  const testOptions = {
    favorite_animal: 'dragon',
    favorite_food: 'pizza',
    favorite_color: 'purple',
    hometown: 'Portland',
    occasion: 'birthday'
  };
  
  try {
    const story = generatePersonalizedStory(testChild, testOptions);
    
    console.log('\n📚 Generated Story:');
    console.log(`Title: ${story.title}`);
    console.log(`Pages: ${story.pages.length}`);
    console.log(`Reading Age: ${story.meta.reading_age}`);
    
    console.log('\n📖 First Page Preview:');
    console.log(`"${story.pages[0].text}"`);
    
    console.log('\n🎯 Personalization Check:');
    const storyText = story.pages.map(p => p.text).join(' ');
    const checks = [
      { item: 'Emma', found: storyText.includes('Emma') },
      { item: 'dragon', found: storyText.includes('dragon') },
      { item: 'pizza', found: storyText.includes('pizza') },
      { item: 'purple', found: storyText.includes('purple') },
      { item: 'Portland', found: storyText.includes('Portland') }
    ];
    
    checks.forEach(check => {
      console.log(`   ${check.found ? '✅' : '❌'} ${check.item}`);
    });
    
    return story;
    
  } catch (error) {
    console.error('Test failed:', error.message);
    throw error;
  }
}

// Export functions for use in other modules
export { 
  generatePersonalizedStory, 
  validatePersonalizedStory, 
  getPersonalizationOptions,
  testTemplateSystem,
  ADVENTURE_COMPASS_TEMPLATE 
};

// Run test if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testTemplateSystem();
}
