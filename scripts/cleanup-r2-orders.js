#!/usr/bin/env node

// Clean up R2 orders - keep only specified order
// Usage: node cleanup-r2-orders.js [order-id-to-keep]

const https = require('https');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const ACCOUNT_ID = '3daae940fcb6fc5b8bbd9bb8fcc62854';
const BUCKET_NAME = 'little-hero-orders';
const PREFIX = 'book-mvp-simple-adventure/orders/';
const KEEP_ORDER = process.argv[2] || '111-0060602-1283417';

// Get wrangler token from environment variable or config
function getWranglerToken() {
    // First check environment variable (preferred method)
    if (process.env.CLOUDFLARE_API_TOKEN) {
        return process.env.CLOUDFLARE_API_TOKEN;
    }
    
    // Fallback to config file
    try {
        const macPath = path.join(process.env.HOME, 'Library', 'Preferences', '.wrangler', 'config', 'default.toml');
        const linuxPath = path.join(process.env.HOME, '.wrangler', 'config', 'default.toml');
        const configPath = fs.existsSync(macPath) ? macPath : linuxPath;
        
        if (fs.existsSync(configPath)) {
            const config = fs.readFileSync(configPath, 'utf8');
            const tokenMatch = config.match(/oauth_token = "([^"]+)"/);
            if (tokenMatch) {
                return tokenMatch[1];
            }
        }
    } catch (error) {
        // Silent fail, will check later
    }
    return null;
}

// Make HTTP request
function makeRequest(options) {
    return new Promise((resolve, reject) => {
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    const result = JSON.parse(data);
                    resolve({ status: res.statusCode, data: result });
                } catch (e) {
                    resolve({ status: res.statusCode, data: data });
                }
            });
        });
        req.on('error', reject);
        req.end();
    });
}

// List all objects with prefix
async function listObjects(prefix) {
    const token = getWranglerToken();
    if (!token) {
        throw new Error('Could not get wrangler token. Please run "wrangler login" first.');
    }
    
    const options = {
        hostname: 'api.cloudflare.com',
        port: 443,
        path: `/client/v4/accounts/${ACCOUNT_ID}/r2/buckets/${BUCKET_NAME}/objects?prefix=${encodeURIComponent(prefix)}`,
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        }
    };
    
    const result = await makeRequest(options);
    if (result.status === 200) {
        return result.data.objects || [];
    } else {
        throw new Error(`API request failed: ${result.status} - ${JSON.stringify(result.data)}`);
    }
}

// Delete an object
async function deleteObject(key) {
    const token = getWranglerToken();
    const options = {
        hostname: 'api.cloudflare.com',
        port: 443,
        path: `/client/v4/accounts/${ACCOUNT_ID}/r2/buckets/${BUCKET_NAME}/objects/${encodeURIComponent(key)}`,
        method: 'DELETE',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        }
    };
    
    const result = await makeRequest(options);
    return result.status === 204 || result.status === 200;
}

// Ask for confirmation
function askConfirmation(question) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    
    return new Promise((resolve) => {
        rl.question(question, (answer) => {
            rl.close();
            resolve(answer.toLowerCase() === 'yes');
        });
    });
}

// Main cleanup function
async function cleanupOrders() {
    console.log('=========================================');
    console.log('R2 Order Cleanup Script');
    console.log('=========================================');
    console.log(`Bucket: ${BUCKET_NAME}`);
    console.log(`Prefix: ${PREFIX}`);
    console.log(`Keeping order: ${KEEP_ORDER}`);
    console.log('');
    
    try {
        // List all orders
        console.log('📋 Listing all orders in R2...');
        const allObjects = await listObjects(PREFIX);
        console.log(`Found ${allObjects.length} total objects`);
        console.log('');
        
        // Filter out the order to keep
        const objectsToDelete = allObjects.filter(obj => !obj.key.includes(KEEP_ORDER));
        
        if (objectsToDelete.length === 0) {
            console.log(`✅ No orders to delete - only ${KEEP_ORDER} exists (or no orders found)`);
            return;
        }
        
        console.log(`⚠️  Found ${objectsToDelete.length} objects to delete`);
        console.log('');
        console.log('Objects that will be deleted:');
        objectsToDelete.slice(0, 20).forEach(obj => {
            console.log(`  - ${obj.key}`);
        });
        if (objectsToDelete.length > 20) {
            console.log(`  ... and ${objectsToDelete.length - 20} more`);
        }
        console.log('');
        
        // Ask for confirmation
        const confirmed = await askConfirmation(`⚠️  Are you sure you want to delete these ${objectsToDelete.length} objects? (yes/no): `);
        
        if (!confirmed) {
            console.log('❌ Deletion cancelled');
            return;
        }
        
        // Delete objects
        console.log('');
        console.log('🗑️  Deleting orders (this may take a while)...');
        let deleted = 0;
        let failed = 0;
        
        for (let i = 0; i < objectsToDelete.length; i++) {
            const obj = objectsToDelete[i];
            const success = await deleteObject(obj.key);
            
            if (success) {
                deleted++;
                if (deleted % 10 === 0) {
                    console.log(`  Progress: ${deleted}/${objectsToDelete.length} deleted...`);
                }
            } else {
                failed++;
                console.log(`  ⚠️  Failed to delete: ${obj.key}`);
            }
        }
        
        console.log('');
        console.log('=========================================');
        console.log('✅ Cleanup complete!');
        console.log(`  Deleted: ${deleted}`);
        if (failed > 0) {
            console.log(`  Failed: ${failed}`);
        }
        console.log('=========================================');
        console.log('');
        
        // List remaining orders
        console.log('📋 Remaining orders:');
        const remaining = await listObjects(PREFIX);
        if (remaining.length === 0) {
            console.log('  (none)');
        } else {
            remaining.forEach(obj => {
                console.log(`  - ${obj.key}`);
            });
        }
        
    } catch (error) {
        console.error(`❌ Error: ${error.message}`);
        process.exit(1);
    }
}

// Run the cleanup
cleanupOrders().catch(error => {
    console.error(`❌ Fatal error: ${error.message}`);
    process.exit(1);
});


