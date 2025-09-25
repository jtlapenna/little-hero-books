#!/usr/bin/env node

/**
 * Little Hero Books - Order Processor
 * Integrates Amazon orders with our renderer service and POD providers
 */

import fetch from 'node-fetch';
import { config } from 'dotenv';

// Load environment variables
config({ path: '../.env' });

const AMAZON_MIDDLEWARE_URL = process.env.AMAZON_MIDDLEWARE_URL || 'http://localhost:4000';
const RENDERER_URL = process.env.RENDERER_BASE_URL || 'http://localhost:8787';

// Order processing status tracking
const orderStatus = new Map();

// Normalize Amazon Custom data to our schema
function normalizeCustomizationData(amazonData) {
  // This function converts Amazon Custom order data to our renderer schema
  // Customize based on your actual Amazon Custom listing field names
  
  const child = {
    name: amazonData.childName || 'Little Hero',
    age: parseInt(amazonData.childAge) || 5,
    hair: amazonData.hairColor || 'brown',
    skin: amazonData.skinTone || 'light',
    pronouns: 'they/them' // Default, could be extracted if provided
  };
  
  const options = {
    favorite_animal: amazonData.favoriteAnimal || 'fox',
    favorite_food: amazonData.favoriteFood || 'pizza',
    favorite_color: amazonData.favoriteColor || 'blue',
    hometown: amazonData.hometown || 'Adventure City',
    occasion: 'general',
    dedication: amazonData.dedication || `Dear ${child.name}, you are the hero of this magical story!`
  };
  
  return { child, options };
}

// Generate manuscript using LLM (placeholder for now)
async function generateManuscript(child, options) {
  // For now, we'll use a template. In production, this would call your LLM service
  const manuscript = {
    title: `${child.name} and the Adventure Compass`,
    pages: [
      {
        id: "p1",
        text: `One day in ${options.hometown}, ${child.name} found a compass glowing bright ${options.favorite_color}.`,
        illustration_prompt: `watercolor, warm light, ${options.hometown} setting, child with ${child.hair} hair, ${child.skin} skin, ${options.favorite_color} compass glow, ${options.favorite_animal} companion`
      },
      {
        id: "p2",
        text: `${child.name} decided to follow the compass. A friendly ${options.favorite_animal} appeared and joined the adventure.`,
        illustration_prompt: `watercolor, magical forest, child and ${options.favorite_animal} walking together, ${options.favorite_color} compass leading the way`
      },
      {
        id: "p3",
        text: `They walked through an enchanted forest where trees sparkled with ${options.favorite_color} light.`,
        illustration_prompt: `watercolor, enchanted forest, sparkling ${options.favorite_color} trees, magical atmosphere`
      },
      {
        id: "p4",
        text: `The compass led them to a tall mountain. ${child.name} climbed bravely with the ${options.favorite_animal} by their side.`,
        illustration_prompt: `watercolor, mountain landscape, child climbing with ${options.favorite_animal} companion`
      },
      {
        id: "p5",
        text: `At the top, clouds shaped like ${options.favorite_food} floated by. The compass glowed brighter than ever.`,
        illustration_prompt: `watercolor, mountain peak, cloud shapes, ${options.favorite_food}-shaped clouds, bright compass`
      },
      {
        id: "p6",
        text: `They flew through the sky on a magical wind. Fish swam through the clouds like an ocean above.`,
        illustration_prompt: `watercolor, sky adventure, child and ${options.favorite_animal} flying, cloud fish swimming`
      },
      {
        id: "p7",
        text: `The compass brought them to a sparkling sea. Dolphins greeted ${child.name} by name and splashed joyfully.`,
        illustration_prompt: `watercolor, sparkling sea, dolphins jumping, child on shore, friendly sea creatures`
      },
      {
        id: "p8",
        text: `${child.name} and the ${options.favorite_animal} had a picnic with fresh ${options.favorite_food}.`,
        illustration_prompt: `watercolor, picnic scene, ${options.favorite_food} spread, child and ${options.favorite_animal} eating`
      },
      {
        id: "p9",
        text: `A gentle storm came, but the compass glowed bright ${options.favorite_color} and showed them the way through.`,
        illustration_prompt: `watercolor, gentle storm, ${options.favorite_color} compass light, child and ${options.favorite_animal} protected`
      },
      {
        id: "p10",
        text: `They reached a rainbow garden where flowers sang. ${child.name} saw themselves as the hero of this story.`,
        illustration_prompt: `watercolor, rainbow garden, singing flowers, child as hero, magical reflection`
      },
      {
        id: "p11",
        text: `The compass began to glow softly and pointed toward home. Their adventure was complete.`,
        illustration_prompt: `watercolor, compass pointing home, child and ${options.favorite_animal} ready to return`
      },
      {
        id: "p12",
        text: `Back in ${options.hometown}, ${child.name} felt proud and special. The magical friends waved goodbye.`,
        illustration_prompt: `watercolor, hometown return, magical friends waving, child feeling proud`
      },
      {
        id: "p13",
        text: `The compass rested quietly on ${child.name}'s shelf, ready for the next adventure to come.`,
        illustration_prompt: `watercolor, child's room, compass on shelf, ready for next adventure`
      },
      {
        id: "p14",
        text: `${child.name} knew that every child is the hero of their own story, and their adventure had just begun.`,
        illustration_prompt: `watercolor, child thinking, magical glow around them, sense of wonder`
      }
    ],
    meta: {
      reading_age: child.age <= 4 ? "3-4" : "5-7",
      theme: "adventure-compass"
    }
  };
  
  return manuscript;
}

// Process a single order
async function processOrder(orderId) {
  try {
    console.log(`🔄 Processing order: ${orderId}`);
    
    // Update status
    orderStatus.set(orderId, { status: 'processing', startedAt: new Date().toISOString() });
    
    // 1. Get order items and customization data
    console.log(`📦 Fetching order items for ${orderId}`);
    const itemsResponse = await fetch(`${AMAZON_MIDDLEWARE_URL}/orders/${orderId}/items`);
    
    if (!itemsResponse.ok) {
      throw new Error(`Failed to fetch order items: ${itemsResponse.statusText}`);
    }
    
    const { items } = await itemsResponse.json();
    
    if (!items || items.length === 0) {
      throw new Error('No items found in order');
    }
    
    // 2. Parse customization data
    console.log(`🎨 Parsing customization data for ${orderId}`);
    const customizationResponse = await fetch(`${AMAZON_MIDDLEWARE_URL}/orders/${orderId}/parse-customization`);
    
    if (!customizationResponse.ok) {
      throw new Error(`Failed to parse customization: ${customizationResponse.statusText}`);
    }
    
    const { customizationData } = await customizationResponse.json();
    
    if (!customizationData || customizationData.length === 0) {
      throw new Error('No customization data found');
    }
    
    // 3. Process each customized item
    for (const itemData of customizationData) {
      const { customization } = itemData;
      
      // Normalize the data to our schema
      const { child, options } = normalizeCustomizationData(customization);
      
      // Generate manuscript
      console.log(`📚 Generating manuscript for ${child.name}`);
      const manuscript = await generateManuscript(child, options);
      
      // 4. Render the book
      console.log(`🎨 Rendering book for ${child.name}`);
      const renderData = {
        orderId: `${orderId}-${child.name}`,
        spec: {
          trim: "8x10",
          bleed: "0.125in",
          pages: 16,
          color: "CMYK",
          binding: "softcover"
        },
        manuscript,
        child,
        options
      };
      
      const renderResponse = await fetch(`${RENDERER_URL}/render`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(renderData)
      });
      
      if (!renderResponse.ok) {
        throw new Error(`Failed to render book: ${renderResponse.statusText}`);
      }
      
      const renderResult = await renderResponse.json();
      console.log(`✅ Book rendered for ${child.name}: ${renderResult.bookPdfUrl}`);
      
      // 5. Submit to POD provider (placeholder)
      console.log(`📦 Submitting to POD provider for ${child.name}`);
      // TODO: Implement POD provider integration
      
      // 6. Update order status
      orderStatus.set(orderId, {
        status: 'completed',
        completedAt: new Date().toISOString(),
        booksGenerated: (orderStatus.get(orderId)?.booksGenerated || 0) + 1
      });
    }
    
    console.log(`✅ Order ${orderId} processed successfully`);
    return { success: true, orderId };
    
  } catch (error) {
    console.error(`❌ Error processing order ${orderId}:`, error.message);
    orderStatus.set(orderId, {
      status: 'failed',
      error: error.message,
      failedAt: new Date().toISOString()
    });
    throw error;
  }
}

// Poll for new orders
async function pollForOrders() {
  try {
    console.log('🔍 Polling for new orders...');
    
    const response = await fetch(`${AMAZON_MIDDLEWARE_URL}/orders`);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch orders: ${response.statusText}`);
    }
    
    const { orders } = await response.json();
    
    if (!orders || orders.length === 0) {
      console.log('📭 No new orders found');
      return;
    }
    
    console.log(`📦 Found ${orders.length} new orders`);
    
    // Process each new order
    for (const order of orders) {
      const orderId = order.AmazonOrderId;
      
      // Skip if already processed
      if (orderStatus.has(orderId)) {
        console.log(`⏭️  Order ${orderId} already processed`);
        continue;
      }
      
      try {
        await processOrder(orderId);
      } catch (error) {
        console.error(`Failed to process order ${orderId}:`, error.message);
        // Continue with other orders
      }
    }
    
  } catch (error) {
    console.error('Error polling for orders:', error.message);
  }
}

// Main execution
async function main() {
  console.log('🚀 Little Hero Books - Order Processor Starting');
  console.log(`📡 Amazon Middleware: ${AMAZON_MIDDLEWARE_URL}`);
  console.log(`🎨 Renderer Service: ${RENDERER_URL}`);
  
  // Poll every 5 minutes
  setInterval(pollForOrders, 5 * 60 * 1000);
  
  // Initial poll
  await pollForOrders();
}

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 Order processor shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('🛑 Order processor shutting down gracefully');
  process.exit(0);
});

// Start the processor
main().catch(console.error);

export { processOrder, pollForOrders, orderStatus };
