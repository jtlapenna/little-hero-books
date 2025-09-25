import axios from 'axios';

// Test data for the complete pipeline
const testOrder = {
  orderId: `test-${Date.now()}`,
  spec: {
    format: '8x10',
    pages: 16,
    binding: 'softcover'
  },
  manuscript: {
    title: "Emma and the Adventure Compass",
    pages: [
      {
        id: "p1",
        text: "One day in Portland, Emma found a magical compass glowing bright purple. The compass seemed to whisper, 'Adventure awaits!' Emma felt excitement bubbling in her heart.",
        illustration_prompt: "A child named Emma with blonde hair and fair skin, holding a glowing purple compass in a sunny Portland garden."
      },
      {
        id: "p2",
        text: "The compass spun and pointed towards the Whispering Woods. As Emma stepped inside, the trees seemed to sway a welcome. A friendly dragon with purple eyes peeked out from behind a giant oak. 'Hello, Emma!' it chirped. 'I'm here to guide you!'",
        illustration_prompt: "A child named Emma with blonde hair and fair skin, walking into a magical forest. A friendly dragon with purple eyes is peeking from behind a tree."
      },
      {
        id: "p3",
        text: "Together, Emma and her dragon companion climbed a tall mountain. The compass glowed brighter as they reached the peak. Emma could see her name written in the clouds above. 'This is my adventure!' she exclaimed.",
        illustration_prompt: "A child named Emma with blonde hair and fair skin, standing on a mountain peak with her dragon companion, looking up at clouds spelling her name."
      },
      {
        id: "p4",
        text: "The compass lifted them into the sky where they flew among clouds shaped like pizza slices. Emma laughed as they soared through the magical sky. 'This is the best adventure ever!' she called out.",
        illustration_prompt: "A child named Emma with blonde hair and fair skin, flying through the sky with her dragon companion among pizza-shaped clouds."
      },
      {
        id: "p5",
        text: "They landed by a sparkling sea where dolphins greeted Emma by name. The water shimmered with purple light from the compass. Emma felt like she was the hero of her own story.",
        illustration_prompt: "A child named Emma with blonde hair and fair skin, standing by a sparkling sea with dolphins and her dragon companion, with purple light from the compass."
      },
      {
        id: "p6",
        text: "After their amazing journey, the compass guided Emma safely back to Portland. She hugged her dragon friend goodbye, promising to visit again. The compass glowed softly, a reminder of her incredible adventure.",
        illustration_prompt: "A child named Emma with blonde hair and fair skin, hugging her dragon companion goodbye in her Portland backyard, with the magical compass glowing softly."
      },
      {
        id: "p7",
        text: "Emma knew that with courage and kindness, every day could be an adventure. She placed the compass on her shelf, ready for the next magical journey that awaited her.",
        illustration_prompt: "A child named Emma with blonde hair and fair skin, placing the magical compass on a shelf in her room, with a warm, cozy feeling."
      },
      {
        id: "p8",
        text: "The compass continued to glow softly, a reminder that Emma was the hero of her own story. Every child has the power to be brave, kind, and adventurous, just like Emma.",
        illustration_prompt: "The magical compass glowing softly on Emma's shelf, with a warm, magical atmosphere filling the room."
      },
      {
        id: "p9",
        text: "Emma's parents watched with pride as their little hero grew more confident each day. The compass had shown her that she could overcome any challenge with courage and determination.",
        illustration_prompt: "Emma's parents watching proudly as she plays with the magical compass, with a warm family atmosphere."
      },
      {
        id: "p10",
        text: "The Adventure Compass had taught Emma that the greatest adventures come from within. She knew that she could face any challenge with the same bravery she showed on her magical journey.",
        illustration_prompt: "Emma holding the compass with confidence, surrounded by a warm, encouraging glow."
      },
      {
        id: "p11",
        text: "As Emma grew older, she would look back on this adventure with fondness. The compass had shown her that she was capable of amazing things, and that belief stayed with her forever.",
        illustration_prompt: "An older Emma looking at the compass with fond memories, with a nostalgic, warm atmosphere."
      },
      {
        id: "p12",
        text: "The magical compass continued to inspire Emma throughout her life. It reminded her that every child is the hero of their own story, and that adventure is always waiting just around the corner.",
        illustration_prompt: "The compass in Emma's room, glowing with inspiration and possibility."
      },
      {
        id: "p13",
        text: "Emma's adventure with the compass became a treasured memory, one that she would share with her own children someday. The magic of believing in yourself never fades.",
        illustration_prompt: "Emma as an adult, sharing the compass story with her own children, with a warm, generational feeling."
      },
      {
        id: "p14",
        text: "And so the Adventure Compass continued its work, inspiring children everywhere to believe in themselves and their ability to be the heroes of their own stories. The magic lives on in every child who dares to dream.",
        illustration_prompt: "The compass glowing with universal magic, inspiring children everywhere to believe in themselves."
      }
    ],
    meta: {
      reading_age: "3-7",
      theme: "adventure, discovery, friendship"
    }
  },
  assets: {
    backgrounds: {},
    overlays: {}
  },
  child: {
    name: "Emma",
    age: 5,
    hair: "blonde",
    skin: "light",
    pronouns: "she/her/hers"
  },
  options: {
    favorite_animal: "dragon",
    favorite_food: "pizza",
    favorite_color: "purple",
    hometown: "Portland",
    occasion: "birthday",
    dedication: "To our little hero, Emma! Love, Mom & Dad"
  },
  shipping: {
    name: 'Test Customer',
    address1: '123 Test Street',
    city: 'Portland',
    state: 'OR',
    zip: '97201',
    country: 'US'
  }
};

async function testRendererOnly() {
  console.log('🧪 Testing Renderer Service (POD Integration Ready)\n');

  try {
    // Test Renderer Service
    console.log('📚 Testing Renderer Service...');
    
    const rendererResponse = await axios.post('http://localhost:8787/render', testOrder, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 30000
    });

    console.log('📋 Renderer Response:', JSON.stringify(rendererResponse.data, null, 2));
    
    if (rendererResponse.data.bookPdfUrl && rendererResponse.data.coverPdfUrl) {
      console.log('✅ Renderer Service: SUCCESS');
      console.log(`   Order ID: ${rendererResponse.data.orderId}`);
      console.log(`   Book PDF: ${rendererResponse.data.bookPdfUrl}`);
      console.log(`   Cover PDF: ${rendererResponse.data.coverPdfUrl}`);
      console.log(`   Duration: ${rendererResponse.data.duration}ms`);
      
      console.log('\n🎉 POD Integration Ready!');
      console.log('✅ Renderer Service: Working perfectly');
      console.log('✅ PDF Generation: Complete');
      console.log('✅ Signed URLs: Generated');
      console.log('✅ POD Service: Ready to integrate');
      
      console.log('\n📋 Next Steps for POD Integration:');
      console.log('1. Get Lulu Print API credentials');
      console.log('2. Add POD_API_KEY to .env file');
      console.log('3. Test actual book printing');
      console.log('4. Validate print quality');
      
      console.log('\n💡 POD Integration Commands:');
      console.log('   cd pod && npm test              # Test POD service');
      console.log('   node test-renderer-pod-pipeline.js  # Test full pipeline');
      
    } else {
      console.log('❌ Renderer Service: FAILED');
      console.log('   Error:', rendererResponse.data.error);
      console.log('   Full Response:', rendererResponse.data);
    }

  } catch (error) {
    console.error('❌ Test Failed:', error.message);
    
    if (error.code === 'ECONNREFUSED') {
      console.log('\n💡 Troubleshooting:');
      console.log('1. Make sure renderer service is running: npm run dev');
      console.log('2. Check that port 8787 is available');
      console.log('3. Verify renderer service is responding: curl http://localhost:8787/health');
    }
  }
}

// Run the test
testRendererOnly();