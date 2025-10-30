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

// === Canonicalization helpers (kept local to avoid cross-package build issues) ===
const HAIR_COLOR_MAP = {
  'blonde':            { id: 'blonde',            hex: '#D1B26F' },
  'strawberry-blonde': { id: 'strawberry-blonde', hex: '#E6A273' },
  'light-brown':       { id: 'light-brown',       hex: '#A4754A' },
  'medium-brown':      { id: 'medium-brown',      hex: '#7B4B2A' },
  'dark-brown':        { id: 'dark-brown',        hex: '#523418' },
  'auburn':            { id: 'auburn',            hex: '#8B3F2C' },
  'black':             { id: 'black',             hex: '#2B2B2B' },
  'red':               { id: 'red',               hex: '#C25E2E' },
};

const ANIMAL_SET = new Set(['dog','cat','owl','lion','tiger','penguin','t-rex','unicorn']);
const FAVORITE_COLOR_SET = new Set(['red','orange','yellow','green','blue','pink','purple','brown','black']);

function canonicalizeSkinTone(raw) {
  const s = String(raw ?? '').toLowerCase()
    .replace(/[^a-z0-9+\-\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!s) return 'skin-medium';
  if (/(^|[^a-z])skin[-_ ]?(light|tan|medium|brown[-_ ]light|brown[-_ ]deep|dark[-_ ]aa|light[-_ ]aa)([^a-z]|$)/.test(s)) {
    if (/brown[-_ ]light|light[-_ ]aa/.test(s)) return 'skin-brown-light';
    if (/brown[-_ ]deep|dark[-_ ]aa/.test(s))  return 'skin-brown-deep';
    if (/skin[-_ ]light/.test(s))              return 'skin-light';
    if (/skin[-_ ]tan/.test(s))                return 'skin-tan';
    return 'skin-medium';
  }
  if (/(brown).*(deep|dark)|\b(deep|dark)\b.*(brown|african|aa|black)/.test(s)) return 'skin-brown-deep';
  if (/(brown).*(light)|\blight\b.*(brown|african|aa|black)|(light)\s*(aa|african)/.test(s)) return 'skin-brown-light';
  if (/^(light|fair)(\b|$)/.test(s))                      return 'skin-light';
  if (/(tan|olive)/.test(s))                              return 'skin-tan';
  if (/(medium|mid|default|normal|average)/.test(s))      return 'skin-medium';
  if (/(dark).*?(african|aa|black)/.test(s))              return 'skin-brown-deep';
  if (/(light).*?(african|aa|black)/.test(s))             return 'skin-brown-light';
  return 'skin-medium';
}

function resolveHairColor(raw) {
  if (raw == null) return undefined;
  const s = String(raw).toLowerCase().trim();
  // accept a few common aliases and map to our IDs
  const alias = {
    'strawberry blonde': 'strawberry-blonde',
  };
  const key = alias[s] || s;
  return HAIR_COLOR_MAP[key];
}

function canonicalizeClothingStyleLabel(raw) {
  const s = String(raw ?? '').toLowerCase().trim();
  if (s === 'dress') return { label: 'dress', canonical: 'dress' };
  return { label: 't-shirt and shorts', canonical: 'tee-shorts' };
}

function canonicalFavoriteColor(raw) {
  const s = String(raw ?? '').toLowerCase().trim();
  return FAVORITE_COLOR_SET.has(s) ? s : 'blue';
}

function canonicalAnimal(raw) {
  const s = String(raw ?? '').toLowerCase().trim();
  // fix common typos (e.g., trex)
  const alias = { 'trex': 't-rex', 't rex': 't-rex', 't-rex': 't-rex' };
  const k = alias[s] || s;
  return ANIMAL_SET.has(k) ? k : 'dog';
}

// Normalize Amazon Custom data to our schema
function normalizeCustomizationData(amazonData) {
  const hairEntry = resolveHairColor(amazonData.hairColor);
  const skinCanonical = canonicalizeSkinTone(amazonData.skinTone);
  const clothing = canonicalizeClothingStyleLabel(amazonData.clothingStyle);
  const favColor = canonicalFavoriteColor(amazonData.favoriteColor);
  const animal = canonicalAnimal(amazonData.favoriteAnimal);

  const child = {
    name: amazonData.childName || 'Little Hero',
    age: Number.parseInt(amazonData.childAge, 10) || 5,
    hair: hairEntry ? hairEntry.id : 'medium-brown',
    skin: skinCanonical,
    pronouns: 'they/them'
  };

  const options = {
    favorite_animal: animal,
    favorite_food: amazonData.favoriteFood || 'pizza',
    favorite_color: favColor,
    hometown: amazonData.hometown || 'Adventure City',
    occasion: 'general',
    dedication: amazonData.dedication || `Dear ${child.name}, you are the hero of this magical story!`,
    clothing_style_label: clothing.label,
    clothing_style_canonical: clothing.canonical,
    hair_hex: hairEntry ? hairEntry.hex : undefined,
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
