#!/usr/bin/env node

/**
 * Little Hero Books - AI Story Generator
 * Generates personalized children's stories using OpenAI or Anthropic
 */

import fetch from 'node-fetch';
import { config } from 'dotenv';

// Load environment variables
config({ path: '../.env' });

const LLM_CONFIG = {
  provider: process.env.LLM_PROVIDER || 'openai',
  url: process.env.LLM_URL,
  apiKey: process.env.LLM_API_KEY,
  model: process.env.LLM_MODEL || 'gpt-4o-mini'
};

// Adventure Compass story template with placeholders
const STORY_PROMPT = `You are a children's picture-book writer specializing in magical adventure stories for ages 3-7. 

Create a personalized story following "The Adventure Compass" template where a child discovers a magical compass that guides them through enchanted locations before returning home.

CHILD DETAILS:
- Name: {{CHILD_NAME}}
- Age: {{CHILD_AGE}}
- Hair Color: {{HAIR_COLOR}}
- Skin Tone: {{SKIN_TONE}}
- Pronouns: {{PRONOUNS}}

PERSONALIZATION:
- Favorite Animal: {{FAVORITE_ANIMAL}}
- Favorite Food: {{FAVORITE_FOOD}}
- Favorite Color: {{FAVORITE_COLOR}}
- Hometown: {{HOMETOWN}}
- Occasion: {{OCCASION}}

STORY REQUIREMENTS:
- Exactly 14 pages (interior story pages)
- 40-60 words per page (2-4 sentences)
- Present tense, warm and rhythmic language
- Include child's name naturally throughout (3-5 times minimum)
- Weave favorite animal, food, color, and hometown into 3-5 pages
- Age-appropriate content (no fear, peril, or scary elements)
- Cultural sensitivity and inclusivity
- No brand names, licensed IP, or copyrighted content

ADVENTURE COMPASS STRUCTURE:
1. Introduction - Child finds magical compass in hometown
2. Forest Stop - Enchanted woods with friendly creatures
3. Mountain Stop - Climb with animal companion
4. Sky Stop - Fly among clouds shaped like favorite food
5. Sea Stop - Explore sparkling waters
6. Resting Moment - Picnic with favorite food
7. Challenge - Small obstacle overcome with courage
8. Final Magical Land - Unique place where child sees their heroism
9. Return Home - Compass guides them back
10. Resolution - Adventure complete, child feels special
11. Closing Message - Ties adventure to dedication

OUTPUT FORMAT:
Return valid JSON with this exact structure:
{
  "title": "{{CHILD_NAME}} and the Adventure Compass",
  "pages": [
    {
      "id": "p1",
      "text": "Page text here (40-60 words, 2-4 sentences)",
      "illustration_prompt": "watercolor style, warm lighting, [scene description], child with {{HAIR_COLOR}} hair, {{SKIN_TONE}} skin, {{FAVORITE_COLOR}} magical elements, {{FAVORITE_ANIMAL}} companion"
    }
    // ... 13 more pages (p2 through p14)
  ],
  "meta": {
    "reading_age": "3-5 or 5-7",
    "theme": "adventure-compass",
    "personalization_used": ["animal", "food", "color", "hometown"]
  }
}

Ensure the story feels magical, affirming, and makes the child feel like the hero of their own adventure.`;

// Generate story using LLM
async function generateStory(childData, options = {}) {
  try {
    console.log(`📚 Generating story for ${childData.name}...`);
    
    // Replace placeholders in prompt
    const prompt = STORY_PROMPT
      .replace(/\{\{CHILD_NAME\}\}/g, childData.name)
      .replace(/\{\{CHILD_AGE\}\}/g, childData.age.toString())
      .replace(/\{\{HAIR_COLOR\}\}/g, childData.hair)
      .replace(/\{\{SKIN_TONE\}\}/g, childData.skin)
      .replace(/\{\{PRONOUNS\}\}/g, childData.pronouns || 'they/them')
      .replace(/\{\{FAVORITE_ANIMAL\}\}/g, options.favorite_animal || 'fox')
      .replace(/\{\{FAVORITE_FOOD\}\}/g, options.favorite_food || 'pizza')
      .replace(/\{\{FAVORITE_COLOR\}\}/g, options.favorite_color || 'blue')
      .replace(/\{\{HOMETOWN\}\}/g, options.hometown || 'Adventure City')
      .replace(/\{\{OCCASION\}\}/g, options.occasion || 'general');
    
    let response;
    
    if (LLM_CONFIG.provider === 'openai') {
      response = await generateWithOpenAI(prompt);
    } else if (LLM_CONFIG.provider === 'anthropic') {
      response = await generateWithAnthropic(prompt);
    } else {
      throw new Error(`Unsupported LLM provider: ${LLM_CONFIG.provider}`);
    }
    
    // Parse and validate response
    const story = JSON.parse(response);
    
    // Validate story structure
    validateStory(story, childData.name);
    
    console.log(`✅ Story generated successfully for ${childData.name}`);
    return story;
    
  } catch (error) {
    console.error('❌ Error generating story:', error.message);
    throw error;
  }
}

// Generate with OpenAI
async function generateWithOpenAI(prompt) {
  const response = await fetch(LLM_CONFIG.url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${LLM_CONFIG.apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: LLM_CONFIG.model,
      messages: [
        {
          role: 'system',
          content: 'You are a professional children\'s book writer. Always respond with valid JSON matching the exact format requested.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.7,
      max_tokens: 2000
    })
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(`OpenAI API error: ${error.error?.message || response.statusText}`);
  }
  
  const data = await response.json();
  return data.choices[0].message.content;
}

// Generate with Anthropic
async function generateWithAnthropic(prompt) {
  const response = await fetch(LLM_CONFIG.url, {
    method: 'POST',
    headers: {
      'x-api-key': LLM_CONFIG.apiKey,
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: LLM_CONFIG.model,
      max_tokens: 2000,
      temperature: 0.7,
      system: 'You are a professional children\'s book writer. Always respond with valid JSON matching the exact format requested.',
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ]
    })
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Anthropic API error: ${error.error?.message || response.statusText}`);
  }
  
  const data = await response.json();
  return data.content[0].text;
}

// Validate generated story
function validateStory(story, childName) {
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
    
    // Check word count (rough estimate)
    const wordCount = page.text.split(' ').length;
    if (wordCount < 20 || wordCount > 80) {
      console.warn(`Page ${index + 1} word count: ${wordCount} (target: 40-60)`);
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

// Test story generation
async function testStoryGeneration() {
  console.log('🧪 Testing story generation...');
  
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
    const story = await generateStory(testChild, testOptions);
    
    console.log('\n📚 Generated Story:');
    console.log(`Title: ${story.title}`);
    console.log(`Pages: ${story.pages.length}`);
    console.log(`Reading Age: ${story.meta.reading_age}`);
    
    console.log('\n📖 First Page Preview:');
    console.log(`"${story.pages[0].text}"`);
    
    return story;
    
  } catch (error) {
    console.error('Test failed:', error.message);
    throw error;
  }
}

// Main execution
async function main() {
  console.log('🤖 Little Hero Books - AI Story Generator');
  console.log(`Provider: ${LLM_CONFIG.provider}`);
  console.log(`Model: ${LLM_CONFIG.model}`);
  
  if (!LLM_CONFIG.apiKey) {
    console.error('❌ LLM_API_KEY not configured. Please set it in your .env file.');
    process.exit(1);
  }
  
  // Test generation if run directly
  if (process.argv[1] === new URL(import.meta.url).pathname) {
    await testStoryGeneration();
  }
}

// Export functions for use in other modules
export { generateStory, validateStory, testStoryGeneration };

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}
