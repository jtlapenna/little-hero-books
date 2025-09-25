#!/usr/bin/env node

/**
 * Test AI Story Generation with Multiple Children
 */

import { generateStory } from './story-generator.js';
import { config } from 'dotenv';

// Load environment variables
config({ path: '../.env' });

// Test cases
const testCases = [
  {
    name: 'Emma',
    age: 5,
    hair: 'blonde',
    skin: 'light',
    pronouns: 'she/her',
    options: {
      favorite_animal: 'dragon',
      favorite_food: 'pizza',
      favorite_color: 'purple',
      hometown: 'Portland',
      occasion: 'birthday'
    }
  },
  {
    name: 'Marcus',
    age: 4,
    hair: 'brown',
    skin: 'medium',
    pronouns: 'he/him',
    options: {
      favorite_animal: 'elephant',
      favorite_food: 'pancakes',
      favorite_color: 'blue',
      hometown: 'Austin',
      occasion: 'general'
    }
  }
];

async function testMultipleStories() {
  console.log('🧪 Testing AI Story Generation with Multiple Children\n');
  
  for (let i = 0; i < testCases.length; i++) {
    const testCase = testCases[i];
    console.log(`\n📚 Test ${i + 1}: ${testCase.name} (age ${testCase.age})`);
    console.log(`   Animal: ${testCase.options.favorite_animal}, Food: ${testCase.options.favorite_food}`);
    console.log(`   Color: ${testCase.options.favorite_color}, Hometown: ${testCase.options.hometown}`);
    
    try {
      const story = await generateStory(testCase, testCase.options);
      
      console.log(`✅ Generated: "${story.title}"`);
      console.log(`📊 Pages: ${story.pages.length}, Reading Age: ${story.meta.reading_age}`);
      
      // Count name appearances
      const allText = story.pages.map(p => p.text).join(' ');
      const nameCount = (allText.match(new RegExp(testCase.name, 'gi')) || []).length;
      console.log(`📝 Name appears: ${nameCount} times`);
      
      // Show first page
      console.log(`\n📖 First Page:`);
      console.log(`"${story.pages[0].text}"`);
      
      // Check personalization
      let personalization = [];
      if (allText.toLowerCase().includes(testCase.options.favorite_animal.toLowerCase())) {
        personalization.push('animal ✓');
      }
      if (allText.toLowerCase().includes(testCase.options.favorite_food.toLowerCase())) {
        personalization.push('food ✓');
      }
      if (allText.toLowerCase().includes(testCase.options.favorite_color.toLowerCase())) {
        personalization.push('color ✓');
      }
      if (allText.toLowerCase().includes(testCase.options.hometown.toLowerCase())) {
        personalization.push('hometown ✓');
      }
      
      console.log(`🎯 Personalization: ${personalization.join(', ')}`);
      
    } catch (error) {
      console.error(`❌ Failed: ${error.message}`);
    }
  }
  
  console.log('\n🎉 Testing complete!');
}

// Run the test
testMultipleStories().catch(console.error);
