#!/usr/bin/env node

/**
 * Test AI Story Generation with Multiple Children
 * Validates story quality, personalization, and consistency
 */

import { generateStory } from './llm/story-generator.js';
import { config } from 'dotenv';

// Load environment variables
config();

// Test cases with different children
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
  },
  {
    name: 'Zara',
    age: 6,
    hair: 'black',
    skin: 'dark',
    pronouns: 'she/her',
    options: {
      favorite_animal: 'butterfly',
      favorite_food: 'strawberries',
      favorite_color: 'pink',
      hometown: 'Seattle',
      occasion: 'graduation'
    }
  }
];

async function testStoryGeneration() {
  console.log('🧪 Testing AI Story Generation with Multiple Children\n');
  
  const results = [];
  
  for (let i = 0; i < testCases.length; i++) {
    const testCase = testCases[i];
    console.log(`\n📚 Test ${i + 1}: Generating story for ${testCase.name}`);
    console.log(`   Age: ${testCase.age}, Hair: ${testCase.hair}, Skin: ${testCase.skin}`);
    console.log(`   Animal: ${testCase.options.favorite_animal}, Food: ${testCase.options.favorite_food}`);
    console.log(`   Color: ${testCase.options.favorite_color}, Hometown: ${testCase.options.hometown}`);
    
    try {
      const story = await generateStory(testCase, testCase.options);
      
      // Analyze the story
      const analysis = analyzeStory(story, testCase);
      results.push({ testCase, story, analysis });
      
      console.log(`✅ Success! Generated "${story.title}"`);
      console.log(`📊 Analysis:`);
      console.log(`   - Pages: ${story.pages.length}`);
      console.log(`   - Name appearances: ${analysis.nameCount}`);
      console.log(`   - Personalization score: ${analysis.personalizationScore}/10`);
      console.log(`   - Word count: ${analysis.totalWords} words`);
      console.log(`   - Reading age: ${story.meta.reading_age}`);
      
      // Show first page
      console.log(`\n📖 First Page:`);
      console.log(`"${story.pages[0].text}"`);
      
    } catch (error) {
      console.error(`❌ Failed to generate story for ${testCase.name}:`, error.message);
      results.push({ testCase, error: error.message });
    }
  }
  
  // Summary
  console.log('\n📊 TEST SUMMARY');
  console.log('================');
  
  const successful = results.filter(r => !r.error);
  const failed = results.filter(r => r.error);
  
  console.log(`✅ Successful: ${successful.length}/${results.length}`);
  console.log(`❌ Failed: ${failed.length}/${results.length}`);
  
  if (successful.length > 0) {
    const avgPersonalization = successful.reduce((sum, r) => sum + r.analysis.personalizationScore, 0) / successful.length;
    const avgWords = successful.reduce((sum, r) => sum + r.analysis.totalWords, 0) / successful.length;
    const avgNameCount = successful.reduce((sum, r) => sum + r.analysis.nameCount, 0) / successful.length;
    
    console.log(`\n📈 Quality Metrics:`);
    console.log(`   - Average personalization score: ${avgPersonalization.toFixed(1)}/10`);
    console.log(`   - Average word count: ${avgWords.toFixed(0)} words`);
    console.log(`   - Average name appearances: ${avgNameCount.toFixed(1)}`);
    
    console.log(`\n🎯 Recommendations:`);
    if (avgPersonalization < 7) {
      console.log('   - Consider improving personalization prompts');
    }
    if (avgNameCount < 4) {
      console.log('   - Consider increasing name frequency in stories');
    }
    if (avgWords < 600 || avgWords > 900) {
      console.log('   - Consider adjusting word count targets');
    }
  }
  
  if (failed.length > 0) {
    console.log(`\n❌ Failed Tests:`);
    failed.forEach(f => {
      console.log(`   - ${f.testCase.name}: ${f.error}`);
    });
  }
  
  console.log('\n🎉 Story generation testing complete!');
  return results;
}

function analyzeStory(story, testCase) {
  const allText = story.pages.map(p => p.text).join(' ');
  const nameCount = (allText.match(new RegExp(testCase.name, 'gi')) || []).length;
  
  // Check personalization elements
  let personalizationScore = 0;
  
  // Name usage (3 points max)
  if (nameCount >= 5) personalizationScore += 3;
  else if (nameCount >= 3) personalizationScore += 2;
  else if (nameCount >= 1) personalizationScore += 1;
  
  // Favorite animal (2 points max)
  if (allText.toLowerCase().includes(testCase.options.favorite_animal.toLowerCase())) {
    personalizationScore += 2;
  }
  
  // Favorite food (2 points max)
  if (allText.toLowerCase().includes(testCase.options.favorite_food.toLowerCase())) {
    personalizationScore += 2;
  }
  
  // Favorite color (2 points max)
  if (allText.toLowerCase().includes(testCase.options.favorite_color.toLowerCase())) {
    personalizationScore += 2;
  }
  
  // Hometown (1 point max)
  if (allText.toLowerCase().includes(testCase.options.hometown.toLowerCase())) {
    personalizationScore += 1;
  }
  
  const totalWords = allText.split(' ').length;
  
  return {
    nameCount,
    personalizationScore,
    totalWords
  };
}

// Run the test
testStoryGeneration().catch(console.error);